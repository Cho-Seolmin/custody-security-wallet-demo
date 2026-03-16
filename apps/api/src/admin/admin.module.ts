import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaService } from "../prisma/prisma.service";
import { QueueService } from "../wallet/queue.service";
import { WithdrawalAuditService } from "../wallet/withdrawal-audit.service";

@Module({
  controllers: [AdminController],
  providers: [
    AdminService,
    PrismaService,
    QueueService,
    WithdrawalAuditService,
  ]
})
export class AdminModule {}
