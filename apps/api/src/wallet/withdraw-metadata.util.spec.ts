import {
  sanitizeWithdrawMetadataForApi,
  stripSignedTxFromMetadata,
} from './withdraw-metadata.util';

describe('withdraw-metadata.util', () => {
  it('removes sssSignedTx from metadata', () => {
    const sanitized = stripSignedTxFromMetadata({
      sssSignedTx: '0xsigned',
      sssSigningMode: 'CLIENT_SIDE_SIGNED_TX',
    });

    expect(sanitized).toEqual({
      sssSigningMode: 'CLIENT_SIDE_SIGNED_TX',
    });
  });

  it('returns null when metadata is empty', () => {
    expect(sanitizeWithdrawMetadataForApi(null)).toBeNull();
  });
});
