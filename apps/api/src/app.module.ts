import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { WalletModule } from "./wallet/wallet.module";
import { AdminModule } from './admin/admin.module';
import { SystemModule } from "./system/system.module";

@Module({
  imports: [PrismaModule, AuthModule, WalletModule, AdminModule, SystemModule,],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}