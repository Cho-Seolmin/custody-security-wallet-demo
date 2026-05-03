import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { WalletModule } from "./wallet/wallet.module";
import { AdminModule } from './admin/admin.module';
import { SystemModule } from "./system/system.module";

@Module({
  imports: [ ScheduleModule.forRoot(),PrismaModule, AuthModule, WalletModule, AdminModule, SystemModule,],
})
export class AppModule {}