-- SPEC-42 cutover: no new inquilino incorporation without an organization property.
begin;

create function public.spec42_guard_membership_property() returns trigger
language plpgsql set search_path = pg_catalog as $$
begin
  if tg_op = 'UPDATE' then
    if old.arrangement_property_id is not null and new.arrangement_property_id is distinct from old.arrangement_property_id then
      raise exception 'PROPERTY_CONFLICT';
    end if;
    -- Historical unassigned rows remain readable, suspendable and removable.
    if new.role = 'inquilino' and new.arrangement_property_id is null
      and (old.role <> 'inquilino' or (new.status = 'active' and old.status <> 'active')) then
      raise exception 'PROPERTY_REQUIRED';
    end if;
  elsif new.role = 'inquilino' and new.arrangement_property_id is null then
    raise exception 'PROPERTY_REQUIRED';
  end if;
  return new;
end; $$;
create trigger spec42_membership_property before insert or update on public.organization_memberships
  for each row execute function public.spec42_guard_membership_property();

create function public.spec42_guard_invitation_property() returns trigger
language plpgsql set search_path = pg_catalog as $$
begin
  if new.intended_role <> 'inquilino' and new.arrangement_property_id is not null then raise exception 'INVALID_REQUEST'; end if;
  if tg_op = 'UPDATE' then
    if new.arrangement_property_id is distinct from old.arrangement_property_id then raise exception 'PROPERTY_CONFLICT'; end if;
    if new.intended_role = 'inquilino' and new.arrangement_property_id is null and
      (old.intended_role <> 'inquilino' or new.status = 'accepted' or new.token_hash <> old.token_hash
        or (new.registration_permitted and not old.registration_permitted)) then raise exception 'PROPERTY_REQUIRED'; end if;
  elsif new.intended_role = 'inquilino' and new.arrangement_property_id is null then raise exception 'PROPERTY_REQUIRED';
  end if;
  return new;
end; $$;
create trigger spec42_invitation_property before insert or update on public.organization_invitations
  for each row execute function public.spec42_guard_invitation_property();

alter table public.invitation_auth_handoffs add column invitation_token_version integer;
update public.invitation_auth_handoffs h set invitation_token_version = i.token_version
  from public.organization_invitations i where i.id = h.invitation_id and i.organization_id = h.organization_id;
alter table public.invitation_auth_handoffs alter column invitation_token_version set not null;

create function public.spec42_invitation_property_valid(p_invitation public.organization_invitations)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select case when p_invitation.intended_role = 'inquilino' then exists (
    select 1 from public.arrangement_properties p where p.id = p_invitation.arrangement_property_id
      and p.organization_id = p_invitation.organization_id
  ) else p_invitation.arrangement_property_id is null end;
$$;

-- Explicit safe record for internal adapters; raw token/hash/email never enter receipts.
create function public.spec42_invitation_record(p_invitation public.organization_invitations)
returns jsonb language sql immutable set search_path = pg_catalog as $$
  select jsonb_build_object('id', p_invitation.id, 'organization_id', p_invitation.organization_id,
    'intended_role', p_invitation.intended_role, 'status', p_invitation.status, 'expires_at', p_invitation.expires_at,
    'delivery_state', p_invitation.delivery_state, 'delivery_method', p_invitation.delivery_method,
    'token_version', p_invitation.token_version, 'version', p_invitation.version,
    'arrangement_property_id', p_invitation.arrangement_property_id);
$$;

create function public.spec42_prepare_property_invitation(p_organization_id uuid, p_actor_membership_id uuid,
  p_property_id uuid, p_email_normalized text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_operation public.arrangement_invitation_operations%rowtype; v_invitation public.organization_invitations%rowtype;
declare v_fingerprint text;
begin
  perform public.spec42_require_manager(p_organization_id, p_actor_membership_id);
  if not exists(select 1 from public.arrangement_properties where id = p_property_id and organization_id = p_organization_id) then raise exception 'NOT_FOUND'; end if;
  if p_email_normalized is null or p_email_normalized <> lower(btrim(p_email_normalized))
    or char_length(p_email_normalized) not between 3 and 320 or position('@' in p_email_normalized) < 2
    or p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 128 then raise exception 'INVALID_REQUEST'; end if;
  v_fingerprint := encode(extensions.digest(jsonb_build_array(p_email_normalized, 'inquilino', p_property_id)::text, 'sha256'), 'hex');
  select * into v_operation from public.arrangement_invitation_operations where organization_id = p_organization_id
    and actor_membership_id = p_actor_membership_id and idempotency_key = p_idempotency_key for update;
  if found then
    if v_operation.payload_fingerprint <> v_fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    if v_operation.invitation_id is not null then
      select * into v_invitation from public.organization_invitations where id = v_operation.invitation_id and organization_id = p_organization_id;
      return jsonb_build_object('operation_id', v_operation.id, 'invitation', public.spec42_invitation_record(v_invitation));
    end if;
  end if;
  if exists(select 1 from public.organization_memberships m join auth.users u on u.id = m.user_id
    where m.organization_id = p_organization_id and m.status = 'active' and lower(btrim(u.email)) = p_email_normalized) then raise exception 'ALREADY_A_MEMBER'; end if;
  if exists(select 1 from public.organization_invitations i where i.organization_id = p_organization_id
    and i.email_normalized = p_email_normalized and i.status = 'pending') then raise exception 'INVITATION_ALREADY_PENDING'; end if;
  if v_operation.id is null then
    insert into public.arrangement_invitation_operations(organization_id, actor_membership_id, arrangement_property_id, idempotency_key, payload_fingerprint)
      values(p_organization_id, p_actor_membership_id, p_property_id, p_idempotency_key, v_fingerprint) returning * into v_operation;
  end if;
  return jsonb_build_object('operation_id', v_operation.id, 'invitation', null);
end; $$;

create function public.spec42_create_manual_invitation(p_organization_id uuid, p_actor_membership_id uuid,
  p_operation_id uuid, p_property_id uuid, p_email_normalized text, p_token_hash text, p_token_prefix text,
  p_expires_at timestamptz, p_invited_auth_user_id uuid, p_registration_permitted boolean, p_request_id text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_actor public.organization_memberships%rowtype; v_operation public.arrangement_invitation_operations%rowtype;
declare v_invitation public.organization_invitations%rowtype;
begin
  v_actor := public.spec42_require_manager(p_organization_id, p_actor_membership_id);
  select * into v_operation from public.arrangement_invitation_operations where id = p_operation_id
    and organization_id = p_organization_id and actor_membership_id = p_actor_membership_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_operation.arrangement_property_id is distinct from p_property_id or v_operation.payload_fingerprint is distinct from
    encode(extensions.digest(jsonb_build_array(p_email_normalized, 'inquilino', p_property_id)::text, 'sha256'), 'hex') then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  if v_operation.invitation_id is not null then
    select * into v_invitation from public.organization_invitations where id = v_operation.invitation_id and organization_id = p_organization_id;
    return public.spec42_invitation_record(v_invitation) || jsonb_build_object('link_issued', false);
  end if;
  if not exists(select 1 from public.arrangement_properties where id = p_property_id and organization_id = p_organization_id) then raise exception 'NOT_FOUND'; end if;
  if exists(select 1 from public.organization_memberships m join auth.users u on u.id = m.user_id
    where m.organization_id = p_organization_id and m.status = 'active' and lower(btrim(u.email)) = p_email_normalized) then raise exception 'ALREADY_A_MEMBER'; end if;
  if not exists(select 1 from auth.users u where u.id = p_invited_auth_user_id and lower(btrim(u.email)) = p_email_normalized
    and (not p_registration_permitted or (u.email_confirmed_at is null and u.confirmed_at is null and u.last_sign_in_at is null))) then raise exception 'INVITATION_INVALID'; end if;
  if p_expires_at is null or p_expires_at <= now() then raise exception 'INVALID_REQUEST'; end if;
  insert into public.organization_invitations(organization_id, email_normalized, intended_role, token_hash, token_prefix,
    expires_at, invited_by_membership_id, arrangement_property_id, delivery_method, invited_auth_user_id, registration_permitted, link_issued_at)
    values(p_organization_id, p_email_normalized, 'inquilino', p_token_hash, p_token_prefix, p_expires_at,
      p_actor_membership_id, p_property_id, 'share_link', p_invited_auth_user_id, p_registration_permitted, now()) returning * into v_invitation;
  update public.arrangement_invitation_operations set invitation_id = v_invitation.id where id = v_operation.id;
  insert into public.organization_events(organization_id,event_type,actor_type,actor_user_id,actor_membership_id,target_type,target_id,request_id,metadata)
    select p_organization_id, e, 'member', v_actor.user_id, v_actor.id, 'invitation', v_invitation.id, p_request_id,
      jsonb_build_object('intended_role','inquilino','arrangement_property_id',p_property_id)
    from unnest(array['member.invited','member.invitation_link_issued']) e;
  return public.spec42_invitation_record(v_invitation) || jsonb_build_object('link_issued', true);
end; $$;

-- Common incorporation transaction used by both raw-token and handoff adapters.
-- Private: only the adapters that validate the invitation capability can invoke it.
create function public.spec42_accept_property_invitation(p_invitation_id uuid, p_user_id uuid,
  p_verified_email_normalized text, p_request_id text)
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

create or replace function public.spec26_accept_invitation(p_raw_token text, p_user_id uuid, p_verified_email_normalized text, p_request_id text)
returns setof public.organization_memberships language plpgsql security definer set search_path = pg_catalog as $$
declare v_id uuid; v_member public.organization_memberships%rowtype;
begin
  select id into v_id from public.organization_invitations where token_hash = encode(extensions.digest(p_raw_token,'sha256'),'hex');
  if not found then raise exception 'INVITATION_INVALID'; end if;
  v_member := public.spec42_accept_property_invitation(v_id,p_user_id,p_verified_email_normalized,p_request_id);
  update public.invitation_auth_handoffs set invalidated_at = now() where invitation_id = v_id and consumed_at is null and invalidated_at is null;
  return next v_member;
end; $$;

create or replace function public.spec37_accept_invitation_handoff(p_handle_hash text, p_browser_binding_hash text, p_origin_hash text,
  p_user_id uuid, p_verified_email_normalized text, p_request_id text)
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
  v_member := public.spec42_accept_property_invitation(v_invitation.id,p_user_id,p_verified_email_normalized,p_request_id);
  update public.invitation_auth_handoffs set consumed_at = now() where id = v_handoff.id;
  update public.invitation_auth_handoffs set invalidated_at = now() where invitation_id = v_invitation.id
    and id <> v_handoff.id and consumed_at is null and invalidated_at is null;
  return next v_member;
end; $$;

-- Remaining function replacements and grants are appended below in this transaction.
create or replace function public.spec37_create_invitation_handoff(
  p_raw_invitation_token text, p_handle_hash text, p_browser_binding_hash text,
  p_origin_hash text, p_expires_at timestamptz
) returns void language plpgsql security definer set search_path = pg_catalog as $$
declare v_invitation public.organization_invitations%rowtype;
begin
  select * into v_invitation from public.organization_invitations i
    where i.token_hash = encode(extensions.digest(p_raw_invitation_token, 'sha256'), 'hex');
  if not found then raise exception 'INVITATION_INVALID'; end if;
  perform 1 from public.organizations where id = v_invitation.organization_id and status = 'active' for update;
  if not found then raise exception 'INVITATION_INVALID'; end if;
  select * into v_invitation from public.organization_invitations where id = v_invitation.id for update;
  if not found or not public.spec42_invitation_property_valid(v_invitation) or v_invitation.status <> 'pending' or v_invitation.expires_at <= now()
    or not exists (select 1 from public.organizations o where o.id = v_invitation.organization_id and o.status = 'active')
    or p_expires_at is null or p_expires_at <= now()
    then raise exception 'INVITATION_INVALID'; end if;
  update public.invitation_auth_handoffs set invalidated_at = now()
    where invitation_id = v_invitation.id and browser_binding_hash = p_browser_binding_hash
      and consumed_at is null and invalidated_at is null;
  insert into public.invitation_auth_handoffs (organization_id, invitation_id, handle_hash,
    browser_binding_hash, origin_hash, purpose, expires_at, invitation_token_version)
  values (v_invitation.organization_id, v_invitation.id, p_handle_hash, p_browser_binding_hash,
    p_origin_hash, 'invitation_acceptance', least(p_expires_at, now() + interval '15 minutes', v_invitation.expires_at), v_invitation.token_version);
end;
$$;

drop function public.spec26_resolve_invitation(text);
create or replace function public.spec26_resolve_invitation(p_raw_token text)
returns table (
  organization_display_name text, email_masked text, intended_role text, expires_at timestamptz, arrangement_property jsonb
) language sql security definer set search_path = pg_catalog stable as $$
  select coalesce(s.public_display_name, o.display_name),
    left(i.email_normalized, 1) || '***@' || split_part(i.email_normalized, '@', 2),
    i.intended_role, i.expires_at, case when ap.id is not null then jsonb_build_object('id', ap.id, 'name', ap.name) else null end
  from public.organization_invitations i
  join public.organizations o on o.id = i.organization_id and o.status = 'active'
  join public.organization_settings s on s.organization_id = o.id
  left join public.arrangement_properties ap on ap.id = i.arrangement_property_id and ap.organization_id = i.organization_id
  where i.token_hash = encode(extensions.digest(p_raw_token, 'sha256'), 'hex')
    and public.spec42_invitation_property_valid(i) and i.status = 'pending' and i.expires_at > now()
  limit 1
$$;

drop function public.spec37_resolve_invitation_handoff(text,text,text);
create or replace function public.spec37_resolve_invitation_handoff(
  p_handle_hash text, p_browser_binding_hash text, p_origin_hash text
) returns table (organization_display_name text, email_masked text, intended_role text, expires_at timestamptz, arrangement_property jsonb)
language sql security definer set search_path = pg_catalog stable as $$
  select coalesce(s.public_display_name, o.display_name), left(i.email_normalized, 1) || '***@' ||
    split_part(i.email_normalized, '@', 2), i.intended_role, i.expires_at, case when ap.id is not null then jsonb_build_object('id', ap.id, 'name', ap.name) else null end
  from public.invitation_auth_handoffs h
  join public.organization_invitations i on i.id = h.invitation_id and i.organization_id = h.organization_id
  join public.organizations o on o.id = h.organization_id and o.status = 'active'
  join public.organization_settings s on s.organization_id = o.id
  left join public.arrangement_properties ap on ap.id = i.arrangement_property_id and ap.organization_id = i.organization_id
  where h.handle_hash = p_handle_hash and h.browser_binding_hash = p_browser_binding_hash
    and h.origin_hash = p_origin_hash and h.purpose = 'invitation_acceptance'
    and h.invitation_token_version = i.token_version and h.consumed_at is null and h.invalidated_at is null and h.expires_at > now()
    and public.spec42_invitation_property_valid(i) and i.status = 'pending' and i.expires_at > now() limit 1;
$$;

create or replace function public.spec37_resolve_invitation_registration(
  p_handle_hash text, p_browser_binding_hash text, p_origin_hash text
) returns table (auth_user_id uuid, email_normalized text, registration_permitted boolean)
language sql security definer set search_path = pg_catalog stable as $$
  select i.invited_auth_user_id, i.email_normalized, i.registration_permitted
  from public.invitation_auth_handoffs h
  join public.organization_invitations i on i.id = h.invitation_id and i.organization_id = h.organization_id
  join public.organizations o on o.id = h.organization_id and o.status = 'active'
  join auth.users u on u.id = i.invited_auth_user_id and lower(btrim(u.email)) = i.email_normalized
  where h.handle_hash = p_handle_hash and h.browser_binding_hash = p_browser_binding_hash
    and h.origin_hash = p_origin_hash and h.purpose = 'invitation_acceptance'
    and h.consumed_at is null and h.invalidated_at is null and h.expires_at > now()
    and public.spec42_invitation_property_valid(i) and h.invitation_token_version = i.token_version and i.status = 'pending' and i.expires_at > now() limit 1;
$$;

create or replace function public.spec37_complete_invitation_registration(
  p_handle_hash text, p_browser_binding_hash text, p_origin_hash text,
  p_user_id uuid, p_display_name text, p_request_id text
) returns void language plpgsql security definer set search_path = pg_catalog as $$
declare v_handoff public.invitation_auth_handoffs%rowtype;
declare v_invitation public.organization_invitations%rowtype;
begin
  if char_length(btrim(p_display_name)) not between 2 and 120 then raise exception 'INVITATION_INVALID'; end if;
  select * into v_handoff from public.invitation_auth_handoffs where handle_hash = p_handle_hash;
  if not found then raise exception 'INVITATION_INVALID'; end if;
  perform 1 from public.organizations where id = v_handoff.organization_id and status = 'active' for update;
  if not found then raise exception 'INVITATION_INVALID'; end if;
  select * into v_invitation from public.organization_invitations
    where id = v_handoff.invitation_id and organization_id = v_handoff.organization_id for update;
  select * into v_handoff from public.invitation_auth_handoffs where handle_hash = p_handle_hash for update;
  if v_handoff.browser_binding_hash is distinct from p_browser_binding_hash
    or v_handoff.origin_hash is distinct from p_origin_hash or v_handoff.consumed_at is not null
    or v_handoff.invalidated_at is not null or v_handoff.expires_at <= now()
    or v_handoff.purpose <> 'invitation_acceptance' or v_handoff.invitation_token_version <> v_invitation.token_version
    or not public.spec42_invitation_property_valid(v_invitation) or v_invitation.status <> 'pending' or v_invitation.expires_at <= now()
    or not v_invitation.registration_permitted or v_invitation.invited_auth_user_id is distinct from p_user_id
    then raise exception 'INVITATION_INVALID'; end if;
  update public.user_profiles set display_name = btrim(p_display_name), updated_at = now(), version = version + 1
    where user_id = p_user_id;
  if not found then raise exception 'INVITATION_INVALID'; end if;
  update public.organization_invitations set registration_permitted = false, version = version + 1
    where id = v_invitation.id;
  insert into public.organization_events (organization_id, event_type, actor_type, actor_user_id,
    target_type, target_id, request_id, metadata)
  values (v_invitation.organization_id, 'member.invitation_account_activated', 'system', p_user_id,
    'invitation', v_invitation.id, p_request_id, jsonb_build_object('auth_method', 'password'));
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
    p_expires_at, p_actor_membership_id, v_old.arrangement_property_id, v_old.delivery_method, v_old.invited_auth_user_id, v_old.registration_permitted, case when v_old.delivery_method = 'share_link' then now() else null end
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
  return next v_new;
end;
$$;

create or replace function public.spec37_resend_invitation(
  p_organization_id uuid, p_invitation_id uuid, p_replacement_invitation_id uuid,
  p_token_hash text, p_token_prefix text, p_expires_at timestamptz,
  p_actor_membership_id uuid, p_request_id text
) returns setof public.organization_invitations language sql security definer set search_path = pg_catalog as $$
  select * from public.spec26_resend_invitation(p_organization_id,p_invitation_id,p_replacement_invitation_id,
    p_token_hash,p_token_prefix,p_expires_at,p_actor_membership_id,p_request_id);
$$;

create or replace function public.spec26_revoke_invitation(
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
  if not found or v_actor.role not in ('owner', 'admin') then raise exception 'FORBIDDEN'; end if;
  select * into v_invitation from public.organization_invitations
  where id = p_invitation_id and organization_id = p_organization_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_actor.role = 'admin' and v_invitation.intended_role = 'admin' then raise exception 'FORBIDDEN'; end if;
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

create or replace function public.spec37_invalidate_invitation_handoffs(p_invitation_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.organization_invitations where id = p_invitation_id;
  perform 1 from public.organizations where id = v_org for update;
  perform 1 from public.organization_invitations where id = p_invitation_id for update;
  update public.invitation_auth_handoffs set invalidated_at = now() where invitation_id = p_invitation_id
    and consumed_at is null and invalidated_at is null;
end; $$;

create or replace function public.spec26_mutate_membership(
  p_organization_id uuid, p_target_user_id uuid, p_next_role text,
  p_next_status text, p_expected_version integer, p_reason_code text,
  p_actor_membership_id uuid, p_request_id text
) returns setof public.organization_memberships
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_actor public.organization_memberships%rowtype;
  v_target public.organization_memberships%rowtype;
  v_event_type text;
  v_prior_role text;
begin
  perform 1 from public.organizations where id = p_organization_id and status = 'active' for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into v_actor from public.organization_memberships
  where id = p_actor_membership_id and organization_id = p_organization_id and status = 'active' for update;
  select * into v_target from public.organization_memberships
  where organization_id = p_organization_id and user_id = p_target_user_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_actor.id is null or v_actor.role not in ('owner', 'admin') or v_actor.user_id = p_target_user_id then
    raise exception 'FORBIDDEN';
  end if;
  if v_target.version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if v_actor.role = 'admin' and v_target.role in ('owner', 'admin') then raise exception 'FORBIDDEN'; end if;

  if p_next_role is not null then
    if p_next_status is not null or p_next_role not in ('admin', 'member', 'viewer', 'inquilino') then
      raise exception 'FORBIDDEN';
    end if;
    if v_actor.role = 'admin' and p_next_role = 'admin' then raise exception 'FORBIDDEN'; end if;
    if p_next_role = 'inquilino' and v_target.role <> 'inquilino' and v_target.arrangement_property_id is null then raise exception 'PROPERTY_REQUIRED'; end if;
    v_prior_role := v_target.role;
    update public.organization_memberships set role = p_next_role where id = v_target.id
    returning * into v_target;
    v_event_type := 'member.role_changed';
  elsif p_next_status is not null then
    if p_next_status = 'active' and v_target.role = 'inquilino' and v_target.arrangement_property_id is null then raise exception 'PROPERTY_REQUIRED'; end if;
    if p_next_status = 'active' and v_target.status <> 'suspended' then raise exception 'FORBIDDEN'; end if;
    if p_next_status = 'suspended' and v_target.status <> 'active' then raise exception 'FORBIDDEN'; end if;
    if p_next_status = 'removed' and v_target.status not in ('active', 'suspended') then raise exception 'FORBIDDEN'; end if;
    if p_next_status in ('suspended', 'removed')
      and (p_reason_code is null or p_reason_code !~ '^[a-z0-9_]{1,64}$') then
      raise exception 'FORBIDDEN';
    end if;
    update public.organization_memberships set
      status = p_next_status,
      suspended_at = case when p_next_status = 'suspended' then now() else null end,
      suspended_by_user_id = case when p_next_status = 'suspended' then v_actor.user_id else null end,
      suspension_reason_code = case when p_next_status = 'suspended' then p_reason_code else null end,
      removed_at = case when p_next_status = 'removed' then now() else removed_at end,
      removed_by_user_id = case when p_next_status = 'removed' then v_actor.user_id else removed_by_user_id end,
      removal_reason_code = case when p_next_status = 'removed' then p_reason_code else removal_reason_code end
    where id = v_target.id returning * into v_target;
    v_event_type := case p_next_status
      when 'suspended' then 'member.suspended'
      when 'active' then 'member.reactivated'
      else 'member.removed' end;
  else
    raise exception 'FORBIDDEN';
  end if;

  insert into public.organization_events (
    organization_id, event_type, actor_type, actor_user_id, actor_membership_id,
    target_type, target_id, request_id, metadata
  ) values (
    p_organization_id, v_event_type, 'member', v_actor.user_id, v_actor.id,
    'membership', v_target.id, p_request_id,
    jsonb_strip_nulls(jsonb_build_object('prior_role', v_prior_role, 'new_role', p_next_role,
      'new_status', p_next_status, 'reason_code', p_reason_code))
  );
  return next v_target;
end;
$$;

create or replace function public.spec26_transfer_ownership(
  p_organization_id uuid, p_source_owner_membership_id uuid, p_target_user_id uuid,
  p_source_role_after text, p_expected_organization_version integer,
  p_expected_target_membership_version integer, p_request_id text
) returns setof public.organization_memberships
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_organization public.organizations%rowtype;
  v_source public.organization_memberships%rowtype;
  v_target public.organization_memberships%rowtype;
  v_target_prior_role text;
begin
  select * into v_organization from public.organizations
  where id = p_organization_id and status = 'active' for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_source_role_after not in ('owner', 'admin', 'member', 'viewer', 'inquilino') then raise exception 'FORBIDDEN'; end if;
  if exists (
    select 1 from public.organization_events where organization_id = p_organization_id
      and event_type = 'ownership.transferred' and request_id = p_request_id
  ) then
    return query select * from public.organization_memberships
      where organization_id = p_organization_id
        and (id = p_source_owner_membership_id or user_id = p_target_user_id)
      order by id;
    return;
  end if;
  if v_organization.version <> p_expected_organization_version then raise exception 'VERSION_CONFLICT'; end if;
  select * into v_source from public.organization_memberships
  where id = p_source_owner_membership_id and organization_id = p_organization_id for update;
  select * into v_target from public.organization_memberships
  where user_id = p_target_user_id and organization_id = p_organization_id for update;
  if v_source.id is null or v_source.role <> 'owner' or v_source.status <> 'active'
    or v_target.id is null or v_target.status <> 'active' or v_target.id = v_source.id then
    raise exception 'FORBIDDEN';
  end if;
  if v_target.version <> p_expected_target_membership_version then raise exception 'VERSION_CONFLICT'; end if;

  if p_source_role_after = 'inquilino' and v_source.arrangement_property_id is null then raise exception 'PROPERTY_REQUIRED'; end if;
  v_target_prior_role := v_target.role;
  update public.organization_memberships set role = 'owner' where id = v_target.id returning * into v_target;
  update public.organization_memberships set role = p_source_role_after where id = v_source.id returning * into v_source;
  update public.organizations set version = version + 1 where id = p_organization_id;
  insert into public.organization_events (
    organization_id, event_type, actor_type, actor_user_id, actor_membership_id,
    target_type, target_id, request_id, metadata
  ) values (
    p_organization_id, 'ownership.transferred', 'member', v_source.user_id, v_source.id,
    'membership', v_target.id, p_request_id,
    jsonb_build_object('target_prior_role', v_target_prior_role, 'source_role_after', p_source_role_after)
  );
  return next v_source;
  return next v_target;
end;
$$;

revoke all on function public.spec42_guard_membership_property(), public.spec42_guard_invitation_property(),
  public.spec42_invitation_property_valid(public.organization_invitations), public.spec42_invitation_record(public.organization_invitations),
  public.spec42_accept_property_invitation(uuid,uuid,text,text) from public, anon, authenticated, service_role;
revoke all on function public.spec42_prepare_property_invitation(uuid,uuid,uuid,text,text),
  public.spec42_create_manual_invitation(uuid,uuid,uuid,uuid,text,text,text,timestamptz,uuid,boolean,text),
  public.spec26_resolve_invitation(text), public.spec37_resolve_invitation_handoff(text,text,text) from public, anon, authenticated;
grant execute on function public.spec42_prepare_property_invitation(uuid,uuid,uuid,text,text),
  public.spec42_create_manual_invitation(uuid,uuid,uuid,uuid,text,text,text,timestamptz,uuid,boolean,text),
  public.spec26_resolve_invitation(text), public.spec37_resolve_invitation_handoff(text,text,text) to service_role;
-- Lost-response recovery is read-only and bound to the same identity and consumed handoff.
-- It cannot reactivate a subsequently suspended membership or restore a changed role/property.
create function public.spec42_recover_accepted_handoff(p_handle_hash text, p_browser_binding_hash text, p_origin_hash text,
  p_user_id uuid, p_verified_email_normalized text)
returns setof public.organization_memberships language sql stable security definer set search_path = pg_catalog as $$
  select m.* from public.invitation_auth_handoffs h
  join public.organization_invitations i on i.id = h.invitation_id and i.organization_id = h.organization_id
  join public.organizations o on o.id = i.organization_id and o.status = 'active'
  join public.organization_memberships m on m.id = i.accepted_membership_id and m.organization_id = i.organization_id
  where h.handle_hash = p_handle_hash and h.browser_binding_hash = p_browser_binding_hash and h.origin_hash = p_origin_hash
    and h.consumed_at is not null and h.invalidated_at is null and h.purpose = 'invitation_acceptance'
    and h.invitation_token_version = i.token_version and h.expires_at > now()
    and i.status = 'accepted' and i.accepted_by_user_id = p_user_id and i.email_normalized = lower(btrim(p_verified_email_normalized))
    and m.user_id = p_user_id and m.status = 'active' and m.role = i.intended_role and m.invitation_id = i.id
    and (i.intended_role <> 'inquilino' or m.arrangement_property_id = i.arrangement_property_id)
    and public.spec42_invitation_property_valid(i);
$$;
revoke all on function public.spec42_recover_accepted_handoff(text,text,text,uuid,text) from public, anon, authenticated;
grant execute on function public.spec42_recover_accepted_handoff(text,text,text,uuid,text) to service_role;
commit;
