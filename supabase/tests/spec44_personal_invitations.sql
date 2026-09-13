\set ON_ERROR_STOP on
begin;
\ir spec44_browser_fixtures.sql
create function pg_temp.require(p_ok boolean,p_label text) returns void language plpgsql as $$
begin if p_ok is distinct from true then raise exception 'Assertion failed: %',p_label; end if; end; $$;
create function pg_temp.reject(p_sql text,p_error text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if position(p_error in sqlerrm)>0 then return; end if;
    raise exception 'Expected %, received %',p_error,sqlerrm;
  end;
  raise exception 'Expected rejection %',p_error;
end; $$;
select pg_temp.require(public.spec44_trim(' Liv ')= 'Liv','trim does not remove a trailing v');
select pg_temp.require(public.spec44_trim(chr(160)||'Ana'||chr(11))='Ana','Unicode trim');
select pg_temp.require(not public.spec44_profile_text_valid('A'||chr(133)||'B',120),'control rejection');
select pg_temp.require(public.spec44_profile_text_valid(repeat('😀',120),120),'Unicode codepoint count');
select pg_temp.require(not public.spec44_profile_text_valid(null,120),'NULL rejects');

do $$ declare a constant uuid:='20000000-0000-4000-8000-000000000001';
  b constant uuid:='20000000-0000-4000-8000-000000000002';
  inviter constant uuid:='30000000-0000-4000-8000-000000000007';
  invited constant uuid:='10000000-0000-4000-8000-000000000012';
  op uuid; opb uuid; inv uuid; invb uuid; m public.organization_memberships%rowtype;
  result jsonb; role_id uuid; claim record;
begin
  foreach role_id in array array['30000000-0000-4000-8000-000000000008'::uuid,'30000000-0000-4000-8000-000000000009','30000000-0000-4000-8000-000000000010'] loop
    perform pg_temp.reject(format('select public.spec44_prepare_personal_invitation(%L,%L,%L,%L)',a,role_id,'existing-personal@example.test','spec44-denied'),'FORBIDDEN');
  end loop;
  perform pg_temp.reject(format('select public.spec44_prepare_personal_invitation(%L,%L,%L,%L)',b,inviter,'existing-personal@example.test','spec44-foreign'),'FORBIDDEN');
  -- Member cannot use any general invitation target or the old provisioning claim.
  foreach result in array array['"admin"'::jsonb,'"member"'::jsonb,'"viewer"'::jsonb,'"inquilino"'::jsonb,'"personal"'::jsonb] loop
    perform pg_temp.reject(format('select public.spec26_create_invitation(gen_random_uuid(),%L,%L,%L,%L,%L,now()+interval ''1 day'',%L,%L)',a,'existing-personal@example.test',result#>>'{}',repeat('a',64),'prefix',inviter,'spec44-general'),'FORBIDDEN');
  end loop;
  perform pg_temp.reject(format('select * from public.spec35_claim_identity_provisioning(%L,%L,%L,%L,%L,%L,%L,%L,null)',
    'spec44-legacy-claim',repeat('a',64),repeat('b',64),'organization_invitee','spec44-legacy-claim','organization_invitation','10000000-0000-4000-8000-000000000007',inviter),'FORBIDDEN');

  op:=(public.spec44_prepare_personal_invitation(a,inviter,'existing-personal@example.test','spec44-accept')->>'operation_id')::uuid;
  perform pg_temp.require(op=(public.spec44_prepare_personal_invitation(a,inviter,'existing-personal@example.test','spec44-accept')->>'operation_id')::uuid,'durable replay');
  perform pg_temp.reject(format('select public.spec44_prepare_personal_invitation(%L,%L,%L,%L)',a,inviter,'different@example.test','spec44-accept'),'IDEMPOTENCY_CONFLICT');
  perform pg_temp.reject(format('select public.spec44_assert_personal_provisioning(%L,%L,%L,%L,%L)',a,inviter,'10000000-0000-4000-8000-000000000007',op,'other@example.test'),'FORBIDDEN');
  perform pg_temp.require(public.spec44_assert_personal_provisioning(a,inviter,'10000000-0000-4000-8000-000000000007',op,'existing-personal@example.test'),'prepared provisioning');
  select * into claim from public.spec44_claim_personal_identity_provisioning('personal:'||op,repeat('a',64),repeat('b',64),
    'organization_invitee','spec44-claim-personal','organization_invitation','10000000-0000-4000-8000-000000000007',inviter,null,a,op,'existing-personal@example.test');
  perform pg_temp.require(claim.claim_state='created','real provisioning claim');
  perform public.spec35_complete_identity_provisioning(claim.operation_id,invited,'Do not overwrite','es','America/Caracas','existing_active',false,gen_random_uuid(),'spec44-complete-identity');
  perform pg_temp.require((select display_name='existing-personal' from public.user_profiles where user_id=invited),'global profile unchanged by provisioning');
  result:=public.spec44_create_personal_invitation(a,inviter,op,'existing-personal@example.test',encode(extensions.digest(repeat('a',43),'sha256'),'hex'),'spec44-a',now()+interval '1 day',invited,false,'share_link','spec44-create');
  inv:=(result->>'id')::uuid;
  perform pg_temp.require(result->>'intended_role'='personal' and result->>'arrangement_property_id' is null,'fixed personal target without property');
  perform pg_temp.require(not exists(select 1 from public.organization_memberships where organization_id=a and user_id=invited),'pending invitation does not grant membership');
  perform public.spec37_create_invitation_handoff(repeat('a',43),repeat('1',64),repeat('2',64),repeat('3',64),now()+interval '10 minutes');
  perform pg_temp.reject(format('select public.spec26_accept_invitation(%L,%L,%L,%L)',repeat('a',43),invited,'existing-personal@example.test','spec44-legacy-accept'),'PERSONAL_PROFILE_REQUIRED');
  perform pg_temp.reject(format('select public.spec37_accept_invitation_handoff(%L,%L,%L,%L,%L,%L)',repeat('1',64),repeat('2',64),repeat('3',64),invited,'existing-personal@example.test','spec44-legacy-handoff'),'PERSONAL_PROFILE_REQUIRED');
  foreach result in array array['{}'::jsonb,'null'::jsonb,'{"name":"Ana","contact_number":1,"occupation":"Electricista"}'::jsonb,
    '{"name":" ","contact_number":"00123","occupation":"Electricista"}'::jsonb,
    '{"name":"Ana","contact_number":"00123","occupation":"Electricista","role":"owner"}'::jsonb] loop
    perform pg_temp.reject(format('select public.spec44_accept_invitation_token(%L,%L,%L,%L,%L::jsonb)',repeat('a',43),invited,'existing-personal@example.test','spec44-invalid-profile',result),'INVALID_REQUEST');
  end loop;
  perform pg_temp.require((select status='pending' from public.organization_invitations where id=inv),'invalid profile leaves invitation pending');
  perform pg_temp.require((select consumed_at is null from public.invitation_auth_handoffs where invitation_id=inv),'invalid profile leaves handoff pending');
  perform pg_temp.reject(format('select public.spec44_accept_invitation_token(%L,%L,%L,%L,%L::jsonb)',repeat('a',43),'10000000-0000-4000-8000-000000000011','existing-personal@example.test','spec44-wrong-identity','{"name":"Ana","contact_number":"00123","occupation":"Electricista"}'),'INVITATION_INVALID');
  select * into m from public.spec44_accept_invitation_handoff(repeat('1',64),repeat('2',64),repeat('3',64),invited,'existing-personal@example.test','spec44-valid-accept',
    '{"name":" Liv ","contact_number":" +58 00123 ","occupation":" Electricista "}');
  perform pg_temp.require(m.role='personal' and m.personal_name='Liv' and m.personal_contact_number='+58 00123' and m.personal_occupation='Electricista','profile and membership persisted');
  perform pg_temp.require((select status='accepted' from public.organization_invitations where id=inv),'consumed atomically');
  perform pg_temp.require((select count(*)=1 from public.organization_events where target_id=m.id and event_type='member.invitation_accepted'),'one audit event');
  perform pg_temp.require((select id=m.id from public.spec42_recover_accepted_handoff(repeat('1',64),repeat('2',64),repeat('3',64),invited,'existing-personal@example.test')),'recover committed acceptance');
  perform pg_temp.require(not exists(select 1 from public.organization_events where metadata::text like '%Liv%' or metadata::text like '%00123%' or metadata::text like '%Electricista%'),'audit contains no profile');

  -- Same identity has independent values in organization B.
  opb:=(public.spec44_prepare_personal_invitation(b,'30000000-0000-4000-8000-000000000004','existing-personal@example.test','spec44-other-org')->>'operation_id')::uuid;
  result:=public.spec44_create_personal_invitation(b,'30000000-0000-4000-8000-000000000004',opb,'existing-personal@example.test',encode(extensions.digest(repeat('b',43),'sha256'),'hex'),'spec44-b',now()+interval '1 day',invited,false,'share_link','spec44-other-org');
  invb:=(result->>'id')::uuid;
  perform public.spec44_accept_invitation_token(repeat('b',43),invited,'existing-personal@example.test','spec44-other-accept','{"name":"Otra persona","contact_number":"0009","occupation":"Pintora"}');
  perform pg_temp.require((select personal_name='Liv' from public.organization_memberships where id=m.id),'A profile preserved');
  perform pg_temp.require((select personal_name='Otra persona' from public.organization_memberships where invitation_id=invb),'B profile independent');
  perform pg_temp.require((select display_name='existing-personal' from public.user_profiles where user_id=invited),'global profile preserved');
  perform public.spec26_mutate_membership(a,invited,null,'suspended',m.version,'test','30000000-0000-4000-8000-000000000002','spec44-suspend');
  perform pg_temp.require(not exists(select 1 from public.spec42_recover_accepted_handoff(repeat('1',64),repeat('2',64),repeat('3',64),invited,'existing-personal@example.test')),'recovery cannot reactivate');
  perform pg_temp.require((select personal_name='Liv' and status='suspended' from public.organization_memberships where id=m.id),'suspension preserves profile');
  perform pg_temp.reject(format('select public.spec26_mutate_membership(%L,%L,%L,null,1,null,%L,%L)',a,'10000000-0000-4000-8000-000000000008','personal','30000000-0000-4000-8000-000000000001','spec44-role-bypass'),'FORBIDDEN');
end; $$;

-- Inject an audit failure and demonstrate that the membership and consumption roll back.
create function pg_temp.reject_accept_audit() returns trigger language plpgsql as $$
begin if new.request_id='spec44-fail-audit' then raise exception 'AUDIT_INJECTED'; end if; return new; end; $$;
create trigger spec44_fail_audit before insert on public.organization_events for each row execute function pg_temp.reject_accept_audit();
do $$ declare op uuid; inv uuid; replacement public.organization_invitations%rowtype;
  a constant uuid:='20000000-0000-4000-8000-000000000001';
  actor constant uuid:='30000000-0000-4000-8000-000000000007';
  invited constant uuid:='10000000-0000-4000-8000-000000000011';
begin
  op:=(public.spec44_prepare_personal_invitation(a,actor,'new-personal@example.test','spec44-rollback')->>'operation_id')::uuid;
  inv:=(public.spec44_create_personal_invitation(a,actor,op,'new-personal@example.test',encode(extensions.digest(repeat('c',43),'sha256'),'hex'),'spec44-c',now()+interval '1 day',invited,true,'share_link','spec44-rollback')->>'id')::uuid;
  perform public.spec37_create_invitation_handoff(repeat('c',43),repeat('4',64),repeat('5',64),repeat('6',64),now()+interval '10 minutes');
  perform pg_temp.reject(format('select public.spec44_accept_invitation_handoff(%L,%L,%L,%L,%L,%L,%L::jsonb)',repeat('4',64),repeat('5',64),repeat('6',64),invited,'new-personal@example.test','spec44-fail-audit','{"name":"Ana","contact_number":"00123","occupation":"Electricista"}'),'AUDIT_INJECTED');
  perform pg_temp.require(not exists(select 1 from public.organization_memberships where user_id=invited),'audit failure rolls back membership');
  perform pg_temp.require((select status='pending' from public.organization_invitations where id=inv),'audit failure rolls back invitation');
  perform pg_temp.require((select consumed_at is null from public.invitation_auth_handoffs where invitation_id=inv),'audit failure rolls back handoff');
  select * into replacement from public.spec44_rotate_personal_invitation(a,inv,gen_random_uuid(),encode(extensions.digest(repeat('d',43),'sha256'),'hex'),'spec44-d',now()+interval '1 day',actor,'spec44-rotate');
  perform pg_temp.require(replacement.intended_role='personal' and replacement.invited_by_membership_id=actor,'rotation preserves target and original actor');
  perform pg_temp.require((select invitation_id=replacement.id from public.arrangement_personal_invitation_operations where id=op),'operation follows replacement');
  perform pg_temp.require(not exists(select 1 from public.spec26_resolve_invitation(repeat('c',43))),'rotated token unavailable');
  perform public.spec44_revoke_personal_invitation(a,replacement.id,actor,'spec44-revoke');
  perform pg_temp.require(not exists(select 1 from public.spec26_resolve_invitation(repeat('d',43))),'revoked token unavailable');
end; $$;
drop trigger spec44_fail_audit on public.organization_events;

-- Recovery is scoped to the original inviter; suspension is rechecked after preparation.
do $$ declare op uuid; inv uuid; current_inv public.organization_invitations%rowtype;
  a constant uuid:='20000000-0000-4000-8000-000000000001';
  owner_id constant uuid:='30000000-0000-4000-8000-000000000001';
  member_id constant uuid:='30000000-0000-4000-8000-000000000007';
begin
  op:=(public.spec44_prepare_personal_invitation(a,owner_id,'second@example.test','spec44-owner-only')->>'operation_id')::uuid;
  inv:=(public.spec44_create_personal_invitation(a,owner_id,op,'second@example.test',repeat('e',64),'owner-prefix',now()+interval '1 day','10000000-0000-4000-8000-000000000006',true,'share_link','spec44-owner-create')->>'id')::uuid;
  perform pg_temp.reject(format('select public.spec44_revoke_personal_invitation(%L,%L,%L,%L)',a,inv,member_id,'spec44-foreign-revoke'),'NOT_FOUND');
  select * into current_inv from public.spec26_resend_invitation(a,inv,gen_random_uuid(),repeat('f',64),'rotated-prefix',now()+interval '1 day','30000000-0000-4000-8000-000000000002','spec44-general-rotate');
  perform pg_temp.require(current_inv.invited_by_membership_id=owner_id,'general rotation preserves original inviter');
  perform pg_temp.require((select invitation_id=current_inv.id from public.arrangement_personal_invitation_operations where id=op),'general rotation preserves recovery');
  op:=(public.spec44_prepare_personal_invitation(a,member_id,'inquilino@example.test','spec44-before-suspend')->>'operation_id')::uuid;
  perform public.spec26_mutate_membership(a,'10000000-0000-4000-8000-000000000007',null,'suspended',1,'test',owner_id,'spec44-inviter-suspend');
  perform pg_temp.reject(format('select public.spec44_create_personal_invitation(%L,%L,%L,%L,%L,%L,now()+interval ''1 day'',%L,true,''share_link'',%L)',a,member_id,op,'inquilino@example.test',repeat('9',64),'stale-prefix','10000000-0000-4000-8000-000000000005','spec44-stale-context'),'FORBIDDEN');
  perform pg_temp.reject(format('select public.spec44_assert_personal_provisioning(%L,%L,%L,%L,%L)',a,member_id,'10000000-0000-4000-8000-000000000007',op,'inquilino@example.test'),'FORBIDDEN');
end; $$;

select pg_temp.require((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.arrangement_personal_invitation_operations'::regclass),'forced RLS');
select pg_temp.require(not has_function_privilege('service_role','public.spec44_accept_invitation(uuid,uuid,text,text,jsonb)','execute'),'private core');
set local role authenticated;
select pg_temp.reject('select * from public.arrangement_personal_invitation_operations','permission denied');
select pg_temp.reject('update public.organization_memberships set personal_name=''Injected''','permission denied');
select pg_temp.reject('select public.spec44_prepare_personal_invitation(null,null,null,null)','permission denied');
reset role;
rollback;
\echo SPEC-44 SQL assertions passed
