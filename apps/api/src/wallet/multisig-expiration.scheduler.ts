import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { WithdrawalAuditService } from './withdrawal-audit.service';
import { WithdrawGateway } from './withdraw.gateway';

@Injectable()
export class MultisigExpirationScheduler {
  private readonly logger = new Logger(MultisigExpirationScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly withdrawalAuditService: WithdrawalAuditService,
    private readonly withdrawGateway: WithdrawGateway,
  ) {}

  @Cron('*/1 * * * *')
  async expirePendingMultisigWithdraws() {
    const now = new Date();

    const expiredWithdraws = await this.prisma.withdrawRequest.findMany({
      where: {
        status: 'PENDING',
        expiresAt: {
          lt: now,
        },
        wallet: {
          walletType: 'MULTISIG',
        },
      },
      include: {
        wallet: true,
      },
    });

    if (expiredWithdraws.length === 0) {
      return;
    }

    for (const wr of expiredWithdraws) {
      const updated = await this.prisma.withdrawRequest.updateMany({
        where: {
          id: wr.id,
          status: 'PENDING',
        },
        data: {
          status: 'EXPIRED',
          failureReason: 'Multisig approval expired',
          finalizedAt: new Date(),
        },
      });

      if (updated.count === 0) {
        continue;
      }

      await this.withdrawalAuditService.append({
        withdrawRequestId: wr.id,
        walletId: wr.walletId,
        userId: wr.wallet.userId,
        eventType: 'EXPIRED',
        actorType: 'SYSTEM',
        message: 'Multisig approval expired',
        data: {
          expiresAt: wr.expiresAt,
        },
      });

      this.withdrawGateway.emitWithdrawUpdated({
        withdrawRequestId: wr.id,
        walletId: wr.walletId,
        walletType: wr.wallet.walletType,
        userId: wr.wallet.userId,
        status: 'EXPIRED',
        message: 'Multisig approval expired',
      });
    }
  }
}
