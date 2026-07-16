import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prisma: { user: { findUnique: jest.Mock } };

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    strategy = new JwtStrategy(prisma as unknown as PrismaService);
  });

  it('rejects verify-email tokens', async () => {
    await expect(
      strategy.validate({
        sub: 'user-1',
        email: 'a@b.com',
        type: 'verify-email',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects non-access token types', async () => {
    await expect(
      strategy.validate({
        sub: 'user-1',
        email: 'a@b.com',
        type: 'refresh',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts access tokens for active users', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      role: 'USER',
      status: 'ACTIVE',
    });

    await expect(
      strategy.validate({
        sub: 'user-1',
        email: 'a@b.com',
        type: 'access',
      }),
    ).resolves.toEqual({
      sub: 'user-1',
      email: 'a@b.com',
      role: 'USER',
    });
  });
});
