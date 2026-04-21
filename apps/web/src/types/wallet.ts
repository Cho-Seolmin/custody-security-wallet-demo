export type Wallet = {
    id: string;
    walletType: string;
    address: string;
    createdAt: string;
    resolvedAddress?: string;
    addressSource?: string;
  
  };
  
  export type WalletBalance = {
    walletId: string;
    address: string;
    balanceWei: string;
  };
  
  export type WithdrawItem = {
    id: string;
    amount: string;
    toAddress: string;
    status: "PENDING" | "EXECUTED" | "REJECTED" | "FAILED";
    approvedBy: string | null;
    txHash: string | null;
    createdAt: string;
  };

  export type SssStatus = {
    walletId: string;
    walletType: string;
    unlockState: "LOCKED" | "UNLOCKED_ONCE";
    unlockExpiresAt: string | null;
  };