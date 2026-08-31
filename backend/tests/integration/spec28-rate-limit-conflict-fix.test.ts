import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../../../supabase/migrations/20260827130000_spec28_rate_limit_conflict_fix.sql', import.meta.url);

test('SPEC-28 rate-limit upserts use named constraints instead of ambiguous output-column names', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /on conflict on constraint organization_rate_limit_buckets_pkey/u);
  assert.match(sql, /on conflict on constraint platform_rate_limit_buckets_pkey/u);
  assert.doesNotMatch(sql, /on conflict \(organization_id, policy_key/u);
  assert.doesNotMatch(sql, /on conflict \(policy_key, subject_hash/u);
});

test('SPEC-28 fixed functions retain bounded input and fail-closed capacity checks', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /octet_length\(p_subject_hash\) <> 32/g);
  assert.match(sql, /consumed \+ excluded\.consumed <= p_limit/g);
  assert.match(sql, /return query select false/g);
  assert.match(sql, /return query select true/g);
});
