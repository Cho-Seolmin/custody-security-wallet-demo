import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { QueueService } from "../wallet/queue.service";
import { WithdrawalAuditService } from "../wallet/withdrawal-audit.service";

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService,
    private queueService: QueueService,
    private withdrawalAuditService: WithdrawalAuditService,) {}

  async listWithdraws(status?: "PENDING" | "EXECUTED" | "REJECTED") {
    return this.prisma.withdrawRequest.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        walletId: true,
        amount: true,
        toAddress: true,
        status: true,
        approvedBy: true,
        txHash: true,
        createdAt: true,
      },
    });
  }

  async approveWithdraw(withdrawRequestId: string, adminUserId: string) {

    const wr = await this.prisma.withdrawRequest.findUnique({
      where: { id: withdrawRequestId },
      include: { wallet: true },
    });
  
    if (!wr) {
      throw new NotFoundException("WithdrawRequest not found");
    }
  
    if (wr.status !== "PENDING") {
      throw new BadRequestException("Only PENDING can be approved");
    }
  
    if (wr.wallet.walletType !== "MULTISIG") {
      throw new BadRequestException("Only MULTISIG withdraws require admin approval");
    }
  
    // 이미 승인했는지 체크
    const existing = await this.prisma.adminApproval.findFirst({
      where: {
        withdrawRequestId,
        adminUserId,
      },
    });
  
    if (existing) {
      throw new BadRequestException("Admin already approved");
    }
  
    // 승인 기록
    await this.prisma.adminApproval.create({
      data: {
        withdrawRequestId,
        adminUserId,
        decision: "APPROVE",
      },
    });
  
    // 승인 개수 확인
    const approvalCount = await this.prisma.adminApproval.count({
      where: {
        withdrawRequestId,
        decision: "APPROVE",
      },
    });
  
    // 2명 승인되면 queue 등록
    if (approvalCount >= 2) {
  
      const updated = await this.prisma.withdrawRequest.update({
        where: { id: withdrawRequestId },
        data: {
          status: "QUEUED",
          queuedAt: new Date(),
        },
      });
  
      const queue = await this.queueService.enqueue(withdrawRequestId);
  
      await this.withdrawalAuditService.append({
        withdrawRequestId,
        walletId: updated.walletId,
        eventType: "QUEUED",
        actorType: "SYSTEM",
        message: "MULTISIG approval threshold reached, queued",
        data: {
          approvalCount,
          queueId: queue.id,
        },
      });
  
      return {
        message: "Withdraw approved and queued",
        approvalCount,
        queue,
      };
    }
  
    return {
      message: "Approval recorded",
      approvalCount,
    };
  }

  async rejectWithdraw(withdrawRequestId: string, approvedBy: string) {
    const wr = await this.prisma.withdrawRequest.findUnique({ where: { id: withdrawRequestId } });
    if (!wr) throw new NotFoundException("WithdrawRequest not found");
    if (wr.status !== "PENDING") throw new BadRequestException("Only PENDING can be rejected");

    return this.prisma.withdrawRequest.update({
      where: { id: withdrawRequestId },
      data: {
        status: "REJECTED",
        approvedBy,
      },
      select: {
        id: true,
        status: true,
        approvedBy: true,
        amount: true,
        toAddress: true,
        createdAt: true,
      },
    });
  }
}