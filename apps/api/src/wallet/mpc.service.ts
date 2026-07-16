import { Injectable, Logger } from '@nestjs/common';
import { DfnsApiClient } from '@dfns/sdk';
import { AsymmetricKeySigner } from '@dfns/sdk-keysigner';
import { readFileSync } from 'fs';
import { JsonRpcProvider } from 'ethers';

type DfnsTransferStatus =
  | 'Pending'
  | 'AwaitingApproval'
  | 'Broadcasted'
  | 'Confirmed'
  | 'Failed'
  | 'Rejected'
  | 'Cancelled';

@Injectable()
export class MpcService {
  private readonly logger = new Logger(MpcService.name);
  private readonly dfns: DfnsApiClient;
  private readonly walletId: string;
  private readonly provider: JsonRpcProvider;

  constructor() {
    const baseUrl = process.env.DFNS_BASE_URL;
    const orgId = process.env.DFNS_ORG_ID;
    const authToken = process.env.DFNS_AUTH_TOKEN;
    const credId = process.env.DFNS_CREDENTIAL_ID;
    const privateKeyPath = process.env.DFNS_PRIVATE_KEY_PATH;
    if (!privateKeyPath) throw new Error('DFNS_PRIVATE_KEY_PATH is missing');

    const privateKey = readFileSync(privateKeyPath, 'utf8').trim();
    const walletId = process.env.DFNS_WALLET_ID;
    const rpc = process.env.SEPOLIA_RPC_URL;

    if (!baseUrl) throw new Error('DFNS_BASE_URL is missing');
    if (!orgId) throw new Error('DFNS_ORG_ID is missing');
    if (!authToken) throw new Error('DFNS_AUTH_TOKEN is missing');
    if (!credId) throw new Error('DFNS_CREDENTIAL_ID is missing');
    if (!privateKey) throw new Error('DFNS_PRIVATE_KEY_PEM is missing');
    if (!walletId) throw new Error('DFNS_WALLET_ID is missing');
    if (!rpc) throw new Error('SEPOLIA_RPC_URL is missing');

    const signer = new AsymmetricKeySigner({
      credId,
      privateKey,
    });

    this.dfns = new DfnsApiClient({
      baseUrl,
      orgId,
      authToken,
      signer,
    });

    this.walletId = walletId;
    this.provider = new JsonRpcProvider(rpc);
  }

  async getWalletAddress(): Promise<string> {
    const wallet = await this.dfns.wallets.getWallet({
      walletId: this.walletId,
    });

    if (!wallet.address) {
      throw new Error('DFNS wallet address is missing');
    }

    return wallet.address;
  }

  async getBalance(): Promise<bigint> {
    const address = await this.getWalletAddress();
    return this.provider.getBalance(address);
  }

  async createTransfer(params: {
    toAddress: string;
    amountWei: bigint;
  }): Promise<{
    externalRequestId: string;
    raw: unknown;
  }> {
    try {
      const transfer = await this.dfns.wallets.transferAsset({
        walletId: this.walletId,
        body: {
          kind: 'Native',
          to: params.toAddress,
          amount: params.amountWei.toString(),
          externalId: `wr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        },
      });

      this.logger.log(
        `DFNS transfer requested: walletId=${this.walletId}, transferId=${transfer.id}, status=${transfer.status}, to=${params.toAddress}, amount=${params.amountWei.toString()}`,
      );

      return {
        externalRequestId: transfer.id,
        raw: transfer,
      };
    } catch (error: any) {
      const message = error?.message || 'Unknown DFNS transfer error';
      this.logger.error(`DFNS createTransfer failed: ${message}`);
      throw new Error(`MPC_TRANSFER_CREATE_FAILED: ${message}`);
    }
  }

  async getTransferStatus(params: {
    externalRequestId: string;
    submittedAt?: string;
  }): Promise<{
    status: 'PENDING' | 'CONFIRMED' | 'FAILED';
    txHash?: string;
    raw?: unknown;
  }> {
    try {
      const transfer = await this.dfns.wallets.getTransfer({
        walletId: this.walletId,
        transferId: params.externalRequestId,
      });

      const mapped = this.mapTransferStatus(
        transfer.status as DfnsTransferStatus,
      );

      this.logger.log(
        `DFNS transfer status: transferId=${transfer.id}, status=${transfer.status}, mapped=${mapped}`,
      );

      return {
        status: mapped,
        txHash: (transfer as any).txHash ?? undefined,
        raw: transfer,
      };
    } catch (error: any) {
      const message = error?.message || 'Unknown DFNS status error';
      this.logger.error(`DFNS getTransferStatus failed: ${message}`);
      throw new Error(`MPC_TRANSFER_STATUS_FAILED: ${message}`);
    }
  }

  private mapTransferStatus(
    status: DfnsTransferStatus | string,
  ): 'PENDING' | 'CONFIRMED' | 'FAILED' {
    switch (status) {
      case 'Pending':
      case 'AwaitingApproval':
      case 'Broadcasted':
        return 'PENDING';

      case 'Confirmed':
        return 'CONFIRMED';

      case 'Failed':
      case 'Rejected':
      case 'Cancelled':
        return 'FAILED';

      default:
        return 'PENDING';
    }
  }
}
