-- SPEC-31 / MT-SPEC-07: organization-owned private assets, durable upload
-- sessions/intents, explicit associations, deletion evidence, and legacy mapping.
-- Additive only: production object migration and Solar enablement remain SPEC-34 gates.

create extension if not exists pgcrypto;

-- Provider limits are defense in depth. The backend receiver registry remains
-- authoritative and may be stricter. No browser Storage policy is added here.
update storage.buckets set public = false where id in ('contract-dni', 'contract-evidence');
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('property-media', 'property-media', false, 104857600,
    array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']::text[]),
  ('organization-branding', 'organization-branding', false, 5242880,
    array['image/jpeg', 'image/png', 'image/webp']::text[]),
  ('private-exports', 'private-exports', false, 1073741824,
    array['application/pdf', 'application/zip']::text[])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  storage_provider text not null default 'supabase' check (storage_provider in ('supabase')),
  bucket_name text not null check (bucket_name ~ '^[a-z0-9][a-z0-9_-]{1,62}$'),
  object_path text not null check (
    object_path ~ '^organizations/[0-9a-f-]{36}/(contracts|properties|branding|exports)/[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$'
  ),
  original_filename text not null check (char_length(original_filename) between 1 and 256),
  display_filename text not null check (char_length(display_filename) between 1 and 120),
  extension text check (extension is null or extension ~ '^[a-zA-Z0-9]{1,16}$'),
  declared_mime text not null check (char_length(declared_mime) between 3 and 160),
  declared_bytes bigint not null check (declared_bytes > 0),
  provider_mime text,
  provider_bytes bigint check (provider_bytes is null or provider_bytes > 0),
  detected_mime text,
  checksum_algorithm text check (checksum_algorithm is null or checksum_algorithm = 'sha256'),
  checksum_value text check (checksum_value is null or checksum_value ~ '^[0-9a-f]{64}$'),
  category text not null check (category in (
    'contract_dni', 'contract_evidence', 'property_image', 'property_video',
    'organization_logo', 'export'
  )),
  state text not null default 'pending' check (state in (
    'pending', 'uploaded', 'verifying', 'verified', 'quarantined', 'attached',
    'deleting', 'deleted', 'deletion_failed'
  )),
  quarantine_reason_code text check (quarantine_reason_code is null or quarantine_reason_code ~ '^[A-Z0-9_]{1,64}$'),
  retention_class text not null check (retention_class ~ '^[a-z][a-z0-9_.]{2,127}$'),
  retain_until timestamptz,
  legal_hold_reference text check (legal_hold_reference is null or char_length(legal_hold_reference) <= 160),
  created_principal_type text not null check (created_principal_type in (
    'member', 'organization_api_key', 'external_contract_link',
    'platform_support', 'system_worker', 'migration'
  )),
  created_principal_reference_id uuid,
  request_id text not null check (request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  uploaded_at timestamptz,
  verified_at timestamptz,
  attached_at timestamptz,
  logical_deleted_at timestamptz,
  physical_deleted_at timestamptz,
  version integer not null default 1 check (version > 0),
  unique (id, organization_id),
  unique (id, organization_id, bucket_name, object_path),
  unique (storage_provider, bucket_name, object_path),
  check ((checksum_algorithm is null) = (checksum_value is null)),
  check (object_path like ('organizations/' || organization_id::text || '/%')),
  check ((state = 'deleted') = (physical_deleted_at is not null))
);
create index media_assets_tenant_state_idx
  on public.media_assets (organization_id, state, created_at, id);
create index media_assets_tenant_retention_idx
  on public.media_assets (organization_id, retain_until, id)
  where state in ('verified', 'quarantined', 'deleting', 'deletion_failed');
create index media_assets_tenant_category_idx
  on public.media_assets (organization_id, category, created_at desc, id desc);

create table public.asset_upload_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  principal_type text not null check (principal_type in (
    'member', 'organization_api_key', 'external_contract_link',
    'platform_support', 'system_worker', 'migration'
  )),
  principal_reference_id uuid,
  principal_fingerprint text not null check (principal_fingerprint ~ '^[0-9a-f]{16,64}$'),
  owner_type text not null check (owner_type in (
    'contract_entry', 'property_draft', 'property_revision', 'organization_branding', 'export'
  )),
  owner_id uuid not null,
  capability_key text not null check (capability_key ~ '^[a-z][a-z0-9_.]{2,127}$'),
  state text not null default 'open' check (state in (
    'open', 'finalizing', 'consumed', 'expired', 'revoked', 'failed'
  )),
  expires_at timestamptz not null,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 160),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  policy_version integer not null check (policy_version > 0),
  request_id text not null check (request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_at timestamptz,
  revoked_at timestamptz,
  version integer not null default 1 check (version > 0),
  unique (id, organization_id),
  unique (organization_id, principal_fingerprint, capability_key, idempotency_key),
  check (expires_at > created_at),
  check ((state = 'consumed') = (finalized_at is not null)),
  check ((state = 'revoked') = (revoked_at is not null))
);
create index asset_upload_sessions_tenant_owner_idx
  on public.asset_upload_sessions (organization_id, owner_type, owner_id, created_at desc);
create index asset_upload_sessions_expiry_idx
  on public.asset_upload_sessions (organization_id, state, expires_at, id);

create table public.asset_upload_intents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  upload_session_id uuid not null,
  asset_id uuid not null,
  receiver_key text not null check (receiver_key ~ '^[a-z][a-z0-9_.]{2,127}$'),
  repeatable_item_id text check (repeatable_item_id is null or char_length(repeatable_item_id) <= 160),
  expected_category text not null check (expected_category in (
    'contract_dni', 'contract_evidence', 'property_image', 'property_video',
    'organization_logo', 'export'
  )),
  expected_mime text not null check (char_length(expected_mime) between 3 and 160),
  expected_bytes bigint not null check (expected_bytes > 0),
  expected_checksum text check (expected_checksum is null or expected_checksum ~ '^[0-9a-f]{64}$'),
  bucket_name text not null,
  object_path text not null,
  state text not null default 'pending' check (state in (
    'pending', 'url_issued', 'uploaded', 'verified', 'consumed', 'expired', 'rejected'
  )),
  url_issuance_count integer not null default 0 check (url_issuance_count between 0 and 10),
  last_url_expires_at timestamptz,
  verification_attempts integer not null default 0 check (verification_attempts between 0 and 100),
  verification_error_code text check (verification_error_code is null or verification_error_code ~ '^[A-Z0-9_]{1,64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  verified_at timestamptz,
  consumed_at timestamptz,
  version integer not null default 1 check (version > 0),
  unique (id, organization_id),
  unique (asset_id, organization_id),
  unique (organization_id, upload_session_id, receiver_key, repeatable_item_id, asset_id),
  unique (bucket_name, object_path),
  foreign key (upload_session_id, organization_id)
    references public.asset_upload_sessions(id, organization_id) on delete restrict,
  foreign key (asset_id, organization_id)
    references public.media_assets(id, organization_id) on delete restrict,
  foreign key (asset_id, organization_id, bucket_name, object_path)
    references public.media_assets(id, organization_id, bucket_name, object_path) on delete restrict,
  check ((state in ('verified', 'consumed')) = (verified_at is not null)),
  check ((state = 'consumed') = (consumed_at is not null))
);
create index asset_upload_intents_session_idx
  on public.asset_upload_intents (organization_id, upload_session_id, state, id);
create index asset_upload_intents_asset_idx
  on public.asset_upload_intents (organization_id, asset_id);

create table public.organization_branding_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  original_asset_id uuid not null,
  derivative_asset_id uuid,
  state text not null default 'draft' check (state in ('draft', 'approved', 'retired')),
  approved_by_membership_id uuid,
  approved_at timestamptz,
  retired_at timestamptz,
  cache_version integer not null default 1 check (cache_version > 0),
  created_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  unique (id, organization_id),
  unique (organization_id, original_asset_id),
  foreign key (original_asset_id, organization_id)
    references public.media_assets(id, organization_id) on delete restrict,
  foreign key (derivative_asset_id, organization_id)
    references public.media_assets(id, organization_id) on delete restrict,
  foreign key (approved_by_membership_id, organization_id)
    references public.organization_memberships(id, organization_id) on delete restrict,
  check ((state = 'draft' and approved_at is null and retired_at is null)
    or (state = 'approved' and approved_at is not null and derivative_asset_id is not null and retired_at is null)
    or (state = 'retired' and retired_at is not null))
);
create unique index organization_branding_one_approved_idx
  on public.organization_branding_assets (organization_id) where state = 'approved';

create table public.export_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  export_id uuid not null,
  asset_id uuid not null,
  provider_copy_reference uuid,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, export_id, asset_id),
  foreign key (asset_id, organization_id)
    references public.media_assets(id, organization_id) on delete restrict
);

create table public.asset_deletion_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  asset_id uuid not null,
  deletion_request_id uuid not null,
  reason_code text not null check (reason_code ~ '^[A-Z0-9_]{1,64}$'),
  policy_version integer not null check (policy_version > 0),
  logical_denial_at timestamptz not null,
  storage_result text not null check (storage_result in ('pending', 'deleted', 'not_found_reconciled', 'failed')),
  exported_copy_status_reference uuid,
  actor_type text not null check (actor_type in (
    'member', 'organization_api_key', 'external_contract_link',
    'platform_support', 'system_worker', 'migration'
  )),
  safe_error_code text check (safe_error_code is null or safe_error_code ~ '^[A-Z0-9_]{1,64}$'),
  request_id text not null check (request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (id, organization_id),
  unique (organization_id, asset_id, deletion_request_id),
  foreign key (asset_id, organization_id)
    references public.media_assets(id, organization_id) on delete restrict
);
create index asset_deletion_receipts_tenant_asset_idx
  on public.asset_deletion_receipts (organization_id, asset_id, created_at desc);

create table public.asset_migration_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  asset_id uuid,
  legacy_provider text not null,
  legacy_reference_fingerprint text not null check (legacy_reference_fingerprint ~ '^[0-9a-f]{64}$'),
  evidence_source text not null check (char_length(evidence_source) between 1 and 160),
  decision text not null check (decision in ('mapped_azar', 'quarantined', 'missing', 'duplicate')),
  verification_state text not null check (verification_state in ('pending', 'verified', 'mismatch', 'not_found')),
  rollback_state text not null default 'legacy_authoritative'
    check (rollback_state in ('legacy_authoritative', 'copied', 'registry_authoritative', 'cleanup_eligible', 'cleaned')),
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  unique (id, organization_id),
  unique (organization_id, legacy_provider, legacy_reference_fingerprint),
  foreign key (asset_id, organization_id)
    references public.media_assets(id, organization_id) on delete restrict,
  check (decision <> 'mapped_azar' or asset_id is not null)
);

-- Bind the owner-specific association tables introduced by SPEC-29 and SPEC-30.
alter table public.contract_asset_associations
  add constraint contract_asset_associations_asset_tenant_fk
  foreign key (asset_id, organization_id)
  references public.media_assets(id, organization_id) on delete restrict not valid;
alter table public.property_revision_assets
  add constraint property_revision_assets_asset_tenant_fk
  foreign key (asset_id, organization_id)
  references public.media_assets(id, organization_id) on delete restrict not valid;
alter table public.organization_settings
  add constraint organization_settings_logo_asset_tenant_fk
  foreign key (logo_asset_id, organization_id)
  references public.media_assets(id, organization_id) on delete restrict not valid;

create or replace view public.asset_safe_projection
with (security_invoker = true)
as select id, organization_id, category, state, display_filename, provider_mime,
  provider_bytes, created_at, verified_at, attached_at, version
from public.media_assets;

create function public.spec31_reject_asset_history_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'IMMUTABLE_ASSET_HISTORY';
end;
$$;
create trigger contract_asset_associations_append_only
  before update or delete on public.contract_asset_associations
  for each row execute function public.spec31_reject_asset_history_mutation();
create trigger property_revision_assets_spec31_append_only
  before update or delete on public.property_revision_assets
  for each row execute function public.spec31_reject_asset_history_mutation();
create trigger asset_deletion_receipts_append_only
  before update or delete on public.asset_deletion_receipts
  for each row execute function public.spec31_reject_asset_history_mutation();
create trigger asset_migration_mappings_append_only
  before update or delete on public.asset_migration_mappings
  for each row execute function public.spec31_reject_asset_history_mutation();

create or replace function public.spec31_initialize_asset_upload(
  p_organization_id uuid, p_owner_type text, p_owner_id uuid, p_capability_key text,
  p_principal_type text, p_principal_reference_id uuid, p_principal_fingerprint text,
  p_idempotency_key text, p_request_fingerprint text, p_request_id text,
  p_expires_at timestamptz, p_descriptors jsonb
) returns public.asset_upload_sessions
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_session public.asset_upload_sessions;
  v_descriptor jsonb;
  v_asset_id uuid;
  v_filename text;
  v_domain text;
begin
  if p_expires_at <= clock_timestamp() or p_expires_at > clock_timestamp() + interval '1 hour'
    or jsonb_typeof(p_descriptors) <> 'array' or jsonb_array_length(p_descriptors) not between 1 and 40 then
    raise exception 'INVALID_REQUEST';
  end if;
  select * into v_session from public.asset_upload_sessions
   where organization_id = p_organization_id and principal_fingerprint = p_principal_fingerprint
     and capability_key = p_capability_key and idempotency_key = p_idempotency_key;
  if found then
    if v_session.request_fingerprint <> p_request_fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_session;
  end if;
  v_domain := case p_owner_type when 'contract_entry' then 'contracts'
    when 'property_draft' then 'properties' when 'property_revision' then 'properties'
    when 'organization_branding' then 'branding' when 'export' then 'exports' else null end;
  if v_domain is null then raise exception 'INVALID_REQUEST'; end if;
  insert into public.asset_upload_sessions (
    organization_id, principal_type, principal_reference_id, principal_fingerprint,
    owner_type, owner_id, capability_key, expires_at, idempotency_key,
    request_fingerprint, policy_version, request_id
  ) values (
    p_organization_id, p_principal_type, p_principal_reference_id, p_principal_fingerprint,
    p_owner_type, p_owner_id, p_capability_key, p_expires_at, p_idempotency_key,
    p_request_fingerprint, 1, p_request_id
  ) returning * into v_session;
  for v_descriptor in select value from jsonb_array_elements(p_descriptors) loop
    v_asset_id := gen_random_uuid();
    v_filename := left(regexp_replace(regexp_replace(v_descriptor->>'original_filename', '^.*[/\\]', ''), '[^A-Za-z0-9._-]', '_', 'g'), 120);
    if coalesce(v_filename, '') = '' then v_filename := 'file'; end if;
    insert into public.media_assets (
      id, organization_id, bucket_name, object_path, original_filename, display_filename,
      extension, declared_mime, declared_bytes, checksum_algorithm, checksum_value,
      category, retention_class, created_principal_type, created_principal_reference_id, request_id
    ) values (
      v_asset_id, p_organization_id, v_descriptor->>'bucket_name',
      'organizations/' || p_organization_id || '/' || v_domain || '/' || p_owner_id || '/' || v_asset_id || '/' || v_filename,
      v_descriptor->>'original_filename', v_filename,
      nullif(lower(regexp_replace(v_filename, '^.*\.', '')), lower(v_filename)),
      v_descriptor->>'declared_mime', (v_descriptor->>'declared_bytes')::bigint,
      case when v_descriptor ? 'checksum_sha256' then 'sha256' end,
      v_descriptor->>'checksum_sha256', v_descriptor->>'category',
      v_descriptor->>'retention_class', p_principal_type, p_principal_reference_id, p_request_id
    );
    insert into public.asset_upload_intents (
      organization_id, upload_session_id, asset_id, receiver_key, repeatable_item_id,
      expected_category, expected_mime, expected_bytes, expected_checksum, bucket_name, object_path
    ) select p_organization_id, v_session.id, v_asset_id, v_descriptor->>'receiver_key',
      v_descriptor->>'repeatable_item_id', v_descriptor->>'category',
      v_descriptor->>'declared_mime', (v_descriptor->>'declared_bytes')::bigint,
      v_descriptor->>'checksum_sha256', bucket_name, object_path
    from public.media_assets where id = v_asset_id and organization_id = p_organization_id;
  end loop;
  insert into public.audit_events (
    organization_id, request_id, actor_type, actor_user_id, actor_membership_id,
    api_key_id, external_capability_id, support_session_id, support_reason,
    action, target_type, target_id, outcome, source, metadata
  ) values (
    p_organization_id, p_request_id, p_principal_type,
    null,
    case when p_principal_type = 'member' then p_principal_reference_id end,
    case when p_principal_type = 'organization_api_key' then p_principal_reference_id end,
    case when p_principal_type = 'external_contract_link' then p_principal_reference_id end,
    case when p_principal_type = 'platform_support' then p_principal_reference_id end,
    case when p_principal_type = 'platform_support' then 'authorized asset operation' end,
    'assets.upload_initialized', 'asset_upload_session', v_session.id, 'succeeded', 'spec31.rpc',
    jsonb_build_object('owner_type', p_owner_type, 'file_count', jsonb_array_length(p_descriptors))
  );
  return v_session;
end;
$$;

create or replace function public.spec31_finalize_asset_upload(
  p_organization_id uuid, p_upload_session_id uuid, p_expected_version integer,
  p_verified_objects jsonb, p_request_id text
) returns public.asset_upload_sessions
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_session public.asset_upload_sessions; v_object jsonb; v_intent public.asset_upload_intents;
begin
  select * into v_session from public.asset_upload_sessions
   where id = p_upload_session_id and organization_id = p_organization_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_session.state = 'consumed' then return v_session; end if;
  if v_session.state <> 'open' or v_session.version <> p_expected_version or v_session.expires_at <= clock_timestamp()
    then raise exception 'SESSION_INVALID'; end if;
  if jsonb_typeof(p_verified_objects) <> 'array' then raise exception 'INVALID_REQUEST'; end if;
  update public.asset_upload_sessions set state = 'finalizing', version = version + 1, updated_at = now()
   where id = v_session.id and organization_id = p_organization_id;
  for v_object in select value from jsonb_array_elements(p_verified_objects) loop
    select * into v_intent from public.asset_upload_intents
     where id = (v_object->>'upload_intent_id')::uuid and organization_id = p_organization_id
       and upload_session_id = v_session.id for update;
    if not found or v_intent.state not in ('pending', 'url_issued', 'uploaded')
      or v_intent.bucket_name <> v_object->>'bucket_name'
      or v_intent.object_path <> v_object->>'object_path'
      or v_intent.expected_bytes <> (v_object->>'provider_bytes')::bigint
      or v_intent.expected_mime <> v_object->>'provider_mime'
      or (v_intent.expected_checksum is not null and v_intent.expected_checksum <> v_object->>'checksum_sha256')
      then raise exception 'ASSET_METADATA_MISMATCH'; end if;
    update public.media_assets set state = 'verified', provider_mime = v_object->>'provider_mime',
      provider_bytes = (v_object->>'provider_bytes')::bigint, detected_mime = v_object->>'detected_mime',
      uploaded_at = coalesce(uploaded_at, now()), verified_at = now(), updated_at = now(), version = version + 1
     where id = v_intent.asset_id and organization_id = p_organization_id and state in ('pending', 'uploaded', 'verifying');
    if not found then raise exception 'ASSET_STATE_CONFLICT'; end if;
    update public.asset_upload_intents set state = 'verified', verified_at = now(),
      verification_attempts = verification_attempts + 1, updated_at = now(), version = version + 1
     where id = v_intent.id and organization_id = p_organization_id;
    insert into public.usage_events (
      organization_id, idempotency_key, metric_key, quantity, unit, source_type,
      source_id, actor_type, request_id, metadata
    ) values (
      p_organization_id, 'asset-bytes:' || v_intent.asset_id, 'storage.bytes',
      v_intent.expected_bytes, 'bytes', 'media_asset', v_intent.asset_id,
      v_session.principal_type, p_request_id, jsonb_build_object('category', v_intent.expected_category)
    ) on conflict (organization_id, metric_key, idempotency_key) do nothing;
  end loop;
  if exists (select 1 from public.asset_upload_intents where organization_id = p_organization_id
    and upload_session_id = v_session.id and state <> 'verified') then raise exception 'ASSET_STATE_CONFLICT'; end if;
  update public.asset_upload_sessions set state = 'consumed', finalized_at = now(), updated_at = now(), version = version + 1
   where id = v_session.id and organization_id = p_organization_id returning * into v_session;
  return v_session;
end;
$$;

create or replace function public.spec31_record_asset_upload_issuance(
  p_organization_id uuid, p_upload_session_id uuid, p_upload_intent_id uuid,
  p_url_expires_at timestamptz
) returns public.asset_upload_intents
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_intent public.asset_upload_intents;
begin
  if p_url_expires_at <= clock_timestamp() or p_url_expires_at > clock_timestamp() + interval '1 hour'
    then raise exception 'INVALID_REQUEST'; end if;
  perform 1 from public.asset_upload_sessions where id = p_upload_session_id
    and organization_id = p_organization_id and state = 'open' and expires_at > clock_timestamp() for update;
  if not found then raise exception 'SESSION_INVALID'; end if;
  update public.asset_upload_intents set state = 'url_issued',
    url_issuance_count = url_issuance_count + 1, last_url_expires_at = p_url_expires_at,
    updated_at = now(), version = version + 1
   where id = p_upload_intent_id and organization_id = p_organization_id
     and upload_session_id = p_upload_session_id and state in ('pending', 'url_issued')
     and url_issuance_count < 10 returning * into v_intent;
  if not found then raise exception 'ASSET_STATE_CONFLICT'; end if;
  return v_intent;
end;
$$;

create or replace function public.spec31_revoke_asset_upload(
  p_organization_id uuid, p_upload_session_id uuid, p_expected_version integer, p_request_id text
) returns public.asset_upload_sessions
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_session public.asset_upload_sessions;
begin
  select * into v_session from public.asset_upload_sessions where id = p_upload_session_id
    and organization_id = p_organization_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_session.state = 'revoked' then return v_session; end if;
  if v_session.state <> 'open' or v_session.version <> p_expected_version then raise exception 'ASSET_STATE_CONFLICT'; end if;
  update public.asset_upload_sessions set state = 'revoked', revoked_at = now(), updated_at = now(), version = version + 1
   where id = v_session.id and organization_id = p_organization_id returning * into v_session;
  update public.asset_upload_intents set state = 'expired', updated_at = now(), version = version + 1
   where organization_id = p_organization_id and upload_session_id = v_session.id and state in ('pending', 'url_issued');
  return v_session;
end;
$$;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'media_assets', 'asset_upload_sessions', 'asset_upload_intents',
    'organization_branding_assets', 'export_assets', 'asset_deletion_receipts', 'asset_migration_mappings'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('alter table public.%I force row level security', v_table);
    execute format('revoke all on table public.%I from public, anon, authenticated', v_table);
  end loop;
end $$;
revoke all on table public.asset_safe_projection from public, anon, authenticated;
grant select, insert, update on public.media_assets, public.asset_upload_sessions,
  public.asset_upload_intents, public.organization_branding_assets, public.export_assets
  to service_role;
grant select, insert on public.asset_deletion_receipts, public.asset_migration_mappings
  to service_role;
grant select on public.asset_safe_projection to service_role;
revoke all on function public.spec31_initialize_asset_upload(uuid, text, uuid, text, text, uuid, text, text, text, text, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.spec31_finalize_asset_upload(uuid, uuid, integer, jsonb, text) from public, anon, authenticated;
revoke all on function public.spec31_record_asset_upload_issuance(uuid, uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.spec31_revoke_asset_upload(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.spec31_initialize_asset_upload(uuid, text, uuid, text, text, uuid, text, text, text, text, timestamptz, jsonb) to service_role;
grant execute on function public.spec31_finalize_asset_upload(uuid, uuid, integer, jsonb, text) to service_role;
grant execute on function public.spec31_record_asset_upload_issuance(uuid, uuid, uuid, timestamptz) to service_role;
grant execute on function public.spec31_revoke_asset_upload(uuid, uuid, integer, text) to service_role;

comment on table public.media_assets is
  'SPEC-31 canonical private asset registry. Bucket/path columns are never client projections.';
comment on table public.asset_migration_mappings is
  'Azar-only legacy evidence and quarantine mapping; SPEC-34 owns production execution.';
