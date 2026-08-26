-- SPEC-37 / PROD-SPEC-03: invitation delivery evidence and raw-token-free auth handoff.
-- This migration sends no email, creates no user/membership, and stores no raw token or provider secret.
create extension if not exists pgcrypto;

alter table public.organization_invitations drop constraint organization_invitations_delivery_state_check;
alter table public.organization_invitations add constraint organization_invitations_delivery_state_check
  check (delivery_state in ('pending','accepted_by_provider','delivered','failed','bounced','complained'));

create table public.invitation_delivery_attempts (
  id uuid primary key,
  organization_id uuid not null,
  invitation_id uuid not null,
  attempt_number integer not null check (attempt_number between 1 and 20),
  idempotency_key text not null unique check (char_length(idempotency_key) between 8 and 160),
  provider text not null check (provider in ('resend','capture')),
  template_version text not null check (template_version ~ '^v[1-9][0-9]{0,5}$'),
  locale text not null check (locale ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  state text not null default 'processing' check (state in (
    'processing','accepted_by_provider','rejected','ambiguous','delivered','bounced','complained')),
  provider_reference_hash text unique check (provider_reference_hash is null or provider_reference_hash ~ '^[0-9a-f]{64}$'),
  safe_error_code text check (safe_error_code is null or safe_error_code ~ '^[A-Z0-9_]{1,64}$'),
  request_id text not null check (request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  check (state <> 'accepted_by_provider' or provider_reference_hash is not null),
  check (state not in ('rejected','ambiguous') or safe_error_code is not null),
  unique (invitation_id, attempt_number),
  foreign key (invitation_id, organization_id)
    references public.organization_invitations(id, organization_id) on delete restrict
);
create index invitation_delivery_attempts_tenant_idx
  on public.invitation_delivery_attempts (organization_id, invitation_id, started_at desc);

create table public.invitation_auth_handoffs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  invitation_id uuid not null,
  handle_hash text not null unique check (handle_hash ~ '^[0-9a-f]{64}$'),
  browser_binding_hash text not null check (browser_binding_hash ~ '^[0-9a-f]{64}$'),
  origin_hash text not null check (origin_hash ~ '^[0-9a-f]{64}$'),
  purpose text not null check (purpose = 'invitation_acceptance'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  invalidated_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at and expires_at <= created_at + interval '15 minutes'),
  check (consumed_at is null or invalidated_at is null),
  foreign key (invitation_id, organization_id)
    references public.organization_invitations(id, organization_id) on delete restrict
);
create unique index invitation_auth_handoffs_one_active_idx
  on public.invitation_auth_handoffs (invitation_id, browser_binding_hash)
  where consumed_at is null and invalidated_at is null;

create table public.invitation_email_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id_hash text not null unique check (event_id_hash ~ '^[0-9a-f]{64}$'),
  provider text not null check (provider = 'resend'),
  event_type text not null check (event_type in ('email.delivered','email.bounced','email.complained')),
  provider_reference_hash text not null check (provider_reference_hash ~ '^[0-9a-f]{64}$'),
  delivery_attempt_id uuid references public.invitation_delivery_attempts(id) on delete restrict,
  received_at timestamptz not null default now()
);

create or replace function public.spec37_prevent_evidence_mutation()
returns trigger language plpgsql security invoker set search_path = pg_catalog as $$
begin raise exception 'APPEND_ONLY_INVITATION_EVIDENCE'; end;
$$;
create trigger invitation_delivery_attempts_append_only before delete on public.invitation_delivery_attempts
  for each row execute function public.spec37_prevent_evidence_mutation();
create trigger invitation_email_webhook_events_append_only before update or delete on public.invitation_email_webhook_events
  for each row execute function public.spec37_prevent_evidence_mutation();

create or replace function public.spec37_create_invitation_handoff(
  p_raw_invitation_token text, p_handle_hash text, p_browser_binding_hash text,
  p_origin_hash text, p_expires_at timestamptz
) returns void language plpgsql security definer set search_path = pg_catalog as $$
declare v_invitation public.organization_invitations%rowtype;
begin
  select * into v_invitation from public.organization_invitations i
    where i.token_hash = encode(public.digest(p_raw_invitation_token, 'sha256'), 'hex') for update;
  if not found or v_invitation.status <> 'pending' or v_invitation.expires_at <= now()
    or not exists (select 1 from public.organizations o where o.id = v_invitation.organization_id and o.status = 'active')
    or p_expires_at > least(now() + interval '15 minutes', v_invitation.expires_at)
    then raise exception 'INVITATION_INVALID'; end if;
  update public.invitation_auth_handoffs set invalidated_at = now()
    where invitation_id = v_invitation.id and browser_binding_hash = p_browser_binding_hash
      and consumed_at is null and invalidated_at is null;
  insert into public.invitation_auth_handoffs (organization_id, invitation_id, handle_hash,
    browser_binding_hash, origin_hash, purpose, expires_at)
  values (v_invitation.organization_id, v_invitation.id, p_handle_hash, p_browser_binding_hash,
    p_origin_hash, 'invitation_acceptance', p_expires_at);
end;
$$;

create or replace function public.spec37_resolve_invitation_handoff(
  p_handle_hash text, p_browser_binding_hash text, p_origin_hash text
) returns table (organization_display_name text, email_masked text, intended_role text, expires_at timestamptz)
language sql security definer set search_path = pg_catalog stable as $$
  select coalesce(s.public_display_name, o.display_name), left(i.email_normalized, 1) || '***@' ||
    split_part(i.email_normalized, '@', 2), i.intended_role, i.expires_at
  from public.invitation_auth_handoffs h
  join public.organization_invitations i on i.id = h.invitation_id and i.organization_id = h.organization_id
  join public.organizations o on o.id = h.organization_id and o.status = 'active'
  join public.organization_settings s on s.organization_id = o.id
  where h.handle_hash = p_handle_hash and h.browser_binding_hash = p_browser_binding_hash
    and h.origin_hash = p_origin_hash and h.purpose = 'invitation_acceptance'
    and h.consumed_at is null and h.invalidated_at is null and h.expires_at > now()
    and i.status = 'pending' and i.expires_at > now() limit 1;
$$;

create or replace function public.spec37_accept_invitation_handoff(
  p_handle_hash text, p_browser_binding_hash text, p_origin_hash text,
  p_user_id uuid, p_verified_email_normalized text, p_request_id text
) returns setof public.organization_memberships
language plpgsql security definer set search_path = pg_catalog as $$
declare v_handoff public.invitation_auth_handoffs%rowtype;
declare v_invitation public.organization_invitations%rowtype;
declare v_membership public.organization_memberships%rowtype;
begin
  select * into v_handoff from public.invitation_auth_handoffs h where h.handle_hash = p_handle_hash for update;
  if not found or v_handoff.browser_binding_hash <> p_browser_binding_hash or v_handoff.origin_hash <> p_origin_hash
    or v_handoff.consumed_at is not null or v_handoff.invalidated_at is not null or v_handoff.expires_at <= now()
    then raise exception 'INVITATION_INVALID'; end if;
  perform 1 from public.organizations where id = v_handoff.organization_id and status = 'active' for update;
  if not found then raise exception 'INVITATION_INVALID'; end if;
  select * into v_invitation from public.organization_invitations i
    where i.id = v_handoff.invitation_id and i.organization_id = v_handoff.organization_id for update;
  if not found or v_invitation.status <> 'pending' or v_invitation.expires_at <= now()
    or lower(btrim(p_verified_email_normalized)) <> v_invitation.email_normalized
    or not exists (select 1 from public.user_profiles p where p.user_id = p_user_id)
    then raise exception 'INVITATION_INVALID'; end if;
  insert into public.organization_memberships (organization_id, user_id, role, status, invitation_id, invited_at, joined_at)
    values (v_invitation.organization_id, p_user_id, v_invitation.intended_role, 'active',
      v_invitation.id, v_invitation.created_at, now())
    on conflict (organization_id, user_id) do update set role = excluded.role, status = 'active',
      invitation_id = excluded.invitation_id, invited_at = excluded.invited_at, joined_at = now(),
      suspended_at = null, suspended_by_user_id = null, suspension_reason_code = null,
      removed_at = null, removed_by_user_id = null, removal_reason_code = null
    where organization_memberships.status in ('suspended','removed') returning * into v_membership;
  if not found then raise exception 'INVITATION_INVALID'; end if;
  update public.organization_invitations set status = 'accepted', accepted_at = now(),
    accepted_by_user_id = p_user_id, accepted_membership_id = v_membership.id, version = version + 1
    where id = v_invitation.id;
  update public.invitation_auth_handoffs set consumed_at = now() where id = v_handoff.id;
  update public.invitation_auth_handoffs set invalidated_at = now() where invitation_id = v_invitation.id
    and id <> v_handoff.id and consumed_at is null and invalidated_at is null;
  insert into public.organization_events (organization_id, event_type, actor_type, actor_user_id,
    actor_membership_id, target_type, target_id, request_id, metadata)
    values (v_invitation.organization_id, 'member.invitation_accepted', 'member', p_user_id,
      v_membership.id, 'membership', v_membership.id, p_request_id,
      jsonb_build_object('role', v_membership.role, 'context_refresh_required', true));
  return next v_membership;
end;
$$;

create or replace function public.spec37_begin_invitation_delivery(
  p_attempt_id uuid, p_invitation_id uuid, p_provider text, p_template_version text,
  p_locale text, p_idempotency_key text, p_request_id text
) returns integer language plpgsql security definer set search_path = pg_catalog as $$
declare v_invitation public.organization_invitations%rowtype; declare v_number integer;
begin
  select * into v_invitation from public.organization_invitations where id = p_invitation_id for update;
  if not found or v_invitation.status <> 'pending' or v_invitation.expires_at <= now() then raise exception 'INVITATION_INVALID'; end if;
  select coalesce(max(attempt_number), 0) + 1 into v_number from public.invitation_delivery_attempts
    where invitation_id = p_invitation_id;
  if v_number > 20 then raise exception 'RATE_LIMITED'; end if;
  insert into public.invitation_delivery_attempts (id, organization_id, invitation_id, attempt_number,
    idempotency_key, provider, template_version, locale, request_id)
    values (p_attempt_id, v_invitation.organization_id, p_invitation_id, v_number,
      p_idempotency_key, p_provider, p_template_version, p_locale, p_request_id);
  return v_number;
end;
$$;

create or replace function public.spec37_complete_invitation_delivery(
  p_attempt_id uuid, p_state text, p_provider_reference_hash text, p_safe_error_code text
) returns void language plpgsql security definer set search_path = pg_catalog as $$
declare v_attempt public.invitation_delivery_attempts%rowtype; declare v_delivery_state text;
begin
  select * into v_attempt from public.invitation_delivery_attempts where id = p_attempt_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_attempt.state <> 'processing' then return; end if;
  if p_state not in ('accepted_by_provider','rejected','ambiguous') then raise exception 'FORBIDDEN'; end if;
  update public.invitation_delivery_attempts set state = p_state,
    provider_reference_hash = p_provider_reference_hash, safe_error_code = p_safe_error_code,
    completed_at = now() where id = p_attempt_id;
  v_delivery_state := case when p_state = 'accepted_by_provider' then 'accepted_by_provider'
    when p_state = 'rejected' then 'failed' else 'pending' end;
  update public.organization_invitations set delivery_state = v_delivery_state,
    last_delivery_error_code = case when p_state = 'accepted_by_provider' then null else p_safe_error_code end,
    last_sent_at = now(), send_count = send_count + 1, version = version + 1
    where id = v_attempt.invitation_id and status = 'pending';
end;
$$;

create or replace function public.spec37_record_invitation_webhook(
  p_event_id_hash text, p_event_type text, p_provider_reference_hash text
) returns boolean language plpgsql security definer set search_path = pg_catalog as $$
declare v_attempt public.invitation_delivery_attempts%rowtype; declare v_state text;
begin
  if p_event_type not in ('email.delivered','email.bounced','email.complained') then raise exception 'FORBIDDEN'; end if;
  if exists (select 1 from public.invitation_email_webhook_events where event_id_hash = p_event_id_hash) then return false; end if;
  select * into v_attempt from public.invitation_delivery_attempts
    where provider_reference_hash = p_provider_reference_hash order by started_at desc limit 1 for update;
  v_state := case p_event_type when 'email.delivered' then 'delivered'
    when 'email.bounced' then 'bounced' else 'complained' end;
  insert into public.invitation_email_webhook_events (event_id_hash, provider, event_type,
    provider_reference_hash, delivery_attempt_id) values (p_event_id_hash, 'resend', p_event_type,
    p_provider_reference_hash, v_attempt.id);
  if v_attempt.id is not null then
    update public.invitation_delivery_attempts set state = v_state where id = v_attempt.id;
    update public.organization_invitations set delivery_state = v_state, version = version + 1
      where id = v_attempt.invitation_id and status = 'pending';
  end if;
  return true;
end;
$$;

create or replace function public.spec37_invalidate_invitation_handoffs(p_invitation_id uuid)
returns void language sql security definer set search_path = pg_catalog as $$
  update public.invitation_auth_handoffs set invalidated_at = now() where invitation_id = p_invitation_id
    and consumed_at is null and invalidated_at is null;
$$;

create or replace function public.spec37_resend_invitation(
  p_organization_id uuid, p_invitation_id uuid, p_replacement_invitation_id uuid,
  p_token_hash text, p_token_prefix text, p_expires_at timestamptz,
  p_actor_membership_id uuid, p_request_id text
) returns setof public.organization_invitations language plpgsql security definer set search_path = pg_catalog as $$
begin
  update public.invitation_auth_handoffs set invalidated_at = now() where invitation_id = p_invitation_id
    and consumed_at is null and invalidated_at is null;
  return query select * from public.spec26_resend_invitation(p_organization_id, p_invitation_id,
    p_replacement_invitation_id, p_token_hash, p_token_prefix, p_expires_at,
    p_actor_membership_id, p_request_id);
end;
$$;

create or replace function public.spec37_revoke_invitation(
  p_organization_id uuid, p_invitation_id uuid, p_actor_membership_id uuid, p_request_id text
) returns setof public.organization_invitations language plpgsql security definer set search_path = pg_catalog as $$
begin
  update public.invitation_auth_handoffs set invalidated_at = now() where invitation_id = p_invitation_id
    and consumed_at is null and invalidated_at is null;
  return query select * from public.spec26_revoke_invitation(p_organization_id, p_invitation_id,
    p_actor_membership_id, p_request_id);
end;
$$;

create or replace function public.spec37_list_members(p_organization_id uuid, p_actor_membership_id uuid,
  p_after_id uuid, p_limit integer)
returns table (user_id uuid, display_name text, email_masked text, role text, status text,
  joined_at timestamptz, version integer, cursor_id uuid) language plpgsql security definer set search_path = pg_catalog as $$
begin
  if p_limit not between 1 and 100 or not exists (select 1 from public.organization_memberships
    where id = p_actor_membership_id and organization_id = p_organization_id and status = 'active')
    then raise exception 'FORBIDDEN'; end if;
  return query select m.user_id, p.display_name, left(u.email,1) || '***@' || split_part(u.email,'@',2),
    m.role, m.status, m.joined_at, m.version, m.id from public.organization_memberships m
    join public.user_profiles p on p.user_id = m.user_id join auth.users u on u.id = m.user_id
    where m.organization_id = p_organization_id and (p_after_id is null or m.id > p_after_id)
    order by m.id limit p_limit;
end;
$$;

create or replace function public.spec37_list_invitations(p_organization_id uuid, p_actor_membership_id uuid,
  p_after_id uuid, p_limit integer)
returns table (invitation_id uuid, email_masked text, intended_role text, status text,
  expires_at timestamptz, delivery_state text, last_attempt_at timestamptz, attempt_count integer,
  next_action text, version integer, cursor_id uuid) language plpgsql security definer set search_path = pg_catalog as $$
begin
  if p_limit not between 1 and 100 or not exists (select 1 from public.organization_memberships
    where id = p_actor_membership_id and organization_id = p_organization_id and status = 'active'
      and role in ('owner','admin')) then raise exception 'FORBIDDEN'; end if;
  return query select i.id, left(i.email_normalized,1) || '***@' || split_part(i.email_normalized,'@',2),
    i.intended_role, case when i.status = 'pending' and i.expires_at <= now() then 'expired' else i.status end,
    i.expires_at, i.delivery_state, i.last_sent_at, i.send_count,
    case when i.status = 'pending' and i.expires_at > now() then 'resend_or_revoke' else 'none' end, i.version, i.id
    from public.organization_invitations i where i.organization_id = p_organization_id
      and (p_after_id is null or i.id > p_after_id) order by i.id limit p_limit;
end;
$$;

alter table public.invitation_delivery_attempts enable row level security;
alter table public.invitation_delivery_attempts force row level security;
alter table public.invitation_auth_handoffs enable row level security;
alter table public.invitation_auth_handoffs force row level security;
alter table public.invitation_email_webhook_events enable row level security;
alter table public.invitation_email_webhook_events force row level security;
revoke all on public.invitation_delivery_attempts, public.invitation_auth_handoffs,
  public.invitation_email_webhook_events from public, anon, authenticated;
revoke all on function public.spec37_create_invitation_handoff(text,text,text,text,timestamptz),
  public.spec37_resolve_invitation_handoff(text,text,text),
  public.spec37_accept_invitation_handoff(text,text,text,uuid,text,text),
  public.spec37_begin_invitation_delivery(uuid,uuid,text,text,text,text,text),
  public.spec37_complete_invitation_delivery(uuid,text,text,text),
  public.spec37_record_invitation_webhook(text,text,text),
  public.spec37_invalidate_invitation_handoffs(uuid),
  public.spec37_resend_invitation(uuid,uuid,uuid,text,text,timestamptz,uuid,text),
  public.spec37_revoke_invitation(uuid,uuid,uuid,text),
  public.spec37_list_members(uuid,uuid,uuid,integer),
  public.spec37_list_invitations(uuid,uuid,uuid,integer) from public, anon, authenticated;
grant select, insert, update on public.invitation_delivery_attempts, public.invitation_auth_handoffs to service_role;
grant select, insert on public.invitation_email_webhook_events to service_role;
grant execute on function public.spec37_create_invitation_handoff(text,text,text,text,timestamptz),
  public.spec37_resolve_invitation_handoff(text,text,text),
  public.spec37_accept_invitation_handoff(text,text,text,uuid,text,text),
  public.spec37_begin_invitation_delivery(uuid,uuid,text,text,text,text,text),
  public.spec37_complete_invitation_delivery(uuid,text,text,text),
  public.spec37_record_invitation_webhook(text,text,text),
  public.spec37_invalidate_invitation_handoffs(uuid),
  public.spec37_resend_invitation(uuid,uuid,uuid,text,text,timestamptz,uuid,text),
  public.spec37_revoke_invitation(uuid,uuid,uuid,text),
  public.spec37_list_members(uuid,uuid,uuid,integer),
  public.spec37_list_invitations(uuid,uuid,uuid,integer) to service_role;
