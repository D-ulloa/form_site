import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../../../supabase/migrations/20260819200000_spec32_multitenant_integration_outbox.sql', import.meta.url);

test('SPEC-32 migration installs every organization-owned integration relation', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const table of ['organization_integrations', 'integration_secret_references', 'outbox_events',
    'integration_deliveries', 'integration_delivery_attempts', 'integration_external_resources', 'integration_health_checks']) {
    assert.match(sql, new RegExp(`create table public\\.${table} \\(`, 'u'));
    assert.match(sql, new RegExp(`${table}[\\s\\S]+organization_id uuid not null`, 'u'));
  }
  assert.match(sql, /organization_integrations_one_active_idx/u);
  assert.match(sql, /organization_integrations_safe/u);
});

test('SPEC-32 uses composite tenant FKs and organization-leading indexes', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const parent of ['organization_integrations', 'outbox_events', 'integration_deliveries']) {
    assert.match(sql, new RegExp(`references public\\.${parent}\\(id, organization_id\\)`, 'u'));
  }
  for (const index of ['outbox_events_tenant_queue_idx', 'integration_deliveries_tenant_queue_idx',
    'integration_attempts_tenant_delivery_idx', 'integration_resources_tenant_aggregate_idx']) assert.match(sql, new RegExp(index, 'u'));
});

test('SPEC-32 immutable evidence, RLS, grants, and payload secret canaries fail closed', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /outbox_events_append_only/u); assert.match(sql, /integration_attempts_append_only/u);
  assert.match(sql, /IMMUTABLE_INTEGRATION_HISTORY/u); assert.match(sql, /force row level security/u);
  assert.match(sql, /revoke all on table public\.%I from public, anon, authenticated/u);
  assert.match(sql, /not payload \?\| array\['authorization', 'credential', 'private_key', 'refresh_token', 'signed_url', 'object_path'\]/u);
  assert.doesNotMatch(sql, /client_secret\s*=|private_key\s*=|refresh_token\s*=/iu);
});

test('SPEC-32 supplies atomic enqueue, deterministic fanout, fair leases, and token/version transitions', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const fn of ['spec32_enqueue_outbox', 'spec32_materialize_deliveries', 'spec32_claim_deliveries', 'spec32_transition_delivery']) {
    assert.match(sql, new RegExp(`function public\\.${fn}`, 'u'));
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn}[\\s\\S]+from public,anon,authenticated`, 'u'));
  }
  assert.match(sql, /row_number\(\) over\(partition by d\.organization_id/u);
  assert.match(sql, /for update of d skip locked/u); assert.match(sql, /lease_token=public\.gen_random_uuid/u);
  assert.match(sql, /v_delivery\.lease_token is distinct from p_lease_token/u);
  assert.match(sql, /organization_id=p_organization_id/u);
  assert.match(sql, /property_events_to_outbox after insert/u);
  assert.match(sql, /contract_events_to_outbox after insert/u);
  assert.match(sql, /state='unknown',safe_error_code='LEASE_EXPIRED'/u);
});

test('SPEC-32 additive migration makes no provider call, global fallback, real resource, or cutover', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.doesNotMatch(sql, /net\.http|http_post|googleapis|MAKE_WEBHOOK_URL|GOOGLE_DRIVE_PARENT_FOLDER_ID/iu);
  assert.match(sql, /No real provider resource, credential, legacy trigger cutover, or Solar enablement/u);
});
