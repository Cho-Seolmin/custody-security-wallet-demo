export type ExecutorResult =
  | {
      type: 'ONCHAIN_TX';
      txHash: string;
      blockNumber?: number | null;
      receipt?: unknown;
    }
  | {
      type: 'EXTERNAL_PENDING';
      externalRequestId: string;
      provider: 'MPC' | 'KMS';
      raw?: unknown;
    };
