-- SPEC-34 / MT-SPEC-10: restricted migration evidence and release gate.
-- This additive migration does not create Azar or Solar, backfill customer data,
-- enable a feature, certify a release, mutate provider ACLs, or rotate credentials.
create extension if not exists pgcrypto;
create schema if not exists migration_control;

revoke all on schema migration_control from public, anon, authenticated;

create table migration_control.migration_runs (
  id uuid primary key default gen_random_uuid(),
  environment text not null check (environment ~ '^[a-z][a-z0-9_-]{0,31}$'),
  manifest_version text not null,
  manifest_fingerprint text not null check (manifest_fingerprint ~ '^[0-9a-f]{64}$'),
  source_snapshot_id text not null,
  source_schema_version text not null,
  application_revision text not null,
  target_schema_version text not null,
  mode text not null check (mode in ('dry_run','rehearsal','production','validation','rollback')),
  status text not null default 'pending' check (status in ('pending','running','paused','succeeded','failed','cancelled')),
  azar_organization_id uuid not null,
  solar_organization_id uuid not null,
  initiated_by_user_id uuid not null,
  approval_references jsonb not null default '[]'::jsonb,
  checkpoint jsonb not null default '{}'::jsonb,
  expected_fingerprints jsonb not null default '{}'::jsonb,
  observed_fingerprints jsonb not null default '{}'::jsonb,
  result_artifact_reference text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  check (azar_organization_id <> solar_organization_id),
  check (jsonb_typeof(approval_references) = 'array'),
  check (jsonb_typeof(checkpoint) = 'object'),
  check (jsonb_typeof(expected_fingerprints) = 'object'),
  check (jsonb_typeof(observed_fingerprints) = 'object'),
  check (octet_length(approval_references::text) <= 16384
    and octet_length(checkpoint::text) <= 16384
    and octet_length(expected_fingerprints::text) <= 32768
    and octet_length(observed_fingerprints::text) <= 32768),
  check ((status in ('succeeded','failed','cancelled')) = (completed_at is not null)),
  unique (environment, manifest_version, manifest_fingerprint)
);
create index migration_runs_environment_status_idx
  on migration_control.migration_runs (environment, status, created_at desc, id desc);

create table migration_control.migration_inventory_items (
  id uuid primary key default gen_random_uuid(),
  migration_run_id uuid not null references migration_control.migration_runs(id) on delete restrict,
  source_system text not null,
  artifact_type text not null,
  source_identifier text not null,
  source_parent_identifier text,
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  ownership_signals jsonb not null default '{}'::jsonb,
  proposed_disposition text not null check (proposed_disposition in (
    'migrate_to_azar','retain_scoped','quarantine','exclude_non_business','delete_after_approval'
  )),
  final_disposition text check (final_disposition in (
    'migrate_to_azar','retain_scoped','quarantine','exclude_non_business','delete_after_approval'
  )),
  target_organization_id uuid,
  target_resource_type text,
  target_resource_id uuid,
  reason_code text not null check (reason_code ~ '^[A-Z0-9_]{1,64}$'),
  evidence_reference text,
  confidence text not null check (confidence in ('verified','review_required','unknown')),
  reviewer_user_id uuid,
  reviewed_at timestamptz,
  quarantine_state text not null default 'none' check (quarantine_state in ('none','quarantined','remediated','retained','deletion_eligible')),
  processing_status text not null default 'discovered' check (processing_status in ('discovered','reviewed','processing','completed','failed')),
  attempts integer not null default 0 check (attempts between 0 and 100),
  last_error_code text,
  retention_eligible_at timestamptz,
  legal_hold boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  check (jsonb_typeof(ownership_signals) = 'object' and octet_length(ownership_signals::text) <= 8192),
  check (final_disposition <> 'migrate_to_azar' or (
    target_organization_id is not null and evidence_reference is not null
    and reviewer_user_id is not null and reviewed_at is not null
  )),
  check (final_disposition <> 'delete_after_approval' or (
    reviewer_user_id is not null and reviewed_at is not null and retention_eligible_at is not null and not legal_hold
  )),
  unique (migration_run_id, source_system, artifact_type, source_identifier)
);
create index migration_inventory_run_disposition_idx on migration_control.migration_inventory_items
  (migration_run_id, processing_status, final_disposition, artifact_type, id);
create index migration_inventory_target_idx on migration_control.migration_inventory_items
  (target_organization_id, target_resource_type, target_resource_id) where target_organization_id is not null;

create table migration_control.migration_mappings (
  id uuid primary key default gen_random_uuid(),
  migration_run_id uuid not null references migration_control.migration_runs(id) on delete restrict,
  source_system text not null,
  source_type text not null,
  source_identifier text not null,
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  canonical_table text not null,
  canonical_id uuid not null,
  organization_id uuid not null,
  mapping_state text not null check (mapping_state in ('active','superseded','rolled_back','quarantined')),
  object_checksum text check (object_checksum is null or object_checksum ~ '^[0-9a-f]{64}$'),
  object_version text,
  supersedes_mapping_id uuid references migration_control.migration_mappings(id) on delete restrict,
  rollback_reference text,
  created_at timestamptz not null default now(),
  unique (migration_run_id, source_system, source_type, source_identifier, source_fingerprint),
  unique (migration_run_id, canonical_table, canonical_id, organization_id)
);
create index migration_mappings_organization_target_idx on migration_control.migration_mappings
  (organization_id, canonical_table, canonical_id, mapping_state);

create table migration_control.migration_validation_results (
  id uuid primary key default gen_random_uuid(),
  migration_run_id uuid not null references migration_control.migration_runs(id) on delete restrict,
  stage text not null,
  check_id text not null,
  query_tool_version text not null,
  core_isolation boolean not null default true,
  expected_value jsonb not null,
  actual_value jsonb not null,
  status text not null check (status in ('pass','fail','waived')),
  evidence_reference text not null,
  organization_id uuid,
  artifact_class text,
  approver_user_id uuid,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (completed_at >= started_at),
  check (not core_isolation or status <> 'waived'),
  check (status <> 'waived' or approver_user_id is not null),
  unique (migration_run_id, stage, check_id, organization_id)
);
create index migration_validation_run_status_idx on migration_control.migration_validation_results
  (migration_run_id, status, core_isolation, stage, check_id);

create table migration_control.release_certifications (
  id uuid primary key default gen_random_uuid(),
  environment text not null,
  status text not null default 'draft' check (status in ('draft','certified','rejected','superseded')),
  application_revision text not null,
  build_artifact_fingerprint text not null check (build_artifact_fingerprint ~ '^[0-9a-f]{64}$'),
  database_migration_head text not null,
  worker_version text not null,
  frontend_version text not null,
  feature_manifest jsonb not null,
  provider_destination_manifest jsonb not null,
  fixture_version text not null,
  test_result_references jsonb not null,
  migration_rehearsal_run_id uuid not null references migration_control.migration_runs(id) on delete restrict,
  restore_rehearsal_run_id uuid not null references migration_control.migration_runs(id) on delete restrict,
  open_exceptions jsonb not null default '[]'::jsonb,
  monitoring_manifest jsonb not null,
  rollback_thresholds jsonb not null,
  approval_manifest jsonb not null,
  solar_cohort text not null,
  certified_at timestamptz,
  created_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  check (jsonb_typeof(feature_manifest) = 'object'),
  check (jsonb_typeof(provider_destination_manifest) = 'object'),
  check (jsonb_typeof(test_result_references) = 'array'),
  check (jsonb_typeof(open_exceptions) = 'array'),
  check (jsonb_typeof(monitoring_manifest) = 'object'),
  check (jsonb_typeof(rollback_thresholds) = 'array'),
  check (jsonb_typeof(approval_manifest) = 'object'),
  check (feature_manifest ? 'features'),
  check (provider_destination_manifest ?& array['azar','solar']),
  check (monitoring_manifest ?& array['dashboards','alerts']),
  check (approval_manifest ?& array['security','product','data','backend','frontend','operations','provider','support','release']),
  check (jsonb_array_length(test_result_references) > 0),
  check (jsonb_array_length(rollback_thresholds) > 0),
  check (octet_length(feature_manifest::text) <= 32768
    and octet_length(provider_destination_manifest::text) <= 16384
    and octet_length(test_result_references::text) <= 32768
    and octet_length(open_exceptions::text) <= 16384
    and octet_length(monitoring_manifest::text) <= 16384
    and octet_length(rollback_thresholds::text) <= 16384
    and octet_length(approval_manifest::text) <= 16384),
  check ((status = 'certified') = (certified_at is not null) or status <> 'certified'),
  unique (environment, application_revision, database_migration_head, build_artifact_fingerprint)
);
create index release_certifications_environment_status_idx on migration_control.release_certifications
  (environment, status, created_at desc, id desc);

create table migration_control.solar_rollout_events (
  id uuid primary key default gen_random_uuid(),
  certification_id uuid not null references migration_control.release_certifications(id) on delete restrict,
  from_stage text not null check (from_stage in ('not_started','empty','synthetic','pilot','real_data','expanded','contained')),
  to_stage text not null check (to_stage in ('empty','synthetic','pilot','real_data','expanded','contained')),
  reason_code text not null check (reason_code ~ '^[A-Z0-9_]{1,64}$'),
  boundary_incident boolean not null default false,
  decision_reference text not null,
  actor_user_id uuid not null,
  occurred_at timestamptz not null default now(),
  check (not boundary_incident or to_stage = 'contained')
);
create index solar_rollout_events_certification_timeline_idx on migration_control.solar_rollout_events
  (certification_id, occurred_at desc, id desc);

create or replace function migration_control.spec34_prevent_evidence_mutation() returns trigger
language plpgsql security invoker set search_path = pg_catalog as $$
begin raise exception 'IMMUTABLE_MIGRATION_EVIDENCE'; end $$;

create trigger migration_mappings_append_only before update or delete on migration_control.migration_mappings
  for each row execute function migration_control.spec34_prevent_evidence_mutation();
create trigger migration_validation_results_append_only before update or delete on migration_control.migration_validation_results
  for each row execute function migration_control.spec34_prevent_evidence_mutation();
create or replace function migration_control.spec34_protect_release_certification() returns trigger
language plpgsql security invoker set search_path = pg_catalog as $$
begin
  if tg_op = 'DELETE' or old.status <> 'draft' then raise exception 'IMMUTABLE_RELEASE_CERTIFICATION'; end if;
  if new.status not in ('certified','rejected') or new.version <> old.version + 1 then
    raise exception 'INVALID_CERTIFICATION_TRANSITION';
  end if;
  if (to_jsonb(new) - array['status','certified_at','version'])
    is distinct from (to_jsonb(old) - array['status','certified_at','version']) then
    raise exception 'IMMUTABLE_CERTIFICATION_ARTIFACTS';
  end if;
  return new;
end $$;
create trigger release_certifications_final_immutable before update or delete on migration_control.release_certifications
  for each row execute function migration_control.spec34_protect_release_certification();
create trigger solar_rollout_events_append_only before update or delete on migration_control.solar_rollout_events
  for each row execute function migration_control.spec34_prevent_evidence_mutation();

create or replace function migration_control.spec34_validate_rollout_event() returns trigger
language plpgsql security definer set search_path = pg_catalog as $$
declare current_stage text; certification_status text;
begin
  select status into certification_status from migration_control.release_certifications
    where id = new.certification_id for share;
  if certification_status is null then raise exception 'CERTIFICATION_NOT_FOUND'; end if;
  select to_stage into current_stage from migration_control.solar_rollout_events
    where certification_id = new.certification_id order by occurred_at desc, id desc limit 1;
  current_stage := coalesce(current_stage, 'not_started');
  if new.from_stage <> current_stage then raise exception 'STALE_SOLAR_ROLLOUT_STAGE'; end if;
  if not (
    (new.from_stage='not_started' and new.to_stage in ('empty','contained')) or
    (new.from_stage='empty' and new.to_stage in ('synthetic','contained')) or
    (new.from_stage='synthetic' and new.to_stage in ('pilot','contained')) or
    (new.from_stage='pilot' and new.to_stage in ('real_data','contained')) or
    (new.from_stage='real_data' and new.to_stage in ('expanded','contained')) or
    (new.from_stage='expanded' and new.to_stage='contained')
  ) then raise exception 'INVALID_SOLAR_ROLLOUT_TRANSITION'; end if;
  if new.to_stage in ('real_data','expanded') and certification_status <> 'certified' then
    raise exception 'SOLAR_RELEASE_NOT_CERTIFIED';
  end if;
  return new;
end $$;
create trigger solar_rollout_events_validate before insert on migration_control.solar_rollout_events
  for each row execute function migration_control.spec34_validate_rollout_event();

-- The schema has no policies or grants for ordinary application principals. A separately
-- approved operator/worker role must receive least-privileged functions, never table-wide access.
alter table migration_control.migration_runs enable row level security;
alter table migration_control.migration_runs force row level security;
alter table migration_control.migration_inventory_items enable row level security;
alter table migration_control.migration_inventory_items force row level security;
alter table migration_control.migration_mappings enable row level security;
alter table migration_control.migration_mappings force row level security;
alter table migration_control.migration_validation_results enable row level security;
alter table migration_control.migration_validation_results force row level security;
alter table migration_control.release_certifications enable row level security;
alter table migration_control.release_certifications force row level security;
alter table migration_control.solar_rollout_events enable row level security;
alter table migration_control.solar_rollout_events force row level security;

revoke all on all tables in schema migration_control from public, anon, authenticated;
revoke all on all functions in schema migration_control from public, anon, authenticated;

comment on schema migration_control is
  'SPEC-34 restricted evidence only; absence of a certified record is a release denial and this schema never authorizes tenant access.';
