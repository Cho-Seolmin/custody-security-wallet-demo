export type AppNotification = {
  id: string;
  message: string;
  createdAt: string;
  walletId?: string;
};

const STORAGE_KEY = "custody-wallet-notifications";
const MAX_ITEMS = 30;

export function getStoredNotifications(): AppNotification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addStoredNotification(notification: AppNotification): AppNotification[] {
  const next = [notification, ...getStoredNotifications()].slice(0, MAX_ITEMS);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 저장 실패는 무시 (프라이빗 모드 등)
  }
  return next;
}

export function clearStoredNotifications(): AppNotification[] {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 저장 실패는 무시
  }
  return [];
}

export type NotificationCategory =
  | "WITHDRAW_COMPLETED"
  | "WITHDRAW_FAILED"
  | "MULTISIG_APPROVED"
  | "QUEUE_FAILED";

export type NotificationCategoryPrefs = Record<NotificationCategory, boolean>;

const CATEGORY_STORAGE_KEY = "custody-wallet-notification-categories";

const DEFAULT_CATEGORY_PREFS: NotificationCategoryPrefs = {
  WITHDRAW_COMPLETED: true,
  WITHDRAW_FAILED: true,
  MULTISIG_APPROVED: true,
  QUEUE_FAILED: true,
};

export function getNotificationCategoryPrefs(): NotificationCategoryPrefs {
  if (typeof window === "undefined") return DEFAULT_CATEGORY_PREFS;
  try {
    const raw = window.localStorage.getItem(CATEGORY_STORAGE_KEY);
    return raw ? { ...DEFAULT_CATEGORY_PREFS, ...JSON.parse(raw) } : { ...DEFAULT_CATEGORY_PREFS };
  } catch {
    return { ...DEFAULT_CATEGORY_PREFS };
  }
}

export function setNotificationCategoryPrefs(prefs: NotificationCategoryPrefs) {
  try {
    window.localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // 저장 실패는 무시
  }
}

// WithdrawStatus 값을 알림 유형 체크박스 카테고리로 매핑.
// 매핑되지 않는 상태(PENDING/QUEUED/PROCESSING/REJECTED)는 항상 알림을 표시한다.
export function statusToCategory(status: string): NotificationCategory | null {
  switch (status) {
    case "EXECUTED":
      return "WITHDRAW_COMPLETED";
    case "FAILED":
      return "WITHDRAW_FAILED";
    case "APPROVED":
      return "MULTISIG_APPROVED";
    case "EXPIRED":
      return "QUEUE_FAILED";
    default:
      return null;
  }
}
