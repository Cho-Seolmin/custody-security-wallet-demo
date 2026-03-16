import { BadRequestException, Injectable } from "@nestjs/common";

@Injectable()
export class PolicyEngineService {
  validateWithdrawPolicy(
    wallet: {
      address: string;
      whitelist?: { address: string }[];
      limit?: { singleTxLimit: string } | null;
    },
    dto: { toAddress: string; amount: string },
  ) {
    const amountWei = BigInt(dto.amount);
  
    const toAddress = dto.toAddress.toLowerCase();
    const walletAddress = wallet.address.toLowerCase();
  
    // 1️⃣ self-transfer 차단
    if (toAddress === walletAddress) {
      throw new BadRequestException("Self-transfer is not allowed");
    }
  
    // 2️⃣ whitelist 검사
    if (wallet.whitelist && wallet.whitelist.length > 0) {
      const allowed = wallet.whitelist.some(
        (w) => w.address.toLowerCase() === toAddress,
      );
  
      if (!allowed) {
        throw new BadRequestException("ToAddress is not whitelisted");
      }
    }
  
    // 3️⃣ singleTxLimit 검사
    if (wallet.limit?.singleTxLimit) {
      const singleTxLimitWei = BigInt(wallet.limit.singleTxLimit);
  
      if (amountWei > singleTxLimitWei) {
        throw new BadRequestException("Over singleTxLimit");
      }
    }
  
    return { allowed: true };
  }
}