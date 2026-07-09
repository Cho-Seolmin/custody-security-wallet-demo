import { api } from "./axios";
import type { UpdatePreferencesPayload } from "../types/settings";

export async function getPreferences() {
  const res = await api.get("/settings/preferences");
  return res.data;
}

export async function updatePreferences(payload: UpdatePreferencesPayload) {
  const res = await api.put("/settings/preferences", payload);
  return res.data;
}
