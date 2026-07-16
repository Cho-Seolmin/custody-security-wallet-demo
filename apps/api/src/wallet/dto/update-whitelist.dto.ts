import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

export class UpdateWhitelistDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  addresses!: string[];
}
