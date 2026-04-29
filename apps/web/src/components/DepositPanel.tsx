import { useState } from "react";
import { parseEther } from "ethers";
import { DEPOSIT_TARGETS } from "../constants/depositTargets";
import { shortenAddress } from "../utils/address";

declare global {
  interface Window {
    ethereum?: any;
  }
}

export default function DepositPanel() {
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
      <h3>테스트 입금</h3>

      <p style={{ color: "#555" }}>
        지갑 테스트를 위한 금액이 부족할 시 입금해주세요.
      </p>

      <input
        type="text"
        value={amountEth}
        onChange={(e) => setAmountEth(e.target.value)}
        placeholder="입금 금액(ETH)"
        style={{
          width: "100%",
          marginBottom: "12px",
          padding: "8px",
        }}
      />

      {Object.entries(DEPOSIT_TARGETS).map(([walletType, target]) => (
        <div
          key={walletType}
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
            <div>{shortenAddress(target.address)}</div>
          </div>

          <button onClick={() => handleDeposit(walletType, target.address)}>
            입금
          </button>
        </div>
      ))}

      {message && (
        <p style={{ marginTop: "12px", color: "blue" }}>
          {message}
        </p>
      )}
    </div>
  );
}