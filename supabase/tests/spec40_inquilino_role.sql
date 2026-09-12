-- psql -v ON_ERROR_STOP=1 -f supabase/tests/spec40_inquilino_role.sql
-- Requires an empty disposable database with the documented migrations. Always rolls fixtures back.
begin;
\ir spec40_browser_fixtures.sql
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin
  execute statement;
  raise exception 'Expected rejection: %', expected;
exception when others then
  if sqlerrm not like '%' || expected || '%' or sqlerrm like 'Expected rejection:%' then raise; end if;
end;
$$;

create function pg_temp.reject_audit() returns trigger language plpgsql as $$
begin
  if new.request_id='spec40-audit-failure' then raise exception 'SPEC40_AUDIT_FAILURE'; end if;
  return new;
end; $$;
create trigger spec40_audit_failure before insert on public.organization_events
  for each row execute function pg_temp.reject_audit();

do $$
declare
  a uuid := '20000000-0000-4000-8000-000000000001'; b uuid := '20000000-0000-4000-8000-000000000002';
  owner_id uuid := '30000000-0000-4000-8000-000000000001'; admin_id uuid := '30000000-0000-4000-8000-000000000002';
  tenant_user uuid := '10000000-0000-4000-8000-000000000005'; second_user uuid := '10000000-0000-4000-8000-000000000006';
  invitation public.organization_invitations%rowtype;
  membership public.organization_memberships%rowtype;
  rotated public.organization_invitations%rowtype;
  version_before integer; events_before bigint;
begin
  assert (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.organization_memberships'::regclass);
  assert not has_function_privilege('authenticated', 'public.spec26_mutate_membership(uuid,uuid,text,text,integer,text,uuid,text)', 'execute');
  assert not has_function_privilege('anon', 'public.spec26_create_invitation(uuid,uuid,text,text,text,text,timestamptz,uuid,text)', 'execute');
  assert has_function_privilege('service_role', 'public.spec26_mutate_membership(uuid,uuid,text,text,integer,text,uuid,text)', 'execute');
  assert (select proconfig = array['search_path=pg_catalog'] from pg_proc where oid = 'public.spec26_mutate_membership(uuid,uuid,text,text,integer,text,uuid,text)'::regprocedure);

  -- The admin invitation path reaches the same atomic creation function as owners.
  select * into invitation from public.spec37_create_manual_invitation(gen_random_uuid(), a, 'inquilino@example.test', 'inquilino',
    encode(extensions.digest(repeat('t',43), 'sha256'), 'hex'), 'spec40token', now()+interval '1 day', admin_id,
    'spec40-create', tenant_user, true);
  assert invitation.intended_role = 'inquilino' and invitation.registration_permitted;
  assert not exists (select from public.organization_memberships where organization_id = a and user_id = tenant_user);
  perform public.spec37_create_invitation_handoff(repeat('t',43), repeat('a',64), repeat('b',64), repeat('c',64), now()+interval '10 minutes');
  assert (select intended_role = 'inquilino' from public.spec37_resolve_invitation_handoff(repeat('a',64),repeat('b',64),repeat('c',64)));
  assert (select registration_permitted from public.spec37_resolve_invitation_registration(repeat('a',64),repeat('b',64),repeat('c',64)));
  assert not exists (select from public.spec37_resolve_invitation_registration(repeat('d',64),repeat('b',64),repeat('c',64)));
  assert not exists (select from public.spec37_resolve_invitation_registration(repeat('a',64),repeat('d',64),repeat('c',64)));
  perform pg_temp.expect_error(format('select public.spec37_accept_invitation_handoff(%L,%L,%L,%L,%L,%L)',
    repeat('a',64), repeat('b',64),repeat('c',64),'10000000-0000-4000-8000-000000000003','other@example.test','spec40-wrong-identity'),'INVITATION_INVALID');
  perform public.spec37_complete_invitation_registration(repeat('a',64),repeat('b',64),repeat('c',64),tenant_user,'Inquilino','spec40-activate');
  assert not exists (select from public.organization_memberships where organization_id = a and user_id = tenant_user);
  select * into membership from public.spec37_accept_invitation_handoff(repeat('a',64),repeat('b',64),repeat('c',64),tenant_user,'inquilino@example.test','spec40-accept');
  assert membership.role = 'inquilino' and membership.status = 'active' and membership.organization_id = a;
  assert not exists (select from public.organization_memberships where organization_id = b and user_id = tenant_user);
  perform pg_temp.expect_error(format('select public.spec37_accept_invitation_handoff(%L,%L,%L,%L,%L,%L)',
    repeat('a',64), repeat('b',64),repeat('c',64),tenant_user,'inquilino@example.test','spec40-replay'),'INVITATION_INVALID');

  -- Every internal RPC rejects inquilino authority, including member listing.
  perform pg_temp.expect_error(format('select public.spec37_list_members(%L,%L,null,50)',a,membership.id),'FORBIDDEN');
  perform pg_temp.expect_error(format('select public.spec37_list_invitations(%L,%L,null,50)',a,membership.id),'FORBIDDEN');
  perform pg_temp.expect_error(format('select public.spec37_list_members(%L,%L,null,50)',b,admin_id),'FORBIDDEN');
  perform pg_temp.expect_error(format('select public.spec26_mutate_membership(%L,%L,%L,null,1,null,%L,%L)',a,tenant_user,'member',membership.id,'spec40-self'),'FORBIDDEN');
  perform pg_temp.expect_error(format('select public.spec26_mutate_membership(%L,%L,%L,null,1,null,%L,%L)',a,tenant_user,'admin',admin_id,'spec40-escalation'),'FORBIDDEN');
  perform pg_temp.expect_error(format('select public.spec26_mutate_membership(%L,%L,%L,null,1,null,%L,%L)',b,tenant_user,'inquilino',admin_id,'spec40-cross'),'NOT_FOUND');
  perform pg_temp.expect_error(format('select public.spec26_mutate_membership(%L,%L,%L,null,99,null,%L,%L)',a,tenant_user,'member',owner_id,'spec40-conflict'),'VERSION_CONFLICT');
  perform pg_temp.expect_error(format('select public.spec26_mutate_membership(%L,%L,%L,null,1,null,%L,%L)',a,'10000000-0000-4000-8000-000000000001','inquilino',admin_id,'spec40-owner'),'FORBIDDEN');

  select * into membership from public.spec26_mutate_membership(a,tenant_user,'member',null,membership.version,null,admin_id,'spec40-promote');
  select * into membership from public.spec26_mutate_membership(a,tenant_user,'inquilino',null,membership.version,null,owner_id,'spec40-role');
  assert membership.role = 'inquilino' and membership.version = 3;
  select * into membership from public.spec26_mutate_membership(a,tenant_user,null,'suspended',membership.version,'test',admin_id,'spec40-suspend');
  assert membership.role = 'inquilino' and membership.status = 'suspended';
  select * into membership from public.spec26_mutate_membership(a,tenant_user,null,'active',membership.version,null,admin_id,'spec40-reactivate');
  select * into membership from public.spec26_mutate_membership(a,tenant_user,null,'removed',membership.version,'test',admin_id,'spec40-remove');
  assert membership.role = 'inquilino' and membership.status = 'removed';
  perform pg_temp.expect_error(format('select public.spec26_mutate_membership(%L,%L,null,%L,%s,null,%L,%L)',a,tenant_user,'active',membership.version,owner_id,'spec40-revive'),'FORBIDDEN');

  select * into invitation from public.spec37_create_manual_invitation(gen_random_uuid(), a, 'second@example.test', 'inquilino',
    encode(extensions.digest(repeat('u',43), 'sha256'), 'hex'), 'spec40second', now()+interval '1 day', owner_id,
    'spec40-second', second_user, true);
  perform public.spec37_create_invitation_handoff(repeat('u',43),repeat('d',64),repeat('b',64),repeat('c',64),now()+interval '10 minutes');
  select * into rotated from public.spec37_resend_invitation(a,invitation.id,gen_random_uuid(),
    encode(extensions.digest(repeat('v',43),'sha256'),'hex'),'spec40rotate',now()+interval '1 day',admin_id,'spec40-rotate');
  assert rotated.intended_role = 'inquilino';
  assert not exists (select from public.spec37_resolve_invitation_registration(repeat('d',64),repeat('b',64),repeat('c',64)));
  perform public.spec37_create_invitation_handoff(repeat('v',43),repeat('e',64),repeat('b',64),repeat('c',64),now()+interval '10 minutes');
  perform public.spec37_revoke_invitation(a,rotated.id,admin_id,'spec40-revoke');
  assert not exists (select from public.spec37_resolve_invitation_registration(repeat('e',64),repeat('b',64),repeat('c',64)));
  perform pg_temp.expect_error(format('select public.spec37_complete_invitation_registration(%L,%L,%L,%L,%L,%L)',
    repeat('e',64),repeat('b',64),repeat('c',64),second_user,'Invalid','spec40-revoked-register'),'INVITATION_INVALID');
  select * into invitation from public.spec37_create_manual_invitation(gen_random_uuid(), a, 'second@example.test', 'inquilino',
    encode(extensions.digest(repeat('w',43),'sha256'),'hex'),'spec40expired',now()+interval '1 day',owner_id,'spec40-expired',second_user,true);
  update public.organization_invitations set created_at=now()-interval '2 days', expires_at=now()-interval '1 minute' where id=invitation.id;
  perform pg_temp.expect_error(format('select public.spec37_create_invitation_handoff(%L,%L,%L,%L,now()+interval ''1 minute'')',repeat('w',43),repeat('f',64),repeat('b',64),repeat('c',64)),'INVITATION_INVALID');

  -- Last-owner protection also survives a role extension.
  select version into version_before from public.organization_memberships where id = owner_id;
  perform pg_temp.expect_error(format('update public.organization_memberships set role=%L where id=%L','inquilino',owner_id),'LAST_OWNER_REQUIRED');
  assert (select version = version_before from public.organization_memberships where id = owner_id);
  assert (select count(*) from public.organization_events where organization_id=a and event_type='member.invitation_accepted') = 1;
  select count(*) into events_before from public.organization_events;
  perform pg_temp.expect_error(format('update public.organization_memberships set status=%L where id=%L','inquilino',membership.id),'check constraint');
  assert (select count(*) from public.organization_events) = events_before;

  perform pg_temp.expect_error(format('select public.spec26_mutate_membership(%L,%L,%L,null,1,null,%L,%L)',
    a,'10000000-0000-4000-8000-000000000002','inquilino',owner_id,'spec40-audit-failure'),'SPEC40_AUDIT_FAILURE');
  assert (select role='admin' and version=1 from public.organization_memberships where id=admin_id);
  assert (select count(*) from public.organization_events) = events_before;

  -- The dedicated transfer flow alone may make a recipient owner and retire the source to inquilino.
  perform public.spec26_transfer_ownership(a,owner_id,'10000000-0000-4000-8000-000000000002','inquilino',
    (select version from public.organizations where id=a),
    (select version from public.organization_memberships where id=admin_id),'spec40-transfer');
  assert (select role='owner' from public.organization_memberships where id=admin_id);
  assert (select role='inquilino' from public.organization_memberships where id=owner_id);
end;
$$;
set local role authenticated;
do $$ begin
  begin perform * from public.organization_memberships; raise exception 'Browser read allowed';
  exception when insufficient_privilege then null; end;
  begin perform public.spec37_list_members('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',null,50);
    raise exception 'Browser RPC allowed'; exception when insufficient_privilege then null; end;
end; $$;
reset role;
rollback;
