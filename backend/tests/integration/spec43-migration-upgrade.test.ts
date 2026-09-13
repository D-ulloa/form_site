import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const uri = process.env.SPEC43_UPGRADE_DATABASE_URL;
if (uri && (!['127.0.0.1', 'localhost'].includes(new URL(uri).hostname) || !new URL(uri).pathname.startsWith('/spec43'))) throw new Error('Disposable loopback spec43 database required');
function execute(sql: string): Promise<{ code: number; output: string; error: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.SPEC43_PSQL ?? 'psql', [uri!, '-XAtq', '-v', 'ON_ERROR_STOP=1']);
    let output = '', error = '';
    child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { error += data; });
    child.on('error', reject); child.on('close', code => resolve({ code: code ?? 1, output: output.trim(), error })); child.stdin.end(sql);
  });
}
test('SPEC43 upgrade rejects unknown states atomically and preserves actual legacy fields', { skip: !uri }, async () => {
  const fixtures = await readFile(new URL('../../../supabase/tests/spec40_browser_fixtures.sql', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../../../supabase/migrations/20260912140000_spec43_arrangement_requests.sql', import.meta.url), 'utf8');
  const setup = await execute(`begin; ${fixtures}
    insert into public.arrangement_orders(organization_id,name,status) values
    ('20000000-0000-4000-8000-000000000001','Historical open','open'),
    ('20000000-0000-4000-8000-000000000001','Historical unknown','custom_test_state'); commit;`);
  assert.equal(setup.code, 0, setup.error);
  const denied = await execute(migration);
  assert.notEqual(denied.code, 0); assert.match(denied.error, /SPEC43_UNKNOWN_LEGACY_STATUS/);
  const unchanged = await execute("select count(*) from information_schema.columns where table_schema='public' and table_name='arrangement_orders' and column_name='submission_state';");
  assert.equal(unchanged.output, '0');
  // Explicit mapping of a synthetic test state; never a production mapping or fallback.
  const mapping = await execute("update public.arrangement_orders set status='archived' where status='custom_test_state';");
  assert.equal(mapping.code, 0, mapping.error);
  const applied = await execute(migration); assert.equal(applied.code, 0, applied.error);
  const rows = await execute("select jsonb_agg(jsonb_build_object('name',name,'status',status,'state',submission_state,'description',description,'property',arrangement_property_id,'author',created_by_membership_id,'created_at',created_at,'submitted_at',submitted_at) order by name) from public.arrangement_orders;");
  const data = JSON.parse(rows.output);
  assert.equal(data.length, 2);
  for (const row of data) {
    assert.equal(row.state, 'legacy');
    for (const key of ['description', 'property', 'author', 'created_at', 'submitted_at']) assert.equal(row[key], null);
  }
  assert.deepEqual(data.map((row: { status: string }) => row.status), ['open', 'archived']);
});
