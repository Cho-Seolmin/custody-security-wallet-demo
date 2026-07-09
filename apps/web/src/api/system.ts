import { api } from "./axios";

export async function getSystemStatus() {
  const res = await api.get("/system/status");
  return res.data;
}
