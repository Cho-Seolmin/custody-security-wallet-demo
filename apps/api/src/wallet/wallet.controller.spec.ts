import { Test, TestingModule } from '@nestjs/testing';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { WithdrawThrottlerGuard } from './guards/withdraw-throttler.guard';

describe('WalletController', () => {
  let controller: WalletController;
  let walletService: {
    list: jest.Mock;
    getBalance: jest.Mock;
    withdraw: jest.Mock;
  };

  const req = { user: { sub: 'user-1' } };

  beforeEach(async () => {
    walletService = {
      list: jest.fn(),
      getBalance: jest.fn(),
      withdraw: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WalletController],
      providers: [{ provide: WalletService, useValue: walletService }],
    })
      .overrideGuard(WithdrawThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WalletController>(WalletController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('list() delegates to WalletService.list with the authenticated user id', async () => {
    walletService.list.mockResolvedValue([{ id: 'w1' }]);

    const result = await controller.list(req as any);

    expect(walletService.list).toHaveBeenCalledWith('user-1');
    expect(result).toEqual([{ id: 'w1' }]);
  });

  it('getBalance() delegates to WalletService.getBalance with user id and wallet id', async () => {
    walletService.getBalance.mockResolvedValue({ balanceWei: '0' });

    await controller.getBalance(req as any, 'wallet-1');

    expect(walletService.getBalance).toHaveBeenCalledWith('user-1', 'wallet-1');
  });

  it('withdraw() forwards the idempotency key header to WalletService.withdraw', async () => {
    const dto = { toAddress: '0xabc', amount: '1000000000000000000' };
    walletService.withdraw.mockResolvedValue({ status: 'PENDING' });

    await controller.withdraw(req as any, 'wallet-1', dto as any, 'idem-key-1');

    expect(walletService.withdraw).toHaveBeenCalledWith(
      'user-1',
      'wallet-1',
      dto,
      'idem-key-1',
    );
  });
});
