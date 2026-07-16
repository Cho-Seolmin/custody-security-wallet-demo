import { useEffect, useState } from "react";
import { formatEther } from "ethers";
import { getMe } from "../api/auth";
import { getWallets, getWalletSummary } from "../api/wallet";
import type { Me } from "../types/auth";
import type { Wallet } from "../types/wallet";
import WalletConnect from "../components/WalletConnect";
import DepositPanel from "../components/DepositPanel";
import "../styles/page.css";

function SummaryCard({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone: "primary" | "success" | "warning" | "gray";
  icon: React.ReactNode;
}) {
  const toneMap: Record<string, { bg: string; fg: string }> = {
    primary: { bg: "var(--color-primary-soft)", fg: "var(--color-primary)" },
    success: { bg: "var(--color-success-soft)", fg: "var(--color-success)" },
    warning: { bg: "var(--color-warning-soft)", fg: "var(--color-warning)" },
    gray: { bg: "var(--color-gray-soft)", fg: "var(--color-gray)" },
  };
  const colors = toneMap[tone];

  return (
    <div className="summary-card">
      <div className="summary-card__top">
        <span className="summary-card__label">{label}</span>
        <span
          className="summary-card__icon"
          style={{ background: colors.bg, color: colors.fg }}
        >
          {icon}
        </span>
      </div>
      <div className="summary-card__value">{value}</div>
      {hint && <div className="summary-card__hint">{hint}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [totalBalanceWei, setTotalBalanceWei] = useState<bigint | null>(null);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [completedCount, setCompletedCount] = useState<number | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const fetchWallets = async () => {
    const walletData = await getWallets();
    setWallets(walletData);
    return walletData as Wallet[];
  };

  const fetchSummary = async () => {
    setSummaryLoading(true);
    try {
      const summary = await getWalletSummary();

      setTotalBalanceWei(BigInt(summary.totalBalanceWei));
      setPendingCount(summary.pendingWithdrawCount);
      setCompletedCount(summary.completedWithdrawCount);
    } catch {
      setTotalBalanceWei(null);
      setPendingCount(null);
      setCompletedCount(null);
    } finally {
      setSummaryLoading(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
  
        const meData = await getMe();
        setMe(meData);
  
        await fetchWallets();
        fetchSummary();
      } catch (err: any) {
        setError(err?.response?.data?.message || "데이터 조회 실패");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return <div className="loading-screen">불러오는 중...</div>;
  }
  return (
    <div className="page">
        <header className="page__header">
          <div>
            <h1 className="page__title">Dashboard</h1>
            <p className="page__subtitle">
              지갑 현황과 보안 상태를 한눈에 확인하세요.
            </p>
          </div>
        </header>

        <section className="summary-grid">
          <SummaryCard
            label="Total Wallets"
            value={wallets.length}
            hint="보유 중인 지갑 수"
            tone="primary"
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="6" width="18" height="13" rx="2.5" />
                <path d="M3 9.5h18" />
              </svg>
            }
          />
          <SummaryCard
            label="Total Balance"
            value={
              summaryLoading
                ? "불러오는 중..."
                : totalBalanceWei !== null
                  ? `${formatEther(totalBalanceWei)} ETH`
                  : "—"
            }
            hint="전체 지갑 합산"
            tone="gray"
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v10M9 9.5c0-1.4 1.3-2.5 3-2.5s3 1 3 2.3c0 3-6 1.7-6 4.7 0 1.3 1.3 2.3 3 2.3s3-1 3-2.3" />
              </svg>
            }
          />
          <SummaryCard
            label="Pending Withdraw"
            value={summaryLoading ? "..." : pendingCount ?? "—"}
            hint="승인 대기 &middot; 처리 중인 출금"
            tone="warning"
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3.5 2" />
              </svg>
            }
          />
          <SummaryCard
            label="Completed Withdraw"
            value={summaryLoading ? "..." : completedCount ?? "—"}
            hint="완료된 출금 건수"
            tone="success"
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12.5l4.5 4.5L20 6" />
              </svg>
            }
          />
        </section>

        <section className="card section-card">
          <div className="section-header">
            <h2>내 프로필 &amp; 입출금 연결</h2>
          </div>

          <div>
            {me && (
              <div
                style={{
                  border: "1px solid var(--color-border)",
                  borderRadius: "12px",
                  padding: "16px",
                  marginBottom: "20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  background: "var(--color-gray-soft)",
                }}
              >
                <h3 style={{ margin: 0, fontSize: "14px" }}>내 정보</h3>
                <p style={{ margin: 0, fontSize: "13.5px", color: "var(--color-text-muted)" }}>
                  이메일: {me.email}
                </p>
                <p style={{ margin: 0, fontSize: "13.5px", color: "var(--color-text-muted)" }}>
                  권한: {me.role}
                </p>
                <p style={{ margin: 0, fontSize: "13.5px", color: "var(--color-text-muted)" }}>
                  상태: {me.status}
                </p>
              </div>
            )}

            <WalletConnect />

            <DepositPanel wallets={wallets} />
          </div>

          {error && <div className="alert alert--danger">{error}</div>}
        </section>
      </div>
  );
}
