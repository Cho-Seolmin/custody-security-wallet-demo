import { useEffect, useState } from "react";
import { getMe } from "../api/auth";
import { getAdminWithdraws } from "../api/admin";
import AdminWithdrawList from "../components/AdminWithdrawList";
import type { Me } from "../types/auth";
import type { WithdrawItem } from "../types/wallet";

const STATUS_OPTIONS = ["PENDING", "EXECUTED", "FAILED", "REJECTED"] as const;

export default function AdminPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<WithdrawItem[]>([]);
  const [status, setStatus] = useState<string>("PENDING");
  const [error, setError] = useState("");

  const fetchWithdraws = async (nextStatus = status) => {
    const data = await getAdminWithdraws(nextStatus);
    setItems(data);
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const meData = await getMe();
        setMe(meData);

        await fetchWithdraws("PENDING");
      } catch (err: any) {
        setError(err?.response?.data?.message || "관리자 데이터 조회 실패");
      }
    };

    fetchData();
  }, []);

  const handleChangeStatus = async (nextStatus: string) => {
    setStatus(nextStatus);
    try {
      setError("");
      await fetchWithdraws(nextStatus);
    } catch (err: any) {
      setError(err?.response?.data?.message || "목록 조회 실패");
    }
  };

  if (me && me.role !== "ADMIN") {
    return (
      <div style={{ padding: "40px" }}>
        <h1>Admin</h1>
        <p>관리자만 접근 가능합니다.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "40px" }}>
      <h1>Admin Withdraw Management</h1>

      {me && (
        <div style={{ marginBottom: "20px" }}>
          <p>이메일: {me.email}</p>
          <p>권한: {me.role}</p>
        </div>
      )}

      <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
        {STATUS_OPTIONS.map((option) => (
          <button
            key={option}
            onClick={() => handleChangeStatus(option)}
            style={{
              padding: "8px 12px",
              borderRadius: "8px",
              fontWeight: status === option ? "bold" : "normal",
            }}
          >
            {option}
          </button>
        ))}
      </div>

      <AdminWithdrawList items={items} onRefresh={() => fetchWithdraws(status)} />

      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}