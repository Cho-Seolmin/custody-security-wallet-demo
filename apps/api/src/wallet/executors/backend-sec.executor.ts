import { Injectable, Logger } from '@nestjs/common';
import { SignerService } from '../signer.service';
import { ExecutorResult } from './executor.types';

@Injectable()
export class BackendSecExecutor {
  private readonly logger = new Logger(BackendSecExecutor.name);

  constructor(private readonly signerService: SignerService) {}

  async execute(params: {
    toAddress: string;
    amountWei: bigint;
  }): Promise<ExecutorResult> {
    const signerAddress = await this.signerService.getSignerAddress();
    const signerBalance = await this.signerService.getSignerBalance();

    if (signerBalance < params.amountWei) {
      throw new Error(
        `Insufficient signer balance: signer=${signerAddress}, balance=${signerBalance.toString()}, requested=${params.amountWei.toString()}`,
      );
    }

    const tx = await this.signerService.sendNativeTransaction(
      params.toAddress,
      params.amountWei,
    );

    const receipt = await tx.wait();

    this.logger.log(
      `BACKEND_SEC executed: txHash=${tx.hash}, block=${receipt?.blockNumber ?? 'unknown'}`,
    );

    return {
      type: 'ONCHAIN_TX',
      txHash: tx.hash,
      blockNumber: receipt?.blockNumber ?? null,
      receipt,
    };
  }
}
