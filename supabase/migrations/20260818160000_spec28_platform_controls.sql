-- SPEC-28 / MT-SPEC-04: shared multi-tenant enforcement and operations layer.
-- Additive and empty by design. Domain tables adopt these controls in their owning SPECs.

create extension if not exists pgcrypto;

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  occurred_at timestamptz not null default now(),
  request_id text not null check (request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  actor_type text not null check (actor_type in (
    'member', 'organization_api_key', 'external_contract_link',
    'platform_support', 'system_worker', 'migration'
  )),
  actor_user_id uuid references auth.users(id) on delete restrict,
  actor_membership_id uuid,
  api_key_id uuid,
  external_capability_id uuid,
  support_session_id uuid,
  action text not null check (action ~ '^[a-z][a-z0-9_.]{2,127}$'),
  target_type text not null check (target_type ~ '^[a-z][a-z0-9_]{0,63}$'),
  target_id uuid,
  outcome text not null check (outcome in ('succeeded', 'denied', 'failed')),
  source text not null check (source ~ '^[a-z][a-z0-9_.:-]{0,127}$'),
  changed_fields text[] not null default '{}',
  reason_code text check (reason_code is null or reason_code ~ '^[A-Z0-9_]{1,64}$'),
  support_reason text check (support_reason is null or char_length(btrim(support_reason)) between 1 and 240),
  metadata jsonb not null default '{}'::jsonb,
  integrity_version integer not null default 1 check (integrity_version > 0),
  unique (id, organization_id),
  foreign key (actor_membership_id, organization_id)
    references public.organization_memberships(id, organization_id) on delete restrict,
  check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 4096),
  check (cardinality(changed_fields) <= 64),
  check ((actor_type = 'member') = (actor_membership_id is not null)),
  check ((actor_type = 'organization_api_key') = (api_key_id is not null)),
  check ((actor_type = 'external_contract_link') = (external_capability_id is not null)),
  check ((actor_type = 'platform_support') = (support_session_id is not null and support_reason is not null))
);

create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 160),
  metric_key text not null check (metric_key ~ '^[a-z][a-z0-9_.]{2,127}$'),
  quantity bigint not null check (quantity <> 0),
  unit text not null check (unit ~ '^[a-z][a-z0-9_]{0,31}$'),
  source_type text not null check (source_type ~ '^[a-z][a-z0-9_]{0,63}$'),
  source_id uuid,
  actor_type text not null check (actor_type in (
    'member', 'organization_api_key', 'external_contract_link',
    'platform_support', 'system_worker', 'migration'
  )),
  request_id text not null check (request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  occurred_at timestamptz not null default now(),
  schema_version integer not null default 1 check (schema_version > 0),
  metadata jsonb not null default '{}'::jsonb,
  unique (organization_id, metric_key, idempotency_key),
  unique (id, organization_id),
  check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 2048)
);

create table public.organization_rate_limit_buckets (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  policy_key text not null check (policy_key ~ '^[a-z][a-z0-9_.]{2,127}$'),
  subject_hash bytea not null check (octet_length(subject_hash) = 32),
  window_started_at timestamptz not null,
  window_seconds integer not null check (window_seconds between 1 and 86400),
  consumed integer not null check (consumed >= 0),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, policy_key, subject_hash, window_started_at),
  check (expires_at > window_started_at)
);

create table public.platform_rate_limit_buckets (
  policy_key text not null check (policy_key ~ '^[a-z][a-z0-9_.]{2,127}$'),
  subject_hash bytea not null check (octet_length(subject_hash) = 32),
  window_started_at timestamptz not null,
  window_seconds integer not null check (window_seconds between 1 and 86400),
  consumed integer not null check (consumed >= 0),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (policy_key, subject_hash, window_started_at),
  check (expires_at > window_started_at)
);

create table public.quota_snapshots (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  metric_key text not null check (metric_key ~ '^[a-z][a-z0-9_.]{2,127}$'),
  consumed bigint not null default 0,
  reserved bigint not null default 0 check (reserved >= 0),
  limit_value bigint check (limit_value is null or limit_value >= 0),
  rebuilt_through timestamptz,
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  primary key (organization_id, metric_key)
);

create table public.usage_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  metric_key text not null,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 160),
  quantity bigint not null check (quantity > 0),
  state text not null default 'reserved' check (state in ('reserved', 'finalized', 'released', 'expired')),
  request_id text not null check (request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  finalized_at timestamptz,
  unique (organization_id, metric_key, idempotency_key),
  foreign key (organization_id, metric_key)
    references public.quota_snapshots(organization_id, metric_key) on delete restrict,
  check (expires_at > created_at)
);

create table public.platform_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  action_class text not null check (action_class ~ '^[a-z][a-z0-9_.]{2,127}$'),
  provider_class text check (provider_class is null or provider_class ~ '^[a-z][a-z0-9_.]{2,127}$'),
  state text not null default 'queued' check (state in (
    'queued', 'processing', 'succeeded', 'retryable', 'dead_letter',
    'paused_recovery', 'blocked_reconciliation', 'cancelled'
  )),
  priority_band smallint not null default 5 check (priority_band between 0 and 9),
  available_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null check (max_attempts between 1 and 100),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 160),
  request_id text not null check (request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  locked_by text,
  locked_at timestamptz,
  last_error_code text check (last_error_code is null or last_error_code ~ '^[A-Z0-9_]{1,64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  unique (organization_id, action_class, idempotency_key),
  unique (id, organization_id),
  check ((state = 'processing') = (locked_by is not null and locked_at is not null))
);

create table public.deletion_tombstones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  target_type text not null check (target_type ~ '^[a-z][a-z0-9_]{0,63}$'),
  target_id uuid not null,
  data_classes text[] not null,
  finalized_at timestamptz not null,
  policy_version text not null check (char_length(policy_version) between 1 and 64),
  evidence_reference text not null check (char_length(btrim(evidence_reference)) between 1 and 240),
  created_at timestamptz not null default now(),
  unique (organization_id, target_type, target_id)
);

create table public.recovery_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  recovery_id uuid not null,
  evidence_type text not null check (evidence_type ~ '^[a-z][a-z0-9_.]{2,127}$'),
  outcome text not null check (outcome in ('passed', 'failed', 'blocked')),
  checksum text check (checksum is null or checksum ~ '^[0-9a-f]{64}$'),
  details jsonb not null default '{}'::jsonb,
  request_id text not null check (request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  recorded_at timestamptz not null default now(),
  unique (organization_id, recovery_id, evidence_type),
  check (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 4096)
);

create index audit_events_timeline_idx
  on public.audit_events (organization_id, occurred_at desc, id desc);
create index audit_events_target_idx
  on public.audit_events (organization_id, target_type, target_id, occurred_at desc);
create index usage_events_timeline_idx
  on public.usage_events (organization_id, metric_key, occurred_at desc, id desc);
create index organization_rate_limit_expiry_idx
  on public.organization_rate_limit_buckets (organization_id, expires_at);
create index platform_rate_limit_expiry_idx on public.platform_rate_limit_buckets (expires_at);
create index platform_jobs_claim_idx
  on public.platform_jobs (organization_id, state, available_at, priority_band, id);
create index platform_jobs_global_claim_idx
  on public.platform_jobs (state, priority_band, available_at, organization_id, id);
create index deletion_tombstones_timeline_idx
  on public.deletion_tombstones (organization_id, finalized_at desc, id desc);
create index recovery_evidence_timeline_idx
  on public.recovery_evidence (organization_id, recorded_at desc, id desc);

create or replace function public.spec28_prevent_mutation()
returns trigger language plpgsql security invoker set search_path = pg_catalog as $$
begin
  raise exception 'APPEND_ONLY_RECORD';
end;
$$;

create trigger audit_events_append_only before update or delete on public.audit_events
for each row execute function public.spec28_prevent_mutation();
create trigger usage_events_append_only before update or delete on public.usage_events
for each row execute function public.spec28_prevent_mutation();
create trigger deletion_tombstones_append_only before update or delete on public.deletion_tombstones
for each row execute function public.spec28_prevent_mutation();
create trigger recovery_evidence_append_only before update or delete on public.recovery_evidence
for each row execute function public.spec28_prevent_mutation();

create or replace function public.spec28_consume_organization_rate_limit(
  p_organization_id uuid, p_policy_key text, p_subject_hash bytea,
  p_window_seconds integer, p_limit integer, p_cost integer, p_now timestamptz
) returns table (allowed boolean, remaining integer, retry_after_seconds integer, policy_key text)
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_window_start timestamptz;
  v_consumed integer;
begin
  if p_organization_id is null or p_window_seconds not between 1 and 86400
    or p_limit < 1 or p_cost < 1 or p_cost > p_limit or octet_length(p_subject_hash) <> 32 then
    raise exception 'INVALID_RATE_LIMIT_INPUT';
  end if;
  perform 1 from public.organizations where id = p_organization_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  v_window_start := to_timestamp(
    floor(extract(epoch from p_now) / p_window_seconds) * p_window_seconds
  );
  insert into public.organization_rate_limit_buckets (
    organization_id, policy_key, subject_hash, window_started_at,
    window_seconds, consumed, expires_at
  ) values (
    p_organization_id, p_policy_key, p_subject_hash, v_window_start,
    p_window_seconds, p_cost, v_window_start + make_interval(secs => p_window_seconds)
  ) on conflict (organization_id, policy_key, subject_hash, window_started_at)
  do update set consumed = public.organization_rate_limit_buckets.consumed + excluded.consumed,
    updated_at = p_now
  where public.organization_rate_limit_buckets.consumed + excluded.consumed <= p_limit
  returning consumed into v_consumed;
  if v_consumed is null then
    select b.consumed into v_consumed from public.organization_rate_limit_buckets b
    where b.organization_id = p_organization_id and b.policy_key = p_policy_key
      and b.subject_hash = p_subject_hash and b.window_started_at = v_window_start;
    return query select false, greatest(0, p_limit - v_consumed),
      greatest(1, ceil(extract(epoch from (v_window_start + make_interval(secs => p_window_seconds) - p_now)))::integer),
      p_policy_key;
  else
    return query select true, greatest(0, p_limit - v_consumed), 0, p_policy_key;
  end if;
end;
$$;

create or replace function public.spec28_consume_platform_rate_limit(
  p_policy_key text, p_subject_hash bytea, p_window_seconds integer,
  p_limit integer, p_cost integer, p_now timestamptz
) returns table (allowed boolean, remaining integer, retry_after_seconds integer, policy_key text)
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_window_start timestamptz;
  v_consumed integer;
begin
  if p_window_seconds not between 1 and 86400 or p_limit < 1 or p_cost < 1
    or p_cost > p_limit or octet_length(p_subject_hash) <> 32 then
    raise exception 'INVALID_RATE_LIMIT_INPUT';
  end if;
  v_window_start := to_timestamp(
    floor(extract(epoch from p_now) / p_window_seconds) * p_window_seconds
  );
  insert into public.platform_rate_limit_buckets (
    policy_key, subject_hash, window_started_at, window_seconds, consumed, expires_at
  ) values (
    p_policy_key, p_subject_hash, v_window_start, p_window_seconds, p_cost,
    v_window_start + make_interval(secs => p_window_seconds)
  ) on conflict (policy_key, subject_hash, window_started_at)
  do update set consumed = public.platform_rate_limit_buckets.consumed + excluded.consumed,
    updated_at = p_now
  where public.platform_rate_limit_buckets.consumed + excluded.consumed <= p_limit
  returning consumed into v_consumed;
  if v_consumed is null then
    select b.consumed into v_consumed from public.platform_rate_limit_buckets b
    where b.policy_key = p_policy_key and b.subject_hash = p_subject_hash
      and b.window_started_at = v_window_start;
    return query select false, greatest(0, p_limit - v_consumed),
      greatest(1, ceil(extract(epoch from (v_window_start + make_interval(secs => p_window_seconds) - p_now)))::integer),
      p_policy_key;
  else
    return query select true, greatest(0, p_limit - v_consumed), 0, p_policy_key;
  end if;
end;
$$;

create or replace function public.spec28_record_usage(
  p_organization_id uuid, p_idempotency_key text, p_metric_key text,
  p_quantity bigint, p_unit text, p_source_type text, p_source_id uuid,
  p_actor_type text, p_request_id text, p_metadata jsonb
) returns setof public.usage_events
language plpgsql security definer set search_path = pg_catalog as $$
declare v_event public.usage_events%rowtype;
begin
  insert into public.usage_events (
    organization_id, idempotency_key, metric_key, quantity, unit, source_type,
    source_id, actor_type, request_id, metadata
  ) values (
    p_organization_id, p_idempotency_key, p_metric_key, p_quantity, p_unit,
    p_source_type, p_source_id, p_actor_type, p_request_id, coalesce(p_metadata, '{}'::jsonb)
  ) on conflict (organization_id, metric_key, idempotency_key) do nothing
  returning * into v_event;
  if v_event.id is null then
    select * into v_event from public.usage_events
    where organization_id = p_organization_id and metric_key = p_metric_key
      and idempotency_key = p_idempotency_key;
    if v_event.quantity <> p_quantity or v_event.unit <> p_unit
      or v_event.source_type <> p_source_type or v_event.source_id is distinct from p_source_id then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
  end if;
  return next v_event;
end;
$$;

create or replace function public.spec28_reserve_quota(
  p_organization_id uuid, p_metric_key text, p_idempotency_key text,
  p_quantity bigint, p_request_id text, p_expires_at timestamptz
) returns setof public.usage_reservations
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_snapshot public.quota_snapshots%rowtype;
  v_reservation public.usage_reservations%rowtype;
begin
  if p_quantity <= 0 or p_expires_at <= now() then raise exception 'INVALID_QUOTA_RESERVATION'; end if;
  select * into v_reservation from public.usage_reservations
  where organization_id = p_organization_id and metric_key = p_metric_key
    and idempotency_key = p_idempotency_key for update;
  if found then
    if v_reservation.quantity <> p_quantity then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return next v_reservation;
    return;
  end if;
  insert into public.quota_snapshots (organization_id, metric_key)
  values (p_organization_id, p_metric_key) on conflict do nothing;
  select * into v_snapshot from public.quota_snapshots
  where organization_id = p_organization_id and metric_key = p_metric_key for update;
  if v_snapshot.limit_value is not null
    and v_snapshot.consumed + v_snapshot.reserved + p_quantity > v_snapshot.limit_value then
    raise exception 'QUOTA_EXCEEDED';
  end if;
  insert into public.usage_reservations (
    organization_id, metric_key, idempotency_key, quantity, request_id, expires_at
  ) values (
    p_organization_id, p_metric_key, p_idempotency_key, p_quantity, p_request_id, p_expires_at
  ) returning * into v_reservation;
  update public.quota_snapshots set reserved = reserved + p_quantity,
    updated_at = now(), version = version + 1
  where organization_id = p_organization_id and metric_key = p_metric_key;
  return next v_reservation;
end;
$$;

create or replace function public.spec28_finalize_quota(
  p_organization_id uuid, p_reservation_id uuid, p_finalize boolean,
  p_unit text, p_source_type text, p_source_id uuid, p_actor_type text,
  p_request_id text, p_metadata jsonb
) returns setof public.usage_reservations
language plpgsql security definer set search_path = pg_catalog as $$
declare v_reservation public.usage_reservations%rowtype;
begin
  if p_finalize is null then raise exception 'INVALID_QUOTA_FINALIZATION'; end if;
  select * into v_reservation from public.usage_reservations
  where id = p_reservation_id and organization_id = p_organization_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_reservation.state in ('finalized', 'released') then
    if (v_reservation.state = 'finalized') <> p_finalize then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return next v_reservation;
    return;
  end if;
  if v_reservation.state <> 'reserved' then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  update public.quota_snapshots set
    reserved = reserved - v_reservation.quantity,
    consumed = consumed + case when p_finalize then v_reservation.quantity else 0 end,
    updated_at = now(), version = version + 1
  where organization_id = p_organization_id and metric_key = v_reservation.metric_key
    and reserved >= v_reservation.quantity;
  if not found then raise exception 'QUOTA_STATE_CORRUPT'; end if;
  if p_finalize then
    perform public.spec28_record_usage(
      p_organization_id, v_reservation.idempotency_key, v_reservation.metric_key,
      v_reservation.quantity, p_unit, p_source_type, p_source_id,
      p_actor_type, p_request_id, p_metadata
    );
  end if;
  update public.usage_reservations set state = case when p_finalize then 'finalized' else 'released' end,
    finalized_at = now() where id = v_reservation.id returning * into v_reservation;
  return next v_reservation;
end;
$$;

create or replace function public.spec28_claim_fair_jobs(
  p_worker_id text, p_limit integer, p_now timestamptz
) returns setof public.platform_jobs
language plpgsql security definer set search_path = pg_catalog as $$
begin
  if p_worker_id is null or char_length(btrim(p_worker_id)) not between 1 and 128
    or p_limit not between 1 and 100 then raise exception 'INVALID_JOB_CLAIM'; end if;
  return query
  with ranked as (
    select j.id, row_number() over (
      partition by j.organization_id order by j.priority_band, j.available_at, j.id
    ) as organization_rank
    from public.platform_jobs j
    join public.organizations o on o.id = j.organization_id and o.status = 'active'
    where j.state in ('queued', 'retryable') and j.available_at <= p_now
  ), candidates as (
    select j.id from public.platform_jobs j join ranked r on r.id = j.id
    order by r.organization_rank, j.priority_band, j.available_at, j.organization_id, j.id
    limit p_limit for update of j skip locked
  )
  update public.platform_jobs j set state = 'processing', locked_by = p_worker_id,
    locked_at = p_now, attempts = j.attempts + 1, updated_at = p_now, version = j.version + 1
  from candidates c where j.id = c.id returning j.*;
end;
$$;

alter table public.audit_events enable row level security;
alter table public.usage_events enable row level security;
alter table public.organization_rate_limit_buckets enable row level security;
alter table public.platform_rate_limit_buckets enable row level security;
alter table public.quota_snapshots enable row level security;
alter table public.usage_reservations enable row level security;
alter table public.platform_jobs enable row level security;
alter table public.deletion_tombstones enable row level security;
alter table public.recovery_evidence enable row level security;

alter table public.audit_events force row level security;
alter table public.usage_events force row level security;
alter table public.organization_rate_limit_buckets force row level security;
alter table public.platform_rate_limit_buckets force row level security;
alter table public.quota_snapshots force row level security;
alter table public.usage_reservations force row level security;
alter table public.platform_jobs force row level security;
alter table public.deletion_tombstones force row level security;
alter table public.recovery_evidence force row level security;

revoke all on public.audit_events, public.usage_events,
  public.organization_rate_limit_buckets, public.platform_rate_limit_buckets,
  public.quota_snapshots, public.usage_reservations, public.platform_jobs,
  public.deletion_tombstones, public.recovery_evidence from public, anon, authenticated;
grant select, insert on public.audit_events, public.usage_events,
  public.deletion_tombstones, public.recovery_evidence to service_role;
grant select, insert, update, delete on public.organization_rate_limit_buckets,
  public.platform_rate_limit_buckets, public.quota_snapshots,
  public.usage_reservations, public.platform_jobs to service_role;

revoke all on function public.spec28_prevent_mutation() from public, anon, authenticated;
revoke all on function public.spec28_consume_organization_rate_limit(uuid, text, bytea, integer, integer, integer, timestamptz)
  from public, anon, authenticated;
revoke all on function public.spec28_consume_platform_rate_limit(text, bytea, integer, integer, integer, timestamptz)
  from public, anon, authenticated;
revoke all on function public.spec28_record_usage(uuid, text, text, bigint, text, text, uuid, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.spec28_reserve_quota(uuid, text, text, bigint, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.spec28_finalize_quota(uuid, uuid, boolean, text, text, uuid, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.spec28_claim_fair_jobs(text, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.spec28_consume_organization_rate_limit(uuid, text, bytea, integer, integer, integer, timestamptz)
  to service_role;
grant execute on function public.spec28_consume_platform_rate_limit(text, bytea, integer, integer, integer, timestamptz)
  to service_role;
grant execute on function public.spec28_record_usage(uuid, text, text, bigint, text, text, uuid, text, text, jsonb)
  to service_role;
grant execute on function public.spec28_reserve_quota(uuid, text, text, bigint, text, timestamptz)
  to service_role;
grant execute on function public.spec28_finalize_quota(uuid, uuid, boolean, text, text, uuid, text, text, jsonb)
  to service_role;
grant execute on function public.spec28_claim_fair_jobs(text, integer, timestamptz)
  to service_role;
