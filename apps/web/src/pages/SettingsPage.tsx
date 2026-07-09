import { useEffect, useState } from "react";
import { getMe, changePassword } from "../api/auth";
import { getWallets, getWalletLimits, getWalletWhitelist } from "../api/wallet";
import { getPreferences, updatePreferences } from "../api/settings";
import { getSystemStatus } from "../api/system";
import type { Me } from "../types/auth";
import type { Wallet, WalletLimit } from "../types/wallet";
import type { BalanceUnit, SystemStatus, UserPreference } from "../types/settings";
import {
  getNotificationCategoryPrefs,
  setNotificationCategoryPrefs,
  type NotificationCategory,
  type NotificationCategoryPrefs,
} from "../lib/notifications";
import { applyTheme, getStoredTheme, type Theme } from "../lib/theme";
import { formatEther } from "ethers";
import { shortenAddress } from "../utils/address";
import AppShell from "../components/AppShell";
import "../styles/page.css";

const SECURITY_SUMMARY: Record<string, string> = {
  BACKEND_SEC: "화이트리스트에 등록된 주소로만 출금이 가능합니다.",
  MULTISIG: "관리자 2인의 승인이 완료되어야 출금이 실행됩니다.",
  POLICY_GUARD: "1회 출금 한도를 초과하면 온체인에서 자동으로 거래가 차단됩니다.",
  KMS: "AWS KMS를 통한 인증 서명을 거쳐 출금이 수행됩니다.",
  MPC: "Dfns 기반 분산 키 서명으로 출금이 수행됩니다.",
  SSS: "3-of-5 복구 키로 복구한 서명이 있어야 1회 출금이 가능합니다.",
};

const WALLET_TYPE_LABELS: Record<string, string> = {
  BACKEND_SEC: "Backend Sec",
  MULTISIG: "Multisig",
  POLICY_GUARD: "Policy Guard",
  KMS: "KMS",
  MPC: "MPC",
  SSS: "SSS",
};

const NOTIFICATION_CATEGORY_ITEMS: { key: NotificationCategory; label: string }[] = [
  { key: "WITHDRAW_COMPLETED", label: "Withdraw Completed" },
  { key: "WITHDRAW_FAILED", label: "Withdraw Failed" },
  { key: "MULTISIG_APPROVED", label: "Multisig Approved" },
  { key: "QUEUE_FAILED", label: "Queue Failed" },
];

// 테스트 데이터 등으로 매우 큰 값(예: 24자리 wei)이 한도로 저장된 경우
// "999999999999.999999999999999999 ETH" 처럼 보기 불편한 숫자 대신 "무제한"으로 표시한다.
const UNLIMITED_THRESHOLD_ETH = 1_000_000;

function formatLimitEth(weiValue: string): string {
  const eth = Number(formatEther(weiValue));
  if (!Number.isFinite(eth) || eth >= UNLIMITED_THRESHOLD_ETH) {
    return "무제한";
  }
  return `${eth} ETH`;
}

function getStatusTone(status: string) {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "SUSPENDED":
      return "danger";
    default:
      return "gray";
  }
}

const TABS = [
  { key: "security", label: "Security" },
  { key: "account", label: "Account" },
  { key: "wallet", label: "Wallet Preferences" },
  { key: "environment", label: "API & Environment" },
  { key: "notifications", label: "Notifications" },
  { key: "about", label: "About" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function Switch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="switch">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch-track" />
    </label>
  );
}

function EnvRow({ label, connected }: { label: string; connected: boolean }) {
  return (
    <div className="settings-row">
      <div className="settings-row__text">
        <div className="settings-row__label">{label}</div>
      </div>
      <span
        style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: 600 }}
      >
        <span className={`status-dot${connected ? "" : " status-dot--danger"}`} />
        {connected ? "Connected" : "Disconnected"}
      </span>
    </div>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("security");
  const [me, setMe] = useState<Me | null>(null);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [preferences, setPreferences] = useState<UserPreference | null>(null);
  const [prefMessage, setPrefMessage] = useState("");
  const [prefSaving, setPrefSaving] = useState(false);

  const [limits, setLimits] = useState<Record<string, WalletLimit | null>>({});
  const [whitelistCount, setWhitelistCount] = useState<number | null>(null);

  const [status, setStatus] = useState<SystemStatus | null>(null);

  const [categoryPrefs, setCategoryPrefs] = useState<NotificationCategoryPrefs>(() =>
    getNotificationCategoryPrefs(),
  );

  const [theme, setTheme] = useState<Theme>(() => getStoredTheme());

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwMessage, setPwMessage] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSubmitting, setPwSubmitting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [meData, walletData, prefData, statusData] = await Promise.all([
          getMe(),
          getWallets(),
          getPreferences(),
          getSystemStatus(),
        ]);
        setMe(meData);
        setWallets(walletData);
        setPreferences(prefData);
        setStatus(statusData);

        const limitEntries = await Promise.all(
          walletData.map(async (wallet: Wallet) => {
            try {
              const limit = await getWalletLimits(wallet.id);
              return [wallet.id, limit] as const;
            } catch {
              return [wallet.id, null] as const;
            }
          }),
        );
        setLimits(Object.fromEntries(limitEntries));

        const backendSecWallet = walletData.find((w: Wallet) => w.walletType === "BACKEND_SEC");
        if (backendSecWallet) {
          try {
            const whitelist = await getWalletWhitelist(backendSecWallet.id);
            setWhitelistCount(whitelist.length);
          } catch {
            setWhitelistCount(null);
          }
        }
      } catch (err: any) {
        setError(err?.response?.data?.message || "설정 정보 조회 실패");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const savePreferences = async (patch: Partial<UserPreference>) => {
    if (!preferences) return;

    const optimistic = { ...preferences, ...patch };
    setPreferences(optimistic);
    setPrefSaving(true);
    setPrefMessage("");

    try {
      const updated = await updatePreferences({
        defaultWalletId: optimistic.defaultWalletId,
        balanceUnit: optimistic.balanceUnit,
        autoRefreshEnabled: optimistic.autoRefreshEnabled,
        inAppNotifications: optimistic.inAppNotifications,
        emailNotifications: optimistic.emailNotifications,
      });
      setPreferences(updated);
      setPrefMessage("저장되었습니다.");
    } catch (err: any) {
      setPrefMessage(err?.response?.data?.message || "저장 실패");
    } finally {
      setPrefSaving(false);
    }
  };

  const toggleCategory = (key: NotificationCategory) => {
    const next = { ...categoryPrefs, [key]: !categoryPrefs[key] };
    setCategoryPrefs(next);
    setNotificationCategoryPrefs(next);
  };

  const handleToggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  };

  const handleChangePassword = async () => {
    setPwMessage("");
    setPwError("");

    if (newPassword.length < 4) {
      setPwError("새 비밀번호는 4자 이상이어야 합니다.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("새 비밀번호가 일치하지 않습니다.");
      return;
    }
    if (newPassword === currentPassword) {
      setPwError("새 비밀번호는 현재 비밀번호와 달라야 합니다.");
      return;
    }

    setPwSubmitting(true);
    try {
      const data = await changePassword(currentPassword, newPassword);
      setPwMessage(data.message || "비밀번호가 변경되었습니다.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setPwError(err?.response?.data?.message || "비밀번호 변경 실패");
    } finally {
      setPwSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="loading-screen">불러오는 중...</div>
      </AppShell>
    );
  }

  const hasBackendSecWallet = wallets.some((w) => w.walletType === "BACKEND_SEC");
  const representativeWallet =
    wallets.find((w) => w.id === preferences?.defaultWalletId) ?? wallets[0];
  const representativeLimit = representativeWallet ? limits[representativeWallet.id] : null;

  return (
    <AppShell>
      <div className="page">
        <header className="page__header">
          <div>
            <h1 className="page__title">Settings</h1>
            <p className="page__subtitle">계정, 보안, 지갑 환경설정을 관리하세요.</p>
          </div>
        </header>

        <div className="tab-group settings-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`tab${activeTab === tab.key ? " is-active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "security" && (
          <>
            <div className="card section-card">
              <div className="section-header">
                <h2>Security Settings</h2>
              </div>

              <div className="settings-row">
                <div className="settings-row__text">
                  <div className="settings-row__label">OTP Authentication</div>
                  <div className="settings-row__desc">0.01 ETH 이상 고액 출금 시 OTP 인증이 필요합니다.</div>
                </div>
                <span className={`badge badge--${status?.otpConfigured ? "success" : "gray"}`}>
                  {status?.otpConfigured ? "Enabled" : "미설정"}
                </span>
              </div>

              <div className="settings-row">
                <div className="settings-row__text">
                  <div className="settings-row__label">Daily Withdraw Limit</div>
                  <div className="settings-row__desc">
                    {representativeWallet
                      ? `기본 지갑(${WALLET_TYPE_LABELS[representativeWallet.walletType] ?? representativeWallet.walletType}) 기준`
                      : "보유한 지갑이 없습니다."}
                  </div>
                </div>
                <span style={{ fontSize: "14px", fontWeight: 700 }}>
                  {representativeLimit ? formatLimitEth(representativeLimit.dailyLimit) : "설정 안됨"}
                </span>
              </div>

              <div className="settings-row">
                <div className="settings-row__text">
                  <div className="settings-row__label">Single Transaction Limit</div>
                  <div className="settings-row__desc">
                    {representativeWallet
                      ? `기본 지갑(${WALLET_TYPE_LABELS[representativeWallet.walletType] ?? representativeWallet.walletType}) 기준`
                      : "보유한 지갑이 없습니다."}
                  </div>
                </div>
                <span style={{ fontSize: "14px", fontWeight: 700 }}>
                  {representativeLimit ? formatLimitEth(representativeLimit.singleTxLimit) : "설정 안됨"}
                </span>
              </div>

              <div className="settings-row">
                <div className="settings-row__text">
                  <div className="settings-row__label">Address Whitelist</div>
                  <div className="settings-row__desc">BACKEND_SEC 지갑의 화이트리스트 등록 여부입니다.</div>
                </div>
                {!hasBackendSecWallet ? (
                  <span className="badge badge--gray">N/A</span>
                ) : whitelistCount && whitelistCount > 0 ? (
                  <span className="badge badge--success">Enabled ({whitelistCount})</span>
                ) : (
                  <span className="badge badge--warning">미설정</span>
                )}
              </div>

              <div className="settings-row">
                <div className="settings-row__text">
                  <div className="settings-row__label">Email Verification</div>
                  <div className="settings-row__desc">계정 이메일 인증 상태입니다.</div>
                </div>
                <span className={`badge badge--${me?.status === "ACTIVE" ? "success" : "warning"}`}>
                  {me?.status === "ACTIVE" ? "Verified" : "Pending"}
                </span>
              </div>
            </div>

            <div className="card section-card">
              <div className="section-header">
                <h2>지갑별 상세 보안 설정</h2>
              </div>

              {wallets.length === 0 ? (
                <p className="empty-state">보유한 지갑이 없습니다.</p>
              ) : (
                <div className="history-list">
                  {wallets.map((wallet) => {
                    const limit = limits[wallet.id];
                    return (
                      <div key={wallet.id} className="history-row">
                        <div className="history-row__top">
                          <span className="history-row__amount">
                            {WALLET_TYPE_LABELS[wallet.walletType] ?? wallet.walletType}
                          </span>
                          <span className="badge badge--gray">{shortenAddress(wallet.address)}</span>
                        </div>
                        <div style={{ fontSize: "12.5px", color: "var(--color-text-muted)", marginBottom: "8px" }}>
                          {SECURITY_SUMMARY[wallet.walletType] ?? "보안 방식 설명이 등록되지 않았습니다."}
                        </div>
                        <div className="history-row__meta">
                          <div>
                            <span className="history-row__meta-label">1회 출금 한도</span>
                            {limit ? formatLimitEth(limit.singleTxLimit) : "설정 안됨"}
                          </div>
                          <div>
                            <span className="history-row__meta-label">1일 출금 한도</span>
                            {limit ? formatLimitEth(limit.dailyLimit) : "설정 안됨"}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="card section-card">
              <div className="section-header">
                <h2>2단계 인증 (2FA)</h2>
                <span className="badge badge--gray">준비중</span>
              </div>
              <p style={{ fontSize: "13px", color: "var(--color-text-muted)", marginBottom: "14px" }}>
                현재는 고액 출금 시 전 계정 공용 OTP를 사용합니다. 계정별 개인 OTP 등록 기능은 준비 중입니다.
              </p>
              <div className="settings-row">
                <div className="settings-row__text">
                  <div className="settings-row__label">계정 2FA 사용</div>
                  <div className="settings-row__desc">Google Authenticator 등으로 개인 OTP를 등록합니다.</div>
                </div>
                <Switch checked={false} onChange={() => {}} disabled />
              </div>
            </div>
          </>
        )}

        {activeTab === "account" && (
          <>
            <div className="card section-card">
              <div className="section-header">
                <h2>Account</h2>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "20px" }}>
                <span
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "999px",
                    background: "var(--color-primary-soft)",
                    color: "var(--color-primary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "18px",
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {me?.email ? me.email.charAt(0).toUpperCase() : "?"}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "15px", fontWeight: 700, overflowWrap: "anywhere" }}>
                    {me?.email ?? "-"}
                  </div>
                  <div style={{ display: "flex", gap: "6px", marginTop: "6px", flexWrap: "wrap" }}>
                    {me?.role && <span className="badge badge--primary">{me.role}</span>}
                    {me?.status && (
                      <span className={`badge badge--${getStatusTone(me.status)}`}>{me.status}</span>
                    )}
                  </div>
                </div>
              </div>

              <hr className="divider" style={{ margin: "0 0 20px" }} />

              <div className="history-row__meta" style={{ fontSize: "13px" }}>
                <div>
                  <span className="history-row__meta-label">Email</span>
                  {me?.email ?? "-"}
                </div>
                <div>
                  <span className="history-row__meta-label">Role</span>
                  {me?.role ?? "-"}
                </div>
                <div>
                  <span className="history-row__meta-label">Status</span>
                  {me?.status ?? "-"}
                </div>
                <div>
                  <span className="history-row__meta-label">Created</span>
                  {me?.createdAt ? new Date(me.createdAt).toLocaleDateString() : "-"}
                </div>
              </div>
            </div>

            <div className="card section-card">
              <div className="section-header">
                <h2>비밀번호 변경</h2>
              </div>

              <div className="field">
                <label className="input-label">현재 비밀번호</label>
                <input
                  type="password"
                  className="input"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="현재 비밀번호"
                />
              </div>

              <div className="field">
                <label className="input-label">새 비밀번호 (4자 이상)</label>
                <input
                  type="password"
                  className="input"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="새 비밀번호"
                />
              </div>

              <div className="field">
                <label className="input-label">새 비밀번호 확인</label>
                <input
                  type="password"
                  className="input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="새 비밀번호 확인"
                />
              </div>

              <button
                className="btn btn--primary"
                onClick={handleChangePassword}
                disabled={pwSubmitting || !currentPassword || !newPassword}
              >
                {pwSubmitting ? "변경 중..." : "비밀번호 변경"}
              </button>

              {pwMessage && <div className="alert alert--info">{pwMessage}</div>}
              {pwError && <div className="alert alert--danger">{pwError}</div>}
            </div>
          </>
        )}

        {activeTab === "wallet" && preferences && (
          <div className="card section-card">
            <div className="section-header">
              <h2>Wallet Preferences</h2>
            </div>

            <div className="field">
              <label className="input-label">Default Network</label>
              <select className="input" value="sepolia" disabled>
                <option value="sepolia">Ethereum Sepolia</option>
              </select>
            </div>

            <div className="field">
              <label className="input-label">Default Wallet Type</label>
              <select
                className="input"
                value={preferences.defaultWalletId ?? ""}
                onChange={(e) => savePreferences({ defaultWalletId: e.target.value || null })}
              >
                <option value="">선택 안 함</option>
                {wallets.map((wallet) => (
                  <option key={wallet.id} value={wallet.id}>
                    {WALLET_TYPE_LABELS[wallet.walletType] ?? wallet.walletType}
                  </option>
                ))}
              </select>
            </div>

            <div className="settings-row">
              <div className="settings-row__text">
                <div className="settings-row__label">Auto Refresh</div>
                <div className="settings-row__desc">
                  지갑 카드의 잔액/출금 이력을 {"20"}초마다 자동으로 새로고침합니다.
                </div>
              </div>
              <Switch
                checked={preferences.autoRefreshEnabled}
                onChange={(next) => savePreferences({ autoRefreshEnabled: next })}
              />
            </div>

            <div className="settings-row">
              <div className="settings-row__text">
                <div className="settings-row__label">잔액 표시 단위</div>
              </div>
              <div className="tab-group" style={{ marginBottom: 0 }}>
                {(["ETH", "WEI"] as BalanceUnit[]).map((unit) => (
                  <button
                    key={unit}
                    type="button"
                    className={`tab${preferences.balanceUnit === unit ? " is-active" : ""}`}
                    onClick={() => savePreferences({ balanceUnit: unit })}
                  >
                    {unit}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-row">
              <div className="settings-row__text">
                <div className="settings-row__label">Theme</div>
              </div>
              <button type="button" className="btn btn--secondary" onClick={handleToggleTheme}>
                {theme === "dark" ? "🌙 Dark" : "☀️ Light"}
              </button>
            </div>

            {prefSaving && <div style={{ fontSize: "12px", color: "var(--color-text-faint)" }}>저장 중...</div>}
            {!prefSaving && prefMessage && (
              <div className="alert alert--info" style={{ marginTop: "12px" }}>
                {prefMessage}
              </div>
            )}
          </div>
        )}

        {activeTab === "environment" && (
          <div className="card section-card">
            <div className="section-header">
              <h2>API &amp; Environment</h2>
            </div>

            {status ? (
              <>
                <EnvRow label="Backend" connected={status.backendOnline} />
                <EnvRow label="Database" connected={status.dbConnected} />
                <EnvRow label="WebSocket" connected={status.websocketConnected} />
                <EnvRow label="Sepolia RPC" connected={status.sepoliaRpcConnected} />
                <EnvRow label="DFNS" connected={status.dfnsConnected} />
                <EnvRow label="AWS KMS" connected={status.awsKmsConnected} />

                <hr className="divider" style={{ margin: "16px 0" }} />

                <div className="history-row__meta" style={{ fontSize: "13px" }}>
                  <div>
                    <span className="history-row__meta-label">네트워크</span>
                    {status.network}
                  </div>
                  <div>
                    <span className="history-row__meta-label">서버 시각</span>
                    {new Date(status.serverTime).toLocaleString()}
                  </div>
                </div>
              </>
            ) : (
              <p className="empty-state">불러오는 중...</p>
            )}
          </div>
        )}

        {activeTab === "notifications" && preferences && (
          <>
            <div className="card section-card">
              <div className="section-header">
                <h2>Notifications</h2>
              </div>

              <div className="settings-row">
                <div className="settings-row__text">
                  <div className="settings-row__label">인앱 알림</div>
                  <div className="settings-row__desc">출금 상태가 변경되면 사이드바 알림으로 표시합니다.</div>
                </div>
                <Switch
                  checked={preferences.inAppNotifications}
                  onChange={(next) => savePreferences({ inAppNotifications: next })}
                />
              </div>

              <div className="settings-row">
                <div className="settings-row__text">
                  <div className="settings-row__label">
                    이메일 알림 <span className="badge badge--gray">준비중</span>
                  </div>
                  <div className="settings-row__desc">
                    출금 완료/실패 시 이메일로 알려드립니다. (실제 발송 기능은 준비 중입니다)
                  </div>
                </div>
                <Switch
                  checked={preferences.emailNotifications}
                  onChange={(next) => savePreferences({ emailNotifications: next })}
                />
              </div>

              {prefSaving && <div style={{ fontSize: "12px", color: "var(--color-text-faint)" }}>저장 중...</div>}
              {!prefSaving && prefMessage && (
                <div className="alert alert--info" style={{ marginTop: "12px" }}>
                  {prefMessage}
                </div>
              )}
            </div>

            <div className="card section-card">
              <div className="section-header">
                <h2>알림 유형</h2>
              </div>
              <p style={{ fontSize: "12.5px", color: "var(--color-text-muted)", marginBottom: "6px" }}>
                인앱 알림이 켜져 있을 때, 아래 유형의 출금 상태 변경만 골라서 받아볼 수 있습니다.
              </p>

              {NOTIFICATION_CATEGORY_ITEMS.map((item) => (
                <div className="settings-row" key={item.key}>
                  <div className="settings-row__text">
                    <div className="settings-row__label">{item.label}</div>
                  </div>
                  <Switch checked={categoryPrefs[item.key]} onChange={() => toggleCategory(item.key)} />
                </div>
              ))}
            </div>
          </>
        )}

        {activeTab === "about" && (
          <div className="card section-card">
            <div className="section-header">
              <h2>정보</h2>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "18px" }}>
              <span
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "10px",
                  background: "var(--color-primary)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: "14px",
                }}
              >
                CS
              </span>
              <div>
                <div style={{ fontWeight: 700, fontSize: "15px" }}>Custody Vault</div>
                <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
                  Security Wallet Demo · v1.0.0
                </div>
              </div>
            </div>

            <hr className="divider" style={{ margin: "0 0 18px" }} />

            <div className="card-subtitle" style={{ marginBottom: "10px" }}>기술 스택</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "20px" }}>
              {["React", "TypeScript", "Vite", "NestJS", "Prisma", "PostgreSQL", "Ethers.js", "Socket.IO"].map(
                (tech) => (
                  <span key={tech} className="chip">
                    {tech}
                  </span>
                ),
              )}
            </div>

            <div className="history-row__meta" style={{ fontSize: "13px" }}>
              <div>
                <span className="history-row__meta-label">네트워크</span>
                Sepolia Testnet
              </div>
              <div>
                <span className="history-row__meta-label">보유 지갑 수</span>
                {wallets.length}개
              </div>
            </div>
          </div>
        )}

        {error && <div className="alert alert--danger">{error}</div>}
      </div>
    </AppShell>
  );
}
