import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Prisma, WalletType } from '@prisma/client';
import {
  ContractFactory,
  getAddress,
  isAddress,
  Wallet as EthersWallet,
} from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { encryptPrivateKey } from '../common/crypto/wallet-key-encryption';
import { SignerService } from './signer.service';
import {
  POLICY_VAULT_ABI,
  POLICY_VAULT_BYTECODE,
} from './policy-vault.artifact';

const PROVISIONABLE_TYPES = ['BACKEND_SEC', 'MULTISIG'] as const;
type ProvisionableWalletType = (typeof PROVISIONABLE_TYPES)[number];

export type ProvisionedWalletDto = {
  id: string;
  walletType: WalletType;
  address: string;
  createdAt: Date;
  resolvedAddress: string;
  addressSource: 'USER_PROVISIONED';
};

@Injectable()
export class WalletProvisionService {
  private readonly logger = new Logger(WalletProvisionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly signerService: SignerService,
  ) {}

  createBackendSecWallet(userId: string): Promise<ProvisionedWalletDto> {
    return this.createUserWallet(userId, 'BACKEND_SEC');
  }

  createMultisigWallet(userId: string): Promise<ProvisionedWalletDto> {
    return this.createUserWallet(userId, 'MULTISIG');
  }

  /**
   * Deploy a per-user PolicyVault that shares the env PolicyGuard, then
   * store the vault address as a POLICY_GUARD wallet row.
   */
  async createPolicyGuardWallet(
    userId: string,
  ): Promise<ProvisionedWalletDto> {
    const existing = await this.prisma.wallet.findUnique({
      where: {
        userId_walletType: {
          userId,
          walletType: 'POLICY_GUARD',
        },
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('이미 POLICY_GUARD 지갑이 존재합니다.');
    }

    const policyGuardRaw = process.env.POLICY_GUARD_ADDRESS;
    if (!policyGuardRaw || !isAddress(policyGuardRaw)) {
      throw new BadRequestException(
        'POLICY_GUARD_ADDRESS is missing or invalid in .env',
      );
    }

    let policyGuardAddress: string;
    let ownerAndOperator: string;
    let vaultAddress: string;

    try {
      policyGuardAddress = getAddress(policyGuardRaw);
      ownerAndOperator = getAddress(
        await this.signerService.getSignerAddress(),
      );
    } catch (err) {
      this.logger.error(
        'POLICY_GUARD address resolution failed',
        err instanceof Error ? err.message : 'unknown error',
      );
      throw new BadRequestException(
        'POLICY_GUARD_ADDRESS is missing or invalid in .env',
      );
    }

    try {
      const signer = this.signerService.getSigner();
      const factory = new ContractFactory(
        POLICY_VAULT_ABI,
        POLICY_VAULT_BYTECODE,
        signer,
      );
      const vault = await factory.deploy(
        ownerAndOperator,
        ownerAndOperator,
        policyGuardAddress,
      );
      await vault.waitForDeployment();
      vaultAddress = await vault.getAddress();
    } catch (err) {
      this.logger.error(
        'POLICY_GUARD PolicyVault deploy failed',
        err instanceof Error ? err.message : 'unknown error',
      );
      throw new InternalServerErrorException(
        '폴리시 가드 지갑 배포에 실패했습니다. 잠시 후 다시 시도해주세요.',
      );
    }

    try {
      const created = await this.prisma.wallet.create({
        data: {
          userId,
          walletType: 'POLICY_GUARD',
          address: vaultAddress,
        },
        select: {
          id: true,
          walletType: true,
          address: true,
          createdAt: true,
        },
      });

      return {
        ...created,
        resolvedAddress: created.address,
        addressSource: 'USER_PROVISIONED',
      };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('이미 POLICY_GUARD 지갑이 존재합니다.');
      }

      this.logger.error(
        'POLICY_GUARD wallet database insert failed',
        err instanceof Error ? err.message : 'unknown error',
      );
      throw new InternalServerErrorException(
        '지갑 저장에 실패했습니다. 잠시 후 다시 시도해주세요.',
      );
    }
  }

  /**
   * Register a browser-generated SSS wallet by public address only.
   * Never accepts private keys or shards.
   */
  async registerSssWallet(
    userId: string,
    address: string,
  ): Promise<ProvisionedWalletDto> {
    if (!address || typeof address !== 'string' || !isAddress(address)) {
      throw new BadRequestException('유효한 이더리움 주소가 필요합니다.');
    }

    let checksummed: string;
    try {
      checksummed = getAddress(address);
    } catch {
      throw new BadRequestException('유효한 이더리움 주소가 필요합니다.');
    }

    const existing = await this.prisma.wallet.findUnique({
      where: {
        userId_walletType: {
          userId,
          walletType: 'SSS',
        },
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('이미 SSS 지갑이 존재합니다.');
    }

    try {
      const created = await this.prisma.wallet.create({
        data: {
          userId,
          walletType: 'SSS',
          address: checksummed,
          // SSS is non-custodial: never store encryptedPrivateKey
        },
        select: {
          id: true,
          walletType: true,
          address: true,
          createdAt: true,
        },
      });

      return {
        ...created,
        resolvedAddress: created.address,
        addressSource: 'USER_PROVISIONED',
      };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('이미 SSS 지갑이 존재합니다.');
      }

      this.logger.error(
        'SSS wallet registration failed',
        err instanceof Error ? err.message : 'unknown error',
      );
      throw new InternalServerErrorException(
        '지갑 등록에 실패했습니다. 잠시 후 다시 시도해주세요.',
      );
    }
  }

  /**
   * Shared EOA provisioning for custodial user-owned wallet types.
   * Does not touch withdrawal/execution paths.
   */
  private async createUserWallet(
    userId: string,
    walletType: ProvisionableWalletType,
  ): Promise<ProvisionedWalletDto> {
    const existing = await this.prisma.wallet.findUnique({
      where: {
        userId_walletType: {
          userId,
          walletType,
        },
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(`이미 ${walletType} 지갑이 존재합니다.`);
    }

    let address: string;
    let encryptedPrivateKey: string;

    try {
      const eoa = EthersWallet.createRandom();
      address = eoa.address;
      encryptedPrivateKey = encryptPrivateKey(eoa.privateKey);
    } catch (err) {
      this.logger.error(
        `${walletType} wallet generation or encryption failed`,
        err instanceof Error ? err.message : 'unknown error',
      );
      throw new InternalServerErrorException(
        '지갑 생성에 실패했습니다. 잠시 후 다시 시도해주세요.',
      );
    }

    try {
      const created = await this.prisma.wallet.create({
        data: {
          userId,
          walletType,
          address,
          encryptedPrivateKey,
        },
        select: {
          id: true,
          walletType: true,
          address: true,
          createdAt: true,
        },
      });

      return {
        ...created,
        resolvedAddress: created.address,
        addressSource: 'USER_PROVISIONED',
      };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(`이미 ${walletType} 지갑이 존재합니다.`);
      }

      this.logger.error(
        `${walletType} wallet database insert failed`,
        err instanceof Error ? err.message : 'unknown error',
      );
      throw new InternalServerErrorException(
        '지갑 저장에 실패했습니다. 잠시 후 다시 시도해주세요.',
      );
    }
  }
}
