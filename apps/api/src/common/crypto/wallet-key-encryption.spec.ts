import { encryptPrivateKey, decryptPrivateKey } from './wallet-key-encryption';

describe('wallet-key-encryption', () => {
  const original = process.env.WALLET_ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.WALLET_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  });

  afterAll(() => {
    if (original === undefined) {
      delete process.env.WALLET_ENCRYPTION_KEY;
    } else {
      process.env.WALLET_ENCRYPTION_KEY = original;
    }
  });

  it('round-trips a private key without leaking format details in plaintext equality', () => {
    const pk = '0x' + 'ab'.repeat(32);
    const encrypted = encryptPrivateKey(pk);
    expect(encrypted).not.toContain(pk);
    expect(encrypted.split(':')).toHaveLength(3);
    expect(decryptPrivateKey(encrypted)).toBe(pk);
  });

  it('produces different ciphertexts for the same input (random IV)', () => {
    const pk = '0x' + 'cd'.repeat(32);
    const a = encryptPrivateKey(pk);
    const b = encryptPrivateKey(pk);
    expect(a).not.toBe(b);
    expect(decryptPrivateKey(a)).toBe(pk);
    expect(decryptPrivateKey(b)).toBe(pk);
  });
});
