import { loadDfnsPrivateKeyPem } from './dfns-private-key.util';

const SAMPLE_PEM = `-----BEGIN PRIVATE KEY-----
LINEONE
LINETWO
-----END PRIVATE KEY-----`;

const SAMPLE_PEM_ESCAPED =
  '-----BEGIN PRIVATE KEY-----\\nLINEONE\\nLINETWO\\n-----END PRIVATE KEY-----';

describe('loadDfnsPrivateKeyPem', () => {
  it('prefers DFNS_PRIVATE_KEY_PEM over DFNS_PRIVATE_KEY_PATH', () => {
    const readFile = jest.fn();

    const result = loadDfnsPrivateKeyPem(
      {
        DFNS_PRIVATE_KEY_PEM: SAMPLE_PEM,
        DFNS_PRIVATE_KEY_PATH: '/secret/should-not-read.pem',
      },
      readFile as never,
    );

    expect(result).toBe(SAMPLE_PEM);
    expect(readFile).not.toHaveBeenCalled();
  });

  it('converts escaped \\n sequences into actual newlines', () => {
    const result = loadDfnsPrivateKeyPem(
      { DFNS_PRIVATE_KEY_PEM: SAMPLE_PEM_ESCAPED },
      jest.fn() as never,
    );

    expect(result).toBe(SAMPLE_PEM);
    expect(result).toContain('\n');
    expect(result).not.toContain('\\n');
  });

  it('falls back to DFNS_PRIVATE_KEY_PATH when PEM env is absent', () => {
    const readFile = jest.fn().mockReturnValue(`  ${SAMPLE_PEM}  `);

    const result = loadDfnsPrivateKeyPem(
      { DFNS_PRIVATE_KEY_PATH: '/tmp/dfns.pem' },
      readFile as never,
    );

    expect(readFile).toHaveBeenCalledWith('/tmp/dfns.pem', 'utf8');
    expect(result).toBe(SAMPLE_PEM);
  });

  it('does not attempt file access when PEM env exists', () => {
    const readFile = jest.fn();

    loadDfnsPrivateKeyPem(
      { DFNS_PRIVATE_KEY_PEM: SAMPLE_PEM_ESCAPED },
      readFile as never,
    );

    expect(readFile).not.toHaveBeenCalled();
  });

  it('throws a safe error when both sources are missing', () => {
    expect(() => loadDfnsPrivateKeyPem({}, jest.fn() as never)).toThrow(
      'DFNS private key is missing: set DFNS_PRIVATE_KEY_PEM or DFNS_PRIVATE_KEY_PATH',
    );
  });

  it('does not include secret contents in thrown errors', () => {
    const secretMarker = 'SUPER_SECRET_PEM_MATERIAL_XYZ';

    try {
      loadDfnsPrivateKeyPem(
        { DFNS_PRIVATE_KEY_PATH: '/tmp/empty.pem' },
        jest.fn().mockReturnValue(`   `) as never,
      );
      fail('expected throw');
    } catch (error) {
      const message = String(error);
      expect(message).toContain('DFNS_PRIVATE_KEY_PATH');
      expect(message).not.toContain(secretMarker);
      expect(message).not.toContain('BEGIN PRIVATE KEY');
    }

    try {
      loadDfnsPrivateKeyPem({}, jest.fn() as never);
      fail('expected throw');
    } catch (error) {
      const message = String(error);
      expect(message).toContain('DFNS_PRIVATE_KEY_PEM');
      expect(message).toContain('DFNS_PRIVATE_KEY_PATH');
      expect(message).not.toContain(secretMarker);
      expect(message).not.toContain('BEGIN');
    }
  });
});
