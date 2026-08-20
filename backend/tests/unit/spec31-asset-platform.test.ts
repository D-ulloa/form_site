import assert from 'node:assert/strict';
import test from 'node:test';
import { createOrganizationScope } from '../../src/platform/scope.js';
import { PlatformError } from '../../src/platform/errors.js';
import {
  assertAssetTransition, authorizeAssetRead, buildOrganizationAssetPath,
  canPhysicallyDeleteAsset, safeContentDisposition, sanitizeAssetFilename,
  validatePropertyAssetLayout, verifyProviderObject,
} from '../../src/assets/assetDomain.js';
import {
  createAssetReceiverRegistry, validateAssetUploadBatch,
} from '../../src/assets/receiverPolicy.js';
import type { AssetAuthorizationContext, StoredAssetRecord } from '../../src/assets/types.js';
import { createAssetService } from '../../src/assets/assetService.js';

const organizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ownerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const assetId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const scope = createOrganizationScope(organizationId);

function asset(overrides: Partial<StoredAssetRecord> = {}): StoredAssetRecord {
  return {
    id: assetId, organization_id: organizationId, storage_provider: 'supabase',
    bucket_name: 'property-media',
    object_path: `organizations/${organizationId}/properties/${ownerId}/${assetId}/front.jpg`,
    original_filename: 'front.jpg', display_filename: 'front.jpg', declared_mime: 'image/jpeg',
    declared_bytes: 120, provider_mime: null, provider_bytes: null, detected_mime: null,
    checksum_algorithm: null, checksum_value: null, category: 'property_image', state: 'uploaded',
    retention_class: 'property_media', retain_until: null, legal_hold_reference: null,
    created_at: new Date(0).toISOString(), verified_at: null, attached_at: null, version: 1,
    ...overrides,
  };
}

test('SPEC-31 generates tenant-prefixed PII-free paths and sanitizes display names', () => {
  const objectPath = buildOrganizationAssetPath({
    organization_id: organizationId, domain: 'properties', owner_id: ownerId, asset_id: assetId,
    original_filename: '../../José DNI 12.345.678.jpg',
  });
  assert.equal(objectPath,
    `organizations/${organizationId}/properties/${ownerId}/${assetId}/Jose_DNI_12.345.678.jpg`);
  assert.equal(sanitizeAssetFilename('../<script>.svg'), 'script_.svg');
  assert.doesNotMatch(objectPath, /José|\.\.\//u);
  assert.throws(() => buildOrganizationAssetPath({
    organization_id: 'azar', domain: 'properties', owner_id: ownerId, asset_id: assetId,
    original_filename: 'x.jpg',
  }), /INVALID_ASSET_PATH_SCOPE/u);
});

test('receiver registry preserves contract rules and denies unknown, oversized, or active content', () => {
  const registry = createAssetReceiverRegistry({ CONTRACT_DNI_MAX_IMAGE_BYTES: '1000' });
  const policies = validateAssetUploadBatch([{
    receiver_key: 'contract.dni.front', original_filename: 'dni.pdf',
    declared_mime: 'application/pdf', declared_bytes: 999,
  }], 'external_contract_link', registry);
  assert.equal(policies[0]?.category, 'contract_dni');
  assert.equal(policies[0]?.maximum_count, 1);
  assert.throws(() => validateAssetUploadBatch([{
    receiver_key: 'contract.dni.front', original_filename: 'x.svg',
    declared_mime: 'image/svg+xml', declared_bytes: 10,
  }], 'external_contract_link', registry), /MIME_NOT_ALLOWED/u);
  assert.throws(() => validateAssetUploadBatch([{
    receiver_key: 'unknown', original_filename: 'x.pdf',
    declared_mime: 'application/pdf', declared_bytes: 10,
  }], 'member', registry), /UNKNOWN_RECEIVER/u);
});

test('provider verification requires exact registered target, bytes, and detected safe MIME', () => {
  const policy = createAssetReceiverRegistry().get('property.image')!;
  const record = asset();
  assert.doesNotThrow(() => verifyProviderObject(record, {
    bucket_name: record.bucket_name, object_path: record.object_path, bytes: 120,
    provider_mime: 'image/jpeg', detected_mime: 'image/jpeg',
  }, policy));
  assert.throws(() => verifyProviderObject(record, {
    bucket_name: record.bucket_name, object_path: record.object_path, bytes: 121,
    provider_mime: 'image/jpeg', detected_mime: 'image/jpeg',
  }, policy), /ASSET_METADATA_MISMATCH/u);
  assert.throws(() => verifyProviderObject(record, {
    bucket_name: record.bucket_name, object_path: record.object_path, bytes: 120,
    provider_mime: 'image/jpeg', detected_mime: 'image/svg+xml',
  }, policy), /ASSET_METADATA_MISMATCH/u);
});

test('asset state, authorization, property cover, disposition, and cleanup fail closed', () => {
  assert.doesNotThrow(() => assertAssetTransition('verified', 'attached'));
  assert.throws(() => assertAssetTransition('pending', 'attached'), PlatformError);
  const context: AssetAuthorizationContext = {
    scope, request_id: 'req_spec31',
    principal: { type: 'member', reference_id: ownerId, fingerprint: 'a'.repeat(64) },
    capabilities: new Set(['files.read']),
  };
  assert.doesNotThrow(() => authorizeAssetRead(context, asset({ state: 'attached' }), true));
  assert.throws(() => authorizeAssetRead(context, asset({
    organization_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', state: 'attached',
  }), true), (error: unknown) => error instanceof PlatformError && error.code === 'NOT_FOUND');
  assert.throws(() => authorizeAssetRead(context, asset({ state: 'quarantined' }), true), PlatformError);
  assert.doesNotThrow(() => validatePropertyAssetLayout([
    { asset_id: assetId, role: 'image', sort_order: 0, is_cover: true },
    { asset_id: ownerId, role: 'video', sort_order: 1, is_cover: false },
  ]));
  assert.throws(() => validatePropertyAssetLayout([
    { asset_id: assetId, role: 'video', sort_order: 0, is_cover: true },
  ]), /INVALID_MEDIA_COVER/u);
  assert.match(safeContentDisposition(createAssetReceiverRegistry().get('contract.dni.front')!, 'dni.pdf'), /^attachment;/u);
  assert.equal(canPhysicallyDeleteAsset(asset({ state: 'deleting' }), false), true);
  assert.equal(canPhysicallyDeleteAsset(asset({ state: 'deleting', legal_hold_reference: 'hold-1' }), false), false);
  assert.equal(canPhysicallyDeleteAsset(asset({ state: 'deleting' }), true), false);
});

test('asset service authorizes before signing, records issuance, and verifies detected content', async () => {
  const issued: string[] = [];
  const finalized: Array<Readonly<Record<string, unknown>>> = [];
  const record = asset();
  const context: AssetAuthorizationContext = {
    scope, request_id: 'req_spec31_service',
    principal: { type: 'member', reference_id: ownerId, fingerprint: 'b'.repeat(64) },
    capabilities: new Set(['properties.write', 'files.read']),
  };
  const service = createAssetService({
    repository: {
      async initialize(_scope, input) {
        assert.equal(input.descriptors[0]?.category, 'property_image');
        return { id: ownerId, organization_id: organizationId, expires_at: '2030-01-01T00:00:00.000Z' };
      },
      async listSessionIntents() {
        return [{ id: ownerId, organization_id: organizationId, asset_id: assetId,
          receiver_key: 'property.image', bucket_name: record.bucket_name,
          object_path: record.object_path, state: 'pending' }];
      },
      async recordUrlIssued(_scope, _sessionId, intentId) { issued.push(intentId); },
      async findInternal() { return record; },
      async finalize(_scope, input) { finalized.push(input); return { organization_id: organizationId }; },
    },
    storage: {
      async issueUpload() { return { upload_url: 'transient-secret', required_headers: {} }; },
      async inspect() { return { bucket_name: record.bucket_name, object_path: record.object_path,
        bytes: 120, provider_mime: 'image/jpeg' }; },
      async issueView() { return { signed_url: 'transient-view', expires_at: '2030-01-01T00:00:00.000Z' }; },
      async remove() { return 'deleted'; },
    },
    async authorizeOwner() { return true; },
    async reserveQuota(_scope, bytes) { assert.equal(bytes, 120); },
    async detectContent() { return { detected_mime: 'image/jpeg' }; },
  });
  const initialized = await service.initialize(context, {
    owner_type: 'property_draft', owner_id: ownerId, capability_key: 'properties.write',
    idempotency_key: 'asset-test-key', expires_at: '2030-01-01T00:00:00.000Z',
    descriptors: [{ receiver_key: 'property.image', original_filename: 'front.jpg',
      declared_mime: 'image/jpeg', declared_bytes: 120 }],
  });
  assert.equal(initialized.uploads[0]?.upload_url, 'transient-secret');
  assert.deepEqual(issued, [ownerId]);
  await service.finalize(context, { upload_session_id: ownerId, expected_version: 2, asset_ids: [assetId] });
  assert.equal(finalized.length, 1);
  assert.match(JSON.stringify(finalized[0]), /detected_mime/u);
});
