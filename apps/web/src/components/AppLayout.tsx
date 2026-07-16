import { Outlet } from "react-router-dom";
import AppShell from "./AppShell";

export default function AppLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
