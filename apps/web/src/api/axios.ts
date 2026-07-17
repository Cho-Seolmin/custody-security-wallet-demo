import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export { API_BASE_URL };

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

// A 401 from these endpoints means "wrong credentials", not "your session
// expired" — they must not trigger the global logout/redirect below.
const AUTH_ENTRY_POINTS = ["/auth/login", "/auth/register", "/auth/logout"];

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const requestUrl: string = error?.config?.url ?? "";
    const isAuthEntryPoint = AUTH_ENTRY_POINTS.some((path) =>
      requestUrl.includes(path),
    );

    // 401 = unauthenticated / session expired → clear cookie and redirect.
    // 403 = authenticated but forbidden → keep session; let the page handle it.
    if (status === 401 && !isAuthEntryPoint) {
      try {
        await api.post("/auth/logout");
      } catch {
        // Ignore logout failures during session expiry handling.
      }

      if (window.location.pathname !== "/login") {
        window.location.assign("/login");
      }
    }

    return Promise.reject(error);
  },
);
