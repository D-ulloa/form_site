-- SPEC-33 / MT-SPEC-09: fail-closed commercial/enterprise module framework.
-- All five optional modules are seeded as not_configured. This migration creates
-- no price, provider account, customer domain, IdP, dedicated environment, or analytics data.
create extension if not exists pgcrypto;

create table public.extension_module_definitions (
  module_key text primary key check (module_key in (
    'billing', 'custom_domains', 'enterprise_sso', 'dedicated_isolation', 'analytics'
  )),
  readiness_state text not null default 'not_configured' check (readiness_state in (
    'not_configured', 'design_approved', 'implemented', 'certified', 'retired'
  )),
  certification_evidence jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  check (jsonb_typeof(certification_evidence) = 'object'
    and octet_length(certification_evidence::text) <= 8192),
  check (readiness_state <> 'certified' or certification_evidence ?& array[
    'migration', 'code', 'tests', 'documentation', 'operations', 'reviewer'
  ])
);

insert into public.extension_module_definitions (module_key) values
  ('billing'), ('custom_domains'), ('enterprise_sso'), ('dedicated_isolation'), ('analytics');

create table public.organization_extension_modules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  module_key text not null references public.extension_module_definitions(module_key) on delete restrict,
  state text not null default 'not_configured' check (state in (
    'not_configured', 'design_approved', 'implemented', 'certified', 'enabled', 'retired'
  )),
  certification_evidence jsonb not null default '{}'::jsonb,
  enabled_at timestamptz,
  retired_at timestamptz,
  request_id text not null check (request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  updated_actor_type text not null check (updated_actor_type in ('platform_support', 'system_worker', 'migration')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  unique (id, organization_id),
  unique (organization_id, module_key),
  check (jsonb_typeof(certification_evidence) = 'object'
    and octet_length(certification_evidence::text) <= 8192),
  check (state not in ('certified', 'enabled') or certification_evidence ?& array[
    'migration', 'code', 'tests', 'documentation', 'operations', 'reviewer'
  ]),
  check ((state = 'enabled') = (enabled_at is not null) or state <> 'enabled'),
  check ((state = 'retired') = (retired_at is not null) or state <> 'retired')
);
create index organization_extension_modules_tenant_state_idx
  on public.organization_extension_modules (organization_id, state, module_key, id);

create table public.extension_module_state_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  organization_module_id uuid not null,
  module_key text not null,
  from_state text,
  to_state text not null check (to_state in (
    'not_configured', 'design_approved', 'implemented', 'certified', 'enabled', 'retired'
  )),
  reason_code text not null check (reason_code ~ '^[A-Z0-9_]{1,64}$'),
  evidence_fingerprint text not null check (evidence_fingerprint ~ '^[0-9a-f]{64}$'),
  actor_type text not null check (actor_type in ('platform_support', 'system_worker', 'migration')),
  request_id text not null check (request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  occurred_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (organization_module_id, organization_id)
    references public.organization_extension_modules(id, organization_id) on delete restrict,
  foreign key (module_key) references public.extension_module_definitions(module_key) on delete restrict
);
create index extension_module_events_tenant_timeline_idx
  on public.extension_module_state_events (organization_id, occurred_at desc, id desc);

create or replace function public.spec33_validate_module_transition() returns trigger
language plpgsql security definer set search_path = pg_catalog as $$
declare v_readiness text;
begin
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id
      or new.module_key is distinct from old.module_key then
      raise exception 'IMMUTABLE_MODULE_OWNERSHIP';
    end if;
    if new.version <> old.version + 1 then raise exception 'STALE_MODULE_VERSION'; end if;
    if not (
      (old.state='not_configured' and new.state in ('design_approved','retired')) or
      (old.state='design_approved' and new.state in ('not_configured','implemented','retired')) or
      (old.state='implemented' and new.state in ('design_approved','certified','retired')) or
      (old.state='certified' and new.state in ('implemented','enabled','retired')) or
      (old.state='enabled' and new.state in ('certified','retired'))
    ) then raise exception 'INVALID_MODULE_TRANSITION'; end if;
  elsif new.state <> 'not_configured' then
    raise exception 'INVALID_INITIAL_MODULE_STATE';
  end if;
  if new.state in ('certified','enabled') then
    select readiness_state into v_readiness from public.extension_module_definitions
      where module_key=new.module_key;
    if v_readiness <> 'certified' then raise exception 'MODULE_NOT_CERTIFIED'; end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger organization_extension_modules_transition before insert or update
  on public.organization_extension_modules for each row
  execute function public.spec33_validate_module_transition();

create or replace function public.spec33_prevent_event_mutation() returns trigger
language plpgsql security invoker set search_path = pg_catalog as $$
begin raise exception 'IMMUTABLE_MODULE_EVENT'; end $$;
create trigger extension_module_events_append_only before update or delete
  on public.extension_module_state_events for each row execute function public.spec33_prevent_event_mutation();

create or replace view public.organization_extension_modules_safe as
select organization_id, module_key, state, version
from public.organization_extension_modules;

-- The transition trigger is defense in depth. Normal application principals get
-- no direct table or transition-function authority until a module addendum defines it.
do $$ declare relation_name text; begin
  foreach relation_name in array array[
    'extension_module_definitions', 'organization_extension_modules',
    'extension_module_state_events', 'organization_extension_modules_safe'
  ] loop
    execute format('revoke all on table public.%I from public, anon, authenticated', relation_name);
  end loop;
end $$;

alter table public.organization_extension_modules enable row level security;
alter table public.organization_extension_modules force row level security;
alter table public.extension_module_state_events enable row level security;
alter table public.extension_module_state_events force row level security;

comment on table public.organization_extension_modules is
  'SPEC-33 fail-closed rollout state; an absent row is not configured and only certified may become enabled.';
