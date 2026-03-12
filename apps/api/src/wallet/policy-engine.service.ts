import { BadRequestException, Injectable } from "@nestjs/common";

@Injectable()
export class PolicyEngineService {
  validateWithdrawPolicy(wallet: {
    whitelist?: { address: string }[];
    limit?: { singleTxLimit: string } | null;
  }, dto: { toAddress: string; amount: string }) {
    const amountWei = BigInt(dto.amount);

    // 1) whitelist 체크
    if (wallet.whitelist && wallet.whitelist.length > 0) {
      const allowed = wallet.whitelist.some(
        (w) => w.address.toLowerCase() === dto.toAddress.toLowerCase()
      );

      if (!allowed) {
        throw new BadRequestException("ToAddress is not whitelisted");
      }
    }

    // 2) singleTxLimit 체크
    if (wallet.limit?.singleTxLimit) {
      const singleTxLimitWei = BigInt(wallet.limit.singleTxLimit);

      if (amountWei > singleTxLimitWei) {
        throw new BadRequestException("Over singleTxLimit");
      }
    }

    return {
      allowed: true,
    };
  }
}