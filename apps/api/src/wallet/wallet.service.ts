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

@Injectable()
export class WalletService {
  constructor(
    private prisma: PrismaService,
    private signerService: SignerService,
    private policyEngineService: PolicyEngineService,
    private withdrawalAuditService: WithdrawalAuditService,
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
      const balanceWei = await this.signerService.getProvider().getBalance(wallet.address);

      return {
        walletId: wallet.id,
        address: wallet.address,
        balanceWei: balanceWei.toString(),
      };
    } catch (error: any) {
      console.error("RPC getBalance error:", error);

      throw new BadRequestException("Failed to fetch balance from RPC provider");
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

    await this.prisma.whitelist.deleteMany({ where: { walletId } });

    const data = dto.addresses.map((address) => ({ walletId, address }));

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
        const signerAddress = await this.signerService.getSignerAddress();
        const signerBalance = await this.signerService.getSignerBalance();

        if (signerBalance < amountWei) {
          const failedRequest = await this.prisma.withdrawRequest.create({
            data: {
              walletId: wallet.id,
              amount: dto.amount,
              toAddress: dto.toAddress,
              status: "FAILED",
              txHash: null,
              executionType: "BACKEND_SEC",
              failureReason: "Insufficient signer balance",
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
            withdrawRequestId: failedRequest.id,
            walletId: wallet.id,
            userId,
            eventType: "TX_FAILED",
            actorType: "SYSTEM",
            message: "Insufficient signer balance",
            data: {
              signerAddress,
              signerBalanceWei: signerBalance.toString(),
              requestedAmountWei: dto.amount,
            },
          });
        
          throw new BadRequestException({
            message: "Insufficient signer balance",
            signerAddress,
            signerBalanceWei: signerBalance.toString(),
            requestedAmountWei: dto.amount,
            withdrawRequest: failedRequest,
          });
        }

        try {
          const tx = await this.signerService.sendNativeTransaction(
            dto.toAddress,
            amountWei,
          );

          const receipt = await tx.wait();
          const executedRequest = await this.prisma.withdrawRequest.create({
            data: {
              walletId: wallet.id,
              amount: dto.amount,
              toAddress: dto.toAddress,
              status: "EXECUTED",
              txHash: tx.hash,
              executionType: "BACKEND_SEC",
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
            withdrawRequestId: executedRequest.id,
            walletId: wallet.id,
            userId,
            eventType: "TX_CONFIRMED",
            actorType: "SIGNER",
            message: "BACKEND_SEC transaction executed on Sepolia",
            data: {
              txHash: tx.hash,
              blockNumber: receipt?.blockNumber ?? null,
              amount: dto.amount,
              toAddress: dto.toAddress,
            },
          });
          
          return {
            mode: "BACKEND_SEC",
            message: "Transaction executed on Sepolia",
            txHash: tx.hash,
            blockNumber: receipt?.blockNumber ?? null,
            withdrawRequest: executedRequest,
          };

        } catch (error: any) {
          const failedRequest = await this.prisma.withdrawRequest.create({
            data: {
              walletId: wallet.id,
              amount: dto.amount,
              toAddress: dto.toAddress,
              status: "FAILED",
              txHash: null,
              executionType: "BACKEND_SEC",
              failureReason: error?.shortMessage || error?.message || "Unknown error",
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
            withdrawRequestId: failedRequest.id,
            walletId: wallet.id,
            userId,
            eventType: "TX_FAILED",
            actorType: "SIGNER",
            message: "BACKEND_SEC transaction failed",
            data: {
              error: error?.shortMessage || error?.message || "Unknown error",
              amount: dto.amount,
              toAddress: dto.toAddress,
            },
          });
          
          console.error("BACKEND_SEC tx failed:", error);
          
          throw new BadRequestException({
            message: "Transaction failed",
            error: error?.shortMessage || error?.message || "Unknown error",
            withdrawRequest: failedRequest,
          });
        }
      }

      case "POLICY_GUARD": {
        const req = await this.prisma.withdrawRequest.create({
          data: {
            walletId: wallet.id,
            amount: dto.amount,
            toAddress: dto.toAddress,
            status: "PENDING",
            executionType: "POLICY_GUARD",
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
          message: "POLICY_GUARD withdraw request created",
          data: {
            walletType: wallet.walletType,
            amount: dto.amount,
            toAddress: dto.toAddress,
            status: "PENDING",
          },
        });
      
        return {
          mode: "POLICY_GUARD",
          message: "Pending. Contract withdraw integration will be added with ABI/address.",
          withdrawRequest: req,
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
        failureReason: true,
        createdAt: true,
      },
    });
  }
}