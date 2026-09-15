import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
const uri = process.env.SPEC45_DATABASE_URL;
const upgrade = process.env.SPEC45_UPGRADE_DATABASE_URL;
for (const value of [uri, upgrade]) if (value && (!['127.0.0.1', 'localhost'].includes(new URL(value).hostname) || !new URL(value).pathname.startsWith('/spec45'))) throw new Error('Disposable loopback spec45 database required');
const psql = process.env.SPEC45_PSQL ?? 'psql';
const file = (name: string) => fileURLToPath(new URL(`../../../supabase/${name}`, import.meta.url));
function sql(db: string, statement: string) { return execFileSync(psql, [db, '-XAtq', '-v', 'ON_ERROR_STOP=1', '-c', statement], { encoding: 'utf8' }).trim(); }
function execute(statement: string): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(psql, [uri!, '-XAtq', '-v', 'ON_ERROR_STOP=1']); let output = '';
    child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', reject); child.on('close', code => resolve({ code: code ?? 1, output: output.trim() })); child.stdin.end(statement);
  });
}
const org = '20000000-0000-4000-8000-000000000001';
const owner = '30000000-0000-4000-8000-000000000001';
const personal = '30000000-0000-4000-8000-000000000009';
const second = '30000000-0000-4000-8000-000000000013';
const tenant = '30000000-0000-4000-8000-000000000010';
const rpc = (action: string, input: unknown, actor = owner) => `select public.spec45_arrangements('${org}','${actor}','${action}','${JSON.stringify(input)}','spec45-race')`;
test('SPEC45 SQL checks scoped reads, DTO privacy, contact acceptance, legacy adapters and atomic audit', { skip: !uri }, () => {
  const output = execFileSync(psql, [uri!, '-X', '-v', 'ON_ERROR_STOP=1', '-f', file('tests/spec45_personal_assignments.sql')], { encoding: 'utf8' });
  assert.match(output, /SPEC-45 SQL assertions passed/);
});
test('SPEC45 real concurrent managers cannot overwrite assignment and rejection decisions', { skip: !uri }, async () => {
  const draft = JSON.parse(sql(uri!, `select public.spec43_arrangements('${org}','${tenant}','tenant.draft','{"description":"Race","idempotency_key":"race-${Date.now()}"}','spec45-race')`));
  const order = JSON.parse(sql(uri!, `select public.spec43_arrangements('${org}','${tenant}','tenant.submit','{"order_id":"${draft.id}"}','spec45-race')`));
  const results = await Promise.all([personal, second].map(id => execute(`begin; set local role service_role; ${rpc('internal.assign', { order_id: order.id, expected_version: order.version, assigned_personal_membership_id: id })}; select pg_sleep(0.2); commit;`)));
  for (const result of results) assert.equal(result.code, 0, result.output);
  const parsed = results.map(result => JSON.parse(result.output));
  assert.equal(parsed.filter(result => result.error === 'VERSION_CONFLICT').length, 1);
  const winner = parsed.find(result => !result.error);
  const conflicting = await Promise.all([
    execute(`begin; set local role service_role; ${rpc('internal.assign', { order_id: order.id, expected_version: winner.version, assigned_personal_membership_id: winner.assignee.id === personal ? second : personal })}; select pg_sleep(0.2); commit;`),
    execute(`set role service_role; ${rpc('internal.reject', { order_id: order.id, expected_version: winner.version })};`),
  ]);
  for (const result of conflicting) assert.equal(result.code, 0, result.output);
  assert.equal(conflicting.map(result => JSON.parse(result.output)).filter(result => result.error === 'VERSION_CONFLICT').length, 1);
});
test('SPEC45 assignment versus suspension serializes and immediately rejects new personal reads', { skip: !uri }, async () => {
  const version = sql(uri!, `select version from public.organization_memberships where id='${personal}'`);
  const draft = JSON.parse(sql(uri!, `select public.spec43_arrangements('${org}','${tenant}','tenant.draft','{"description":"Suspension race","idempotency_key":"suspend-${Date.now()}"}','spec45-race')`));
  const order = JSON.parse(sql(uri!, `select public.spec43_arrangements('${org}','${tenant}','tenant.submit','{"order_id":"${draft.id}"}','spec45-race')`));
  try {
    const results = await Promise.all([
      execute(`begin; set local role service_role; select public.spec26_mutate_membership('${org}','10000000-0000-4000-8000-000000000009',null,'suspended',${version},'test','${owner}','spec45-race'); select pg_sleep(0.2); commit;`),
      execute(`set role service_role; ${rpc('internal.assign', { order_id: order.id, expected_version: order.version, assigned_personal_membership_id: personal })};`),
    ]);
    assert.equal(results[0]!.code, 0, results[0]!.output);
    if (results[1]!.code !== 0) assert.match(results[1]!.output, /ASSIGNEE_UNAVAILABLE/);
    const denied = await execute(`set role service_role; ${rpc('personal.list', { limit: 25 }, personal)};`);
    assert.notEqual(denied.code, 0); assert.match(denied.output, /FORBIDDEN/);
  } finally {
    const current = sql(uri!, `select version from public.organization_memberships where id='${personal}'`);
    sql(uri!, `select public.spec26_mutate_membership('${org}','10000000-0000-4000-8000-000000000009',null,'active',${current},'test','${owner}','spec45-resume')`);
  }
});
test('SPEC45 upgrade preserves historical nullable phones and existing drafts', { skip: !upgrade }, () => {
  const before = sql(upgrade!, "select jsonb_agg(jsonb_build_array(id,organization_id,user_id,role,status,arrangement_property_id) order by id) from public.organization_memberships");
  const draft = JSON.parse(sql(upgrade!, `select public.spec43_arrangements('${org}','${tenant}','tenant.draft','{"description":"Before upgrade","idempotency_key":"upgrade-draft"}','spec45-upgrade')`));
  for (const migration of ['20260912160000_spec45_tenant_contact.sql', '20260912170000_spec45_personal_assignments.sql']) execFileSync(psql, [upgrade!, '-Xq', '-v', 'ON_ERROR_STOP=1', '-f', file(`migrations/${migration}`)], { encoding: 'utf8' });
  assert.equal(sql(upgrade!, "select jsonb_agg(jsonb_build_array(id,organization_id,user_id,role,status,arrangement_property_id) order by id) from public.organization_memberships"), before);
  assert.equal(sql(upgrade!, 'select count(*) from public.organization_memberships where inquilino_contact_number is not null'), '0');
  assert.equal(sql(upgrade!, "select count(*) from public.organization_memberships where role='inquilino' and inquilino_first_joined_at is null"), '0');
  const submitted = JSON.parse(sql(upgrade!, `select public.spec43_arrangements('${org}','${tenant}','tenant.submit','{"order_id":"${draft.id}"}','spec45-upgrade')`));
  assert.equal(submitted.status, 'open');
  const contact = JSON.parse(sql(upgrade!, rpc('internal.detail', { order_id: draft.id })));
  assert.equal(contact.requester.contact_number, null);
  sql(upgrade!, `select public.spec26_mutate_membership('${org}','10000000-0000-4000-8000-000000000010',null,'removed',(select version from public.organization_memberships where id='${tenant}'),'test','${owner}','spec45-remove');
    insert into public.organization_invitations(organization_id,email_normalized,intended_role,token_hash,expires_at,invited_by_membership_id,arrangement_property_id)
      select '${org}','tenant@example.test','inquilino',encode(extensions.digest(repeat('r',43),'sha256'),'hex'),now()+interval '1 day','${owner}',arrangement_property_id
      from public.organization_memberships where id='${tenant}';
    select public.spec26_accept_invitation(repeat('r',43),'10000000-0000-4000-8000-000000000010','tenant@example.test','spec45-reactivate');`);
  assert.equal(sql(upgrade!, `select status='active' and inquilino_contact_number is null from public.organization_memberships where id='${tenant}'`), 't');
});
test('SPEC45 concurrent tenant acceptances preserve the first committed phone and recover its receipt', { skip: !uri }, async () => {
  const { randomBytes } = await import('node:crypto');
  const raw = randomBytes(32).toString('base64url'); const handle = randomBytes(32).toString('hex'); const binding = randomBytes(32).toString('hex'); const origin = randomBytes(32).toString('hex');
  const user = '10000000-0000-4000-8000-000000000006';
  sql(uri!, `update auth.users set email_confirmed_at=now() where id='${user}';
    insert into public.organization_invitations(organization_id,email_normalized,intended_role,token_hash,expires_at,invited_by_membership_id,arrangement_property_id,invited_auth_user_id)
      select '${org}','second@example.test','inquilino',encode(extensions.digest('${raw}','sha256'),'hex'),now()+interval '1 day','${owner}',arrangement_property_id,'${user}'
      from public.organization_memberships where id='${tenant}';
    select public.spec37_create_invitation_handoff('${raw}','${handle}','${binding}','${origin}',now()+interval '10 minutes');`);
  const results = await Promise.all(['+58 412 1111111', '+58 412 2222222'].map(contact => execute(`begin; set local role service_role;
    select to_jsonb(m) from public.spec45_accept_invitation_handoff('${handle}','${binding}','${origin}','${user}','second@example.test','spec45-phone-race',null,'{"contact_number":"${contact}"}') m;
    select pg_sleep(0.2); commit;`)));
  assert.equal(results.filter(result => result.code === 0).length, 1);
  assert.match(results.find(result => result.code !== 0)!.output, /INVITATION_INVALID/);
  const winner = JSON.parse(results.find(result => result.code === 0)!.output);
  const recovered = JSON.parse(sql(uri!, `select to_jsonb(m) from public.spec42_recover_accepted_handoff('${handle}','${binding}','${origin}','${user}','second@example.test') m`));
  assert.equal(recovered.inquilino_contact_number, winner.inquilino_contact_number);
  assert.equal(sql(uri!, `select count(*) from public.organization_events where target_id='${winner.id}' and event_type='member.invitation_accepted'`), '1');
});
