\set ON_ERROR_STOP on
begin;
do $$ begin if current_database() not like 'spec45%' then raise exception 'Disposable spec45 database required'; end if; end; $$;
create function pg_temp.check(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'Assertion failed: %',label; end if; end; $$;
create function pg_temp.fails(statement text,expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then
    if position(expected in SQLERRM)>0 then return; end if; raise;
  end;
  raise exception 'Expected error: %',expected;
end; $$;
set local role service_role;
do $$ declare org uuid:='20000000-0000-4000-8000-000000000001'; owner uuid:='30000000-0000-4000-8000-000000000001';
  tenant uuid:='30000000-0000-4000-8000-000000000010'; person uuid:='30000000-0000-4000-8000-000000000009';
  second_person uuid:='30000000-0000-4000-8000-000000000013'; other_person uuid:='30000000-0000-4000-8000-000000000014';
  viewer uuid:='30000000-0000-4000-8000-000000000008'; co_tenant uuid:='30000000-0000-4000-8000-000000000015';
  row jsonb; id uuid; ver integer; before_revision jsonb; after_revision jsonb; i integer; target uuid;
begin
  row:=public.spec43_arrangements(org,tenant,'tenant.draft','{"description":"Filtración de prueba","idempotency_key":"spec45-sql-draft"}','spec45-sql'); id:=(row->>'id')::uuid;
  perform pg_temp.fails(format('select public.spec45_arrangements(%L,%L,%L,%L,%L)',org,owner,'internal.assign',jsonb_build_object('order_id',id,'expected_version',1,'assigned_personal_membership_id',person),'test'),'NOT_FOUND');
  row:=public.spec43_arrangements(org,tenant,'tenant.submit',jsonb_build_object('order_id',id),'spec45-sql'); ver:=(row->>'version')::integer;
  before_revision:=public.spec45_arrangements(org,person,'personal.changes','{}','test');
  row:=public.spec45_arrangements(org,owner,'internal.assign',jsonb_build_object('order_id',id,'expected_version',ver,'assigned_personal_membership_id',person),'spec45-assign');
  perform pg_temp.check(row->>'status'='in_progress' and row->'assignee'->>'id'=person::text,'atomic assignment');
  perform pg_temp.check(row->'requester'->>'email'='tenant@example.test' and row->'requester'->>'contact_number'='+58 0412 1234567','author contact');
  ver:=(row->>'version')::integer;
  after_revision:=public.spec45_arrangements(org,person,'personal.changes','{}','test');
  perform pg_temp.check(before_revision<>after_revision,'durable personal revision');
  row:=public.spec45_arrangements(org,person,'personal.list','{"limit":25}','test');
  perform pg_temp.check(jsonb_array_length(row->'items')=1 and row->'items'->0->>'id'=id::text,'personal list');
  perform pg_temp.check(not ((row->'items'->0) ? 'assignee'),'personal minimal DTO');
  foreach target in array ARRAY[second_person,other_person] loop
    perform pg_temp.fails(format('select public.spec45_arrangements(%L,%L,%L,%L,%L)',org,target,'personal.detail',jsonb_build_object('order_id',id),'test'),case when target=other_person then 'FORBIDDEN' else 'NOT_FOUND' end);
  end loop;
  foreach target in array ARRAY[viewer,co_tenant] loop
    row:=public.spec45_arrangements(org,target,case when target=viewer then 'internal.detail' else 'tenant.detail' end,jsonb_build_object('order_id',id),'test');
    perform pg_temp.check(not (row ? 'requester') and not (row ? 'assignee'),'viewer and co-tenant privacy');
    perform pg_temp.fails(format('select public.spec45_arrangements(%L,%L,%L,%L,%L)',org,target,'internal.assign',jsonb_build_object('order_id',id,'expected_version',ver,'assigned_personal_membership_id',person),'test'),'FORBIDDEN');
  end loop;
  perform pg_temp.fails(format('select public.spec45_arrangements(%L,%L,%L,%L,%L)',org,owner,'internal.assign',jsonb_build_object('order_id',id,'expected_version',ver,'assigned_personal_membership_id',other_person),'test'),'ASSIGNEE_UNAVAILABLE');
  row:=public.spec45_arrangements(org,owner,'internal.assign',jsonb_build_object('order_id',id,'expected_version',ver,'assigned_personal_membership_id',person),'test');
  perform pg_temp.check((row->>'version')::integer=ver,'assignment no-op');
  row:=public.spec45_arrangements(org,owner,'internal.assign',jsonb_build_object('order_id',id,'expected_version',ver-1,'assigned_personal_membership_id',second_person),'test');
  perform pg_temp.check(row->>'error'='VERSION_CONFLICT' and not (row->'current' ? 'requester'),'safe conflict');
  row:=public.spec45_arrangements(org,owner,'internal.assign',jsonb_build_object('order_id',id,'expected_version',ver,'assigned_personal_membership_id',second_person),'test'); ver:=(row->>'version')::integer;
  perform pg_temp.fails(format('select public.spec45_arrangements(%L,%L,%L,%L,%L)',org,person,'personal.detail',jsonb_build_object('order_id',id),'test'),'NOT_FOUND');
  perform pg_temp.fails(format('select public.spec45_arrangements(%L,%L,%L,%L,%L)',org,person,'personal.view',jsonb_build_object('order_id',id,'asset_id',id),'test'),'NOT_FOUND');
  row:=public.spec45_arrangements(org,owner,'internal.reject',jsonb_build_object('order_id',id,'expected_version',ver),'test'); ver:=(row->>'version')::integer;
  perform pg_temp.check(row->>'status'='rejected' and row->'assignee'='null'::jsonb,'reject clears assignment');
  perform pg_temp.fails(format('select public.spec43_arrangements(%L,%L,%L,%L,%L)',org,owner,'internal.status',jsonb_build_object('order_id',id,'expected_version',ver,'status','solved'),'test'),'INVALID_TRANSITION');
  row:=public.spec43_arrangements(org,owner,'internal.status',jsonb_build_object('order_id',id,'expected_version',ver,'status','open'),'test'); ver:=(row->>'version')::integer;
  perform pg_temp.check(not (row ? 'requester') and row->>'status'='open','legacy mutation DTO and reopen');
  row:=public.spec45_arrangements(org,owner,'internal.assign',jsonb_build_object('order_id',id,'expected_version',ver,'assigned_personal_membership_id',person),'test'); ver:=(row->>'version')::integer;
  row:=public.spec43_arrangements(org,owner,'internal.status',jsonb_build_object('order_id',id,'expected_version',ver,'status','solved'),'test');
  perform pg_temp.check(jsonb_array_length(public.spec45_arrangements(org,person,'personal.list','{"limit":25}','test')->'items')=0,'old closure revokes assignment');
  perform pg_temp.check(not has_table_privilege('authenticated','public.arrangement_scope_revisions','SELECT'),'revisions private');
  perform pg_temp.check(not has_function_privilege('service_role','public.spec43_arrangements_compat_base(uuid,uuid,text,jsonb,text)','EXECUTE'),'no old mutation bypass');
  perform pg_temp.check(not has_function_privilege('authenticated','public.spec45_arrangements(uuid,uuid,text,jsonb,text)','EXECUTE'),'RPC private');
end; $$;
reset role;
-- Failure after writing the row must roll back audit, row, and revision together.
create function pg_temp.fail_audit() returns trigger language plpgsql as $$ begin if NEW.request_id='spec45-fail-audit' then raise exception 'AUDIT_FAILED'; end if; return NEW; end; $$;
create trigger fail_spec45_audit before insert on public.organization_events for each row execute function pg_temp.fail_audit();
do $$ declare org uuid:='20000000-0000-4000-8000-000000000001'; actor uuid:='30000000-0000-4000-8000-000000000001'; o public.arrangement_orders; before_revision jsonb; begin
 select * into o from public.arrangement_orders where idempotency_key='spec45-sql-draft';
 before_revision:=public.spec45_arrangements(org,actor,'internal.changes','{}','test');
 perform pg_temp.fails(format('select public.spec45_arrangements(%L,%L,%L,%L,%L)',org,actor,'internal.status',jsonb_build_object('order_id',o.id,'expected_version',o.version,'status','open'),'spec45-fail-audit'),'AUDIT_FAILED');
 perform pg_temp.check((select version=o.version and status=o.status from public.arrangement_orders where id=o.id),'audit failure rolls back order');
 perform pg_temp.check(public.spec45_arrangements(org,actor,'internal.changes','{}','test')=before_revision,'audit failure rolls back revision');
end; $$;
select pg_temp.check(not public.spec45_phone_valid('123') and public.spec45_phone_valid('+58 (0412) 123-4567'),'phone validation');
do $$ declare org uuid:='20000000-0000-4000-8000-000000000001'; owner uuid:='30000000-0000-4000-8000-000000000001';
  user_id uuid:='10000000-0000-4000-8000-000000000012'; property uuid; inv uuid; member public.organization_memberships; result jsonb;
begin
  select arrangement_property_id into property from public.organization_memberships where id='30000000-0000-4000-8000-000000000010';
  insert into public.organization_invitations(organization_id,email_normalized,intended_role,token_hash,token_prefix,expires_at,invited_by_membership_id,arrangement_property_id,invited_auth_user_id)
    values(org,'existing-personal@example.test','inquilino',encode(extensions.digest(repeat('q',43),'sha256'),'hex'),'spec45',now()+interval '1 day',owner,property,user_id) returning id into inv;
  perform public.spec37_create_invitation_handoff(repeat('q',43),repeat('a',64),repeat('b',64),repeat('c',64),now()+interval '10 minutes');
  result:=public.spec45_invitation_acceptance_context(repeat('a',64),repeat('b',64),repeat('c',64),user_id,'existing-personal@example.test');
  perform pg_temp.check(result='{"requires_inquilino_profile":true}'::jsonb,'authenticated onboarding requirement');
  perform pg_temp.fails(format('select public.spec26_accept_invitation(%L,%L,%L,%L)',repeat('q',43),user_id,'existing-personal@example.test','test'),'INQUILINO_PROFILE_REQUIRED');
  perform pg_temp.fails(format('select public.spec44_accept_invitation_handoff(%L,%L,%L,%L,%L,%L,null)',repeat('a',64),repeat('b',64),repeat('c',64),user_id,'existing-personal@example.test','test'),'INQUILINO_PROFILE_REQUIRED');
  foreach result in array ARRAY['{}'::jsonb,'{"contact_number":123}'::jsonb,'{"contact_number":"123"}'::jsonb,'{"contact_number":"+58 412 1234567","role":"owner"}'::jsonb] loop
    perform pg_temp.fails(format('select public.spec45_accept_invitation_token(%L,%L,%L,%L,null,%L)',repeat('q',43),user_id,'existing-personal@example.test','test',result),'INVALID_REQUEST');
  end loop;
  perform pg_temp.fails(format('select public.spec45_accept_invitation_handoff(%L,%L,%L,%L,%L,%L,null,%L)',repeat('a',64),repeat('b',64),repeat('c',64),user_id,'existing-personal@example.test','spec45-fail-audit','{"contact_number":"+58 412 1234567"}'),'AUDIT_FAILED');
  perform pg_temp.check((select status='pending' from public.organization_invitations where id=inv),'failed phone acceptance keeps invitation');
  perform pg_temp.check(not exists(select 1 from public.organization_memberships where organization_id=org and organization_memberships.user_id='10000000-0000-4000-8000-000000000012'),'audit failure leaves no membership');
  select * into member from public.spec45_accept_invitation_handoff(repeat('a',64),repeat('b',64),repeat('c',64),user_id,'existing-personal@example.test','test',null,'{"contact_number":" +58 412 1234567 "}');
  perform pg_temp.check(member.inquilino_contact_number='+58 412 1234567' and member.inquilino_first_joined_at is not null and member.arrangement_property_id=property,'phone commits with membership/property');
  perform pg_temp.check((select id=member.id from public.spec42_recover_accepted_handoff(repeat('a',64),repeat('b',64),repeat('c',64),user_id,'existing-personal@example.test')),'lost response recovery');
  perform pg_temp.check(not exists(select 1 from public.organization_events where metadata::text like '%1234567%'),'phone absent from audit');
  perform pg_temp.check(not exists(select 1 from public.spec26_resolve_invitation(repeat('q',43))),'consumed invitation');
  property:=(public.spec42_create_arrangement_property('20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000004','Casa B','spec45-other-property','test')->>'id')::uuid;
  insert into public.organization_invitations(organization_id,email_normalized,intended_role,token_hash,expires_at,invited_by_membership_id,arrangement_property_id,invited_auth_user_id)
    values('20000000-0000-4000-8000-000000000002','existing-personal@example.test','inquilino',encode(extensions.digest(repeat('z',43),'sha256'),'hex'),now()+interval '1 day','30000000-0000-4000-8000-000000000004',property,user_id);
  perform public.spec45_accept_invitation_token(repeat('z',43),user_id,'existing-personal@example.test','test',null,'{"contact_number":"+54 911 1234567"}');
  perform pg_temp.check((select inquilino_contact_number='+58 412 1234567' from public.organization_memberships where id=member.id),'second organization does not overwrite contact');
end; $$;

select 'SPEC-45 SQL assertions passed';
rollback;
