import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SignerService } from '../wallet/signer.service';
import { KmsService } from '../wallet/kms.service';
import { MpcService } from '../wallet/mpc.service';
import { WithdrawGateway } from '../wallet/withdraw.gateway';
import { isOtpConfigured } from '../auth/totp.util';

@Injectable()
export class SystemService {
  private readonly logger = new Logger(SystemService.name);

  constructor(
    private prisma: PrismaService,
    private signerService: SignerService,
    private kmsService: KmsService,
    private mpcService: MpcService,
    private withdrawGateway: WithdrawGateway,
  ) {}

  async getHealth() {
    const queuePending = await this.prisma.withdrawalQueue.count({
      where: { status: 'PENDING' },
    });

    const queueRunning = await this.prisma.withdrawalQueue.count({
      where: { status: 'RUNNING' },
    });

    const queueDead = await this.prisma.withdrawalQueue.count({
      where: { status: 'DEAD' },
    });

    const signerAddress = await this.signerService.getSignerAddress();
    const signerBalance = await this.signerService.getSignerBalance();

    return {
      queuePending,
      queueRunning,
      queueDead,
      workerActive: true,
      signerAddress,
      signerBalanceWei: signerBalance.toString(),
    };
  }

  private isConfigured(value: string | undefined): boolean {
    if (!value) return false;
    return !value.startsWith('your-') && value !== '0x...';
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    // If the timeout wins the race, `promise` keeps running in the
    // background and may reject later with nothing awaiting it, which
    // Node treats as an unhandled rejection. Attach a no-op catch so a
    // slow external call can never crash the process.
    promise.catch(() => {});

    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), ms),
      ),
    ]);
  }

  async getStatus() {
    let dbConnected = true;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbConnected = false;
    }

    let sepoliaRpcConnected = false;
    try {
      await this.withTimeout(
        this.signerService.getProvider().getBlockNumber(),
        3000,
      );
      sepoliaRpcConnected = true;
    } catch {
      sepoliaRpcConnected = false;
    }

    let dfnsConnected = false;
    if (
      this.isConfigured(process.env.DFNS_AUTH_TOKEN) &&
      this.isConfigured(process.env.DFNS_WALLET_ID)
    ) {
      try {
        // Lightweight read-only call: verifies the auth token + wallet id
        // actually resolve against the live DFNS API, not just "is set".
        await this.withTimeout(this.mpcService.getWalletAddress(), 5000);
        dfnsConnected = true;
      } catch (err) {
        this.logger.warn(`DFNS live check failed: ${(err as Error)?.message}`);
        dfnsConnected = false;
      }
    }

    let awsKmsConnected = false;
    if (
      this.isConfigured(process.env.AWS_ACCESS_KEY_ID) &&
      this.isConfigured(process.env.AWS_KMS_KEY_ID)
    ) {
      try {
        // Lightweight read-only call: actually asks AWS KMS for the public
        // key, which proves both the credentials and the key id are valid.
        await this.withTimeout(this.kmsService.getPublicKey(), 5000);
        awsKmsConnected = true;
      } catch (err) {
        this.logger.warn(
          `AWS KMS live check failed: ${(err as Error)?.message}`,
        );
        awsKmsConnected = false;
      }
    }

    // The Socket.IO server is attached to this same process during Nest's
    // gateway bootstrap; if it's missing/unusable, real-time updates are down.
    const websocketConnected =
      !!this.withdrawGateway.server &&
      typeof this.withdrawGateway.server.emit === 'function';

    const otpConfigured = isOtpConfigured();

    return {
      apiStatus: 'OK',
      backendOnline: true,
      dbConnected,
      websocketConnected,
      sepoliaRpcConnected,
      dfnsConnected,
      awsKmsConnected,
      otpConfigured,
      network: 'Sepolia Testnet',
      serverTime: new Date().toISOString(),
    };
  }
}
