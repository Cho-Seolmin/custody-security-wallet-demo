import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { Wallet } from "ethers";
import { PrismaService } from "../../prisma/prisma.service";
import { WithdrawalAuditService } from "../withdrawal-audit.service";
import { SssUnlockStoreService } from "../sss-unlock-store.service";
import { SignerService } from "../signer.service";
import { ExecutorResult } from "./executor.types";

@Injectable()
export class SssExecutor {
  private readonly logger = new Logger(SssExecutor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly withdrawalAuditService: WithdrawalAuditService,
    private readonly sssUnlockStore: SssUnlockStoreService,
    private readonly signerService: SignerService,
  ) {}

  async execute(params: {
    walletId: string;
    withdrawRequestId: string;
    toAddress: string;
    amountWei: bigint;
  }): Promise<ExecutorResult> {
    const securityState = await this.prisma.walletSecurityState.findUnique({
      where: { walletId: params.walletId },
    });

    if (
      !securityState ||
      securityState.sssUnlockState !== "UNLOCKED_ONCE" ||
      (securityState.sssUnlockExpiresAt &&
        securityState.sssUnlockExpiresAt.getTime() < Date.now())
    ) {
      throw new BadRequestException("SSS wallet is locked or unlock expired");
    }

    const privateKey = this.sssUnlockStore.get(params.walletId);
    if (!privateKey) {
      throw new BadRequestException("SSS private key not found in memory");
    }

    const provider = this.signerService.getProvider();
    const signer = new Wallet(privateKey, provider);

    const signerAddress = await signer.getAddress();
    const signerBalance = await provider.getBalance(signerAddress);

    if (signerBalance < params.amountWei) {
      await this.relock(params.walletId, params.withdrawRequestId);
      throw new BadRequestException(
        `Insufficient SSS wallet balance: address=${signerAddress}, balance=${signerBalance.toString()}, requested=${params.amountWei.toString()}`
      );
    }

    try {
      const tx = await signer.sendTransaction({
        to: params.toAddress,
        value: params.amountWei,
      });

      const receipt = await tx.wait();

      await this.withdrawalAuditService.append({
        withdrawRequestId: params.withdrawRequestId,
        walletId: params.walletId,
        eventType: "SSS_WITHDRAW_EXECUTED",
        actorType: "SIGNER",
        message: "SSS transaction executed",
        data: {
          txHash: tx.hash,
          blockNumber: receipt?.blockNumber ?? null,
          signerType: "SSS_MEMORY_SIGNER",
        },
      });

      await this.relock(params.walletId, params.withdrawRequestId);

      this.logger.log(
        `SSS executed: walletId=${params.walletId}, txHash=${tx.hash}, block=${receipt?.blockNumber ?? "unknown"}`
      );

      return {
        type: "ONCHAIN_TX",
        txHash: tx.hash,
        blockNumber: receipt?.blockNumber ?? null,
        receipt,
      };
    } catch (error) {
      await this.relock(params.walletId, params.withdrawRequestId);
      throw error;
    }
  }

  private async relock(walletId: string, withdrawRequestId: string) {
    await this.prisma.walletSecurityState.upsert({
      where: { walletId },
      update: {
        sssUnlockState: "LOCKED",
        sssUnlockExpiresAt: null,
      },
      create: {
        walletId,
        sssUnlockState: "LOCKED",
        sssUnlockExpiresAt: null,
      },
    });

    this.sssUnlockStore.clear(walletId);

    await this.withdrawalAuditService.append({
      withdrawRequestId,
      walletId,
      eventType: "SSS_RELOCKED",
      actorType: "SYSTEM",
      message: "SSS wallet relocked and memory key cleared",
    });
  }
}