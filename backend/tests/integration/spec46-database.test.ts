import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
const uri = process.env.SPEC46_DATABASE_URL;
if (uri && (!['127.0.0.1', 'localhost'].includes(new URL(uri).hostname) || !new URL(uri).pathname.startsWith('/spec46'))) throw new Error('Disposable loopback spec46 database required');
const psql = process.env.SPEC46_PSQL ?? 'psql';
const file = (name: string) => fileURLToPath(new URL(`../../../supabase/${name}`, import.meta.url));
test('SPEC46 SQL checks report lifecycle, visibility, transitions, grants and atomic audit', { skip: !uri }, () => {
  const output = execFileSync(psql, [uri!, '-X', '-v', 'ON_ERROR_STOP=1', '-f', file('tests/spec46_work_reports.sql')], { encoding: 'utf8' });
  assert.match(output, /SPEC-46 SQL assertions passed/);
});
