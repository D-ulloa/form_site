import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
const uri=process.env.SPEC44_CONCURRENCY_DATABASE_URL;
if(uri && (!['127.0.0.1','localhost'].includes(new URL(uri).hostname)||!new URL(uri).pathname.startsWith('/spec44'))) throw new Error('Disposable spec44 database required');
const a='20000000-0000-4000-8000-000000000001',actor='30000000-0000-4000-8000-000000000007';
const q=(value:string)=>`'${value.replaceAll("'","''")}'`;
function execute(statement:string):Promise<{code:number;output:string}> {
  return new Promise((resolve,reject)=>{
    const child=spawn(process.env.SPEC44_PSQL??'psql',[uri!,'-XAtq','-v','ON_ERROR_STOP=1']);
    let output='';child.stdout.on('data',s=>{output+=s;});child.stderr.on('data',s=>{output+=s;});
    child.on('error',reject);child.on('close',code=>resolve({code:code??1,output:output.trim()}));child.stdin.end(statement);
  });
}
async function sql(statement:string) {const result=await execute(statement);assert.equal(result.code,0,result.output);return result.output;}
async function fixture() {
  const user=randomUUID(),email=`${user}@example.test`,key=randomUUID(),token=randomUUID()+randomUUID();
  await sql(`insert into auth.users(id,email) values(${q(user)},${q(email)}); insert into public.user_profiles(user_id,display_name,locale,time_zone) values(${q(user)},'Global','es','America/Caracas');`);
  const op=await sql(`select public.spec44_prepare_personal_invitation('${a}','${actor}',${q(email)},${q(key)})->>'operation_id'`);
  const create=`select public.spec44_create_personal_invitation('${a}','${actor}',${q(op)},${q(email)},encode(extensions.digest(${q(token)},'sha256'),'hex'),'race-prefix',now()+interval '1 day',${q(user)},false,'share_link','spec44-concurrency')`;
  return {user,email,token,op,create};
}
test('SPEC-44 concurrent issuance returns one invitation and one usable token receipt',{skip:!uri},async()=>{
  const f=await fixture();
  const results=await Promise.all([execute(`begin;${f.create};select pg_sleep(0.15);commit;`),execute(f.create)]);
  for(const r of results) assert.equal(r.code,0,r.output);
  const receipts=results.map(r=>JSON.parse(r.output));assert.equal(receipts[0].id,receipts[1].id);
  assert.equal(receipts.filter(r=>r.link_issued).length,1);
  assert.equal(await sql(`select count(*) from public.organization_events where target_id=${q(receipts[0].id)} and event_type='member.invited'`),'1');
});
test('SPEC-44 concurrent acceptance commits one complete profile, and retries cannot edit it',{skip:!uri},async()=>{
  const f=await fixture();await sql(f.create);
  const accept=(name:string)=>`select id from public.spec44_accept_invitation_token(${q(f.token)},${q(f.user)},${q(f.email)},'spec44-race-accept',${q(JSON.stringify({name,contact_number:'00123',occupation:'Electricista'}))}::jsonb)`;
  const results=await Promise.all([execute(`begin;${accept('Primero')};select pg_sleep(0.15);commit;`),execute(accept('Segundo'))]);
  assert.equal(results.filter(r=>r.code===0).length,1);assert.match(results.find(r=>r.code!==0)!.output,/INVITATION_INVALID/);
  const saved=await sql(`select personal_name from public.organization_memberships where user_id=${q(f.user)} and organization_id='${a}'`);
  assert.ok(['Primero','Segundo'].includes(saved));
  assert.notEqual((await execute(accept('Editado'))).code,0);
  assert.equal(await sql(`select personal_name from public.organization_memberships where user_id=${q(f.user)} and organization_id='${a}'`),saved);
});
test('SPEC-44 revocation racing acceptance never leaves a partial membership',{skip:!uri},async()=>{
  const f=await fixture();const invitation=JSON.parse(await sql(f.create));
  const revoke=`select id from public.spec44_revoke_personal_invitation('${a}',${q(invitation.id)},'${actor}','spec44-race-revoke')`;
  const accept=`select id from public.spec44_accept_invitation_token(${q(f.token)},${q(f.user)},${q(f.email)},'spec44-race-accept','{"name":"Ana","contact_number":"00123","occupation":"Electricista"}')`;
  const results=await Promise.all([execute(`begin;${revoke};select pg_sleep(0.15);commit;`),execute(accept)]);
  assert.equal(results.filter(r=>r.code===0).length,1);
  const status=await sql(`select status from public.organization_invitations where id=${q(invitation.id)}`);
  assert.equal(await sql(`select count(*) from public.organization_memberships where user_id=${q(f.user)}`),status==='accepted'?'1':'0');
});
