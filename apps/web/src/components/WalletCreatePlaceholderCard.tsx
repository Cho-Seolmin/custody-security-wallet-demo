import type { CreatableWalletConfig } from "../constants/creatableWallets";
import "../styles/page.css";

type Props = {
  config: CreatableWalletConfig;
  loading?: boolean;
  notice?: string;
  onCreatePlaceholder: (walletType: CreatableWalletConfig["type"]) => void;
};

export default function WalletCreatePlaceholderCard({
  config,
  loading = false,
  notice,
  onCreatePlaceholder,
}: Props) {
  return (
    <div
      className="card"
      style={{
        opacity: 0.85,
        borderStyle: "dashed",
        overflowWrap: "break-word",
        wordBreak: "break-word",
      }}
    >
      <div style={{ marginBottom: "16px" }}>
        <div className="card-title">{config.title}</div>
        <div
          style={{
            fontSize: "12px",
            color: "var(--color-text-faint)",
            marginTop: "4px",
          }}
        >
          {config.type}
        </div>
      </div>

      <p
        style={{
          margin: "0 0 20px",
          fontSize: "13.5px",
          lineHeight: 1.6,
          color: "var(--color-text-muted)",
        }}
      >
        {config.description}
      </p>

      {notice && (
        <div className="alert alert--info" style={{ marginBottom: "14px" }}>
          {notice}
        </div>
      )}

      <button
        type="button"
        className="btn btn--primary"
        disabled={loading}
        onClick={() => onCreatePlaceholder(config.type)}
      >
        {loading ? "생성 중..." : config.buttonLabel}
      </button>
    </div>
  );
}
