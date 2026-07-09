import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getWallets } from "../api/wallet";
import type { Wallet } from "../types/wallet";
import WalletCard from "../components/WalletCard";
import AppShell from "../components/AppShell";
import "../styles/page.css";

export default function WalletsPage() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const selectedWalletId = searchParams.get("walletId");
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError("");

        const data = await getWallets();
        setWallets(data);
      } catch (err: any) {
        setError(err?.response?.data?.message || "지갑 목록 조회 실패");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    if (!selectedWalletId) return;

    const target = cardRefs.current[selectedWalletId];
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedWalletId, wallets]);

  if (loading) {
    return (
      <AppShell>
        <div className="loading-screen">불러오는 중...</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="page">
        <header className="page__header">
          <div>
            <h1 className="page__title">Wallets</h1>
            <p className="page__subtitle">
              보유 중인 모든 지갑을 한 번에 확인하고 관리하세요.
            </p>
          </div>
        </header>

        {error && <div className="alert alert--danger">{error}</div>}

        {!error && wallets.length === 0 && (
          <div className="card section-card">등록된 지갑이 없습니다.</div>
        )}

        {wallets.map((wallet) => (
          <div
            key={wallet.id}
            ref={(el) => {
              cardRefs.current[wallet.id] = el;
            }}
            className="section-card"
            style={
              wallet.id === selectedWalletId
                ? {
                    borderRadius: "16px",
                    boxShadow: "0 0 0 2px var(--color-primary)",
                    transition: "box-shadow 0.2s ease",
                  }
                : undefined
            }
          >
            <WalletCard wallet={wallet} />
          </div>
        ))}
      </div>
    </AppShell>
  );
}
