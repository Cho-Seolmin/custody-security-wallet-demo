import { api } from "./axios";

export async function getAdminWithdraws(status?: string) {
  const url = status
    ? `/admin/withdraws?status=${status}`
    : `/admin/withdraws`;

  const res = await api.get(url);
  return res.data;
}

export async function approveWithdraw(withdrawId: string) {
  const res = await api.post(`/admin/withdraws/${withdrawId}/approve`);
  return res.data;
}

export async function rejectWithdraw(withdrawId: string) {
  const res = await api.post(`/admin/withdraws/${withdrawId}/reject`);
  return res.data;
}