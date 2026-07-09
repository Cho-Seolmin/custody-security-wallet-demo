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
import { SssExecutor } from "./executors/sss.executor";
import { SssUnlockStoreService } from "./sss-unlock-store.service";
import { MpcSettlementService } from "./mpc-settlement.service";
import { MultisigExpirationScheduler } from "./multisig-expiration.scheduler";
import { WithdrawGateway } from "./withdraw.gateway";


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
    SssUnlockStoreService,
    SssExecutor,
    MultisigExpirationScheduler,
    WithdrawGateway,
  ],
  exports: [
    QueueService,
    WithdrawalAuditService,
    WithdrawGateway,
    SignerService,
    KmsService,
    MpcService,
  ],
})
export class WalletModule {}