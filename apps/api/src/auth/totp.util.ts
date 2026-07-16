import * as crypto from 'crypto';
import * as speakeasy from 'speakeasy';

function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is required for account-bound OTP');
  }
  return secret;
}

/** Deterministic per-user TOTP secret derived from JWT_SECRET + userId. */
export function getUserTotpSecret(userId: string): string {
  return crypto
    .createHmac('sha256', requireJwtSecret())
    .update(`totp:v1:${userId}`)
    .digest('hex')
    .slice(0, 32);
}

export function verifyUserTotp(userId: string, token: string): boolean {
  return speakeasy.totp.verify({
    secret: getUserTotpSecret(userId),
    encoding: 'hex',
    token,
    window: 1,
  });
}

export function buildUserTotpAuthUrl(userId: string, email: string): string {
  return speakeasy.otpauthURL({
    secret: getUserTotpSecret(userId),
    label: email,
    issuer: 'Custody Vault Demo',
    encoding: 'hex',
  });
}

export function isOtpConfigured(): boolean {
  return Boolean(process.env.JWT_SECRET);
}
