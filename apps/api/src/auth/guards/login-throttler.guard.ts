import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: { ip?: string }): Promise<string> {
    return Promise.resolve(`login:${req.ip ?? 'unknown'}`);
  }
}
