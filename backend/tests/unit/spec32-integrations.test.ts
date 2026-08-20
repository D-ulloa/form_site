import assert from 'node:assert/strict';
import test from 'node:test';
import { createOrganizationScope } from '../../src/platform/scope.js';
import { assertDeliveryTransition, deliveryDecision, mayManuallyRetry, reconcileMatches, retryDelayMs } from '../../src/integrations/deliveryDomain.js';
import { validateIntegrationConfiguration, safeIntegrationProjection } from '../../src/integrations/registry.js';
import { decryptSecret, encryptSecret, withSecret } from '../../src/integrations/secretBroker.js';
import { assertDriveResourceParent, assertPrivateDrivePermissions, assertProviderScope, assertSheetReceipt } from '../../src/integrations/providerGuards.js';
import { isForbiddenAddress, serializeWebhookEnvelope, signWebhook, validateWebhookDestination, verifyWebhookSignature } from '../../src/integrations/webhookSecurity.js';
import type { LeasedDelivery, OutboxEnvelope } from '../../src/integrations/types.js';

const azar = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const solar = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const integrationId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const event: OutboxEnvelope = { event_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', event_type: 'property.revised',
  schema_version: '1', organization_reference: 'org_azar', resource_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  resource_version: 2, occurred_at: '2026-08-19T12:00:00.000Z', idempotency_key: 'delivery-key', data: { status: 'active' } };
const delivery: LeasedDelivery = { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', organization_id: azar,
  outbox_event_id: event.event_id, integration_id: integrationId, provider: 'make_webhook', purpose: 'property_events',
  state: 'leased', lease_token: '11111111-1111-4111-8111-111111111111', lease_expires_at: '2030-01-01T00:00:00Z',
  attempt_count: 0, idempotency_key: event.idempotency_key, event };

test('SPEC-32 registry allows only closed provider/purpose pairs and safe configuration', () => {
  assert.deepEqual(validateIntegrationConfiguration('google_sheets', 'property_sheet', {
    display_name: 'Azar properties', spreadsheet_id: 'sheet_azar', tab_name: 'Properties', schema_version: 'v1',
  }), { display_name: 'Azar properties', spreadsheet_id: 'sheet_azar', tab_name: 'Properties', schema_version: 'v1' });
  assert.throws(() => validateIntegrationConfiguration('google_drive', 'contract_sheet', {
    display_name: 'wrong', parent_folder_id: 'folder',
  }), /INVALID_INTEGRATION_CONFIGURATION/u);
  assert.throws(() => validateIntegrationConfiguration('make_webhook', 'property_events', {
    display_name: 'unsafe', endpoint_origin: 'https://example.test', supports_idempotency: true, secret: 'leak',
  }));
  const projected = safeIntegrationProjection({ id: integrationId, organization_id: azar, provider: 'google_drive',
    purpose: 'property_export', state: 'active', configuration_version: 1, masked_destination: 'Azar / …abc',
    health_state: 'healthy', health_error_code: null, health_checked_at: null, version: 1,
    configuration: { parent_folder_id: 'secret-route' }, credential_ref: 'vault://credential' });
  assert.doesNotMatch(JSON.stringify(projected), /secret-route|vault/u);
});

test('SPEC-32 encrypted secrets bind organization, integration, type, and version through AAD', async () => {
  const key = Buffer.alloc(32, 7); const plaintext = Buffer.from('never-serialize-me');
  const binding = { organization_id: azar, integration_id: integrationId, secret_type: 'webhook_signing', version: 1 };
  const encrypted = encryptSecret(plaintext, binding, key);
  assert.doesNotMatch(JSON.stringify(encrypted), /never-serialize-me/u);
  assert.equal(decryptSecret(encrypted, binding, key).toString(), 'never-serialize-me');
  assert.throws(() => decryptSecret(encrypted, { ...binding, organization_id: solar }, key));
  const stored = Buffer.from('ephemeral');
  await withSecret({ async put() {}, async get() { return stored; }, async revoke() {} }, 'vault://x', async (secret) => {
    assert.equal(Buffer.from(secret).toString(), 'ephemeral');
  });
  assert.deepEqual(stored, Buffer.alloc(stored.length));
});

test('SPEC-32 webhook destinations reject private, metadata, non-HTTPS, unsafe port, and mixed DNS', async () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.2', '169.254.169.254', '::1', 'fd00::1', 'fe80::1']) {
    assert.equal(isForbiddenAddress(address), true, address);
  }
  assert.equal((await validateWebhookDestination('https://hooks.example.test/path', async () => ['8.8.8.8'])).hostname,
    'hooks.example.test');
  await assert.rejects(validateWebhookDestination('http://hooks.example.test', async () => ['8.8.8.8']), /UNSAFE/u);
  await assert.rejects(validateWebhookDestination('https://hooks.example.test:8443', async () => ['8.8.8.8']), /UNSAFE/u);
  await assert.rejects(validateWebhookDestination('https://hooks.example.test', async () => ['8.8.8.8', '127.0.0.1']), /UNSAFE/u);
});

test('SPEC-32 signs the exact bounded versioned webhook body', () => {
  const body = serializeWebhookEnvelope(event); const secret = Buffer.from('organization-specific-secret');
  const signature = signWebhook(body, '1724068800', event.event_id, secret);
  assert.equal(verifyWebhookSignature(signature, signature), true);
  assert.equal(verifyWebhookSignature(signature, `${signature.slice(0, -1)}0`), false);
  assert.throws(() => serializeWebhookEnvelope({ ...event, schema_version: '2' as '1' }), /INVALID_EVENT/u);
  assert.throws(() => serializeWebhookEnvelope({ ...event, data: { large: 'x'.repeat(70_000) } }), /PAYLOAD_TOO_LARGE/u);
});

test('SPEC-32 scope/resource guards deny cross-tenant and public or mismatched provider resources', () => {
  const context = { scope: createOrganizationScope(azar), integration_id: integrationId, provider: 'make_webhook' as const,
    purpose: 'property_events' as const, configuration_version: 1, credential_version: 1, configuration: {} };
  assert.doesNotThrow(() => assertProviderScope(context, delivery));
  assert.throws(() => assertProviderScope({ ...context, scope: createOrganizationScope(solar) }, delivery), /SCOPE_MISMATCH/u);
  assert.equal(assertDriveResourceParent('folder-azar', ['folder-azar']), 'folder-azar');
  assert.throws(() => assertDriveResourceParent('folder-azar', ['folder-solar']), /PARENT_MISMATCH/u);
  assert.throws(() => assertPrivateDrivePermissions([{ type: 'anyone', role: 'reader' }]), /PUBLIC/u);
  assert.throws(() => assertSheetReceipt('sheet-azar', { spreadsheet_id: 'sheet-solar', idempotency_key: 'key' }, 'key'));
});

test('SPEC-32 delivery decisions never blind-retry ambiguity or confirmed success', () => {
  assert.equal(deliveryDecision({ kind: 'ambiguous', error_code: 'TIMEOUT' }, 1, 8), 'reconciling');
  assert.equal(deliveryDecision({ kind: 'transient_failure', error_code: 'RATE' }, 2, 8), 'retry_wait');
  assert.equal(deliveryDecision({ kind: 'transient_failure', error_code: 'RATE' }, 8, 8), 'dead_letter');
  assert.equal(deliveryDecision({ kind: 'succeeded', external_id: 'resource' }, 1, 8), 'succeeded');
  assert.equal(mayManuallyRetry('succeeded'), false); assert.equal(mayManuallyRetry('dead_letter'), true);
  assert.equal(reconcileMatches([]), 'retry'); assert.equal(reconcileMatches([{ external_id: 'one', exact: true }]), 'adopt');
  assert.equal(reconcileMatches([{ external_id: 'one', exact: true }, { external_id: 'two', exact: true }]), 'dead_letter');
  assert.doesNotThrow(() => assertDeliveryTransition('processing', 'reconciling'));
  assert.throws(() => assertDeliveryTransition('succeeded', 'retry_wait'));
  assert.equal(retryDelayMs(3, () => 0), 6000);
});
