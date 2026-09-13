-- SPEC-44: personal invitations, membership profiles and scoped provisioning.
-- Forward-only; no existing identity, membership, invitation or property is reassigned.
begin;
alter table public.organization_memberships force row level security;
alter table public.organization_invitations force row level security;
alter table public.organization_memberships drop constraint organization_memberships_role_check;
alter table public.organization_memberships add constraint organization_memberships_role_check
  check(role in ('owner','admin','member','viewer','inquilino','personal'));
alter table public.organization_invitations drop constraint organization_invitations_intended_role_check;
alter table public.organization_invitations add constraint organization_invitations_intended_role_check
  check(intended_role in ('admin','member','viewer','inquilino','personal'));

-- Match JavaScript String.trim, including non-ASCII whitespace, before validation.
create function public.spec44_trim(p_value text) returns text
language sql immutable set search_path=pg_catalog as $$
  select btrim(p_value, E' \t\n\r\f' || chr(11) || chr(160) || chr(5760) || chr(8192) || chr(8193) || chr(8194)
    || chr(8195) || chr(8196) || chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201)
    || chr(8202) || chr(8232) || chr(8233) || chr(8239) || chr(8287) || chr(12288) || chr(65279));
$$;
create function public.spec44_profile_text_valid(p_value text,p_max integer) returns boolean
language sql immutable set search_path=pg_catalog as $$
  select p_value is not null and p_value=public.spec44_trim(p_value)
    and char_length(p_value) between 1 and p_max and p_value !~ ('[' || chr(1) || '-' || chr(31) || chr(127) || '-' || chr(159) || ']');
$$;
alter table public.organization_memberships
  add column personal_name text,
  add column personal_contact_number text,
  add column personal_occupation text,
  add constraint memberships_personal_profile_check check (
    (personal_name is null and personal_contact_number is null and personal_occupation is null and role<>'personal')
    or (public.spec44_profile_text_valid(personal_name,120)
      and public.spec44_profile_text_valid(personal_contact_number,64)
      and public.spec44_profile_text_valid(personal_occupation,120))),
  add constraint memberships_personal_no_property check(role<>'personal' or arrangement_property_id is null);

create table public.arrangement_personal_invitation_operations(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  actor_membership_id uuid not null,
  idempotency_key text not null check(char_length(idempotency_key) between 8 and 128),
  payload_fingerprint text not null check(payload_fingerprint ~ '^[0-9a-f]{64}$'),
  invitation_id uuid,
  created_at timestamptz not null default now(),
  unique(organization_id,actor_membership_id,idempotency_key),
  foreign key(actor_membership_id,organization_id) references public.organization_memberships(id,organization_id),
  foreign key(invitation_id,organization_id) references public.organization_invitations(id,organization_id)
);
alter table public.arrangement_personal_invitation_operations enable row level security;
alter table public.arrangement_personal_invitation_operations force row level security;
revoke all on public.arrangement_personal_invitation_operations from public,anon,authenticated,service_role;

create function public.spec44_require_inviter(p_organization_id uuid,p_actor_membership_id uuid)
returns public.organization_memberships language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor public.organization_memberships%rowtype;
begin
  perform 1 from public.organizations where id=p_organization_id and status='active' for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into v_actor from public.organization_memberships where id=p_actor_membership_id
    and organization_id=p_organization_id and status='active' for update;
  if not found or v_actor.role not in ('owner','admin','member') then raise exception 'FORBIDDEN'; end if;
  return v_actor;
end; $$;
create function public.spec44_personal_fingerprint(p_email text) returns text
language sql immutable set search_path=pg_catalog as $$
  select encode(extensions.digest('arrangements:personal:' || p_email,'sha256'),'hex');
$$;
create function public.spec44_prepare_personal_invitation(p_organization_id uuid,p_actor_membership_id uuid,
  p_email_normalized text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_operation public.arrangement_personal_invitation_operations%rowtype;
declare v_invitation public.organization_invitations%rowtype;
begin
  perform public.spec44_require_inviter(p_organization_id,p_actor_membership_id);
  if p_email_normalized is null or p_email_normalized<>lower(btrim(p_email_normalized))
    or char_length(p_email_normalized) not between 3 and 320 or position('@' in p_email_normalized)<2
    or p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 128 then raise exception 'INVALID_REQUEST'; end if;
  select * into v_operation from public.arrangement_personal_invitation_operations where organization_id=p_organization_id
    and actor_membership_id=p_actor_membership_id and idempotency_key=p_idempotency_key for update;
  if found then
    if v_operation.payload_fingerprint<>public.spec44_personal_fingerprint(p_email_normalized) then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    if v_operation.invitation_id is not null then
      select * into v_invitation from public.organization_invitations where id=v_operation.invitation_id and organization_id=p_organization_id;
      return jsonb_build_object('operation_id',v_operation.id,'invitation',public.spec42_invitation_record(v_invitation));
    end if;
  end if;
  if exists(select 1 from public.organization_memberships m join auth.users u on u.id=m.user_id
    where m.organization_id=p_organization_id and m.status='active' and lower(btrim(u.email))=p_email_normalized) then raise exception 'ALREADY_A_MEMBER'; end if;
  if exists(select 1 from public.organization_memberships m join auth.users u on u.id=m.user_id
    where m.organization_id=p_organization_id and m.arrangement_property_id is not null and lower(btrim(u.email))=p_email_normalized) then raise exception 'PROPERTY_CONFLICT'; end if;
  if exists(select 1 from public.organization_invitations where organization_id=p_organization_id
    and email_normalized=p_email_normalized and status='pending') then raise exception 'INVITATION_ALREADY_PENDING'; end if;
  if v_operation.id is null then
    insert into public.arrangement_personal_invitation_operations(organization_id,actor_membership_id,idempotency_key,payload_fingerprint)
      values(p_organization_id,p_actor_membership_id,p_idempotency_key,public.spec44_personal_fingerprint(p_email_normalized)) returning * into v_operation;
  end if;
  return jsonb_build_object('operation_id',v_operation.id,'invitation',null);
end; $$;

-- Both the early repository check and the SQL claim verify the prepared scope/destination.
create function public.spec44_assert_personal_provisioning(p_organization_id uuid,p_actor_membership_id uuid,
  p_actor_user_id uuid,p_personal_operation_id uuid,p_email_normalized text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor public.organization_memberships%rowtype;
begin
  v_actor:=public.spec44_require_inviter(p_organization_id,p_actor_membership_id);
  if v_actor.user_id is distinct from p_actor_user_id or p_email_normalized is null
    or not exists(select 1 from public.arrangement_personal_invitation_operations where id=p_personal_operation_id
      and organization_id=p_organization_id and actor_membership_id=p_actor_membership_id and invitation_id is null
      and payload_fingerprint=public.spec44_personal_fingerprint(p_email_normalized)) then raise exception 'FORBIDDEN'; end if;
  return true;
end; $$;


create function public.spec44_claim_personal_identity_provisioning(
  p_idempotency_key text, p_payload_fingerprint text, p_email_fingerprint text,
  p_purpose text, p_request_id text, p_actor_type text, p_actor_user_id uuid,
  p_actor_membership_id uuid, p_step_up_session_id uuid,
  p_organization_id uuid, p_personal_operation_id uuid, p_email_normalized text
) returns table (
  operation_id uuid, claim_state text, state text, outcome text, auth_user_id uuid,
  profile_state text, activation_required boolean, provider_reconciliation_reference text,
  provider_ambiguity_phase text
) language plpgsql security definer set search_path = pg_catalog as $$
declare v_operation public.identity_provisioning_operations%rowtype;
declare v_inventory_blocked boolean := false;
begin
  if char_length(p_idempotency_key) not between 8 and 160
    or p_payload_fingerprint !~ '^[0-9a-f]{64}$'
    or p_email_fingerprint !~ '^[0-9a-f]{64}$'
    or p_purpose not in ('initial_owner','organization_invitee')
    or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
    or p_actor_type not in ('platform_operator','organization_invitation')
    or (p_actor_type = 'organization_invitation') <> (p_actor_membership_id is not null)
    or (p_actor_type = 'platform_operator') <> (p_step_up_session_id is not null) then
    raise exception 'INVALID_PROVISIONING_INPUT';
  end if;
  if p_actor_type is distinct from 'organization_invitation' or p_purpose is distinct from 'organization_invitee'
    or p_step_up_session_id is not null or p_idempotency_key is distinct from 'personal:' || p_personal_operation_id::text then
    raise exception 'FORBIDDEN';
  end if;
  perform public.spec44_assert_personal_provisioning(p_organization_id,p_actor_membership_id,p_actor_user_id,
    p_personal_operation_id,p_email_normalized);
  perform pg_advisory_xact_lock(hashtextextended(p_email_fingerprint, 35));
  select o.* into v_operation from public.identity_provisioning_operations o
    where o.idempotency_key = p_idempotency_key for update;
  if found then
    if v_operation.payload_fingerprint <> p_payload_fingerprint
      or v_operation.email_fingerprint <> p_email_fingerprint
      or v_operation.purpose <> p_purpose then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    if v_operation.actor_type <> p_actor_type or v_operation.actor_user_id <> p_actor_user_id
      or v_operation.actor_membership_id is distinct from p_actor_membership_id then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    if v_operation.state in ('completed','blocked') then
      update public.identity_provisioning_operations set attempts = attempts + 1,
        last_request_id = p_request_id, updated_at = now(), version = version + 1
        where id = v_operation.id returning * into v_operation;
      insert into public.identity_provisioning_events (
        operation_id, request_id, actor_type, actor_user_id, actor_membership_id,
        action, outcome, email_fingerprint
      ) values (v_operation.id, p_request_id, v_operation.actor_type, v_operation.actor_user_id,
        v_operation.actor_membership_id, 'identity.provisioning_replayed', 'succeeded',
        v_operation.email_fingerprint);
      return query select v_operation.id, 'replayed', v_operation.state, v_operation.outcome,
        v_operation.auth_user_id, v_operation.profile_state, v_operation.activation_required,
        v_operation.provider_reconciliation_reference::text, v_operation.provider_ambiguity_phase;
      return;
    end if;
    update public.identity_provisioning_operations set attempts = attempts + 1,
      last_request_id = p_request_id, updated_at = now(), version = version + 1
      where id = v_operation.id returning * into v_operation;
    return query select v_operation.id, 'resumed', v_operation.state, v_operation.outcome,
      v_operation.auth_user_id, v_operation.profile_state, v_operation.activation_required,
      v_operation.provider_reconciliation_reference::text, v_operation.provider_ambiguity_phase;
    return;
  end if;

  select o.* into v_operation from public.identity_provisioning_operations o
    where o.email_fingerprint = p_email_fingerprint and o.state in ('processing','provider_ambiguous')
    for update;
  if found then
    insert into public.identity_provisioning_events (
      operation_id, request_id, actor_type, actor_user_id, actor_membership_id,
      action, outcome, reason_code, email_fingerprint
    ) values (v_operation.id, p_request_id, p_actor_type, p_actor_user_id, p_actor_membership_id,
      'identity.provisioning_busy', 'blocked', 'PROVISIONING_IN_PROGRESS', p_email_fingerprint);
    return query select v_operation.id, 'busy', v_operation.state, v_operation.outcome,
      v_operation.auth_user_id, v_operation.profile_state, v_operation.activation_required,
      v_operation.provider_reconciliation_reference::text, v_operation.provider_ambiguity_phase;
    return;
  end if;

  select exists (
    select 1 from migration_control.migration_inventory_items i
    where i.artifact_type in ('auth_user','identity','user_profile')
      and i.ownership_signals ->> 'email_fingerprint' = p_email_fingerprint
      and (i.confidence <> 'verified' or i.quarantine_state = 'quarantined'
        or coalesce(i.final_disposition, i.proposed_disposition) = 'quarantine')
  ) into v_inventory_blocked;

  insert into public.identity_provisioning_operations (
    idempotency_key, payload_fingerprint, email_fingerprint, purpose, actor_type,
    actor_user_id, actor_membership_id, step_up_session_id, created_request_id, last_request_id
  ) values (
    p_idempotency_key, p_payload_fingerprint, p_email_fingerprint, p_purpose, p_actor_type,
    p_actor_user_id, p_actor_membership_id, p_step_up_session_id, p_request_id, p_request_id
  ) returning * into v_operation;
  insert into public.identity_provisioning_events (
    operation_id, request_id, actor_type, actor_user_id, actor_membership_id,
    action, outcome, email_fingerprint
  ) values (
    v_operation.id, p_request_id, p_actor_type, p_actor_user_id, p_actor_membership_id,
    'identity.provisioning_claimed', 'succeeded', p_email_fingerprint
  );
  return query select v_operation.id, case when v_inventory_blocked then 'blocked_inventory' else 'created' end,
    v_operation.state, v_operation.outcome, v_operation.auth_user_id, v_operation.profile_state,
    v_operation.activation_required, v_operation.provider_reconciliation_reference::text,
    v_operation.provider_ambiguity_phase;
end;
$$;


create function public.spec44_create_personal_invitation(p_organization_id uuid,p_actor_membership_id uuid,
  p_operation_id uuid,p_email_normalized text,p_token_hash text,p_token_prefix text,p_expires_at timestamptz,
  p_invited_auth_user_id uuid,p_registration_permitted boolean,p_delivery_method text,p_request_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor public.organization_memberships%rowtype;
declare v_operation public.arrangement_personal_invitation_operations%rowtype;
declare v_invitation public.organization_invitations%rowtype;
begin
  v_actor:=public.spec44_require_inviter(p_organization_id,p_actor_membership_id);
  select * into v_operation from public.arrangement_personal_invitation_operations where id=p_operation_id
    and organization_id=p_organization_id and actor_membership_id=p_actor_membership_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_operation.payload_fingerprint is distinct from public.spec44_personal_fingerprint(p_email_normalized) then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  if v_operation.invitation_id is not null then
    select * into v_invitation from public.organization_invitations where id=v_operation.invitation_id;
    return public.spec42_invitation_record(v_invitation)||jsonb_build_object('link_issued',false);
  end if;
  if p_expires_at is null or p_expires_at<=now() or p_delivery_method is null or p_delivery_method not in ('share_link','email') then raise exception 'INVALID_REQUEST'; end if;
  if exists(select 1 from public.organization_memberships where organization_id=p_organization_id and user_id=p_invited_auth_user_id and status='active') then raise exception 'ALREADY_A_MEMBER'; end if;
  if exists(select 1 from public.organization_memberships where organization_id=p_organization_id and user_id=p_invited_auth_user_id and arrangement_property_id is not null) then raise exception 'PROPERTY_CONFLICT'; end if;
  if not exists(select 1 from auth.users u where id=p_invited_auth_user_id and lower(btrim(email))=p_email_normalized
    and (not p_registration_permitted or (u.email_confirmed_at is null and u.confirmed_at is null and u.last_sign_in_at is null))) then raise exception 'INVITATION_INVALID'; end if;
  insert into public.organization_invitations(organization_id,email_normalized,intended_role,token_hash,token_prefix,expires_at,
    invited_by_membership_id,delivery_method,invited_auth_user_id,registration_permitted,link_issued_at)
    values(p_organization_id,p_email_normalized,'personal',p_token_hash,p_token_prefix,p_expires_at,p_actor_membership_id,
      p_delivery_method,p_invited_auth_user_id,p_registration_permitted,case when p_delivery_method='share_link' then now() end) returning * into v_invitation;
  update public.arrangement_personal_invitation_operations set invitation_id=v_invitation.id where id=v_operation.id;
  insert into public.organization_events(organization_id,event_type,actor_type,actor_user_id,actor_membership_id,target_type,target_id,request_id,metadata)
    select p_organization_id,e,'member',v_actor.user_id,v_actor.id,'invitation',v_invitation.id,p_request_id,jsonb_build_object('intended_role','personal')
    from unnest(case when p_delivery_method='share_link' then array['member.invited','member.invitation_link_issued'] else array['member.invited'] end) e;
  return public.spec42_invitation_record(v_invitation)||jsonb_build_object('link_issued',true,'email_normalized',v_invitation.email_normalized);
end; $$;


create or replace function public.spec42_accept_property_invitation(p_invitation_id uuid, p_user_id uuid,
  p_verified_email_normalized text, p_request_id text)
returns public.organization_memberships language plpgsql security definer set search_path = pg_catalog as $$
declare v_invitation public.organization_invitations%rowtype; v_member public.organization_memberships%rowtype;
begin
  select * into v_invitation from public.organization_invitations where id = p_invitation_id;
  if not found then raise exception 'INVITATION_INVALID'; end if;
  perform 1 from public.organizations where id = v_invitation.organization_id and status = 'active' for update;
  if not found then raise exception 'INVITATION_INVALID'; end if;
  select * into v_invitation from public.organization_invitations where id = p_invitation_id for update;
  if v_invitation.intended_role = 'personal' then raise exception 'PERSONAL_PROFILE_REQUIRED'; end if;
  if v_invitation.status <> 'pending' or v_invitation.expires_at <= now()
    or not public.spec42_invitation_property_valid(v_invitation)
    or p_verified_email_normalized is null or lower(btrim(p_verified_email_normalized)) <> v_invitation.email_normalized
    or (v_invitation.invited_auth_user_id is not null and v_invitation.invited_auth_user_id <> p_user_id)
    or not exists(select 1 from auth.users u join public.user_profiles p on p.user_id = u.id
      where u.id = p_user_id and lower(btrim(u.email)) = v_invitation.email_normalized) then raise exception 'INVITATION_INVALID'; end if;
  select * into v_member from public.organization_memberships where organization_id = v_invitation.organization_id and user_id = p_user_id for update;
  if found then
    if v_member.status = 'active' then raise exception 'ALREADY_A_MEMBER'; end if;
    if v_invitation.intended_role = 'inquilino' and v_member.arrangement_property_id is not null
      and v_member.arrangement_property_id <> v_invitation.arrangement_property_id then raise exception 'PROPERTY_CONFLICT'; end if;
    update public.organization_memberships set role = v_invitation.intended_role, status = 'active',
      arrangement_property_id = coalesce(v_member.arrangement_property_id, v_invitation.arrangement_property_id),
      invitation_id = v_invitation.id, invited_at = v_invitation.created_at, joined_at = now(),
      suspended_at = null, suspended_by_user_id = null, suspension_reason_code = null,
      removed_at = null, removed_by_user_id = null, removal_reason_code = null where id = v_member.id returning * into v_member;
  else
    insert into public.organization_memberships(organization_id,user_id,role,status,invitation_id,invited_at,joined_at,arrangement_property_id)
      values(v_invitation.organization_id,p_user_id,v_invitation.intended_role,'active',v_invitation.id,v_invitation.created_at,now(),v_invitation.arrangement_property_id)
      returning * into v_member;
  end if;
  update public.organization_invitations set status = 'accepted', accepted_at = now(), accepted_by_user_id = p_user_id,
    accepted_membership_id = v_member.id, version = version + 1 where id = v_invitation.id;
  insert into public.organization_events(organization_id,event_type,actor_type,actor_user_id,actor_membership_id,target_type,target_id,request_id,metadata)
    values(v_invitation.organization_id,'member.invitation_accepted','member',p_user_id,v_member.id,'membership',v_member.id,p_request_id,
      jsonb_strip_nulls(jsonb_build_object('role',v_member.role,'arrangement_property_id',v_member.arrangement_property_id,'context_refresh_required',true)));
  return v_member;
end; $$;

create function public.spec44_accept_invitation(p_invitation_id uuid, p_user_id uuid,
  p_verified_email_normalized text, p_request_id text, p_personal_profile jsonb)
returns public.organization_memberships language plpgsql security definer set search_path = pg_catalog as $$
declare v_invitation public.organization_invitations%rowtype; v_member public.organization_memberships%rowtype;
begin
  select * into v_invitation from public.organization_invitations where id = p_invitation_id;
  if not found then raise exception 'INVITATION_INVALID'; end if;
  perform 1 from public.organizations where id = v_invitation.organization_id and status = 'active' for update;
  if not found then raise exception 'INVITATION_INVALID'; end if;
  select * into v_invitation from public.organization_invitations where id = p_invitation_id for update;
  if v_invitation.status <> 'pending' or v_invitation.expires_at <= now()
    or not public.spec42_invitation_property_valid(v_invitation)
    or p_verified_email_normalized is null or lower(btrim(p_verified_email_normalized)) <> v_invitation.email_normalized
    or (v_invitation.invited_auth_user_id is not null and v_invitation.invited_auth_user_id <> p_user_id)
    or not exists(select 1 from auth.users u join public.user_profiles p on p.user_id = u.id
      where u.id = p_user_id and lower(btrim(u.email)) = v_invitation.email_normalized) then raise exception 'INVITATION_INVALID'; end if;
  if v_invitation.intended_role<>'personal' then
    if p_personal_profile is not null then raise exception 'INVALID_REQUEST'; end if;
    return public.spec42_accept_property_invitation(p_invitation_id,p_user_id,p_verified_email_normalized,p_request_id);
  end if;
  if p_personal_profile is null then raise exception 'PERSONAL_PROFILE_REQUIRED'; end if;
  if jsonb_typeof(p_personal_profile)<>'object' then raise exception 'INVALID_REQUEST'; end if;
  if (select count(*) from jsonb_object_keys(p_personal_profile))<>3
    or jsonb_typeof(p_personal_profile->'name') is distinct from 'string'
    or jsonb_typeof(p_personal_profile->'contact_number') is distinct from 'string'
    or jsonb_typeof(p_personal_profile->'occupation') is distinct from 'string'
    or not public.spec44_profile_text_valid(public.spec44_trim(p_personal_profile->>'name'),120)
    or not public.spec44_profile_text_valid(public.spec44_trim(p_personal_profile->>'contact_number'),64)
    or not public.spec44_profile_text_valid(public.spec44_trim(p_personal_profile->>'occupation'),120) then raise exception 'INVALID_REQUEST'; end if;
  select * into v_member from public.organization_memberships where organization_id = v_invitation.organization_id and user_id = p_user_id for update;
  if found then
    if v_member.arrangement_property_id is not null then raise exception 'PROPERTY_CONFLICT'; end if;
    if v_member.status = 'active' then raise exception 'ALREADY_A_MEMBER'; end if;
    if v_invitation.intended_role = 'inquilino' and v_member.arrangement_property_id is not null
      and v_member.arrangement_property_id <> v_invitation.arrangement_property_id then raise exception 'PROPERTY_CONFLICT'; end if;
    update public.organization_memberships set role = v_invitation.intended_role, status = 'active',
      personal_name=public.spec44_trim(p_personal_profile->>'name'),
      personal_contact_number=public.spec44_trim(p_personal_profile->>'contact_number'),
      personal_occupation=public.spec44_trim(p_personal_profile->>'occupation'),
      arrangement_property_id = coalesce(v_member.arrangement_property_id, v_invitation.arrangement_property_id),
      invitation_id = v_invitation.id, invited_at = v_invitation.created_at, joined_at = now(),
      suspended_at = null, suspended_by_user_id = null, suspension_reason_code = null,
      removed_at = null, removed_by_user_id = null, removal_reason_code = null where id = v_member.id returning * into v_member;
  else
    insert into public.organization_memberships(organization_id,user_id,role,status,invitation_id,invited_at,joined_at,arrangement_property_id,personal_name,personal_contact_number,personal_occupation)
      values(v_invitation.organization_id,p_user_id,v_invitation.intended_role,'active',v_invitation.id,v_invitation.created_at,now(),v_invitation.arrangement_property_id,public.spec44_trim(p_personal_profile->>'name'),public.spec44_trim(p_personal_profile->>'contact_number'),public.spec44_trim(p_personal_profile->>'occupation'))
      returning * into v_member;
  end if;
  update public.organization_invitations set status = 'accepted', accepted_at = now(), accepted_by_user_id = p_user_id,
    accepted_membership_id = v_member.id, version = version + 1 where id = v_invitation.id;
  insert into public.organization_events(organization_id,event_type,actor_type,actor_user_id,actor_membership_id,target_type,target_id,request_id,metadata)
    values(v_invitation.organization_id,'member.invitation_accepted','member',p_user_id,v_member.id,'membership',v_member.id,p_request_id,
      jsonb_strip_nulls(jsonb_build_object('role',v_member.role,'arrangement_property_id',v_member.arrangement_property_id,'context_refresh_required',true)));
  return v_member;
end; $$;

create function public.spec44_accept_invitation_token(p_raw_token text, p_user_id uuid, p_verified_email_normalized text, p_request_id text, p_personal_profile jsonb)
returns setof public.organization_memberships language plpgsql security definer set search_path = pg_catalog as $$
declare v_id uuid; v_member public.organization_memberships%rowtype;
begin
  select id into v_id from public.organization_invitations where token_hash = encode(extensions.digest(p_raw_token,'sha256'),'hex');
  if not found then raise exception 'INVITATION_INVALID'; end if;
  v_member := public.spec44_accept_invitation(v_id,p_user_id,p_verified_email_normalized,p_request_id,p_personal_profile);
  update public.invitation_auth_handoffs set invalidated_at = now() where invitation_id = v_id and consumed_at is null and invalidated_at is null;
  return next v_member;
end; $$;

create function public.spec44_accept_invitation_handoff(p_handle_hash text, p_browser_binding_hash text, p_origin_hash text,
  p_user_id uuid, p_verified_email_normalized text, p_request_id text, p_personal_profile jsonb)
returns setof public.organization_memberships language plpgsql security definer set search_path = pg_catalog as $$
declare v_handoff public.invitation_auth_handoffs%rowtype; v_invitation public.organization_invitations%rowtype;
declare v_member public.organization_memberships%rowtype;
begin
  select * into v_handoff from public.invitation_auth_handoffs where handle_hash = p_handle_hash;
  if not found then raise exception 'INVITATION_INVALID'; end if;
  perform 1 from public.organizations where id = v_handoff.organization_id and status = 'active' for update;
  if not found then raise exception 'INVITATION_INVALID'; end if;
  select * into v_invitation from public.organization_invitations where id = v_handoff.invitation_id and organization_id = v_handoff.organization_id for update;
  select * into v_handoff from public.invitation_auth_handoffs where handle_hash = p_handle_hash for update;
  if v_handoff.browser_binding_hash is distinct from p_browser_binding_hash or v_handoff.origin_hash is distinct from p_origin_hash
    or v_handoff.purpose <> 'invitation_acceptance' or v_handoff.consumed_at is not null or v_handoff.invalidated_at is not null
    or v_handoff.expires_at <= now() or v_handoff.invitation_token_version <> v_invitation.token_version then raise exception 'INVITATION_INVALID'; end if;
  v_member := public.spec44_accept_invitation(v_invitation.id,p_user_id,p_verified_email_normalized,p_request_id,p_personal_profile);
  update public.invitation_auth_handoffs set consumed_at = now() where id = v_handoff.id;
  update public.invitation_auth_handoffs set invalidated_at = now() where invitation_id = v_invitation.id
    and id <> v_handoff.id and consumed_at is null and invalidated_at is null;
  return next v_member;
end; $$;

create function public.spec44_rotate_personal_invitation(
  p_organization_id uuid, p_invitation_id uuid, p_replacement_invitation_id uuid,
  p_token_hash text, p_token_prefix text, p_expires_at timestamptz,
  p_actor_membership_id uuid, p_request_id text
) returns setof public.organization_invitations
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_actor public.organization_memberships%rowtype;
  v_old public.organization_invitations%rowtype;
  v_new public.organization_invitations%rowtype;
begin
  perform 1 from public.organizations where id = p_organization_id and status = 'active' for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into v_actor from public.organization_memberships
  where id = p_actor_membership_id and organization_id = p_organization_id and status = 'active' for update;
  if not found or v_actor.role not in ('owner', 'admin', 'member') then raise exception 'FORBIDDEN'; end if;
  select * into v_old from public.organization_invitations
  where id = p_invitation_id and organization_id = p_organization_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not public.spec42_invitation_property_valid(v_old) or v_old.status <> 'pending' then raise exception 'INVITATION_INVALID'; end if;
  if v_old.intended_role<>'personal' or not exists(select 1 from public.arrangement_personal_invitation_operations
    where organization_id=p_organization_id and invitation_id=v_old.id
      and (v_actor.role in ('owner','admin') or actor_membership_id=v_actor.id)) then raise exception 'NOT_FOUND'; end if;

  if p_expires_at is null or p_expires_at<=now() then raise exception 'INVALID_REQUEST'; end if;
  update public.organization_invitations set
    status = 'replaced', replaced_at = now(), replacement_invitation_id = p_replacement_invitation_id,
    version = version + 1
  where id = v_old.id;
  insert into public.organization_invitations (
    id, organization_id, email_normalized, intended_role, token_hash, token_prefix,
    token_version, expires_at, invited_by_membership_id, arrangement_property_id, delivery_method, invited_auth_user_id, registration_permitted, link_issued_at
  ) values (
    p_replacement_invitation_id, p_organization_id, v_old.email_normalized,
    v_old.intended_role, p_token_hash, p_token_prefix, v_old.token_version + 1,
    p_expires_at, v_old.invited_by_membership_id, v_old.arrangement_property_id, v_old.delivery_method, v_old.invited_auth_user_id, v_old.registration_permitted, case when v_old.delivery_method = 'share_link' then now() else null end
  ) returning * into v_new;
  insert into public.organization_events (
    organization_id, event_type, actor_type, actor_user_id, actor_membership_id,
    target_type, target_id, request_id, metadata
  ) values (
    p_organization_id, 'member.invitation_resent', 'member', v_actor.user_id, v_actor.id,
    'invitation', v_new.id, p_request_id,
    jsonb_build_object('replaced_invitation_id', v_old.id, 'token_version', v_new.token_version, 'arrangement_property_id', v_new.arrangement_property_id)
  );
  update public.invitation_auth_handoffs set invalidated_at = now() where invitation_id = v_old.id and consumed_at is null and invalidated_at is null;
  -- Operation retries follow the current replacement, never issue an unrelated token.
  update public.arrangement_personal_invitation_operations set invitation_id = v_new.id where invitation_id = v_old.id and organization_id = p_organization_id;
  return next v_new;
end;
$$;

create function public.spec44_revoke_personal_invitation(
  p_organization_id uuid, p_invitation_id uuid, p_actor_membership_id uuid, p_request_id text
) returns setof public.organization_invitations
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_actor public.organization_memberships%rowtype;
  v_invitation public.organization_invitations%rowtype;
begin
  perform 1 from public.organizations where id = p_organization_id and status = 'active' for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into v_actor from public.organization_memberships
  where id = p_actor_membership_id and organization_id = p_organization_id and status = 'active' for update;
  if not found or v_actor.role not in ('owner', 'admin', 'member') then raise exception 'FORBIDDEN'; end if;
  select * into v_invitation from public.organization_invitations
  where id = p_invitation_id and organization_id = p_organization_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_invitation.intended_role<>'personal' or not exists(select 1 from public.arrangement_personal_invitation_operations
    where organization_id=p_organization_id and invitation_id=v_invitation.id
      and (v_actor.role in ('owner','admin') or actor_membership_id=v_actor.id)) then raise exception 'NOT_FOUND'; end if;
  if v_invitation.status = 'revoked' then return next v_invitation; return; end if;
  if v_invitation.status <> 'pending' then raise exception 'INVITATION_INVALID'; end if;
  update public.organization_invitations set
    status = 'revoked', revoked_at = now(), revoked_by_membership_id = v_actor.id,
    version = version + 1
  where id = v_invitation.id returning * into v_invitation;
  insert into public.organization_events (
    organization_id, event_type, actor_type, actor_user_id, actor_membership_id,
    target_type, target_id, request_id, metadata
  ) values (
    p_organization_id, 'member.invitation_revoked', 'member', v_actor.user_id, v_actor.id,
    'invitation', v_invitation.id, p_request_id, '{}'::jsonb
  );
  update public.invitation_auth_handoffs set invalidated_at = now() where invitation_id = v_invitation.id and consumed_at is null and invalidated_at is null;
  return next v_invitation;
end;
$$;

create or replace function public.spec26_resend_invitation(
  p_organization_id uuid, p_invitation_id uuid, p_replacement_invitation_id uuid,
  p_token_hash text, p_token_prefix text, p_expires_at timestamptz,
  p_actor_membership_id uuid, p_request_id text
) returns setof public.organization_invitations
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_actor public.organization_memberships%rowtype;
  v_old public.organization_invitations%rowtype;
  v_new public.organization_invitations%rowtype;
begin
  perform 1 from public.organizations where id = p_organization_id and status = 'active' for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into v_actor from public.organization_memberships
  where id = p_actor_membership_id and organization_id = p_organization_id and status = 'active' for update;
  if not found or v_actor.role not in ('owner', 'admin') then raise exception 'FORBIDDEN'; end if;
  select * into v_old from public.organization_invitations
  where id = p_invitation_id and organization_id = p_organization_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not public.spec42_invitation_property_valid(v_old) or v_old.status <> 'pending' then raise exception 'INVITATION_INVALID'; end if;
  if v_actor.role = 'admin' and v_old.intended_role = 'admin' then raise exception 'FORBIDDEN'; end if;

  update public.organization_invitations set
    status = 'replaced', replaced_at = now(), replacement_invitation_id = p_replacement_invitation_id,
    version = version + 1
  where id = v_old.id;
  insert into public.organization_invitations (
    id, organization_id, email_normalized, intended_role, token_hash, token_prefix,
    token_version, expires_at, invited_by_membership_id, arrangement_property_id, delivery_method, invited_auth_user_id, registration_permitted, link_issued_at
  ) values (
    p_replacement_invitation_id, p_organization_id, v_old.email_normalized,
    v_old.intended_role, p_token_hash, p_token_prefix, v_old.token_version + 1,
    p_expires_at, case when v_old.intended_role='personal' then v_old.invited_by_membership_id else p_actor_membership_id end, v_old.arrangement_property_id, v_old.delivery_method, v_old.invited_auth_user_id, v_old.registration_permitted, case when v_old.delivery_method = 'share_link' then now() else null end
  ) returning * into v_new;
  insert into public.organization_events (
    organization_id, event_type, actor_type, actor_user_id, actor_membership_id,
    target_type, target_id, request_id, metadata
  ) values (
    p_organization_id, 'member.invitation_resent', 'member', v_actor.user_id, v_actor.id,
    'invitation', v_new.id, p_request_id,
    jsonb_build_object('replaced_invitation_id', v_old.id, 'token_version', v_new.token_version, 'arrangement_property_id', v_new.arrangement_property_id)
  );
  update public.invitation_auth_handoffs set invalidated_at = now() where invitation_id = v_old.id and consumed_at is null and invalidated_at is null;
  -- Operation retries follow the current replacement, never issue an unrelated token.
  update public.arrangement_invitation_operations set invitation_id = v_new.id where invitation_id = v_old.id and organization_id = p_organization_id;
  update public.arrangement_personal_invitation_operations set invitation_id=v_new.id where invitation_id=v_old.id and organization_id=p_organization_id;
  return next v_new;
end;
$$;


-- Do not expose implementation helpers; only scoped adapters are service-callable.
revoke all on function public.spec44_trim(text),public.spec44_profile_text_valid(text,integer),
  public.spec44_personal_fingerprint(text),public.spec44_require_inviter(uuid,uuid),
  public.spec44_accept_invitation(uuid,uuid,text,text,jsonb) from public,anon,authenticated,service_role;
-- Constraints on existing tables also execute for the service's established DML paths.
grant execute on function public.spec44_trim(text),public.spec44_profile_text_valid(text,integer) to service_role;
revoke all on function public.spec44_prepare_personal_invitation(uuid,uuid,text,text),
  public.spec44_assert_personal_provisioning(uuid,uuid,uuid,uuid,text),
  public.spec44_claim_personal_identity_provisioning(text,text,text,text,text,text,uuid,uuid,uuid,uuid,uuid,text),
  public.spec44_create_personal_invitation(uuid,uuid,uuid,text,text,text,timestamptz,uuid,boolean,text,text),
  public.spec44_accept_invitation_token(text,uuid,text,text,jsonb),
  public.spec44_accept_invitation_handoff(text,text,text,uuid,text,text,jsonb),
  public.spec44_rotate_personal_invitation(uuid,uuid,uuid,text,text,timestamptz,uuid,text),
  public.spec44_revoke_personal_invitation(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.spec44_prepare_personal_invitation(uuid,uuid,text,text),
  public.spec44_assert_personal_provisioning(uuid,uuid,uuid,uuid,text),
  public.spec44_claim_personal_identity_provisioning(text,text,text,text,text,text,uuid,uuid,uuid,uuid,uuid,text),
  public.spec44_create_personal_invitation(uuid,uuid,uuid,text,text,text,timestamptz,uuid,boolean,text,text),
  public.spec44_accept_invitation_token(text,uuid,text,text,jsonb),
  public.spec44_accept_invitation_handoff(text,text,text,uuid,text,text,jsonb),
  public.spec44_rotate_personal_invitation(uuid,uuid,uuid,text,text,timestamptz,uuid,text),
  public.spec44_revoke_personal_invitation(uuid,uuid,uuid,text) to service_role;
commit;
