-- SPEC-30 / MT-SPEC-06: organization-owned property drafts, immutable revisions,
-- durable submission runs, provider intents, lifecycle transitions, and history.
-- This migration is additive. SPEC-34 owns legacy adjudication and cutover.

create extension if not exists pgcrypto;

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_code text not null check (property_code ~ '^PROP-[0-9]{6,12}$'),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  current_revision_id uuid,
  open_draft_id uuid,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  updated_by_user_id uuid not null references auth.users(id) on delete restrict,
  assigned_to_user_id uuid references auth.users(id) on delete restrict,
  search_text text not null default '' check (octet_length(search_text) <= 4096),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  version integer not null default 1 check (version > 0),
  unique (id, organization_id),
  unique (organization_id, property_code),
  foreign key (organization_id, created_by_user_id)
    references public.organization_memberships(organization_id, user_id) on delete restrict,
  foreign key (organization_id, updated_by_user_id)
    references public.organization_memberships(organization_id, user_id) on delete restrict,
  foreign key (organization_id, assigned_to_user_id)
    references public.organization_memberships(organization_id, user_id) on delete restrict,
  check ((status = 'draft' and current_revision_id is null and archived_at is null)
    or (status = 'active' and current_revision_id is not null and archived_at is null)
    or (status = 'archived' and current_revision_id is not null and archived_at is not null))
);

create table public.property_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null,
  purpose text not null check (purpose in ('create', 'edit')),
  base_revision_id uuid,
  partial_payload jsonb not null default '{}'::jsonb,
  schema_version text not null check (char_length(schema_version) between 1 and 64),
  status text not null default 'open'
    check (status in ('open', 'finalizing', 'finalized', 'abandoned', 'expired')),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  updated_by_user_id uuid not null references auth.users(id) on delete restrict,
  actor_name_snapshot text not null check (char_length(btrim(actor_name_snapshot)) between 1 and 160),
  actor_email_snapshot text not null check (char_length(btrim(actor_email_snapshot)) between 3 and 320),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  finalized_at timestamptz,
  version integer not null default 1 check (version > 0),
  unique (id, organization_id),
  unique (id, organization_id, property_id),
  foreign key (property_id, organization_id)
    references public.properties(id, organization_id) on delete restrict,
  foreign key (organization_id, created_by_user_id)
    references public.organization_memberships(organization_id, user_id) on delete restrict,
  foreign key (organization_id, updated_by_user_id)
    references public.organization_memberships(organization_id, user_id) on delete restrict,
  check (jsonb_typeof(partial_payload) = 'object' and octet_length(partial_payload::text) <= 262144),
  check (expires_at > created_at),
  check ((status = 'finalized') = (finalized_at is not null))
);

create table public.property_revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null,
  revision_number integer not null check (revision_number > 0),
  previous_revision_id uuid,
  source_draft_id uuid,
  schema_version text not null check (char_length(schema_version) between 1 and 64),
  payload jsonb not null,
  payload_checksum text not null check (payload_checksum ~ '^[0-9a-f]{64}$'),
  change_kind text not null check (change_kind in ('created', 'edited', 'corrected', 'restored')),
  change_summary jsonb not null default '{}'::jsonb,
  created_by_actor_type text not null check (created_by_actor_type in (
    'member', 'organization_api_key', 'platform_support', 'system_worker', 'migration'
  )),
  created_by_user_id uuid references auth.users(id) on delete restrict,
  actor_name_snapshot text,
  actor_email_snapshot text,
  request_id text not null check (request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (id, organization_id, property_id),
  unique (organization_id, property_id, revision_number),
  foreign key (property_id, organization_id)
    references public.properties(id, organization_id) on delete restrict,
  foreign key (previous_revision_id, organization_id, property_id)
    references public.property_revisions(id, organization_id, property_id) on delete restrict,
  foreign key (source_draft_id, organization_id, property_id)
    references public.property_drafts(id, organization_id, property_id) on delete restrict,
  check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 262144),
  check (jsonb_typeof(change_summary) = 'object' and octet_length(change_summary::text) <= 4096)
);

alter table public.properties add constraint properties_current_revision_fk
  foreign key (current_revision_id, organization_id, id)
  references public.property_revisions(id, organization_id, property_id)
  on delete restrict deferrable initially deferred;
alter table public.properties add constraint properties_open_draft_fk
  foreign key (open_draft_id, organization_id, id)
  references public.property_drafts(id, organization_id, property_id)
  on delete restrict deferrable initially deferred;
alter table public.property_drafts add constraint property_drafts_base_revision_fk
  foreign key (base_revision_id, organization_id, property_id)
  references public.property_revisions(id, organization_id, property_id) on delete restrict;

-- asset_id becomes a composite FK when SPEC-31 installs the shared asset registry.
create table public.property_revision_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null,
  revision_id uuid not null,
  asset_id uuid not null,
  role text not null check (role in ('image', 'video')),
  sort_order integer not null check (sort_order >= 0),
  is_cover boolean not null default false,
  associated_by_user_id uuid references auth.users(id) on delete restrict,
  associated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, revision_id, asset_id),
  unique (organization_id, revision_id, role, sort_order),
  foreign key (property_id, organization_id)
    references public.properties(id, organization_id) on delete restrict,
  foreign key (revision_id, organization_id, property_id)
    references public.property_revisions(id, organization_id, property_id) on delete restrict,
  foreign key (organization_id, associated_by_user_id)
    references public.organization_memberships(organization_id, user_id) on delete restrict,
  check (not is_cover or role = 'image')
);
create unique index property_revision_assets_one_cover_idx
  on public.property_revision_assets (organization_id, revision_id) where is_cover;

create table public.property_submission_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null,
  revision_id uuid not null,
  retry_of_run_id uuid,
  run_kind text not null check (run_kind in (
    'initial_publish', 'revision_publish', 'manual_retry', 'reconciliation'
  )),
  state text not null default 'queued' check (state in (
    'queued', 'processing', 'succeeded', 'partially_failed', 'failed', 'blocked', 'cancelled'
  )),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 160),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  requested_by_actor_type text not null check (requested_by_actor_type in (
    'member', 'organization_api_key', 'platform_support', 'system_worker', 'migration'
  )),
  requested_by_user_id uuid references auth.users(id) on delete restrict,
  requested_by_membership_id uuid,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  error_code text check (error_code is null or error_code ~ '^[A-Z0-9_]{1,64}$'),
  error_summary text check (error_summary is null or char_length(error_summary) <= 500),
  retriable boolean not null default true,
  request_id text not null check (request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  unique (id, organization_id),
  unique (id, organization_id, property_id, revision_id),
  unique (organization_id, run_kind, idempotency_key),
  foreign key (property_id, organization_id)
    references public.properties(id, organization_id) on delete restrict,
  foreign key (revision_id, organization_id, property_id)
    references public.property_revisions(id, organization_id, property_id) on delete restrict,
  foreign key (retry_of_run_id, organization_id, property_id, revision_id)
    references public.property_submission_runs(id, organization_id, property_id, revision_id) on delete restrict,
  foreign key (requested_by_membership_id, organization_id)
    references public.organization_memberships(id, organization_id) on delete restrict
);

create table public.property_submission_run_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  run_id uuid not null,
  property_id uuid not null,
  revision_id uuid not null,
  step_key text not null check (step_key in (
    'asset_export', 'drive_folder', 'sheets_projection', 'make_delivery'
  )),
  state text not null default 'pending'
    check (state in ('pending', 'processing', 'succeeded', 'failed', 'blocked', 'skipped')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  integration_configuration_reference text,
  delivery_reference text,
  receipt_reference text,
  safe_external_id text check (safe_external_id is null or char_length(safe_external_id) <= 240),
  error_code text check (error_code is null or error_code ~ '^[A-Z0-9_]{1,64}$'),
  error_summary text check (error_summary is null or char_length(error_summary) <= 500),
  retriable boolean not null default true,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  unique (id, organization_id),
  unique (id, organization_id, run_id, property_id, revision_id),
  unique (organization_id, run_id, step_key),
  unique (organization_id, step_key, idempotency_key),
  foreign key (run_id, organization_id, property_id, revision_id)
    references public.property_submission_runs(id, organization_id, property_id, revision_id) on delete restrict,
  foreign key (property_id, organization_id)
    references public.properties(id, organization_id) on delete restrict,
  foreign key (revision_id, organization_id, property_id)
    references public.property_revisions(id, organization_id, property_id) on delete restrict
);

create table public.property_provider_intents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null,
  revision_id uuid not null,
  run_id uuid not null,
  step_id uuid not null,
  provider_key text not null check (provider_key in ('assets', 'google_drive', 'google_sheets', 'make')),
  event_key text not null check (event_key in ('property.created', 'property.revised')),
  state text not null default 'pending' check (state in (
    'pending', 'leased', 'delivered', 'failed', 'blocked_reconciliation', 'cancelled'
  )),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  payload_projection jsonb not null,
  integration_configuration_reference text,
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  unique (id, organization_id),
  unique (organization_id, provider_key, idempotency_key),
  foreign key (property_id, organization_id)
    references public.properties(id, organization_id) on delete restrict,
  foreign key (revision_id, organization_id, property_id)
    references public.property_revisions(id, organization_id, property_id) on delete restrict,
  foreign key (run_id, organization_id, property_id, revision_id)
    references public.property_submission_runs(id, organization_id, property_id, revision_id) on delete restrict,
  foreign key (step_id, organization_id, run_id, property_id, revision_id)
    references public.property_submission_run_steps(id, organization_id, run_id, property_id, revision_id) on delete restrict,
  check (jsonb_typeof(payload_projection) = 'object' and octet_length(payload_projection::text) <= 262144)
);

create table public.property_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null,
  revision_id uuid,
  run_id uuid,
  event_type text not null check (event_type in (
    'draft_created', 'draft_updated', 'draft_abandoned', 'draft_finalized',
    'property_created', 'property_revised', 'property_archived', 'property_reactivated',
    'assignment_changed', 'run_queued', 'run_completed', 'run_failed', 'run_retried',
    'reconciliation_completed'
  )),
  actor_type text not null check (actor_type in (
    'member', 'organization_api_key', 'platform_support', 'system_worker', 'migration'
  )),
  actor_user_id uuid references auth.users(id) on delete restrict,
  actor_membership_id uuid,
  request_id text not null check (request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (property_id, organization_id)
    references public.properties(id, organization_id) on delete restrict,
  foreign key (revision_id, organization_id, property_id)
    references public.property_revisions(id, organization_id, property_id) on delete restrict,
  foreign key (run_id, organization_id, property_id, revision_id)
    references public.property_submission_runs(id, organization_id, property_id, revision_id) on delete restrict,
  foreign key (actor_membership_id, organization_id)
    references public.organization_memberships(id, organization_id) on delete restrict,
  check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 4096)
);

create index properties_tenant_timeline_idx
  on public.properties (organization_id, updated_at desc, id desc);
create index properties_tenant_status_idx
  on public.properties (organization_id, status, updated_at desc, id desc);
create index properties_tenant_assignee_idx
  on public.properties (organization_id, assigned_to_user_id, updated_at desc, id desc);
create index properties_tenant_creator_idx
  on public.properties (organization_id, created_by_user_id, updated_at desc, id desc);
create index property_drafts_tenant_open_idx
  on public.property_drafts (organization_id, status, updated_at desc, id desc);
create index property_revisions_tenant_history_idx
  on public.property_revisions (organization_id, property_id, revision_number desc);
create index property_runs_tenant_queue_idx
  on public.property_submission_runs (organization_id, state, available_at, id);
create index property_steps_tenant_queue_idx
  on public.property_submission_run_steps (organization_id, state, updated_at, id);
create index property_intents_tenant_queue_idx
  on public.property_provider_intents (organization_id, state, available_at, id);
create index property_events_tenant_timeline_idx
  on public.property_events (organization_id, property_id, occurred_at desc, id desc);

alter table public.property_drafts
  add column creation_idempotency_key text check (
    creation_idempotency_key is null or char_length(creation_idempotency_key) between 8 and 160
  ),
  add column creation_fingerprint text check (
    creation_fingerprint is null or creation_fingerprint ~ '^[0-9a-f]{64}$'
  );
create unique index property_drafts_creation_idempotency_idx
  on public.property_drafts (organization_id, created_by_user_id, creation_idempotency_key)
  where creation_idempotency_key is not null;

create or replace function public.spec30_prevent_mutation()
returns trigger language plpgsql security invoker set search_path = pg_catalog as $$
begin
  raise exception 'IMMUTABLE_PROPERTY_HISTORY';
end;
$$;
create trigger property_revisions_append_only before update or delete on public.property_revisions
for each row execute function public.spec30_prevent_mutation();
create trigger property_revision_assets_append_only before update or delete on public.property_revision_assets
for each row execute function public.spec30_prevent_mutation();
create trigger property_events_append_only before update or delete on public.property_events
for each row execute function public.spec30_prevent_mutation();

create or replace function public.spec30_protect_property_ownership()
returns trigger language plpgsql security invoker set search_path = pg_catalog as $$
begin
  if new.id <> old.id or new.organization_id <> old.organization_id
    or new.property_code <> old.property_code or new.created_by_user_id <> old.created_by_user_id then
    raise exception 'PROPERTY_OWNERSHIP_IMMUTABLE';
  end if;
  return new;
end;
$$;
create trigger properties_ownership_immutable before update on public.properties
for each row execute function public.spec30_protect_property_ownership();

create or replace function public.spec30_create_property_draft(
  p_organization_id uuid, p_schema_version text, p_partial_payload jsonb,
  p_idempotency_key text, p_request_fingerprint text, p_request_id text,
  p_actor_user_id uuid, p_actor_membership_id uuid, p_actor_name text,
  p_actor_email text, p_expires_at timestamptz
) returns setof public.property_drafts
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_property public.properties%rowtype;
  v_draft public.property_drafts%rowtype;
  v_existing public.property_drafts%rowtype;
  v_code_number bigint;
begin
  if jsonb_typeof(p_partial_payload) <> 'object'
    or octet_length(p_partial_payload::text) > 262144
    or char_length(p_idempotency_key) not between 8 and 160
    or p_request_fingerprint !~ '^[0-9a-f]{64}$' or p_expires_at <= clock_timestamp() then
    raise exception 'INVALID_PROPERTY_DRAFT';
  end if;
  perform 1 from public.organization_memberships where id = p_actor_membership_id
    and organization_id = p_organization_id and user_id = p_actor_user_id and status = 'active';
  if not found then raise exception 'FORBIDDEN'; end if;
  select * into v_existing from public.property_drafts
    where organization_id = p_organization_id and created_by_user_id = p_actor_user_id
      and creation_idempotency_key = p_idempotency_key;
  if found then
    if v_existing.creation_fingerprint <> p_request_fingerprint then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return next v_existing;
    return;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_organization_id::text || ':property_code', 0)
  );
  select coalesce(max(substring(property_code from 6)::bigint), 0) + 1
    into v_code_number from public.properties where organization_id = p_organization_id;
  insert into public.properties (
    organization_id, property_code, created_by_user_id, updated_by_user_id
  ) values (
    p_organization_id, 'PROP-' || lpad(v_code_number::text, 6, '0'),
    p_actor_user_id, p_actor_user_id
  ) returning * into v_property;
  insert into public.property_drafts (
    organization_id, property_id, purpose, partial_payload, schema_version,
    created_by_user_id, updated_by_user_id, actor_name_snapshot,
    actor_email_snapshot, expires_at, creation_idempotency_key, creation_fingerprint
  ) values (
    p_organization_id, v_property.id, 'create', p_partial_payload, p_schema_version,
    p_actor_user_id, p_actor_user_id, p_actor_name, p_actor_email, p_expires_at,
    p_idempotency_key, p_request_fingerprint
  ) returning * into v_draft;
  update public.properties set open_draft_id = v_draft.id where id = v_property.id
    and organization_id = p_organization_id;
  insert into public.property_events (
    organization_id, property_id, event_type, actor_type, actor_user_id,
    actor_membership_id, request_id, metadata
  ) values (
    p_organization_id, v_property.id, 'draft_created', 'member', p_actor_user_id,
    p_actor_membership_id, p_request_id, jsonb_build_object('draft_id', v_draft.id)
  );
  return next v_draft;
end;
$$;

create or replace function public.spec30_update_property_draft(
  p_organization_id uuid, p_draft_id uuid, p_expected_version integer,
  p_partial_payload jsonb, p_request_id text, p_actor_user_id uuid,
  p_actor_membership_id uuid
) returns setof public.property_drafts
language plpgsql security definer set search_path = pg_catalog as $$
declare v_draft public.property_drafts%rowtype;
begin
  if p_expected_version < 1 or jsonb_typeof(p_partial_payload) <> 'object'
    or octet_length(p_partial_payload::text) > 262144 then raise exception 'INVALID_PROPERTY_DRAFT'; end if;
  perform 1 from public.organization_memberships where id = p_actor_membership_id
    and organization_id = p_organization_id and user_id = p_actor_user_id and status = 'active';
  if not found then raise exception 'FORBIDDEN'; end if;
  select * into v_draft from public.property_drafts where id = p_draft_id
    and organization_id = p_organization_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_draft.status <> 'open' then raise exception 'DRAFT_STATE_CONFLICT'; end if;
  if v_draft.version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  update public.property_drafts set partial_payload = p_partial_payload,
    updated_by_user_id = p_actor_user_id, updated_at = clock_timestamp(), version = version + 1
    where id = p_draft_id and organization_id = p_organization_id returning * into v_draft;
  insert into public.property_events (
    organization_id, property_id, event_type, actor_type, actor_user_id,
    actor_membership_id, request_id, metadata
  ) values (
    p_organization_id, v_draft.property_id, 'draft_updated', 'member', p_actor_user_id,
    p_actor_membership_id, p_request_id, jsonb_build_object('draft_id', v_draft.id, 'version', v_draft.version)
  );
  return next v_draft;
end;
$$;

create or replace function public.spec30_finalize_property_draft(
  p_organization_id uuid, p_draft_id uuid, p_expected_draft_version integer,
  p_expected_property_version integer, p_payload jsonb, p_schema_version text,
  p_change_kind text, p_idempotency_key text, p_request_fingerprint text,
  p_request_id text, p_actor_user_id uuid, p_actor_membership_id uuid,
  p_actor_name text, p_actor_email text
) returns setof public.property_submission_runs
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_draft public.property_drafts%rowtype;
  v_property public.properties%rowtype;
  v_revision public.property_revisions%rowtype;
  v_run public.property_submission_runs%rowtype;
  v_existing public.property_submission_runs%rowtype;
  v_revision_number integer;
  v_now timestamptz := clock_timestamp();
  v_event text;
  v_kind text;
begin
  if p_expected_draft_version < 1 or p_expected_property_version < 1
    or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 262144
    or p_change_kind not in ('created', 'edited', 'corrected', 'restored')
    or char_length(p_idempotency_key) not between 8 and 160
    or p_request_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_PROPERTY_SUBMISSION'; end if;
  perform 1 from public.organization_memberships where id = p_actor_membership_id
    and organization_id = p_organization_id and user_id = p_actor_user_id and status = 'active';
  if not found then raise exception 'FORBIDDEN'; end if;
  select * into v_draft from public.property_drafts where id = p_draft_id
    and organization_id = p_organization_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into v_property from public.properties where id = v_draft.property_id
    and organization_id = p_organization_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into v_existing from public.property_submission_runs where organization_id = p_organization_id
    and idempotency_key = p_idempotency_key and run_kind in ('initial_publish', 'revision_publish');
  if found then
    if v_existing.request_fingerprint <> p_request_fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return next v_existing;
    return;
  end if;
  if v_draft.version <> p_expected_draft_version or v_property.version <> p_expected_property_version
    then raise exception 'VERSION_CONFLICT'; end if;
  if v_draft.status <> 'open' then raise exception 'DRAFT_STATE_CONFLICT'; end if;
  if v_property.status = 'archived' then raise exception 'INVALID_STATE'; end if;
  if v_draft.purpose = 'edit' and v_draft.base_revision_id is distinct from v_property.current_revision_id
    then raise exception 'VERSION_CONFLICT'; end if;
  select coalesce(max(revision_number), 0) + 1 into v_revision_number
    from public.property_revisions where organization_id = p_organization_id and property_id = v_property.id;
  insert into public.property_revisions (
    organization_id, property_id, revision_number, previous_revision_id, source_draft_id,
    schema_version, payload, payload_checksum, change_kind, change_summary,
    created_by_actor_type, created_by_user_id, actor_name_snapshot, actor_email_snapshot, request_id
  ) values (
    p_organization_id, v_property.id, v_revision_number, v_property.current_revision_id, v_draft.id,
    p_schema_version, p_payload,
    encode(public.digest(pg_catalog.convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex'),
    p_change_kind, jsonb_build_object('changed_field_count', jsonb_object_length(p_payload)),
    'member', p_actor_user_id, p_actor_name, p_actor_email, p_request_id
  ) returning * into v_revision;
  v_kind := case when v_revision_number = 1 then 'initial_publish' else 'revision_publish' end;
  v_event := case when v_revision_number = 1 then 'property_created' else 'property_revised' end;
  insert into public.property_submission_runs (
    organization_id, property_id, revision_id, run_kind, idempotency_key, request_fingerprint,
    requested_by_actor_type, requested_by_user_id, requested_by_membership_id, request_id
  ) values (
    p_organization_id, v_property.id, v_revision.id, v_kind, p_idempotency_key,
    p_request_fingerprint, 'member', p_actor_user_id, p_actor_membership_id, p_request_id
  ) returning * into v_run;
  insert into public.property_submission_run_steps (
    organization_id, run_id, property_id, revision_id, step_key, idempotency_key
  ) select p_organization_id, v_run.id, v_property.id, v_revision.id, step_key,
    p_idempotency_key || ':' || step_key
  from unnest(array['asset_export', 'drive_folder', 'sheets_projection', 'make_delivery']) as step_key;
  insert into public.property_provider_intents (
    organization_id, property_id, revision_id, run_id, step_id, provider_key,
    event_key, idempotency_key, payload_projection
  ) select p_organization_id, v_property.id, v_revision.id, v_run.id, step.id,
    case step.step_key when 'asset_export' then 'assets' when 'drive_folder' then 'google_drive'
      when 'sheets_projection' then 'google_sheets' else 'make' end,
    case when v_revision_number = 1 then 'property.created' else 'property.revised' end,
    step.idempotency_key, jsonb_build_object(
      'property_id', v_property.id, 'property_code', v_property.property_code,
      'revision_id', v_revision.id, 'revision_number', v_revision_number,
      'schema_version', p_schema_version
    )
  from public.property_submission_run_steps step
  where step.run_id = v_run.id and step.organization_id = p_organization_id;
  update public.property_drafts set status = 'finalized', finalized_at = v_now,
    updated_at = v_now, version = version + 1
    where id = v_draft.id and organization_id = p_organization_id;
  update public.properties set status = 'active', current_revision_id = v_revision.id,
    open_draft_id = null, updated_by_user_id = p_actor_user_id, updated_at = v_now,
    version = version + 1 where id = v_property.id and organization_id = p_organization_id;
  insert into public.property_events (
    organization_id, property_id, revision_id, run_id, event_type, actor_type,
    actor_user_id, actor_membership_id, request_id, metadata
  ) values (
    p_organization_id, v_property.id, v_revision.id, v_run.id, v_event, 'member',
    p_actor_user_id, p_actor_membership_id, p_request_id,
    jsonb_build_object('revision_number', v_revision_number)
  );
  insert into public.audit_events (
    organization_id, request_id, actor_type, actor_user_id, actor_membership_id,
    action, target_type, target_id, outcome, source, changed_fields, metadata
  ) values (
    p_organization_id, p_request_id, 'member', p_actor_user_id, p_actor_membership_id,
    'properties.revision_published', 'property', v_property.id, 'succeeded', 'api.properties',
    array['current_revision_id', 'status'], jsonb_build_object('revision_id', v_revision.id)
  );
  insert into public.usage_events (
    organization_id, idempotency_key, metric_key, quantity, unit, source_type,
    source_id, actor_type, request_id, metadata
  ) values (
    p_organization_id, p_idempotency_key, 'properties.revisions', 1, 'count',
    'property', v_property.id, 'member', p_request_id,
    jsonb_build_object('revision_id', v_revision.id)
  );
  return next v_run;
end;
$$;

alter table public.property_events
  add column idempotency_key text check (
    idempotency_key is null or char_length(idempotency_key) between 8 and 160
  ),
  add column request_fingerprint text check (
    request_fingerprint is null or request_fingerprint ~ '^[0-9a-f]{64}$'
  );
create unique index property_events_idempotency_idx
  on public.property_events (organization_id, event_type, idempotency_key)
  where idempotency_key is not null;

create or replace function public.spec30_create_edit_draft(
  p_organization_id uuid, p_property_id uuid, p_expected_property_version integer,
  p_schema_version text, p_idempotency_key text, p_request_fingerprint text,
  p_request_id text, p_actor_user_id uuid, p_actor_membership_id uuid,
  p_actor_name text, p_actor_email text, p_expires_at timestamptz
) returns setof public.property_drafts
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_property public.properties%rowtype;
  v_revision public.property_revisions%rowtype;
  v_draft public.property_drafts%rowtype;
  v_existing public.property_drafts%rowtype;
begin
  perform 1 from public.organization_memberships where id = p_actor_membership_id
    and organization_id = p_organization_id and user_id = p_actor_user_id and status = 'active';
  if not found then raise exception 'FORBIDDEN'; end if;
  select * into v_existing from public.property_drafts
    where organization_id = p_organization_id and created_by_user_id = p_actor_user_id
      and creation_idempotency_key = p_idempotency_key;
  if found then
    if v_existing.creation_fingerprint <> p_request_fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return next v_existing;
    return;
  end if;
  select * into v_property from public.properties where id = p_property_id
    and organization_id = p_organization_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_property.version <> p_expected_property_version then raise exception 'VERSION_CONFLICT'; end if;
  if v_property.status <> 'active' or v_property.current_revision_id is null
    then raise exception 'INVALID_STATE'; end if;
  if v_property.open_draft_id is not null then raise exception 'DRAFT_STATE_CONFLICT'; end if;
  select * into v_revision from public.property_revisions where id = v_property.current_revision_id
    and property_id = v_property.id and organization_id = p_organization_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  insert into public.property_drafts (
    organization_id, property_id, purpose, base_revision_id, partial_payload,
    schema_version, created_by_user_id, updated_by_user_id, actor_name_snapshot,
    actor_email_snapshot, expires_at, creation_idempotency_key, creation_fingerprint
  ) values (
    p_organization_id, v_property.id, 'edit', v_revision.id, v_revision.payload,
    p_schema_version, p_actor_user_id, p_actor_user_id, p_actor_name, p_actor_email,
    p_expires_at, p_idempotency_key, p_request_fingerprint
  ) returning * into v_draft;
  update public.properties set open_draft_id = v_draft.id, updated_at = clock_timestamp(),
    version = version + 1 where id = v_property.id and organization_id = p_organization_id;
  insert into public.property_events (
    organization_id, property_id, revision_id, event_type, actor_type, actor_user_id,
    actor_membership_id, request_id, metadata, idempotency_key, request_fingerprint
  ) values (
    p_organization_id, v_property.id, v_revision.id, 'draft_created', 'member',
    p_actor_user_id, p_actor_membership_id, p_request_id,
    jsonb_build_object('draft_id', v_draft.id, 'purpose', 'edit'),
    p_idempotency_key, p_request_fingerprint
  );
  return next v_draft;
end;
$$;

create or replace function public.spec30_transition_property(
  p_organization_id uuid, p_property_id uuid, p_expected_version integer,
  p_next_status text, p_idempotency_key text, p_request_fingerprint text,
  p_request_id text, p_actor_user_id uuid, p_actor_membership_id uuid
) returns setof public.properties
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_property public.properties%rowtype;
  v_existing public.property_events%rowtype;
  v_now timestamptz := clock_timestamp();
  v_event_type text;
begin
  perform 1 from public.organization_memberships where id = p_actor_membership_id
    and organization_id = p_organization_id and user_id = p_actor_user_id
    and status = 'active' and role in ('owner', 'admin');
  if not found then raise exception 'FORBIDDEN'; end if;
  v_event_type := case when p_next_status = 'archived' then 'property_archived'
    when p_next_status = 'active' then 'property_reactivated' else null end;
  if v_event_type is null then raise exception 'INVALID_STATE'; end if;
  select * into v_existing from public.property_events where organization_id = p_organization_id
    and event_type = v_event_type and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_fingerprint <> p_request_fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    select * into v_property from public.properties where id = v_existing.property_id
      and organization_id = p_organization_id;
    return next v_property;
    return;
  end if;
  select * into v_property from public.properties where id = p_property_id
    and organization_id = p_organization_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_property.version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if not ((v_property.status = 'active' and p_next_status = 'archived')
    or (v_property.status = 'archived' and p_next_status = 'active'))
    then raise exception 'INVALID_STATE'; end if;
  update public.properties set status = p_next_status,
    archived_at = case when p_next_status = 'archived' then v_now else null end,
    updated_by_user_id = p_actor_user_id, updated_at = v_now, version = version + 1
    where id = p_property_id and organization_id = p_organization_id returning * into v_property;
  insert into public.property_events (
    organization_id, property_id, revision_id, event_type, actor_type, actor_user_id,
    actor_membership_id, request_id, idempotency_key, request_fingerprint
  ) values (
    p_organization_id, p_property_id, v_property.current_revision_id, v_event_type,
    'member', p_actor_user_id, p_actor_membership_id, p_request_id,
    p_idempotency_key, p_request_fingerprint
  );
  insert into public.audit_events (
    organization_id, request_id, actor_type, actor_user_id, actor_membership_id,
    action, target_type, target_id, outcome, source, changed_fields, metadata
  ) values (
    p_organization_id, p_request_id, 'member', p_actor_user_id, p_actor_membership_id,
    case when p_next_status = 'archived' then 'properties.archived' else 'properties.reactivated' end,
    'property', p_property_id, 'succeeded', 'api.properties', array['status'],
    jsonb_build_object('version', v_property.version)
  );
  return next v_property;
end;
$$;

create or replace function public.spec30_retry_property_run(
  p_organization_id uuid, p_run_id uuid, p_idempotency_key text,
  p_request_fingerprint text, p_request_id text, p_actor_user_id uuid,
  p_actor_membership_id uuid
) returns setof public.property_submission_runs
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_source public.property_submission_runs%rowtype;
  v_run public.property_submission_runs%rowtype;
  v_existing public.property_submission_runs%rowtype;
begin
  perform 1 from public.organization_memberships where id = p_actor_membership_id
    and organization_id = p_organization_id and user_id = p_actor_user_id and status = 'active';
  if not found then raise exception 'FORBIDDEN'; end if;
  select * into v_source from public.property_submission_runs where id = p_run_id
    and organization_id = p_organization_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into v_existing from public.property_submission_runs where organization_id = p_organization_id
    and run_kind = 'manual_retry' and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_fingerprint <> p_request_fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return next v_existing;
    return;
  end if;
  if not v_source.retriable or v_source.state not in ('failed', 'partially_failed', 'blocked')
    then raise exception 'INVALID_STATE'; end if;
  insert into public.property_submission_runs (
    organization_id, property_id, revision_id, retry_of_run_id, run_kind,
    idempotency_key, request_fingerprint, requested_by_actor_type,
    requested_by_user_id, requested_by_membership_id, request_id
  ) values (
    p_organization_id, v_source.property_id, v_source.revision_id, v_source.id,
    'manual_retry', p_idempotency_key, p_request_fingerprint, 'member',
    p_actor_user_id, p_actor_membership_id, p_request_id
  ) returning * into v_run;
  insert into public.property_submission_run_steps (
    organization_id, run_id, property_id, revision_id, step_key, idempotency_key
  ) select p_organization_id, v_run.id, v_source.property_id, v_source.revision_id,
    source_step.step_key, p_idempotency_key || ':' || source_step.step_key
  from public.property_submission_run_steps source_step
  where source_step.organization_id = p_organization_id and source_step.run_id = v_source.id
    and source_step.state in ('failed', 'blocked');
  insert into public.property_provider_intents (
    organization_id, property_id, revision_id, run_id, step_id, provider_key,
    event_key, idempotency_key, payload_projection
  ) select p_organization_id, v_run.property_id, v_run.revision_id, v_run.id, retry_step.id,
    source_intent.provider_key, source_intent.event_key, retry_step.idempotency_key,
    source_intent.payload_projection
  from public.property_submission_run_steps retry_step
  join public.property_submission_run_steps source_step
    on source_step.organization_id = p_organization_id and source_step.run_id = v_source.id
    and source_step.step_key = retry_step.step_key
  join public.property_provider_intents source_intent
    on source_intent.organization_id = p_organization_id and source_intent.step_id = source_step.id
  where retry_step.organization_id = p_organization_id and retry_step.run_id = v_run.id;
  insert into public.property_events (
    organization_id, property_id, revision_id, run_id, event_type, actor_type,
    actor_user_id, actor_membership_id, request_id, metadata, idempotency_key,
    request_fingerprint
  ) values (
    p_organization_id, v_source.property_id, v_source.revision_id, v_run.id,
    'run_retried', 'member', p_actor_user_id, p_actor_membership_id, p_request_id,
    jsonb_build_object('retry_of_run_id', v_source.id), p_idempotency_key,
    p_request_fingerprint
  );
  insert into public.audit_events (
    organization_id, request_id, actor_type, actor_user_id, actor_membership_id,
    action, target_type, target_id, outcome, source, changed_fields, metadata
  ) values (
    p_organization_id, p_request_id, 'member', p_actor_user_id, p_actor_membership_id,
    'properties.run_retried', 'property_run', v_run.id, 'succeeded', 'api.properties',
    array['state'], jsonb_build_object('retry_of_run_id', v_source.id)
  );
  return next v_run;
end;
$$;

-- Browser roles have no table or RPC access. Typed backend contexts use
-- service_role and retain explicit organization predicates and row assertions.
do $$
declare v_table text;
begin
  foreach v_table in array array[
    'properties', 'property_drafts', 'property_revisions', 'property_revision_assets',
    'property_submission_runs', 'property_submission_run_steps',
    'property_provider_intents', 'property_events'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('alter table public.%I force row level security', v_table);
    execute format('revoke all on table public.%I from public, anon, authenticated', v_table);
    execute format('grant select, insert, update on table public.%I to service_role', v_table);
  end loop;
end;
$$;

revoke all on function public.spec30_create_property_draft(uuid, text, jsonb, text, text, text, uuid, uuid, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.spec30_create_property_draft(uuid, text, jsonb, text, text, text, uuid, uuid, text, text, timestamptz)
  to service_role;
revoke all on function public.spec30_update_property_draft(uuid, uuid, integer, jsonb, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.spec30_update_property_draft(uuid, uuid, integer, jsonb, text, uuid, uuid)
  to service_role;
revoke all on function public.spec30_finalize_property_draft(uuid, uuid, integer, integer, jsonb, text, text, text, text, text, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.spec30_finalize_property_draft(uuid, uuid, integer, integer, jsonb, text, text, text, text, text, uuid, uuid, text, text)
  to service_role;
revoke all on function public.spec30_create_edit_draft(uuid, uuid, integer, text, text, text, text, uuid, uuid, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.spec30_create_edit_draft(uuid, uuid, integer, text, text, text, text, uuid, uuid, text, text, timestamptz)
  to service_role;
revoke all on function public.spec30_transition_property(uuid, uuid, integer, text, text, text, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.spec30_transition_property(uuid, uuid, integer, text, text, text, text, uuid, uuid)
  to service_role;
revoke all on function public.spec30_retry_property_run(uuid, uuid, text, text, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.spec30_retry_property_run(uuid, uuid, text, text, text, uuid, uuid)
  to service_role;

comment on table public.property_revisions is
  'SPEC-30 immutable canonical property history.';
comment on table public.property_provider_intents is
  'SPEC-30 durable provider projections; credentials and raw responses are forbidden.';
comment on table public.property_revision_assets is
  'SPEC-30 private asset authorization edges; the shared asset FK follows SPEC-31.';
