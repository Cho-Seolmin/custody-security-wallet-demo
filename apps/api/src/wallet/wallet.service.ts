import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateWalletDto } from "./dto/create-wallet.dto";
import { randomBytes } from "crypto";
import { JsonRpcProvider } from "ethers";
import { Wallet } from "ethers";

@Injectable()
export class WalletService {
  private readonly provider: JsonRpcProvider;
  private signer: Wallet;

  

  constructor(private prisma: PrismaService) {
    const rpc = process.env.SEPOLIA_RPC_URL;
    if (!rpc) throw new Error("SEPOLIA_RPC_URL is missing in .env");
    this.provider = new JsonRpcProvider(rpc);

    const pk = process.env.BACKEND_SIGNER_PRIVATE_KEY;
    if (!pk) {
      throw new Error("BACKEND_SIGNER_PRIVATE_KEY missing");
    }
    this.signer = new Wallet(pk, this.provider);
  
  }

  async create(userId: string, dto: CreateWalletDto) {
    const exists = await this.prisma.wallet.findFirst({
      where: { userId, walletType: dto.walletType },
    });
    if (exists) throw new BadRequestException("Wallet already exists for this type");

    // 데모용: 랜덤 주소 생성(실제 키는 저장하지 않음)
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
    const wallet = await this.prisma.wallet.findUnique({ where: { id: walletId } });
  
    if (!wallet) throw new NotFoundException("Wallet not found");
    if (wallet.userId !== userId) throw new ForbiddenException("Not your wallet");
  
    try {
      const balanceWei = await this.provider.getBalance(wallet.address);
  
      return {
        walletId: wallet.id,
        address: wallet.address,
        balanceWei: balanceWei.toString(),
      };
  
    } catch (error: any) {
      console.error("RPC getBalance error:", error);
  
      throw new BadRequestException(
        "Failed to fetch balance from RPC provider"
      );
    }
  }

  async updateLimits(userId: string, walletId: string, dto: { dailyLimit: string; singleTxLimit: string }) {
    const wallet = await this.prisma.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) throw new NotFoundException("Wallet not found");
    if (wallet.userId !== userId) throw new ForbiddenException("Not your wallet");
  
    return this.prisma.walletLimit.upsert({
      where: { walletId },
      update: { dailyLimit: dto.dailyLimit, singleTxLimit: dto.singleTxLimit },
      create: { walletId, dailyLimit: dto.dailyLimit, singleTxLimit: dto.singleTxLimit },
    });
  }
  
  async updateWhitelist(userId: string, walletId: string, dto: { addresses: string[] }) {
    const wallet = await this.prisma.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) throw new NotFoundException("Wallet not found");
    if (wallet.userId !== userId) throw new ForbiddenException("Not your wallet");
  
    await this.prisma.whitelist.deleteMany({ where: { walletId } });
  
    const data = dto.addresses.map((address) => ({ walletId, address }));
  
    await this.prisma.whitelist.createMany({ data, skipDuplicates: true });
  
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
  
    // 1) whitelist 체크(데모: whitelist가 1개라도 설정돼 있으면, 목록에 없으면 거절)
    if (wallet.whitelist.length > 0) {
      const allowed = wallet.whitelist.some(
        (w) => w.address.toLowerCase() === dto.toAddress.toLowerCase()
      );
      if (!allowed) throw new BadRequestException("ToAddress is not whitelisted");
    }
  
    // 2) limit 체크 (데모: singleTxLimit만 적용)
    if (wallet.limit?.singleTxLimit) {
      const singleTxLimitWei = BigInt(wallet.limit.singleTxLimit);
      if (amountWei > singleTxLimitWei) {
        throw new BadRequestException("Over singleTxLimit");
      }
    }
  
    // 3) walletType별 분기
    switch (wallet.walletType) {
      case "MULTISIG": {
        const req = await this.prisma.withdrawRequest.create({
          data: {
            walletId: wallet.id,
            amount: dto.amount,
            toAddress: dto.toAddress,
            status: "PENDING",
          },
          select: { id: true, status: true, amount: true, toAddress: true, createdAt: true },
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
        // mock 처리
        const req = await this.prisma.withdrawRequest.create({
          data: {
            walletId: wallet.id,
            amount: dto.amount,
            toAddress: dto.toAddress,
            status: "EXECUTED",
            txHash: `MOCK_TX_${Date.now()}`,
          },
          select: { id: true, status: true, txHash: true, amount: true, toAddress: true, createdAt: true },
        });
  
        return {
          mode: wallet.walletType,
          message: "Mock executed (demo).",
          withdrawRequest: req,
        };
      }
  
      case "BACKEND_SEC": {
        const signerAddress = await this.signer.getAddress();
        const signerBalance = await this.provider.getBalance(signerAddress);
      
        if (signerBalance < amountWei) {
          const failedRequest = await this.prisma.withdrawRequest.create({
            data: {
              walletId: wallet.id,
              amount: dto.amount,
              toAddress: dto.toAddress,
              status: "FAILED",
              txHash: null,
            },
            select: {
              id: true,
              status: true,
              amount: true,
              toAddress: true,
              createdAt: true,
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
          const tx = await this.signer.sendTransaction({
            to: dto.toAddress,
            value: amountWei,
          });
      
          const receipt = await tx.wait();
      
          const executedRequest = await this.prisma.withdrawRequest.create({
            data: {
              walletId: wallet.id,
              amount: dto.amount,
              toAddress: dto.toAddress,
              status: "EXECUTED",
              txHash: tx.hash,
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
            },
            select: {
              id: true,
              status: true,
              amount: true,
              toAddress: true,
              createdAt: true,
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
        // 컨트랙트 호출은 주소+ABI 필요. 오늘은 “스켈레톤”으로 PENDING만 기록.
        const req = await this.prisma.withdrawRequest.create({
          data: {
            walletId: wallet.id,
            amount: dto.amount,
            toAddress: dto.toAddress,
            status: "PENDING",
          },
          select: { id: true, status: true, amount: true, toAddress: true, createdAt: true },
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
    const address = await this.signer.getAddress();
    const balanceWei = await this.provider.getBalance(address);
  
    return {
      address,
      balanceWei: balanceWei.toString(),
    };
  }
  
  async getWithdrawHistory(
    userId: string,
    walletId: string,
    status?: "PENDING" | "EXECUTED" | "REJECTED" | "FAILED",
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
        createdAt: true,
      },
    });
  }

}