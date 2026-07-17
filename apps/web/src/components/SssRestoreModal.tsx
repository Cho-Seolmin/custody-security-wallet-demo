import { useEffect, useState } from "react";
import {
  parseSssShardText,
  reconstructPrivateKeyFromShards,
  shardFromLegacyHex,
  SSS_THRESHOLD,
  type SssShardDocument,
} from "../lib/sss/sssShards";
import { SSS_DEMO_RECOVERY_DOC_URL } from "../constants/sssDemoRecovery";
import { shortenAddress } from "../utils/address";
import "../styles/page.css";

type Props = {
  open: boolean;
  expectedAddress: string;
  onClose: () => void;
  onRestored: (privateKey: string, address: string) => void;
};

export default function SssRestoreModal({
  open,
  expectedAddress,
  onClose,
  onRestored,
}: Props) {
  const [shards, setShards] = useState<SssShardDocument[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [legacyHexText, setLegacyHexText] = useState("");
  const [error, setError] = useState("");
  const [restoredAddress, setRestoredAddress] = useState("");

  useEffect(() => {
    if (!open) {
      setShards([]);
      setPasteText("");
      setLegacyHexText("");
      setError("");
      setRestoredAddress("");
    }
  }, [open]);

  if (!open) return null;

  const clearShards = () => {
    setShards([]);
    setRestoredAddress("");
    setError("");
  };

  const addShard = (shard: SssShardDocument) => {
    if (shards.some((s) => s.shareIndex === shard.shareIndex)) {
      throw new Error("동일한 샤드 인덱스가 이미 추가되어 있습니다.");
    }
    if (
      shards.length > 0 &&
      shards[0].walletAddress.toLowerCase() !== shard.walletAddress.toLowerCase()
    ) {
      throw new Error("서로 다른 지갑의 샤드가 섞여 있습니다.");
    }
    setShards((prev) =>
      [...prev, shard].sort((a, b) => a.shareIndex - b.shareIndex),
    );
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError("");
    try {
      for (const file of Array.from(files)) {
        const text = await file.text();
        addShard(parseSssShardText(text));
      }
    } catch (err: any) {
      setError(err?.message || "샤드 파일 불러오기에 실패했습니다.");
    }
  };

  const handlePasteAdd = () => {
    setError("");
    try {
      addShard(parseSssShardText(pasteText));
      setPasteText("");
    } catch (err: any) {
      setError(err?.message || "샤드 붙여넣기에 실패했습니다.");
    }
  };

  const handleLegacyHexAdd = () => {
    setError("");
    try {
      const lines = legacyHexText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length === 0) {
        throw new Error("hex 샤드 줄을 입력해주세요.");
      }
      const next = [...shards];
      lines.forEach((line, i) => {
        const shard = shardFromLegacyHex(
          line,
          next.length + i + 1,
          expectedAddress,
        );
        if (next.some((s) => s.shareIndex === shard.shareIndex)) {
          throw new Error("동일한 샤드 인덱스가 이미 추가되어 있습니다.");
        }
        next.push(shard);
      });
      setShards(next.sort((a, b) => a.shareIndex - b.shareIndex));
      setLegacyHexText("");
    } catch (err: any) {
      setError(err?.message || "레거시 hex 샤드 추가에 실패했습니다.");
    }
  };

  const handleRestore = () => {
    setError("");
    try {
      const result = reconstructPrivateKeyFromShards(shards, expectedAddress);
      setRestoredAddress(result.address);
      onRestored(result.privateKey, result.address);
      setShards([]);
      setPasteText("");
      setLegacyHexText("");
    } catch (err: any) {
      setError(err?.message || "복원에 실패했습니다.");
    }
  };

  const handleClose = () => {
    clearShards();
    onClose();
  };

  return (
    <div className="modal-overlay" role="presentation" onClick={handleClose}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sss-restore-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-panel__header">
          <h2 id="sss-restore-title" className="card-title" style={{ fontSize: "18px" }}>
            SSS 샤드 복원
          </h2>
          <button type="button" className="btn btn--ghost" onClick={handleClose}>
            닫기
          </button>
        </div>

        <p style={{ fontSize: "13.5px", color: "var(--color-text-muted)", marginBottom: "12px" }}>
          등록된 주소: <strong>{shortenAddress(expectedAddress)}</strong>
          <br />
          서로 다른 샤드 {SSS_THRESHOLD}개 이상을 불러와 브라우저에서만 복원합니다.
          샤드/프라이빗 키는 서버로 전송되지 않습니다.
        </p>

        {error && (
          <div className="alert alert--danger" style={{ marginBottom: "14px" }}>
            {error}
          </div>
        )}

        {restoredAddress ? (
          <div>
            <div className="alert alert--info" style={{ marginBottom: "14px" }}>
              복원 성공: {shortenAddress(restoredAddress)}
              <br />
              출금 서명이 가능한 상태입니다. 출금 요청 후 키는 자동으로 지워집니다.
            </div>
            <button type="button" className="btn btn--primary" onClick={handleClose}>
              출금으로 이동
            </button>
          </div>
        ) : (
          <div>
            <div className="field">
              <label className="input-label" htmlFor="sss-shard-files">
                샤드 JSON 파일 선택
              </label>
              <input
                id="sss-shard-files"
                type="file"
                accept="application/json,.json"
                multiple
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>

            <div className="field">
              <label className="input-label" htmlFor="sss-shard-paste">
                또는 샤드 JSON 붙여넣기
              </label>
              <textarea
                id="sss-shard-paste"
                className="input"
                style={{ height: "96px", padding: "10px 14px", resize: "vertical" }}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder='{"version":1,"scheme":"shamir-secret-sharing",...}'
              />
              <button
                type="button"
                className="btn btn--secondary"
                style={{ marginTop: "8px" }}
                onClick={handlePasteAdd}
                disabled={!pasteText.trim()}
              >
                샤드 추가
              </button>
            </div>

            <div className="field">
              <label className="input-label" htmlFor="sss-legacy-hex">
                레거시/데모 hex 샤드 (줄당 1개)
              </label>
              <textarea
                id="sss-legacy-hex"
                className="input"
                style={{ height: "84px", padding: "10px 14px", resize: "vertical" }}
                value={legacyHexText}
                onChange={(e) => setLegacyHexText(e.target.value)}
                placeholder="0801a681... (오프라인 데모 도구 형식)"
              />
              <div
                style={{
                  marginTop: "8px",
                  display: "flex",
                  gap: "8px",
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={handleLegacyHexAdd}
                  disabled={!legacyHexText.trim()}
                >
                  hex 샤드 추가
                </button>
                <a
                  href={SSS_DEMO_RECOVERY_DOC_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: "12.5px", fontWeight: 600 }}
                >
                  기존 데모 샤드 가이드
                </a>
              </div>
            </div>

            <div style={{ marginBottom: "14px" }}>
              <div style={{ fontSize: "12.5px", fontWeight: 600, marginBottom: "8px" }}>
                선택된 샤드 ({shards.length}/{SSS_THRESHOLD}+)
              </div>
              {shards.length === 0 && (
                <div className="info-box info-box--neutral">아직 추가된 샤드가 없습니다.</div>
              )}
              {shards.map((shard) => (
                <div
                  key={shard.shareIndex}
                  className="info-box info-box--neutral"
                  style={{
                    marginBottom: "8px",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "8px",
                    alignItems: "center",
                  }}
                >
                  <span>
                    샤드 #{shard.shareIndex} · {shortenAddress(shard.walletAddress)}
                  </span>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    style={{ height: "28px", padding: "0 10px" }}
                    onClick={() =>
                      setShards((prev) =>
                        prev.filter((s) => s.shareIndex !== shard.shareIndex),
                      )
                    }
                  >
                    제거
                  </button>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button type="button" className="btn btn--ghost" onClick={clearShards}>
                초기화
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleRestore}
                disabled={shards.length < SSS_THRESHOLD}
              >
                로컬 복원 및 주소 검증
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
