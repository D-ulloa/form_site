import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../../../supabase/migrations/20260818120000_spec26_organization_governance.sql',
  import.meta.url,
);

test('SPEC-26 migration defines every governance aggregate and deny-by-default RLS', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const table of [
    'user_profiles', 'organizations', 'organization_settings', 'organization_memberships',
    'organization_invitations', 'organization_events', 'organization_deletion_requests',
    'organization_export_requests', 'organization_legal_holds',
  ]) {
    assert.match(sql, new RegExp(`create table public\\.${table} \\(`, 'u'));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'u'));
  }
  assert.match(sql, /revoke all on public\.user_profiles,[\s\S]+from public, anon, authenticated;/u);
  assert.doesNotMatch(sql, /create policy/u);
});

test('SPEC-26 migration preserves tenant and invitation invariants in database constraints', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /unique \(organization_id, user_id\)/u);
  assert.match(sql, /where status = 'pending'/u);
  assert.match(sql, /intended_role in \('admin', 'member', 'viewer'\)/u);
  assert.match(sql, /ORGANIZATION_IDENTITY_IMMUTABLE/u);
  assert.match(sql, /LAST_OWNER_REQUIRED/u);
  assert.match(sql, /GOVERNANCE_HISTORY_IMMUTABLE/u);
  assert.match(sql, /encode\(digest\(p_raw_token, 'sha256'\), 'hex'\)/u);
  assert.doesNotMatch(sql, /tenant_id/u);
});

test('SPEC-26 bootstrap and acceptance functions are atomic and unavailable to browser roles', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /spec26_create_organization/u);
  assert.match(sql, /insert into public\.organization_settings/u);
  assert.match(sql, /'organization\.created'/u);
  assert.match(sql, /spec26_accept_invitation/u);
  assert.match(sql, /'member\.invitation_accepted'/u);
  assert.match(sql, /revoke all on function public\.spec26_create_organization[\s\S]+from public, anon, authenticated/u);
  assert.match(sql, /revoke all on function public\.spec26_accept_invitation[\s\S]+from public, anon, authenticated/u);
  assert.match(sql, /grant execute on function public\.spec26_accept_invitation[\s\S]+to service_role/u);
  assert.match(sql, /spec26_resend_invitation/u);
  assert.match(sql, /spec26_revoke_invitation/u);
  assert.match(sql, /spec26_mutate_membership/u);
  assert.match(sql, /spec26_transfer_ownership/u);
  assert.match(sql, /spec26_update_organization_settings/u);
});

test('SPEC-26 protected router remains unmounted from the legacy administrator boundary', async () => {
  const index = await readFile(new URL('../../src/index.ts', import.meta.url), 'utf8');
  const stagedRouter = await readFile(new URL('../../src/routes/organizationGovernance.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(index, /organizationGovernance/u);
  assert.match(stagedRouter, /resolveOrganizationActor/u);
  assert.match(stagedRouter, /actor\.organization\.id !==/u);
  assert.match(stagedRouter, /Cache-Control': 'no-store'/u);
});
