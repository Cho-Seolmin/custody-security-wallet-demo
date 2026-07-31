import { BadRequestException, Injectable } from '@nestjs/common';
import { WalletType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BackendSecExecutor } from './executors/backend-sec.executor';
import { PolicyGuardExecutor } from './executors/policy-guard.executor';
import { KmsExecutor } from './executors/Kms.executor';
import { MpcExecutor } from './executors/mpc.executor';
import { SssExecutor } from './executors/sss.executor';

@Injectable()
export class ExecutionRouterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly backendSecExecutor: BackendSecExecutor,
    private readonly policyGuardExecutor: PolicyGuardExecutor,
    private readonly kmsExecutor: KmsExecutor,
    private readonly mpcExecutor: MpcExecutor,
    private readonly sssExecutor: SssExecutor,
  ) {}

  async execute(params: {
    walletType: WalletType;
    walletId: string;
    withdrawRequestId: string;
    toAddress: string;
    amountWei: bigint;
  }) {
    switch (params.walletType) {
      case 'BACKEND_SEC':
      case 'MULTISIG':
        return this.backendSecExecutor.execute({
          walletId: params.walletId,
          toAddress: params.toAddress,
          amountWei: params.amountWei,
        });

      case 'POLICY_GUARD': {
        const wallet = await this.prisma.wallet.findUnique({
          where: { id: params.walletId },
          select: { address: true, walletType: true },
        });

        if (
          !wallet ||
          wallet.walletType !== 'POLICY_GUARD' ||
          !wallet.address
        ) {
          throw new BadRequestException(
            'POLICY_GUARD wallet address not found',
          );
        }

        return this.policyGuardExecutor.execute({
          contractAddress: wallet.address,
          toAddress: params.toAddress,
          amountWei: params.amountWei,
        });
      }
      case 'KMS':
        return this.kmsExecutor.execute({
          toAddress: params.toAddress,
          amountWei: params.amountWei,
        });
      case 'MPC':
        return this.mpcExecutor.execute({
          toAddress: params.toAddress,
          amountWei: params.amountWei,
        });
      case 'SSS':
        return this.sssExecutor.execute({
          walletId: params.walletId,
          withdrawRequestId: params.withdrawRequestId,
          toAddress: params.toAddress,
          amountWei: params.amountWei,
        });

      default:
        throw new BadRequestException(
          `Unsupported wallet type for execution: ${params.walletType}`,
        );
    }
  }
}
