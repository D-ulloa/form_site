import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../../../supabase/migrations/20260819400000_spec34_migration_certification_control_plane.sql', import.meta.url);

test('SPEC-34 installs the restricted durable evidence model without creating tenants or release state', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /create schema if not exists migration_control/u);
  for (const table of ['migration_runs', 'migration_inventory_items', 'migration_mappings',
    'migration_validation_results', 'release_certifications', 'solar_rollout_events']) {
    assert.match(sql, new RegExp(`create table migration_control\\.${table}`, 'u'));
  }
  assert.doesNotMatch(sql, /insert into public\.organizations/iu);
  assert.doesNotMatch(sql, /status[^;]*values[^;]*certified/iu);
  assert.match(sql, /does not create Azar or Solar, backfill customer data/iu);
});

test('SPEC-34 inventory and mappings are idempotent, evidenced, tenant-owned, and quarantine-safe', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /unique \(migration_run_id, source_system, artifact_type, source_identifier\)/u);
  assert.match(sql, /final_disposition <> 'migrate_to_azar'[\s\S]+evidence_reference is not null[\s\S]+reviewer_user_id is not null/u);
  assert.match(sql, /final_disposition <> 'delete_after_approval'[\s\S]+not legal_hold/u);
  assert.match(sql, /unique \(migration_run_id, source_system, source_type, source_identifier, source_fingerprint\)/u);
  assert.match(sql, /migration_mappings_append_only/u);
  assert.match(sql, /migration_inventory_target_idx/u);
});

test('SPEC-34 core checks cannot be waived and release evidence binds deployed artifacts', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /check \(not core_isolation or status <> 'waived'\)/u);
  for (const field of ['application_revision', 'build_artifact_fingerprint', 'database_migration_head',
    'worker_version', 'frontend_version', 'feature_manifest', 'provider_destination_manifest',
    'rollback_thresholds', 'approval_manifest']) assert.match(sql, new RegExp(field, 'u'));
  assert.match(sql, /migration_validation_results_append_only/u);
  assert.match(sql, /release_certifications_final_immutable/u);
  assert.match(sql, /old\.status <> 'draft'.*IMMUTABLE_RELEASE_CERTIFICATION/u);
  assert.match(sql, /boundary_incident[\s\S]+to_stage = 'contained'/u);
  assert.match(sql, /new\.to_stage in \('real_data','expanded'\) and certification_status <> 'certified'/u);
  assert.match(sql, /STALE_SOLAR_ROLLOUT_STAGE/u);
});

test('SPEC-34 evidence is force-RLS protected and unavailable to ordinary application roles', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const forced = sql.match(/force row level security/g) ?? [];
  assert.equal(forced.length, 6);
  assert.match(sql, /revoke all on schema migration_control from public, anon, authenticated/u);
  assert.match(sql, /revoke all on all tables in schema migration_control from public, anon, authenticated/u);
  assert.match(sql, /absence of a certified record is a release denial/u);
});
