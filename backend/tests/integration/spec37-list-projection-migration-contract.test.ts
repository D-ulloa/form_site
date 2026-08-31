import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../../../supabase/migrations/20260827150000_spec37_list_projection_ambiguity_fix.sql',
  import.meta.url,
);

test('SPEC-37 list functions qualify membership status and role columns', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /actor_membership\.status = 'active'/u);
  assert.match(sql, /actor_membership\.role in \('owner','admin'\)/u);
  assert.doesNotMatch(sql, /where id = p_actor_membership_id/u);
  assert.doesNotMatch(sql, /and status = 'active'/u);
});
