import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequestCursorCodec } from '../../src/arrangements/requestCursor.js';
import { createAssetReceiverRegistry, validateAssetUploadBatch } from '../../src/assets/receiverPolicy.js';
import { detectAssetBytes } from '../../src/assets/contentDetector.js';
import { ROLE_CAPABILITIES, ROLE_CAPABILITY_REGISTRY_VERSION } from '../../src/organizations/roleCapabilities.js';
import { A, B, ORDER } from '../fixtures/arrangements.js';

test('SPEC43 capability matrix has scoped tenant operations and member status writes', () => {
  assert.equal(ROLE_CAPABILITY_REGISTRY_VERSION, 6);
  for (const role of ['owner', 'admin', 'member'] as const) assert.equal(ROLE_CAPABILITIES[role].has('arrangements.status.update'), true);
  assert.equal(ROLE_CAPABILITIES.viewer.has('arrangements.status.update'), false);
  assert.deepEqual([...ROLE_CAPABILITIES.inquilino], ['inquilino.home.read', 'inquilino.arrangements.read', 'inquilino.arrangements.create']);
});
test('SPEC43 tuple cursor binds tenant property, organization, filter, limit and handles legacy null dates', () => {
  const binding = { organization_id: A, property_id: ORDER, status: null, limit: 25 };
  const codec = createRequestCursorCodec('c'.repeat(48), binding);
  for (const at of [null, '2026-09-12T12:00:00.123456+00:00']) {
    const cursor = codec.encode({ id: ORDER, at });
    assert.deepEqual(codec.decode(cursor), { id: ORDER, at });
    for (const patch of [{ organization_id: B }, { property_id: B }, { status: 'open' }, { limit: 10 }]) {
      assert.throws(() => createRequestCursorCodec('c'.repeat(48), { ...binding, ...patch }).decode(cursor), /INVALID_CURSOR/);
    }
    assert.throws(() => codec.decode(cursor + '.tampered'), /INVALID_CURSOR/);
  }
});
test('SPEC43 exact receiver allowlist, byte/count/checksum and principal limits', () => {
  const registry = createAssetReceiverRegistry();
  const descriptor = { receiver_key: 'arrangement.image', original_filename: 'test.png', declared_mime: 'image/png', declared_bytes: 10 * 1024 ** 2, checksum_sha256: 'a'.repeat(64) };
  assert.equal(validateAssetUploadBatch(Array(30).fill(descriptor), 'member', registry).length, 30);
  assert.throws(() => validateAssetUploadBatch(Array(31).fill(descriptor), 'member', registry), /COUNT/);
  for (const patch of [{ declared_mime: 'image/gif' }, { declared_mime: 'image/svg+xml' }, { declared_bytes: descriptor.declared_bytes + 1 }, { checksum_sha256: '' }]) {
    assert.throws(() => validateAssetUploadBatch([{ ...descriptor, ...patch }], 'member', registry));
  }
  assert.throws(() => validateAssetUploadBatch([descriptor], 'external_contract_link', registry));
});
test('SPEC43 detects real signatures and hashes actual bytes rather than trusting filename', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=', 'base64');
  const result = await detectAssetBytes(png);
  assert.equal(result.detected_mime, 'image/png'); assert.match(result.checksum_sha256, /^[a-f0-9]{64}$/u);
  await assert.rejects(detectAssetBytes(Buffer.from('<script>alert(1)</script>')), /ASSET_METADATA_MISMATCH/);
});
