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

// 이 데모는 지갑을 직접 생성하는 기능을 제공하지 않습니다.
// 6가지 보안 모델(BACKEND_SEC / MULTISIG / POLICY_GUARD / KMS / MPC / SSS)의
// 사전 구성된 데모 지갑을 비교·테스트하는 데 목적이 있습니다.
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
