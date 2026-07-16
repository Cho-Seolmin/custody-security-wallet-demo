import { IsOptional, IsString, Matches } from 'class-validator';

export class WithdrawDto {
  @IsString()
  @Matches(/^0x[0-9a-fA-F]{40}$/, {
    message: 'toAddress must be a valid Ethereum address',
  })
  toAddress!: string;

  @IsString()
  @Matches(/^\d+$/, { message: 'amount must be a wei amount (digits only)' })
  amount!: string;

  @IsOptional()
  @IsString()
  otpCode?: string;

  @IsOptional()
  @IsString()
  signedTx?: string;
}
