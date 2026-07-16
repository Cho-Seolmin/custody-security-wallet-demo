import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class WithdrawThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: {
    user?: { sub?: string };
    ip?: string;
  }): Promise<string> {
    const userId = req.user?.sub;
    return Promise.resolve(
      userId ? `withdraw:${userId}` : `withdraw:${req.ip ?? 'unknown'}`,
    );
  }
}
