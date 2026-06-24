import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MpcService } from "./mpc.service";
import { WithdrawalAuditService } from "./withdrawal-audit.service";
import { WithdrawGateway } from "./withdraw.gateway";
import { Prisma } from "@prisma/client";

@Injectable()
export class MpcSettlementService implements OnModuleInit {
  private readonly logger = new Logger(MpcSettlementService.name);
  private isProcessing = false;
  private toPrismaJson(value: unknown): Prisma.InputJsonValue | null {
    if (value === undefined) return null;
  
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly mpcService: MpcService,
    private readonly withdrawalAuditService: WithdrawalAuditService,
    private readonly withdrawGateway: WithdrawGateway,
  ) {}

  onModuleInit() {
    setInterval(() => {
      this.poll().catch((error) => {
        this.logger.error("MPC settlement poll failed", error);
      });
    }, 10000);
  }

  private async poll() {
    if (this.isProcessing) return;

    this.isProcessing = true;

    try {
      const pendingRequests = await this.prisma.withdrawRequest.findMany({
        where: {
          status: "PROCESSING",
          wallet: {
            walletType: "MPC",
          },
          metadata: {
            path: ["externalProvider"],
            equals: "MPC",
          },
        },
        include: {
          wallet: true,
        },
        take: 10,
        orderBy: {
          processingAt: "asc",
        },
      });

      for (const request of pendingRequests) {
        const metadata = request.metadata as Record<string, any> | null;
        const externalRequestId = metadata?.externalRequestId;

        if (!externalRequestId) {
          continue;
        }

        const statusResult = await this.mpcService.getTransferStatus({
          externalRequestId,
          submittedAt: metadata?.externalSubmittedAt,
        });

        if (statusResult.status === "PENDING") {
          await this.prisma.withdrawRequest.update({
            where: { id: request.id },
            data: {
              metadata: {
                ...metadata,
                externalStatus: "PENDING",
                externalLastCheckedAt: new Date().toISOString(),
                externalRaw: this.toPrismaJson(statusResult.raw),
              },
            },
          });

          continue;
        }

        if (statusResult.status === "CONFIRMED") {
          await this.prisma.withdrawRequest.update({
            where: { id: request.id },
            data: {
              status: "EXECUTED",
              txHash: statusResult.txHash,
              confirmedAt: new Date(),
              finalizedAt: new Date(),
              failureReason: null,
              metadata: {
                ...metadata,
                externalStatus: "CONFIRMED",
                externalLastCheckedAt: new Date().toISOString(),
                externalRaw: this.toPrismaJson(statusResult.raw),
              },
            },
          });

          await this.withdrawalAuditService.append({
            withdrawRequestId: request.id,
            walletId: request.walletId,
            userId: request.wallet.userId,
            eventType: "MPC_CONFIRMED",
            actorType: "SYSTEM",
            message: "MPC external transfer confirmed",
            data: {
              externalRequestId,
              txHash: statusResult.txHash ?? null,
              provider: "MPC",
            },
          });

          this.withdrawGateway.emitWithdrawUpdated({
            withdrawRequestId: request.id,
            walletId: request.walletId,
            walletType: request.wallet.walletType,
            status: "EXECUTED",
            txHash: statusResult.txHash,
            message: "MPC transfer confirmed",
          });

          this.logger.log(
            `MPC transfer confirmed: requestId=${request.id}, externalRequestId=${externalRequestId}`,
          );

          continue;
        }

        if (statusResult.status === "FAILED") {
          await this.prisma.withdrawRequest.update({
            where: { id: request.id },
            data: {
              status: "FAILED",
              failureReason: "MPC external transfer failed",
              finalizedAt: new Date(),
              metadata: {
                ...metadata,
                externalStatus: "FAILED",
                externalLastCheckedAt: new Date().toISOString(),
                externalRaw: this.toPrismaJson(statusResult.raw),
              },
            },
          });

          await this.withdrawalAuditService.append({
            withdrawRequestId: request.id,
            walletId: request.walletId,
            userId: request.wallet.userId,
            eventType: "MPC_FAILED",
            actorType: "SYSTEM",
            message: "MPC external transfer failed",
            data: {
              externalRequestId,
              provider: "MPC",
            },
          });

          this.withdrawGateway.emitWithdrawUpdated({
            withdrawRequestId: request.id,
            walletId: request.walletId,
            walletType: request.wallet.walletType,
            status: "FAILED",
            message: "MPC transfer failed",
          });

          this.logger.warn(
            `MPC transfer failed: requestId=${request.id}, externalRequestId=${externalRequestId}`,
          );
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }
}