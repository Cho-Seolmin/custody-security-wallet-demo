import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { WithdrawalAuditService } from '../wallet/withdrawal-audit.service';
import { WithdrawGateway } from '../wallet/withdraw.gateway';

describe('AdminService', () => {
  let service: AdminService;
  let tx: {
    withdrawRequest: {
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
    adminApproval: {
      findFirst: jest.Mock;
      create: jest.Mock;
      count: jest.Mock;
    };
    withdrawalQueue: {
      create: jest.Mock;
    };
  };
  let prisma: {
    $transaction: jest.Mock;
    withdrawRequest: { findMany: jest.Mock };
  };
  let withdrawGateway: { emitWithdrawUpdated: jest.Mock };

  beforeEach(async () => {
    tx = {
      withdrawRequest: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      adminApproval: {
        findFirst: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
      },
      withdrawalQueue: {
        create: jest.fn(),
      },
    };

    prisma = {
      $transaction: jest.fn(async (callback) => callback(tx)),
      withdrawRequest: { findMany: jest.fn() },
    };

    withdrawGateway = { emitWithdrawUpdated: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: WithdrawalAuditService, useValue: { append: jest.fn() } },
        { provide: WithdrawGateway, useValue: withdrawGateway },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('approveWithdraw', () => {
    it('throws NotFoundException when the withdraw request does not exist', async () => {
      tx.withdrawRequest.findUnique.mockResolvedValue(null);

      await expect(
        service.approveWithdraw('wr-1', 'admin-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when the request is not PENDING', async () => {
      tx.withdrawRequest.findUnique.mockResolvedValue({
        id: 'wr-1',
        status: 'EXECUTED',
        wallet: { walletType: 'MULTISIG', userId: 'user-1' },
      });

      await expect(
        service.approveWithdraw('wr-1', 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when the wallet is not MULTISIG', async () => {
      tx.withdrawRequest.findUnique.mockResolvedValue({
        id: 'wr-1',
        status: 'PENDING',
        expiresAt: null,
        wallet: { walletType: 'BACKEND_SEC', userId: 'user-1' },
      });

      await expect(
        service.approveWithdraw('wr-1', 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when the same admin already approved', async () => {
      tx.withdrawRequest.findUnique.mockResolvedValue({
        id: 'wr-1',
        walletId: 'wallet-1',
        status: 'PENDING',
        expiresAt: null,
        wallet: { walletType: 'MULTISIG', userId: 'user-1' },
      });
      tx.adminApproval.findFirst.mockResolvedValue({ id: 'approval-1' });

      await expect(
        service.approveWithdraw('wr-1', 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('records the approval without queueing when the threshold is not reached', async () => {
      tx.withdrawRequest.findUnique.mockResolvedValue({
        id: 'wr-1',
        walletId: 'wallet-1',
        status: 'PENDING',
        expiresAt: null,
        wallet: { walletType: 'MULTISIG', userId: 'user-1' },
      });
      tx.adminApproval.findFirst.mockResolvedValue(null);
      tx.adminApproval.create.mockResolvedValue({ id: 'approval-1' });
      tx.adminApproval.count.mockResolvedValue(1);

      const result = await service.approveWithdraw('wr-1', 'admin-1');

      expect(result).toEqual({
        message: 'Approval recorded',
        approvalCount: 1,
      });
      expect(tx.withdrawRequest.updateMany).not.toHaveBeenCalled();
      expect(withdrawGateway.emitWithdrawUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1' }),
      );
    });
  });
});
