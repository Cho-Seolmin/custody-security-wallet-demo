import { Module } from '@nestjs/common';
import { SystemController } from './system.controller';
import { SystemStatusController } from './system-status.controller';
import { SystemService } from './system.service';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [WalletModule],
  controllers: [SystemController, SystemStatusController],
  providers: [SystemService],
})
export class SystemModule {}
