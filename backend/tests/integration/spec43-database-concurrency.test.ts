import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
const uri = process.env.SPEC43_CONCURRENCY_DATABASE_URL;
if (uri && (!['127.0.0.1', 'localhost'].includes(new URL(uri).hostname) || !new URL(uri).pathname.startsWith('/spec43'))) throw new Error('Disposable loopback spec43 database required');
const A = '20000000-0000-4000-8000-000000000001';
const owner = '30000000-0000-4000-8000-000000000001';
const tenant = '30000000-0000-4000-8000-000000000005';
const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
function execute(statement: string): Promise<{ code: number; output: string; error: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.SPEC43_PSQL ?? 'psql', [uri!, '-XAtq', '-v', 'ON_ERROR_STOP=1']);
    let output = '', error = '';
    child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { error += data; });
    child.on('error', reject); child.on('close', code => resolve({ code: code ?? 1, output: output.trim(), error }));
    child.stdin.end(statement);
  });
}
async function sql(statement: string) { const result = await execute(statement); assert.equal(result.code, 0, result.error); return result.output; }
const rpc = (actor: string, action: string, body: unknown) => `select public.spec43_arrangements('${A}',${q(actor)},${q(action)},${q(JSON.stringify(body))},'spec43-race')`;
const hold = (statement: string) => `begin; set local role service_role; ${statement}; select pg_sleep(0.2); commit;`;
const single = (statement: string) => `set role service_role; ${statement};`;
async function draft() { return JSON.parse(await sql(single(rpc(tenant, 'tenant.draft', { description: 'Concurrent repair', idempotency_key: randomUUID() })))).id as string; }

test('SPEC43 PostgreSQL concurrent draft and submit attempts each persist one request/event', { skip: !uri }, async () => {
  const statement = rpc(tenant, 'tenant.draft', { description: 'Same attempt', idempotency_key: randomUUID() });
  const results = await Promise.all([execute(hold(statement)), execute(single(statement))]);
  for (const result of results) assert.equal(result.code, 0, result.error);
  const ids = results.map(result => JSON.parse(result.output).id); assert.equal(ids[0], ids[1]);
  const submit = rpc(tenant, 'tenant.submit', { order_id: ids[0] });
  const submitted = await Promise.all([execute(hold(submit)), execute(single(submit))]);
  for (const result of submitted) assert.equal(result.code, 0, result.error);
  assert.deepEqual(JSON.parse(submitted[0]!.output), JSON.parse(submitted[1]!.output));
  assert.equal(await sql(`select count(*) from public.organization_events where target_id=${q(ids[0])} and event_type='arrangement.order_submitted';`), '1');
});
test('SPEC43 PostgreSQL competing statuses commit one audited version and return one conflict', { skip: !uri }, async () => {
  const id = await draft(); await sql(single(rpc(tenant, 'tenant.submit', { order_id: id })));
  const results = await Promise.all(['solved', 'archived'].map(status => execute(hold(rpc(owner, 'internal.status', { order_id: id, status, expected_version: 2 })))));
  for (const result of results) assert.equal(result.code, 0, result.error);
  const values = results.map(result => JSON.parse(result.output));
  assert.equal(values.filter(value => value.error === 'VERSION_CONFLICT').length, 1);
  assert.equal(await sql(`select version from public.arrangement_orders where id=${q(id)};`), '3');
  assert.equal(await sql(`select count(*) from public.organization_events where target_id=${q(id)} and event_type='arrangement.order_status_changed';`), '1');
});
test('SPEC43 PostgreSQL governance suspension and submission serialize and reject stale authority', { skip: !uri }, async () => {
  const id = await draft();
  const version = await sql(`select version from public.organization_memberships where id='${tenant}';`);
  const suspend = `select public.spec26_mutate_membership('${A}','10000000-0000-4000-8000-000000000005',null,'suspended',${Number(version)},'test','${owner}','spec43-suspend')`;
  try {
    const results = await Promise.all([execute(hold(suspend)), execute(single(rpc(tenant, 'tenant.submit', { order_id: id })))]);
    assert.equal(results[0]!.code, 0, results[0]!.error);
    if (results[1]!.code !== 0) assert.match(results[1]!.error, /FORBIDDEN/);
    const denied = await execute(single(rpc(tenant, 'tenant.submit', { order_id: id })));
    assert.notEqual(denied.code, 0); assert.match(denied.error, /FORBIDDEN/);
  } finally {
    const current = await sql(`select version from public.organization_memberships where id='${tenant}';`);
    await sql(`select public.spec26_mutate_membership('${A}','10000000-0000-4000-8000-000000000005',null,'active',${Number(current)},'test','${owner}','spec43-resume');`);
  }
});

test('SPEC43 PostgreSQL cancellation racing submission either expires the draft or returns the committed receipt', { skip: !uri }, async () => {
  const id = await draft();
  const results = await Promise.all([execute(hold(rpc(tenant, 'tenant.cancel', { order_id: id }))), execute(single(rpc(tenant, 'tenant.submit', { order_id: id })))]);
  assert.equal(results[0]!.code, 0, results[0]!.error);
  const cancelled = JSON.parse(results[0]!.output);
  const state = await sql(`select submission_state from public.arrangement_orders where id=${q(id)};`);
  assert.equal(state, cancelled.submission_state);
  if (state === 'expired') {
    assert.notEqual(results[1]!.code, 0); assert.match(results[1]!.error, /NOT_FOUND/);
  } else assert.equal(results[1]!.code, 0, results[1]!.error);
  assert.equal(await sql(`select count(*) from public.organization_events where target_id=${q(id)} and event_type='arrangement.order_submitted';`), state === 'submitted' ? '1' : '0');
});
