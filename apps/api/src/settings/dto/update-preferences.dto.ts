import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdatePreferencesDto {
  @IsOptional()
  @IsString()
  defaultWalletId?: string | null;

  @IsOptional()
  @IsIn(['ETH', 'WEI'])
  balanceUnit?: 'ETH' | 'WEI';

  @IsOptional()
  @IsBoolean()
  autoRefreshEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  inAppNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;
}
