import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
const uri=process.env.SPEC44_UPGRADE_DATABASE_URL;
if(uri && (!['127.0.0.1','localhost'].includes(new URL(uri).hostname)||!new URL(uri).pathname.startsWith('/spec44'))) throw new Error('Disposable spec44 database required');
test('SPEC-44 upgrades prior roles and properties without reassigning rows or removing guards',{skip:!uri},()=>{
  const psql=(args:string[])=>execFileSync(process.env.SPEC44_PSQL??'psql',[uri!,'-XAtq','-v','ON_ERROR_STOP=1',...args],{encoding:'utf8'}).trim();
  psql(['-1','-f',fileURLToPath(new URL('../../../supabase/tests/spec40_browser_fixtures.sql',import.meta.url))]);
  const projection="select jsonb_agg(jsonb_build_array(id,organization_id,user_id,role,status,arrangement_property_id) order by id)::text from public.organization_memberships";
  const before=psql(['-c',projection]);
  psql(['-f',fileURLToPath(new URL('../../../supabase/migrations/20260912150000_spec44_personal_invitations.sql',import.meta.url))]);
  assert.equal(psql(['-c',projection]),before);
  assert.equal(psql(['-c',"select count(*) from public.organization_memberships where personal_name is not null or personal_contact_number is not null or personal_occupation is not null"]),'0');
  assert.equal(psql(['-c',"select count(*) from pg_trigger where tgrelid='public.organization_memberships'::regclass and tgfoid='public.spec42_guard_membership_property()'::regprocedure"]),'1');
  assert.equal(psql(['-c',"select has_function_privilege('service_role','public.spec44_accept_invitation(uuid,uuid,text,text,jsonb)','execute')"]),'f');
});
