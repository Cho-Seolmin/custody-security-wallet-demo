import { useState } from "react";
import { createWithdraw, getWalletBalance, getWalletWithdraws } from "../api/wallet";
import type { Wallet, WalletBalance, WithdrawItem } from "../types/wallet";
import WithdrawHistory from "./WithdrawHistory";
import { formatEther } from "ethers";

type Props = {
  wallet: Wallet;
};

export default function WalletCard({ wallet }: Props) {
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [withdraws, setWithdraws] = useState<WithdrawItem[]>([]);
  const [showWithdraws, setShowWithdraws] = useState(false);

  const [toAddress, setToAddress] = useState("0x1111111111111111111111111111111111111111");
  const [amount, setAmount] = useState("100000000000000");
  const [message, setMessage] = useState("");

  const handleCheckBalance = async () => {
    try {
      setMessage("");
      const data = await getWalletBalance(wallet.id);
      setBalance(data);
    } catch (err: any) {
      setMessage(err?.response?.data?.message || "잔액 조회 실패");
    }
  };

  const handleLoadWithdraws = async () => {
    try {
      setMessage("");
      const data = await getWalletWithdraws(wallet.id);
      setWithdraws(data);
      setShowWithdraws(true);
    } catch (err: any) {
      setMessage(err?.response?.data?.message || "출금 이력 조회 실패");
    }
  };

  const handleWithdraw = async () => {
    try {
      setMessage("");
      const data = await createWithdraw(wallet.id, { toAddress, amount });
      setMessage(data.message || "출금 요청 완료");
      const updated = await getWalletWithdraws(wallet.id);
      setWithdraws(updated);
      setShowWithdraws(true);
    } catch (err: any) {
      const data = err?.response?.data;
      if (typeof data?.message === "string") {
        setMessage(data.message);
      } else {
        setMessage("출금 요청 실패");
      }
    }
  };

  return (
    <div
      style={{
        border: "1px solid #ccc",
        borderRadius: "12px",
        padding: "16px",
        marginBottom: "20px",
      }}
    >
      <h3>{wallet.walletType}</h3>
      <div>주소: {wallet.address}</div>
      <div>ID: {wallet.id}</div>

      <div style={{ marginTop: "12px" }}>
        <button onClick={handleCheckBalance}>잔액 조회</button>
        <button onClick={handleLoadWithdraws} style={{ marginLeft: "8px" }}>
          출금 이력 보기
        </button>
      </div>

      {balance && (
        <div style={{ marginTop: "12px" }}>
          <strong>잔액:</strong>
          <div>{balance.balanceWei} wei</div>
          <div>{formatEther(balance.balanceWei)} ETH</div>
        </div>
      )}

      <div style={{ marginTop: "16px" }}>
        <h4>출금 요청</h4>

        <input
          type="text"
          value={toAddress}
          onChange={(e) => setToAddress(e.target.value)}
          placeholder="받는 주소"
          style={{ width: "100%", marginBottom: "8px" }}
        />

        <input
          type="text"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="금액(wei)"
          style={{ width: "100%", marginBottom: "8px" }}
        />

        <button onClick={handleWithdraw}>출금 요청</button>
      </div>

      {message && (
        <p style={{ marginTop: "12px", color: "blue" }}>
          {message}
        </p>
      )}

      {showWithdraws && <WithdrawHistory items={withdraws} />}
    </div>
  );
}