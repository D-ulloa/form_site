import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../../../supabase/migrations/20260825160000_spec36_organization_provisioning.sql', import.meta.url);

test('SPEC-36 adds restricted immutable operations and safe append-only evidence', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /create table public\.organization_provisioning_operations/u);
  assert.match(sql, /create table public\.organization_provisioning_events/u);
  assert.match(sql, /organization_provisioning_manifest_immutable/u);
  assert.match(sql, /organization_provisioning_events_append_only/u);
  assert.equal((sql.match(/force row level security/g) ?? []).length, 2);
  assert.match(sql, /revoke all[\s\S]+from public, anon, authenticated/u);
  assert.doesNotMatch(sql, /grant[^;]+(?:anon|authenticated)[^;]+organization_provisioning/iu);
  assert.doesNotMatch(sql, /owner_email(?:_normalized)?\s+text/iu);
});

test('SPEC-36 operation claims serialize operation and slug and reject changed replay input', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\(p_operation_id, 36\)\)/u);
  assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\(p_slug, 36\)\)/u);
  assert.match(sql, /v_operation\.manifest_fingerprint <> p_manifest_fingerprint[\s\S]+IDEMPOTENCY_CONFLICT/u);
  assert.match(sql, /organization_slug text not null unique/u);
  assert.match(sql, /operator_owner_identity_equality_approved boolean not null default false/u);
  assert.match(sql, /p_owner_user_id = v_operation\.operator_user_id[\s\S]+APPROVAL_REQUIRED/u);
  assert.match(sql, /migration_control\.migration_inventory_items/u);
});

test('SPEC-36 completion verifies the canonical atomic organization transaction before receipt', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const relation of ['organizations', 'organization_settings', 'organization_memberships', 'user_profiles',
    'organization_events']) assert.match(sql, new RegExp(`public\\.${relation}`, 'u'));
  assert.match(sql, /m\.role = 'owner' and m\.status = 'active'/u);
  assert.match(sql, /e\.event_type = 'organization\.created'/u);
  assert.match(sql, /state = 'attention_required'[\s\S]+failure_reason_code = 'READBACK_FAILED'/u);
  assert.doesNotMatch(sql, /insert into public\.(?:organizations|organization_settings|organization_memberships|contract_admin_users)/iu);
});

test('SPEC-36 browser roles cannot preflight, claim, complete, status, or read evidence', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const fn of ['spec36_preflight_organization_provisioning', 'spec36_claim_organization_provisioning',
    'spec36_complete_organization_provisioning', 'spec36_get_organization_provisioning']) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn}\\([\\s\\S]+?from public, anon, authenticated`, 'u'));
  }
});
