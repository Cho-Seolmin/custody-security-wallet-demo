import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateWalletDto } from "./dto/create-wallet.dto";
import { SignerService } from "./signer.service";
import { PolicyEngineService } from "./policy-engine.service";
import { WithdrawalAuditService } from "./withdrawal-audit.service";
import { QueueService } from "./queue.service";
import { isAddress, Wallet, Transaction   } from "ethers";
import { KmsService} from "./kms.service";
import { MpcService} from "./mpc.service";
import { SssUnlockStoreService } from "./sss-unlock-store.service";
import * as sss from "shamirs-secret-sharing";
import * as speakeasy from "speakeasy";

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
    private sssUnlockStore: SssUnlockStoreService,
  ) {}

  async create(userId: string, dto: CreateWalletDto) {
    const exists = await this.prisma.wallet.findFirst({
      where: { userId, walletType: dto.walletType },
    });
  
    if (exists) {
      throw new BadRequestException("Wallet already exists for this type");
    }
  
    let address: string;
  
    if (dto.walletType === "SSS") {
      const sssWallet = Wallet.createRandom();
      address = sssWallet.address;
    
      const secret = Buffer.from(sssWallet.privateKey.slice(2), "hex");
    
      const shares = sss.split(secret, { shares: 5, threshold: 3 });
    
      const shareStrings = shares.map((share) => share.toString("hex"));
    
      const created = await this.prisma.wallet.create({
        data: { userId, walletType: dto.walletType, address },
        select: { id: true, walletType: true, address: true, createdAt: true },
      });
    
      return {
        ...created,
        shares: shareStrings, 
      };
    }
  }

  async list(userId: string) {
    const wallets = await this.prisma.wallet.findMany({
      where: { userId },
      select: { id: true, walletType: true, address: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
  
    return Promise.all(
      wallets.map(async (wallet) => {
        if (wallet.walletType === "KMS") {
          const resolvedAddress = await this.kmsService.getAddress();
          return {
            ...wallet,
            resolvedAddress,
            addressSource: "KMS",
          };
        }
  
        if (wallet.walletType === "BACKEND_SEC" || wallet.walletType === "MULTISIG") {
          const resolvedAddress = await this.signerService.getSignerAddress();
          return {
            ...wallet,
            resolvedAddress,
            addressSource: "BACKEND_SIGNER",
          };
        }
        if (wallet.walletType === "MPC") {
          const resolvedAddress = await this.mpcService.getWalletAddress();
          return {
            ...wallet,
            resolvedAddress,
            addressSource: "DFNS_WALLET",
          };
        }
  
        return {
          ...wallet,
          resolvedAddress: wallet.address,
          addressSource: "WALLET_ROW",
        };
      }),
    );
  }

  async getBalance(userId: string, walletId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
    });
  
    if (!wallet) throw new NotFoundException("Wallet not found");
    if (wallet.userId !== userId) throw new ForbiddenException("Not your wallet");
  
    try {
      if (["BACKEND_SEC", "MULTISIG"].includes(wallet.walletType)) {
        const signerAddress = await this.signerService.getSignerAddress();
        const balanceWei = await this.signerService.getSignerBalance();
  
        return {
          walletId: wallet.id,
          address: signerAddress,
          balanceWei: balanceWei.toString(),
          source: "BACKEND_SIGNER",
        };
      }
  
      if (wallet.walletType === "KMS") {
        const kmsAddress = await this.kmsService.getAddress();
        const balanceWei = await this.kmsService.getBalance();
  
        return {
          walletId: wallet.id,
          address: kmsAddress,
          balanceWei: balanceWei.toString(),
          source: "KMS_ADDRESS",
        };
      }

      if (wallet.walletType === "MPC") {
        const mpcAddress = await this.mpcService.getWalletAddress();
        const balanceWei = await this.mpcService.getBalance();
      
        return {
          walletId: wallet.id,
          address: mpcAddress,
          balanceWei: balanceWei.toString(),
          source: "DFNS_WALLET",
        };
      }
  
      const balanceWei =
        await this.signerService.getProvider().getBalance(wallet.address);
  
      return {
        walletId: wallet.id,
        address: wallet.address,
        balanceWei: balanceWei.toString(),
        source: "WALLET_ADDRESS",
      };
    } catch (error: any) {
      console.error("RPC getBalance error:", error);
  
      throw new BadRequestException(
        "Failed to fetch balance from RPC provider",
      );
    }
  }

  async updateLimits(
    userId: string,
    walletId: string,
    dto: { dailyLimit: string; singleTxLimit: string }
  ) {
    const wallet = await this.prisma.wallet.findUnique({ where: { id: walletId } });

    if (!wallet) throw new NotFoundException("Wallet not found");
    if (wallet.userId !== userId) throw new ForbiddenException("Not your wallet");

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

  async updateWhitelist(userId: string, walletId: string, dto: { addresses: string[] }) {
    const wallet = await this.prisma.wallet.findUnique({ where: { id: walletId } });
  
    if (!wallet) throw new NotFoundException("Wallet not found");
    if (wallet.userId !== userId) throw new ForbiddenException("Not your wallet");
    if (wallet.walletType !== "BACKEND_SEC") {
      throw new BadRequestException("Whitelist is only supported for BACKEND_SEC wallets");
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
      throw new BadRequestException("Duplicate addresses are not allowed");
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
      orderBy: { address: "asc" },
    });
  }

  async withdraw(
    userId: string,
    walletId: string,
    dto: { toAddress: string; amount: string , otpCode?: string; signedTx?: string},
    idempotencyKey?: string,
  ) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
      include: { limit: true, whitelist: true },
    });

    if (!wallet) throw new NotFoundException("Wallet not found");
    if (wallet.userId !== userId) throw new ForbiddenException("Not your wallet");

    const amountWei = BigInt(dto.amount);

    const OTP_REQUIRED_AMOUNT_WEI = 10_000_000_000_000_000n; // 0.01 ETH

    if (amountWei >= OTP_REQUIRED_AMOUNT_WEI) {
      const otpSecret = process.env.DEV_TOTP_SECRET;

      if (!otpSecret) {
        throw new BadRequestException("DEV_TOTP_SECRET is missing");
      }

      if (!dto.otpCode) {
        throw new BadRequestException("OTP code is required for withdrawals of 0.01 ETH or more");
      }

      const verified = speakeasy.totp.verify({
        secret: otpSecret,
        encoding: "base32",
        token: dto.otpCode,
        window: 1,
      });

      if (!verified) {
        throw new BadRequestException("Invalid OTP code");
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
          message: "Duplicate withdraw request ignored. Existing request returned.",
          withdrawRequest: existing,
          duplicated: true,
        };
      }
    }

    switch (wallet.walletType) {
      case "MULTISIG": {
        const req = await this.prisma.withdrawRequest.create({
          data: {
            walletId: wallet.id,
            amount: dto.amount,
            toAddress: dto.toAddress,
            status: "PENDING",
            executionType: "MULTISIG",
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
      
        await this.withdrawalAuditService.append({
          withdrawRequestId: req.id,
          walletId: wallet.id,
          userId,
          eventType: "REQUEST_CREATED",
          actorType: "USER",
          actorId: userId,
          message: "MULTISIG withdraw request created",
          data: {
            walletType: wallet.walletType,
            amount: dto.amount,
            toAddress: dto.toAddress,
            status: "PENDING",
          },
        });
      
        return {
          mode: "MULTISIG",
          message: "Withdraw request created. Admin approval required.",
          withdrawRequest: req,
        };
      }

      case "KMS": {
        const queuedRequest = await this.prisma.withdrawRequest.create({
          data: {
            walletId: wallet.id,
            amount: dto.amount,
            toAddress: dto.toAddress,
            status: "QUEUED",
            executionType: "KMS",
            queuedAt: new Date(),
            idempotencyKey: normalizedIdempotencyKey,
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
          },
        });
      
        await this.withdrawalAuditService.append({
          withdrawRequestId: queuedRequest.id,
          walletId: wallet.id,
          userId,
          eventType: "REQUEST_CREATED",
          actorType: "USER",
          actorId: userId,
          message: "KMS withdraw request created",
          data: {
            walletType: wallet.walletType,
            amount: dto.amount,
            toAddress: dto.toAddress,
            status: "QUEUED",
          },
        });
      
        const queue = await this.queueService.enqueue(queuedRequest.id);
      
        await this.withdrawalAuditService.append({
          withdrawRequestId: queuedRequest.id,
          walletId: wallet.id,
          userId,
          eventType: "QUEUED",
          actorType: "SYSTEM",
          message: "Withdraw request enqueued for KMS execution",
          data: {
            queueId: queue.id,
            queueStatus: queue.status,
          },
        });
      
        return {
          mode: "KMS",
          message: "Withdraw request queued. Worker execution will process it.",
          withdrawRequest: queuedRequest,
          queue,
        };
      }

        case "BACKEND_SEC": {
          const queuedRequest = await this.prisma.withdrawRequest.create({
            data: {
              walletId: wallet.id,
              amount: dto.amount,
              toAddress: dto.toAddress,
              status: "QUEUED",
              executionType: "BACKEND_SEC",
              queuedAt: new Date(),
              idempotencyKey: normalizedIdempotencyKey,
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
            },
          });
        
          await this.withdrawalAuditService.append({
            withdrawRequestId: queuedRequest.id,
            walletId: wallet.id,
            userId,
            eventType: "REQUEST_CREATED",
            actorType: "USER",
            actorId: userId,
            message: "BACKEND_SEC withdraw request created",
            data: {
              walletType: wallet.walletType,
              amount: dto.amount,
              toAddress: dto.toAddress,
              status: "QUEUED",
            },
          });
        
          const queue = await this.queueService.enqueue(queuedRequest.id);
        
          await this.withdrawalAuditService.append({
            withdrawRequestId: queuedRequest.id,
            walletId: wallet.id,
            userId,
            eventType: "QUEUED",
            actorType: "SYSTEM",
            message: "Withdraw request enqueued for BACKEND_SEC execution",
            data: {
              queueId: queue.id,
              queueStatus: queue.status,
            },
          });
        
          return {
            mode: "BACKEND_SEC",
            message: "Withdraw request queued. Worker execution will process it.",
            withdrawRequest: queuedRequest,
            queue,
          };
        }

        case "POLICY_GUARD": {
          const queuedRequest = await this.prisma.withdrawRequest.create({
            data: {
              walletId: wallet.id,
              amount: dto.amount,
              toAddress: dto.toAddress,
              status: "QUEUED",
              executionType: "POLICY_GUARD",
              queuedAt: new Date(),
              idempotencyKey: normalizedIdempotencyKey,
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
            },
          });
        
          await this.withdrawalAuditService.append({
            withdrawRequestId: queuedRequest.id,
            walletId: wallet.id,
            userId,
            eventType: "REQUEST_CREATED",
            actorType: "USER",
            actorId: userId,
            message: "POLICY_GUARD withdraw request created",
            data: {
              walletType: wallet.walletType,
              amount: dto.amount,
              toAddress: dto.toAddress,
              status: "QUEUED",
            },
          });
        
          const queue = await this.queueService.enqueue(queuedRequest.id);
        
          await this.withdrawalAuditService.append({
            withdrawRequestId: queuedRequest.id,
            walletId: wallet.id,
            userId,
            eventType: "QUEUED",
            actorType: "SYSTEM",
            message: "Withdraw request enqueued for POLICY_GUARD execution",
            data: {
              queueId: queue.id,
              queueStatus: queue.status,
            },
          });
        
          return {
            mode: "POLICY_GUARD",
            message: "Withdraw request queued. Worker execution will process it.",
            withdrawRequest: queuedRequest,
            queue,
          };
        }

        case "MPC": {
          const queuedRequest = await this.prisma.withdrawRequest.create({
            data: {
              walletId: wallet.id,
              amount: dto.amount,
              toAddress: dto.toAddress,
              status: "QUEUED",
              executionType: "MPC",
              queuedAt: new Date(),
              idempotencyKey: normalizedIdempotencyKey,
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
            },
          });
        
          await this.withdrawalAuditService.append({
            withdrawRequestId: queuedRequest.id,
            walletId: wallet.id,
            userId,
            eventType: "REQUEST_CREATED",
            actorType: "USER",
            actorId: userId,
            message: "MPC withdraw request created",
            data: {
              walletType: wallet.walletType,
              amount: dto.amount,
              toAddress: dto.toAddress,
              status: "QUEUED",
            },
          });
        
          const queue = await this.queueService.enqueue(queuedRequest.id);
        
          await this.withdrawalAuditService.append({
            withdrawRequestId: queuedRequest.id,
            walletId: wallet.id,
            userId,
            eventType: "QUEUED",
            actorType: "SYSTEM",
            message: "Withdraw request enqueued for MPC execution",
            data: {
              queueId: queue.id,
              queueStatus: queue.status,
            },
          });
        
          return {
            mode: "MPC",
            message: "Withdraw request queued. Worker execution will process it.",
            withdrawRequest: queuedRequest,
            queue,
          };
        }

        case "SSS": {
          if (!dto.signedTx) {
            throw new BadRequestException("signedTx is required for SSS withdrawal");
          }
        
          let parsedTx: Transaction;
        
          try {
            parsedTx = Transaction.from(dto.signedTx);
          } catch {
            throw new BadRequestException("Invalid signedTx");
          }
        
          if (!parsedTx.from) {
            throw new BadRequestException("Invalid signedTx: missing signer");
          }
        
          if (parsedTx.from.toLowerCase() !== wallet.address.toLowerCase()) {
            throw new BadRequestException("signedTx signer does not match SSS wallet");
          }
        
          if (!parsedTx.to || parsedTx.to.toLowerCase() !== dto.toAddress.toLowerCase()) {
            throw new BadRequestException("signedTx recipient does not match request");
          }
        
          if (parsedTx.value.toString() !== dto.amount) {
            throw new BadRequestException("signedTx amount does not match request");
          }
        
          if (parsedTx.chainId !== 11155111n) {
            throw new BadRequestException("signedTx chainId must be Sepolia");
          }
        
          const provider = this.signerService.getProvider();
          const currentNonce = await provider.getTransactionCount(wallet.address, "pending");
        
          if (parsedTx.nonce !== currentNonce) {
            throw new BadRequestException(
              `Invalid signedTx nonce: expected=${currentNonce}, received=${parsedTx.nonce}`,
            );
          }
        
          const queuedRequest = await this.prisma.withdrawRequest.create({
            data: {
              walletId: wallet.id,
              amount: dto.amount,
              toAddress: dto.toAddress,
              status: "QUEUED",
              executionType: "SSS",
              queuedAt: new Date(),
              idempotencyKey: normalizedIdempotencyKey,
              metadata: {
                sssSignedTx: dto.signedTx,
                sssSigningMode: "CLIENT_SIDE_SIGNED_TX",
                sssValidatedAt: new Date().toISOString(),
                sssValidatedFields: [
                  "signer",
                  "toAddress",
                  "value",
                  "chainId",
                  "nonce",
                ],
              },
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
            },
          });
        
          await this.withdrawalAuditService.append({
            withdrawRequestId: queuedRequest.id,
            walletId: wallet.id,
            userId,
            eventType: "SSS_SIGNED_TX_VALIDATED",
            actorType: "USER",
            actorId: userId,
            message: "SSS signed transaction validated by backend policy",
            data: {
              walletType: wallet.walletType,
              signingMode: "CLIENT_SIDE_SIGNED_TX",
              signer: parsedTx.from,
              toAddress: parsedTx.to,
              value: parsedTx.value.toString(),
              chainId: parsedTx.chainId.toString(),
              nonce: parsedTx.nonce,
            },
          });
        
          const queue = await this.queueService.enqueue(queuedRequest.id);
        
          await this.withdrawalAuditService.append({
            withdrawRequestId: queuedRequest.id,
            walletId: wallet.id,
            userId,
            eventType: "QUEUED",
            actorType: "SYSTEM",
            message: "SSS signed transaction queued for broadcast",
            data: {
              queueId: queue.id,
              queueStatus: queue.status,
            },
          });
        
          return {
            mode: "SSS",
            message: "SSS signed transaction queued. Worker will broadcast it.",
            withdrawRequest: queuedRequest,
            queue,
          };
        }

      default:
        throw new BadRequestException("Unsupported wallet type");
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

    if (!wallet) throw new NotFoundException("Wallet not found");
    if (wallet.userId !== userId) throw new ForbiddenException("Not your wallet");
    if (wallet.walletType !== "BACKEND_SEC") {
      throw new BadRequestException("Whitelist is only supported for BACKEND_SEC wallets");
    }
  
    return this.prisma.whitelist.findMany({
      where: { walletId },
      select: { id: true, address: true },
      orderBy: { address: "asc" },
    });
  }
  async getWithdrawHistory(
    userId: string,
    walletId: string,
    status?: "PENDING" | "APPROVED" | "QUEUED" | "PROCESSING" | "EXECUTED" | "REJECTED" | "FAILED"  | "EXPIRED",
  ) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
    });
  
    if (!wallet) {
      throw new NotFoundException("Wallet not found");
    }
  
    if (wallet.userId !== userId) {
      throw new ForbiddenException("Not your wallet");
    }
  
    const rows = await this.prisma.withdrawRequest.findMany({
      where: {
        walletId,
        ...(status ? { status } : {}),
      },
      orderBy: {
        createdAt: "desc",
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
      const { _count, ...rest } = row;
  
      return {
        ...rest,
        approvalCount: _count.adminApprovals,
        requiredApprovalCount: row.executionType === "MULTISIG" ? 2 : null,
        externalProvider: metadata.externalProvider ?? null,
        externalRequestId: metadata.externalRequestId ?? null,
        externalStatus: metadata.externalStatus ?? null,
        externalTxHash: metadata.externalTxHash ?? null,
        metadata,
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

/*   async unlockSss(
    userId: string,
    walletId: string,
    dto: { privateKey: string; }
  ) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
      include: { securityState: true },
    });
  
    if (!wallet) throw new NotFoundException("Wallet not found");
    if (wallet.userId !== userId) throw new ForbiddenException("Not your wallet");
  
    if (wallet.walletType !== "SSS") {
      throw new BadRequestException("Not an SSS wallet");
    }
  
    // 🔐 private key → address 검증
    let derivedAddress: string;
  
    try {
      const walletObj = new Wallet(dto.privateKey);
      derivedAddress = await walletObj.getAddress();
    } catch {
      throw new BadRequestException("Invalid private key");
    }
  
    if (derivedAddress.toLowerCase() !== wallet.address.toLowerCase()) {
      throw new BadRequestException("Private key does not match wallet address");
    }
  
    // 상태 upsert
    await this.prisma.walletSecurityState.upsert({
      where: { walletId },
      update: {
        sssUnlockState: "UNLOCKED_ONCE",
        sssUnlockExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
      create: {
        walletId,
        sssUnlockState: "UNLOCKED_ONCE",
        sssUnlockExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });
  
    // 메모리에 key 저장
    this.sssUnlockStore.set(walletId, dto.privateKey);
  
    return {
      message: "SSS wallet unlocked (1 transaction allowed)",
    };
  } */

  async getSssStatus(userId: string, walletId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
      include: { securityState: true },
    });
  
    if (!wallet) throw new NotFoundException("Wallet not found");
    if (wallet.userId !== userId) throw new ForbiddenException("Not your wallet");
    if (wallet.walletType !== "SSS") {
      throw new BadRequestException("Not an SSS wallet");
    }
  
    const state = wallet.securityState;
  
    const unlockState = state?.sssUnlockState ?? "LOCKED";
    const unlockExpiresAt = state?.sssUnlockExpiresAt ?? null;
  
    const isUnlocked =
      unlockState === "UNLOCKED_ONCE" &&
      !!unlockExpiresAt &&
      unlockExpiresAt.getTime() > Date.now();
  
    return {
      walletId: wallet.id,
      walletType: wallet.walletType,
      unlockState: isUnlocked ? "UNLOCKED_ONCE" : "LOCKED",
      unlockExpiresAt: isUnlocked ? unlockExpiresAt : null,
    };
  }
}