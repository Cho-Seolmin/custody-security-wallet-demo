import { Module } from "@nestjs/common";
import { SystemController } from "./system.controller";
import { SystemService } from "./system.service";
import { PrismaService } from "../prisma/prisma.service";
import { SignerService } from "../wallet/signer.service";

@Module({
  controllers: [SystemController],
  providers: [SystemService, PrismaService, SignerService],
})
export class SystemModule {}