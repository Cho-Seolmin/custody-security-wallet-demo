import { useMemo, useState } from "react";
import { createWallet } from "../api/wallet";
import type { Wallet } from "../types/wallet";

type Props = {
  wallets: Wallet[];
  onCreated: () => Promise<void>;
};

const WALLET_TYPES = [
  "MULTISIG",
  "SSS",
  "KMS",
  "BACKEND_SEC",
  "MPC",
  "POLICY_GUARD",
] as const;

export default function CreateWalletForm({ wallets, onCreated }: Props) {
  const [loadingType, setLoadingType] = useState<string>("");
  const [message, setMessage] = useState("");

  const existingTypes = useMemo(() => {
    return new Set(wallets.map((wallet) => wallet.walletType));
  }, [wallets]);

  const handleCreate = async (walletType: string) => {
    try {
      setMessage("");
      setLoadingType(walletType);

      const data = await createWallet(walletType);
      setMessage(`${data.walletType} 지갑 생성 완료`);
      await onCreated();
    } catch (err: any) {
      setMessage(err?.response?.data?.message || "지갑 생성 실패");
    } finally {
      setLoadingType("");
    }
  };

  return (
    <div
      style={{
        border: "1px solid #ccc",
        borderRadius: "12px",
        padding: "16px",
        marginBottom: "24px",
      }}
    >
      <h2>지갑 생성</h2>
      <p>타입별로 1개씩만 생성 가능합니다.</p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "12px" }}>
        {WALLET_TYPES.map((type) => {
          const disabled = existingTypes.has(type) || loadingType !== "";

          return (
            <button
              key={type}
              onClick={() => handleCreate(type)}
              disabled={disabled}
              style={{
                padding: "10px 14px",
                borderRadius: "8px",
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.5 : 1,
              }}
            >
              {loadingType === type ? "생성 중..." : type}
            </button>
          );
        })}
      </div>

      {message && (
        <p style={{ marginTop: "12px", color: "blue" }}>
          {message}
        </p>
      )}
    </div>
  );
}