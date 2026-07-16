import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type ReservedQueueRow = {
  id: string;
  withdrawRequestId: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  availableAt: Date;
  reservedAt: Date | null;
  workerId: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class QueueService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(withdrawRequestId: string) {
    return this.prisma.withdrawalQueue.create({
      data: {
        withdrawRequestId,
        status: 'PENDING',
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
    const rows = await this.prisma.$queryRaw<ReservedQueueRow[]>`
      UPDATE "WithdrawalQueue" AS w
      SET
        status = 'RESERVED',
        "reservedAt" = NOW(),
        "workerId" = ${workerId},
        "updatedAt" = NOW()
      FROM (
        SELECT id
        FROM "WithdrawalQueue"
        WHERE
          status = 'PENDING'
          OR (
            status = 'RETRY_WAIT'
            AND "availableAt" <= NOW()
          )
        ORDER BY "createdAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      ) AS candidate
      WHERE w.id = candidate.id
      RETURNING w.*;
    `;

    const job = rows[0];
    if (!job) return null;

    return this.prisma.withdrawalQueue.findUnique({
      where: { id: job.id },
    });
  }

  async markRunning(queueId: string) {
    return this.prisma.withdrawalQueue.update({
      where: { id: queueId },
      data: {
        status: 'RUNNING',
      },
    });
  }

  async markSucceeded(queueId: string) {
    return this.prisma.withdrawalQueue.update({
      where: { id: queueId },
      data: {
        status: 'SUCCEEDED',
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
      throw new NotFoundException('Queue job not found');
    }

    const nextAttempt = queue.attemptCount + 1;
    const retryDelaySeconds = params?.retryDelaySeconds ?? 30;

    return this.prisma.withdrawalQueue.update({
      where: { id: queueId },
      data: {
        status: 'RETRY_WAIT',
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
        status: 'DEAD',
        lastErrorCode: params?.errorCode,
        lastErrorMessage: params?.errorMessage,
      },
    });
  }
}
