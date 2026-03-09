import { Body, Controller, Get, Post, Query, Patch, BadRequestException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { UseGuards, Req } from "@nestjs/common";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { UpdateWalletAddressDto } from "./dto/update-wallet-address.dto";



@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  async register(@Body() dto: RegisterDto) {
    return this.auth.register(dto.email, dto.password);
  }

  @Get("verify-email")
  async verifyEmail(@Query("token") token: string) {
    return this.auth.verifyEmail(token);
  }

  @Post("login")
  async login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  getMe(@Req() req: any) {
    return this.auth.getMe(req.user.sub);
  }
  @Patch("me/wallet-address")
  @UseGuards(JwtAuthGuard)
  updateMyWalletAddress(
    @Req() req: any,
    @Body() body: { walletAddress: string },
  ) {
    if (!body?.walletAddress) {
      throw new BadRequestException("walletAddress is required");
    }

    return this.auth.updateMyWalletAddress(req.user.sub, body.walletAddress);
  }
 
}
