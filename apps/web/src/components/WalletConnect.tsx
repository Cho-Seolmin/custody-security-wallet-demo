import { useState } from "react";
import { shortenAddress } from "../utils/address";
import "../styles/page.css";

const SEPOLIA_CHAIN_ID = "0xaa36a7";

const CHAIN_LABELS: Record<string, string> = {
  [SEPOLIA_CHAIN_ID]: "Sepolia Testnet",
};

export default function WalletConnect() {
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드 접근 실패는 조용히 무시
    }
  };

  const handleConnect = async () => {
    try {
      setError("");
      setMessage("");

      if (!window.ethereum) {
        setError("MetaMask가 설치되어 있지 않습니다.");
        return;
      }

      const currentChainId = await window.ethereum.request({
        method: "eth_chainId",
      });
      setChainId(currentChainId);

      if (currentChainId !== SEPOLIA_CHAIN_ID) {
        setError("Sepolia 네트워크로 전환해주세요.");
        return;
      }

      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });

      if (accounts && accounts.length > 0) {
        setAccount(accounts[0]);
      } else {
        setError("MetaMask 계정을 찾을 수 없습니다.");
      }
    } catch (err: any) {
      setError(err?.message || "MetaMask 연결 실패");
    }
  };

  return (
    <div
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: "12px",
        padding: "18px 20px",
        marginBottom: "20px",
        background: "var(--color-gray-soft)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "10px",
          marginBottom: "14px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            style={{
              width: "34px",
              height: "34px",
              borderRadius: "9px",
              background: "var(--color-card)",
              border: "1px solid var(--color-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "17px",
              flexShrink: 0,
            }}
          >
            🦊
          </span>
          <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700 }}>MetaMask 연결</h3>
        </div>
        <span className={`badge badge--${account ? "success" : "gray"}`}>
          {account ? "연결됨" : "연결 안됨"}
        </span>
      </div>

      <div className="history-row__meta" style={{ marginBottom: "16px" }}>
        <div>
          <span className="history-row__meta-label">지갑 주소</span>
          {account ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              {shortenAddress(account)}
              <button
                type="button"
                className="chip-btn"
                onClick={() => copy(account)}
                style={{ border: "1px solid var(--color-border)" }}
              >
                {copied ? "복사됨" : "복사"}
              </button>
            </span>
          ) : (
            "-"
          )}
        </div>
        <div>
          <span className="history-row__meta-label">네트워크</span>
          {chainId ? CHAIN_LABELS[chainId] ?? `알 수 없음 (${chainId})` : "-"}
        </div>
      </div>

      <button className="btn btn--primary" onClick={handleConnect}>
        {account ? "다시 연결" : "MetaMask로 지갑 연결"}
      </button>

      {message && <div className="alert alert--info">{message}</div>}
      {error && <div className="alert alert--danger">{error}</div>}
    </div>
  );
}