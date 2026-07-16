import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    service = new AuthService(
      prisma as unknown as PrismaService,
      {} as JwtService,
    );
  });

  describe('changePassword', () => {
    it('rejects passwords shorter than 8 characters', async () => {
      await expect(
        service.changePassword('user-1', 'current-password', 'short'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
