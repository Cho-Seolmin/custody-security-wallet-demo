import { useState } from "react";
import { shortenAddress } from "../utils/address";

const SEPOLIA_CHAIN_ID = "0xaa36a7";

export default function WalletConnect() {
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
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
        border: "1px solid #ccc",
        borderRadius: "12px",
        padding: "16px",
        marginBottom: "20px",
      }}
    >
      <h2>MetaMask 연결</h2>

      {account ? (
        <>
          <p>연결 상태: 연결됨</p>
          <p>
            현재 연결 주소: {shortenAddress(account)}
            <button onClick={() => copy(account)}>Copy</button>
          </p>
        </>
      ) : (
        <p>연결된 지갑이 없습니다.</p>
      )}

      <p>현재 네트워크: {chainId || "-"}</p>
      <div style={{ display: "flex", gap: "8px" }}>
        <button onClick={handleConnect}>지갑 연결</button>
      </div>

      {message && <p style={{ color: "blue", marginTop: "10px" }}>{message}</p>}
      {error && <p style={{ color: "red", marginTop: "10px" }}>{error}</p>}
    </div>
  );
}