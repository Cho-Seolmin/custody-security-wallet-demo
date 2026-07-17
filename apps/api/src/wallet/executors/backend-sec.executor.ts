import { Injectable, Logger } from '@nestjs/common';
import { getAddress } from 'ethers';
import { SignerService } from '../signer.service';
import { WalletSignerError } from '../wallet-signer.errors';
import { ExecutorResult } from './executor.types';

@Injectable()
export class BackendSecExecutor {
  private readonly logger = new Logger(BackendSecExecutor.name);

  constructor(private readonly signerService: SignerService) {}

  /**
   * Executes BACKEND_SEC and MULTISIG native transfers using the
   * WithdrawRequest's walletId → per-wallet encrypted key (or legacy
   * address-matched shared signer).
   */
  async execute(params: {
    walletId: string;
    toAddress: string;
    amountWei: bigint;
  }): Promise<ExecutorResult> {
    let signer;
    try {
      signer = await this.signerService.getWalletSigner(params.walletId);
    } catch (error) {
      if (error instanceof WalletSignerError) {
        this.logger.error(
          `BACKEND_SEC/MULTISIG signer resolve failed: code=${error.code} walletId=${params.walletId}`,
        );
      }
      throw error;
    }

    const signerAddress = getAddress(signer.address);
    const signerBalance = await this.signerService
      .getProvider()
      .getBalance(signerAddress);

    if (signerBalance < params.amountWei) {
      throw new Error(
        `Insufficient signer balance: signer=${signerAddress}, balance=${signerBalance.toString()}, requested=${params.amountWei.toString()}`,
      );
    }

    const tx = await signer.sendTransaction({
      to: params.toAddress,
      value: params.amountWei,
    });

    const receipt = await tx.wait();

    this.logger.log(
      `BACKEND_SEC/MULTISIG executed: walletId=${params.walletId} signer=${signerAddress} txHash=${tx.hash} block=${receipt?.blockNumber ?? 'unknown'}`,
    );

    return {
      type: 'ONCHAIN_TX',
      txHash: tx.hash,
      blockNumber: receipt?.blockNumber ?? null,
      receipt,
    };
  }
}
