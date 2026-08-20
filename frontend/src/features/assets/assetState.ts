const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface AssetTenantState {
  readonly organizationId: string;
  readonly contextEpoch: number;
}

export type BrowserAssetState = 'selected' | 'uploading' | 'verifying' | 'verified'
  | 'attached' | 'quarantined' | 'expired' | 'removed' | 'failed';

function tenantPrefix(state: AssetTenantState): readonly ['assets', string, number] {
  if (!UUID.test(state.organizationId) || !Number.isSafeInteger(state.contextEpoch)
    || state.contextEpoch < 1) throw new Error('INVALID_ASSET_TENANT_STATE');
  return ['assets', state.organizationId, state.contextEpoch] as const;
}

export const assetQueryKeys = Object.freeze({
  all: (state: AssetTenantState) => tenantPrefix(state),
  detail: (state: AssetTenantState, assetId: string) => [...tenantPrefix(state), 'detail', assetId] as const,
  uploadSession: (state: AssetTenantState, ownerId: string, sessionId: string) =>
    [...tenantPrefix(state), 'upload-session', ownerId, sessionId] as const,
});

export interface StableAssetReference {
  readonly asset_id: string;
  readonly display_filename: string;
  readonly mime_type: string;
  readonly size_bytes: number;
  readonly state: Extract<BrowserAssetState, 'verified' | 'attached'>;
}

export function promoteVerifiedAsset(input: {
  readonly asset_id: string; readonly display_filename: string;
  readonly mime_type: string; readonly size_bytes: number;
}): StableAssetReference {
  if (!UUID.test(input.asset_id) || !input.display_filename.trim()
    || !Number.isSafeInteger(input.size_bytes) || input.size_bytes < 1) throw new Error('INVALID_ASSET_REFERENCE');
  return Object.freeze({ ...input, state: 'verified' });
}

export function isCurrentAssetResponse(response: AssetTenantState, current: AssetTenantState): boolean {
  return response.organizationId === current.organizationId && response.contextEpoch === current.contextEpoch;
}

export function stripTransientAssetCapabilities<T extends Readonly<Record<string, unknown>>>(value: T): Omit<T,
  'upload_url' | 'view_url' | 'download_url' | 'signed_url'> {
  const stable: Record<string, unknown> = { ...value };
  for (const key of ['upload_url', 'view_url', 'download_url', 'signed_url']) delete stable[key];
  return stable as Omit<T, 'upload_url' | 'view_url' | 'download_url' | 'signed_url'>;
}

export function revokeAssetObjectUrl(objectUrl: string | null, revoke = URL.revokeObjectURL): void {
  if (objectUrl?.startsWith('blob:')) revoke(objectUrl);
}
