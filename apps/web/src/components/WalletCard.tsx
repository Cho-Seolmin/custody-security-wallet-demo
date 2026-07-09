import {  useEffect, useState,useRef } from "react";
import { createWithdraw, getWalletBalance, getWalletWithdraws , updateWalletWhitelist,getWalletWhitelist, } from "../api/wallet";
import { getPreferences } from "../api/settings";
import type { Wallet as WalletType, WalletBalance, WithdrawItem } from "../types/wallet";
import WithdrawHistory from "./WithdrawHistory";
import { Wallet ,formatEther, isAddress, parseEther, JsonRpcProvider  } from "ethers";
import { shortenAddress } from "../utils/address";
import { socket } from "../lib/socket";
import "../styles/page.css";

const AUTO_REFRESH_INTERVAL_MS = 20_000;

type Props = {
  wallet: WalletType;
};

export default function WalletCard({ wallet }: Props) {
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [withdraws, setWithdraws] = useState<WithdrawItem[]>([]);
  const [showWithdraws, setShowWithdraws] = useState(false);
  const [visibleWithdrawCount, setVisibleWithdrawCount] = useState(5);

  const [toAddress, setToAddress] = useState("0x1111111111111111111111111111111111111111");
  const [amount, setAmount] = useState("0.0001");
  const [message, setMessage] = useState("");
  const [otpCode, setOtpCode] = useState("");

  const [whitelistInput, setWhitelistInput] = useState("");
  const [whitelistAddresses, setWhitelistAddresses] = useState<string[]>([]);

  const [sssPrivateKey, setSssPrivateKey] = useState("");
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const withdrawLockRef = useRef(false);

  const [showGuide, setShowGuide] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);

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
  1. 5개의 키 중 3개로 private key 복구 (복구 프로그램 다운 후 실행)
  2. 브라우저에서 signedTx 생성
  3. 서버는 privateKey를 저장하지 않고 signedTx만 검증 및 broadcast
  4. 검증 완료 후 1회 출금 가능, 출금 후 다시 잠금`
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
    if (withdrawLockRef.current) {
      setMessage(
        "⚠️ 연속 출금 요청 방지를 위해 3초 후 다시 시도해주세요."
      );
      return;
    }
      
    withdrawLockRef.current = true;
    setWithdrawLoading(true);
  
    try {
      setMessage("");
  
      if (!amount || isNaN(Number(amount))) {
        setMessage("올바른 금액을 입력하세요");
        return;
      }
  
      if (Number(amount) <= 0) {
        setMessage("0보다 큰 금액을 입력하세요");
        return;
      }
  
      const amountWei = parseEther(amount).toString();

      let signedTx: string | undefined;

      if (wallet.walletType === "SSS") {
        if (!sssPrivateKey.trim()) {
          setMessage("SSS 출금은 private key 입력이 필요합니다.");
          return;
        }

        const rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL;

        if (!rpcUrl) {
          setMessage("VITE_SEPOLIA_RPC_URL이 설정되어 있지 않습니다.");
          return;
        }

        const provider = new JsonRpcProvider(rpcUrl);
        const sssSigner = new Wallet(sssPrivateKey.trim(), provider);

        const signerAddress = await sssSigner.getAddress();

        if (signerAddress.toLowerCase() !== wallet.address.toLowerCase()) {
          setMessage("private key가 SSS 지갑 주소와 일치하지 않습니다.");
          return;
        }

        const nonce = await provider.getTransactionCount(signerAddress, "pending");

        const feeData = await provider.getFeeData();

        if (!feeData.maxFeePerGas || !feeData.maxPriorityFeePerGas) {
          setMessage("Sepolia fee data를 가져오지 못했습니다.");
          return;
        }
        
        signedTx = await sssSigner.signTransaction({
          to: toAddress,
          value: amountWei,
          chainId: 11155111,
          nonce,
          type: 2,
          gasLimit: 21000n,
          maxFeePerGas: feeData.maxFeePerGas,
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
        });
      }

      const data = await createWithdraw(wallet.id, {
        toAddress,
        amount: amountWei,
        otpCode: otpCode.trim() || undefined,
        signedTx,
      });

      if (wallet.walletType === "SSS") {
        setSssPrivateKey("");
      }
  
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
    } finally {
      setWithdrawLoading(false);
  
      setTimeout(() => {
        withdrawLockRef.current = false;
      }, 3000);
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
    handleCheckBalance();
    handleLoadWithdraws();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.id]);

  useEffect(() => {
    let cancelled = false;

    getPreferences()
      .then((data) => {
        if (!cancelled) setAutoRefreshEnabled(data.autoRefreshEnabled !== false);
      })
      .catch(() => {
        // 환경설정 조회 실패 시 기본값(자동 새로고침 사용) 유지
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!autoRefreshEnabled) return;

    const timer = setInterval(() => {
      handleCheckBalance();
      handleLoadWithdraws();
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefreshEnabled, wallet.id]);

  useEffect(() => {
    const handleWithdrawUpdated = async (payload: {
      withdrawRequestId: string;
      walletId: string;
      walletType?: string;
      status: string;
      txHash?: string | null;
      message?: string;
    }) => {
      if (payload.walletId !== wallet.id) return;
  
      try {
        const updated = await getWalletWithdraws(wallet.id);
        setWithdraws(updated);

        const updatedBalance = await getWalletBalance(wallet.id);
        setBalance(updatedBalance);
  
        if (showWithdraws === false) {
          return;
        }
  
        setMessage(`출금 상태가 업데이트되었습니다: ${payload.status}`);
      } catch {
        setMessage("출금 상태 업데이트 후 이력 재조회 실패");
      }
    };
  
    socket.on("withdraw.updated", handleWithdrawUpdated);
  
    return () => {
      socket.off("withdraw.updated", handleWithdrawUpdated);
    };
  }, [wallet.id, showWithdraws]);

  const displayAddress = balance?.address ?? wallet.address;

  return (
      <div className="card" style={{ overflowWrap: "break-word", wordBreak: "break-word" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "10px",
            marginBottom: "16px",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <div className="card-title">{wallet.walletType}</div>
              <button
                className="btn btn--ghost"
                style={{ height: "28px", padding: "0 10px", fontSize: "12px" }}
                onClick={() => setShowGuide((prev) => !prev)}
              >
                {showGuide ? "지갑 사용 설명서 닫기" : "지갑 사용 설명서 보기"}
              </button>
            </div>
            <div style={{ fontSize: "12px", color: "var(--color-text-faint)", marginTop: "4px" }}>
              ID: {wallet.id}
            </div>
          </div>
          <span className="badge badge--gray">
            {balance ? "RUNTIME_RESOLVED" : "DB_ADDRESS"}
          </span>
        </div>

        {showGuide && (
          <div className="info-box info-box--neutral" style={{ marginBottom: "16px" }}>
            💡 {wallet.walletType} 지갑 보안 기능 사용 설명서:
            <div style={{ marginTop: "6px", whiteSpace: "pre-line" }}>
              {securityDescriptions[wallet.walletType] ?? "설명 추가 필요"}
            </div>
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "8px",
            background: "var(--color-gray-soft)",
            border: "1px solid var(--color-border)",
            borderRadius: "10px",
            padding: "10px 14px",
            marginBottom: "16px",
          }}
        >
          <div style={{ fontSize: "13.5px", fontWeight: 600 }}>
            주소: {shortenAddress(displayAddress)}
          </div>
          <button className="btn btn--ghost" style={{ height: "30px", padding: "0 12px" }} onClick={() => copy(displayAddress)}>
            복사
          </button>
        </div>

        {balance?.address && wallet.address !== balance.address && (
          <div style={{ fontSize: "12px", color: "var(--color-text-faint)", marginTop: "-10px", marginBottom: "16px" }}>
            DB 주소: {shortenAddress(wallet.address)}
          </div>
        )}

        <hr className="divider" style={{ margin: "4px 0 20px" }} />

        <div className="wallet-grid">
          {/* 왼쪽: 지갑 제어 (화이트리스트 관리 / 서명 / 출금 요청) */}
          <div className="wallet-grid__col">
            <div className="card-subtitle">지갑 관리</div>

{wallet.walletType === "BACKEND_SEC" && (
  <div style={{ marginBottom: "20px" }}>
    <h4 style={{ marginBottom: "12px", fontSize: "14px" }}>화이트리스트 관리</h4>

    <div className="field">
      <input
        type="text"
        className="input"
        value={whitelistInput}
        onChange={(e) => setWhitelistInput(e.target.value)}
        placeholder="허용할 주소 입력"
      />
    </div>

    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "8px",
        marginBottom: "12px",
      }}
    >
      <button className="btn btn--secondary" onClick={handleAddWhitelistAddress}>주소 추가</button>

      <button className="btn btn--ghost" onClick={handleLoadWhitelist}>
        화이트리스트 불러오기
      </button>

      <button className="btn btn--primary" onClick={handleSaveWhitelist}>
        화이트리스트 저장
      </button>
    </div>

    {whitelistAddresses.length > 0 && (
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {whitelistAddresses.map((address) => (
          <div key={address} className="chip" style={{ justifyContent: "space-between" }}>
            <span>{shortenAddress(address)}</span>

            <div style={{ display: "flex", gap: "4px" }}>
              <button className="chip-btn" onClick={() => copy(address)}>
                복사
              </button>

              <button
                className="chip-btn"
                onClick={() => handleRemoveWhitelistAddress(address)}
              >
                삭제
              </button>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
)}

{wallet.walletType === "SSS" && (
  <div style={{ marginBottom: "20px" }}>
    <h4 style={{ marginBottom: "12px", fontSize: "14px" }}>SSS Client-side Signing</h4>

    <div className="info-box info-box--neutral" style={{ marginBottom: "12px" }}>
      private key는 서버로 저장되지 않고, 브라우저에서 signedTx 생성에만 사용됩니다.
      서버는 signedTx의 signer, recipient, value, chainId, nonce를 검증한 뒤 broadcast합니다.
    </div>

    <div className="field">
      <input
        type="password"
        className="input"
        value={sssPrivateKey}
        onChange={(e) => setSssPrivateKey(e.target.value)}
        placeholder="복구된 private key 입력"
      />
    </div>
  </div>
)}

            <div>
              <h4 style={{ marginBottom: "12px", fontSize: "14px" }}>출금 요청</h4>

              <div className="field">
                <label className="input-label">받는 주소</label>
                <input
                  type="text"
                  className="input"
                  value={toAddress}
                  onChange={(e) => setToAddress(e.target.value)}
                  placeholder="받는 주소"
                />
              </div>

              <div className="field">
                <label className="input-label">금액 (ETH)</label>
                <input
                  type="text"
                  className="input"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="금액 (ETH)"
                />
              </div>

              <div className="field">
                <label className="input-label">OTP 코드 (0.01 ETH 이상 출금 시 필요)</label>
                <input
                  type="text"
                  className="input"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="OTP 코드"
                />
              </div>

              <button className="btn btn--primary" style={{ width: "100%" }} onClick={handleWithdraw} disabled={withdrawLoading}>
                {withdrawLoading ? "출금 요청 중..." : "출금 요청"}
              </button>
            </div>

            {message && (
              <div className="alert alert--info" style={{ marginTop: "16px" }}>
                {message}
              </div>
            )}
          </div>

          {/* 오른쪽: 조회 & 활동내역 (잔액 / 출금 이력) */}
          <div className="wallet-grid__col">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "12px",
              }}
            >
              <div className="card-subtitle" style={{ marginBottom: 0 }}>
                조회 &amp; 활동내역
              </div>
              <button
                className="btn btn--ghost"
                style={{ height: "30px", padding: "0 12px" }}
                onClick={() => {
                  handleCheckBalance();
                  handleLoadWithdraws();
                }}
              >
                새로고침
              </button>
            </div>

            {balance && (
              <div
                style={{
                  marginBottom: "16px",
                  padding: "14px 16px",
                  borderRadius: "10px",
                  background: "var(--color-primary-soft)",
                  border: "1px solid var(--color-primary-border)",
                }}
              >
                <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-primary-hover)", marginBottom: "4px" }}>
                  잔액
                </div>
                <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--color-text)" }}>
                  {formatEther(balance.balanceWei)} ETH
                </div>
                <div style={{ wordBreak: "break-all", fontSize: "11.5px", color: "var(--color-text-muted)", marginTop: "2px" }}>
                  {balance.balanceWei} wei
                </div>
              </div>
            )}

            {showWithdraws && (
              <div>
                <div className="scroll-panel">
                  <WithdrawHistory items={withdraws.slice(0, visibleWithdrawCount)} />
                </div>

                {withdraws.length > 0 && (
                  <div style={{ marginTop: "8px", fontSize: "12.5px", color: "var(--color-text-muted)" }}>
                    총 {withdraws.length}개 중{" "}
                    {Math.min(visibleWithdrawCount, withdraws.length)}개 표시 중
                  </div>
                )}

                {visibleWithdrawCount < withdraws.length && (
                  <button
                    className="btn btn--secondary"
                    onClick={() => setVisibleWithdrawCount((prev) => prev + 5)}
                    style={{ marginTop: "10px" }}
                  >
                    더보기
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

    </div>

  );

}