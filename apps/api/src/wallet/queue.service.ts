// src/wallet/queue.service.ts
import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { QueueStatus } from "@prisma/client";

@Injectable()
export class QueueService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(withdrawRequestId: string) {
    return this.prisma.withdrawalQueue.create({
      data: {
        withdrawRequestId,
        status: "PENDING",
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
  }

  async getQueueByWithdrawRequestId(withdrawRequestId: string) {
    return this.prisma.withdrawalQueue.findUnique({
      where: { withdrawRequestId },
    });
  }

  async reserveNext(workerId: string) {
    const job = await this.prisma.withdrawalQueue.findFirst({
      where: {
        OR: [
          { status: "PENDING" },
          {
            status: "RETRY_WAIT",
            availableAt: { lte: new Date() },
          },
        ],
      },
      orderBy: { createdAt: "asc" },
    });

    if (!job) return null;

    return this.prisma.withdrawalQueue.update({
      where: { id: job.id },
      data: {
        status: "RESERVED",
        reservedAt: new Date(),
        workerId,
      },
    });
  }

  async markRunning(queueId: string) {
    return this.prisma.withdrawalQueue.update({
      where: { id: queueId },
      data: {
        status: "RUNNING",
      },
    });
  }

  async markSucceeded(queueId: string) {
    return this.prisma.withdrawalQueue.update({
      where: { id: queueId },
      data: {
        status: "SUCCEEDED",
      },
    });
  }

  async markRetry(
    queueId: string,
    params?: {
      errorCode?: string;
      errorMessage?: string;
      retryDelaySeconds?: number;
    },
  ) {
    const queue = await this.prisma.withdrawalQueue.findUnique({
      where: { id: queueId },
    });

    if (!queue) {
      throw new NotFoundException("Queue job not found");
    }

    const nextAttempt = queue.attemptCount + 1;
    const retryDelaySeconds = params?.retryDelaySeconds ?? 30;

    return this.prisma.withdrawalQueue.update({
      where: { id: queueId },
      data: {
        status: "RETRY_WAIT",
        attemptCount: nextAttempt,
        lastErrorCode: params?.errorCode,
        lastErrorMessage: params?.errorMessage,
        availableAt: new Date(Date.now() + retryDelaySeconds * 1000),
      },
    });
  }

  async markDead(
    queueId: string,
    params?: {
      errorCode?: string;
      errorMessage?: string;
    },
  ) {
    return this.prisma.withdrawalQueue.update({
      where: { id: queueId },
      data: {
        status: "DEAD",
        lastErrorCode: params?.errorCode,
        lastErrorMessage: params?.errorMessage,
      },
    });
  }
}