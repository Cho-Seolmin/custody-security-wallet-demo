import { getAddress, Wallet } from 'ethers';
import { BackendSecExecutor } from './backend-sec.executor';
import { WalletSignerError } from '../wallet-signer.errors';

describe('BackendSecExecutor', () => {
  const walletId = 'wallet-1';
  const toAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

  it('signs with the per-wallet signer address (not shared signer)', async () => {
    const eoa = Wallet.createRandom();
    const sendTransaction = jest.fn().mockResolvedValue({
      hash: '0xtxhash',
      wait: jest.fn().mockResolvedValue({ blockNumber: 123 }),
    });

    const perWalletSigner = {
      address: eoa.address,
      sendTransaction,
    };

    const sharedAddress = getAddress(Wallet.createRandom().address);

    const signerService = {
      getWalletSigner: jest.fn().mockResolvedValue(perWalletSigner),
      getProvider: jest.fn().mockReturnValue({
        getBalance: jest.fn().mockResolvedValue(10n ** 18n),
      }),
      getSignerAddress: jest.fn().mockResolvedValue(sharedAddress),
      sendNativeTransaction: jest.fn(),
    };

    const executor = new BackendSecExecutor(signerService as any);
    const result = await executor.execute({
      walletId,
      toAddress,
      amountWei: 1n,
    });

    expect(signerService.getWalletSigner).toHaveBeenCalledWith(walletId);
    expect(signerService.sendNativeTransaction).not.toHaveBeenCalled();
    expect(sendTransaction).toHaveBeenCalledWith({
      to: toAddress,
      value: 1n,
    });
    expect(result).toEqual({
      type: 'ONCHAIN_TX',
      txHash: '0xtxhash',
      blockNumber: 123,
      receipt: { blockNumber: 123 },
    });
  });

  it('propagates address mismatch without calling sendTransaction', async () => {
    const signerService = {
      getWalletSigner: jest
        .fn()
        .mockRejectedValue(
          new WalletSignerError(
            'WALLET_SIGNER_ADDRESS_MISMATCH',
            'Signer address does not match wallet address',
          ),
        ),
      getProvider: jest.fn(),
      sendNativeTransaction: jest.fn(),
    };

    const executor = new BackendSecExecutor(signerService as any);

    await expect(
      executor.execute({
        walletId,
        toAddress,
        amountWei: 1n,
      }),
    ).rejects.toMatchObject({ code: 'WALLET_SIGNER_ADDRESS_MISMATCH' });

    expect(signerService.sendNativeTransaction).not.toHaveBeenCalled();
  });

  it('propagates missing encrypted key without shared-signer send', async () => {
    const signerService = {
      getWalletSigner: jest
        .fn()
        .mockRejectedValue(
          new WalletSignerError(
            'WALLET_ENCRYPTED_KEY_MISSING',
            'Wallet has no encrypted signing key and does not match the legacy shared signer',
          ),
        ),
      getProvider: jest.fn(),
      sendNativeTransaction: jest.fn(),
    };

    const executor = new BackendSecExecutor(signerService as any);

    await expect(
      executor.execute({
        walletId,
        toAddress,
        amountWei: 1n,
      }),
    ).rejects.toMatchObject({ code: 'WALLET_ENCRYPTED_KEY_MISSING' });

    expect(signerService.sendNativeTransaction).not.toHaveBeenCalled();
  });
});
