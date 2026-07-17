import { ExecutionRouterService } from './execution-router.service';

describe('ExecutionRouterService BACKEND_SEC / MULTISIG routing', () => {
  it('passes walletId to BackendSecExecutor for BACKEND_SEC and MULTISIG', async () => {
    const backendSecExecutor = {
      execute: jest.fn().mockResolvedValue({
        type: 'ONCHAIN_TX',
        txHash: '0xabc',
      }),
    };
    const policyGuardExecutor = { execute: jest.fn() };
    const kmsExecutor = { execute: jest.fn() };
    const mpcExecutor = { execute: jest.fn() };
    const sssExecutor = { execute: jest.fn() };

    const router = new ExecutionRouterService(
      backendSecExecutor as any,
      policyGuardExecutor as any,
      kmsExecutor as any,
      mpcExecutor as any,
      sssExecutor as any,
    );

    const base = {
      walletId: 'w1',
      withdrawRequestId: 'wr1',
      toAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      amountWei: 1n,
    };

    await router.execute({ ...base, walletType: 'BACKEND_SEC' });
    await router.execute({ ...base, walletType: 'MULTISIG' });

    expect(backendSecExecutor.execute).toHaveBeenCalledTimes(2);
    expect(backendSecExecutor.execute).toHaveBeenNthCalledWith(1, {
      walletId: 'w1',
      toAddress: base.toAddress,
      amountWei: 1n,
    });
    expect(backendSecExecutor.execute).toHaveBeenNthCalledWith(2, {
      walletId: 'w1',
      toAddress: base.toAddress,
      amountWei: 1n,
    });
    expect(sssExecutor.execute).not.toHaveBeenCalled();
    expect(kmsExecutor.execute).not.toHaveBeenCalled();
    expect(mpcExecutor.execute).not.toHaveBeenCalled();
    expect(policyGuardExecutor.execute).not.toHaveBeenCalled();
  });

  it('keeps SSS / KMS / MPC / POLICY_GUARD routes unchanged', async () => {
    const backendSecExecutor = { execute: jest.fn() };
    const policyGuardExecutor = {
      execute: jest.fn().mockResolvedValue({ type: 'ONCHAIN_TX', txHash: '0x1' }),
    };
    const kmsExecutor = {
      execute: jest.fn().mockResolvedValue({ type: 'ONCHAIN_TX', txHash: '0x2' }),
    };
    const mpcExecutor = {
      execute: jest
        .fn()
        .mockResolvedValue({ type: 'EXTERNAL_PENDING', externalRequestId: 'x' }),
    };
    const sssExecutor = {
      execute: jest.fn().mockResolvedValue({ type: 'ONCHAIN_TX', txHash: '0x3' }),
    };

    process.env.POLICY_VAULT_ADDRESS =
      '0x0000000000000000000000000000000000000001';

    const router = new ExecutionRouterService(
      backendSecExecutor as any,
      policyGuardExecutor as any,
      kmsExecutor as any,
      mpcExecutor as any,
      sssExecutor as any,
    );

    const base = {
      walletId: 'w1',
      withdrawRequestId: 'wr1',
      toAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      amountWei: 1n,
    };

    await router.execute({ ...base, walletType: 'SSS' });
    await router.execute({ ...base, walletType: 'KMS' });
    await router.execute({ ...base, walletType: 'MPC' });
    await router.execute({ ...base, walletType: 'POLICY_GUARD' });

    expect(sssExecutor.execute).toHaveBeenCalledWith({
      walletId: 'w1',
      withdrawRequestId: 'wr1',
      toAddress: base.toAddress,
      amountWei: 1n,
    });
    expect(kmsExecutor.execute).toHaveBeenCalledWith({
      toAddress: base.toAddress,
      amountWei: 1n,
    });
    expect(mpcExecutor.execute).toHaveBeenCalledWith({
      toAddress: base.toAddress,
      amountWei: 1n,
    });
    expect(policyGuardExecutor.execute).toHaveBeenCalled();
    expect(backendSecExecutor.execute).not.toHaveBeenCalled();
  });
});
