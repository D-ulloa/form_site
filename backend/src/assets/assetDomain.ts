import path from 'node:path';
import { PlatformError } from '../platform/errors.js';
import type { AssetReceiverPolicy } from './receiverPolicy.js';
import type {
  AssetAuthorizationContext, AssetState, ProviderObjectMetadata, StoredAssetRecord,
  UploadIntentState, UploadSessionState,
} from './types.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function sanitizeAssetFilename(rawName: string): string {
  const safe = path.basename(rawName).normalize('NFKD').replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^a-zA-Z0-9._-]/gu, '_').replace(/^[._-]+/u, '').slice(0, 120);
  return safe || 'file';
}

export function buildOrganizationAssetPath(input: {
  readonly organization_id: string; readonly domain: 'contracts' | 'properties' | 'branding' | 'exports';
  readonly owner_id: string; readonly asset_id: string; readonly original_filename: string;
}): string {
  if (![input.organization_id, input.owner_id, input.asset_id].every((value) => UUID.test(value))) {
    throw new Error('INVALID_ASSET_PATH_SCOPE');
  }
  return `organizations/${input.organization_id}/${input.domain}/${input.owner_id}/${input.asset_id}/${sanitizeAssetFilename(input.original_filename)}`;
}

const ASSET_TRANSITIONS: Readonly<Record<AssetState, ReadonlySet<AssetState>>> = Object.freeze({
  pending: new Set<AssetState>(['uploaded', 'quarantined', 'deleting']),
  uploaded: new Set<AssetState>(['verifying', 'quarantined', 'deleting']),
  verifying: new Set<AssetState>(['verified', 'quarantined', 'uploaded']),
  verified: new Set<AssetState>(['attached', 'quarantined', 'deleting']),
  quarantined: new Set<AssetState>(['verifying', 'deleting']),
  attached: new Set<AssetState>(['quarantined', 'deleting']),
  deleting: new Set<AssetState>(['deleted', 'deletion_failed']),
  deleted: new Set<AssetState>(),
  deletion_failed: new Set<AssetState>(['deleting']),
});

export function assertAssetTransition(current: AssetState, next: AssetState): void {
  if (current === next) return;
  if (!ASSET_TRANSITIONS[current].has(next)) throw new PlatformError('VERSION_CONFLICT');
}

export function assertUploadSessionUsable(
  state: UploadSessionState,
  expiresAt: string,
  now = new Date(),
): void {
  if (state !== 'open' || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= now.getTime()) {
    throw new PlatformError('VERSION_CONFLICT');
  }
}

export function assertUploadIntentUsable(state: UploadIntentState): void {
  if (state !== 'pending' && state !== 'url_issued' && state !== 'uploaded') {
    throw new PlatformError('VERSION_CONFLICT');
  }
}

export function verifyProviderObject(
  asset: StoredAssetRecord,
  metadata: ProviderObjectMetadata,
  policy: AssetReceiverPolicy,
): void {
  const compatibleDetectedType = !policy.require_content_detection
    || (metadata.detected_mime !== undefined && policy.allowed_mime_types.has(metadata.detected_mime));
  if (asset.bucket_name !== metadata.bucket_name || asset.object_path !== metadata.object_path
    || metadata.bytes !== asset.declared_bytes || metadata.bytes > policy.maximum_bytes
    || !policy.allowed_mime_types.has(metadata.provider_mime) || !compatibleDetectedType
    || (policy.require_checksum && metadata.checksum_sha256 !== asset.checksum_value)) {
    throw new Error('ASSET_METADATA_MISMATCH');
  }
}

export function authorizeAssetRead(
  context: AssetAuthorizationContext,
  asset: Pick<StoredAssetRecord, 'organization_id' | 'state'>,
  ownerVisible: boolean,
): void {
  if (asset.organization_id !== context.scope.organization_id || !ownerVisible) throw new PlatformError('NOT_FOUND');
  if (!context.capabilities.has('files.read')) throw new PlatformError('FORBIDDEN');
  if (asset.state === 'quarantined' || asset.state === 'deleting' || asset.state === 'deleted'
    || asset.state === 'deletion_failed') throw new PlatformError('NOT_FOUND');
  if (asset.state !== 'attached' && asset.state !== 'verified') throw new PlatformError('NOT_FOUND');
}

export function canPhysicallyDeleteAsset(asset: Pick<StoredAssetRecord,
  'state' | 'legal_hold_reference' | 'retain_until'>, associated: boolean, now = new Date()): boolean {
  if (associated || asset.legal_hold_reference !== null) return false;
  if (asset.state !== 'deleting' && asset.state !== 'deletion_failed') return false;
  return asset.retain_until === null || Date.parse(asset.retain_until) <= now.getTime();
}

export function validatePropertyAssetLayout(items: readonly {
  readonly asset_id: string; readonly role: 'image' | 'video'; readonly sort_order: number; readonly is_cover: boolean;
}[]): void {
  const ids = new Set<string>();
  const orders = new Set<number>();
  let covers = 0;
  for (const item of items) {
    if (ids.has(item.asset_id) || orders.has(item.sort_order) || item.sort_order < 0) throw new Error('INVALID_MEDIA_ORDER');
    if (item.is_cover && item.role !== 'image') throw new Error('INVALID_MEDIA_COVER');
    ids.add(item.asset_id); orders.add(item.sort_order); covers += Number(item.is_cover);
  }
  if (covers > 1) throw new Error('INVALID_MEDIA_COVER');
}

export function safeContentDisposition(
  policy: AssetReceiverPolicy,
  filename: string,
): string {
  const disposition = policy.download_disposition;
  return `${disposition}; filename="${sanitizeAssetFilename(filename).replace(/["\\]/gu, '_')}"`;
}
