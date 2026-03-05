import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

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

  async approveWithdraw(withdrawRequestId: string, approvedBy: string) {
    const wr = await this.prisma.withdrawRequest.findUnique({ where: { id: withdrawRequestId } });
    if (!wr) throw new NotFoundException("WithdrawRequest not found");
    if (wr.status !== "PENDING") throw new BadRequestException("Only PENDING can be approved");

    // 데모: 실제 tx 전송은 Day3에 붙이고, 지금은 EXECUTED 처리
    return this.prisma.withdrawRequest.update({
      where: { id: withdrawRequestId },
      data: {
        status: "EXECUTED",
        approvedBy,
        txHash: `ADMIN_APPROVED_PLACEHOLDER_${Date.now()}`,
      },
      select: {
        id: true,
        status: true,
        approvedBy: true,
        txHash: true,
        amount: true,
        toAddress: true,
        createdAt: true,
      },
    });
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