import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { WalletService } from './wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { SignerService } from './signer.service';
import { PolicyEngineService } from './policy-engine.service';
import { WithdrawalAuditService } from './withdrawal-audit.service';
import { QueueService } from './queue.service';
import { KmsService } from './kms.service';
import { MpcService } from './mpc.service';
import { WalletProvisionService } from './wallet-provision.service';

describe('WalletService', () => {
  let service: WalletService;
  let prisma: {
    wallet: { findMany: jest.Mock; findUnique: jest.Mock };
    withdrawRequest: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let signerService: {
    getSignerAddress: jest.Mock;
    getSignerBalance: jest.Mock;
  };
  let kmsService: { getAddress: jest.Mock };
  let mpcService: { getWalletAddress: jest.Mock };

  beforeEach(async () => {
    prisma = {
      wallet: { findMany: jest.fn(), findUnique: jest.fn() },
      withdrawRequest: { findMany: jest.fn(), findFirst: jest.fn() },
      $transaction: jest.fn(),
    };
    signerService = {
      getSignerAddress: jest.fn(),
      getSignerBalance: jest.fn(),
    };
    kmsService = { getAddress: jest.fn() };
    mpcService = { getWalletAddress: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: PrismaService, useValue: prisma },
        { provide: SignerService, useValue: signerService },
        { provide: PolicyEngineService, useValue: {} },
        { provide: WithdrawalAuditService, useValue: {} },
        { provide: QueueService, useValue: {} },
        { provide: KmsService, useValue: kmsService },
        { provide: MpcService, useValue: mpcService },
        {
          provide: WalletProvisionService,
          useValue: {
            createBackendSecWallet: jest.fn(),
            createMultisigWallet: jest.fn(),
            createPolicyGuardWallet: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('list', () => {
    it('resolves KMS wallets via KmsService when it succeeds', async () => {
      prisma.wallet.findMany.mockResolvedValue([
        {
          id: 'w1',
          walletType: 'KMS',
          address: '0xabc',
          createdAt: new Date(),
        },
      ]);
      kmsService.getAddress.mockResolvedValue('0xkms');

      const result = await service.list('user-1');

      expect(result[0]).toMatchObject({
        resolvedAddress: '0xkms',
        addressSource: 'KMS',
      });
    });

    it('falls back to the stored address when KmsService is unavailable', async () => {
      prisma.wallet.findMany.mockResolvedValue([
        {
          id: 'w1',
          walletType: 'KMS',
          address: '0xabc',
          createdAt: new Date(),
        },
      ]);
      kmsService.getAddress.mockRejectedValue(new Error('AWS KMS unreachable'));

      const result = await service.list('user-1');

      expect(result[0]).toMatchObject({
        resolvedAddress: '0xabc',
        addressSource: 'KMS_UNAVAILABLE',
      });
    });

    it('marks plain wallet rows as WALLET_ROW when no external resolver applies', async () => {
      prisma.wallet.findMany.mockResolvedValue([
        {
          id: 'w2',
          walletType: 'SSS',
          address: '0xdef',
          createdAt: new Date(),
        },
      ]);

      const result = await service.list('user-1');

      expect(result[0]).toMatchObject({
        resolvedAddress: '0xdef',
        addressSource: 'WALLET_ROW',
      });
    });
  });

  describe('getBalance', () => {
    it('throws NotFoundException when the wallet does not exist', async () => {
      prisma.wallet.findUnique.mockResolvedValue(null);

      await expect(
        service.getBalance('user-1', 'missing-wallet'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when the wallet belongs to another user', async () => {
      prisma.wallet.findUnique.mockResolvedValue({
        id: 'w1',
        userId: 'other-user',
        walletType: 'BACKEND_SEC',
      });

      await expect(service.getBalance('user-1', 'w1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('returns the backend signer balance for BACKEND_SEC wallets', async () => {
      prisma.wallet.findUnique.mockResolvedValue({
        id: 'w1',
        userId: 'user-1',
        walletType: 'BACKEND_SEC',
      });
      signerService.getSignerAddress.mockResolvedValue('0xsigner');
      signerService.getSignerBalance.mockResolvedValue(1234n);

      const result = await service.getBalance('user-1', 'w1');

      expect(result).toMatchObject({
        address: '0xsigner',
        balanceWei: '1234',
        source: 'BACKEND_SIGNER',
      });
    });
  });

  describe('getWithdrawHistory', () => {
    it('does not expose sssSignedTx in API metadata', async () => {
      prisma.wallet.findUnique.mockResolvedValue({
        id: 'w1',
        userId: 'user-1',
      });
      prisma.withdrawRequest.findMany.mockResolvedValue([
        {
          id: 'wr-1',
          amount: '1',
          toAddress: '0xabc',
          status: 'QUEUED',
          approvedBy: null,
          txHash: null,
          executionType: 'SSS',
          retryCount: 0,
          failureReason: null,
          queuedAt: new Date(),
          processingAt: null,
          broadcastedAt: null,
          confirmedAt: null,
          finalizedAt: null,
          expiresAt: null,
          createdAt: new Date(),
          metadata: {
            sssSignedTx: '0xsigned-tx',
            sssSigningMode: 'CLIENT_SIDE_SIGNED_TX',
          },
          _count: { adminApprovals: 0 },
        },
      ]);

      const result = await service.getWithdrawHistory('user-1', 'w1');

      expect(result[0].metadata).toEqual({
        sssSigningMode: 'CLIENT_SIDE_SIGNED_TX',
      });
      expect(result[0].metadata).not.toHaveProperty('sssSignedTx');
    });
  });

  describe('createWithdrawRequestAndEnqueue', () => {
    it('returns the existing request when idempotency unique constraint conflicts', async () => {
      const existing = {
        id: 'wr-existing',
        walletId: 'w1',
        amount: '1',
        toAddress: '0xabc',
        status: 'QUEUED',
        createdAt: new Date(),
        approvedBy: null,
        txHash: null,
      };

      prisma.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.0.0',
        }),
      );
      prisma.withdrawRequest.findFirst.mockResolvedValue(existing);

      const result = await (service as any).createWithdrawRequestAndEnqueue(
        {
          walletId: 'w1',
          amount: '1',
          toAddress: '0xabc',
          status: 'QUEUED',
          executionType: 'KMS',
          idempotencyKey: 'idem-1',
        },
        'KMS',
      );

      expect(result.duplicated).toBe(true);
      expect(result.queuedRequest).toEqual(existing);
    });
  });
});
