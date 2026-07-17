import { readFileSync } from 'fs';

type ReadFileSync = typeof readFileSync;

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
    return pemEnv.replace(/\\n/g, '\n').trim();
  }

  const keyPath = env.DFNS_PRIVATE_KEY_PATH;
  if (typeof keyPath === 'string' && keyPath.trim().length > 0) {
    const fromFile = readFile(keyPath.trim(), 'utf8').trim();
    if (!fromFile) {
      throw new Error('DFNS_PRIVATE_KEY_PATH file is empty');
    }
    return fromFile;
  }

  throw new Error(
    'DFNS private key is missing: set DFNS_PRIVATE_KEY_PEM or DFNS_PRIVATE_KEY_PATH',
  );
}
