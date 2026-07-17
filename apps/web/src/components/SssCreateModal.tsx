import { useEffect, useRef, useState } from "react";
import { registerSssWallet } from "../api/wallet";
import {
  downloadShardFile,
  generateSssWalletAndShards,
  type GeneratedSssWallet,
  type SssShardDocument,
} from "../lib/sss/sssShards";
import { shortenAddress } from "../utils/address";
import "../styles/page.css";

type Step = "intro" | "backup" | "confirm" | "registering" | "done";

type Props = {
  open: boolean;
  onClose: () => void;
  onRegistered: () => Promise<void> | void;
};

function clearGenerated(ref: { current: GeneratedSssWallet | null }) {
  if (ref.current) {
    ref.current.privateKey = "";
    ref.current.shards = [];
    ref.current = null;
  }
}

export default function SssCreateModal({ open, onClose, onRegistered }: Props) {
  const [step, setStep] = useState<Step>("intro");
  const [error, setError] = useState("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [shards, setShards] = useState<SssShardDocument[]>([]);
  const [address, setAddress] = useState("");
  const generatedRef = useRef<GeneratedSssWallet | null>(null);

  useEffect(() => {
    if (!open) {
      setStep("intro");
      setError("");
      setCopiedIndex(null);
      setBackupConfirmed(false);
      setRegistering(false);
      setShards([]);
      setAddress("");
      clearGenerated(generatedRef);
    }
  }, [open]);

  useEffect(() => {
    return () => {
      clearGenerated(generatedRef);
    };
  }, []);

  if (!open) return null;

  const handleGenerate = () => {
    setError("");
    try {
      const generated = generateSssWalletAndShards();
      generatedRef.current = generated;
      setShards(generated.shards);
      setAddress(generated.address);
      // Drop private key from React state; keep only in ref until cleared.
      generated.privateKey = "";
      setStep("backup");
    } catch {
      setError("지갑 생성에 실패했습니다. 다시 시도해주세요.");
    }
  };

  const handleCopyShard = async (shard: SssShardDocument) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(shard, null, 2));
      setCopiedIndex(shard.shareIndex);
      setTimeout(() => setCopiedIndex(null), 1500);
    } catch {
      setError("클립보드 복사에 실패했습니다.");
    }
  };

  const handleRegister = async () => {
    if (!backupConfirmed) {
      setError("샤드 백업 확인에 체크해주세요.");
      return;
    }
    if (!address) {
      setError("생성된 주소가 없습니다. 처음부터 다시 진행해주세요.");
      return;
    }

    setError("");
    setRegistering(true);
    setStep("registering");

    try {
      await registerSssWallet(address);
      clearGenerated(generatedRef);
      setShards([]);
      await onRegistered();
      setStep("done");
    } catch (err: any) {
      const status = err?.response?.status;
      const message = err?.response?.data?.message;
      if (status === 409) {
        setError(
          typeof message === "string"
            ? message
            : "이미 SSS 지갑이 존재합니다.",
        );
      } else {
        setError(
          typeof message === "string"
            ? message
            : "서버 등록에 실패했습니다. 이미 저장한 샤드를 보관하고 다시 시도하세요.",
        );
      }
      setStep("confirm");
    } finally {
      setRegistering(false);
    }
  };

  const handleClose = () => {
    clearGenerated(generatedRef);
    setShards([]);
    onClose();
  };

  return (
    <div className="modal-overlay" role="presentation" onClick={handleClose}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sss-create-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-panel__header">
          <h2 id="sss-create-title" className="card-title" style={{ fontSize: "18px" }}>
            SSS 지갑 생성
          </h2>
          <button type="button" className="btn btn--ghost" onClick={handleClose}>
            닫기
          </button>
        </div>

        {error && (
          <div className="alert alert--danger" style={{ marginBottom: "14px" }}>
            {error}
          </div>
        )}

        {step === "intro" && (
          <div>
            <div className="info-box info-box--warning" style={{ marginBottom: "16px" }}>
              <strong>중요 보안 안내</strong>
              <ul style={{ margin: "8px 0 0", paddingLeft: "18px" }}>
                <li>프라이빗 키는 브라우저에서만 생성되며 서버로 전송되지 않습니다.</li>
                <li>키는 5개 샤드로 분할되며, 그중 아무 3개로 복원할 수 있습니다.</li>
                <li>3개 이상 샤드를 한곳에 보관하면 보안 모델이 약화됩니다.</li>
                <li>샤드를 3개 이상 분실하면 서비스도 복구할 수 없습니다.</li>
                <li>샤드 자체는 암호화가 아닙니다. 안전한 장소에 분산 보관하세요.</li>
              </ul>
            </div>
            <button type="button" className="btn btn--primary" onClick={handleGenerate}>
              이해했습니다. 지갑 생성
            </button>
          </div>
        )}

        {step === "backup" && (
          <div>
            <p style={{ fontSize: "13.5px", color: "var(--color-text-muted)", marginBottom: "12px" }}>
              주소: <strong>{shortenAddress(address)}</strong>
              <br />
              아래 5개 샤드를 각각 다른 위치에 저장한 뒤 다음으로 진행하세요.
              전체 샤드 값은 이 화면에만 표시되며 서버/브라우저 저장소에 남지 않습니다.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "16px" }}>
              {shards.map((shard) => (
                <div
                  key={shard.shareIndex}
                  className="info-box info-box--neutral"
                  style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center" }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>샤드 {shard.shareIndex} / 5</div>
                    <div style={{ fontSize: "12px", color: "var(--color-text-faint)" }}>
                      파일명: sss-shard-{shard.shareIndex}-of-5-…
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn btn--secondary"
                      style={{ height: "32px", padding: "0 10px" }}
                      onClick={() => downloadShardFile(shard)}
                    >
                      다운로드
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      style={{ height: "32px", padding: "0 10px" }}
                      onClick={() => handleCopyShard(shard)}
                    >
                      {copiedIndex === shard.shareIndex ? "복사됨" : "복사"}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="btn btn--primary"
              onClick={() => setStep("confirm")}
            >
              백업 완료 — 다음
            </button>
          </div>
        )}

        {(step === "confirm" || step === "registering") && (
          <div>
            <div className="info-box info-box--neutral" style={{ marginBottom: "14px" }}>
              등록할 주소: <strong>{address}</strong>
              <br />
              서버에는 공개 주소만 전송됩니다. 샤드/프라이빗 키는 전송되지 않습니다.
              등록이 실패해도 이미 저장한 샤드를 유지한 채 재시도할 수 있습니다.
            </div>

            <label
              style={{
                display: "flex",
                gap: "8px",
                alignItems: "flex-start",
                fontSize: "13.5px",
                marginBottom: "16px",
              }}
            >
              <input
                type="checkbox"
                checked={backupConfirmed}
                onChange={(e) => setBackupConfirmed(e.target.checked)}
                disabled={registering}
              />
              <span>
                5개 샤드를 서로 다른 안전한 위치에 저장했으며, 3개 이상 분실 시 복구가
                불가능함을 이해했습니다.
              </span>
            </label>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setStep("backup")}
                disabled={registering}
              >
                백업으로 돌아가기
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleRegister}
                disabled={registering || !backupConfirmed}
              >
                {registering ? "등록 중..." : "주소 등록"}
              </button>
            </div>
          </div>
        )}

        {step === "done" && (
          <div>
            <div className="alert alert--info" style={{ marginBottom: "14px" }}>
              SSS 지갑이 등록되었습니다. 출금 시 샤드 3개로 브라우저에서 복원한 뒤
              서명하세요.
            </div>
            <button type="button" className="btn btn--primary" onClick={handleClose}>
              완료
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
