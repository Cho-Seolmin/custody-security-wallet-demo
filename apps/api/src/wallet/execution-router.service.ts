import { BadRequestException, Injectable } from "@nestjs/common";
import { WalletType } from "@prisma/client";
import { BackendSecExecutor } from "./executors/backend-sec.executor";
import { PolicyGuardExecutor } from "./executors/policy-guard.executor";
import { KmsExecutor } from "./executors/Kms.executor";
import { MpcExecutor } from "./executors/mpc.executor";
import { SssExecutor } from "./executors/sss.executor";

@Injectable()
export class ExecutionRouterService {
  constructor(
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
      case "BACKEND_SEC":
      case "MULTISIG":
        return this.backendSecExecutor.execute({
          toAddress: params.toAddress,
          amountWei: params.amountWei,
        });
  
      case "POLICY_GUARD": {
        const contractAddress = process.env.POLICY_VAULT_ADDRESS;
        if (!contractAddress) {
          throw new BadRequestException(
            "POLICY_VAULT_ADDRESS is missing in .env",
          );
        }
  
        return this.policyGuardExecutor.execute({
          contractAddress,
          toAddress: params.toAddress,
          amountWei: params.amountWei,
        });
      }
      case "KMS":
        return this.kmsExecutor.execute({
          toAddress: params.toAddress,
          amountWei: params.amountWei,
      });
      case "MPC":
        return this.mpcExecutor.execute({
          toAddress: params.toAddress,
          amountWei: params.amountWei,
      });
      case "SSS":
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