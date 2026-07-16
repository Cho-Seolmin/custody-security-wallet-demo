import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WithdrawalAuditService } from '../withdrawal-audit.service';
import { SignerService } from '../signer.service';
import { ExecutorResult } from './executor.types';
import { stripSignedTxFromMetadata } from '../withdraw-metadata.util';

@Injectable()
export class SssExecutor {
  private readonly logger = new Logger(SssExecutor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly withdrawalAuditService: WithdrawalAuditService,
    private readonly signerService: SignerService,
  ) {}

  async execute(params: {
    walletId: string;
    withdrawRequestId: string;
    toAddress: string;
    amountWei: bigint;
  }): Promise<ExecutorResult> {
    const request = await this.prisma.withdrawRequest.findUnique({
      where: { id: params.withdrawRequestId },
    });

    const metadata = request?.metadata as Record<string, any> | null;
    const signedTx = metadata?.sssSignedTx;

    if (!signedTx) {
      throw new BadRequestException('SSS signedTx not found');
    }

    const provider = this.signerService.getProvider();

    const tx = await provider.broadcastTransaction(signedTx);
    const receipt = await tx.wait();

    const sanitizedMetadata = stripSignedTxFromMetadata(metadata);

    await this.prisma.withdrawRequest.update({
      where: { id: params.withdrawRequestId },
      data: {
        metadata:
          sanitizedMetadata === null
            ? Prisma.JsonNull
            : (sanitizedMetadata as Prisma.InputJsonValue),
      },
    });

    await this.withdrawalAuditService.append({
      withdrawRequestId: params.withdrawRequestId,
      walletId: params.walletId,
      eventType: 'SSS_SIGNED_TX_BROADCASTED',
      actorType: 'SIGNER',
      message: 'SSS signed transaction broadcasted',
      data: {
        txHash: tx.hash,
        blockNumber: receipt?.blockNumber ?? null,
        signerType: 'CLIENT_SIDE_SIGNED_TX',
      },
    });

    this.logger.log(
      `SSS signedTx broadcasted: walletId=${params.walletId}, txHash=${tx.hash}`,
    );

    return {
      type: 'ONCHAIN_TX',
      txHash: tx.hash,
      blockNumber: receipt?.blockNumber ?? null,
      receipt,
    };
  }
}
