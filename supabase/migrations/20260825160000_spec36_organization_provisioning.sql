-- SPEC-36 / PROD-SPEC-02: restricted, idempotent organization bootstrap evidence.
-- No organization or user is created by this migration. Runtime execution remains service-role-only.
create extension if not exists pgcrypto;

create table public.organization_provisioning_operations (
  operation_id text primary key check (operation_id ~ '^orgprov_[A-Za-z0-9][A-Za-z0-9._:-]{7,145}$'),
  manifest_fingerprint text not null check (manifest_fingerprint ~ '^[0-9a-f]{64}$'),
  requested_at timestamptz not null,
  operator_user_id uuid not null references public.platform_operators(user_id) on delete restrict,
  step_up_session_id uuid not null references public.app_sessions(id) on delete restrict,
  approval_reference text not null check (char_length(approval_reference) between 3 and 128),
  operator_owner_identity_equality_approved boolean not null default false,
  deployment_identity text not null check (char_length(deployment_identity) between 1 and 128),
  target_project_ref text not null check (target_project_ref ~ '^[a-z0-9]{8,40}$'),
  organization_id uuid not null unique default gen_random_uuid(),
  organization_slug text not null unique,
  organization_display_name text not null,
  organization_legal_name text not null,
  plan_key text not null check (plan_key in ('internal','standard','enterprise')),
  locale text not null,
  time_zone text not null,
  owner_email_fingerprint text not null check (owner_email_fingerprint ~ '^[0-9a-f]{64}$'),
  owner_display_name text not null,
  owner_locale text not null,
  owner_time_zone text not null,
  owner_user_id uuid references auth.users(id) on delete restrict,
  owner_membership_id uuid not null unique default gen_random_uuid(),
  activation_required boolean,
  state text not null default 'reserved' check (state in ('reserved','completed','attention_required')),
  handoff_state text not null default 'pending' check (handoff_state in ('pending','ready','failed','not_required')),
  created_request_id text not null check (created_request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'),
  last_request_id text not null check (last_request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'),
  failure_reason_code text check (failure_reason_code is null or failure_reason_code ~ '^[A-Z0-9_]{1,64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  version integer not null default 1 check (version > 0),
  check ((state = 'completed') = (completed_at is not null)),
  check (state <> 'completed' or (owner_user_id is not null and activation_required is not null))
);

create table public.organization_provisioning_events (
  id uuid primary key default gen_random_uuid(),
  operation_id text not null references public.organization_provisioning_operations(operation_id) on delete restrict,
  request_id text not null check (request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'),
  operator_user_id uuid not null references public.platform_operators(user_id) on delete restrict,
  action text not null check (action in ('organization.provisioning_reserved','organization.provisioning_resumed',
    'organization.provisioning_replayed','organization.provisioning_completed','organization.provisioning_attention_required')),
  outcome text not null check (outcome in ('succeeded','failed')),
  manifest_fingerprint text not null check (manifest_fingerprint ~ '^[0-9a-f]{64}$'),
  reason_code text check (reason_code is null or reason_code ~ '^[A-Z0-9_]{1,64}$'),
  occurred_at timestamptz not null default now()
);
create index organization_provisioning_events_timeline_idx
  on public.organization_provisioning_events (operation_id, occurred_at, id);

create or replace function public.spec36_prevent_provisioning_event_mutation()
returns trigger language plpgsql security invoker set search_path = pg_catalog as $$
begin raise exception 'APPEND_ONLY_ORGANIZATION_PROVISIONING_EVENT'; end;
$$;
create trigger organization_provisioning_events_append_only before update or delete
  on public.organization_provisioning_events for each row
  execute function public.spec36_prevent_provisioning_event_mutation();

create or replace function public.spec36_protect_provisioning_manifest()
returns trigger language plpgsql security invoker set search_path = pg_catalog as $$
begin
  if row(old.operation_id, old.manifest_fingerprint, old.requested_at, old.operator_user_id,
      old.step_up_session_id, old.approval_reference, old.operator_owner_identity_equality_approved,
      old.deployment_identity, old.target_project_ref,
      old.organization_id, old.organization_slug, old.organization_display_name, old.organization_legal_name,
      old.plan_key, old.locale, old.time_zone, old.owner_email_fingerprint, old.owner_display_name,
      old.owner_locale, old.owner_time_zone, old.owner_membership_id, old.created_request_id, old.created_at)
    is distinct from
    row(new.operation_id, new.manifest_fingerprint, new.requested_at, new.operator_user_id,
      new.step_up_session_id, new.approval_reference, new.operator_owner_identity_equality_approved,
      new.deployment_identity, new.target_project_ref,
      new.organization_id, new.organization_slug, new.organization_display_name, new.organization_legal_name,
      new.plan_key, new.locale, new.time_zone, new.owner_email_fingerprint, new.owner_display_name,
      new.owner_locale, new.owner_time_zone, new.owner_membership_id, new.created_request_id, new.created_at) then
    raise exception 'IMMUTABLE_PROVISIONING_MANIFEST';
  end if;
  return new;
end;
$$;
create trigger organization_provisioning_manifest_immutable before update
  on public.organization_provisioning_operations for each row
  execute function public.spec36_protect_provisioning_manifest();

create or replace function public.spec36_preflight_organization_provisioning(
  p_operator_user_id uuid, p_step_up_session_id uuid, p_operation_id text, p_slug text
) returns table (operator_eligible boolean, slug_available boolean, migration_conflict boolean)
language sql security definer set search_path = pg_catalog as $$
  select
    exists (select 1 from public.platform_operators p
      join public.app_sessions s on s.id = p_step_up_session_id and s.user_id = p.user_id
      where p.user_id = p_operator_user_id and p.status = 'active' and p.mfa_required
        and s.assurance_level = 'aal2' and s.revoked_at is null and s.absolute_expires_at > now()
        and (s.idle_expires_at is null or s.idle_expires_at > now())),
    not exists (select 1 from public.organizations o where o.slug = p_slug
      and not exists (select 1 from public.organization_provisioning_operations p
        where p.operation_id = p_operation_id and p.organization_id = o.id))
      and not exists (select 1 from public.organization_provisioning_operations p
        where p.organization_slug = p_slug and p.operation_id <> p_operation_id),
    exists (select 1 from migration_control.migration_inventory_items i
      where lower(i.source_identifier) = lower(p_slug)
        and (i.quarantine_state = 'quarantined' or i.processing_status in ('discovered','reviewed','processing')));
$$;

create or replace function public.spec36_claim_organization_provisioning(
  p_operation_id text, p_manifest_fingerprint text, p_requested_at timestamptz,
  p_operator_user_id uuid, p_step_up_session_id uuid, p_approval_reference text,
  p_operator_owner_equality_approved boolean,
  p_deployment_identity text, p_target_project_ref text, p_slug text, p_display_name text,
  p_legal_name text, p_plan_key text, p_locale text, p_time_zone text,
  p_owner_email_fingerprint text, p_owner_display_name text, p_owner_locale text,
  p_owner_time_zone text, p_request_id text
) returns table (operation_id text, claim_state text, state text, manifest_fingerprint text,
  organization_id uuid, organization_slug text, owner_user_id uuid, owner_membership_id uuid,
  activation_required boolean, handoff_state text, request_id text, evidence_timestamp timestamptz)
language plpgsql security definer set search_path = pg_catalog as $$
declare v_operation public.organization_provisioning_operations%rowtype;
declare v_claim_state text;
begin
  if p_operation_id !~ '^orgprov_[A-Za-z0-9][A-Za-z0-9._:-]{7,145}$'
    or p_manifest_fingerprint !~ '^[0-9a-f]{64}$' or char_length(btrim(p_approval_reference)) not between 3 and 128
    or p_operator_owner_equality_approved is null
    or p_plan_key not in ('internal','standard','enterprise') or p_owner_email_fingerprint !~ '^[0-9a-f]{64}$'
    or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then raise exception 'INVALID_PROVISIONING_INPUT'; end if;
  if not exists (select 1 from public.platform_operators p
    join public.app_sessions s on s.id = p_step_up_session_id and s.user_id = p.user_id
    where p.user_id = p_operator_user_id and p.status = 'active' and p.mfa_required
      and s.assurance_level = 'aal2' and s.revoked_at is null and s.absolute_expires_at > now()
      and (s.idle_expires_at is null or s.idle_expires_at > now())) then raise exception 'FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id, 36));
  perform pg_advisory_xact_lock(hashtextextended(p_slug, 36));
  select * into v_operation from public.organization_provisioning_operations o
    where o.operation_id = p_operation_id for update;
  if found then
    if v_operation.manifest_fingerprint <> p_manifest_fingerprint
      or v_operation.operator_user_id <> p_operator_user_id
      or v_operation.target_project_ref <> p_target_project_ref then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    v_claim_state := case when v_operation.state = 'completed' then 'replayed' else 'resumed' end;
    update public.organization_provisioning_operations set last_request_id = p_request_id,
      updated_at = now(), version = version + 1 where operation_id = p_operation_id returning * into v_operation;
  else
    if exists (select 1 from public.organizations where slug = p_slug)
      or exists (select 1 from public.organization_provisioning_operations where organization_slug = p_slug)
      then raise exception 'SLUG_CONFLICT'; end if;
    if exists (select 1 from migration_control.migration_inventory_items i
      where lower(i.source_identifier) = lower(p_slug)
        and (i.quarantine_state = 'quarantined' or i.processing_status in ('discovered','reviewed','processing')))
      then raise exception 'MIGRATION_INVENTORY_CONFLICT'; end if;
    insert into public.organization_provisioning_operations (operation_id, manifest_fingerprint,
      requested_at, operator_user_id, step_up_session_id, approval_reference, deployment_identity,
      operator_owner_identity_equality_approved,
      target_project_ref, organization_slug, organization_display_name, organization_legal_name,
      plan_key, locale, time_zone, owner_email_fingerprint, owner_display_name, owner_locale,
      owner_time_zone, created_request_id, last_request_id)
    values (p_operation_id, p_manifest_fingerprint, p_requested_at, p_operator_user_id,
      p_step_up_session_id, btrim(p_approval_reference), p_deployment_identity,
      p_operator_owner_equality_approved, p_target_project_ref,
      p_slug, btrim(p_display_name), btrim(p_legal_name), p_plan_key, p_locale, p_time_zone,
      p_owner_email_fingerprint, btrim(p_owner_display_name), p_owner_locale, p_owner_time_zone,
      p_request_id, p_request_id) returning * into v_operation;
    v_claim_state := 'created';
  end if;
  insert into public.organization_provisioning_events (operation_id, request_id, operator_user_id,
    action, outcome, manifest_fingerprint) values (v_operation.operation_id, p_request_id,
    v_operation.operator_user_id, case v_claim_state when 'created' then 'organization.provisioning_reserved'
      when 'replayed' then 'organization.provisioning_replayed' else 'organization.provisioning_resumed' end,
    'succeeded', v_operation.manifest_fingerprint);
  return query select v_operation.operation_id, v_claim_state, v_operation.state,
    v_operation.manifest_fingerprint, v_operation.organization_id, v_operation.organization_slug,
    v_operation.owner_user_id, v_operation.owner_membership_id, v_operation.activation_required,
    v_operation.handoff_state, v_operation.last_request_id, v_operation.updated_at;
end;
$$;

create or replace function public.spec36_complete_organization_provisioning(
  p_operation_id text, p_manifest_fingerprint text, p_owner_user_id uuid,
  p_activation_required boolean, p_request_id text
) returns table (operation_id text, claim_state text, state text, manifest_fingerprint text,
  organization_id uuid, organization_slug text, owner_user_id uuid, owner_membership_id uuid,
  activation_required boolean, handoff_state text, request_id text, evidence_timestamp timestamptz)
language plpgsql security definer set search_path = pg_catalog as $$
declare v_operation public.organization_provisioning_operations%rowtype;
declare v_valid boolean;
begin
  select * into v_operation from public.organization_provisioning_operations o
    where o.operation_id = p_operation_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_operation.manifest_fingerprint <> p_manifest_fingerprint
    or (v_operation.owner_user_id is not null and v_operation.owner_user_id <> p_owner_user_id)
    then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  if p_owner_user_id = v_operation.operator_user_id
    and not v_operation.operator_owner_identity_equality_approved then raise exception 'APPROVAL_REQUIRED'; end if;
  if v_operation.state = 'completed' then
    return query select v_operation.operation_id, 'replayed', v_operation.state,
      v_operation.manifest_fingerprint, v_operation.organization_id, v_operation.organization_slug,
      v_operation.owner_user_id, v_operation.owner_membership_id, v_operation.activation_required,
      v_operation.handoff_state, v_operation.last_request_id, v_operation.updated_at; return;
  end if;
  if not exists (select 1 from public.organizations where id = v_operation.organization_id) then
    return query select v_operation.operation_id, 'resumed', v_operation.state,
      v_operation.manifest_fingerprint, v_operation.organization_id, v_operation.organization_slug,
      v_operation.owner_user_id, v_operation.owner_membership_id, v_operation.activation_required,
      v_operation.handoff_state, v_operation.last_request_id, v_operation.updated_at; return;
  end if;
  select exists (select 1 from public.organizations o
      join public.organization_settings s on s.organization_id = o.id
      join public.organization_memberships m on m.id = v_operation.owner_membership_id
        and m.organization_id = o.id and m.user_id = p_owner_user_id and m.role = 'owner' and m.status = 'active'
      join public.user_profiles p on p.user_id = p_owner_user_id
      where o.id = v_operation.organization_id and o.slug = v_operation.organization_slug
        and o.display_name = v_operation.organization_display_name
        and coalesce(o.legal_name, '') = v_operation.organization_legal_name
        and o.plan_key = v_operation.plan_key and o.locale = v_operation.locale
        and o.time_zone = v_operation.time_zone and o.creation_source = 'platform'
        and o.created_by_user_id = v_operation.operator_user_id and o.status = 'active'
        and s.record_visibility = 'organization' and s.public_display_name is null
        and s.primary_color is null and s.accent_color is null and s.logo_asset_id is null
        and s.feature_defaults = '{}'::jsonb and s.feature_schema_version = 1
        and exists (select 1 from public.organization_events e where e.organization_id = o.id
          and e.event_type = 'organization.created' and e.actor_type = 'platform_operator'
          and e.actor_user_id = v_operation.operator_user_id and e.target_id = o.id
          and e.metadata = jsonb_build_object('creation_source', 'platform', 'plan_key', v_operation.plan_key))) into v_valid;
  if not v_valid then
    update public.organization_provisioning_operations set state = 'attention_required',
      owner_user_id = p_owner_user_id, activation_required = p_activation_required,
      failure_reason_code = 'READBACK_FAILED', last_request_id = p_request_id,
      updated_at = now(), version = version + 1 where operation_id = p_operation_id returning * into v_operation;
    insert into public.organization_provisioning_events (operation_id, request_id, operator_user_id,
      action, outcome, manifest_fingerprint, reason_code) values (p_operation_id, p_request_id,
      v_operation.operator_user_id, 'organization.provisioning_attention_required', 'failed',
      p_manifest_fingerprint, 'READBACK_FAILED');
  else
    update public.organization_provisioning_operations set state = 'completed', owner_user_id = p_owner_user_id,
      activation_required = p_activation_required, handoff_state = 'pending', failure_reason_code = null,
      last_request_id = p_request_id, completed_at = now(), updated_at = now(), version = version + 1
      where operation_id = p_operation_id returning * into v_operation;
    insert into public.organization_provisioning_events (operation_id, request_id, operator_user_id,
      action, outcome, manifest_fingerprint) values (p_operation_id, p_request_id,
      v_operation.operator_user_id, 'organization.provisioning_completed', 'succeeded', p_manifest_fingerprint);
  end if;
  return query select v_operation.operation_id, 'resumed', v_operation.state,
    v_operation.manifest_fingerprint, v_operation.organization_id, v_operation.organization_slug,
    v_operation.owner_user_id, v_operation.owner_membership_id, v_operation.activation_required,
    v_operation.handoff_state, v_operation.last_request_id, v_operation.updated_at;
end;
$$;

create or replace function public.spec36_get_organization_provisioning(p_operation_id text)
returns table (operation_id text, claim_state text, state text, manifest_fingerprint text,
  organization_id uuid, organization_slug text, owner_user_id uuid, owner_membership_id uuid,
  activation_required boolean, handoff_state text, request_id text, evidence_timestamp timestamptz)
language plpgsql security definer set search_path = pg_catalog as $$
begin
  return query select o.operation_id, case when o.state = 'completed' then 'replayed' else 'resumed' end,
    o.state, o.manifest_fingerprint, o.organization_id, o.organization_slug, o.owner_user_id,
    o.owner_membership_id, o.activation_required, o.handoff_state, o.last_request_id, o.updated_at
    from public.organization_provisioning_operations o where o.operation_id = p_operation_id;
  if not found then raise exception 'NOT_FOUND'; end if;
end;
$$;

alter table public.organization_provisioning_operations enable row level security;
alter table public.organization_provisioning_operations force row level security;
alter table public.organization_provisioning_events enable row level security;
alter table public.organization_provisioning_events force row level security;
revoke all on public.organization_provisioning_operations, public.organization_provisioning_events
  from public, anon, authenticated;
revoke all on function public.spec36_preflight_organization_provisioning(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.spec36_claim_organization_provisioning(text,text,timestamptz,uuid,uuid,text,boolean,text,text,text,text,text,text,text,text,text,text,text,text,text)
  from public, anon, authenticated;
revoke all on function public.spec36_complete_organization_provisioning(text,text,uuid,boolean,text)
  from public, anon, authenticated;
revoke all on function public.spec36_get_organization_provisioning(text) from public, anon, authenticated;
grant select, insert, update on public.organization_provisioning_operations to service_role;
grant select, insert on public.organization_provisioning_events to service_role;
grant execute on function public.spec36_preflight_organization_provisioning(uuid,uuid,text,text) to service_role;
grant execute on function public.spec36_claim_organization_provisioning(text,text,timestamptz,uuid,uuid,text,boolean,text,text,text,text,text,text,text,text,text,text,text,text,text)
  to service_role;
grant execute on function public.spec36_complete_organization_provisioning(text,text,uuid,boolean,text) to service_role;
grant execute on function public.spec36_get_organization_provisioning(text) to service_role;

comment on table public.organization_provisioning_operations is
  'SPEC-36 immutable safe receipts. No password, activation link, token, session, or service key is stored.';
