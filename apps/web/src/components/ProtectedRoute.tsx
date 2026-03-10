import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

type Props = {
  children: ReactNode;
};

export default function ProtectedRoute({ children }: Props) {
  const token = localStorage.getItem("accessToken");
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}