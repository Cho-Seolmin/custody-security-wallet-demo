import { api } from "./axios";
import type { Wallet } from "../types/wallet";

export async function getWallets() {
  const res = await api.get("/wallets");
  return res.data;
}

export async function createBackendSecWallet(): Promise<Wallet> {
  const res = await api.post("/wallets/backend-sec");
  return res.data;
}

export async function createMultisigWallet(): Promise<Wallet> {
  const res = await api.post("/wallets/multisig");
  return res.data;
}

export async function createPolicyGuardWallet(): Promise<Wallet> {
  const res = await api.post("/wallets/policy-guard");
  return res.data;
}

export async function registerSssWallet(address: string): Promise<Wallet> {
  const res = await api.post("/wallets/sss", { address });
  return res.data;
}

export async function getWalletSummary() {
  const res = await api.get("/wallets/summary");
  return res.data as {
    walletCount: number;
    totalBalanceWei: string;
    pendingWithdrawCount: number;
    completedWithdrawCount: number;
  };
}

export async function getWalletBalance(walletId: string) {
  const res = await api.get(`/wallets/${walletId}/balance`);
  return res.data;
}

export async function getWalletWithdraws(walletId: string, status?: string) {
  const url = status
    ? `/wallets/${walletId}/withdraws?status=${status}`
    : `/wallets/${walletId}/withdraws`;

  const res = await api.get(url);
  return res.data;
}

export async function createWithdraw(
  walletId: string,
  payload: { toAddress: string; amount: string; otpCode?: string; signedTx?: string;
  }
) {
  const idempotencyKey = crypto.randomUUID();

  const res = await api.post(`/wallets/${walletId}/withdraw`, payload, {
    headers: {
      "Idempotency-Key": idempotencyKey,
    },
  });

  return res.data;
}

export async function updateWalletWhitelist(
  walletId: string,
  addresses: string[],
) {
  const res = await api.post(`/wallets/${walletId}/whitelist`, {
    addresses,
  });
  return res.data;
}

export async function getWalletWhitelist(walletId: string) {
  const res = await api.get(`/wallets/${walletId}/whitelist`);
  return res.data;
}

export async function getWalletLimits(walletId: string) {
  const res = await api.get(`/wallets/${walletId}/limits`);
  return res.data;
}
