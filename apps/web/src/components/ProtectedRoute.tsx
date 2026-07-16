import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getMe } from "../api/auth";

type Props = {
  children: ReactNode;
};

export default function ProtectedRoute({ children }: Props) {
  const [authState, setAuthState] = useState<"loading" | "authed" | "guest">(
    "loading",
  );
  const location = useLocation();

  useEffect(() => {
    getMe()
      .then(() => setAuthState("authed"))
      .catch(() => setAuthState("guest"));
  }, []);

  if (authState === "loading") {
    return <div className="loading-screen">불러오는 중...</div>;
  }

  if (authState === "guest") {
    return (
      <Navigate to="/login" replace state={{ from: location.pathname }} />
    );
  }

  return <>{children}</>;
}
