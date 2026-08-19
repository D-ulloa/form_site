-- SPEC-29 / MT-SPEC-05: organization-owned contracts, immutable revisions,
-- external links, asset associations, branding projection, and template versions.
-- Legacy columns remain nullable during the additive phase; SPEC-34 owns backfill
-- certification and the final NOT NULL/drop-compatibility cutover.

create extension if not exists pgcrypto;

-- Global catalog content is deliberately distinct from tenant-owned content.
create table public.global_contract_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique check (template_key ~ '^[a-z0-9][a-z0-9_-]{0,127}$'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 160),
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  created_by_user_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0)
);

create table public.global_contract_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.global_contract_templates(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  state text not null check (state in ('draft', 'published', 'retired')),
  schema_definition jsonb not null,
  schema_fingerprint text not null check (schema_fingerprint ~ '^[0-9a-f]{64}$'),
  generation_configuration jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  published_by_user_id uuid references auth.users(id) on delete restrict,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  unique (template_id, version_number),
  unique (id, template_id),
  check (jsonb_typeof(schema_definition) = 'object' and octet_length(schema_definition::text) <= 262144),
  check (jsonb_typeof(generation_configuration) = 'object' and octet_length(generation_configuration::text) <= 32768),
  check ((state = 'draft' and published_at is null) or (state in ('published', 'retired') and published_at is not null))
);

create table public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  template_key text not null check (template_key ~ '^[a-z0-9][a-z0-9_-]{0,127}$'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 160),
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  created_by_membership_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  unique (organization_id, template_key),
  unique (id, organization_id),
  foreign key (created_by_membership_id, organization_id)
    references public.organization_memberships(id, organization_id) on delete restrict
);

create table public.contract_template_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  template_id uuid not null,
  version_number integer not null check (version_number > 0),
  state text not null check (state in ('draft', 'published', 'retired')),
  schema_definition jsonb not null,
  schema_fingerprint text not null check (schema_fingerprint ~ '^[0-9a-f]{64}$'),
  generation_configuration jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  published_by_membership_id uuid,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, template_id, version_number),
  unique (id, organization_id),
  foreign key (template_id, organization_id)
    references public.contract_templates(id, organization_id) on delete restrict,
  foreign key (published_by_membership_id, organization_id)
    references public.organization_memberships(id, organization_id) on delete restrict,
  check (jsonb_typeof(schema_definition) = 'object' and octet_length(schema_definition::text) <= 262144),
  check (jsonb_typeof(generation_configuration) = 'object' and octet_length(generation_configuration::text) <= 32768),
  check ((state = 'draft' and published_at is null) or (state in ('published', 'retired') and published_at is not null))
);

create table public.organization_contract_template_enablements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  global_template_version_id uuid,
  template_version_id uuid,
  state text not null default 'enabled' check (state in ('enabled', 'disabled')),
  unfinished_entry_policy text not null default 'preserve' check (unfinished_entry_policy in ('preserve', 'revoke')),
  enabled_by_membership_id uuid not null,
  enabled_at timestamptz not null default now(),
  disabled_by_membership_id uuid,
  disabled_at timestamptz,
  version integer not null default 1 check (version > 0),
  foreign key (global_template_version_id)
    references public.global_contract_template_versions(id) on delete restrict,
  foreign key (template_version_id, organization_id)
    references public.contract_template_versions(id, organization_id) on delete restrict,
  foreign key (enabled_by_membership_id, organization_id)
    references public.organization_memberships(id, organization_id) on delete restrict,
  foreign key (disabled_by_membership_id, organization_id)
    references public.organization_memberships(id, organization_id) on delete restrict,
  check ((global_template_version_id is not null)::integer + (template_version_id is not null)::integer = 1),
  check ((state = 'enabled' and disabled_at is null and disabled_by_membership_id is null)
    or (state = 'disabled' and disabled_at is not null and disabled_by_membership_id is not null))
);
create unique index organization_global_template_enablement_idx
  on public.organization_contract_template_enablements (organization_id, global_template_version_id)
  where global_template_version_id is not null;
create unique index organization_private_template_enablement_idx
  on public.organization_contract_template_enablements (organization_id, template_version_id)
  where template_version_id is not null;

alter table public.contract_entries
  add column organization_id uuid references public.organizations(id) on delete restrict,
  add column human_code text,
  add column template_version_id uuid,
  add column global_template_version_id uuid references public.global_contract_template_versions(id) on delete restrict,
  add column assigned_to_user_id uuid references auth.users(id) on delete restrict,
  add column updated_by_user_id uuid references auth.users(id) on delete restrict,
  add column current_user_revision_id uuid,
  add column current_client_revision_id uuid,
  add column branding_snapshot jsonb,
  add column generation_state text not null default 'idle'
    check (generation_state in ('idle', 'queued', 'processing', 'succeeded', 'partially_failed', 'failed')),
  add column updated_at timestamptz not null default now(),
  add column version integer not null default 1 check (version > 0);

alter table public.contract_entries alter column user_token_hash drop not null;
alter table public.contract_entries alter column client_token_hash drop not null;
alter table public.contract_entries drop constraint if exists contract_entries_user_token_hash_check;
alter table public.contract_entries drop constraint if exists contract_entries_client_token_hash_check;
alter table public.contract_entries add constraint contract_entries_template_scope_check
  check ((template_version_id is not null)::integer + (global_template_version_id is not null)::integer <= 1) not valid;
alter table public.contract_entries add constraint contract_entries_branding_snapshot_check
  check (branding_snapshot is null or (jsonb_typeof(branding_snapshot) = 'object' and octet_length(branding_snapshot::text) <= 4096)) not valid;
alter table public.contract_entries add constraint contract_entries_id_organization_unique unique (id, organization_id);
alter table public.contract_entries add constraint contract_entries_private_template_fk
  foreign key (template_version_id, organization_id)
  references public.contract_template_versions(id, organization_id) on delete restrict not valid;
alter table public.contract_entries add constraint contract_entries_assignee_membership_fk
  foreign key (organization_id, assigned_to_user_id)
  references public.organization_memberships(organization_id, user_id) on delete restrict not valid;
create unique index contract_entries_human_code_idx
  on public.contract_entries (organization_id, human_code) where human_code is not null;
create index contract_entries_tenant_timeline_idx
  on public.contract_entries (organization_id, created_at desc, id desc);
create index contract_entries_tenant_status_idx
  on public.contract_entries (organization_id, status, created_at desc, id desc);
create index contract_entries_tenant_assignee_idx
  on public.contract_entries (organization_id, assigned_to_user_id, created_at desc, id desc);
create index contract_entries_tenant_creator_idx
  on public.contract_entries (organization_id, created_by_user_id, created_at desc, id desc);

alter table public.contract_submissions
  add column organization_id uuid references public.organizations(id) on delete restrict,
  add column revision_number integer,
  add column predecessor_submission_id uuid,
  add column actor_type text,
  add column actor_user_id uuid references auth.users(id) on delete restrict,
  add column actor_membership_id uuid,
  add column external_capability_id uuid,
  add column api_key_id uuid,
  add column support_session_id uuid,
  add column request_id text,
  add column idempotency_key text,
  add column reason text,
  add column summary jsonb not null default '{}'::jsonb,
  add column payload_hash text;
alter table public.contract_submissions
  add constraint contract_submissions_id_organization_unique unique (id, organization_id),
  add constraint contract_submissions_entry_tenant_fk foreign key (entry_id, organization_id)
    references public.contract_entries(id, organization_id) on delete restrict not valid,
  add constraint contract_submissions_predecessor_tenant_fk foreign key (predecessor_submission_id, organization_id)
    references public.contract_submissions(id, organization_id) on delete restrict not valid,
  add constraint contract_submissions_actor_membership_fk foreign key (actor_membership_id, organization_id)
    references public.organization_memberships(id, organization_id) on delete restrict not valid,
  add constraint contract_submissions_revision_shape check (
    (organization_id is null and revision_number is null)
    or (organization_id is not null and revision_number > 0 and actor_type in (
      'member', 'organization_api_key', 'external_contract_link', 'platform_support', 'system_worker', 'migration'
    ) and request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
      and char_length(idempotency_key) between 8 and 160 and payload_hash ~ '^[0-9a-f]{64}$')
  ) not valid,
  add constraint contract_submissions_summary_bounded check (
    jsonb_typeof(summary) = 'object' and octet_length(summary::text) <= 2048
  ) not valid;
create unique index contract_submissions_tenant_revision_idx
  on public.contract_submissions (organization_id, entry_id, role, revision_number)
  where organization_id is not null;
create unique index contract_submissions_tenant_idempotency_idx
  on public.contract_submissions (organization_id, entry_id, idempotency_key)
  where organization_id is not null;
create index contract_submissions_tenant_history_idx
  on public.contract_submissions (organization_id, entry_id, role, revision_number desc);

alter table public.contract_entries add constraint contract_entries_current_user_revision_fk
  foreign key (current_user_revision_id, organization_id)
  references public.contract_submissions(id, organization_id) on delete restrict not valid;
alter table public.contract_entries add constraint contract_entries_current_client_revision_fk
  foreign key (current_client_revision_id, organization_id)
  references public.contract_submissions(id, organization_id) on delete restrict not valid;

alter table public.contract_events
  drop constraint if exists contract_events_event_type_check;
alter table public.contract_events
  add column organization_id uuid references public.organizations(id) on delete restrict,
  add column actor_type text,
  add column actor_user_id uuid references auth.users(id) on delete restrict,
  add column actor_membership_id uuid,
  add column external_capability_id uuid,
  add column api_key_id uuid,
  add column support_session_id uuid,
  add column request_id text,
  add column aggregate_version integer,
  add constraint contract_events_id_organization_unique unique (id, organization_id),
  add constraint contract_events_entry_tenant_fk foreign key (entry_id, organization_id)
    references public.contract_entries(id, organization_id) on delete restrict not valid,
  add constraint contract_events_actor_membership_fk foreign key (actor_membership_id, organization_id)
    references public.organization_memberships(id, organization_id) on delete restrict not valid,
  add constraint contract_events_type_check check (event_type in (
    'created', 'user_submitted', 'client_submitted', 'revision_appended', 'completed',
    'archived', 'status_changed', 'assignment_changed', 'token_regenerated',
    'link_rotated', 'link_revoked', 'generation_requested', 'asset_associated'
  )) not valid;
create index contract_events_tenant_timeline_idx
  on public.contract_events (organization_id, entry_id, occurred_at desc, id desc);

create table public.contract_access_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  entry_id uuid not null,
  role text not null check (role in ('user', 'client')),
  allowed_operations text[] not null check (
    cardinality(allowed_operations) between 1 and 4
    and allowed_operations <@ array['read', 'submit', 'upload', 'view_asset']::text[]
  ),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  token_prefix text not null check (token_prefix ~ '^[A-Za-z0-9_-]{4,16}$'),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{16,64}$'),
  status text not null default 'active' check (status in ('active', 'revoked', 'replaced', 'expired')),
  expires_at timestamptz not null,
  created_by_membership_id uuid,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  use_count bigint not null default 0 check (use_count >= 0),
  revoked_at timestamptz,
  revoked_by_membership_id uuid,
  replaced_at timestamptz,
  predecessor_link_id uuid,
  replaced_by_link_id uuid,
  version integer not null default 1 check (version > 0),
  unique (id, organization_id),
  foreign key (entry_id, organization_id)
    references public.contract_entries(id, organization_id) on delete restrict,
  foreign key (created_by_membership_id, organization_id)
    references public.organization_memberships(id, organization_id) on delete restrict,
  foreign key (revoked_by_membership_id, organization_id)
    references public.organization_memberships(id, organization_id) on delete restrict,
  foreign key (predecessor_link_id, organization_id)
    references public.contract_access_links(id, organization_id) on delete restrict deferrable initially deferred,
  foreign key (replaced_by_link_id, organization_id)
    references public.contract_access_links(id, organization_id) on delete restrict deferrable initially deferred,
  check (expires_at > created_at),
  check ((status = 'active' and revoked_at is null and replaced_at is null)
    or (status = 'revoked' and revoked_at is not null)
    or (status = 'replaced' and replaced_at is not null and replaced_by_link_id is not null)
    or status = 'expired')
);
create unique index contract_access_links_one_active_role_idx
  on public.contract_access_links (organization_id, entry_id, role) where status = 'active';
create index contract_access_links_resolve_idx
  on public.contract_access_links (token_hash, status, expires_at);
create index contract_access_links_tenant_entry_idx
  on public.contract_access_links (organization_id, entry_id, created_at desc);

create table public.contract_link_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  entry_id uuid not null,
  link_id uuid not null,
  session_hash text not null unique check (session_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_used_at timestamptz,
  unique (id, organization_id),
  foreign key (entry_id, organization_id)
    references public.contract_entries(id, organization_id) on delete restrict,
  foreign key (link_id, organization_id)
    references public.contract_access_links(id, organization_id) on delete restrict,
  check (expires_at > created_at)
);
create index contract_link_sessions_parent_idx
  on public.contract_link_sessions (organization_id, link_id, expires_at);

-- asset_id is intentionally not foreign-keyed until SPEC-31 installs the shared asset table.
create table public.contract_asset_associations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  entry_id uuid not null,
  asset_id uuid not null,
  role text check (role is null or role in ('user', 'client')),
  revision_id uuid,
  field_path text not null check (char_length(field_path) between 1 and 240),
  purpose text not null check (purpose in ('dni', 'salary_receipt', 'guarantor_evidence', 'attachment', 'generated_document', 'branding_logo')),
  external_visibility text not null default 'none' check (external_visibility in ('none', 'user', 'client', 'both')),
  associated_by_actor_type text not null check (associated_by_actor_type in (
    'member', 'organization_api_key', 'external_contract_link', 'platform_support', 'system_worker', 'migration'
  )),
  request_id text not null check (request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  associated_at timestamptz not null default now(),
  disassociated_at timestamptz,
  unique (id, organization_id),
  foreign key (entry_id, organization_id)
    references public.contract_entries(id, organization_id) on delete restrict,
  foreign key (revision_id, organization_id)
    references public.contract_submissions(id, organization_id) on delete restrict,
  check (revision_id is null or role is not null)
);
create unique index contract_asset_associations_active_idx
  on public.contract_asset_associations (organization_id, entry_id, asset_id, field_path)
  where disassociated_at is null;
create index contract_asset_associations_entry_idx
  on public.contract_asset_associations (organization_id, entry_id, purpose, associated_at desc);

create table public.contract_generation_intents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  entry_id uuid not null,
  template_version_id uuid,
  global_template_version_id uuid,
  user_revision_id uuid,
  client_revision_id uuid,
  aggregate_version integer not null check (aggregate_version > 0),
  state text not null default 'queued' check (state in ('queued', 'processing', 'succeeded', 'partially_failed', 'failed')),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 160),
  request_id text not null check (request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  requested_by_membership_id uuid not null,
  integration_configuration_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, entry_id, idempotency_key),
  unique (id, organization_id),
  foreign key (entry_id, organization_id)
    references public.contract_entries(id, organization_id) on delete restrict,
  foreign key (template_version_id, organization_id)
    references public.contract_template_versions(id, organization_id) on delete restrict,
  foreign key (global_template_version_id)
    references public.global_contract_template_versions(id) on delete restrict,
  foreign key (user_revision_id, organization_id)
    references public.contract_submissions(id, organization_id) on delete restrict,
  foreign key (client_revision_id, organization_id)
    references public.contract_submissions(id, organization_id) on delete restrict,
  foreign key (requested_by_membership_id, organization_id)
    references public.organization_memberships(id, organization_id) on delete restrict,
  check ((template_version_id is not null)::integer + (global_template_version_id is not null)::integer = 1)
);
create index contract_generation_intents_queue_idx
  on public.contract_generation_intents (organization_id, state, created_at, id);

create or replace function public.spec29_prevent_mutation()
returns trigger language plpgsql security invoker set search_path = pg_catalog as $$
begin
  raise exception 'IMMUTABLE_CONTRACT_HISTORY';
end;
$$;

create or replace function public.spec29_protect_template_version()
returns trigger language plpgsql security invoker set search_path = pg_catalog as $$
begin
  if tg_op = 'DELETE' or old.state <> 'draft'
    or new.id <> old.id or new.organization_id <> old.organization_id
    or new.template_id <> old.template_id or new.version_number <> old.version_number then
    raise exception 'IMMUTABLE_TEMPLATE_VERSION';
  end if;
  return new;
end;
$$;

create or replace function public.spec29_protect_entry_ownership()
returns trigger language plpgsql security invoker set search_path = pg_catalog as $$
begin
  if new.id <> old.id or new.organization_id is distinct from old.organization_id
    or new.template_version_id is distinct from old.template_version_id
    or new.global_template_version_id is distinct from old.global_template_version_id then
    raise exception 'CONTRACT_OWNERSHIP_OR_TEMPLATE_IMMUTABLE';
  end if;
  return new;
end;
$$;

create trigger contract_submissions_append_only before update or delete on public.contract_submissions
for each row execute function public.spec29_prevent_mutation();
create trigger contract_events_append_only before update or delete on public.contract_events
for each row execute function public.spec29_prevent_mutation();
create trigger global_contract_template_versions_immutable before update or delete on public.global_contract_template_versions
for each row execute function public.spec29_prevent_mutation();
create trigger contract_template_versions_immutable before update or delete on public.contract_template_versions
for each row execute function public.spec29_protect_template_version();
create trigger contract_entries_ownership_immutable before update on public.contract_entries
for each row execute function public.spec29_protect_entry_ownership();

-- Replace the legacy create trigger implementation so additive tenant entries produce scoped evidence.
create or replace function public.log_contract_entry_created()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  insert into public.contract_events (
    organization_id, entry_id, event_type, event_data, actor_type, actor_user_id,
    request_id, aggregate_version, occurred_at
  ) values (
    new.organization_id, new.id, 'created', jsonb_build_object('schema_id', new.schema_id),
    case when new.organization_id is null then null else 'member' end,
    new.created_by_user_id, case when new.organization_id is null then null else 'migration_pending' end,
    new.version, new.created_at
  );
  return new;
end;
$$;

create or replace function public.spec29_append_contract_revision(
  p_organization_id uuid, p_entry_id uuid, p_role text, p_expected_version integer,
  p_submission jsonb, p_reason text, p_idempotency_key text, p_request_id text,
  p_actor_type text, p_actor_user_id uuid, p_actor_membership_id uuid,
  p_external_capability_id uuid, p_api_key_id uuid, p_support_session_id uuid,
  p_support_reason text
) returns setof public.contract_entries
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_entry public.contract_entries%rowtype;
  v_existing public.contract_submissions%rowtype;
  v_revision public.contract_submissions%rowtype;
  v_revision_number integer;
  v_predecessor uuid;
  v_payload_hash text;
  v_now timestamptz := clock_timestamp();
begin
  if p_organization_id is null or p_role not in ('user', 'client')
    or p_expected_version < 1 or jsonb_typeof(p_submission) <> 'object'
    or char_length(p_idempotency_key) not between 8 and 160
    or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or p_actor_type not in ('member', 'external_contract_link', 'organization_api_key', 'platform_support', 'system_worker', 'migration') then
    raise exception 'INVALID_CONTRACT_REVISION';
  end if;
  if p_actor_type = 'member' then
    perform 1 from public.organization_memberships
      where id = p_actor_membership_id and organization_id = p_organization_id and status = 'active';
    if not found then raise exception 'FORBIDDEN'; end if;
  elsif p_actor_type = 'external_contract_link' then
    perform 1 from public.contract_access_links
      where id = p_external_capability_id and organization_id = p_organization_id
        and entry_id = p_entry_id and role = p_role and status = 'active'
        and expires_at > v_now and 'submit' = any(allowed_operations);
    if not found then raise exception 'NOT_FOUND'; end if;
  elsif p_actor_type = 'organization_api_key' and p_api_key_id is null then
    raise exception 'FORBIDDEN';
  elsif p_actor_type = 'platform_support'
    and (p_support_session_id is null or char_length(btrim(p_support_reason)) not between 1 and 240) then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_entry from public.contract_entries
    where id = p_entry_id and organization_id = p_organization_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_entry.version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if v_entry.status in ('archived', 'generar_contrato') then raise exception 'INVALID_STATE'; end if;

  v_payload_hash := encode(public.digest(pg_catalog.convert_to(p_submission::text, 'UTF8'), 'sha256'), 'hex');
  select * into v_existing from public.contract_submissions
    where organization_id = p_organization_id and entry_id = p_entry_id
      and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.role <> p_role or v_existing.payload_hash <> v_payload_hash then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return next v_entry;
    return;
  end if;

  select coalesce(max(revision_number), 0) + 1,
    (array_agg(id order by revision_number desc))[1]
    into v_revision_number, v_predecessor
  from public.contract_submissions
  where organization_id = p_organization_id and entry_id = p_entry_id and role = p_role;

  insert into public.contract_submissions (
    organization_id, entry_id, role, revision_number, predecessor_submission_id,
    submission, submission_meta, submitted_at, actor_type, actor_user_id,
    actor_membership_id, external_capability_id, api_key_id, support_session_id,
    request_id, idempotency_key,
    reason, summary, payload_hash
  ) values (
    p_organization_id, p_entry_id, p_role, v_revision_number, v_predecessor,
    p_submission, jsonb_build_object('request_id', p_request_id), v_now, p_actor_type,
    p_actor_user_id, p_actor_membership_id, p_external_capability_id, p_api_key_id,
    p_support_session_id, p_request_id,
    p_idempotency_key, nullif(btrim(p_reason), ''),
    jsonb_build_object('changed_field_count', jsonb_object_length(p_submission)), v_payload_hash
  ) returning * into v_revision;

  if p_role = 'user' then
    update public.contract_entries set current_user_revision_id = v_revision.id,
      user_submission = p_submission, user_filled = true, user_submitted_at = v_now,
      combined_submission = jsonb_build_object('user', p_submission, 'client', client_submission),
      status = case when client_filled then 'complete' else 'open' end,
      updated_by_user_id = p_actor_user_id, updated_at = v_now, version = version + 1
    where id = p_entry_id and organization_id = p_organization_id returning * into v_entry;
  else
    update public.contract_entries set current_client_revision_id = v_revision.id,
      client_submission = p_submission, client_filled = true, client_submitted_at = v_now,
      combined_submission = jsonb_build_object('user', user_submission, 'client', p_submission),
      status = case when user_filled then 'complete' else 'open' end,
      updated_by_user_id = p_actor_user_id, updated_at = v_now, version = version + 1
    where id = p_entry_id and organization_id = p_organization_id returning * into v_entry;
  end if;

  insert into public.contract_events (
    organization_id, entry_id, event_type, event_data, actor_type, actor_user_id,
    actor_membership_id, external_capability_id, api_key_id, support_session_id,
    request_id, aggregate_version, occurred_at
  ) values (
    p_organization_id, p_entry_id, 'revision_appended',
    jsonb_build_object('revision_id', v_revision.id, 'role', p_role, 'revision_number', v_revision_number),
    p_actor_type, p_actor_user_id, p_actor_membership_id, p_external_capability_id,
    p_api_key_id, p_support_session_id, p_request_id, v_entry.version, v_now
  );
  insert into public.audit_events (
    organization_id, request_id, actor_type, actor_user_id, actor_membership_id,
    api_key_id, external_capability_id, support_session_id, support_reason,
    action, target_type, target_id, outcome, source, changed_fields, metadata
  ) values (
    p_organization_id, p_request_id, p_actor_type, p_actor_user_id, p_actor_membership_id,
    p_api_key_id, p_external_capability_id, p_support_session_id, p_support_reason,
    'contracts.revision_appended', 'contract', p_entry_id,
    'succeeded', 'api.contracts', array['current_' || p_role || '_revision_id'],
    jsonb_build_object('role', p_role, 'revision_number', v_revision_number)
  );
  insert into public.usage_events (
    organization_id, idempotency_key, metric_key, quantity, unit, source_type,
    source_id, actor_type, request_id, metadata
  ) values (
    p_organization_id, p_idempotency_key, 'contracts.revisions', 1, 'count',
    'contract', p_entry_id, p_actor_type, p_request_id, jsonb_build_object('role', p_role)
  );
  return next v_entry;
end;
$$;

create or replace function public.spec29_rotate_contract_link(
  p_organization_id uuid, p_entry_id uuid, p_role text, p_expected_version integer,
  p_token_hash text, p_token_prefix text, p_fingerprint text, p_expires_at timestamptz,
  p_request_id text, p_actor_membership_id uuid
) returns setof public.contract_access_links
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_entry public.contract_entries%rowtype;
  v_old public.contract_access_links%rowtype;
  v_new public.contract_access_links%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  perform 1 from public.organization_memberships where id = p_actor_membership_id
    and organization_id = p_organization_id and status = 'active' and role in ('owner', 'admin');
  if not found then raise exception 'FORBIDDEN'; end if;
  if p_role not in ('user', 'client') or p_expires_at <= v_now
    or p_token_hash !~ '^[0-9a-f]{64}$' or p_fingerprint !~ '^[0-9a-f]{16,64}$' then
    raise exception 'INVALID_LINK';
  end if;
  select * into v_entry from public.contract_entries where id = p_entry_id
    and organization_id = p_organization_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_entry.version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if v_entry.status = 'archived' then raise exception 'INVALID_STATE'; end if;
  select * into v_old from public.contract_access_links where organization_id = p_organization_id
    and entry_id = p_entry_id and role = p_role and status = 'active' for update;
  if v_old.id is not null then
    update public.contract_access_links set status = 'revoked', revoked_at = v_now,
      revoked_by_membership_id = p_actor_membership_id, version = version + 1
      where id = v_old.id;
  end if;
  insert into public.contract_access_links (
    organization_id, entry_id, role, allowed_operations, token_hash, token_prefix,
    fingerprint, expires_at, created_by_membership_id, predecessor_link_id
  ) values (
    p_organization_id, p_entry_id, p_role, array['read', 'submit', 'upload', 'view_asset'],
    p_token_hash, p_token_prefix, p_fingerprint, p_expires_at, p_actor_membership_id,
    case when v_old.id is null then null else v_old.id end
  ) returning * into v_new;
  if v_old.id is not null then
    update public.contract_access_links set status = 'replaced', revoked_at = null,
      revoked_by_membership_id = null, replaced_at = v_now,
      replaced_by_link_id = v_new.id, version = version + 1 where id = v_old.id;
    update public.contract_link_sessions set revoked_at = v_now
      where organization_id = p_organization_id and link_id = v_old.id and revoked_at is null;
  end if;
  update public.contract_entries set version = version + 1, updated_at = v_now
    where id = p_entry_id and organization_id = p_organization_id;
  insert into public.contract_events (
    organization_id, entry_id, event_type, event_data, actor_type, actor_membership_id,
    request_id, aggregate_version, occurred_at
  ) values (
    p_organization_id, p_entry_id, 'link_rotated', jsonb_build_object('role', p_role, 'link_id', v_new.id),
    'member', p_actor_membership_id, p_request_id, p_expected_version + 1, v_now
  );
  return next v_new;
end;
$$;

create or replace function public.spec29_revoke_contract_link(
  p_organization_id uuid, p_entry_id uuid, p_role text, p_expected_version integer,
  p_request_id text, p_actor_membership_id uuid
) returns setof public.contract_entries
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_entry public.contract_entries%rowtype;
  v_link public.contract_access_links%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  perform 1 from public.organization_memberships where id = p_actor_membership_id
    and organization_id = p_organization_id and status = 'active' and role in ('owner', 'admin');
  if not found then raise exception 'FORBIDDEN'; end if;
  select * into v_entry from public.contract_entries where id = p_entry_id
    and organization_id = p_organization_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_entry.version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  select * into v_link from public.contract_access_links where organization_id = p_organization_id
    and entry_id = p_entry_id and role = p_role and status = 'active' for update;
  if found then
    update public.contract_access_links set status = 'revoked', revoked_at = v_now,
      revoked_by_membership_id = p_actor_membership_id, version = version + 1 where id = v_link.id;
    update public.contract_link_sessions set revoked_at = v_now
      where organization_id = p_organization_id and link_id = v_link.id and revoked_at is null;
    update public.contract_entries set version = version + 1, updated_at = v_now
      where id = p_entry_id and organization_id = p_organization_id returning * into v_entry;
    insert into public.contract_events (
      organization_id, entry_id, event_type, event_data, actor_type, actor_membership_id,
      request_id, aggregate_version, occurred_at
    ) values (
      p_organization_id, p_entry_id, 'link_revoked', jsonb_build_object('role', p_role),
      'member', p_actor_membership_id, p_request_id, v_entry.version, v_now
    );
  end if;
  return next v_entry;
end;
$$;

-- Browser roles have no direct table or RPC access. Typed backend contexts call
-- the scoped functions through service_role; RLS remains a second boundary.
do $$
declare v_table text;
begin
  foreach v_table in array array[
    'global_contract_templates', 'global_contract_template_versions',
    'contract_templates', 'contract_template_versions', 'organization_contract_template_enablements',
    'contract_entries', 'contract_submissions', 'contract_events', 'contract_access_links',
    'contract_link_sessions', 'contract_asset_associations', 'contract_generation_intents'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('alter table public.%I force row level security', v_table);
    execute format('revoke all on table public.%I from public, anon, authenticated', v_table);
    execute format('grant select, insert, update on table public.%I to service_role', v_table);
  end loop;
end;
$$;

revoke all on function public.spec29_append_contract_revision(uuid, uuid, text, integer, jsonb, text, text, text, text, uuid, uuid, uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.spec29_append_contract_revision(uuid, uuid, text, integer, jsonb, text, text, text, text, uuid, uuid, uuid, uuid, uuid, text)
  to service_role;
revoke all on function public.spec29_rotate_contract_link(uuid, uuid, text, integer, text, text, text, timestamptz, text, uuid)
  from public, anon, authenticated;
grant execute on function public.spec29_rotate_contract_link(uuid, uuid, text, integer, text, text, text, timestamptz, text, uuid)
  to service_role;
revoke all on function public.spec29_revoke_contract_link(uuid, uuid, text, integer, text, uuid)
  from public, anon, authenticated;
grant execute on function public.spec29_revoke_contract_link(uuid, uuid, text, integer, text, uuid)
  to service_role;

comment on table public.contract_access_links is
  'SPEC-29 independently revocable, expiring, hash-only external contract capabilities.';
comment on table public.contract_submissions is
  'SPEC-29 immutable role revision history; legacy rows remain additive until SPEC-34 backfill.';
comment on table public.contract_asset_associations is
  'SPEC-29 contract-to-private-asset authorization edges; shared asset FK follows SPEC-31.';
