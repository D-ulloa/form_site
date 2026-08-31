import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../../../supabase/migrations/20260827160000_spec37_handoff_digest_schema_fix.sql',
  import.meta.url,
);

test('SPEC-37 handoff hashes invitation tokens with the installed pgcrypto schema', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /extensions\.digest\(p_raw_invitation_token, 'sha256'\)/u);
  assert.doesNotMatch(sql, /public\.digest/u);
});
