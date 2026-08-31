import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../../../supabase/migrations/20260826120000_spec37_manual_invitation_links.sql', import.meta.url);

test('SPEC-37 manual-link migration stores only safe issuance metadata', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /delivery_method in \('email', 'share_link'\)/u);
  assert.match(sql, /link_issued_at timestamptz/u);
  const columns = sql.slice(0, sql.indexOf('create or replace function'));
  assert.doesNotMatch(columns, /raw_token|share_url|invitation_url/iu);
});

test('SPEC-37 registration is handoff-bound and cannot select email, organization, or role', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /spec37_resolve_invitation_registration/u);
  assert.match(sql, /h\.browser_binding_hash = p_browser_binding_hash/u);
  assert.match(sql, /h\.origin_hash = p_origin_hash/u);
  assert.match(sql, /i\.invited_auth_user_id/u);
  const registration = sql.slice(sql.indexOf('spec37_complete_invitation_registration'),
    sql.indexOf('drop function public.spec37_list_invitations'));
  assert.doesNotMatch(registration, /p_intended_role/u);
  assert.doesNotMatch(registration, /p_organization_id/u);
});

test('SPEC-37 link rotation replaces the token and invalidates active handoffs', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /spec37_resend_invitation[\s\S]+invalidated_at = now\(\)[\s\S]+spec26_resend_invitation/u);
  assert.match(sql, /link_issued_at = case when v_old\.delivery_method = 'share_link' then now\(\)/u);
  assert.match(sql, /from public, anon, authenticated/u);
});
