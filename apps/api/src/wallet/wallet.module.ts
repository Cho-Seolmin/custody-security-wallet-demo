import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from '../auth/auth.module';
import { WithdrawThrottlerGuard } from './guards/withdraw-throttler.guard';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { SignerService } from './signer.service';
import { PolicyEngineService } from './policy-engine.service';
import { WithdrawalAuditService } from './withdrawal-audit.service';
import { QueueService } from './queue.service';
import { WithdrawalWorkerService } from './withdrawal-worker.service';
import { ExecutionRouterService } from './execution-router.service';
import { BackendSecExecutor } from './executors/backend-sec.executor';
import { PolicyGuardExecutor } from './executors/policy-guard.executor';
import { KmsExecutor } from './executors/Kms.executor';
import { KmsService } from './kms.service';
import { MpcExecutor } from './executors/mpc.executor';
import { MpcService } from './mpc.service';
import { SssExecutor } from './executors/sss.executor';
import { MpcSettlementService } from './mpc-settlement.service';
import { MultisigExpirationScheduler } from './multisig-expiration.scheduler';
import { WithdrawGateway } from './withdraw.gateway';
import { WalletProvisionService } from './wallet-provision.service';

@Module({
  imports: [AuthModule, ThrottlerModule],
  controllers: [WalletController],
  providers: [
    WithdrawThrottlerGuard,
    WalletService,
    WalletProvisionService,
    SignerService,
    PolicyEngineService,
    WithdrawalAuditService,
    QueueService,
    WithdrawalWorkerService,
    ExecutionRouterService,
    KmsService,
    BackendSecExecutor,
    PolicyGuardExecutor,
    KmsExecutor,
    MpcService,
    MpcExecutor,
    MpcSettlementService,
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
