import { useEffect, useState } from "react";
import { getMe } from "../api/auth";
import { getAdminWithdraws } from "../api/admin";
import AdminWithdrawList from "../components/AdminWithdrawList";
import type { Me } from "../types/auth";
import type { WithdrawItem } from "../types/wallet";
import { useNavigate } from "react-router-dom";


const STATUS_OPTIONS = ["PENDING", "EXECUTED", "FAILED", "REJECTED"] as const;

export default function AdminPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<WithdrawItem[]>([]);
  const [status, setStatus] = useState<string>("PENDING");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const handleLogout = () => {
  localStorage.removeItem("accessToken");
  navigate("/login");
  };
  const handleRefresh = async () => {
    try {
      setError("");
      setLoading(true);
      const meData = await getMe();
      setMe(meData);
      await fetchWithdraws(status);
    } catch (err: any) {
      setError(err?.response?.data?.message || "새로고침 실패");
    } finally {
      setLoading(false);
    }
  };

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
    return <div style={{ padding: "40px" }}>로딩 중...</div>;
  }
  
  if (me && me.role !== "ADMIN") {
    return (
      <div style={{ padding: "40px" }}>
        <h1>Admin</h1>
        <p>관리자만 접근 가능합니다.</p>
        <button onClick={() => navigate("/dashboard")}>대시보드로 돌아가기</button>
      </div>
    );
  }
  
  return (
    <div style={{ padding: "40px", maxWidth: "1100px", margin: "0 auto" }}>
      <h1>Admin Withdraw Management</h1>

      <button onClick={handleRefresh}>새로고침</button>
  
      {me && (
        <div
          style={{
            border: "1px solid #ccc",
            borderRadius: "12px",
            padding: "16px",
            marginBottom: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <p style={{ margin: 0 }}>이메일: {me.email}</p>
          <p style={{ margin: 0 }}>권한: {me.role}</p>
  
          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            <button onClick={() => navigate("/dashboard")}>대시보드로 돌아가기</button>
            <button onClick={handleLogout}>로그아웃</button>
          </div>
        </div>
      )}
  
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
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