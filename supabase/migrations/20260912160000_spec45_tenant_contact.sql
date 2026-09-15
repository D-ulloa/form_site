-- SPEC-45: tenant contact belongs to the membership; historical tenants remain exempt.
begin;
alter table public.organization_memberships
  add column inquilino_contact_number text,
  add column inquilino_first_joined_at timestamptz;
create function public.spec45_phone_valid(v text) returns boolean language sql immutable set search_path=pg_catalog as $$
  select v is not null and v=public.spec44_trim(v) and char_length(v) between 1 and 64
    and v ~ '^\+?[0-9 ()-]+$' and char_length(regexp_replace(v,'[^0-9]','','g')) between 7 and 15;
$$;
alter table public.organization_memberships add constraint membership_inquilino_phone_valid
  check(inquilino_contact_number is null or public.spec45_phone_valid(inquilino_contact_number));
-- Preserve evidence of previous tenant onboarding, including subsequent role changes.
update public.organization_memberships m set inquilino_first_joined_at=m.joined_at
where m.role='inquilino' or exists(select 1 from public.organization_invitations i
  where i.organization_id=m.organization_id and i.accepted_membership_id=m.id and i.status='accepted' and i.intended_role='inquilino')
  or exists(select 1 from public.organization_events e where e.organization_id=m.organization_id and e.target_id=m.id
    and ((e.event_type='member.invitation_accepted' and e.metadata->>'role'='inquilino')
      or (e.event_type='member.role_changed' and (e.metadata->>'prior_role'='inquilino' or e.metadata->>'new_role'='inquilino'))));
create function public.spec45_guard_tenant_contact() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
  if TG_OP='UPDATE' and OLD.inquilino_first_joined_at is not null then
    NEW.inquilino_first_joined_at:=OLD.inquilino_first_joined_at;
    NEW.inquilino_contact_number:=OLD.inquilino_contact_number;
  elsif NEW.role='inquilino' then
    if not public.spec45_phone_valid(NEW.inquilino_contact_number) then raise exception 'INQUILINO_PROFILE_REQUIRED'; end if;
    NEW.inquilino_first_joined_at:=clock_timestamp();
  else
    NEW.inquilino_first_joined_at:=null;
    NEW.inquilino_contact_number:=null;
  end if;
  return NEW;
end; $$;
create trigger spec45_tenant_contact before insert or update on public.organization_memberships
for each row execute function public.spec45_guard_tenant_contact();
create function public.spec45_accept_property_invitation(p_invitation_id uuid, p_user_id uuid,
  p_verified_email_normalized text, p_request_id text, p_inquilino_profile jsonb)
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
  if v_invitation.intended_role <> 'inquilino' and p_inquilino_profile is not null then raise exception 'INVALID_REQUEST'; end if;
  if v_invitation.intended_role='inquilino' and v_member.inquilino_first_joined_at is null then
    if p_inquilino_profile is null then raise exception 'INQUILINO_PROFILE_REQUIRED'; end if;
    if jsonb_typeof(p_inquilino_profile)<>'object' then raise exception 'INVALID_REQUEST'; end if;
    if (select count(*) from jsonb_object_keys(p_inquilino_profile))<>1
      or jsonb_typeof(p_inquilino_profile->'contact_number') is distinct from 'string'
      or not public.spec45_phone_valid(public.spec44_trim(p_inquilino_profile->>'contact_number')) then raise exception 'INVALID_REQUEST'; end if;
  end if;
  if v_member.id is not null then
    if v_member.status = 'active' then raise exception 'ALREADY_A_MEMBER'; end if;
    if v_invitation.intended_role = 'inquilino' and v_member.arrangement_property_id is not null
      and v_member.arrangement_property_id <> v_invitation.arrangement_property_id then raise exception 'PROPERTY_CONFLICT'; end if;
    update public.organization_memberships set inquilino_contact_number=case when v_member.inquilino_first_joined_at is null then public.spec44_trim(p_inquilino_profile->>'contact_number') else v_member.inquilino_contact_number end, role = v_invitation.intended_role, status = 'active',
      arrangement_property_id = coalesce(v_member.arrangement_property_id, v_invitation.arrangement_property_id),
      invitation_id = v_invitation.id, invited_at = v_invitation.created_at, joined_at = now(),
      suspended_at = null, suspended_by_user_id = null, suspension_reason_code = null,
      removed_at = null, removed_by_user_id = null, removal_reason_code = null where id = v_member.id returning * into v_member;
  else
    insert into public.organization_memberships(organization_id,user_id,role,status,invitation_id,invited_at,joined_at,arrangement_property_id,inquilino_contact_number)
      values(v_invitation.organization_id,p_user_id,v_invitation.intended_role,'active',v_invitation.id,v_invitation.created_at,now(),v_invitation.arrangement_property_id,public.spec44_trim(p_inquilino_profile->>'contact_number'))
      returning * into v_member;
  end if;
  update public.organization_invitations set status = 'accepted', accepted_at = now(), accepted_by_user_id = p_user_id,
    accepted_membership_id = v_member.id, version = version + 1 where id = v_invitation.id;
  insert into public.organization_events(organization_id,event_type,actor_type,actor_user_id,actor_membership_id,target_type,target_id,request_id,metadata)
    values(v_invitation.organization_id,'member.invitation_accepted','member',p_user_id,v_member.id,'membership',v_member.id,p_request_id,
      jsonb_strip_nulls(jsonb_build_object('role',v_member.role,'arrangement_property_id',v_member.arrangement_property_id,'context_refresh_required',true)));
  return v_member;
end; $$;

-- Every older token/handoff adapter delegates here and therefore cannot bypass phone capture.
create or replace function public.spec42_accept_property_invitation(p_invitation_id uuid,p_user_id uuid,p_verified_email_normalized text,p_request_id text)
returns public.organization_memberships language sql security definer set search_path=pg_catalog as $$
  select public.spec45_accept_property_invitation(p_invitation_id,p_user_id,p_verified_email_normalized,p_request_id,null);
$$;
create function public.spec45_accept_invitation(p_invitation_id uuid,p_user_id uuid,p_verified_email_normalized text,p_request_id text,p_personal_profile jsonb,p_inquilino_profile jsonb)
returns public.organization_memberships language plpgsql security definer set search_path=pg_catalog as $$
declare i public.organization_invitations;
begin
  select * into i from public.organization_invitations where id=p_invitation_id;
  if not found then raise exception 'INVITATION_INVALID'; end if;
  if p_personal_profile is not null and p_inquilino_profile is not null then raise exception 'INVALID_REQUEST'; end if;
  if i.intended_role='personal' then
    if p_inquilino_profile is not null then raise exception 'INVALID_REQUEST'; end if;
    return public.spec44_accept_invitation(p_invitation_id,p_user_id,p_verified_email_normalized,p_request_id,p_personal_profile);
  end if;
  if p_personal_profile is not null then raise exception 'INVALID_REQUEST'; end if;
  return public.spec45_accept_property_invitation(p_invitation_id,p_user_id,p_verified_email_normalized,p_request_id,p_inquilino_profile);
end; $$;
create function public.spec45_accept_invitation_token(p_raw_token text, p_user_id uuid, p_verified_email_normalized text, p_request_id text, p_personal_profile jsonb, p_inquilino_profile jsonb)
returns setof public.organization_memberships language plpgsql security definer set search_path = pg_catalog as $$
declare v_id uuid; v_member public.organization_memberships%rowtype;
begin
  select id into v_id from public.organization_invitations where token_hash = encode(extensions.digest(p_raw_token,'sha256'),'hex');
  if not found then raise exception 'INVITATION_INVALID'; end if;
  v_member := public.spec45_accept_invitation(v_id,p_user_id,p_verified_email_normalized,p_request_id,p_personal_profile,p_inquilino_profile);
  update public.invitation_auth_handoffs set invalidated_at = now() where invitation_id = v_id and consumed_at is null and invalidated_at is null;
  return next v_member;
end; $$;

create function public.spec45_accept_invitation_handoff(p_handle_hash text, p_browser_binding_hash text, p_origin_hash text,
  p_user_id uuid, p_verified_email_normalized text, p_request_id text, p_personal_profile jsonb, p_inquilino_profile jsonb)
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
  v_member := public.spec45_accept_invitation(v_invitation.id,p_user_id,p_verified_email_normalized,p_request_id,p_personal_profile,p_inquilino_profile);
  update public.invitation_auth_handoffs set consumed_at = now() where id = v_handoff.id;
  update public.invitation_auth_handoffs set invalidated_at = now() where invitation_id = v_invitation.id
    and id <> v_handoff.id and consumed_at is null and invalidated_at is null;
  return next v_member;
end; $$;

-- Authenticated resolution only; the public invitation resolver never includes profile requirements.
create function public.spec45_invitation_acceptance_context(p_handle_hash text,p_browser_binding_hash text,p_origin_hash text,p_user_id uuid,p_verified_email_normalized text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare h public.invitation_auth_handoffs; i public.organization_invitations; required boolean;
begin
  select * into h from public.invitation_auth_handoffs where handle_hash=p_handle_hash
    and browser_binding_hash=p_browser_binding_hash and origin_hash=p_origin_hash
    and consumed_at is null and invalidated_at is null and expires_at>now() and purpose='invitation_acceptance';
  if not found then raise exception 'INVITATION_INVALID'; end if;
  select * into i from public.organization_invitations where id=h.invitation_id and organization_id=h.organization_id
    and token_version=h.invitation_token_version and status='pending' and expires_at>now()
    and email_normalized=lower(btrim(p_verified_email_normalized)) and (invited_auth_user_id is null or invited_auth_user_id=p_user_id);
  if not found or not exists(select 1 from public.organizations where id=i.organization_id and status='active')
    or not exists(select 1 from auth.users where id=p_user_id and lower(btrim(email))=i.email_normalized)
    then raise exception 'INVITATION_INVALID'; end if;
  required:=i.intended_role='inquilino' and not exists(select 1 from public.organization_memberships where organization_id=i.organization_id and user_id=p_user_id and inquilino_first_joined_at is not null);
  return jsonb_build_object('requires_inquilino_profile',required);
end; $$;
revoke all on function public.spec45_phone_valid(text),public.spec45_guard_tenant_contact(),
  public.spec45_accept_property_invitation(uuid,uuid,text,text,jsonb),public.spec45_accept_invitation(uuid,uuid,text,text,jsonb,jsonb),
  public.spec45_accept_invitation_token(text,uuid,text,text,jsonb,jsonb),public.spec45_accept_invitation_handoff(text,text,text,uuid,text,text,jsonb,jsonb),
  public.spec45_invitation_acceptance_context(text,text,text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.spec45_phone_valid(text),public.spec45_accept_invitation_token(text,uuid,text,text,jsonb,jsonb),
  public.spec45_accept_invitation_handoff(text,text,text,uuid,text,text,jsonb,jsonb),public.spec45_invitation_acceptance_context(text,text,text,uuid,text) to service_role;
commit;
