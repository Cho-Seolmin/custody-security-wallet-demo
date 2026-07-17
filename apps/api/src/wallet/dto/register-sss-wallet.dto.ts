import { IsEthereumAddress, IsNotEmpty, IsString } from 'class-validator';

export class RegisterSssWalletDto {
  @IsString()
  @IsNotEmpty()
  @IsEthereumAddress()
  address: string;
}
