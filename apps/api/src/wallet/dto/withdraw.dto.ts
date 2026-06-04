export class WithdrawDto {
  toAddress!: string;
  amount!: string;

  otpCode?: string;
}