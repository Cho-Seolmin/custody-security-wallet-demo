import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service";

type VerifyPayload = { sub: string; email: string; type: "verify-email" };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(email: string, password: string) {
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) throw new BadRequestException("Email already in use");

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        role: "USER",
        status: "PENDING",
      },
      select: { id: true, email: true, status: true, role: true, createdAt: true },
    });

    // 이메일 발송은 나중에 — 지금은 토큰을 반환(데모/개발 편의)
    const token = this.jwt.sign(
      { sub: user.id, email: user.email, type: "verify-email" } satisfies VerifyPayload,
      { expiresIn: "1d" },
    );

    return {
      user,
      verifyUrl: `${process.env.APP_BASE_URL || "http://localhost:3000"}/auth/verify-email?token=${token}`,
      token,
    };
  }

  async verifyEmail(token: string) {
    let payload: VerifyPayload;
    try {
      payload = this.jwt.verify(token);
    } catch {
      throw new BadRequestException("Invalid or expired token");
    }

    if (payload.type !== "verify-email") throw new BadRequestException("Invalid token type");

    const user = await this.prisma.user.update({
      where: { id: payload.sub },
      data: { status: "ACTIVE" },
      select: { id: true, email: true, status: true, role: true },
    });

    return { ok: true, user };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException("Invalid credentials");
    if (user.status !== "ACTIVE") throw new UnauthorizedException("Email not verified");

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Invalid credentials");

    const accessToken = this.jwt.sign({ sub: user.id, email: user.email, role: user.role });

    return { accessToken };
  }
}
