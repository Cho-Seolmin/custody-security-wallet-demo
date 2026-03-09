import { useEffect, useState } from "react";
import { getMe } from "../api/auth";
import { getWallets } from "../api/wallet";
import CreateWalletForm from "../components/CreateWalletForm";
import WalletList from "../components/WalletList";
import type { Me } from "../types/auth";
import type { Wallet } from "../types/wallet";
import { useNavigate } from "react-router-dom";
import WalletConnect from "../components/WalletConnect";

export default function DashboardPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const handleLogout = () => {
    localStorage.removeItem("accessToken");
    navigate("/login");
  };

  const fetchWallets = async () => {
    const walletData = await getWallets();
    setWallets(walletData);
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const meData = await getMe();
        setMe(meData);

        await fetchWallets();
      } catch (err: any) {
        setError(err?.response?.data?.message || "데이터 조회 실패");
      }
    };

    fetchData();
  }, []);

  return (
    <div style={{ padding: "40px" }}>
      <h1>Dashboard</h1>

      <button onClick={handleLogout}>로그아웃</button>

      {me && (
        <div style={{ marginBottom: "20px" }}>
          <p>이메일: {me.email}</p>
          <p>권한: {me.role}</p>
        </div>
      )}
    <WalletConnect savedAddress={me?.walletAddress} onSaved={async () => {
      const meData = await getMe();
      setMe(meData);
    }} />
    <CreateWalletForm wallets={wallets} onCreated={fetchWallets} />

    <div style={{ marginBottom: "20px" }}>
      <button onClick={() => navigate("/admin")}>관리자 페이지 이동</button>
    </div>

      <CreateWalletForm wallets={wallets} onCreated={fetchWallets} />

      <h2>내 지갑 목록</h2>
      <WalletList wallets={wallets} />

      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}