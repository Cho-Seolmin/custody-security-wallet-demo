import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  createBackendSecWallet,
  createMultisigWallet,
  getWallets,
} from "../api/wallet";
import { getPreferences } from "../api/settings";
import type { Wallet } from "../types/wallet";
import { CREATABLE_WALLET_TYPES, PLACEHOLDER_ONLY_MESSAGES } from "../constants/creatableWallets";
import type { CreatableWalletConfig } from "../constants/creatableWallets";
import WalletCard from "../components/WalletCard";
import WalletCreatePlaceholderCard from "../components/WalletCreatePlaceholderCard";
import SssCreateModal from "../components/SssCreateModal";
import "../styles/page.css";

const CREATE_SUCCESS_MESSAGE: Partial<
  Record<CreatableWalletConfig["type"], string>
> = {
  BACKEND_SEC: "백엔드 보안 지갑이 생성되었습니다.",
  MULTISIG: "멀티시그 지갑이 생성되었습니다.",
  SSS: "SSS 지갑이 생성되었습니다.",
};

const CREATE_CONFLICT_FALLBACK: Partial<
  Record<CreatableWalletConfig["type"], string>
> = {
  BACKEND_SEC: "이미 BACKEND_SEC 지갑이 존재합니다.",
  MULTISIG: "이미 MULTISIG 지갑이 존재합니다.",
  SSS: "이미 SSS 지갑이 존재합니다.",
};

export default function WalletsPage() {
  const navigate = useNavigate();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [listError, setListError] = useState("");
  const [actionError, setActionError] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState("");
  const [creatingType, setCreatingType] = useState<
    CreatableWalletConfig["type"] | null
  >(null);
  const [sssCreateOpen, setSssCreateOpen] = useState(false);
  const [placeholderNotices, setPlaceholderNotices] = useState<
    Partial<Record<CreatableWalletConfig["type"], string>>
  >({});
  const [searchParams] = useSearchParams();
  const selectedWalletId = searchParams.get("walletId");
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setListError("");
        setActionError("");
        setActionMessage("");

        const [data, preferences] = await Promise.all([
          getWallets(),
          getPreferences().catch(() => null),
        ]);
        setWallets(data);

        if (!selectedWalletId && preferences?.defaultWalletId) {
          const hasDefault = data.some(
            (wallet: Wallet) => wallet.id === preferences.defaultWalletId,
          );

          if (hasDefault) {
            navigate(`/wallets?walletId=${preferences.defaultWalletId}`, {
              replace: true,
            });
          }
        }
      } catch (err: any) {
        setListError(err?.response?.data?.message || "지갑 목록 조회 실패");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [navigate, selectedWalletId]);

  useEffect(() => {
    if (!selectedWalletId) return;

    const target = cardRefs.current[selectedWalletId];
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedWalletId, wallets]);

  const refreshWallets = async () => {
    const data = await getWallets();
    setWallets(data);
    return data;
  };

  const handleWalletCreatePlaceholder = async (
    walletType: CreatableWalletConfig["type"],
  ) => {
    setActionMessage("");
    setActionError("");

    const placeholderMessage = PLACEHOLDER_ONLY_MESSAGES[walletType];
    if (placeholderMessage) {
      // Show notice on the clicked card (top-of-page alert is easy to miss).
      setPlaceholderNotices((prev) => ({
        ...prev,
        [walletType]: placeholderMessage,
      }));
      setActionMessage(placeholderMessage);
      return;
    }

    if (walletType === "SSS") {
      setSssCreateOpen(true);
      return;
    }

    if (creatingType) return;

    if (walletType !== "BACKEND_SEC" && walletType !== "MULTISIG") {
      setActionMessage("지갑 생성 기능은 다음 단계에서 연결됩니다.");
      return;
    }

    const createFn =
      walletType === "BACKEND_SEC"
        ? createBackendSecWallet
        : createMultisigWallet;

    try {
      setCreatingType(walletType);
      await createFn();
      await refreshWallets();
      setActionMessage(
        CREATE_SUCCESS_MESSAGE[walletType] ?? "지갑이 생성되었습니다.",
      );
    } catch (err: any) {
      const status = err?.response?.status;
      const message = err?.response?.data?.message;

      if (status === 409) {
        setActionError(
          typeof message === "string"
            ? message
            : (CREATE_CONFLICT_FALLBACK[walletType] ??
                "이미 해당 유형의 지갑이 존재합니다."),
        );
        try {
          await refreshWallets();
        } catch {
          /* ignore refresh failure after conflict */
        }
      } else {
        setActionError(
          typeof message === "string"
            ? message
            : "지갑 생성에 실패했습니다. 잠시 후 다시 시도해주세요.",
        );
      }
    } finally {
      setCreatingType(null);
    }
  };

  if (loading) {
    return <div className="loading-screen">불러오는 중...</div>;
  }

  const missingCreatableTypes = !listError
    ? CREATABLE_WALLET_TYPES.filter(
        (config) =>
          !wallets.some((wallet) => wallet.walletType === config.type),
      )
    : [];

  return (
    <div className="page">
        <header className="page__header">
          <div>
            <h1 className="page__title">Wallets</h1>
            <p className="page__subtitle">
              보유 중인 모든 지갑을 한 번에 확인하고 관리하세요.
            </p>
          </div>
        </header>

        {listError && <div className="alert alert--danger">{listError}</div>}
        {actionError && <div className="alert alert--danger">{actionError}</div>}

        {actionMessage && (
          <div className="alert alert--info" style={{ marginBottom: "20px" }}>
            {actionMessage}
          </div>
        )}

        {!listError &&
          wallets.length === 0 &&
          missingCreatableTypes.length === 0 && (
            <div className="card section-card">등록된 지갑이 없습니다.</div>
          )}

        {wallets.map((wallet) => (
          <div
            key={wallet.id}
            ref={(el) => {
              cardRefs.current[wallet.id] = el;
            }}
            className="section-card"
            style={
              wallet.id === selectedWalletId
                ? {
                    borderRadius: "16px",
                    boxShadow: "0 0 0 2px var(--color-primary)",
                    transition: "box-shadow 0.2s ease",
                  }
                : undefined
            }
          >
            <WalletCard wallet={wallet} />
          </div>
        ))}

        {missingCreatableTypes.map((config) => (
          <div key={`create-placeholder-${config.type}`} className="section-card">
            <WalletCreatePlaceholderCard
              config={config}
              loading={creatingType === config.type}
              notice={placeholderNotices[config.type]}
              onCreatePlaceholder={handleWalletCreatePlaceholder}
            />
          </div>
        ))}

        <SssCreateModal
          open={sssCreateOpen}
          onClose={() => setSssCreateOpen(false)}
          onRegistered={async () => {
            await refreshWallets();
            setActionMessage(CREATE_SUCCESS_MESSAGE.SSS ?? "SSS 지갑이 생성되었습니다.");
          }}
        />
      </div>
  );
}
