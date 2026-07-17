import {
  Body,
  Controller,
  Get,
  Param,
  Query,
  Post,
  Req,
  UseGuards,
  Headers,
  Patch,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WithdrawThrottlerGuard } from './guards/withdraw-throttler.guard';
import { WalletService } from './wallet.service';
import { UpdateLimitsDto } from './dto/update-limits.dto';
import { UpdateWhitelistDto } from './dto/update-whitelist.dto';
import { WithdrawDto } from './dto/withdraw.dto';
import { RegisterSssWalletDto } from './dto/register-sss-wallet.dto';

// Demo wallets for POLICY_GUARD / KMS / MPC remain pre-provisioned.
// BACKEND_SEC / MULTISIG / SSS may also be created per authenticated user.
@Controller('wallets')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  list(@Req() req: any) {
    return this.walletService.list(req.user.sub);
  }

  @Get('summary')
  @UseGuards(JwtAuthGuard)
  getSummary(@Req() req: any) {
    return this.walletService.getDashboardSummary(req.user.sub);
  }

  @Post('backend-sec')
  @UseGuards(JwtAuthGuard)
  createBackendSec(@Req() req: any) {
    return this.walletService.createBackendSecWallet(req.user.sub);
  }

  @Post('multisig')
  @UseGuards(JwtAuthGuard)
  createMultisig(@Req() req: any) {
    return this.walletService.createMultisigWallet(req.user.sub);
  }

  @Post('sss')
  @UseGuards(JwtAuthGuard)
  registerSss(@Req() req: any, @Body() dto: RegisterSssWalletDto) {
    return this.walletService.registerSssWallet(req.user.sub, dto.address);
  }

  @Get(':id/balance')
  @UseGuards(JwtAuthGuard)
  getBalance(@Req() req: any, @Param('id') id: string) {
    return this.walletService.getBalance(req.user.sub, id);
  }

  @Get(':id/limits')
  @UseGuards(JwtAuthGuard)
  getLimits(@Req() req: any, @Param('id') id: string) {
    return this.walletService.getLimits(req.user.sub, id);
  }

  @Patch(':id/limits')
  @UseGuards(JwtAuthGuard)
  updateLimits(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateLimitsDto,
  ) {
    return this.walletService.updateLimits(req.user.sub, id, dto);
  }

  @Post(':id/whitelist')
  @UseGuards(JwtAuthGuard)
  updateWhitelist(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateWhitelistDto,
  ) {
    return this.walletService.updateWhitelist(req.user.sub, id, dto);
  }

  @Post(':id/withdraw')
  @UseGuards(JwtAuthGuard, WithdrawThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  withdraw(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: WithdrawDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.walletService.withdraw(req.user.sub, id, dto, idempotencyKey);
  }

  @Get('signer/info')
  @UseGuards(JwtAuthGuard)
  getSignerInfo() {
    return this.walletService.getSignerInfo();
  }

  @Get(':id/withdraws')
  @UseGuards(JwtAuthGuard)
  getWithdrawHistory(
    @Req() req: any,
    @Param('id') id: string,
    @Query('status')
    status?:
      | 'PENDING'
      | 'APPROVED'
      | 'QUEUED'
      | 'PROCESSING'
      | 'EXECUTED'
      | 'REJECTED'
      | 'FAILED'
      | 'EXPIRED',
  ) {
    return this.walletService.getWithdrawHistory(req.user.sub, id, status);
  }

  @Get(':id/whitelist')
  @UseGuards(JwtAuthGuard)
  getWhitelist(@Req() req: any, @Param('id') id: string) {
    return this.walletService.getWhitelist(req.user.sub, id);
  }

  @Get('kms/info')
  @UseGuards(JwtAuthGuard)
  getKmsInfo() {
    return this.walletService.getKmsInfo();
  }
}
