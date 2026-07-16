import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditActorType } from '@prisma/client';

@Injectable()
export class WithdrawalAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async append(params: {
    withdrawRequestId: string;
    walletId: string;
    userId?: string;
    eventType: string;
    actorType: AuditActorType;
    actorId?: string;
    message?: string;
    data?: any;
  }) {
    return this.prisma.withdrawalAuditLog.create({
      data: {
        withdrawRequestId: params.withdrawRequestId,
        walletId: params.walletId,
        userId: params.userId,
        eventType: params.eventType,
        actorType: params.actorType,
        actorId: params.actorId,
        message: params.message,
        data: params.data,
      },
    });
  }
}
