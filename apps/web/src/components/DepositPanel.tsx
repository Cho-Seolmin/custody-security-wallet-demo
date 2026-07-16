import { useState } from "react";
import { parseEther } from "ethers";
import { DEPOSIT_TARGETS } from "../constants/depositTargets";
import { shortenAddress } from "../utils/address";

declare global {
  interface Window {
    ethereum?: any;
  }
}

type Wallet = {
  id: string;
  walletType: string;
  address: string;
};

type DepositPanelProps = {
  wallets: Wallet[];
};

export default function DepositPanel({ wallets }: DepositPanelProps) {
  const [amountEth, setAmountEth] = useState("0.001");
  const [message, setMessage] = useState("");

  const handleDeposit = async (
    walletType: string,
    targetAddress: string,
  ) => {
    try {
      setMessage("");

      if (!window.ethereum) {
        setMessage("MetaMask가 필요합니다.");
        return;
      }

      if (!targetAddress) {
        setMessage("입금 주소가 없습니다.");
        return;
      }

      if (!amountEth || Number(amountEth) <= 0) {
        setMessage("입금 금액을 입력해주세요.");
        return;
      }

      const confirmed = window.confirm(
        `${walletType} 주소로 ${amountEth} ETH를 입금하시겠습니까?`,
      );

      if (!confirmed) return;

      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });

      const from = accounts[0];
      const valueWei = parseEther(amountEth);

      const txHash = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [
          {
            from,
            to: targetAddress,
            value: "0x" + valueWei.toString(16),
          },
        ],
      });

      setMessage(`입금 트랜잭션 전송 완료: ${txHash}`);
    } catch (err: any) {
      setMessage(err?.message || "입금 실패");
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
      <h2>테스트 지갑으로의 입금</h2>

      <p style={{ color: "#555" }}>
        지갑 테스트를 위한 금액이 부족할 시 입금해주세요.
      </p>

      <div className="field">
        <label className="input-label" htmlFor="deposit-amount-eth">
          입금 금액 (ETH)
        </label>
        <input
          id="deposit-amount-eth"
          type="text"
          className="input"
          value={amountEth}
          onChange={(e) => setAmountEth(e.target.value)}
          placeholder="입금 금액(ETH)"
        />
      </div>

      {wallets.map((wallet) => {
        const target =
          DEPOSIT_TARGETS[
            wallet.walletType as keyof typeof DEPOSIT_TARGETS
          ];

        if (!target) return null;

        return (
          <div
            key={wallet.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              border: "1px solid #eee",
              borderRadius: "8px",
              padding: "10px",
              marginBottom: "8px",
            }}
          >
            <div>
              <strong>{target.label}</strong>
              <div>{shortenAddress(wallet.address)}</div>
            </div>

            <button
              type="button"
              className="btn btn--secondary"
              onClick={() =>
                handleDeposit(wallet.walletType, wallet.address)
              }
            >
              입금
            </button>
          </div>
        );
      })}

      {message && (
        <p style={{ marginTop: "12px", color: "blue" }}>
          {message}
        </p>
      )}
    </div>
  );
}