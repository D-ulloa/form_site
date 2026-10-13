-- Standalone recovery for the current property submission form.
-- Browser roles cannot read private form values or diagnostics directly.
create table public.property_submission_recovery_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  form_values jsonb not null default '{}'::jsonb,
  media_manifest jsonb not null default '[]'::jsonb,
  cover_file_name text not null default '',
  status text not null default 'open' check (status in ('open', 'succeeded', 'discarded')),
  last_error jsonb,
  submission_id text,
  property_id text,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (id, organization_id, user_id),
  foreign key (organization_id, user_id)
    references public.organization_memberships(organization_id, user_id) on delete restrict,
  check (jsonb_typeof(form_values) = 'object' and octet_length(form_values::text) <= 262144),
  check (jsonb_typeof(media_manifest) = 'array' and octet_length(media_manifest::text) <= 16384),
  check (last_error is null or (jsonb_typeof(last_error) = 'object' and octet_length(last_error::text) <= 8192)),
  check (char_length(cover_file_name) <= 255),
  check ((status = 'open') = (completed_at is null))
);

create index property_recovery_open_by_actor_idx
  on public.property_submission_recovery_drafts (organization_id, user_id, updated_at desc, id desc)
  where status = 'open';

create table public.property_submission_recovery_failures (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null,
  organization_id uuid not null,
  user_id uuid not null,
  phase text not null check (phase in ('validation', 'media_validation', 'presign', 'upload', 'submit', 'unexpected')),
  code text not null check (char_length(code) between 1 and 80),
  message text not null check (char_length(message) between 1 and 500),
  http_status integer check (http_status between 100 and 599),
  outcome text check (outcome in ('failure', 'partial_failure')),
  step_results jsonb,
  submission_id text,
  property_id text,
  occurred_at timestamptz not null default now(),
  foreign key (draft_id, organization_id, user_id)
    references public.property_submission_recovery_drafts(id, organization_id, user_id) on delete restrict,
  check (step_results is null or (jsonb_typeof(step_results) = 'object' and octet_length(step_results::text) <= 4096))
);

create index property_recovery_failures_by_draft_idx
  on public.property_submission_recovery_failures (draft_id, occurred_at desc, id desc);

alter table public.property_submission_recovery_drafts enable row level security;
alter table public.property_submission_recovery_drafts force row level security;
alter table public.property_submission_recovery_failures enable row level security;
alter table public.property_submission_recovery_failures force row level security;
revoke all on table public.property_submission_recovery_drafts from public, anon, authenticated;
revoke all on table public.property_submission_recovery_failures from public, anon, authenticated;
grant select, insert, update on table public.property_submission_recovery_drafts to service_role;
grant select, insert on table public.property_submission_recovery_failures to service_role;

-- One transaction keeps the latest recoverable form and its diagnostic together.
create function public.record_property_submission_recovery_failure(
  p_draft_id uuid, p_organization_id uuid, p_user_id uuid, p_expected_version integer,
  p_form_values jsonb, p_media_manifest jsonb, p_cover_file_name text,
  p_phase text, p_code text, p_message text, p_http_status integer,
  p_outcome text, p_step_results jsonb, p_submission_id text, p_property_id text
) returns setof public.property_submission_recovery_drafts
language plpgsql security invoker set search_path = pg_catalog as $$
declare v_draft public.property_submission_recovery_drafts%rowtype;
begin
  update public.property_submission_recovery_drafts
    set form_values = p_form_values, media_manifest = p_media_manifest,
      cover_file_name = p_cover_file_name,
      last_error = pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'phase', p_phase, 'code', p_code, 'message', p_message,
        'http_status', p_http_status, 'outcome', p_outcome,
        'steps', p_step_results, 'submission_id', p_submission_id,
        'property_id', p_property_id, 'occurred_at', clock_timestamp()
      )),
      submission_id = coalesce(p_submission_id, submission_id),
      property_id = coalesce(p_property_id, property_id),
      updated_at = clock_timestamp(), version = version + 1
    where id = p_draft_id and organization_id = p_organization_id and user_id = p_user_id
      and status = 'open' and version = p_expected_version
    returning * into v_draft;
  if not found then raise exception 'RECOVERY_DRAFT_CONFLICT'; end if;

  insert into public.property_submission_recovery_failures (
    draft_id, organization_id, user_id, phase, code, message, http_status,
    outcome, step_results, submission_id, property_id
  ) values (
    p_draft_id, p_organization_id, p_user_id, p_phase, p_code, p_message,
    p_http_status, p_outcome, p_step_results, p_submission_id, p_property_id
  );
  return next v_draft;
end;
$$;

revoke all on function public.record_property_submission_recovery_failure(
  uuid, uuid, uuid, integer, jsonb, jsonb, text, text, text, text,
  integer, text, jsonb, text, text
) from public, anon, authenticated;
grant execute on function public.record_property_submission_recovery_failure(
  uuid, uuid, uuid, integer, jsonb, jsonb, text, text, text, text,
  integer, text, jsonb, text, text
) to service_role;
