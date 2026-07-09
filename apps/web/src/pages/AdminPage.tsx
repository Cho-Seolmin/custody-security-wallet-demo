import { useEffect, useState } from "react";
import { getMe } from "../api/auth";
import { getAdminWithdraws } from "../api/admin";
import AdminWithdrawList from "../components/AdminWithdrawList";
import type { Me } from "../types/auth";
import type { WithdrawItem } from "../types/wallet";
import { useNavigate } from "react-router-dom";
import AppShell from "../components/AppShell";
import "../styles/page.css";

const STATUS_OPTIONS = ["PENDING", "EXECUTED", "FAILED", "REJECTED"] as const;

export default function AdminPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<WithdrawItem[]>([]);
  const [status, setStatus] = useState<string>("PENDING");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  const fetchWithdraws = async (nextStatus = status) => {
    const data = await getAdminWithdraws(nextStatus);
    setItems(data);
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
  
        const meData = await getMe();
        setMe(meData);
  
        await fetchWithdraws("PENDING");
      } catch (err: any) {
        setError(err?.response?.data?.message || "관리자 데이터 조회 실패");
      } finally {
        setLoading(false);
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

  if (loading) {
    return (
      <AppShell>
        <div className="loading-screen">불러오는 중...</div>
      </AppShell>
    );
  }

  if (me && me.role !== "ADMIN") {
    return (
      <AppShell>
        <div className="page">
          <div className="card section-card" style={{ textAlign: "center", padding: "48px 24px" }}>
            <h1 style={{ fontSize: "18px", marginBottom: "8px" }}>Admin</h1>
            <p style={{ color: "var(--color-text-muted)", marginBottom: "16px" }}>
              관리자만 접근 가능합니다.
            </p>
            <button className="btn btn--primary" onClick={() => navigate("/dashboard")}>
              대시보드로 돌아가기
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="page">
        <header className="page__header">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <h1 className="page__title">Admin Withdraw Management</h1>
              {me && <span className="badge badge--primary">{me.role}</span>}
            </div>
            <p className="page__subtitle">
              {me?.email ? `${me.email} · ` : ""}출금 요청을 검토하고 승인 또는 거절하세요.
            </p>
          </div>
        </header>

        <div className="tab-group">
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option}
              className={`tab${status === option ? " is-active" : ""}`}
              onClick={() => handleChangeStatus(option)}
            >
              {option}
            </button>
          ))}
        </div>

        <div className="card section-card">
          <AdminWithdrawList items={items} onRefresh={() => fetchWithdraws(status)} />
        </div>

        {error && <div className="alert alert--danger">{error}</div>}
      </div>
    </AppShell>
  );
}
