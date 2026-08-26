-- SPEC-35 / PROD-SPEC-01: resumable Auth identity and profile provisioning evidence.
-- This migration creates no Auth user, membership, organization, role, operator, or legacy grant.
create extension if not exists pgcrypto;

create table public.identity_provisioning_operations (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique check (char_length(idempotency_key) between 8 and 160),
  payload_fingerprint text not null check (payload_fingerprint ~ '^[0-9a-f]{64}$'),
  email_fingerprint text not null check (email_fingerprint ~ '^[0-9a-f]{64}$'),
  purpose text not null check (purpose in ('initial_owner','organization_invitee')),
  state text not null default 'processing' check (state in ('processing','provider_ambiguous','completed','blocked')),
  outcome text check (outcome is null or outcome in (
    'existing_active','existing_activation_required','created_activation_required',
    'reconciled_after_ambiguity','blocked_ambiguous','blocked_ineligible'
  )),
  auth_user_id uuid references auth.users(id) on delete restrict,
  profile_state text check (profile_state is null or profile_state in ('created','existing')),
  activation_required boolean,
  provider_ambiguity_phase text check (provider_ambiguity_phase is null or provider_ambiguity_phase in ('resolve','create')),
  provider_reconciliation_reference uuid,
  actor_type text not null check (actor_type in ('platform_operator','organization_invitation')),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_membership_id uuid references public.organization_memberships(id) on delete restrict,
  step_up_session_id uuid references public.app_sessions(id) on delete restrict,
  created_request_id text not null check (created_request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'),
  last_request_id text not null check (last_request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'),
  attempts integer not null default 1 check (attempts between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  version integer not null default 1 check (version > 0),
  check ((actor_type = 'organization_invitation') = (actor_membership_id is not null)),
  check ((actor_type = 'platform_operator') = (step_up_session_id is not null)),
  check ((state in ('completed','blocked')) = (completed_at is not null)),
  check (state not in ('completed','blocked') or outcome is not null),
  check (state <> 'completed' or (auth_user_id is not null and profile_state is not null)),
  check (state <> 'blocked' or outcome in ('blocked_ambiguous','blocked_ineligible'))
);
create unique index identity_provisioning_one_active_email_idx
  on public.identity_provisioning_operations (email_fingerprint)
  where state in ('processing','provider_ambiguous');
create index identity_provisioning_user_idx on public.identity_provisioning_operations
  (auth_user_id, created_at desc) where auth_user_id is not null;

create table public.identity_provisioning_events (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.identity_provisioning_operations(id) on delete restrict,
  request_id text not null check (request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'),
  actor_type text not null check (actor_type in ('platform_operator','organization_invitation')),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_membership_id uuid references public.organization_memberships(id) on delete restrict,
  action text not null check (action in (
    'identity.provisioning_claimed','identity.provider_ambiguous',
    'identity.provisioning_completed','identity.provisioning_blocked',
    'identity.provisioning_replayed','identity.provisioning_busy'
  )),
  outcome text not null check (outcome in ('succeeded','failed','blocked')),
  reason_code text check (reason_code is null or reason_code ~ '^[A-Z0-9_]{1,64}$'),
  email_fingerprint text not null check (email_fingerprint ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz not null default now(),
  check ((actor_type = 'organization_invitation') = (actor_membership_id is not null))
);
create index identity_provisioning_events_timeline_idx on public.identity_provisioning_events
  (operation_id, occurred_at, id);

create or replace function public.spec35_prevent_provisioning_event_mutation()
returns trigger language plpgsql security invoker set search_path = pg_catalog as $$
begin raise exception 'APPEND_ONLY_IDENTITY_PROVISIONING_EVENT'; end;
$$;
create trigger identity_provisioning_events_append_only before update or delete
  on public.identity_provisioning_events for each row
  execute function public.spec35_prevent_provisioning_event_mutation();

create or replace function public.spec35_claim_identity_provisioning(
  p_idempotency_key text, p_payload_fingerprint text, p_email_fingerprint text,
  p_purpose text, p_request_id text, p_actor_type text, p_actor_user_id uuid,
  p_actor_membership_id uuid, p_step_up_session_id uuid
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
  if p_actor_type = 'platform_operator' then
    if not exists (select 1 from public.platform_operators
      where user_id = p_actor_user_id and status = 'active' and mfa_required)
      or not exists (select 1 from public.app_sessions where id = p_step_up_session_id
        and user_id = p_actor_user_id and assurance_level = 'aal2' and revoked_at is null
        and absolute_expires_at > now() and (idle_expires_at is null or idle_expires_at > now())) then
      raise exception 'FORBIDDEN';
    end if;
  elsif p_purpose <> 'organization_invitee' or not exists (
    select 1 from public.organization_memberships where id = p_actor_membership_id
      and user_id = p_actor_user_id and status = 'active' and role in ('owner','admin')
  ) then raise exception 'FORBIDDEN';
  end if;
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

create or replace function public.spec35_mark_provider_ambiguous(
  p_operation_id uuid, p_ambiguity_phase text, p_request_id text
) returns void language plpgsql security definer set search_path = pg_catalog as $$
declare v_operation public.identity_provisioning_operations%rowtype;
begin
  select o.* into v_operation from public.identity_provisioning_operations o where o.id = p_operation_id for update;
  if not found or v_operation.state in ('completed','blocked') then raise exception 'VERSION_CONFLICT'; end if;
  if p_ambiguity_phase not in ('resolve','create') then raise exception 'INVALID_AMBIGUITY_PHASE'; end if;
  update public.identity_provisioning_operations set state = 'provider_ambiguous',
    provider_ambiguity_phase = p_ambiguity_phase,
    last_request_id = p_request_id, updated_at = now(), version = version + 1 where id = p_operation_id;
  insert into public.identity_provisioning_events (
    operation_id, request_id, actor_type, actor_user_id, actor_membership_id,
    action, outcome, reason_code, email_fingerprint
  ) values (v_operation.id, p_request_id, v_operation.actor_type, v_operation.actor_user_id,
    v_operation.actor_membership_id, 'identity.provider_ambiguous', 'failed',
    'IDENTITY_PROVIDER_UNAVAILABLE', v_operation.email_fingerprint);
end;
$$;

create or replace function public.spec35_complete_identity_provisioning(
  p_operation_id uuid, p_user_id uuid, p_display_name text, p_locale text, p_time_zone text,
  p_outcome text, p_activation_required boolean, p_reconciliation_reference uuid,
  p_request_id text
) returns table (
  operation_id uuid, claim_state text, state text, outcome text, auth_user_id uuid,
  profile_state text, activation_required boolean, provider_reconciliation_reference text,
  provider_ambiguity_phase text
) language plpgsql security definer set search_path = pg_catalog as $$
declare v_operation public.identity_provisioning_operations%rowtype;
declare v_profile_state text;
begin
  select o.* into v_operation from public.identity_provisioning_operations o where o.id = p_operation_id for update;
  if not found or v_operation.state in ('completed','blocked') then raise exception 'VERSION_CONFLICT'; end if;
  if v_operation.auth_user_id is not null and v_operation.auth_user_id <> p_user_id then
    raise exception 'PROFILE_CONFLICT';
  end if;
  if p_outcome not in ('existing_active','existing_activation_required','created_activation_required',
      'reconciled_after_ambiguity') then raise exception 'INVALID_PROVISIONING_OUTCOME'; end if;
  insert into public.user_profiles (user_id, display_name, locale, time_zone)
    values (p_user_id, p_display_name, p_locale, p_time_zone) on conflict (user_id) do nothing;
  if found then v_profile_state := 'created'; else v_profile_state := 'existing'; end if;
  if not exists (select 1 from public.user_profiles where user_id = p_user_id) then
    raise exception 'PROFILE_CONFLICT';
  end if;
  update public.identity_provisioning_operations set state = 'completed', outcome = p_outcome,
    auth_user_id = p_user_id, profile_state = v_profile_state,
    activation_required = p_activation_required,
    provider_reconciliation_reference = p_reconciliation_reference,
    last_request_id = p_request_id, completed_at = now(), updated_at = now(), version = version + 1
    where id = p_operation_id returning * into v_operation;
  insert into public.identity_provisioning_events (
    operation_id, request_id, actor_type, actor_user_id, actor_membership_id,
    action, outcome, email_fingerprint
  ) values (v_operation.id, p_request_id, v_operation.actor_type, v_operation.actor_user_id,
    v_operation.actor_membership_id, 'identity.provisioning_completed', 'succeeded',
    v_operation.email_fingerprint);
  return query select v_operation.id, 'resumed', v_operation.state, v_operation.outcome,
    v_operation.auth_user_id, v_operation.profile_state, v_operation.activation_required,
    v_operation.provider_reconciliation_reference::text, v_operation.provider_ambiguity_phase;
end;
$$;

create or replace function public.spec35_block_identity_provisioning(
  p_operation_id uuid, p_outcome text, p_reason_code text,
  p_reconciliation_reference uuid, p_request_id text
) returns table (
  operation_id uuid, claim_state text, state text, outcome text, auth_user_id uuid,
  profile_state text, activation_required boolean, provider_reconciliation_reference text,
  provider_ambiguity_phase text
) language plpgsql security definer set search_path = pg_catalog as $$
declare v_operation public.identity_provisioning_operations%rowtype;
begin
  if p_outcome not in ('blocked_ambiguous','blocked_ineligible')
    or p_reason_code not in ('IDENTITY_AMBIGUOUS','IDENTITY_INELIGIBLE') then
    raise exception 'INVALID_PROVISIONING_OUTCOME';
  end if;
  select o.* into v_operation from public.identity_provisioning_operations o where o.id = p_operation_id for update;
  if not found or v_operation.state in ('completed','blocked') then raise exception 'VERSION_CONFLICT'; end if;
  update public.identity_provisioning_operations set state = 'blocked', outcome = p_outcome,
    activation_required = false, provider_reconciliation_reference = p_reconciliation_reference,
    last_request_id = p_request_id, completed_at = now(), updated_at = now(), version = version + 1
    where id = p_operation_id returning * into v_operation;
  insert into public.identity_provisioning_events (
    operation_id, request_id, actor_type, actor_user_id, actor_membership_id,
    action, outcome, reason_code, email_fingerprint
  ) values (v_operation.id, p_request_id, v_operation.actor_type, v_operation.actor_user_id,
    v_operation.actor_membership_id, 'identity.provisioning_blocked', 'blocked', p_reason_code,
    v_operation.email_fingerprint);
  return query select v_operation.id, 'resumed', v_operation.state, v_operation.outcome,
    v_operation.auth_user_id, v_operation.profile_state, v_operation.activation_required,
    v_operation.provider_reconciliation_reference::text, v_operation.provider_ambiguity_phase;
end;
$$;

alter table public.identity_provisioning_operations enable row level security;
alter table public.identity_provisioning_operations force row level security;
alter table public.identity_provisioning_events enable row level security;
alter table public.identity_provisioning_events force row level security;

revoke all on public.identity_provisioning_operations, public.identity_provisioning_events
  from public, anon, authenticated;
revoke all on function public.spec35_claim_identity_provisioning(text,text,text,text,text,text,uuid,uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.spec35_mark_provider_ambiguous(uuid,text,text) from public, anon, authenticated;
revoke all on function public.spec35_complete_identity_provisioning(uuid,uuid,text,text,text,text,boolean,uuid,text)
  from public, anon, authenticated;
revoke all on function public.spec35_block_identity_provisioning(uuid,text,text,uuid,text)
  from public, anon, authenticated;

grant select, insert, update on public.identity_provisioning_operations to service_role;
grant select, insert on public.identity_provisioning_events to service_role;
grant execute on function public.spec35_claim_identity_provisioning(text,text,text,text,text,text,uuid,uuid,uuid)
  to service_role;
grant execute on function public.spec35_mark_provider_ambiguous(uuid,text,text) to service_role;
grant execute on function public.spec35_complete_identity_provisioning(uuid,uuid,text,text,text,text,boolean,uuid,text)
  to service_role;
grant execute on function public.spec35_block_identity_provisioning(uuid,text,text,uuid,text) to service_role;

comment on table public.identity_provisioning_operations is
  'SPEC-35 safe resumable evidence only. Rows never grant membership, role, or customer access.';
