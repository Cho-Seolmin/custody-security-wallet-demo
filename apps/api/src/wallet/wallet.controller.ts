import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CreateWalletDto } from "./dto/create-wallet.dto";
import { WalletService } from "./wallet.service";
import { Patch } from "@nestjs/common";
import { UpdateLimitsDto } from "./dto/update-limits.dto";
import { UpdateWhitelistDto } from "./dto/update-whitelist.dto";
import { WithdrawDto } from "./dto/withdraw.dto";

@Controller("wallets")
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Req() req: any, @Body() dto: CreateWalletDto) {
    return this.walletService.create(req.user.sub, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  list(@Req() req: any) {
    return this.walletService.list(req.user.sub);
  }

  @Get(":id/balance")
  @UseGuards(JwtAuthGuard)
  getBalance(@Req() req: any, @Param("id") id: string) {
    return this.walletService.getBalance(req.user.sub, id);
  }

  @Patch(":id/limits")
@UseGuards(JwtAuthGuard)
updateLimits(@Req() req: any, @Param("id") id: string, @Body() dto: UpdateLimitsDto) {
  return this.walletService.updateLimits(req.user.sub, id, dto);
}

@Post(":id/whitelist")
@UseGuards(JwtAuthGuard)
updateWhitelist(@Req() req: any, @Param("id") id: string, @Body() dto: UpdateWhitelistDto) {
  return this.walletService.updateWhitelist(req.user.sub, id, dto);
}

@Post(":id/withdraw")
@UseGuards(JwtAuthGuard)
withdraw(@Req() req: any, @Param("id") id: string, @Body() dto: WithdrawDto) {
  return this.walletService.withdraw(req.user.sub, id, dto);
}
}