import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('SPEC-39 installs only the scoped read model and restricts browser access', async () => {
  const sql = await readFile(new URL('../../../supabase/migrations/20260910120000_spec39_arrangement_orders.sql', import.meta.url), 'utf8');
  assert.match(sql, /unique \(id, organization_id\)/);
  assert.match(sql, /references public\.organizations\(id\) on delete restrict/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /force row level security/);
  assert.match(sql, /revoke all on public\.arrangement_orders from public, anon, authenticated, service_role/);
  assert.match(sql, /stable security invoker/);
  assert.match(sql, /set search_path = pg_catalog/);
  assert.match(sql, /o\.organization_id = p_organization_id/);
  assert.doesNotMatch(sql, /created_at|updated_at|property_id|assigned_to|insert into|security definer|http_post/);
});
