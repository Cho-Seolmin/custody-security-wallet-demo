export class UpdatePreferencesDto {
  defaultWalletId?: string | null;
  balanceUnit?: "ETH" | "WEI";
  autoRefreshEnabled?: boolean;
  inAppNotifications?: boolean;
  emailNotifications?: boolean;
}
