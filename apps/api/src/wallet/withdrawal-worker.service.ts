import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { QueueService } from "./queue.service";
import { WithdrawalAuditService } from "./withdrawal-audit.service";
import { ExecutionRouterService } from "./execution-router.service";

@Injectable()
export class WithdrawalWorkerService implements OnModuleInit {
  private readonly logger = new Logger(WithdrawalWorkerService.name);
  private isProcessing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    private readonly withdrawalAuditService: WithdrawalAuditService,
    private readonly executionRouterService: ExecutionRouterService,
  ) {}

  onModuleInit() {
    setInterval(() => {
      this.poll().catch((error) => {
        this.logger.error("Worker poll failed", error);
      });
    }, 5000);
  }

  private async poll() {
    if (this.isProcessing) return;

    this.isProcessing = true;

    try {
      const workerId = `worker-${process.pid}`;
      const job = await this.queueService.reserveNext(workerId);

      if (!job) {
        return;
      }

      await this.queueService.markRunning(job.id);

      const withdrawRequest = await this.prisma.withdrawRequest.findUnique({
        where: { id: job.withdrawRequestId },
        include: {
          wallet: true,
        },
      });

      if (!withdrawRequest) {
        await this.queueService.markDead(job.id, {
          errorCode: "REQUEST_NOT_FOUND",
          errorMessage: "WithdrawRequest not found",
        });
        return;
      }

      if (
        withdrawRequest.wallet.walletType !== "BACKEND_SEC" &&
        withdrawRequest.wallet.walletType !== "MULTISIG" &&
        withdrawRequest.wallet.walletType !== "POLICY_GUARD" &&
        withdrawRequest.wallet.walletType !== "KMS" &&
        withdrawRequest.wallet.walletType !== "MPC"
      ) {
        await this.queueService.markDead(job.id, {
          errorCode: "UNSUPPORTED_WALLET_TYPE",
          errorMessage: `Unsupported walletType: ${withdrawRequest.wallet.walletType}`,
        });

        await this.prisma.withdrawRequest.update({
          where: { id: withdrawRequest.id },
          data: {
            status: "FAILED",
            failureReason: `Unsupported walletType: ${withdrawRequest.wallet.walletType}`,
            finalizedAt: new Date(),
          },
        });

        await this.withdrawalAuditService.append({
          withdrawRequestId: withdrawRequest.id,
          walletId: withdrawRequest.walletId,
          userId: withdrawRequest.wallet.userId,
          eventType: "TX_FAILED",
          actorType: "WORKER",
          message: "Unsupported wallet type for current worker",
          data: {
            walletType: withdrawRequest.wallet.walletType,
          },
        });

        return;
      }

      await this.prisma.withdrawRequest.update({
        where: { id: withdrawRequest.id },
        data: {
          status: "PROCESSING",
          processingAt: new Date(),
        },
      });

      await this.withdrawalAuditService.append({
        withdrawRequestId: withdrawRequest.id,
        walletId: withdrawRequest.walletId,
        userId: withdrawRequest.wallet.userId,
        eventType: "EXECUTION_STARTED",
        actorType: "WORKER",
        message: "Worker started execution",
        data: {
          queueId: job.id,
          walletType: withdrawRequest.wallet.walletType,
          amount: withdrawRequest.amount,
          toAddress: withdrawRequest.toAddress,
        },
      });

      try {
        const amountWei = BigInt(withdrawRequest.amount);

        const result = await this.executionRouterService.execute({
          walletType: withdrawRequest.wallet.walletType,
          toAddress: withdrawRequest.toAddress,
          amountWei,
        });

        if (result.type === "ONCHAIN_TX") {
          await this.prisma.withdrawRequest.update({
            where: { id: withdrawRequest.id },
            data: {
              txHash: result.txHash,
              status: "EXECUTED",
              broadcastedAt: new Date(),
              confirmedAt: new Date(),
              finalizedAt: new Date(),
              failureReason: null,
            },
          });

          await this.queueService.markSucceeded(job.id);

          await this.withdrawalAuditService.append({
            withdrawRequestId: withdrawRequest.id,
            walletId: withdrawRequest.walletId,
            userId: withdrawRequest.wallet.userId,
            eventType: "TX_CONFIRMED",
            actorType: "SIGNER",
            message: "Transaction executed via ExecutionRouter",
            data: {
              txHash: result.txHash,
              blockNumber: result.blockNumber ?? null,
              walletType: withdrawRequest.wallet.walletType,
            },
          });

          this.logger.log(
            `Withdraw executed: requestId=${withdrawRequest.id}, txHash=${result.txHash}`,
          );
        } else if (result.type === "EXTERNAL_PENDING") {
          await this.prisma.withdrawRequest.update({
            where: { id: withdrawRequest.id },
            data: {
              status: "PROCESSING",
              failureReason: null,
              metadata: {
                ...(withdrawRequest.metadata as Record<string, any> | null),
                externalRequestId: result.externalRequestId,
                externalProvider: result.provider,
              },
            },
          });

          await this.queueService.markSucceeded(job.id);

          await this.withdrawalAuditService.append({
            withdrawRequestId: withdrawRequest.id,
            walletId: withdrawRequest.walletId,
            userId: withdrawRequest.wallet.userId,
            eventType: "EXECUTION_STARTED",
            actorType: "SYSTEM",
            message: "External execution submitted and awaiting confirmation",
            data: {
              externalRequestId: result.externalRequestId,
              provider: result.provider,
              walletType: withdrawRequest.wallet.walletType,
            },
          });

          this.logger.log(
            `External execution pending: requestId=${withdrawRequest.id}, externalRequestId=${result.externalRequestId}, provider=${result.provider}`,
          );
        } else {
          throw new Error("Unknown execution result type");
        }
      } catch (error: any) {
        const nextRetryCount = (withdrawRequest.retryCount ?? 0) + 1;
        const errorMessage = error?.message || "Execution failed";

        if (nextRetryCount >= 3) {
          await this.prisma.withdrawRequest.update({
            where: { id: withdrawRequest.id },
            data: {
              status: "FAILED",
              retryCount: nextRetryCount,
              failureReason: errorMessage,
              finalizedAt: new Date(),
            },
          });

          await this.queueService.markDead(job.id, {
            errorCode: "EXECUTION_FAILED",
            errorMessage,
          });

          await this.withdrawalAuditService.append({
            withdrawRequestId: withdrawRequest.id,
            walletId: withdrawRequest.walletId,
            userId: withdrawRequest.wallet.userId,
            eventType: "TX_FAILED",
            actorType: "SYSTEM",
            message: "ExecutionRouter failed and max retries exceeded",
            data: {
              error: errorMessage,
              retryCount: nextRetryCount,
              walletType: withdrawRequest.wallet.walletType,
            },
          });
        } else {
          await this.prisma.withdrawRequest.update({
            where: { id: withdrawRequest.id },
            data: {
              retryCount: nextRetryCount,
              failureReason: errorMessage,
            },
          });

          await this.queueService.markRetry(job.id, {
            errorCode: "EXECUTION_FAILED",
            errorMessage,
            retryDelaySeconds: 30,
          });

          await this.withdrawalAuditService.append({
            withdrawRequestId: withdrawRequest.id,
            walletId: withdrawRequest.walletId,
            userId: withdrawRequest.wallet.userId,
            eventType: "RETRY_SCHEDULED",
            actorType: "WORKER",
            message: "ExecutionRouter failed, retry scheduled",
            data: {
              error: errorMessage,
              retryCount: nextRetryCount,
              retryDelaySeconds: 30,
              walletType: withdrawRequest.wallet.walletType,
            },
          });
        }

        this.logger.error(
          `Withdraw execution failed: requestId=${withdrawRequest.id}, error=${errorMessage}`,
        );
      }
    } finally {
      this.isProcessing = false;
    }
  }
}