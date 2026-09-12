-- Requires the selected dependency migrations through SPEC-42 in a disposable database.
-- All data and injected failures roll back; no real Auth/provider calls.
begin;
\ir spec40_browser_fixtures.sql
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin
  execute statement;
  raise exception 'Expected rejection: %', expected;
exception when others then
  if sqlerrm not like '%' || expected || '%' or sqlerrm like 'Expected rejection:%' then raise; end if;
end; $$;
create function pg_temp.reject_audit() returns trigger language plpgsql as $$
begin
  if new.request_id = 'spec42-audit-failure' then raise exception 'SPEC42_AUDIT_FAILURE'; end if;
  return new;
end; $$;
create trigger spec42_audit_failure before insert on public.organization_events for each row execute function pg_temp.reject_audit();

do $$
declare a uuid := '20000000-0000-4000-8000-000000000001'; b uuid := '20000000-0000-4000-8000-000000000002';
declare owner_id uuid := '30000000-0000-4000-8000-000000000001'; admin_id uuid := '30000000-0000-4000-8000-000000000002';
declare b_owner uuid := '30000000-0000-4000-8000-000000000004'; tenant_user uuid := '10000000-0000-4000-8000-000000000005';
declare second_user uuid := '10000000-0000-4000-8000-000000000006';
declare p jsonb; p2 jsonb; pb jsonb; op jsonb; receipt jsonb; replay jsonb; m public.organization_memberships%rowtype;
declare rotated public.organization_invitations%rowtype; v_count bigint; invite_id uuid;
begin
  assert (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.arrangement_properties'::regclass);
  assert not has_table_privilege('anon','public.arrangement_properties','select');
  assert not has_table_privilege('authenticated','public.arrangement_properties','insert');
  assert not has_table_privilege('service_role','public.arrangement_properties','insert');
  assert not has_function_privilege('service_role','public.spec42_accept_property_invitation(uuid,uuid,text,text)','execute');
  assert not has_function_privilege('authenticated','public.spec42_create_arrangement_property(uuid,uuid,text,text,text)','execute');
  assert has_function_privilege('service_role','public.spec42_create_arrangement_property(uuid,uuid,text,text,text)','execute');
  p := public.spec42_create_arrangement_property(a,owner_id,'  Casa  ','property-key-1','spec42-create');
  assert p->>'name' = 'Casa';
  assert p = public.spec42_create_arrangement_property(a,owner_id,'Casa','property-key-1','spec42-retry');
  p2 := public.spec42_create_arrangement_property(a,admin_id,'Casa','property-key-2','spec42-create2');
  assert p->>'id' <> p2->>'id';
  assert (select count(*) = 2 from public.organization_events where event_type = 'arrangement.property_created');
  perform pg_temp.expect_error(format('select public.spec42_create_arrangement_property(%L,%L,%L,%L,%L)',a,owner_id,'Otra','property-key-1','spec42-test'),'IDEMPOTENCY_CONFLICT');
  perform pg_temp.expect_error(format('select public.spec42_create_arrangement_property(%L,%L,%L,%L,%L)',a,owner_id,' ','property-blank','spec42-test'),'INVALID_REQUEST');
  perform pg_temp.expect_error(format('select public.spec42_create_arrangement_property(%L,%L,%L,%L,%L)',a,owner_id,'Fault','property-fault','spec42-audit-failure'),'SPEC42_AUDIT_FAILURE');
  assert not exists(select from public.arrangement_properties where name = 'Fault');
  pb := public.spec42_create_arrangement_property(b,b_owner,'Solar','property-key-b','spec42-create-b');
  assert jsonb_array_length(public.spec42_list_arrangement_properties(a,owner_id,null,25)->'items') = 2;
  perform pg_temp.expect_error(format('select public.spec42_prepare_property_invitation(%L,%L,%L,%L,%L)',a,owner_id,pb->>'id','inquilino@example.test','invite-bad-scope'),'NOT_FOUND');
  perform pg_temp.expect_error(format('select public.spec42_prepare_property_invitation(%L,%L,%L,%L,%L)',a,owner_id,p->>'id','owner@example.test','invite-active'),'ALREADY_A_MEMBER');
  -- Every older creation signature rejects new inquilino invitations without a property.
  perform pg_temp.expect_error(format('select public.spec26_create_invitation(gen_random_uuid(),%L,%L,%L,%L,%L,now()+interval ''1 day'',%L,%L)',a,'inquilino@example.test','inquilino',repeat('a',64),'legacytoken',owner_id,'spec42-legacy'),'PROPERTY_REQUIRED');
  perform pg_temp.expect_error(format('select public.spec37_create_manual_invitation(gen_random_uuid(),%L,%L,%L,%L,%L,now()+interval ''1 day'',%L,%L,%L,true)',a,'inquilino@example.test','inquilino',repeat('a',64),'legacytoken',owner_id,'spec42-legacy',tenant_user),'PROPERTY_REQUIRED');
  op := public.spec42_prepare_property_invitation(a,admin_id,(p->>'id')::uuid,'inquilino@example.test','invitation-key-1');
  assert op = public.spec42_prepare_property_invitation(a,admin_id,(p->>'id')::uuid,'inquilino@example.test','invitation-key-1');
  perform pg_temp.expect_error(format('select public.spec42_prepare_property_invitation(%L,%L,%L,%L,%L)',a,admin_id,p2->>'id','inquilino@example.test','invitation-key-1'),'IDEMPOTENCY_CONFLICT');
  receipt := public.spec42_create_manual_invitation(a,admin_id,(op->>'operation_id')::uuid,(p->>'id')::uuid,'inquilino@example.test',
    encode(extensions.digest(repeat('t',43),'sha256'),'hex'),'spec42token',now()+interval '1 day',tenant_user,true,'spec42-issue');
  invite_id := (receipt->>'id')::uuid;
  assert receipt->>'arrangement_property_id' = p->>'id' and (receipt->>'link_issued')::boolean;
  assert not exists(select from public.organization_memberships where user_id = tenant_user);
  replay := public.spec42_create_manual_invitation(a,admin_id,(op->>'operation_id')::uuid,(p->>'id')::uuid,'inquilino@example.test',
    repeat('b',64),'spec42retry',now()+interval '1 day',tenant_user,true,'spec42-issue-retry');
  assert replay->>'id' = receipt->>'id' and not (replay->>'link_issued')::boolean;
  assert not (replay ? 'token_hash') and not (replay ? 'share_url');
  perform pg_temp.expect_error(format('select public.spec42_prepare_property_invitation(%L,%L,%L,%L,%L)',a,owner_id,p2->>'id','inquilino@example.test','another-invite-key'),'INVITATION_ALREADY_PENDING');
  perform public.spec37_create_invitation_handoff(repeat('t',43),repeat('a',64),repeat('b',64),repeat('c',64),now()+interval '10 minutes');
  assert (select arrangement_property->>'id' = p->>'id' from public.spec37_resolve_invitation_handoff(repeat('a',64),repeat('b',64),repeat('c',64)));
  assert (select registration_permitted from public.spec37_resolve_invitation_registration(repeat('a',64),repeat('b',64),repeat('c',64)));
  perform public.spec37_complete_invitation_registration(repeat('a',64),repeat('b',64),repeat('c',64),tenant_user,'Invitado','spec42-register');
  perform pg_temp.expect_error(format('select public.spec37_accept_invitation_handoff(%L,%L,%L,%L,%L,%L)',repeat('a',64),repeat('b',64),repeat('c',64),tenant_user,'wrong@example.test','spec42-wrong-email'),'INVITATION_INVALID');
  perform pg_temp.expect_error(format('select public.spec37_accept_invitation_handoff(%L,%L,%L,%L,%L,%L)',repeat('a',64),repeat('b',64),repeat('c',64),tenant_user,'inquilino@example.test','spec42-audit-failure'),'SPEC42_AUDIT_FAILURE');
  assert not exists(select from public.organization_memberships where user_id = tenant_user);
  assert (select status = 'pending' from public.organization_invitations where id = invite_id);
  assert (select consumed_at is null from public.invitation_auth_handoffs where handle_hash = repeat('a',64));
  select * into m from public.spec37_accept_invitation_handoff(repeat('a',64),repeat('b',64),repeat('c',64),tenant_user,'inquilino@example.test','spec42-accept');
  assert m.arrangement_property_id = (p->>'id')::uuid and m.role = 'inquilino' and m.status = 'active';
  assert (select id = m.id from public.spec42_recover_accepted_handoff(repeat('a',64),repeat('b',64),repeat('c',64),tenant_user,'inquilino@example.test'));
  assert not exists(select from public.spec42_recover_accepted_handoff(repeat('a',64),repeat('b',64),repeat('c',64),second_user,'inquilino@example.test'));
  perform pg_temp.expect_error(format('select public.spec37_accept_invitation_handoff(%L,%L,%L,%L,%L,%L)',repeat('a',64),repeat('b',64),repeat('c',64),tenant_user,'inquilino@example.test','spec42-replay'),'INVITATION_INVALID');
  assert (public.spec42_associate_inquilino(a,owner_id,(p->>'id')::uuid,m.id,1,'spec42-same')->>'id')::uuid = m.id;
  perform pg_temp.expect_error(format('select public.spec42_associate_inquilino(%L,%L,%L,%L,1,%L)',a,owner_id,p2->>'id',m.id,'spec42-other'),'PROPERTY_CONFLICT');
  perform pg_temp.expect_error(format('select public.spec42_list_arrangement_properties(%L,%L,null,25)',a,m.id),'FORBIDDEN');
  -- Second identity, same property; rotation preserves association and rejects old handoffs.
  op := public.spec42_prepare_property_invitation(a,owner_id,(p->>'id')::uuid,'second@example.test','invitation-key-2');
  receipt := public.spec42_create_manual_invitation(a,owner_id,(op->>'operation_id')::uuid,(p->>'id')::uuid,'second@example.test',
    encode(extensions.digest(repeat('u',43),'sha256'),'hex'),'spec42second',now()+interval '1 day',second_user,true,'spec42-issue2');
  perform public.spec37_create_invitation_handoff(repeat('u',43),repeat('d',64),repeat('b',64),repeat('c',64),now()+interval '10 minutes');
  select * into rotated from public.spec37_resend_invitation(a,(receipt->>'id')::uuid,gen_random_uuid(),
    encode(extensions.digest(repeat('v',43),'sha256'),'hex'),'spec42rotate',now()+interval '1 day',owner_id,'spec42-rotate');
  assert rotated.arrangement_property_id = (p->>'id')::uuid and rotated.registration_permitted;
  assert not exists(select from public.spec37_resolve_invitation_handoff(repeat('d',64),repeat('b',64),repeat('c',64)));
  select * into m from public.spec26_accept_invitation(repeat('v',43),second_user,'second@example.test','spec42-raw-accept');
  assert m.arrangement_property_id = (p->>'id')::uuid;
  assert (select count(*) = 2 from public.organization_memberships where arrangement_property_id = (p->>'id')::uuid);
  -- Same identity joins B independently with its own membership association.
  op := public.spec42_prepare_property_invitation(b,b_owner,(pb->>'id')::uuid,'second@example.test','invitation-key-b');
  receipt := public.spec42_create_manual_invitation(b,b_owner,(op->>'operation_id')::uuid,(pb->>'id')::uuid,'second@example.test',
    encode(extensions.digest(repeat('w',43),'sha256'),'hex'),'spec42orgb',now()+interval '1 day',second_user,false,'spec42-issue-b');
  select * into m from public.spec26_accept_invitation(repeat('w',43),second_user,'second@example.test','spec42-accept-b');
  assert m.arrangement_property_id = (pb->>'id')::uuid and m.organization_id = b;
  -- Retained FK survives suspension and role changes; cannot be overwritten on reactivation.
  select * into m from public.organization_memberships where organization_id = a and user_id = tenant_user;
  select * into m from public.spec26_mutate_membership(a,tenant_user,null,'suspended',m.version,'test',owner_id,'spec42-suspend');
  assert m.arrangement_property_id = (p->>'id')::uuid;
  perform pg_temp.expect_error(format('select public.spec42_associate_inquilino(%L,%L,%L,%L,1,%L)',a,owner_id,p->>'id',m.id,'spec42-suspended'),'ASSOCIATION_UNAVAILABLE');
  assert not exists(select from public.spec42_recover_accepted_handoff(repeat('a',64),repeat('b',64),repeat('c',64),tenant_user,'inquilino@example.test'));
  op := public.spec42_prepare_property_invitation(a,owner_id,(p2->>'id')::uuid,'inquilino@example.test','reactivate-wrong');
  receipt := public.spec42_create_manual_invitation(a,owner_id,(op->>'operation_id')::uuid,(p2->>'id')::uuid,'inquilino@example.test',
    encode(extensions.digest(repeat('x',43),'sha256'),'hex'),'spec42wrong',now()+interval '1 day',tenant_user,false,'spec42-issue-wrong');
  perform pg_temp.expect_error(format('select public.spec26_accept_invitation(%L,%L,%L,%L)',repeat('x',43),tenant_user,'inquilino@example.test','spec42-reactivate-wrong'),'PROPERTY_CONFLICT');
  assert (select status = 'pending' from public.organization_invitations where id = (receipt->>'id')::uuid);
  perform public.spec37_revoke_invitation(a,(receipt->>'id')::uuid,owner_id,'spec42-revoke');
  perform pg_temp.expect_error(format('select public.spec26_accept_invitation(%L,%L,%L,%L)',repeat('x',43),tenant_user,'inquilino@example.test','spec42-revoked'),'INVITATION_INVALID');
  -- Role/ownership paths without property roll back in full.
  perform pg_temp.expect_error(format('select public.spec26_mutate_membership(%L,%L,%L,null,1,null,%L,%L)',a,'10000000-0000-4000-8000-000000000002','inquilino',owner_id,'spec42-role'),'PROPERTY_REQUIRED');
  perform pg_temp.expect_error(format('select public.spec26_transfer_ownership(%L,%L,%L,%L,1,1,%L)',a,owner_id,'10000000-0000-4000-8000-000000000002','inquilino','spec42-transfer'),'PROPERTY_REQUIRED');
  assert (select role = 'admin' from public.organization_memberships where id = admin_id);
  -- Cross-organization FK is enforced even for privileged direct writes.
  perform pg_temp.expect_error(format('update public.organization_memberships set arrangement_property_id=%L where id=%L',pb->>'id',admin_id),'memberships_arrangement_property_fk');
  select count(*) into v_count from public.arrangement_properties;
  assert v_count = 3;
end; $$;
rollback;
