import { Injectable, Logger } from '@nestjs/common';
import { ExecutorResult } from './executor.types';
import { MpcService } from '../mpc.service';

@Injectable()
export class MpcExecutor {
  private readonly logger = new Logger(MpcExecutor.name);

  constructor(private readonly mpcService: MpcService) {}

  async execute(params: {
    toAddress: string;
    amountWei: bigint;
  }): Promise<ExecutorResult> {
    const created = await this.mpcService.createTransfer({
      toAddress: params.toAddress,
      amountWei: params.amountWei,
    });

    this.logger.log(
      `MPC execution submitted: requestId=${created.externalRequestId}`,
    );

    return {
      type: 'EXTERNAL_PENDING',
      externalRequestId: created.externalRequestId,
      provider: 'MPC',
      raw: created.raw,
    };
  }
}
