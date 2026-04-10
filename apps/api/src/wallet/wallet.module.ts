import { Module } from "@nestjs/common";
import { WalletController } from "./wallet.controller";
import { WalletService } from "./wallet.service";
import { PrismaService } from "../prisma/prisma.service";
import { SignerService } from "./signer.service";
import { PolicyEngineService } from "./policy-engine.service";
import { WithdrawalAuditService } from "./withdrawal-audit.service";
import { QueueService } from "./queue.service";
import { WithdrawalWorkerService } from "./withdrawal-worker.service";
import { AdminApprovalService } from "./admin-approval.service";
import { ExecutionRouterService } from "./execution-router.service";
import { BackendSecExecutor } from "./executors/backend-sec.executor";
import { PolicyGuardExecutor } from "./executors/policy-guard.executor";
import { KmsExecutor } from "./executors/Kms.executor";
import { KmsService } from "./kms.service";
import { MpcExecutor } from "./executors/mpc.executor";
import { MpcService } from "./mpc.service";
import { MpcSettlementService } from "./mpc-settlement.service";


@Module({
  controllers: [WalletController],
  providers: [
    WalletService,
    PrismaService,
    SignerService,
    PolicyEngineService,
    WithdrawalAuditService,
    QueueService,
    WithdrawalWorkerService,
    AdminApprovalService,
    ExecutionRouterService,
    KmsService,
    BackendSecExecutor,
    PolicyGuardExecutor,
    KmsExecutor,
    MpcService,
    MpcExecutor,
    MpcSettlementService,
  ],
})
export class WalletModule {}