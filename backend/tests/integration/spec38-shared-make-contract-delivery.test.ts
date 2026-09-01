import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createOrganizationScope } from '../../src/platform/scope.js';
import { createContractGenerationPayloadLoader, createMakeWebhookAdapter } from '../../src/integrations/makeWebhookAdapter.js';
import type { IntegrationExecutionContext, LeasedDelivery } from '../../src/integrations/types.js';

const azar = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const solar = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const integrationId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const entryId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function delivery(organizationId = azar): LeasedDelivery {
  return {
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', organization_id: organizationId,
    outbox_event_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', integration_id: integrationId,
    provider: 'make_webhook', purpose: 'contract_generation', state: 'leased',
    lease_token: '11111111-1111-4111-8111-111111111111', lease_expires_at: '2030-01-01T00:00:00Z',
    attempt_count: 0, idempotency_key: 'contract-generation-key', version: 1,
    event: {
      event_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', event_type: 'contract.generation.requested',
      schema_version: '1', organization_reference: 'azar', resource_id: entryId, resource_version: 3,
      occurred_at: '2026-09-01T12:00:00Z', idempotency_key: 'contract-generation-key', data: { entry_id: entryId },
    },
  };
}

function context(organizationId = azar): IntegrationExecutionContext {
  return {
    scope: createOrganizationScope(organizationId), integration_id: integrationId, provider: 'make_webhook',
    purpose: 'contract_generation', configuration_version: 1, credential_version: 1,
    configuration: { endpoint_origin: 'https://hooks.example.test/shared-make' },
  };
}

test('SPEC-38 forward migration materializes only contract generation outbox events and projects a legacy envelope', async () => {
  const migration = await readFile(new URL('../../../supabase/migrations/20260901000000_spec38_shared_make_contract_delivery.sql', import.meta.url), 'utf8');
  assert.match(migration, /contract_generation_outbox_to_delivery/u);
  assert.match(migration, /spec38_claim_contract_generation_deliveries/u);
  assert.match(migration, /contract\.generation\.requested/u);
  assert.match(migration, /spec32_materialize_deliveries\(new\.organization_id, new\.id\)/u);
  assert.match(migration, /'type', 'UPDATE'/u);
  assert.match(migration, /'table', 'contract_entries'/u);
  assert.match(migration, /'schema', 'public'/u);
  assert.doesNotMatch(migration, /user_token_hash|client_token_hash|net\.http|http_post/u);
});

test('SPEC-38 sends each organization to the same Make destination without waiting for a response', async () => {
  const calls: { readonly url: string; readonly headers: Readonly<Record<string, string>>; readonly body: string }[] = [];
  const adapter = createMakeWebhookAdapter({
    payloads: { async load(organizationId, loadedEntryId) {
      return { type: 'UPDATE', table: 'contract_entries', schema: 'public', record: {
        id: loadedEntryId, organization_id: organizationId, status: 'generar_contrato', generar_contrato_trigger: true,
      } };
    } },
    async resolve() { return ['8.8.8.8']; },
    poster: { post(url, headers, body) { calls.push({ url: String(url), headers, body }); } },
  });

  assert.equal((await adapter.deliver(context(azar), delivery(azar))).kind, 'succeeded');
  assert.equal((await adapter.deliver(context(solar), delivery(solar))).kind, 'succeeded');
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.url, 'https://hooks.example.test/shared-make');
  assert.equal(calls[1]?.url, 'https://hooks.example.test/shared-make');
  assert.equal(calls[1]?.headers['X-Organization-Id'], solar);
  const body = JSON.parse(String(calls[0]?.body)) as Record<string, unknown>;
  assert.deepEqual(Object.keys(body).sort(), ['record', 'schema', 'table', 'type']);
  assert.doesNotMatch(JSON.stringify(body), /token_hash/u);
});

test('SPEC-38 payload loader is organization-scoped and rejects malformed database results', async () => {
  const requests: Record<string, unknown>[] = [];
  const loader = createContractGenerationPayloadLoader({ async rpc(_name, parameters) {
    requests.push({ ...parameters });
    return { data: { type: 'UPDATE', table: 'contract_entries', schema: 'public', record: { id: entryId } }, error: null };
  } });
  assert.equal((await loader.load(azar, entryId))?.record.id, entryId);
  assert.deepEqual(requests, [{ p_organization_id: azar, p_entry_id: entryId }]);
  const malformed = createContractGenerationPayloadLoader({ async rpc() {
    return { data: { record: {} }, error: null };
  } });
  await assert.rejects(malformed.load(azar, entryId), /INVALID_CONTRACT_GENERATION_PAYLOAD/u);
});
