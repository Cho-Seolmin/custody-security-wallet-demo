import { Injectable, Logger } from '@nestjs/common';
import { WalletType } from '@prisma/client';
import { getAddress, JsonRpcProvider, TransactionResponse, Wallet } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { decryptPrivateKey } from '../common/crypto/wallet-key-encryption';
import { WalletSignerError } from './wallet-signer.errors';

type SignerWalletRow = {
  id: string;
  address: string;
  walletType: WalletType;
  encryptedPrivateKey: string | null;
};

@Injectable()
export class SignerService {
  private readonly logger = new Logger(SignerService.name);
  private readonly provider: JsonRpcProvider;
  private readonly signer: Wallet;

  constructor(private readonly prisma: PrismaService) {
    const rpc = process.env.SEPOLIA_RPC_URL;
    if (!rpc) {
      throw new Error('SEPOLIA_RPC_URL is missing in .env');
    }

    const pk = process.env.BACKEND_SIGNER_PRIVATE_KEY;
    if (!pk) {
      throw new Error('BACKEND_SIGNER_PRIVATE_KEY missing');
    }

    this.provider = new JsonRpcProvider(rpc);
    this.signer = new Wallet(pk, this.provider);
  }

  getProvider(): JsonRpcProvider {
    return this.provider;
  }

  /**
   * Shared env signer (POLICY_GUARD gas/signing, legacy demo fallback, health).
   * Newly provisioned BACKEND_SEC / MULTISIG must use getWalletSigner instead.
   */
  getSigner(): Wallet {
    return this.signer;
  }

  async getSignerAddress(): Promise<string> {
    return this.signer.getAddress();
  }

  async getSignerBalance(): Promise<bigint> {
    const address = await this.getSignerAddress();
    return this.provider.getBalance(address);
  }

  async sendNativeTransaction(
    to: string,
    amountWei: bigint,
  ): Promise<TransactionResponse> {
    return this.signer.sendTransaction({
      to,
      value: amountWei,
    });
  }

  /**
   * Build an ephemeral Sepolia signer for BACKEND_SEC / MULTISIG withdrawals.
   * Decrypts Wallet.encryptedPrivateKey when present; otherwise allows legacy
   * shared-signer fallback only if addresses match exactly.
   * Do not cache the returned Wallet.
   */
  async getWalletSigner(walletId: string): Promise<Wallet> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
      select: {
        id: true,
        address: true,
        walletType: true,
        encryptedPrivateKey: true,
      },
    });

    if (!wallet) {
      throw new WalletSignerError('WALLET_NOT_FOUND', 'Wallet not found');
    }

    return this.getSignerForWallet(wallet);
  }

  /**
   * Same rules as getWalletSigner when the Wallet row is already loaded.
   */
  getSignerForWallet(wallet: SignerWalletRow): Wallet {
    if (
      wallet.walletType !== 'BACKEND_SEC' &&
      wallet.walletType !== 'MULTISIG'
    ) {
      throw new WalletSignerError(
        'WALLET_SIGNER_UNSUPPORTED_TYPE',
        `Unsupported wallet type for local signing: ${wallet.walletType}`,
      );
    }

    if (wallet.encryptedPrivateKey) {
      return this.createSignerFromEncryptedKey(
        wallet.id,
        wallet.address,
        wallet.encryptedPrivateKey,
      );
    }

    return this.getLegacySharedSignerFallback(wallet);
  }

  private createSignerFromEncryptedKey(
    walletId: string,
    walletAddress: string,
    encryptedPrivateKey: string,
  ): Wallet {
    let privateKey: string;
    try {
      privateKey = decryptPrivateKey(encryptedPrivateKey);
    } catch {
      throw new WalletSignerError(
        'WALLET_KEY_DECRYPTION_FAILED',
        'Failed to decrypt wallet signing key',
      );
    }

    let signer: Wallet;
    try {
      signer = new Wallet(privateKey, this.provider);
    } catch {
      throw new WalletSignerError(
        'WALLET_PRIVATE_KEY_INVALID',
        'Decrypted private key is invalid',
      );
    }

    const derived = getAddress(signer.address);
    const expected = getAddress(walletAddress);
    if (derived !== expected) {
      this.logger.error(
        `WALLET_SIGNER_ADDRESS_MISMATCH walletId=${walletId} expected=${expected} derived=${derived}`,
      );
      throw new WalletSignerError(
        'WALLET_SIGNER_ADDRESS_MISMATCH',
        'Signer address does not match wallet address',
      );
    }

    return signer;
  }

  /**
   * Legacy demo rows (e.g. pre-provisioned test account) may lack
   * encryptedPrivateKey. Fallback is allowed only when the shared env signer
   * address exactly equals Wallet.address.
   */
  private getLegacySharedSignerFallback(wallet: SignerWalletRow): Wallet {
    const sharedAddress = getAddress(this.signer.address);
    const walletAddress = getAddress(wallet.address);

    if (sharedAddress !== walletAddress) {
      throw new WalletSignerError(
        'WALLET_ENCRYPTED_KEY_MISSING',
        'Wallet has no encrypted signing key and does not match the legacy shared signer',
      );
    }

    this.logger.warn(
      `Legacy shared-signer fallback walletId=${wallet.id} walletType=${wallet.walletType} address=${walletAddress}`,
    );

    return this.signer;
  }
}
