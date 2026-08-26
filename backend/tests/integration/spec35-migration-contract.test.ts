import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../../../supabase/migrations/20260825120000_spec35_identity_profile_provisioning.sql', import.meta.url);

test('SPEC-35 migration adds restricted resumable evidence and no authority grants', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /create table public\.identity_provisioning_operations/u);
  assert.match(sql, /create table public\.identity_provisioning_events/u);
  assert.match(sql, /identity_provisioning_one_active_email_idx/u);
  assert.match(sql, /identity_provisioning_events_append_only/u);
  assert.match(sql, /force row level security/g);
  assert.match(sql, /revoke all[\s\S]+from public, anon, authenticated/u);
  assert.doesNotMatch(sql, /insert into public\.(?:organizations|organization_memberships|platform_operators|contract_admin_users)/iu);
  assert.doesNotMatch(sql, /grant[^;]+(?:anon|authenticated)[^;]+identity_provisioning/iu);
  assert.doesNotMatch(sql, /email_normalized\s+text/iu);
});

test('SPEC-35 claim is email-serialized, idempotent, and checks quarantined SPEC-34 evidence', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\(p_email_fingerprint, 35\)\)/u);
  assert.match(sql, /idempotency_key text not null unique/u);
  assert.match(sql, /raise exception 'IDEMPOTENCY_CONFLICT'/u);
  assert.match(sql, /migration_control\.migration_inventory_items/u);
  assert.match(sql, /quarantine_state = 'quarantined'/u);
  assert.match(sql, /assurance_level = 'aal2'[\s\S]+absolute_expires_at > now\(\)/u);
});

test('SPEC-35 completes profile and evidence atomically without overwriting preferences', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /insert into public\.user_profiles[\s\S]+on conflict \(user_id\) do nothing/u);
  assert.match(sql, /v_profile_state := 'created'[\s\S]+v_profile_state := 'existing'/u);
  assert.match(sql, /state = 'provider_ambiguous'/u);
  assert.match(sql, /state = 'completed'[\s\S]+auth_user_id = p_user_id/u);
  assert.match(sql, /Rows never grant membership, role, or customer access/u);
});
