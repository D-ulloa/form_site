import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../../../supabase/migrations/20260818160000_spec28_platform_controls.sql',
  import.meta.url,
);

test('SPEC-28 migration creates shared organization-owned controls with forced deny-by-default RLS', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const table of [
    'audit_events', 'usage_events', 'organization_rate_limit_buckets',
    'quota_snapshots', 'usage_reservations', 'platform_jobs',
    'deletion_tombstones', 'recovery_evidence',
  ]) {
    assert.match(sql, new RegExp(`create table public\\.${table} \\(`, 'u'));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'u'));
    assert.match(sql, new RegExp(`alter table public\\.${table} force row level security`, 'u'));
  }
  assert.doesNotMatch(sql, /create policy/u);
  assert.match(sql, /from public, anon, authenticated/u);
});

test('SPEC-28 append stores are organization-owned, constrained, indexed, and immutable', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /organization_id uuid not null references public\.organizations/u);
  assert.match(sql, /foreign key \(actor_membership_id, organization_id\)/u);
  assert.match(sql, /audit_events_timeline_idx[\s\S]+\(organization_id, occurred_at desc, id desc\)/u);
  assert.match(sql, /usage_events_timeline_idx[\s\S]+\(organization_id, metric_key, occurred_at desc, id desc\)/u);
  assert.match(sql, /audit_events_append_only/u);
  assert.match(sql, /usage_events_append_only/u);
  assert.match(sql, /APPEND_ONLY_RECORD/u);
  assert.match(sql, /octet_length\(metadata::text\) <= 4096/u);
});

test('SPEC-28 RPCs are atomic, search-path-safe, and unavailable to browser roles', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const fn of [
    'spec28_consume_organization_rate_limit', 'spec28_consume_platform_rate_limit',
    'spec28_record_usage', 'spec28_reserve_quota', 'spec28_finalize_quota',
    'spec28_claim_fair_jobs',
  ]) {
    assert.match(sql, new RegExp(`function public\\.${fn}`, 'u'));
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn}[\\s\\S]+from public, anon, authenticated`, 'u'));
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn}[\\s\\S]+to service_role`, 'u'));
  }
  assert.match(sql, /security definer set search_path = pg_catalog/u);
  assert.match(sql, /on conflict \(organization_id, policy_key, subject_hash, window_started_at\)/u);
  assert.match(sql, /for update of j skip locked/u);
  assert.match(sql, /IDEMPOTENCY_CONFLICT/u);
});

test('SPEC-28 request correlation is installed before API parsing and platform client import is contained', async () => {
  const index = await readFile(new URL('../../src/index.ts', import.meta.url), 'utf8');
  assert.ok(index.indexOf('app.use(requestIdMiddleware)') < index.indexOf("app.use(express.json"));

  const platformRepository = await readFile(new URL('../../src/platform/platformRepository.ts', import.meta.url), 'utf8');
  const platformClient = await readFile(new URL('../../src/platform/serviceRoleClient.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(platformRepository, /createClient/u);
  assert.match(platformClient, /createClient/u);
  assert.match(platformClient, /SUPABASE_SERVICE_ROLE_KEY/u);
});
