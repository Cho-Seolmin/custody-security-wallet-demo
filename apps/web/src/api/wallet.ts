import { api } from "./axios";

export async function getWallets() {
  const res = await api.get("/wallets");
  return res.data;
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

export async function createWallet(walletType: string) {
  const res = await api.post("/wallets", { walletType });
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

export async function getSssStatus(walletId: string) {
  const res = await api.get(`/wallets/${walletId}/sss/status`);
  return res.data;
}

export async function unlockSssWallet(
  walletId: string,
  payload: { privateKey: string }
) {
  const res = await api.post(`/wallets/${walletId}/sss/unlock`, payload);
  return res.data;
}