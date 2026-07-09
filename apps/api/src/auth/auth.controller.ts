import { Body, Controller, Get, Post, Query, Patch, BadRequestException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { UseGuards, Req } from "@nestjs/common";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { UpdateWalletAddressDto } from "./dto/update-wallet-address.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";



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

  @Patch("password")
  @UseGuards(JwtAuthGuard)
  changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(req.user.sub, dto.currentPassword, dto.newPassword);
  }

}
