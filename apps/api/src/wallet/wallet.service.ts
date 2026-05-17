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
import { isAddress, Wallet  } from "ethers";
import { KmsService} from "./kms.service";
import { MpcService} from "./mpc.service";
import { SssUnlockStoreService } from "./sss-unlock-store.service";
import * as sss from "shamirs-secret-sharing";

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
    dto: { toAddress: string; amount: string }
  ) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
      include: { limit: true, whitelist: true },
    });

    if (!wallet) throw new NotFoundException("Wallet not found");
    if (wallet.userId !== userId) throw new ForbiddenException("Not your wallet");

    const amountWei = BigInt(dto.amount);

    // 정책 검사 분리
    this.policyEngineService.validateWithdrawPolicy(wallet, dto);

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
          const securityState = await this.prisma.walletSecurityState.findUnique({
            where: { walletId: wallet.id },
          });
        
          if (
            !securityState ||
            securityState.sssUnlockState !== "UNLOCKED_ONCE" ||
            (securityState.sssUnlockExpiresAt &&
              securityState.sssUnlockExpiresAt.getTime() < Date.now())
          ) {
            throw new BadRequestException("SSS wallet is locked. Unlock required.");
          }
        
          const queuedRequest = await this.prisma.withdrawRequest.create({
            data: {
              walletId: wallet.id,
              amount: dto.amount,
              toAddress: dto.toAddress,
              status: "QUEUED",
              executionType: "SSS",
              queuedAt: new Date(),
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
            message: "SSS withdraw request created",
            data: {
              walletType: wallet.walletType,
              amount: dto.amount,
              toAddress: dto.toAddress,
              status: "QUEUED",
            },
          });
        
          await this.withdrawalAuditService.append({
            withdrawRequestId: queuedRequest.id,
            walletId: wallet.id,
            userId,
            eventType: "SSS_UNLOCKED_ONCE",
            actorType: "USER",
            actorId: userId,
            message: "SSS wallet already unlocked and ready for one-time withdrawal",
            data: {
              walletType: wallet.walletType,
              sssUnlockState: securityState.sssUnlockState,
              sssUnlockExpiresAt: securityState.sssUnlockExpiresAt,
            },
          });
        
          const queue = await this.queueService.enqueue(queuedRequest.id);
        
          await this.withdrawalAuditService.append({
            withdrawRequestId: queuedRequest.id,
            walletId: wallet.id,
            userId,
            eventType: "QUEUED",
            actorType: "SYSTEM",
            message: "Withdraw request enqueued for SSS execution",
            data: {
              queueId: queue.id,
              queueStatus: queue.status,
            },
          });
        
          return {
            mode: "SSS",
            message: "Withdraw request queued. Worker execution will process it.",
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
      },
    });
  
    return rows.map((row) => {
      const metadata = (row.metadata as Record<string, any> | null) ?? {};
  
      return {
        ...row,
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

  async unlockSss(
    userId: string,
    walletId: string,
    dto: { privateKey: string }
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
  }

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