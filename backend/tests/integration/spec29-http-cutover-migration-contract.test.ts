import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL(
  '../../../supabase/migrations/20260820120000_spec29_tenant_contract_http_cutover.sql',
  import.meta.url,
), 'utf8');
const actorUuidFixSql = readFileSync(new URL(
  '../../../supabase/migrations/20260820123000_spec29_contract_created_actor_uuid.sql',
  import.meta.url,
), 'utf8');

test('tenant contract creation validates active organization membership', () => {
  assert.match(sql, /spec29_create_tenant_contract/iu);
  assert.match(sql, /m\.role in \('owner', 'admin', 'member'\)/iu);
  assert.match(sql, /m\.organization_id = p_organization_id/iu);
});

test('tenant administrative mutations lock by organization and version', () => {
  for (const name of ['spec29_set_tenant_contract_status', 'spec29_archive_tenant_contract',
    'spec29_replace_tenant_contract_token']) assert.match(sql, new RegExp(name, 'u'));
  assert.match(sql, /where id = p_entry_id\s+and organization_id = p_organization_id for update/iu);
  assert.match(sql, /v_entry\.version <> p_expected_version/iu);
});

test('browser roles cannot execute tenant contract RPCs', () => {
  assert.match(sql, /revoke all on function public\.spec29_create_tenant_contract[\s\S]+from public, anon, authenticated/iu);
  assert.match(sql, /grant execute on function public\.spec29_create_tenant_contract[\s\S]+to service_role/iu);
});

test('tenant contract created events cast the legacy creator text to uuid', () => {
  assert.match(actorUuidFixSql, /v_actor_user_id := new\.created_by_user_id::uuid/iu);
  assert.match(actorUuidFixSql, /v_actor_user_id, v_membership_id, v_request_id/iu);
});
