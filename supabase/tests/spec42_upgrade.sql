-- Run against the disposable browser fixture after applying the enforcement migration.
begin;
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin execute statement; raise exception 'Expected rejection: %',expected;
exception when others then if sqlerrm not like '%'||expected||'%' or sqlerrm like 'Expected rejection:%' then raise; end if; end; $$;
do $$
declare a uuid := '20000000-0000-4000-8000-000000000001'; owner_id uuid := '30000000-0000-4000-8000-000000000001';
declare legacy_id uuid := '30000000-0000-4000-8000-000000000007'; p jsonb; m public.organization_memberships%rowtype;
begin
  assert (select role='inquilino' and status='active' and arrangement_property_id is null from public.organization_memberships where id=legacy_id);
  assert not exists(select from public.spec26_resolve_invitation(repeat('l',43)));
  assert not exists(select from public.spec37_resolve_invitation_handoff(repeat('e',64),repeat('f',64),repeat('a',64)));
  assert not exists(select from public.spec37_resolve_invitation_registration(repeat('e',64),repeat('f',64),repeat('a',64)));
  perform pg_temp.expect_error(format('select public.spec26_accept_invitation(%L,%L,%L,%L)',repeat('l',43),'10000000-0000-4000-8000-000000000011','legacy-invite@example.test','spec42-legacy-accept'),'INVITATION_INVALID');
  perform pg_temp.expect_error(format('select public.spec37_complete_invitation_registration(%L,%L,%L,%L,%L,%L)',repeat('e',64),repeat('f',64),repeat('a',64),'10000000-0000-4000-8000-000000000011','Legacy','spec42-legacy-register'),'INVITATION_INVALID');
  perform public.spec37_revoke_invitation(a,'90000000-0000-4000-8000-000000000001',owner_id,'spec42-legacy-revoke');
  assert (select invalidated_at is not null from public.invitation_auth_handoffs where handle_hash=repeat('e',64));
  select * into m from public.spec26_mutate_membership(a,'10000000-0000-4000-8000-000000000007',null,'suspended',1,'test',owner_id,'spec42-legacy-suspend');
  perform pg_temp.expect_error(format('select public.spec26_mutate_membership(%L,%L,null,%L,%s,null,%L,%L)',a,m.user_id,'active',m.version,owner_id,'spec42-legacy-reactivate'),'PROPERTY_REQUIRED');
end; $$;
rollback;
-- Association begins from the unchanged, active historical membership.
begin;
do $$
declare a uuid := '20000000-0000-4000-8000-000000000001'; owner_id uuid := '30000000-0000-4000-8000-000000000001';
declare legacy_id uuid := '30000000-0000-4000-8000-000000000007'; p jsonb; association jsonb;
begin
  p:=public.spec42_create_arrangement_property(a,owner_id,'Legacy property','upgrade-property','spec42-upgrade');
  association:=public.spec42_associate_inquilino(a,owner_id,(p->>'id')::uuid,legacy_id,1,'spec42-upgrade-associate');
  assert association->>'arrangement_property_id'=p->>'id';
  assert association=public.spec42_associate_inquilino(a,owner_id,(p->>'id')::uuid,legacy_id,1,'spec42-upgrade-retry');
end; $$;
rollback;
