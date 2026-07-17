import { getAddress, Wallet } from 'ethers';
import { SignerService } from './signer.service';
import { WalletSignerError } from './wallet-signer.errors';
import { encryptPrivateKey } from '../common/crypto/wallet-key-encryption';

describe('SignerService.getSignerForWallet / getWalletSigner', () => {
  const encryptionKey =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const sharedPk =
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4a2a6a0';
  const sharedAddress = getAddress(new Wallet(sharedPk).address);

  const originalEnv = {
    SEPOLIA_RPC_URL: process.env.SEPOLIA_RPC_URL,
    BACKEND_SIGNER_PRIVATE_KEY: process.env.BACKEND_SIGNER_PRIVATE_KEY,
    WALLET_ENCRYPTION_KEY: process.env.WALLET_ENCRYPTION_KEY,
  };

  let prisma: { wallet: { findUnique: jest.Mock } };
  let service: SignerService;

  beforeAll(() => {
    process.env.SEPOLIA_RPC_URL = 'http://127.0.0.1:8545';
    process.env.BACKEND_SIGNER_PRIVATE_KEY = sharedPk;
    process.env.WALLET_ENCRYPTION_KEY = encryptionKey;
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  beforeEach(() => {
    prisma = {
      wallet: {
        findUnique: jest.fn(),
      },
    };
    service = new SignerService(prisma as any);
  });

  it('builds a per-wallet signer from encryptedPrivateKey (BACKEND_SEC)', () => {
    const eoa = Wallet.createRandom();
    const encrypted = encryptPrivateKey(eoa.privateKey);

    const signer = service.getSignerForWallet({
      id: 'w-backend',
      address: eoa.address,
      walletType: 'BACKEND_SEC',
      encryptedPrivateKey: encrypted,
    });

    expect(getAddress(signer.address)).toBe(getAddress(eoa.address));
    expect(getAddress(signer.address)).not.toBe(sharedAddress);
  });

  it('builds a per-wallet signer from encryptedPrivateKey (MULTISIG)', () => {
    const eoa = Wallet.createRandom();
    const encrypted = encryptPrivateKey(eoa.privateKey);

    const signer = service.getSignerForWallet({
      id: 'w-multisig',
      address: eoa.address,
      walletType: 'MULTISIG',
      encryptedPrivateKey: encrypted,
    });

    expect(getAddress(signer.address)).toBe(getAddress(eoa.address));
    expect(getAddress(signer.address)).not.toBe(sharedAddress);
  });

  it('rejects address mismatch before any broadcast', () => {
    const eoa = Wallet.createRandom();
    const other = Wallet.createRandom();
    const encrypted = encryptPrivateKey(eoa.privateKey);

    expect(() =>
      service.getSignerForWallet({
        id: 'w-mismatch',
        address: other.address,
        walletType: 'BACKEND_SEC',
        encryptedPrivateKey: encrypted,
      }),
    ).toThrow(WalletSignerError);

    try {
      service.getSignerForWallet({
        id: 'w-mismatch',
        address: other.address,
        walletType: 'BACKEND_SEC',
        encryptedPrivateKey: encrypted,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(WalletSignerError);
      expect((error as WalletSignerError).code).toBe(
        'WALLET_SIGNER_ADDRESS_MISMATCH',
      );
      expect((error as Error).message).not.toMatch(/0x[0-9a-fA-F]{64}/);
      expect((error as Error).message).not.toContain(encrypted);
    }
  });

  it('rejects missing encrypted key when shared signer address differs', () => {
    const other = Wallet.createRandom();

    expect(() =>
      service.getSignerForWallet({
        id: 'w-missing',
        address: other.address,
        walletType: 'BACKEND_SEC',
        encryptedPrivateKey: null,
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'WALLET_ENCRYPTED_KEY_MISSING',
      }),
    );
  });

  it('allows legacy shared-signer fallback only when addresses match', () => {
    const signer = service.getSignerForWallet({
      id: 'w-legacy',
      address: sharedAddress,
      walletType: 'BACKEND_SEC',
      encryptedPrivateKey: null,
    });

    expect(getAddress(signer.address)).toBe(sharedAddress);
    expect(signer).toBe(service.getSigner());
  });

  it('rejects unsupported wallet types', () => {
    expect(() =>
      service.getSignerForWallet({
        id: 'w-sss',
        address: sharedAddress,
        walletType: 'SSS',
        encryptedPrivateKey: null,
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'WALLET_SIGNER_UNSUPPORTED_TYPE',
      }),
    );
  });

  it('getWalletSigner loads wallet by id', async () => {
    const eoa = Wallet.createRandom();
    const encrypted = encryptPrivateKey(eoa.privateKey);
    prisma.wallet.findUnique.mockResolvedValue({
      id: 'w-load',
      address: eoa.address,
      walletType: 'MULTISIG',
      encryptedPrivateKey: encrypted,
    });

    const signer = await service.getWalletSigner('w-load');
    expect(getAddress(signer.address)).toBe(getAddress(eoa.address));
    expect(prisma.wallet.findUnique).toHaveBeenCalledWith({
      where: { id: 'w-load' },
      select: {
        id: true,
        address: true,
        walletType: true,
        encryptedPrivateKey: true,
      },
    });
  });

  it('getWalletSigner throws WALLET_NOT_FOUND', async () => {
    prisma.wallet.findUnique.mockResolvedValue(null);
    await expect(service.getWalletSigner('missing')).rejects.toMatchObject({
      code: 'WALLET_NOT_FOUND',
    });
  });
});
