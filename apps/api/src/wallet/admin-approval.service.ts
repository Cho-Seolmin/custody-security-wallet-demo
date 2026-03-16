import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AdminApprovalService {
  constructor(private readonly prisma: PrismaService) {}

  async approve(withdrawRequestId: string, adminUserId: string) {
    const existing = await this.prisma.adminApproval.findFirst({
      where: {
        withdrawRequestId,
        adminUserId,
      },
    });

    if (existing) {
      throw new BadRequestException("Admin already approved");
    }

    const approval = await this.prisma.adminApproval.create({
      data: {
        withdrawRequestId,
        adminUserId,
        decision: "APPROVE",
      },
    });

    const approvalCount = await this.prisma.adminApproval.count({
      where: {
        withdrawRequestId,
        decision: "APPROVE",
      },
    });

    return {
      approval,
      approvalCount,
    };
  }
}