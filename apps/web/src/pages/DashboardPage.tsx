import { useEffect, useState } from "react";
import { getMe } from "../api/auth";
import { getWallets } from "../api/wallet";
import WalletCard from "../components/WalletCard";
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
  const [currentSlide, setCurrentSlide] = useState(0);
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
  const totalSlides = 1 + wallets.length;

  const goPrev = () => {
    setCurrentSlide((prev) => Math.max(prev - 1, 0));
  };

  const goNext = () => {
    setCurrentSlide((prev) =>
      Math.min(prev + 1, totalSlides - 1)
    );
  };

  return (
    <div
      style={{
        width: "100%",
        minHeight: "100vh",
        background: "#f5f7fb",
        boxSizing: "border-box",
        padding: "24px",
      }}
    >
      <div
        style={{
          width: "600px",
          maxWidth: "100%",
          margin: "0 auto",
          background: "#ffffff",
          minHeight: "calc(100vh - 48px)",
          padding: "32px 24px",
          borderRadius: "16px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
            marginBottom: "16px",
            flexWrap: "wrap",
          }}
        >
          <button onClick={handleRefresh}>
            새로고침
          </button>

          <button onClick={() => navigate("/admin")}>
            관리자 페이지
          </button>

          <button onClick={handleLogout}>
            로그아웃
          </button>
        </div>
        
        <h1 style={{ textAlign: "center", marginBottom: "20px" }}>
          Custody Security Wallet Demo
        </h1>
  
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "24px",
            gap: "12px",
          }}
        >
          <button onClick={goPrev} disabled={currentSlide === 0}>
            이전
          </button>
  
          <div style={{ fontWeight: "bold" }}>
            {currentSlide + 1} / {totalSlides}
          </div>
  
          <button
            onClick={goNext}
            disabled={currentSlide === totalSlides - 1}
          >
            다음
          </button>
        </div>
  
        <div
          style={{
            minHeight: "600px",
            width: "100%",
            maxWidth: "100%",
            overflow: "hidden",
            boxSizing: "border-box",
          }}
        >
          {currentSlide === 0 && (
            <div
              style={{
                width: "100%",
                maxWidth: "100%",
                boxSizing: "border-box",
              }}
            >
              <h2 style={{ textAlign: "center", marginTop: 0, marginBottom: "16px" }}>
                내 프로필 페이지
              </h2>
  
              {me && (
                <div
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
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
            </div>
          )}
  
          {currentSlide > 0 && (
            <div
              style={{
                width: "100%",
                maxWidth: "100%",
                boxSizing: "border-box",
              }}
            >
              <h2 style={{ textAlign: "center", marginTop: 0, marginBottom: "16px" }}>
                내 지갑 페이지
              </h2>
  
              <WalletCard wallet={wallets[currentSlide - 1]} />
            </div>
          )}
  
          {error && <p style={{ color: "red" }}>{error}</p>}
        </div>
      </div>
    </div>
  );
}