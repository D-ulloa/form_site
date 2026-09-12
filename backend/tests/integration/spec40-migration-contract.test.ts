import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('SPEC-40 uses a forward role migration and preserves backend-only authority', async () => {
  const sql = await readFile(new URL('../../../supabase/migrations/20260911120000_spec40_inquilino_role.sql', import.meta.url), 'utf8');
  assert.match(sql, /role in \('owner', 'admin', 'member', 'viewer', 'inquilino'\)/);
  assert.match(sql, /intended_role in \('admin', 'member', 'viewer', 'inquilino'\)/);
  assert.match(sql, /organization_memberships force row level security/);
  assert.match(sql, /organization_invitations force row level security/);
  assert.equal((sql.match(/security definer set search_path = pg_catalog/g) ?? []).length, 4);
  assert.match(sql, /actor_membership\.role in \('owner', 'admin'\)/);
  assert.match(sql, /from public, anon, authenticated/);
  assert.doesNotMatch(sql, /create table|alter table public\.(contracts|properties|arrangement_orders)/);
});
