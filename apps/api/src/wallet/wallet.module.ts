import { Module } from "@nestjs/common";
import { WalletController } from "./wallet.controller";
import { WalletService } from "./wallet.service";
import { PrismaService } from "../prisma/prisma.service";
import { SignerService } from "./signer.service";
import { PolicyEngineService } from "./policy-engine.service";
import { WithdrawalAuditService } from "./withdrawal-audit.service";

@Module({
  controllers: [WalletController],
  providers: [
    WalletService,
    PrismaService,
    SignerService,
    PolicyEngineService,
    WithdrawalAuditService,
  ],
})
export class WalletModule {}