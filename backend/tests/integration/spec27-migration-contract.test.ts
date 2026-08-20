import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../../../supabase/migrations/20260818140000_spec27_identity_sessions_authorization.sql',
  import.meta.url,
);

test('SPEC-27 installs revocable sessions, scoped keys, support boundary, and security evidence', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const table of ['app_sessions', 'organization_api_keys', 'platform_operators',
    'support_access_grants', 'identity_security_events']) {
    assert.match(sql, new RegExp(`create table public\\.${table}`, 'u'));
  }
  assert.match(sql, /token_hash text not null unique/u);
  assert.match(sql, /csrf_token_hash text not null/u);
  assert.match(sql, /secret_hash text not null unique/u);
  assert.doesNotMatch(sql, /^\s*(raw_(session_)?token|raw_api_key|csrf_token)\s+(text|bytea)/imu);
});

test('SPEC-27 security tables are forced-RLS and unavailable to browser roles', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /force row level security/u);
  assert.match(sql, /revoke all on table public\.%I from public, anon, authenticated/u);
  assert.doesNotMatch(sql, /create policy/u);
  assert.match(sql, /identity_security_events_append_only/u);
});

test('SPEC-27 session operations are atomic, versioned, and service-only', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const fn of ['spec27_rotate_session', 'spec27_revoke_session',
    'spec27_revoke_user_sessions', 'spec27_touch_session']) {
    assert.match(sql, new RegExp(`function public\\.${fn}`, 'u'));
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn}[\\s\\S]+from public,anon,authenticated`, 'u'));
  }
  assert.match(sql, /for update/u);
  assert.match(sql, /SESSION_NOT_ACTIVE/u);
  assert.match(sql, /VERSION_CONFLICT/u);
  assert.match(sql, /set search_path = ''/u);
});

test('SPEC-27 separates support and machine authority from memberships', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /status text not null default 'disabled'/u);
  assert.match(sql, /assurance_level text not null check \(assurance_level = 'aal2'\)/u);
  assert.match(sql, /expires_at <= starts_at \+ interval '8 hours'/u);
  assert.match(sql, /foreign key \(created_by_membership_id, organization_id\)/u);
  assert.match(sql, /allowed_ip_cidrs cidr\[\]/u);
});
