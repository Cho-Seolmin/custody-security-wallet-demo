import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateWalletDto } from "./dto/create-wallet.dto";
import { randomBytes } from "crypto";
import { SignerService } from "./signer.service";
import { PolicyEngineService } from "./policy-engine.service";
import { WithdrawalAuditService } from "./withdrawal-audit.service";
import { QueueService } from "./queue.service";
import { isAddress } from "ethers";

@Injectable()
export class WalletService {
  constructor(
    private prisma: PrismaService,
    private signerService: SignerService,
    private policyEngineService: PolicyEngineService,
    private withdrawalAuditService: WithdrawalAuditService,
    private queueService: QueueService,
  ) {}

  async create(userId: string, dto: CreateWalletDto) {
    const exists = await this.prisma.wallet.findFirst({
      where: { userId, walletType: dto.walletType },
    });

    if (exists) {
      throw new BadRequestException("Wallet already exists for this type");
    }

    const address = "0x" + randomBytes(20).toString("hex");

    return this.prisma.wallet.create({
      data: { userId, walletType: dto.walletType, address },
      select: { id: true, walletType: true, address: true, createdAt: true },
    });
  }

  async list(userId: string) {
    return this.prisma.wallet.findMany({
      where: { userId },
      select: { id: true, walletType: true, address: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
  }

  async getBalance(userId: string, walletId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
    });
  
    if (!wallet) throw new NotFoundException("Wallet not found");
    if (wallet.userId !== userId) throw new ForbiddenException("Not your wallet");
  
    try {
  
      // BACKEND_SEC는 signer 잔액 표시
      if (wallet.walletType === "BACKEND_SEC") {
        const signerAddress = await this.signerService.getSignerAddress();
        const balanceWei = await this.signerService.getSignerBalance();
  
        return {
          walletId: wallet.id,
          address: signerAddress,
          balanceWei: balanceWei.toString(),
          source: "BACKEND_SIGNER",
        };
      }
  
      // 다른 walletType은 기존 방식
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
          },
          select: {
            id: true,
            status: true,
            amount: true,
            toAddress: true,
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

      case "KMS":
        case "SSS":
        case "MPC": {
          const req = await this.prisma.withdrawRequest.create({
            data: {
              walletId: wallet.id,
              amount: dto.amount,
              toAddress: dto.toAddress,
              status: "EXECUTED",
              txHash: `MOCK_TX_${Date.now()}`,
              executionType: wallet.walletType,
            },
            select: {
              id: true,
              status: true,
              txHash: true,
              amount: true,
              toAddress: true,
              createdAt: true,
            },
          });
        
          await this.withdrawalAuditService.append({
            withdrawRequestId: req.id,
            walletId: wallet.id,
            userId,
            eventType: "MOCK_EXECUTED",
            actorType: "SYSTEM",
            message: `${wallet.walletType} mock executed`,
            data: {
              walletType: wallet.walletType,
              amount: dto.amount,
              toAddress: dto.toAddress,
              txHash: req.txHash,
            },
          });
        
          return {
            mode: wallet.walletType,
            message: "Mock executed (demo).",
            withdrawRequest: req,
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
    status?: "PENDING" | "APPROVED" | "QUEUED" | "PROCESSING" | "EXECUTED" | "REJECTED" | "FAILED",
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

    return this.prisma.withdrawRequest.findMany({
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
        confirmedAt: true,
        createdAt: true,
      },
    });
  }
}