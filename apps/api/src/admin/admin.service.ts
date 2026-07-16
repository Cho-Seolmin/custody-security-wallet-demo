import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WithdrawalAuditService } from '../wallet/withdrawal-audit.service';
import { WithdrawGateway } from '../wallet/withdraw.gateway';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private withdrawalAuditService: WithdrawalAuditService,
    private withdrawGateway: WithdrawGateway,
  ) {}

  async listWithdraws(
    status?: 'PENDING' | 'EXECUTED' | 'REJECTED' | 'EXPIRED',
  ) {
    const rows = await this.prisma.withdrawRequest.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        walletId: true,
        amount: true,
        toAddress: true,
        status: true,
        approvedBy: true,
        txHash: true,
        createdAt: true,
        executionType: true,
        _count: {
          select: {
            adminApprovals: true,
          },
        },
      },
    });

    return rows.map((row) => {
      const { _count, ...rest } = row;

      return {
        ...rest,
        approvalCount: _count.adminApprovals,
        requiredApprovalCount: row.executionType === 'MULTISIG' ? 2 : null,
      };
    });
  }

  async approveWithdraw(withdrawRequestId: string, adminUserId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const wr = await tx.withdrawRequest.findUnique({
        where: { id: withdrawRequestId },
        include: { wallet: true },
      });

      if (!wr) {
        throw new NotFoundException('WithdrawRequest not found');
      }

      if (wr.status !== 'PENDING') {
        throw new BadRequestException('Only PENDING can be approved');
      }

      if (wr.expiresAt && wr.expiresAt < new Date()) {
        await tx.withdrawRequest.updateMany({
          where: { id: wr.id, status: 'PENDING' },
          data: {
            status: 'EXPIRED',
            failureReason: 'Multisig approval expired',
            finalizedAt: new Date(),
          },
        });

        throw new BadRequestException('Multisig approval expired');
      }

      if (wr.wallet.walletType !== 'MULTISIG') {
        throw new BadRequestException(
          'Only MULTISIG withdraws require admin approval',
        );
      }

      const existing = await tx.adminApproval.findFirst({
        where: {
          withdrawRequestId,
          adminUserId,
        },
      });

      if (existing) {
        throw new BadRequestException('Admin already approved');
      }

      await tx.adminApproval.create({
        data: {
          withdrawRequestId,
          adminUserId,
          decision: 'APPROVE',
        },
      });

      const approvalCount = await tx.adminApproval.count({
        where: {
          withdrawRequestId,
          decision: 'APPROVE',
        },
      });

      if (approvalCount < 2) {
        return {
          kind: 'approval_recorded' as const,
          wr,
          approvalCount,
        };
      }

      const updated = await tx.withdrawRequest.updateMany({
        where: { id: withdrawRequestId, status: 'PENDING' },
        data: {
          status: 'QUEUED',
          queuedAt: new Date(),
        },
      });

      if (updated.count === 0) {
        const current = await tx.withdrawRequest.findUnique({
          where: { id: withdrawRequestId },
        });

        return {
          kind: 'already_queued' as const,
          wr,
          approvalCount,
          currentStatus: current?.status ?? wr.status,
        };
      }

      const queue = await tx.withdrawalQueue.create({
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

      return {
        kind: 'queued' as const,
        wr,
        approvalCount,
        queue,
      };
    });

    if (result.kind === 'approval_recorded') {
      this.withdrawGateway.emitWithdrawUpdated({
        withdrawRequestId: result.wr.id,
        walletId: result.wr.walletId,
        walletType: result.wr.wallet.walletType,
        userId: result.wr.wallet.userId,
        status: 'PENDING',
        message: `MULTISIG approval recorded (${result.approvalCount}/2)`,
      });

      return {
        message: 'Approval recorded',
        approvalCount: result.approvalCount,
      };
    }

    if (result.kind === 'already_queued') {
      return {
        message: 'Withdraw already queued',
        approvalCount: result.approvalCount,
        status: result.currentStatus,
      };
    }

    this.withdrawGateway.emitWithdrawUpdated({
      withdrawRequestId: result.wr.id,
      walletId: result.wr.walletId,
      walletType: result.wr.wallet.walletType,
      userId: result.wr.wallet.userId,
      status: 'QUEUED',
      message: 'MULTISIG approval threshold reached and queued',
    });

    await this.withdrawalAuditService.append({
      withdrawRequestId,
      walletId: result.wr.walletId,
      eventType: 'QUEUED',
      actorType: 'SYSTEM',
      message: 'MULTISIG approval threshold reached, queued',
      data: {
        approvalCount: result.approvalCount,
        queueId: result.queue.id,
      },
    });

    return {
      message: 'Withdraw approved and queued',
      approvalCount: result.approvalCount,
      queue: result.queue,
    };
  }

  async rejectWithdraw(withdrawRequestId: string, approvedBy: string) {
    const rejected = await this.prisma.$transaction(async (tx) => {
      const wr = await tx.withdrawRequest.findUnique({
        where: { id: withdrawRequestId },
        include: { wallet: true },
      });

      if (!wr) throw new NotFoundException('WithdrawRequest not found');
      if (wr.status !== 'PENDING') {
        throw new BadRequestException('Only PENDING can be rejected');
      }

      if (wr.expiresAt && wr.expiresAt < new Date()) {
        await tx.withdrawRequest.updateMany({
          where: { id: wr.id, status: 'PENDING' },
          data: {
            status: 'EXPIRED',
            failureReason: 'Multisig approval expired',
            finalizedAt: new Date(),
          },
        });

        throw new BadRequestException('Multisig approval expired');
      }

      const updated = await tx.withdrawRequest.updateMany({
        where: { id: withdrawRequestId, status: 'PENDING' },
        data: {
          status: 'REJECTED',
          approvedBy,
          finalizedAt: new Date(),
        },
      });

      if (updated.count === 0) {
        throw new BadRequestException('Only PENDING can be rejected');
      }

      return tx.withdrawRequest.findUnique({
        where: { id: withdrawRequestId },
        select: {
          id: true,
          walletId: true,
          status: true,
          approvedBy: true,
          amount: true,
          toAddress: true,
          createdAt: true,
          wallet: {
            select: {
              walletType: true,
              userId: true,
            },
          },
        },
      });
    });

    if (!rejected) {
      throw new NotFoundException('WithdrawRequest not found');
    }

    await this.withdrawalAuditService.append({
      withdrawRequestId,
      walletId: rejected.walletId,
      eventType: 'REJECTED',
      actorType: 'ADMIN',
      actorId: approvedBy,
      message: 'MULTISIG withdraw rejected by admin',
      data: {
        adminUserId: approvedBy,
        walletType: rejected.wallet.walletType,
        amount: rejected.amount,
        toAddress: rejected.toAddress,
      },
    });

    this.withdrawGateway.emitWithdrawUpdated({
      withdrawRequestId: rejected.id,
      walletId: rejected.walletId,
      walletType: rejected.wallet.walletType,
      userId: rejected.wallet.userId,
      status: 'REJECTED',
      message: 'MULTISIG withdraw rejected',
    });

    const { wallet, ...rest } = rejected;
    return rest;
  }
}
