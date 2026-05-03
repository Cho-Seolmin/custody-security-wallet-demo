import { useEffect, useState } from "react";
import { getMe } from "../api/auth";
import { getWallets } from "../api/wallet";
import WalletList from "../components/WalletList";
import type { Me } from "../types/auth";
import type { Wallet } from "../types/wallet";
import { useNavigate } from "react-router-dom";
import WalletConnect from "../components/WalletConnect";
import DepositPanel from "../components/DepositPanel";

export default function DashboardPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
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
  
      await fetchWallets();
    } catch (err: any) {
      setError(err?.response?.data?.message || "새로고침 실패");
    } finally {
      setLoading(false);
    }
  };

  const fetchWallets = async () => {
    const walletData = await getWallets();
    setWallets(walletData);
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
  
        const meData = await getMe();
        setMe(meData);
  
        await fetchWallets();
      } catch (err: any) {
        setError(err?.response?.data?.message || "데이터 조회 실패");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return <div style={{ padding: "40px" }}>로딩 중...</div>;
  }

  return (
    <div style={{ padding: "40px" }}>
      <h1>Dashboard</h1>

      <button onClick={handleLogout}>로그아웃</button>
      <button onClick={handleRefresh}>새로고침</button>
      <button onClick={() => navigate("/admin")}>관리자 페이지 이동</button>      

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
        <h2 style={{ margin: 0 }}>내 정보</h2>
        <p style={{ margin: 0 }}>이메일: {me.email}</p>
        <p style={{ margin: 0 }}>권한: {me.role}</p>
        <p style={{ margin: 0 }}>상태: {me.status}</p>

      </div>
    )}
    <WalletConnect />

    <DepositPanel wallets={wallets} />

    <h2>내 지갑 목록</h2>
    <WalletList wallets={wallets} />

      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}