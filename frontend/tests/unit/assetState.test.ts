import { describe, expect, it, vi } from 'vitest';
import {
  assetQueryKeys, isCurrentAssetResponse, promoteVerifiedAsset,
  revokeAssetObjectUrl, stripTransientAssetCapabilities,
} from '../../src/features/assets/assetState';

const organizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const assetId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('SPEC-31 browser asset isolation', () => {
  it('partitions all durable keys by immutable organization and context epoch', () => {
    const state = { organizationId, contextEpoch: 4 };
    expect(assetQueryKeys.detail(state, assetId)).toEqual(['assets', organizationId, 4, 'detail', assetId]);
    expect(assetQueryKeys.uploadSession(state, assetId, 'session')).toEqual([
      'assets', organizationId, 4, 'upload-session', assetId, 'session',
    ]);
    expect(isCurrentAssetResponse(state, { ...state })).toBe(true);
    expect(isCurrentAssetResponse(state, { ...state, contextEpoch: 5 })).toBe(false);
  });

  it('promotes successful files to stable asset IDs and removes transient URLs', () => {
    expect(promoteVerifiedAsset({
      asset_id: assetId, display_filename: 'dni.pdf', mime_type: 'application/pdf', size_bytes: 100,
    })).toEqual({
      asset_id: assetId, display_filename: 'dni.pdf', mime_type: 'application/pdf',
      size_bytes: 100, state: 'verified',
    });
    expect(stripTransientAssetCapabilities({
      asset_id: assetId, upload_url: 'secret-upload', view_url: 'secret-view', signed_url: 'secret',
    })).toEqual({ asset_id: assetId });
  });

  it('revokes local previews during removal, logout, or organization switch', () => {
    const revoke = vi.fn();
    revokeAssetObjectUrl('blob:private-preview', revoke);
    revokeAssetObjectUrl('https://example.test/not-local', revoke);
    expect(revoke).toHaveBeenCalledOnce();
  });
});
