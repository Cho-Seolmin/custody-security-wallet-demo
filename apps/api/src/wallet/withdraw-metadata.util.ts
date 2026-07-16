export function stripSignedTxFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!metadata) return null;

  const { sssSignedTx: _removed, ...rest } = metadata;
  return rest;
}

export function sanitizeWithdrawMetadataForApi(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  return stripSignedTxFromMetadata(metadata);
}
