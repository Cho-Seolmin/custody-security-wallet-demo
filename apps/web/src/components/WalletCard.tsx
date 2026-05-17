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
  const [visibleWithdrawCount, setVisibleWithdrawCount] = useState(5);

  const [toAddress, setToAddress] = useState("0x1111111111111111111111111111111111111111");
  const [amount, setAmount] = useState("0.0001");
  const [message, setMessage] = useState("");

  const [whitelistInput, setWhitelistInput] = useState("");
  const [whitelistAddresses, setWhitelistAddresses] = useState<string[]>([]);

  const [sssStatus, setSssStatus] = useState<SssStatus | null>(null);
  const [sssPrivateKey, setSssPrivateKey] = useState("");
  const [sssLoading, setSssLoading] = useState(false);

  const securityDescriptions: Record<string, string> = {
    BACKEND_SEC: `화이트리스트 기반 출금 제어 지갑
  1. 화이트리스트 불러오기로 화이트 리스트 확인
  2. 출금을 허용할 주소 입력 후 주소 추가
  3. 화이트리스트 저장 버튼 클릭하여 DB에 등록
  4. 해당 주소로만 출금 가능`,
  
    MULTISIG: `관리자 승인 기반 2-of-2 출금 구조
  1. 출금 요청
  2. 관리자 페이지에서 승인 (승인대기 상태 에서 10분 후 자동 삭제)
  3. 다른 관리자 계정으로 동일하게 승인
  4. 출금 완료`,
  
    POLICY_GUARD: `PolicyVault + PolicyGuard 구조
  1. 1회 출금 한도: 0.001 ETH
  2. 0.001 ETH 초과 시 온체인에서 거래 차단`,
  
    KMS: `외부 키 관리 시스템 기반 지갑
  1. 출금 요청 시 AWS KMS 인증을 통해 서명 수행`,
  
    MPC: `분산 키 서명 기반 지갑
  1. Dfns API를 통한 외부 분산 키 서명으로 출금 수행`,
  
    SSS: `3-of-5 복구 키 기반 지갑
  1. 5개의 키 중 3개로 private key 복구
  2. SSS Unlock 실행
  3. 5분 내 1회 출금 가능`,
  };

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
      setVisibleWithdrawCount(5);
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
  
    const amountWei = parseEther(amount).toString();
  
    const data = await createWithdraw(wallet.id, {
        toAddress,
        amount: amountWei, 
    });
  
      setMessage(data.message || "출금 요청 완료");
  
      const updated = await getWalletWithdraws(wallet.id);
      setWithdraws(updated);
      setVisibleWithdrawCount(5);
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
          width: "100%",
          maxWidth: "100%",
          boxSizing: "border-box",
          overflowWrap: "break-word",
          wordBreak: "break-word",
          border: "1px solid #ccc",
          borderRadius: "12px",
          padding: "16px",
          marginBottom: "20px",
        }}
      >
      <h2>{wallet.walletType}</h2>
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
          <div style={{ wordBreak: "break-all" }}>
            {balance.balanceWei} wei
          </div>
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
      style={{
        width: "100%",
        boxSizing: "border-box",
        marginBottom: "8px",
      }}
    />

    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "8px",
        marginBottom: "8px",
      }}
    >
      <button onClick={handleAddWhitelistAddress}>주소 추가</button>

      <button onClick={handleLoadWhitelist}>
        화이트리스트 불러오기
      </button>

      <button onClick={handleSaveWhitelist}>
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
      style={{
        width: "100%",
        boxSizing: "border-box",
        marginBottom: "8px",
      }}
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
          style={{
            width: "100%",
            boxSizing: "border-box",
            marginBottom: "8px",
          }}
        />

        <input
          type="text"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="금액 (ETH)"
          style={{
            width: "100%",
            boxSizing: "border-box",
            marginBottom: "8px",
          }}
        />

        <button onClick={handleWithdraw}>출금 요청</button>
      </div>

      {message && (
        <p style={{ marginTop: "12px", color: "blue" }}>
          {message}
        </p>
      )}

{showWithdraws && (
  <div>
    <WithdrawHistory items={withdraws.slice(0, visibleWithdrawCount)} />

    {withdraws.length > 0 && (
      <div style={{ marginTop: "8px", fontSize: "13px", color: "#666" }}>
        총 {withdraws.length}개 중{" "}
        {Math.min(visibleWithdrawCount, withdraws.length)}개 표시 중
      </div>
    )}

    {visibleWithdrawCount < withdraws.length && (
      <button
        onClick={() => setVisibleWithdrawCount((prev) => prev + 5)}
        style={{
          marginTop: "8px",
          padding: "8px 12px",
          borderRadius: "8px",
          border: "1px solid #ccc",
          cursor: "pointer",
        }}
      >
        더보기
      </button>
    )}
  </div>
)}

      <div
        style={{
          marginTop: "16px",
          padding: "12px",
          borderRadius: "10px",
          background: "#f5f7fb",
          border: "1px solid #e0e6f0",
          fontSize: "13px",
          color: "#444",
        }}
      >
        💡 {wallet.walletType} 지갑 보안 기능 사용 설명서:
        <div style={{ marginTop: "6px", color: "#666" ,whiteSpace: "pre-line",}}>
         {securityDescriptions[wallet.walletType] ?? "설명 추가 필요"}
        </div>
      </div>
    </div>

  );

}