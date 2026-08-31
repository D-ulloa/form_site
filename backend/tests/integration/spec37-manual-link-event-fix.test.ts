import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../../../supabase/migrations/20260827140000_spec37_manual_invitation_event_fix.sql', import.meta.url);

test('SPEC-37 organization event allowlist includes manual link issuance and account activation', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /drop constraint organization_events_event_type_check/u);
  assert.match(sql, /'member\.invitation_link_issued'/u);
  assert.match(sql, /'member\.invitation_account_activated'/u);
});

test('SPEC-37 password activation is audited before membership as a system actor', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const activation = sql.slice(sql.indexOf('spec37_complete_invitation_registration'));
  assert.match(activation, /'member\.invitation_account_activated', 'system', p_user_id/u);
  assert.doesNotMatch(activation, /'member\.invitation_account_activated', 'member'/u);
  assert.match(activation, /registration_permitted = false/u);
});
