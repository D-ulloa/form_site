import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../../../supabase/migrations/20260825200000_spec37_invitation_delivery_handoff.sql', import.meta.url);

test('SPEC-37 installs hash-only handoff, delivery-attempt, and webhook evidence', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const table of ['invitation_delivery_attempts', 'invitation_auth_handoffs', 'invitation_email_webhook_events']) {
    assert.match(sql, new RegExp(`create table public\\.${table}`, 'u'));
    assert.match(sql, new RegExp(`alter table public\\.${table} force row level security`, 'u'));
  }
  assert.match(sql, /handle_hash text not null unique/u); assert.match(sql, /browser_binding_hash/u);
  const tableDefinitions = sql.slice(0, sql.indexOf('create or replace function'));
  assert.doesNotMatch(tableDefinitions, /raw_(?:invitation_)?token\s+text|provider_secret|recipient_email\s+text/iu);
  assert.match(sql, /from public, anon, authenticated/u);
});

test('SPEC-37 handoff acceptance is exact-email, atomic, single-use, and browser-role inaccessible', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /spec37_accept_invitation_handoff/u);
  assert.match(sql, /browser_binding_hash <> p_browser_binding_hash/u);
  assert.match(sql, /lower\(btrim\(p_verified_email_normalized\)\) <> v_invitation\.email_normalized/u);
  assert.match(sql, /insert into public\.organization_memberships[\s\S]+update public\.organization_invitations set status = 'accepted'/u);
  assert.match(sql, /update public\.invitation_auth_handoffs set consumed_at = now\(\)/u);
});

test('SPEC-37 resend and revoke invalidate handoffs in the same transaction and delivery webhooks never grant access', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /spec37_resend_invitation[\s\S]+invalidated_at = now\(\)[\s\S]+spec26_resend_invitation/u);
  assert.match(sql, /spec37_revoke_invitation[\s\S]+invalidated_at = now\(\)[\s\S]+spec26_revoke_invitation/u);
  const webhook = sql.slice(sql.indexOf('spec37_record_invitation_webhook'), sql.indexOf('spec37_invalidate_invitation_handoffs'));
  assert.doesNotMatch(webhook, /insert into public\.organization_memberships/u);
  assert.match(sql, /event_id_hash text not null unique/u);
});

test('SPEC-37 lists are tenant-scoped, bounded, masked, and include truthful delivery state', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /p_limit not between 1 and 100/g); assert.match(sql, /left\(i\.email_normalized,1\) \|\| '\*\*\*@'/u);
  assert.match(sql, /accepted_by_provider','delivered','failed','bounced','complained/u);
  assert.match(sql, /next_action text/u);
});
