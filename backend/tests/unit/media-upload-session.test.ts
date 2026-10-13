import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createUploadSession,
  verifyUploadSession,
  type SessionUpload,
} from '../../src/services/mediaUploadSessionService.js';

const environment = {
  APP_SESSION_PEPPER: 'a-secret-long-enough-for-media-upload-session-tests',
  MEDIA_UPLOAD_SESSION_TTL_MS: '7200000',
};
const organizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const upload: SessionUpload = {
  original_name: 'front.jpg',
  storage_path: 'properties/2026-10-13/front.jpg',
  mime_type: 'image/jpeg',
  size_bytes: 123,
  storage_bucket: 'property-media',
  public_path: 'property-media/properties/2026-10-13/front.jpg',
};

test('property upload session verifies across calls with the same secret and scope', () => {
  const token = createUploadSession('agent-1', organizationId, [upload], environment);
  assert.ok(verifyUploadSession(token, 'agent-1', organizationId, [upload], { ...environment }));
  assert.equal(verifyUploadSession(token, 'agent-2', organizationId, [upload], environment), false);
  assert.equal(verifyUploadSession(token, 'agent-1', 'another-org', [upload], environment), false);
  assert.equal(verifyUploadSession(token, 'agent-1', organizationId,
    [{ ...upload, storage_path: 'properties/another-file.jpg' }], environment), false);
  assert.equal(verifyUploadSession(token, 'agent-1', organizationId,
    [{ ...upload, size_bytes: 124 }], environment), false);
  assert.equal(verifyUploadSession(`${token.slice(0, -1)}x`, 'agent-1', organizationId,
    [upload], environment), false);
  assert.equal(verifyUploadSession('old-process-local-session-id', 'agent-1', organizationId,
    [upload], environment), false);
});

test('property upload session expires after the configured two hours', () => {
  const issuedAt = Date.now();
  const token = createUploadSession('agent-1', organizationId, [upload], environment);
  const actualNow = Date.now;
  try {
    Date.now = () => issuedAt + 7_200_001;
    assert.equal(verifyUploadSession(token, 'agent-1', organizationId, [upload], environment), false);
  } finally {
    Date.now = actualNow;
  }
});
