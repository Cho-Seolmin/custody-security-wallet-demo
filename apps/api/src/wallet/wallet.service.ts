import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SignerService } from './signer.service';
import { PolicyEngineService } from './policy-engine.service';
import { WithdrawalAuditService } from './withdrawal-audit.service';
import { QueueService } from './queue.service';
import { isAddress, Transaction } from 'ethers';
import { KmsService } from './kms.service';
import { MpcService } from './mpc.service';
import { verifyUserTotp } from '../auth/totp.util';
import { sanitizeWithdrawMetadataForApi } from './withdraw-metadata.util';
import { Prisma } from '@prisma/client';
import { WalletProvisionService } from './wallet-provision.service';

@Injectable()
export class WalletService {
  constructor(
    private prisma: PrismaService,
    private signerService: SignerService,
    private policyEngineService: PolicyEngineService,
    private withdrawalAuditService: WithdrawalAuditService,
    private queueService: QueueService,
    private kmsService: KmsService,
    private mpcService: MpcService,
    private walletProvisionService: WalletProvisionService,
  ) {}

  private readonly queuedWithdrawSelect = {
    id: true,
    walletId: true,
    amount: true,
    toAddress: true,
    status: true,
    createdAt: true,
    approvedBy: true,
    txHash: true,
  } as const;

  createBackendSecWallet(userId: string) {
    return this.walletProvisionService.createBackendSecWallet(userId);
  }

  createMultisigWallet(userId: string) {
    return this.walletProvisionService.createMultisigWallet(userId);
  }

  createPolicyGuardWallet(userId: string) {
    return this.walletProvisionService.createPolicyGuardWallet(userId);
  }

  registerSssWallet(userId: string, address: string) {
    return this.walletProvisionService.registerSssWallet(userId, address);
  }

  private isIdempotencyConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private buildDuplicateWithdrawResponse(
    walletType: string,
    existing: {
      id: string;
      walletId: string;
      amount: string;
      toAddress: string;
      status: string;
      createdAt: Date;
      approvedBy: string | null;
      txHash: string | null;
    },
  ) {
    return {
      mode: walletType,
      message: 'Duplicate withdraw request ignored. Existing request returned.',
      withdrawRequest: existing,
      duplicated: true,
    };
  }

  private async createWithdrawRequestAndEnqueue(
    withdrawData: Prisma.WithdrawRequestUncheckedCreateInput,
    walletType: string,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const queuedRequest = await tx.withdrawRequest.create({
          data: withdrawData,
          select: this.queuedWithdrawSelect,
        });

        const queue = await tx.withdrawalQueue.create({
          data: {
            withdrawRequestId: queuedRequest.id,
            status: 'PENDING',
          },
          select: {
            id: true,
            withdrawRequestId: true,
            status: true,
            attemptCount: true,
            maxAttempts: true,
            availableAt: true,
            createdAt: true,
          },
        });

        return { queuedRequest, queue, duplicated: false as const };
      });
    } catch (error) {
      const idempotencyKey = withdrawData.idempotencyKey ?? undefined;

      if (this.isIdempotencyConflict(error) && idempotencyKey) {
        const existing = await this.prisma.withdrawRequest.findFirst({
          where: { idempotencyKey },
          select: this.queuedWithdrawSelect,
        });

        if (existing) {
          return {
            queuedRequest: existing,
            queue: null,
            duplicated: true as const,
          };
        }
      }

      throw error;
    }
  }

  private async createMultisigWithdrawRequest(
    walletId: string,
    dto: { amount: string; toAddress: string },
    normalizedIdempotencyKey?: string,
  ): Promise<
    | {
        id: string;
        status: string;
        amount: string;
        toAddress: string;
        expiresAt: Date | null;
        createdAt: Date;
      }
    | {
        duplicated: true;
        existing: {
          id: string;
          status: string;
          amount: string;
          toAddress: string;
          expiresAt: Date | null;
          createdAt: Date;
        };
      }
  > {
    try {
      return await this.prisma.withdrawRequest.create({
        data: {
          walletId,
          amount: dto.amount,
          toAddress: dto.toAddress,
          status: 'PENDING',
          executionType: 'MULTISIG',
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          idempotencyKey: normalizedIdempotencyKey,
        },
        select: {
          id: true,
          status: true,
          amount: true,
          toAddress: true,
          expiresAt: true,
          createdAt: true,
        },
      });
    } catch (error) {
      if (this.isIdempotencyConflict(error) && normalizedIdempotencyKey) {
        const existing = await this.prisma.withdrawRequest.findFirst({
          where: { idempotencyKey: normalizedIdempotencyKey },
          select: {
            id: true,
            status: true,
            amount: true,
            toAddress: true,
            expiresAt: true,
            createdAt: true,
          },
        });

        if (existing) {
          return { existing, duplicated: true as const };
        }
      }

      throw error;
    }
  }

  async list(userId: string) {
    const wallets = await this.prisma.wallet.findMany({
      where: { userId },
      select: {
        id: true,
        walletType: true,
        address: true,
        createdAt: true,
        encryptedPrivateKey: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return Promise.all(
      wallets.map(async (wallet) => {
        const { encryptedPrivateKey, ...safeWallet } = wallet;
        const isUserProvisioned = Boolean(encryptedPrivateKey);

        // Live address resolution hits an external signer/KMS/MPC provider.
        // If that provider is temporarily unreachable or misconfigured, we
        // still want the wallet list to render using the last known address
        // instead of taking down the whole endpoint for every wallet.
        if (wallet.walletType === 'KMS') {
          try {
            const resolvedAddress = await this.kmsService.getAddress();
            return { ...safeWallet, resolvedAddress, addressSource: 'KMS' };
          } catch {
            return {
              ...safeWallet,
              resolvedAddress: wallet.address,
              addressSource: 'KMS_UNAVAILABLE',
            };
          }
        }

        // User-provisioned BACKEND_SEC / MULTISIG use stored EOA (not shared signer).
        if (
          (wallet.walletType === 'BACKEND_SEC' ||
            wallet.walletType === 'MULTISIG') &&
          isUserProvisioned
        ) {
          return {
            ...safeWallet,
            resolvedAddress: wallet.address,
            addressSource: 'USER_PROVISIONED',
          };
        }

        if (
          wallet.walletType === 'BACKEND_SEC' ||
          wallet.walletType === 'MULTISIG'
        ) {
          try {
            const resolvedAddress = await this.signerService.getSignerAddress();
            return {
              ...safeWallet,
              resolvedAddress,
              addressSource: 'BACKEND_SIGNER',
            };
          } catch {
            return {
              ...safeWallet,
              resolvedAddress: wallet.address,
              addressSource: 'BACKEND_SIGNER_UNAVAILABLE',
            };
          }
        }
        if (wallet.walletType === 'MPC') {
          try {
            const resolvedAddress = await this.mpcService.getWalletAddress();
            return {
              ...safeWallet,
              resolvedAddress,
              addressSource: 'DFNS_WALLET',
            };
          } catch {
            return {
              ...safeWallet,
              resolvedAddress: wallet.address,
              addressSource: 'DFNS_WALLET_UNAVAILABLE',
            };
          }
        }

        return {
          ...safeWallet,
          resolvedAddress: wallet.address,
          addressSource: 'WALLET_ROW',
        };
      }),
    );
  }

  async getDashboardSummary(userId: string) {
    const wallets = await this.prisma.wallet.findMany({
      where: { userId },
      select: { id: true },
    });

    const walletIds = wallets.map((wallet) => wallet.id);
    const pendingStatuses = [
      'PENDING',
      'APPROVED',
      'QUEUED',
      'PROCESSING',
    ] as const;

    const [pendingWithdrawCount, completedWithdrawCount, balances] =
      await Promise.all([
        walletIds.length === 0
          ? 0
          : this.prisma.withdrawRequest.count({
              where: {
                walletId: { in: walletIds },
                status: { in: [...pendingStatuses] },
              },
            }),
        walletIds.length === 0
          ? 0
          : this.prisma.withdrawRequest.count({
              where: {
                walletId: { in: walletIds },
                status: 'EXECUTED',
              },
            }),
        Promise.all(
          wallets.map(async (wallet) => {
            try {
              const balance = await this.getBalance(userId, wallet.id);
              return BigInt(balance.balanceWei);
            } catch {
              return 0n;
            }
          }),
        ),
      ]);

    const totalBalanceWei = balances.reduce((sum, wei) => sum + wei, 0n);

    return {
      walletCount: wallets.length,
      totalBalanceWei: totalBalanceWei.toString(),
      pendingWithdrawCount,
      completedWithdrawCount,
    };
  }

  async getBalance(userId: string, walletId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
      select: {
        id: true,
        userId: true,
        walletType: true,
        address: true,
        encryptedPrivateKey: true,
      },
    });

    if (!wallet) throw new NotFoundException('Wallet not found');
    if (wallet.userId !== userId)
      throw new ForbiddenException('Not your wallet');

    try {
      // User-provisioned BACKEND_SEC / MULTISIG: display balance of stored EOA.
      // Withdrawal execution still uses the existing shared-signer path.
      if (
        (wallet.walletType === 'BACKEND_SEC' ||
          wallet.walletType === 'MULTISIG') &&
        Boolean(wallet.encryptedPrivateKey)
      ) {
        const balanceWei = await this.signerService
          .getProvider()
          .getBalance(wallet.address);

        return {
          walletId: wallet.id,
          address: wallet.address,
          balanceWei: balanceWei.toString(),
          source: 'USER_PROVISIONED',
        };
      }

      if (['BACKEND_SEC', 'MULTISIG'].includes(wallet.walletType)) {
        const signerAddress = await this.signerService.getSignerAddress();
        const balanceWei = await this.signerService.getSignerBalance();

        return {
          walletId: wallet.id,
          address: signerAddress,
          balanceWei: balanceWei.toString(),
          source: 'BACKEND_SIGNER',
        };
      }

      if (wallet.walletType === 'KMS') {
        const kmsAddress = await this.kmsService.getAddress();
        const balanceWei = await this.kmsService.getBalance();

        return {
          walletId: wallet.id,
          address: kmsAddress,
          balanceWei: balanceWei.toString(),
          source: 'KMS_ADDRESS',
        };
      }

      if (wallet.walletType === 'MPC') {
        const mpcAddress = await this.mpcService.getWalletAddress();
        const balanceWei = await this.mpcService.getBalance();

        return {
          walletId: wallet.id,
          address: mpcAddress,
          balanceWei: balanceWei.toString(),
          source: 'DFNS_WALLET',
        };
      }

      const balanceWei = await this.signerService
        .getProvider()
        .getBalance(wallet.address);

      return {
        walletId: wallet.id,
        address: wallet.address,
        balanceWei: balanceWei.toString(),
        source: 'WALLET_ADDRESS',
      };
    } catch (error: any) {
      console.error('RPC getBalance error:', error);

      throw new BadRequestException(
        'Failed to fetch balance from RPC provider',
      );
    }
  }

  async getLimits(userId: string, walletId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
    });

    if (!wallet) throw new NotFoundException('Wallet not found');
    if (wallet.userId !== userId)
      throw new ForbiddenException('Not your wallet');

    return this.prisma.walletLimit.findUnique({ where: { walletId } });
  }

  async updateLimits(
    userId: string,
    walletId: string,
    dto: { dailyLimit: string; singleTxLimit: string },
  ) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
    });

    if (!wallet) throw new NotFoundException('Wallet not found');
    if (wallet.userId !== userId)
      throw new ForbiddenException('Not your wallet');

    return this.prisma.walletLimit.upsert({
      where: { walletId },
      update: {
        dailyLimit: dto.dailyLimit,
        singleTxLimit: dto.singleTxLimit,
      },
      create: {
        walletId,
        dailyLimit: dto.dailyLimit,
        singleTxLimit: dto.singleTxLimit,
      },
    });
  }

  async updateWhitelist(
    userId: string,
    walletId: string,
    dto: { addresses: string[] },
  ) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
    });

    if (!wallet) throw new NotFoundException('Wallet not found');
    if (wallet.userId !== userId)
      throw new ForbiddenException('Not your wallet');
    if (wallet.walletType !== 'BACKEND_SEC') {
      throw new BadRequestException(
        'Whitelist is only supported for BACKEND_SEC wallets',
      );
    }

    const normalizedAddresses = dto.addresses
      .map((address) => address.trim().toLowerCase())
      .filter((address) => address.length > 0);

    // 주소 형식 검사
    for (const address of normalizedAddresses) {
      if (!isAddress(address)) {
        throw new BadRequestException(`Invalid address: ${address}`);
      }
    }

    // 중복 검사
    const uniqueAddresses = [...new Set(normalizedAddresses)];
    if (uniqueAddresses.length !== normalizedAddresses.length) {
      throw new BadRequestException('Duplicate addresses are not allowed');
    }

    await this.prisma.whitelist.deleteMany({ where: { walletId } });

    const data = uniqueAddresses.map((address) => ({ walletId, address }));

    await this.prisma.whitelist.createMany({
      data,
      skipDuplicates: true,
    });

    return this.prisma.whitelist.findMany({
      where: { walletId },
      select: { id: true, address: true },
      orderBy: { address: 'asc' },
    });
  }

  async withdraw(
    userId: string,
    walletId: string,
    dto: {
      toAddress: string;
      amount: string;
      otpCode?: string;
      signedTx?: string;
    },
    idempotencyKey?: string,
  ) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
      include: { limit: true, whitelist: true },
    });

    if (!wallet) throw new NotFoundException('Wallet not found');
    if (wallet.userId !== userId)
      throw new ForbiddenException('Not your wallet');

    const amountWei = BigInt(dto.amount);

    const OTP_REQUIRED_AMOUNT_WEI = 10_000_000_000_000_000n; // 0.01 ETH

    if (amountWei >= OTP_REQUIRED_AMOUNT_WEI) {
      if (!dto.otpCode) {
        throw new BadRequestException(
          'OTP code is required for withdrawals of 0.01 ETH or more',
        );
      }

      if (!verifyUserTotp(userId, dto.otpCode)) {
        throw new BadRequestException('Invalid OTP code');
      }
    }

    this.policyEngineService.validateWithdrawPolicy(wallet, dto);
    const normalizedIdempotencyKey = idempotencyKey?.trim();

    if (normalizedIdempotencyKey) {
      const existing = await this.prisma.withdrawRequest.findFirst({
        where: {
          idempotencyKey: normalizedIdempotencyKey,
          walletId: wallet.id,
        },
        select: {
          id: true,
          walletId: true,
          amount: true,
          toAddress: true,
          status: true,
          createdAt: true,
          approvedBy: true,
          txHash: true,
          expiresAt: true,
        },
      });

      if (existing) {
        return {
          mode: wallet.walletType,
          message:
            'Duplicate withdraw request ignored. Existing request returned.',
          withdrawRequest: existing,
          duplicated: true,
        };
      }
    }

    switch (wallet.walletType) {
      case 'MULTISIG': {
        const created = await this.createMultisigWithdrawRequest(
          wallet.id,
          dto,
          normalizedIdempotencyKey,
        );

        if ('duplicated' in created) {
          return this.buildDuplicateWithdrawResponse(wallet.walletType, {
            ...created.existing,
            walletId: wallet.id,
            approvedBy: null,
            txHash: null,
          });
        }

        const req = created;

        await this.withdrawalAuditService.append({
          withdrawRequestId: req.id,
          walletId: wallet.id,
          userId,
          eventType: 'REQUEST_CREATED',
          actorType: 'USER',
          actorId: userId,
          message: 'MULTISIG withdraw request created',
          data: {
            walletType: wallet.walletType,
            amount: dto.amount,
            toAddress: dto.toAddress,
            status: 'PENDING',
          },
        });

        return {
          mode: 'MULTISIG',
          message: 'Withdraw request created. Admin approval required.',
          withdrawRequest: req,
        };
      }

      case 'KMS': {
        const created = await this.createWithdrawRequestAndEnqueue(
          {
            walletId: wallet.id,
            amount: dto.amount,
            toAddress: dto.toAddress,
            status: 'QUEUED',
            executionType: 'KMS',
            queuedAt: new Date(),
            idempotencyKey: normalizedIdempotencyKey,
          },
          wallet.walletType,
        );

        if (created.duplicated) {
          return this.buildDuplicateWithdrawResponse(
            wallet.walletType,
            created.queuedRequest,
          );
        }

        const { queuedRequest, queue } = created;

        await this.withdrawalAuditService.append({
          withdrawRequestId: queuedRequest.id,
          walletId: wallet.id,
          userId,
          eventType: 'REQUEST_CREATED',
          actorType: 'USER',
          actorId: userId,
          message: 'KMS withdraw request created',
          data: {
            walletType: wallet.walletType,
            amount: dto.amount,
            toAddress: dto.toAddress,
            status: 'QUEUED',
          },
        });

        await this.withdrawalAuditService.append({
          withdrawRequestId: queuedRequest.id,
          walletId: wallet.id,
          userId,
          eventType: 'QUEUED',
          actorType: 'SYSTEM',
          message: 'Withdraw request enqueued for KMS execution',
          data: {
            queueId: queue.id,
            queueStatus: queue.status,
          },
        });

        return {
          mode: 'KMS',
          message: 'Withdraw request queued. Worker execution will process it.',
          withdrawRequest: queuedRequest,
          queue,
        };
      }

      case 'BACKEND_SEC': {
        const created = await this.createWithdrawRequestAndEnqueue(
          {
            walletId: wallet.id,
            amount: dto.amount,
            toAddress: dto.toAddress,
            status: 'QUEUED',
            executionType: 'BACKEND_SEC',
            queuedAt: new Date(),
            idempotencyKey: normalizedIdempotencyKey,
          },
          wallet.walletType,
        );

        if (created.duplicated) {
          return this.buildDuplicateWithdrawResponse(
            wallet.walletType,
            created.queuedRequest,
          );
        }

        const { queuedRequest, queue } = created;

        await this.withdrawalAuditService.append({
          withdrawRequestId: queuedRequest.id,
          walletId: wallet.id,
          userId,
          eventType: 'REQUEST_CREATED',
          actorType: 'USER',
          actorId: userId,
          message: 'BACKEND_SEC withdraw request created',
          data: {
            walletType: wallet.walletType,
            amount: dto.amount,
            toAddress: dto.toAddress,
            status: 'QUEUED',
          },
        });

        await this.withdrawalAuditService.append({
          withdrawRequestId: queuedRequest.id,
          walletId: wallet.id,
          userId,
          eventType: 'QUEUED',
          actorType: 'SYSTEM',
          message: 'Withdraw request enqueued for BACKEND_SEC execution',
          data: {
            queueId: queue.id,
            queueStatus: queue.status,
          },
        });

        return {
          mode: 'BACKEND_SEC',
          message: 'Withdraw request queued. Worker execution will process it.',
          withdrawRequest: queuedRequest,
          queue,
        };
      }

      case 'POLICY_GUARD': {
        const created = await this.createWithdrawRequestAndEnqueue(
          {
            walletId: wallet.id,
            amount: dto.amount,
            toAddress: dto.toAddress,
            status: 'QUEUED',
            executionType: 'POLICY_GUARD',
            queuedAt: new Date(),
            idempotencyKey: normalizedIdempotencyKey,
          },
          wallet.walletType,
        );

        if (created.duplicated) {
          return this.buildDuplicateWithdrawResponse(
            wallet.walletType,
            created.queuedRequest,
          );
        }

        const { queuedRequest, queue } = created;

        await this.withdrawalAuditService.append({
          withdrawRequestId: queuedRequest.id,
          walletId: wallet.id,
          userId,
          eventType: 'REQUEST_CREATED',
          actorType: 'USER',
          actorId: userId,
          message: 'POLICY_GUARD withdraw request created',
          data: {
            walletType: wallet.walletType,
            amount: dto.amount,
            toAddress: dto.toAddress,
            status: 'QUEUED',
          },
        });

        await this.withdrawalAuditService.append({
          withdrawRequestId: queuedRequest.id,
          walletId: wallet.id,
          userId,
          eventType: 'QUEUED',
          actorType: 'SYSTEM',
          message: 'Withdraw request enqueued for POLICY_GUARD execution',
          data: {
            queueId: queue.id,
            queueStatus: queue.status,
          },
        });

        return {
          mode: 'POLICY_GUARD',
          message: 'Withdraw request queued. Worker execution will process it.',
          withdrawRequest: queuedRequest,
          queue,
        };
      }

      case 'MPC': {
        const created = await this.createWithdrawRequestAndEnqueue(
          {
            walletId: wallet.id,
            amount: dto.amount,
            toAddress: dto.toAddress,
            status: 'QUEUED',
            executionType: 'MPC',
            queuedAt: new Date(),
            idempotencyKey: normalizedIdempotencyKey,
          },
          wallet.walletType,
        );

        if (created.duplicated) {
          return this.buildDuplicateWithdrawResponse(
            wallet.walletType,
            created.queuedRequest,
          );
        }

        const { queuedRequest, queue } = created;

        await this.withdrawalAuditService.append({
          withdrawRequestId: queuedRequest.id,
          walletId: wallet.id,
          userId,
          eventType: 'REQUEST_CREATED',
          actorType: 'USER',
          actorId: userId,
          message: 'MPC withdraw request created',
          data: {
            walletType: wallet.walletType,
            amount: dto.amount,
            toAddress: dto.toAddress,
            status: 'QUEUED',
          },
        });

        await this.withdrawalAuditService.append({
          withdrawRequestId: queuedRequest.id,
          walletId: wallet.id,
          userId,
          eventType: 'QUEUED',
          actorType: 'SYSTEM',
          message: 'Withdraw request enqueued for MPC execution',
          data: {
            queueId: queue.id,
            queueStatus: queue.status,
          },
        });

        return {
          mode: 'MPC',
          message: 'Withdraw request queued. Worker execution will process it.',
          withdrawRequest: queuedRequest,
          queue,
        };
      }

      case 'SSS': {
        if (!dto.signedTx) {
          throw new BadRequestException(
            'signedTx is required for SSS withdrawal',
          );
        }

        let parsedTx: Transaction;

        try {
          parsedTx = Transaction.from(dto.signedTx);
        } catch {
          throw new BadRequestException('Invalid signedTx');
        }

        if (!parsedTx.from) {
          throw new BadRequestException('Invalid signedTx: missing signer');
        }

        if (parsedTx.from.toLowerCase() !== wallet.address.toLowerCase()) {
          throw new BadRequestException(
            'signedTx signer does not match SSS wallet',
          );
        }

        if (
          !parsedTx.to ||
          parsedTx.to.toLowerCase() !== dto.toAddress.toLowerCase()
        ) {
          throw new BadRequestException(
            'signedTx recipient does not match request',
          );
        }

        if (parsedTx.value.toString() !== dto.amount) {
          throw new BadRequestException(
            'signedTx amount does not match request',
          );
        }

        if (parsedTx.chainId !== 11155111n) {
          throw new BadRequestException('signedTx chainId must be Sepolia');
        }

        const provider = this.signerService.getProvider();
        const currentNonce = await provider.getTransactionCount(
          wallet.address,
          'pending',
        );

        if (parsedTx.nonce !== currentNonce) {
          throw new BadRequestException(
            `Invalid signedTx nonce: expected=${currentNonce}, received=${parsedTx.nonce}`,
          );
        }

        const created = await this.createWithdrawRequestAndEnqueue(
          {
            walletId: wallet.id,
            amount: dto.amount,
            toAddress: dto.toAddress,
            status: 'QUEUED',
            executionType: 'SSS',
            queuedAt: new Date(),
            idempotencyKey: normalizedIdempotencyKey,
            metadata: {
              sssSignedTx: dto.signedTx,
              sssSigningMode: 'CLIENT_SIDE_SIGNED_TX',
              sssValidatedAt: new Date().toISOString(),
              sssValidatedFields: [
                'signer',
                'toAddress',
                'value',
                'chainId',
                'nonce',
              ],
            },
          },
          wallet.walletType,
        );

        if (created.duplicated) {
          return this.buildDuplicateWithdrawResponse(
            wallet.walletType,
            created.queuedRequest,
          );
        }

        const { queuedRequest, queue } = created;

        await this.withdrawalAuditService.append({
          withdrawRequestId: queuedRequest.id,
          walletId: wallet.id,
          userId,
          eventType: 'SSS_SIGNED_TX_VALIDATED',
          actorType: 'USER',
          actorId: userId,
          message: 'SSS signed transaction validated by backend policy',
          data: {
            walletType: wallet.walletType,
            signingMode: 'CLIENT_SIDE_SIGNED_TX',
            signer: parsedTx.from,
            toAddress: parsedTx.to,
            value: parsedTx.value.toString(),
            chainId: parsedTx.chainId.toString(),
            nonce: parsedTx.nonce,
          },
        });

        await this.withdrawalAuditService.append({
          withdrawRequestId: queuedRequest.id,
          walletId: wallet.id,
          userId,
          eventType: 'QUEUED',
          actorType: 'SYSTEM',
          message: 'SSS signed transaction queued for broadcast',
          data: {
            queueId: queue.id,
            queueStatus: queue.status,
          },
        });

        return {
          mode: 'SSS',
          message: 'SSS signed transaction queued. Worker will broadcast it.',
          withdrawRequest: queuedRequest,
          queue,
        };
      }

      default:
        throw new BadRequestException('Unsupported wallet type');
    }
  }

  async getSignerInfo() {
    const address = await this.signerService.getSignerAddress();
    const balanceWei = await this.signerService.getSignerBalance();

    return {
      address,
      balanceWei: balanceWei.toString(),
    };
  }

  async getWhitelist(userId: string, walletId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
    });

    if (!wallet) throw new NotFoundException('Wallet not found');
    if (wallet.userId !== userId)
      throw new ForbiddenException('Not your wallet');
    if (wallet.walletType !== 'BACKEND_SEC') {
      throw new BadRequestException(
        'Whitelist is only supported for BACKEND_SEC wallets',
      );
    }

    return this.prisma.whitelist.findMany({
      where: { walletId },
      select: { id: true, address: true },
      orderBy: { address: 'asc' },
    });
  }
  async getWithdrawHistory(
    userId: string,
    walletId: string,
    status?:
      | 'PENDING'
      | 'APPROVED'
      | 'QUEUED'
      | 'PROCESSING'
      | 'EXECUTED'
      | 'REJECTED'
      | 'FAILED'
      | 'EXPIRED',
  ) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    if (wallet.userId !== userId) {
      throw new ForbiddenException('Not your wallet');
    }

    const rows = await this.prisma.withdrawRequest.findMany({
      where: {
        walletId,
        ...(status ? { status } : {}),
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        amount: true,
        toAddress: true,
        status: true,
        approvedBy: true,
        txHash: true,
        executionType: true,
        retryCount: true,
        failureReason: true,
        queuedAt: true,
        processingAt: true,
        broadcastedAt: true,
        confirmedAt: true,
        finalizedAt: true,
        expiresAt: true,
        createdAt: true,
        metadata: true,

        _count: {
          select: {
            adminApprovals: true,
          },
        },
      },
    });

    return rows.map((row) => {
      const metadata = (row.metadata as Record<string, any> | null) ?? {};
      const safeMetadata = sanitizeWithdrawMetadataForApi(metadata) ?? {};
      const { _count, metadata: _rawMetadata, ...rest } = row;

      return {
        ...rest,
        approvalCount: _count.adminApprovals,
        requiredApprovalCount: row.executionType === 'MULTISIG' ? 2 : null,
        externalProvider: metadata.externalProvider ?? null,
        externalRequestId: metadata.externalRequestId ?? null,
        externalStatus: metadata.externalStatus ?? null,
        externalTxHash: metadata.externalTxHash ?? null,
        metadata: safeMetadata,
      };
    });
  }

  async getKmsInfo() {
    const address = await this.kmsService.getAddress();
    const balanceWei = await this.kmsService.getBalance();

    return {
      address,
      balanceWei: balanceWei.toString(),
    };
  }
}
