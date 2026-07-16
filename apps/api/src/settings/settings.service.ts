import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPreferences(userId: string) {
    const existing = await this.prisma.userPreference.findUnique({
      where: { userId },
    });
    if (existing) return existing;

    return this.prisma.userPreference.create({ data: { userId } });
  }

  async updatePreferences(userId: string, dto: UpdatePreferencesDto) {
    if (dto.defaultWalletId) {
      const wallet = await this.prisma.wallet.findUnique({
        where: { id: dto.defaultWalletId },
      });
      if (!wallet) throw new NotFoundException('Wallet not found');
      if (wallet.userId !== userId)
        throw new ForbiddenException('Not your wallet');
    }

    if (dto.balanceUnit && !['ETH', 'WEI'].includes(dto.balanceUnit)) {
      throw new BadRequestException('Invalid balanceUnit');
    }

    return this.prisma.userPreference.upsert({
      where: { userId },
      update: {
        ...(dto.defaultWalletId !== undefined
          ? { defaultWalletId: dto.defaultWalletId }
          : {}),
        ...(dto.balanceUnit !== undefined
          ? { balanceUnit: dto.balanceUnit }
          : {}),
        ...(dto.autoRefreshEnabled !== undefined
          ? { autoRefreshEnabled: dto.autoRefreshEnabled }
          : {}),
        ...(dto.inAppNotifications !== undefined
          ? { inAppNotifications: dto.inAppNotifications }
          : {}),
        ...(dto.emailNotifications !== undefined
          ? { emailNotifications: dto.emailNotifications }
          : {}),
      },
      create: {
        userId,
        defaultWalletId: dto.defaultWalletId ?? null,
        balanceUnit: dto.balanceUnit ?? 'ETH',
        autoRefreshEnabled: dto.autoRefreshEnabled ?? true,
        inAppNotifications: dto.inAppNotifications ?? true,
        emailNotifications: dto.emailNotifications ?? false,
      },
    });
  }
}
