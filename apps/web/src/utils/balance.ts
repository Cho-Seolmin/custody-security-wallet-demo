import { formatEther } from "ethers";
import type { BalanceUnit } from "../types/settings";

export function formatBalancePrimary(balanceWei: string, unit: BalanceUnit): string {
  if (unit === "WEI") {
    return `${balanceWei} wei`;
  }

  return `${formatEther(balanceWei)} ETH`;
}

export function formatBalanceSecondary(balanceWei: string, unit: BalanceUnit): string | null {
  if (unit === "WEI") {
    return `${formatEther(balanceWei)} ETH`;
  }

  return `${balanceWei} wei`;
}
