import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaService } from "../prisma/prisma.service";
import { WalletModule } from "../wallet/wallet.module";

@Module({
  imports: [WalletModule],
  controllers: [AdminController],
  providers: [
    AdminService,
    PrismaService,
  ]
})
export class AdminModule {}
