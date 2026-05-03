import {  useEffect, useState } from "react";
import { createWithdraw, getWalletBalance, getWalletWithdraws , updateWalletWhitelist,getWalletWhitelist, getSssStatus, unlockSssWallet, } from "../api/wallet";
import type { Wallet, WalletBalance, WithdrawItem, SssStatus, } from "../types/wallet";
import WithdrawHistory from "./WithdrawHistory";
import { formatEther, isAddress  } from "ethers";
import { shortenAddress } from "../utils/address";
import { parseEther } from "ethers";

type Props = {
  wallet: Wallet;
};

export default function WalletCard({ wallet }: Props) {
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [withdraws, setWithdraws] = useState<WithdrawItem[]>([]);
  const [showWithdraws, setShowWithdraws] = useState(false);

  const [toAddress, setToAddress] = useState("0x1111111111111111111111111111111111111111");
  const [amount, setAmount] = useState("0.0001");
  const [message, setMessage] = useState("");

  const [whitelistInput, setWhitelistInput] = useState("");
  const [whitelistAddresses, setWhitelistAddresses] = useState<string[]>([]);

  const [sssStatus, setSssStatus] = useState<SssStatus | null>(null);
  const [sssPrivateKey, setSssPrivateKey] = useState("");
  const [sssLoading, setSssLoading] = useState(false);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage("주소가 복사되었습니다.");
    } catch {
      setMessage("주소 복사 실패");
    }
  };

  const handleLoadWhitelist = async () => {
    try {
      setMessage("");
      const data = await getWalletWhitelist(wallet.id);
      console.log("loaded whitelist", wallet.id, data);
  
      setWhitelistAddresses(data.map((item: any) => item.address));
  
      if (data.length === 0) {
        setMessage("저장된 화이트리스트가 없습니다.");
      } else {
        setMessage("화이트리스트를 불러왔습니다.");
      }
    } catch (err: any) {
      const data = err?.response?.data;
  
      if (typeof data?.message === "string") {
        setMessage(data.message);
      } else {
        setMessage("화이트리스트 불러오기 실패");
      }
    }
  };

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
    if (showWithdraws) {
      setShowWithdraws(false);
      return;
    }
  
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
  
      // ✅ 입력값 검증
      if (!amount || isNaN(Number(amount))) {
        setMessage("올바른 금액을 입력하세요");
        return;
      }
  
      if (Number(amount) <= 0) {
        setMessage("0보다 큰 금액을 입력하세요");
        return;
      }
  
      // ✅ ETH → wei 변환
    const amountWei = parseEther(amount).toString();
  
    const data = await createWithdraw(wallet.id, {
        toAddress,
        amount: amountWei, // 🔥 여기 변경
    });
  
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


  const handleRemoveWhitelistAddress = (address: string) => {
    setWhitelistAddresses((prev) => prev.filter((item) => item !== address));
  };

  const handleSaveWhitelist = async () => {
    const confirmed = window.confirm("정말 화이트리스트를 등록하시겠습니까?");
    if (!confirmed) return;
  
    try {
      setMessage("");
  
      console.log("save walletId:", wallet.id);
      console.log("save whitelistAddresses:", whitelistAddresses);
  
      const data = await updateWalletWhitelist(wallet.id, whitelistAddresses);
  
      console.log("save response:", data);
  
      setWhitelistAddresses(data.map((item: any) => item.address));
      setMessage("화이트리스트가 저장되었습니다.");
    } catch (err: any) {
      const data = err?.response?.data;
  
      if (typeof data?.message === "string") {
        setMessage(data.message);
      } else if (Array.isArray(data?.message)) {
        setMessage(data.message.join(", "));
      } else {
        setMessage("화이트리스트 저장 실패");
      }
    }
  };

  const handleLoadSssStatus = async () => {
    try {
      setMessage("");
      const data = await getSssStatus(wallet.id);
      setSssStatus(data);
    } catch (err: any) {
      const data = err?.response?.data;
      if (typeof data?.message === "string") {
        setMessage(data.message);
      } else {
        setMessage("SSS 상태 조회 실패");
      }
    }
  };
  
  const handleUnlockSss = async () => {
    try {
      if (!sssPrivateKey.trim()) {
        setMessage("프라이빗 키를 입력하세요.");
        return;
      }
  
      setMessage("");
      setSssLoading(true);
  
      const data = await unlockSssWallet(wallet.id, {
        privateKey: sssPrivateKey.trim(),
      });
  
      setMessage(data.message || "SSS unlock 성공");
      setSssPrivateKey("");
  
      const status = await getSssStatus(wallet.id);
      setSssStatus(status);
    } catch (err: any) {
      const data = err?.response?.data;
      if (typeof data?.message === "string") {
        setMessage(data.message);
      } else {
        setMessage("SSS unlock 실패");
      }
    } finally {
      setSssLoading(false);
    }
  };


  
  const handleAddWhitelistAddress = () => {
    const normalized = whitelistInput.trim().toLowerCase();
  
    if (!normalized) {
      setMessage("주소를 입력하세요.");
      return;
    }
  
    if (!isAddress(normalized)) {
      setMessage("유효한 주소가 아닙니다.");
      return;
    }
  
    if (whitelistAddresses.includes(normalized)) {
      setMessage("이미 등록된 주소입니다.");
      return;
    }
  
    setWhitelistAddresses((prev) => [...prev, normalized]);
    setWhitelistInput("");
    setMessage("");
  };

  useEffect(() => {
    if (wallet.walletType === "SSS") {
      handleLoadSssStatus();
    }
  }, [wallet.id, wallet.walletType]);

  const displayAddress = balance?.address ?? wallet.address;

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
      <div style={{ marginTop: "8px" }}>
        주소: {shortenAddress(displayAddress)}
        <button
          onClick={() => copy(displayAddress)}
          style={{ marginLeft: "8px" }}
        >
          복사
        </button>

        {balance?.address && wallet.address !== balance.address && (
          <div style={{ fontSize: "12px", color: "gray", marginTop: "4px" }}>
            DB 주소: {shortenAddress(wallet.address)}
          </div>
        )}

        <div style={{ fontSize: "12px", color: "gray" }}>
          source: {balance ? "RUNTIME_RESOLVED" : "DB_ADDRESS"}
        </div>
      </div>


      <div>ID: {wallet.id}</div>

      <div style={{ marginTop: "12px" }}>
        <button onClick={handleCheckBalance}>잔액 조회</button>
        <button onClick={handleLoadWithdraws} style={{ marginLeft: "8px" }}>
          {showWithdraws ? "출금 이력 닫기" : "출금 이력 보기"}
        </button>
      </div>

      {balance && (
        <div style={{ marginTop: "12px" }}>
          <strong>잔액:</strong>
          <div>{balance.balanceWei} wei</div>
          <div>{formatEther(balance.balanceWei)} ETH</div>
        </div>
      )}

{wallet.walletType === "BACKEND_SEC" && (
  <div style={{ marginTop: "16px" }}>
    <h4>화이트리스트 관리</h4>

    <input
      type="text"
      value={whitelistInput}
      onChange={(e) => setWhitelistInput(e.target.value)}
      placeholder="허용할 주소 입력"
      style={{ width: "100%", marginBottom: "8px" }}
    />

    <div style={{ marginBottom: "8px" }}>
      <button onClick={handleAddWhitelistAddress}>주소 추가</button>

      <button
        onClick={handleLoadWhitelist}
        style={{ marginLeft: "8px" }}
      >
        화이트리스트 불러오기
      </button>

      <button
        onClick={handleSaveWhitelist}
        style={{ marginLeft: "8px" }}
      >
        화이트리스트 저장
      </button>
    </div>

    {whitelistAddresses.length > 0 && (
      <div style={{ marginTop: "8px" }}>
        {whitelistAddresses.map((address) => (
          <div
            key={address}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              border: "1px solid #eee",
              borderRadius: "8px",
              padding: "8px",
              marginBottom: "6px",
            }}
          >
            <span>{shortenAddress(address)}</span>
            <button onClick={() => handleRemoveWhitelistAddress(address)}>
              삭제
            </button>
          </div>
        ))}
      </div>
    )}
  </div>
)}

{wallet.walletType === "SSS" && (
  <div style={{ marginTop: "16px" }}>
    <h4>SSS Unlock 관리</h4>

    <div
      style={{
        border: "1px solid #eee",
        borderRadius: "8px",
        padding: "12px",
        marginBottom: "12px",
        background: "#fafafa",
      }}
    >
      <div>
        현재 상태:{" "}
        <strong>
          {sssStatus?.unlockState === "UNLOCKED_ONCE" ? "UNLOCKED" : "LOCKED"}
        </strong>
      </div>

      <div style={{ fontSize: "12px", color: "gray", marginTop: "4px" }}>
        만료 시간: {sssStatus?.unlockExpiresAt ?? "-"}
      </div>

      <button onClick={handleLoadSssStatus} style={{ marginTop: "8px" }}>
        상태 새로고침
      </button>
    </div>

    <input
      type="password"
      value={sssPrivateKey}
      onChange={(e) => setSssPrivateKey(e.target.value)}
      placeholder="복구된 private key 입력"
      style={{ width: "100%", marginBottom: "8px" }}
    />

    <button onClick={handleUnlockSss} disabled={sssLoading}>
      {sssLoading ? "Unlock 중..." : "SSS Unlock"}
    </button>
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
          placeholder="금액 (ETH)"
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