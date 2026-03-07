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
  payload: { toAddress: string; amount: string }
) {
  const res = await api.post(`/wallets/${walletId}/withdraw`, payload);
  return res.data;
}

export async function createWallet(walletType: string) {
  const res = await api.post("/wallets", { walletType });
  return res.data;
}