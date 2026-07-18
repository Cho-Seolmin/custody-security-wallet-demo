import { readFileSync } from 'fs';

type ReadFileSync = typeof readFileSync;

/**
 * Rebuild a PEM whose newlines were stripped (common when pasting into a
 * PaaS env var). Splits header / base64 body / footer back onto separate
 * lines so OpenSSL can decode it. No-op when newlines are already present.
 */
function normalizePem(pem: string): string {
  if (pem.includes('\n')) {
    return pem;
  }

  const match = pem.match(
    /^(-----BEGIN [A-Z0-9 ]+-----)([\s\S]*?)(-----END [A-Z0-9 ]+-----)\s*$/,
  );
  if (!match) {
    return pem;
  }

  const header = match[1];
  const footer = match[3];
  const body = match[2].replace(/\s+/g, '');
  const wrapped = body.match(/.{1,64}/g)?.join('\n') ?? body;
  return `${header}\n${wrapped}\n${footer}\n`;
}

/**
 * Load DFNS credential PEM for AsymmetricKeySigner.
 * Priority: DFNS_PRIVATE_KEY_PEM (env) → DFNS_PRIVATE_KEY_PATH (file fallback).
 * Never log or include secret contents in thrown errors.
 */
export function loadDfnsPrivateKeyPem(
  env: NodeJS.ProcessEnv = process.env,
  readFile: ReadFileSync = readFileSync,
): string {
  const pemEnv = env.DFNS_PRIVATE_KEY_PEM;
  if (typeof pemEnv === 'string' && pemEnv.trim().length > 0) {
    return normalizePem(pemEnv.replace(/\\n/g, '\n').trim());
  }

  const keyPath = env.DFNS_PRIVATE_KEY_PATH;
  if (typeof keyPath === 'string' && keyPath.trim().length > 0) {
    const fromFile = readFile(keyPath.trim(), 'utf8').trim();
    if (!fromFile) {
      throw new Error('DFNS_PRIVATE_KEY_PATH file is empty');
    }
    return normalizePem(fromFile);
  }

  throw new Error(
    'DFNS private key is missing: set DFNS_PRIVATE_KEY_PEM or DFNS_PRIVATE_KEY_PATH',
  );
}
