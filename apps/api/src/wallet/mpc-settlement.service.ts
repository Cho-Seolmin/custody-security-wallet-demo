import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { WithdrawalAuditService } from "./withdrawal-audit.service";
import { MpcService } from "./mpc.service";

@Injectable()
export class MpcSettlementService implements OnModuleInit {
  private readonly logger = new Logger(MpcSettlementService.name);
  private isPolling = false;
  private static readonly POLL_INTERVAL_MS = 5000;
  private static readonly MAX_PENDING_MS = 30 * 60 * 1000; // 30분

  constructor(
    private readonly prisma: PrismaService,
    private readonly withdrawalAuditService: WithdrawalAuditService,
    private readonly mpcService: MpcService,
  ) {}

  onModuleInit() {
    setInterval(() => {
      this.poll().catch((error) => {
        this.logger.error("MPC settlement poll failed", error);
      });
    }, MpcSettlementService.POLL_INTERVAL_MS);
  }

  private async poll() {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const requests = await this.prisma.withdrawRequest.findMany({
        where: {
          status: "PROCESSING",
        },
        include: {
          wallet: true,
        },
        orderBy: {
          createdAt: "asc",
        },
        take: 20,
      });

      for (const request of requests) {
        if (request.wallet.walletType !== "MPC") continue;

        const metadata = (request.metadata as Record<string, any> | null) ?? {};

        if (metadata.externalProvider !== "MPC") continue;
        if (!metadata.externalRequestId) continue;

        if (
          metadata.externalStatus === "CONFIRMED" ||
          metadata.externalStatus === "FAILED" ||
          metadata.externalStatus === "TIMEOUT"
        ) {
          continue;
        }

        const submittedAtMs = metadata.externalSubmittedAt
          ? new Date(metadata.externalSubmittedAt).getTime()
          : null;

        if (
          submittedAtMs &&
          Date.now() - submittedAtMs > MpcSettlementService.MAX_PENDING_MS
        ) {
          await this.prisma.withdrawRequest.update({
            where: { id: request.id },
            data: {
              status: "FAILED",
              failureReason: "MPC transfer confirmation timeout",
              finalizedAt: new Date(),
              metadata: {
                ...metadata,
                externalStatus: "TIMEOUT",
              },
            },
          });

          await this.withdrawalAuditService.append({
            withdrawRequestId: request.id,
            walletId: request.walletId,
            userId: request.wallet.userId,
            eventType: "MPC_TIMEOUT",
            actorType: "SYSTEM",
            message: "MPC transfer timed out while waiting for confirmation",
            data: {
              externalRequestId: metadata.externalRequestId,
              provider: "MPC",
              walletType: request.wallet.walletType,
              timeoutMinutes: 30,
            },
          });

          this.logger.warn(
            `MPC timeout: requestId=${request.id}, externalRequestId=${metadata.externalRequestId}`,
          );

          continue;
        }

        const result = await this.mpcService.getTransferStatus({
          externalRequestId: metadata.externalRequestId,
          submittedAt: metadata.externalSubmittedAt,
        });

        const raw = (result.raw as Record<string, any> | null) ?? {};
        const providerStatus = raw.status ?? null;

        if (
          providerStatus === "Broadcasted" &&
          metadata.externalStatus !== "BROADCASTED"
        ) {
          await this.prisma.withdrawRequest.update({
            where: { id: request.id },
            data: {
              broadcastedAt: new Date(),
              metadata: {
                ...metadata,
                externalStatus: "BROADCASTED",
                externalRaw: result.raw ?? null,
              },
            },
          });

          await this.withdrawalAuditService.append({
            withdrawRequestId: request.id,
            walletId: request.walletId,
            userId: request.wallet.userId,
            eventType: "MPC_BROADCASTED",
            actorType: "SYSTEM",
            message: "MPC transfer broadcasted",
            data: {
              externalRequestId: metadata.externalRequestId,
              provider: "MPC",
              walletType: request.wallet.walletType,
            },
          });

          this.logger.log(
            `MPC broadcasted: requestId=${request.id}, externalRequestId=${metadata.externalRequestId}`,
          );

          continue;
        }

        if (result.status === "PENDING") {
          continue;
        }

        if (result.status === "CONFIRMED") {
          await this.prisma.withdrawRequest.update({
            where: { id: request.id },
            data: {
              status: "EXECUTED",
              txHash: result.txHash,
              broadcastedAt: request.broadcastedAt ?? new Date(),
              confirmedAt: new Date(),
              finalizedAt: new Date(),
              failureReason: null,
              metadata: {
                ...metadata,
                externalStatus: "CONFIRMED",
                externalTxHash: result.txHash,
                externalRaw: result.raw ?? null,
              },
            },
          });

          await this.withdrawalAuditService.append({
            withdrawRequestId: request.id,
            walletId: request.walletId,
            userId: request.wallet.userId,
            eventType: "TX_CONFIRMED",
            actorType: "SYSTEM",
            message: "MPC transfer confirmed",
            data: {
              externalRequestId: metadata.externalRequestId,
              provider: "MPC",
              txHash: result.txHash,
              walletType: request.wallet.walletType,
            },
          });

          this.logger.log(
            `MPC confirmed: requestId=${request.id}, txHash=${result.txHash}`,
          );

          continue;
        }

        if (result.status === "FAILED") {
          await this.prisma.withdrawRequest.update({
            where: { id: request.id },
            data: {
              status: "FAILED",
              failureReason: "MPC execution failed",
              finalizedAt: new Date(),
              metadata: {
                ...metadata,
                externalStatus: "FAILED",
                externalRaw: result.raw ?? null,
              },
            },
          });

          await this.withdrawalAuditService.append({
            withdrawRequestId: request.id,
            walletId: request.walletId,
            userId: request.wallet.userId,
            eventType: "TX_FAILED",
            actorType: "SYSTEM",
            message: "MPC transfer failed",
            data: {
              externalRequestId: metadata.externalRequestId,
              provider: "MPC",
              walletType: request.wallet.walletType,
            },
          });

          this.logger.log(
            `MPC failed: requestId=${request.id}, externalRequestId=${metadata.externalRequestId}`,
          );
        }
      }
    } finally {
      this.isPolling = false;
    }
  }
}