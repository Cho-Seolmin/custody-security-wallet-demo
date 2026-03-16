import { Injectable, Logger } from "@nestjs/common";
import { Contract } from "ethers";
import { SignerService } from "../signer.service";

@Injectable()
export class PolicyGuardExecutor {
  private readonly logger = new Logger(PolicyGuardExecutor.name);

  constructor(private readonly signerService: SignerService) {}

  async execute(params: {
    contractAddress: string;
    toAddress: string;
    amountWei: bigint;
  }) {
    const signer = this.signerService.getSigner();

    // 최소 ABI
    const abi = [
      "function withdraw(address to, uint256 amount) external",
    ];

    const contract = new Contract(params.contractAddress, abi, signer);

    const tx = await contract.withdraw(params.toAddress, params.amountWei);
    const receipt = await tx.wait();

    this.logger.log(
      `POLICY_GUARD executed: txHash=${tx.hash}, block=${receipt?.blockNumber ?? "unknown"}`
    );

    return {
      txHash: tx.hash,
      blockNumber: receipt?.blockNumber ?? null,
      receipt,
    };
  }
}