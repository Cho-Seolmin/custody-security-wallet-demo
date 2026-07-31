import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { WalletProvisionService } from './wallet-provision.service';

jest.mock('ethers', () => {
  const actual = jest.requireActual('ethers');
  return {
    ...actual,
    ContractFactory: jest.fn(),
  };
});

import { ContractFactory } from 'ethers';

describe('WalletProvisionService.createPolicyGuardWallet', () => {
  const userId = 'user-1';
  const guardAddress = '0x0000000000000000000000000000000000000001';
  const signerAddress = '0x0000000000000000000000000000000000000002';
  const vaultAddress = '0x0000000000000000000000000000000000000003';

  let prisma: {
    wallet: { findUnique: jest.Mock; create: jest.Mock };
  };
  let signerService: {
    getSignerAddress: jest.Mock;
    getSigner: jest.Mock;
  };
  let service: WalletProvisionService;

  beforeEach(() => {
    process.env.POLICY_GUARD_ADDRESS = guardAddress;
    prisma = {
      wallet: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
    };
    signerService = {
      getSignerAddress: jest.fn().mockResolvedValue(signerAddress),
      getSigner: jest.fn().mockReturnValue({}),
    };
    service = new WalletProvisionService(
      prisma as any,
      signerService as any,
    );
    jest.mocked(ContractFactory).mockReset();
  });

  it('throws ConflictException when POLICY_GUARD wallet already exists', async () => {
    prisma.wallet.findUnique.mockResolvedValue({ id: 'existing' });

    await expect(service.createPolicyGuardWallet(userId)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(ContractFactory).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when POLICY_GUARD_ADDRESS is missing', async () => {
    delete process.env.POLICY_GUARD_ADDRESS;

    await expect(service.createPolicyGuardWallet(userId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('deploys PolicyVault and stores wallet row', async () => {
    const waitForDeployment = jest.fn().mockResolvedValue(undefined);
    const getAddress = jest.fn().mockResolvedValue(vaultAddress);
    const deploy = jest.fn().mockResolvedValue({
      waitForDeployment,
      getAddress,
    });
    jest.mocked(ContractFactory).mockImplementation(
      () =>
        ({
          deploy,
        }) as any,
    );

    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    prisma.wallet.create.mockResolvedValue({
      id: 'w-pg',
      walletType: 'POLICY_GUARD',
      address: vaultAddress,
      createdAt,
    });

    const result = await service.createPolicyGuardWallet(userId);

    expect(deploy).toHaveBeenCalledWith(
      signerAddress,
      signerAddress,
      guardAddress,
    );
    expect(prisma.wallet.create).toHaveBeenCalledWith({
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
    expect(result).toEqual({
      id: 'w-pg',
      walletType: 'POLICY_GUARD',
      address: vaultAddress,
      createdAt,
      resolvedAddress: vaultAddress,
      addressSource: 'USER_PROVISIONED',
    });
  });

  it('throws InternalServerErrorException when deploy fails', async () => {
    jest.mocked(ContractFactory).mockImplementation(
      () =>
        ({
          deploy: jest.fn().mockRejectedValue(new Error('rpc down')),
        }) as any,
    );

    await expect(service.createPolicyGuardWallet(userId)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    expect(prisma.wallet.create).not.toHaveBeenCalled();
  });

  it('maps P2002 on insert to ConflictException', async () => {
    const waitForDeployment = jest.fn().mockResolvedValue(undefined);
    const getAddress = jest.fn().mockResolvedValue(vaultAddress);
    jest.mocked(ContractFactory).mockImplementation(
      () =>
        ({
          deploy: jest.fn().mockResolvedValue({
            waitForDeployment,
            getAddress,
          }),
        }) as any,
    );

    prisma.wallet.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(service.createPolicyGuardWallet(userId)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
