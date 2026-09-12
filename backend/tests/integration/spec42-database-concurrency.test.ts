import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

// Run on a fresh disposable database prepared with the SPEC-42 upgrade/browser fixtures.
const uri = process.env.SPEC42_CONCURRENCY_DATABASE_URL;
const enabled = Boolean(uri);
if (uri && !['127.0.0.1', 'localhost'].includes(new URL(uri).hostname)) throw new Error('Disposable loopback database required');
const A = '20000000-0000-4000-8000-000000000001';
const owner = '30000000-0000-4000-8000-000000000001';
const admin = '30000000-0000-4000-8000-000000000002';
const legacy = '30000000-0000-4000-8000-000000000007';
const user = '10000000-0000-4000-8000-000000000005';
const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
function execute(statement: string): Promise<{ code: number; output: string; error: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.SPEC42_PSQL ?? 'psql', [uri!, '-XAtq', '-v', 'ON_ERROR_STOP=1']);
    let output = '', error = '';
    child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { error += data; });
    child.on('error', reject); child.on('close', code => resolve({ code: code ?? 1, output: output.trim(), error }));
    child.stdin.end(statement);
  });
}
async function sql(statement: string) {
  const result = await execute(statement); assert.equal(result.code, 0, result.error); return result.output;
}
async function property(name: string) {
  const output = await sql(`select public.spec42_create_arrangement_property('${A}','${owner}',${q(name)},${q(randomUUID())},'spec42-race-setup')->>'id';`);
  assert.match(output, /^[0-9a-f-]{36}$/u); return output;
}
const hold = (statement: string) => `begin; ${statement}; select pg_sleep(0.25); commit;`;

test('SPEC-42 PostgreSQL concurrent creation returns one property and one audit event', { skip: !enabled }, async () => {
  const key = randomUUID();
  const statement = `select public.spec42_create_arrangement_property('${A}','${owner}','Concurrent',${q(key)},'spec42-race-create')->>'id'`;
  const results = await Promise.all([execute(hold(statement)), execute(statement)]);
  for (const result of results) assert.equal(result.code, 0, result.error);
  assert.equal(results[0]!.output.trim(), results[1]!.output.trim());
  assert.equal(await sql(`select count(*) from public.arrangement_properties where idempotency_key=${q(key)};`), '1');
  assert.equal(await sql(`select count(*) from public.organization_events where target_id=${q(results[0]!.output.trim())} and event_type='arrangement.property_created';`), '1');
});

test('SPEC-42 PostgreSQL simultaneous associations cannot move a historical inquilino', { skip: !enabled }, async () => {
  const first = await property('First association'); const second = await property('Second association');
  const associate = (id: string) => `select public.spec42_associate_inquilino('${A}','${owner}',${q(id)},'${legacy}',1,'spec42-race-associate')`;
  const results = await Promise.all([execute(hold(associate(first))), execute(associate(second))]);
  assert.equal(results.filter(result => result.code === 0).length, 1);
  assert.match(results.find(result => result.code !== 0)!.error, /PROPERTY_CONFLICT/);
  const persisted = await sql(`select arrangement_property_id from public.organization_memberships where id='${legacy}';`);
  assert.ok([first, second].includes(persisted));
  assert.equal(await sql(`select count(*) from public.organization_events where target_id='${legacy}' and event_type='arrangement.inquilino_associated';`), '1');
});

test('SPEC-42 PostgreSQL competing invitations keep exactly one pending property and one issued token', { skip: !enabled }, async () => {
  const first = await property('First invitation'); const second = await property('Second invitation');
  const prepare = (id: string) => `select public.spec42_prepare_property_invitation('${A}','${owner}',${q(id)},'inquilino@example.test',${q(randomUUID())})->>'operation_id';`;
  const op1 = await sql(prepare(first)); const op2 = await sql(prepare(second));
  const issue = (id: string, op: string, token: string) => `select public.spec42_create_manual_invitation('${A}','${owner}',${q(op)},${q(id)},'inquilino@example.test',
    encode(extensions.digest(${q(token)},'sha256'),'hex'),'racetoken',now()+interval '1 day','${user}',true,'spec42-race-invite')`;
  const results = await Promise.all([execute(hold(issue(first, op1, 'first-race-token'))), execute(issue(second, op2, 'second-race-token'))]);
  assert.equal(results.filter(result => result.code === 0).length, 1);
  assert.match(results.find(result => result.code !== 0)!.error, /organization_invitations_one_pending_idx/);
  assert.equal(await sql(`select count(*) from public.organization_invitations where organization_id='${A}' and email_normalized='inquilino@example.test' and status='pending';`), '1');
  const op = results[0]!.code === 0 ? op1 : op2; const id = results[0]!.code === 0 ? first : second;
  const replay = JSON.parse(await sql(issue(id, op, 'losing-retry-token')));
  assert.equal(replay.link_issued, false); assert.equal(replay.arrangement_property_id, id);
});

test('SPEC-42 PostgreSQL acceptance vs revocation commits one consistent outcome without deadlock', { skip: !enabled }, async () => {
  const invitation = JSON.parse(await sql(`select json_build_object('id',id,'token',case when token_hash=encode(extensions.digest('first-race-token','sha256'),'hex') then 'first-race-token' else 'second-race-token' end)
    from public.organization_invitations where organization_id='${A}' and email_normalized='inquilino@example.test' and status='pending';`));
  const results = await Promise.all([
    execute(hold(`select public.spec26_accept_invitation(${q(invitation.token)},'${user}','inquilino@example.test','spec42-race-accept')`)),
    execute(`select public.spec37_revoke_invitation('${A}',${q(invitation.id)},'${owner}','spec42-race-revoke');`),
  ]);
  assert.equal(results.filter(result => result.code === 0).length, 1);
  assert.match(results.find(result => result.code !== 0)!.error, /INVITATION_INVALID/);
  const state = JSON.parse(await sql(`select json_build_object('status',i.status,'associated',exists(select 1 from public.organization_memberships m
    where m.invitation_id=i.id and m.arrangement_property_id=i.arrangement_property_id and m.status='active')) from public.organization_invitations i where id=${q(invitation.id)};`));
  assert.equal(state.associated, state.status === 'accepted');
});

test('SPEC-42 PostgreSQL identical issuance and acceptance attempts each commit only once', { skip: !enabled }, async () => {
  const id = await property('Identical attempts');
  const op = await sql(`select public.spec42_prepare_property_invitation('${A}','${owner}',${q(id)},'second@example.test',${q(randomUUID())})->>'operation_id';`);
  const issue = `select public.spec42_create_manual_invitation('${A}','${owner}',${q(op)},${q(id)},'second@example.test',
    encode(extensions.digest('same-attempt-token','sha256'),'hex'),'sameattempt',now()+interval '1 day',
    '10000000-0000-4000-8000-000000000006',true,'spec42-same-issue')`;
  const issued = await Promise.all([execute(hold(issue)), execute(issue)]);
  for (const result of issued) assert.equal(result.code, 0, result.error);
  const receipts = issued.map(result => JSON.parse(result.output));
  assert.equal(receipts[0].id, receipts[1].id);
  assert.equal(receipts.filter(receipt => receipt.link_issued).length, 1);
  await sql(`select public.spec37_create_invitation_handoff('same-attempt-token',repeat('3',64),repeat('4',64),repeat('5',64),now()+interval '10 minutes');`);
  const accept = `select public.spec37_accept_invitation_handoff(repeat('3',64),repeat('4',64),repeat('5',64),
    '10000000-0000-4000-8000-000000000006','second@example.test','spec42-same-accept')`;
  const accepted = await Promise.all([execute(hold(accept)), execute(accept)]);
  assert.equal(accepted.filter(result => result.code === 0).length, 1);
  assert.match(accepted.find(result => result.code !== 0)!.error, /INVITATION_INVALID/);
  assert.equal(await sql(`select count(*) from public.organization_memberships where invitation_id=${q(receipts[0].id)} and arrangement_property_id=${q(id)};`), '1');
});

test('SPEC-42 PostgreSQL suspension racing a write revalidates actor inside the transaction', { skip: !enabled }, async () => {
  const key = randomUUID();
  const results = await Promise.all([
    execute(hold(`select public.spec26_mutate_membership('${A}','10000000-0000-4000-8000-000000000002',null,'suspended',1,'test','${owner}','spec42-race-suspend')`)),
    execute(`select public.spec42_create_arrangement_property('${A}','${admin}','Suspension race',${q(key)},'spec42-suspended-write');`),
  ]);
  assert.equal(results[0]!.code, 0, results[0]!.error);
  if (results[1]!.code !== 0) assert.match(results[1]!.error, /FORBIDDEN/);
  // Regardless of which transaction won first, no later operation can use the stale actor context.
  const denied = await execute(`select public.spec42_create_arrangement_property('${A}','${admin}','After suspension',${q(randomUUID())},'spec42-after-suspend');`);
  assert.notEqual(denied.code, 0); assert.match(denied.error, /FORBIDDEN/);
});
