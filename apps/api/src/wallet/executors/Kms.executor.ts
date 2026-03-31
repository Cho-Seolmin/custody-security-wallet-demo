import { Injectable, Logger } from "@nestjs/common";
import { ExecutorResult } from "./executor.types";
import { KmsService } from "../kms.service";

@Injectable()
export class KmsExecutor {
  private readonly logger = new Logger(KmsExecutor.name);

  constructor(
    private readonly kmsService: KmsService,
  ) {}

  async execute(params: {
    toAddress: string;
    amountWei: bigint;
  }): Promise<ExecutorResult> {
    const signerAddress = await this.kmsService.getAddress();
    const signerBalance = await this.kmsService.getBalance();

    if (signerBalance < params.amountWei) {
      throw new Error(
        `KMS signer insufficient balance: signer=${signerAddress}, balance=${signerBalance.toString()}, requested=${params.amountWei.toString()}`
      );
    }

    const tx = await this.kmsService.sendNativeTransaction(
      params.toAddress,
      params.amountWei,
    );

    const receipt = await tx.wait();

    this.logger.log(
      `KMS executed: txHash=${tx.hash}, block=${receipt?.blockNumber ?? "unknown"}`
    );

    return {
      type: "ONCHAIN_TX",
      txHash: tx.hash,
      blockNumber: receipt?.blockNumber ?? null,
      receipt,
    };
  }
}