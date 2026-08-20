-- SPEC-27 / MT-SPEC-03: revocable identities, application sessions,
-- organization API keys, and disabled-by-default support authority.
-- Additive only: SPEC-34 owns legacy principal invalidation and data cutover.

create extension if not exists pgcrypto;

create table public.app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  token_prefix text not null check (token_prefix ~ '^[A-Za-z0-9_-]{8,24}$'),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  hash_version integer not null check (hash_version > 0),
  csrf_token_hash text not null check (csrf_token_hash ~ '^[0-9a-f]{64}$'),
  auth_method text not null check (auth_method in ('password','google','sso','recovery')),
  assurance_level text not null default 'aal1' check (assurance_level in ('aal1','aal2')),
  created_at timestamptz not null default now(),
  authenticated_at timestamptz not null default now(),
  absolute_expires_at timestamptz not null,
  idle_expires_at timestamptz,
  remembered boolean not null default false,
  last_seen_at timestamptz not null default now(),
  last_ip_network cidr,
  user_agent_summary text check (user_agent_summary is null or char_length(user_agent_summary) <= 256),
  rotated_from_session_id uuid references public.app_sessions(id) on delete restrict,
  revoked_at timestamptz,
  revoked_by_actor_type text check (revoked_by_actor_type is null or revoked_by_actor_type in (
    'self','user','platform_operator','security_event','migration','system'
  )),
  revoked_by_actor_id uuid,
  revocation_reason text check (revocation_reason is null or revocation_reason ~ '^[a-z0-9_]{1,64}$'),
  created_request_id text not null check (char_length(created_request_id) between 8 and 128),
  last_request_id text not null check (char_length(last_request_id) between 8 and 128),
  version integer not null default 1 check (version > 0),
  check (absolute_expires_at > created_at),
  check (idle_expires_at is null or idle_expires_at <= absolute_expires_at),
  check ((revoked_at is null and revocation_reason is null)
    or (revoked_at is not null and revocation_reason is not null))
);
create index app_sessions_user_active_idx
  on public.app_sessions (user_id, absolute_expires_at desc, id) where revoked_at is null;
create index app_sessions_lookup_idx on public.app_sessions (token_prefix, token_hash);
create index app_sessions_expiry_idx
  on public.app_sessions (least(absolute_expires_at, coalesce(idle_expires_at, absolute_expires_at)))
  where revoked_at is null;
create unique index app_sessions_one_successor_idx
  on public.app_sessions (rotated_from_session_id) where rotated_from_session_id is not null;

create table public.organization_api_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  key_prefix text not null unique check (key_prefix ~ '^org_[A-Za-z0-9_-]{8,24}$'),
  secret_hash text not null unique check (secret_hash ~ '^[0-9a-f]{64}$'),
  hash_version integer not null check (hash_version > 0),
  scopes text[] not null check (cardinality(scopes) between 1 and 32),
  status text not null default 'active' check (status in ('active','revoked')),
  created_by_membership_id uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_used_at timestamptz,
  last_used_ip_network cidr,
  allowed_ip_cidrs cidr[] not null default '{}'::cidr[] check (cardinality(allowed_ip_cidrs) <= 32),
  rotated_from_key_id uuid references public.organization_api_keys(id) on delete restrict,
  revoked_at timestamptz,
  revoked_by_membership_id uuid,
  revocation_reason text check (revocation_reason is null or revocation_reason ~ '^[a-z0-9_]{1,64}$'),
  version integer not null default 1 check (version > 0),
  unique (id, organization_id),
  foreign key (created_by_membership_id, organization_id)
    references public.organization_memberships(id, organization_id) on delete restrict,
  foreign key (revoked_by_membership_id, organization_id)
    references public.organization_memberships(id, organization_id) on delete restrict,
  check (expires_at > created_at),
  check ((status = 'active' and revoked_at is null and revocation_reason is null)
    or (status = 'revoked' and revoked_at is not null and revocation_reason is not null))
);
create index organization_api_keys_tenant_active_idx
  on public.organization_api_keys (organization_id, status, expires_at, id);
create unique index organization_api_keys_one_successor_idx
  on public.organization_api_keys (rotated_from_key_id) where rotated_from_key_id is not null;

create table public.platform_operators (
  user_id uuid primary key references auth.users(id) on delete restrict,
  status text not null default 'disabled' check (status in ('disabled','active','revoked')),
  mfa_required boolean not null default true,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  revoked_at timestamptz,
  version integer not null default 1 check (version > 0),
  check (status <> 'active' or (mfa_required and activated_at is not null))
);

create table public.support_access_grants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  operator_user_id uuid not null references public.platform_operators(user_id) on delete restrict,
  scopes text[] not null check (cardinality(scopes) between 1 and 16),
  reason_code text not null check (reason_code ~ '^[a-z0-9_]{1,64}$'),
  ticket_reference text not null check (char_length(ticket_reference) between 3 and 128),
  approved_by_operator_user_id uuid references public.platform_operators(user_id) on delete restrict,
  assurance_level text not null check (assurance_level = 'aal2'),
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revocation_reason text check (revocation_reason is null or revocation_reason ~ '^[a-z0-9_]{1,64}$'),
  created_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  unique (id, organization_id),
  check (expires_at > starts_at and expires_at <= starts_at + interval '8 hours'),
  check (approved_by_operator_user_id is null or approved_by_operator_user_id <> operator_user_id),
  check ((revoked_at is null and revocation_reason is null)
    or (revoked_at is not null and revocation_reason is not null))
);
create index support_access_grants_tenant_active_idx
  on public.support_access_grants (organization_id, expires_at, operator_user_id)
  where revoked_at is null;

create table public.identity_security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete restrict,
  session_id uuid references public.app_sessions(id) on delete restrict,
  api_key_id uuid,
  action text not null check (action ~ '^[a-z0-9_.]{1,96}$'),
  outcome text not null check (outcome in ('succeeded','denied','failed','revoked')),
  reason_code text check (reason_code is null or reason_code ~ '^[A-Z0-9_]{1,64}$'),
  request_id text not null check (char_length(request_id) between 8 and 128),
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(metadata) = 'object'
    and octet_length(metadata::text) <= 8192
    and not metadata ?| array['authorization','cookie','csrf_token','password','raw_token','secret','signed_url']
  ),
  foreign key (api_key_id, organization_id)
    references public.organization_api_keys(id, organization_id) on delete restrict
);
create index identity_security_events_user_timeline_idx
  on public.identity_security_events (user_id, occurred_at desc, id desc);
create index identity_security_events_tenant_timeline_idx
  on public.identity_security_events (organization_id, occurred_at desc, id desc);

create or replace function public.spec27_prevent_security_history_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'IMMUTABLE_IDENTITY_HISTORY' using errcode = '55000'; end;
$$;
create trigger identity_security_events_append_only before update or delete on public.identity_security_events
  for each row execute function public.spec27_prevent_security_history_mutation();

create or replace function public.spec27_create_session(
  p_session_id uuid, p_user_id uuid, p_token_prefix text, p_token_hash text,
  p_hash_version integer, p_csrf_token_hash text, p_auth_method text,
  p_assurance_level text, p_absolute_expires_at timestamptz,
  p_idle_expires_at timestamptz, p_remembered boolean, p_ip_network cidr,
  p_user_agent_summary text, p_request_id text, p_active_session_limit integer
) returns public.app_sessions language plpgsql security definer set search_path = '' as $$
declare v_session public.app_sessions; v_count integer;
begin
  if p_active_session_limit < 1 or p_active_session_limit > 100 then
    raise exception 'INVALID_SESSION_LIMIT' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 27));
  select count(*) into v_count from public.app_sessions
    where user_id=p_user_id and revoked_at is null and absolute_expires_at > now()
      and (idle_expires_at is null or idle_expires_at > now());
  if v_count >= p_active_session_limit then
    raise exception 'SESSION_LIMIT_REACHED' using errcode='54000';
  end if;
  insert into public.app_sessions(id,user_id,token_prefix,token_hash,hash_version,csrf_token_hash,
    auth_method,assurance_level,absolute_expires_at,idle_expires_at,remembered,last_ip_network,
    user_agent_summary,created_request_id,last_request_id)
  values(p_session_id,p_user_id,p_token_prefix,p_token_hash,p_hash_version,p_csrf_token_hash,
    p_auth_method,p_assurance_level,p_absolute_expires_at,p_idle_expires_at,p_remembered,
    p_ip_network,p_user_agent_summary,p_request_id,p_request_id) returning * into v_session;
  insert into public.identity_security_events(user_id,session_id,action,outcome,request_id)
    values(p_user_id,v_session.id,'session.created','succeeded',p_request_id);
  return v_session;
end;
$$;

create or replace function public.spec27_rotate_session(
  p_current_session_id uuid, p_expected_version integer,
  p_new_session_id uuid, p_new_token_prefix text, p_new_token_hash text,
  p_new_csrf_token_hash text, p_hash_version integer,
  p_absolute_expires_at timestamptz, p_idle_expires_at timestamptz,
  p_request_id text
) returns public.app_sessions language plpgsql security definer set search_path = '' as $$
declare v_current public.app_sessions; v_new public.app_sessions;
begin
  select * into v_current from public.app_sessions where id = p_current_session_id for update;
  if not found or v_current.version <> p_expected_version or v_current.revoked_at is not null
    or v_current.absolute_expires_at <= now()
    or (v_current.idle_expires_at is not null and v_current.idle_expires_at <= now()) then
    raise exception 'SESSION_NOT_ACTIVE' using errcode = '28000';
  end if;
  update public.app_sessions set revoked_at=now(), revoked_by_actor_type='self',
    revocation_reason='rotated', last_request_id=p_request_id, version=version+1
    where id=v_current.id;
  insert into public.app_sessions(id,user_id,token_prefix,token_hash,hash_version,csrf_token_hash,
    auth_method,assurance_level,authenticated_at,absolute_expires_at,idle_expires_at,remembered,
    last_ip_network,user_agent_summary,rotated_from_session_id,created_request_id,last_request_id)
  values(p_new_session_id,v_current.user_id,p_new_token_prefix,p_new_token_hash,p_hash_version,
    p_new_csrf_token_hash,v_current.auth_method,v_current.assurance_level,v_current.authenticated_at,
    p_absolute_expires_at,p_idle_expires_at,v_current.remembered,v_current.last_ip_network,
    v_current.user_agent_summary,v_current.id,p_request_id,p_request_id) returning * into v_new;
  insert into public.identity_security_events(user_id,session_id,action,outcome,request_id)
    values(v_current.user_id,v_new.id,'session.rotated','succeeded',p_request_id);
  return v_new;
end;
$$;

create or replace function public.spec27_revoke_session(
  p_session_id uuid, p_expected_version integer, p_actor_type text,
  p_actor_id uuid, p_reason text, p_request_id text
) returns public.app_sessions language plpgsql security definer set search_path = '' as $$
declare v_session public.app_sessions;
begin
  select * into v_session from public.app_sessions where id=p_session_id for update;
  if not found then raise exception 'SESSION_NOT_FOUND' using errcode='P0002'; end if;
  if v_session.version <> p_expected_version then raise exception 'VERSION_CONFLICT' using errcode='40001'; end if;
  if v_session.revoked_at is null then
    update public.app_sessions set revoked_at=now(),revoked_by_actor_type=p_actor_type,
      revoked_by_actor_id=p_actor_id,revocation_reason=p_reason,last_request_id=p_request_id,
      version=version+1 where id=p_session_id returning * into v_session;
    insert into public.identity_security_events(user_id,session_id,action,outcome,request_id)
      values(v_session.user_id,v_session.id,'session.revoked','revoked',p_request_id);
  end if;
  return v_session;
end;
$$;

create or replace function public.spec27_create_api_key(
  p_key_id uuid, p_organization_id uuid, p_name text, p_key_prefix text,
  p_secret_hash text, p_hash_version integer, p_scopes text[],
  p_created_by_membership_id uuid, p_expires_at timestamptz,
  p_allowed_ip_cidrs cidr[], p_request_id text
) returns public.organization_api_keys language plpgsql security definer set search_path = '' as $$
declare v_key public.organization_api_keys; v_user_id uuid;
begin
  select user_id into v_user_id from public.organization_memberships
    where id=p_created_by_membership_id and organization_id=p_organization_id and status='active';
  if not found then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
  insert into public.organization_api_keys(id,organization_id,name,key_prefix,secret_hash,
    hash_version,scopes,created_by_membership_id,expires_at,allowed_ip_cidrs)
  values(p_key_id,p_organization_id,p_name,p_key_prefix,p_secret_hash,p_hash_version,
    p_scopes,p_created_by_membership_id,p_expires_at,p_allowed_ip_cidrs) returning * into v_key;
  insert into public.identity_security_events(user_id,organization_id,api_key_id,action,outcome,request_id)
    values(v_user_id,p_organization_id,v_key.id,'api_key.created','succeeded',p_request_id);
  return v_key;
end;
$$;

create or replace function public.spec27_revoke_api_key(
  p_organization_id uuid, p_key_id uuid, p_expected_version integer,
  p_actor_membership_id uuid, p_reason text, p_request_id text
) returns public.organization_api_keys language plpgsql security definer set search_path = '' as $$
declare v_key public.organization_api_keys; v_user_id uuid;
begin
  select user_id into v_user_id from public.organization_memberships
    where id=p_actor_membership_id and organization_id=p_organization_id and status='active';
  if not found then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
  select * into v_key from public.organization_api_keys
    where id=p_key_id and organization_id=p_organization_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
  if v_key.version <> p_expected_version then raise exception 'VERSION_CONFLICT' using errcode='40001'; end if;
  if v_key.status='active' then
    update public.organization_api_keys set status='revoked',revoked_at=now(),
      revoked_by_membership_id=p_actor_membership_id,revocation_reason=p_reason,version=version+1
      where id=p_key_id returning * into v_key;
    insert into public.identity_security_events(user_id,organization_id,api_key_id,action,outcome,request_id)
      values(v_user_id,p_organization_id,v_key.id,'api_key.revoked','revoked',p_request_id);
  end if;
  return v_key;
end;
$$;

create or replace function public.spec27_revoke_user_sessions(
  p_user_id uuid, p_except_session_id uuid, p_actor_type text, p_actor_id uuid,
  p_reason text, p_request_id text
) returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  update public.app_sessions set revoked_at=now(),revoked_by_actor_type=p_actor_type,
    revoked_by_actor_id=p_actor_id,revocation_reason=p_reason,last_request_id=p_request_id,
    version=version+1
  where user_id=p_user_id and revoked_at is null
    and (p_except_session_id is null or id <> p_except_session_id);
  get diagnostics v_count = row_count; return v_count;
end;
$$;

create or replace function public.spec27_touch_session(
  p_session_id uuid, p_expected_version integer, p_idle_expires_at timestamptz,
  p_request_id text, p_ip_network cidr
) returns public.app_sessions language plpgsql security definer set search_path = '' as $$
declare v_session public.app_sessions;
begin
  update public.app_sessions set last_seen_at=now(),idle_expires_at=p_idle_expires_at,
    last_request_id=p_request_id,last_ip_network=p_ip_network,version=version+1
  where id=p_session_id and version=p_expected_version and revoked_at is null
    and absolute_expires_at > now() and (idle_expires_at is null or idle_expires_at > now())
  returning * into v_session;
  if not found then raise exception 'SESSION_NOT_ACTIVE' using errcode='28000'; end if;
  return v_session;
end;
$$;

do $$ declare v_table text; begin
  foreach v_table in array array['app_sessions','organization_api_keys','platform_operators',
    'support_access_grants','identity_security_events'] loop
    execute format('alter table public.%I enable row level security',v_table);
    execute format('alter table public.%I force row level security',v_table);
    execute format('revoke all on table public.%I from public, anon, authenticated',v_table);
  end loop;
end $$;

grant select,insert,update,delete on public.app_sessions,public.organization_api_keys to service_role;
grant select,insert,update on public.platform_operators,public.support_access_grants to service_role;
grant select,insert on public.identity_security_events to service_role;
revoke all on function public.spec27_prevent_security_history_mutation() from public,anon,authenticated;
revoke all on function public.spec27_create_session(uuid,uuid,text,text,integer,text,text,text,timestamptz,timestamptz,boolean,cidr,text,text,integer) from public,anon,authenticated;
revoke all on function public.spec27_rotate_session(uuid,integer,uuid,text,text,text,integer,timestamptz,timestamptz,text) from public,anon,authenticated;
revoke all on function public.spec27_revoke_session(uuid,integer,text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.spec27_revoke_user_sessions(uuid,uuid,text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.spec27_touch_session(uuid,integer,timestamptz,text,cidr) from public,anon,authenticated;
revoke all on function public.spec27_create_api_key(uuid,uuid,text,text,text,integer,text[],uuid,timestamptz,cidr[],text) from public,anon,authenticated;
revoke all on function public.spec27_revoke_api_key(uuid,uuid,integer,uuid,text,text) from public,anon,authenticated;
grant execute on function public.spec27_rotate_session(uuid,integer,uuid,text,text,text,integer,timestamptz,timestamptz,text) to service_role;
grant execute on function public.spec27_create_session(uuid,uuid,text,text,integer,text,text,text,timestamptz,timestamptz,boolean,cidr,text,text,integer) to service_role;
grant execute on function public.spec27_revoke_session(uuid,integer,text,uuid,text,text) to service_role;
grant execute on function public.spec27_revoke_user_sessions(uuid,uuid,text,uuid,text,text) to service_role;
grant execute on function public.spec27_touch_session(uuid,integer,timestamptz,text,cidr) to service_role;
grant execute on function public.spec27_create_api_key(uuid,uuid,text,text,text,integer,text[],uuid,timestamptz,cidr[],text) to service_role;
grant execute on function public.spec27_revoke_api_key(uuid,uuid,integer,uuid,text,text) to service_role;

comment on table public.app_sessions is 'SPEC-27 revocable opaque sessions; raw session and CSRF tokens are never persisted.';
comment on table public.organization_api_keys is 'SPEC-27 organization-scoped machine credentials; raw keys are displayed once.';
comment on table public.support_access_grants is 'SPEC-27 support boundary. Runtime support access remains disabled unless separately approved.';
