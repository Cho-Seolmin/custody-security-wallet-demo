import { IsString, Matches } from 'class-validator';

export class UpdateLimitsDto {
  @IsString()
  @Matches(/^\d+$/, {
    message: 'dailyLimit must be a wei amount (digits only)',
  })
  dailyLimit!: string; // wei string

  @IsString()
  @Matches(/^\d+$/, {
    message: 'singleTxLimit must be a wei amount (digits only)',
  })
  singleTxLimit!: string; // wei string
}
