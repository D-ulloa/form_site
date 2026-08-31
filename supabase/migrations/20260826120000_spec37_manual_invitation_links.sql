-- SPEC-37 follow-up: one-time manual invitation links and invitation-scoped registration.
-- Raw invitation links remain response-only; the database stores hashes and safe issuance metadata.

alter table public.organization_invitations
  add column delivery_method text not null default 'email'
    check (delivery_method in ('email', 'share_link')),
  add column invited_auth_user_id uuid references auth.users(id) on delete restrict,
  add column registration_permitted boolean not null default false,
  add column link_issued_at timestamptz;

create or replace function public.spec37_create_manual_invitation(
  p_invitation_id uuid, p_organization_id uuid, p_email_normalized text,
  p_intended_role text, p_token_hash text, p_token_prefix text,
  p_expires_at timestamptz, p_invited_by_membership_id uuid, p_request_id text,
  p_invited_auth_user_id uuid, p_registration_permitted boolean
) returns setof public.organization_invitations
language plpgsql security definer set search_path = pg_catalog as $$
declare v_invitation public.organization_invitations%rowtype;
begin
  if not exists (
    select 1 from auth.users u where u.id = p_invited_auth_user_id
      and lower(btrim(u.email)) = p_email_normalized
      and (not p_registration_permitted
        or (u.email_confirmed_at is null and u.confirmed_at is null and u.last_sign_in_at is null))
  ) then raise exception 'INVITATION_INVALID'; end if;

  select * into v_invitation from public.spec26_create_invitation(
    p_invitation_id, p_organization_id, p_email_normalized, p_intended_role,
    p_token_hash, p_token_prefix, p_expires_at, p_invited_by_membership_id, p_request_id
  );

  update public.organization_invitations set
    delivery_method = 'share_link', invited_auth_user_id = p_invited_auth_user_id,
    registration_permitted = p_registration_permitted, link_issued_at = now(),
    delivery_state = 'pending', version = version + 1
  where id = v_invitation.id returning * into v_invitation;

  insert into public.organization_events (
    organization_id, event_type, actor_type, actor_user_id, actor_membership_id,
    target_type, target_id, request_id, metadata
  ) select p_organization_id, 'member.invitation_link_issued', 'member', m.user_id, m.id,
    'invitation', p_invitation_id, p_request_id,
    jsonb_build_object('intended_role', p_intended_role, 'expires_at', p_expires_at)
  from public.organization_memberships m where m.id = p_invited_by_membership_id;

  return next v_invitation;
end;
$$;

create or replace function public.spec37_resend_invitation(
  p_organization_id uuid, p_invitation_id uuid, p_replacement_invitation_id uuid,
  p_token_hash text, p_token_prefix text, p_expires_at timestamptz,
  p_actor_membership_id uuid, p_request_id text
) returns setof public.organization_invitations language plpgsql security definer set search_path = pg_catalog as $$
declare v_old public.organization_invitations%rowtype;
declare v_new public.organization_invitations%rowtype;
begin
  select * into v_old from public.organization_invitations
    where id = p_invitation_id and organization_id = p_organization_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  update public.invitation_auth_handoffs set invalidated_at = now() where invitation_id = p_invitation_id
    and consumed_at is null and invalidated_at is null;
  select * into v_new from public.spec26_resend_invitation(p_organization_id, p_invitation_id,
    p_replacement_invitation_id, p_token_hash, p_token_prefix, p_expires_at,
    p_actor_membership_id, p_request_id);
  update public.organization_invitations set
    delivery_method = v_old.delivery_method,
    invited_auth_user_id = v_old.invited_auth_user_id,
    registration_permitted = v_old.registration_permitted,
    link_issued_at = case when v_old.delivery_method = 'share_link' then now() else null end,
    version = version + 1
  where id = v_new.id returning * into v_new;
  return next v_new;
end;
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
    and i.status = 'pending' and i.expires_at > now() limit 1;
$$;

create or replace function public.spec37_complete_invitation_registration(
  p_handle_hash text, p_browser_binding_hash text, p_origin_hash text,
  p_user_id uuid, p_display_name text, p_request_id text
) returns void language plpgsql security definer set search_path = pg_catalog as $$
declare v_handoff public.invitation_auth_handoffs%rowtype;
declare v_invitation public.organization_invitations%rowtype;
begin
  if char_length(btrim(p_display_name)) not between 2 and 120 then raise exception 'INVITATION_INVALID'; end if;
  select * into v_handoff from public.invitation_auth_handoffs
    where handle_hash = p_handle_hash for update;
  if not found or v_handoff.browser_binding_hash <> p_browser_binding_hash
    or v_handoff.origin_hash <> p_origin_hash or v_handoff.consumed_at is not null
    or v_handoff.invalidated_at is not null or v_handoff.expires_at <= now()
    then raise exception 'INVITATION_INVALID'; end if;
  select * into v_invitation from public.organization_invitations
    where id = v_handoff.invitation_id and organization_id = v_handoff.organization_id for update;
  if not found or v_invitation.status <> 'pending' or v_invitation.expires_at <= now()
    or not v_invitation.registration_permitted or v_invitation.invited_auth_user_id <> p_user_id
    then raise exception 'INVITATION_INVALID'; end if;
  update public.user_profiles set display_name = btrim(p_display_name), updated_at = now(), version = version + 1
    where user_id = p_user_id;
  if not found then raise exception 'INVITATION_INVALID'; end if;
  update public.organization_invitations set registration_permitted = false, version = version + 1
    where id = v_invitation.id;
  insert into public.organization_events (organization_id, event_type, actor_type, actor_user_id,
    target_type, target_id, request_id, metadata)
  values (v_invitation.organization_id, 'member.invitation_account_activated', 'member', p_user_id,
    'invitation', v_invitation.id, p_request_id, jsonb_build_object('auth_method', 'password'));
end;
$$;

drop function public.spec37_list_invitations(uuid,uuid,uuid,integer);
create function public.spec37_list_invitations(p_organization_id uuid, p_actor_membership_id uuid,
  p_after_id uuid, p_limit integer)
returns table (invitation_id uuid, email_masked text, intended_role text, status text,
  expires_at timestamptz, delivery_state text, delivery_method text, link_issued_at timestamptz,
  last_attempt_at timestamptz, attempt_count integer, next_action text, version integer, cursor_id uuid)
language plpgsql security definer set search_path = pg_catalog as $$
begin
  if p_limit not between 1 and 100 or not exists (select 1 from public.organization_memberships
    where id = p_actor_membership_id and organization_id = p_organization_id and status = 'active'
      and role in ('owner','admin')) then raise exception 'FORBIDDEN'; end if;
  return query select i.id, left(i.email_normalized,1) || '***@' || split_part(i.email_normalized,'@',2),
    i.intended_role, case when i.status = 'pending' and i.expires_at <= now() then 'expired' else i.status end,
    i.expires_at, i.delivery_state, i.delivery_method, i.link_issued_at, i.last_sent_at, i.send_count,
    case when i.status = 'pending' and i.expires_at > now() then
      case when i.delivery_method = 'share_link' then 'rotate_or_revoke' else 'resend_or_revoke' end
      else 'none' end, i.version, i.id
    from public.organization_invitations i where i.organization_id = p_organization_id
      and (p_after_id is null or i.id > p_after_id) order by i.id limit p_limit;
end;
$$;

revoke all on function public.spec37_create_manual_invitation(uuid,uuid,text,text,text,text,timestamptz,uuid,text,uuid,boolean),
  public.spec37_resolve_invitation_registration(text,text,text),
  public.spec37_complete_invitation_registration(text,text,text,uuid,text,text),
  public.spec37_list_invitations(uuid,uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.spec37_create_manual_invitation(uuid,uuid,text,text,text,text,timestamptz,uuid,text,uuid,boolean),
  public.spec37_resolve_invitation_registration(text,text,text),
  public.spec37_complete_invitation_registration(text,text,text,uuid,text,text),
  public.spec37_list_invitations(uuid,uuid,uuid,integer) to service_role;
