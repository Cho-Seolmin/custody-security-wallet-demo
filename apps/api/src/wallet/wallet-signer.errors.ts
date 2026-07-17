export type WalletSignerErrorCode =
  | 'WALLET_NOT_FOUND'
  | 'WALLET_SIGNER_UNSUPPORTED_TYPE'
  | 'WALLET_ENCRYPTED_KEY_MISSING'
  | 'WALLET_KEY_DECRYPTION_FAILED'
  | 'WALLET_PRIVATE_KEY_INVALID'
  | 'WALLET_SIGNER_ADDRESS_MISMATCH';

/**
 * Signing-path errors that are safe to surface as codes/messages
 * (never include private key material).
 */
export class WalletSignerError extends Error {
  readonly code: WalletSignerErrorCode;

  constructor(code: WalletSignerErrorCode, message: string) {
    super(message);
    this.name = 'WalletSignerError';
    this.code = code;
  }
}
