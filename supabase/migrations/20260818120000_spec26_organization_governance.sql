-- SPEC-26 / MT-SPEC-02: additive organization-governance foundation.
-- This migration intentionally creates no production organization or membership.

create extension if not exists pgcrypto;

create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 160),
  locale text not null check (locale ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  time_zone text not null check (char_length(btrim(time_zone)) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0)
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (
    char_length(slug) between 3 and 63
    and slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'
  ),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 160),
  legal_name text check (legal_name is null or char_length(btrim(legal_name)) between 1 and 240),
  status text not null default 'active' check (status in ('active', 'suspended', 'pending_deletion', 'deleted')),
  plan_key text not null check (plan_key in ('internal', 'standard', 'enterprise')),
  locale text not null check (locale ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  time_zone text not null check (char_length(btrim(time_zone)) between 1 and 100),
  creation_source text not null check (creation_source in ('platform', 'migration', 'self_service')),
  created_by_user_id uuid references auth.users(id) on delete restrict,
  status_reason_code text check (status_reason_code is null or status_reason_code ~ '^[a-z0-9_]{1,64}$'),
  status_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1 check (version > 0),
  check ((status = 'deleted') = (deleted_at is not null))
);

create table public.organization_settings (
  organization_id uuid primary key references public.organizations(id) on delete restrict,
  record_visibility text not null default 'organization' check (record_visibility in ('organization', 'assigned_only')),
  public_display_name text check (public_display_name is null or char_length(btrim(public_display_name)) between 1 and 160),
  primary_color text check (primary_color is null or primary_color ~ '^#[0-9A-F]{6}$'),
  accent_color text check (accent_color is null or accent_color ~ '^#[0-9A-F]{6}$'),
  logo_asset_id uuid,
  feature_defaults jsonb not null default '{}'::jsonb check (jsonb_typeof(feature_defaults) = 'object'),
  feature_schema_version integer not null default 1 check (feature_schema_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0)
);

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  role text not null check (role in ('owner', 'admin', 'member', 'viewer')),
  status text not null check (status in ('active', 'suspended', 'removed')),
  invitation_id uuid,
  invited_at timestamptz,
  joined_at timestamptz not null,
  suspended_at timestamptz,
  suspended_by_user_id uuid references auth.users(id) on delete restrict,
  suspension_reason_code text check (suspension_reason_code is null or suspension_reason_code ~ '^[a-z0-9_]{1,64}$'),
  removed_at timestamptz,
  removed_by_user_id uuid references auth.users(id) on delete restrict,
  removal_reason_code text check (removal_reason_code is null or removal_reason_code ~ '^[a-z0-9_]{1,64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  unique (organization_id, user_id),
  unique (id, organization_id),
  check (
    (status = 'active' and suspended_at is null and removed_at is null)
    or (status = 'suspended' and suspended_at is not null and removed_at is null)
    or (status = 'removed' and removed_at is not null)
  )
);

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  email_normalized text not null check (
    char_length(email_normalized) between 3 and 320
    and email_normalized = lower(btrim(email_normalized))
  ),
  intended_role text not null check (intended_role in ('admin', 'member', 'viewer')),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  token_prefix text check (token_prefix is null or token_prefix ~ '^[A-Za-z0-9_-]{4,16}$'),
  token_version integer not null default 1 check (token_version > 0),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'replaced')),
  expires_at timestamptz not null,
  invited_by_membership_id uuid not null,
  created_at timestamptz not null default now(),
  last_sent_at timestamptz,
  send_count integer not null default 0 check (send_count >= 0),
  delivery_state text not null default 'pending' check (delivery_state in ('pending', 'sent', 'failed')),
  last_delivery_error_code text check (last_delivery_error_code is null or last_delivery_error_code ~ '^[A-Z0-9_]{1,64}$'),
  accepted_at timestamptz,
  accepted_by_user_id uuid references auth.users(id) on delete restrict,
  accepted_membership_id uuid,
  revoked_at timestamptz,
  revoked_by_membership_id uuid,
  replaced_at timestamptz,
  replacement_invitation_id uuid references public.organization_invitations(id)
    on delete restrict deferrable initially deferred,
  version integer not null default 1 check (version > 0),
  unique (id, organization_id),
  foreign key (invited_by_membership_id, organization_id)
    references public.organization_memberships(id, organization_id) on delete restrict,
  foreign key (revoked_by_membership_id, organization_id)
    references public.organization_memberships(id, organization_id) on delete restrict,
  check (expires_at > created_at),
  check (
    (status = 'pending' and accepted_at is null and revoked_at is null and replaced_at is null)
    or (status = 'accepted' and accepted_at is not null and accepted_by_user_id is not null and accepted_membership_id is not null)
    or (status = 'revoked' and revoked_at is not null and revoked_by_membership_id is not null)
    or (status = 'replaced' and replaced_at is not null and replacement_invitation_id is not null)
  )
);

alter table public.organization_memberships
  add constraint organization_memberships_invitation_fk
  foreign key (invitation_id, organization_id)
  references public.organization_invitations(id, organization_id) on delete restrict;

alter table public.organization_invitations
  add constraint organization_invitations_accepted_membership_fk
  foreign key (accepted_membership_id, organization_id)
  references public.organization_memberships(id, organization_id) on delete restrict;

create table public.organization_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  event_type text not null check (event_type in (
    'organization.created', 'organization.settings_updated', 'organization.suspended',
    'organization.reactivated', 'organization.deletion_requested', 'organization.deletion_cancelled',
    'organization.deletion_blocked', 'organization.deleted', 'organization.export_requested',
    'member.invited', 'member.invitation_resent', 'member.invitation_revoked',
    'member.invitation_accepted', 'member.role_changed', 'member.suspended',
    'member.reactivated', 'member.removed', 'member.left', 'ownership.transferred'
  )),
  actor_type text not null check (actor_type in ('member', 'platform_operator', 'system')),
  actor_user_id uuid references auth.users(id) on delete restrict,
  actor_membership_id uuid,
  target_type text not null check (target_type ~ '^[a-z_]{1,64}$'),
  target_id uuid not null,
  request_id text not null check (request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now(),
  foreign key (actor_membership_id, organization_id)
    references public.organization_memberships(id, organization_id) on delete restrict,
  check ((actor_type = 'member') = (actor_membership_id is not null))
);

create table public.organization_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  requested_by_membership_id uuid not null,
  requested_at timestamptz not null default now(),
  confirmed_at timestamptz not null,
  policy_version text not null check (char_length(policy_version) between 1 and 64),
  scheduled_deletion_at timestamptz not null,
  prior_organization_status text not null check (prior_organization_status in ('active', 'suspended')),
  state text not null default 'pending' check (state in ('pending', 'cancelled', 'executing', 'blocked', 'completed')),
  cancelled_at timestamptz,
  cancelled_by_membership_id uuid,
  finalized_at timestamptz,
  finalized_by_user_id uuid references auth.users(id) on delete restrict,
  reason_code text check (reason_code is null or reason_code ~ '^[a-z0-9_]{1,64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  foreign key (requested_by_membership_id, organization_id)
    references public.organization_memberships(id, organization_id) on delete restrict,
  foreign key (cancelled_by_membership_id, organization_id)
    references public.organization_memberships(id, organization_id) on delete restrict,
  check (scheduled_deletion_at > confirmed_at)
);

create table public.organization_export_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  requested_by_membership_id uuid not null,
  export_scope text not null check (export_scope in ('full')),
  policy_version text not null check (char_length(policy_version) between 1 and 64),
  state text not null default 'queued' check (state in ('queued', 'processing', 'ready', 'failed', 'expired')),
  requested_at timestamptz not null default now(),
  ready_at timestamptz,
  expires_at timestamptz,
  asset_id uuid,
  error_code text check (error_code is null or error_code ~ '^[A-Z0-9_]{1,64}$'),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  foreign key (requested_by_membership_id, organization_id)
    references public.organization_memberships(id, organization_id) on delete restrict
);

create table public.organization_legal_holds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  state text not null default 'active' check (state in ('active', 'released')),
  reason_code text not null check (reason_code ~ '^[a-z0-9_]{1,64}$'),
  evidence_reference text not null check (char_length(btrim(evidence_reference)) between 1 and 240),
  placed_by_user_id uuid not null references auth.users(id) on delete restrict,
  placed_at timestamptz not null default now(),
  released_by_user_id uuid references auth.users(id) on delete restrict,
  released_at timestamptz,
  version integer not null default 1 check (version > 0),
  check ((state = 'active' and released_at is null and released_by_user_id is null)
    or (state = 'released' and released_at is not null and released_by_user_id is not null))
);

create unique index organization_invitations_one_pending_idx
  on public.organization_invitations (organization_id, email_normalized) where status = 'pending';
create unique index organization_deletion_requests_one_open_idx
  on public.organization_deletion_requests (organization_id) where state in ('pending', 'executing', 'blocked');
create index organizations_status_created_idx on public.organizations (status, created_at);
create index organization_memberships_user_state_idx on public.organization_memberships (user_id, status, organization_id);
create index organization_memberships_admin_idx on public.organization_memberships (organization_id, status, role, joined_at);
create index organization_invitations_admin_idx on public.organization_invitations (organization_id, status, expires_at);
create index organization_invitations_accept_idx on public.organization_invitations (email_normalized, status, expires_at);
create index organization_events_timeline_idx on public.organization_events (organization_id, occurred_at desc);
create index organization_deletion_requests_state_idx on public.organization_deletion_requests (organization_id, state);
create index organization_export_requests_state_idx on public.organization_export_requests (organization_id, state);
create index organization_legal_holds_state_idx on public.organization_legal_holds (organization_id, state);

create or replace function public.spec26_touch_version()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end;
$$;

create or replace function public.spec26_protect_organization_identity()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.id <> old.id or new.slug <> old.slug then
    raise exception 'ORGANIZATION_IDENTITY_IMMUTABLE';
  end if;
  return new;
end;
$$;

create or replace function public.spec26_prevent_mutation()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  raise exception 'GOVERNANCE_HISTORY_IMMUTABLE';
end;
$$;

create or replace function public.spec26_require_active_owner()
returns trigger language plpgsql security invoker set search_path = public as $$
declare v_organization_id uuid;
begin
  v_organization_id := coalesce(new.organization_id, old.organization_id);
  perform 1 from public.organizations where id = v_organization_id for update;
  if exists (select 1 from public.organizations where id = v_organization_id and status <> 'deleted')
    and not exists (
      select 1 from public.organization_memberships
      where organization_id = v_organization_id and role = 'owner' and status = 'active'
    ) then
    raise exception 'LAST_OWNER_REQUIRED';
  end if;
  return new;
end;
$$;

create or replace function public.spec26_require_initial_owner()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if not exists (
    select 1 from public.organization_memberships
    where organization_id = new.id and role = 'owner' and status = 'active'
  ) then
    raise exception 'LAST_OWNER_REQUIRED';
  end if;
  return new;
end;
$$;

create trigger organizations_identity_immutable before update on public.organizations
for each row execute function public.spec26_protect_organization_identity();
create trigger user_profiles_touch before update on public.user_profiles
for each row execute function public.spec26_touch_version();
create trigger organizations_touch before update on public.organizations
for each row execute function public.spec26_touch_version();
create trigger organization_settings_touch before update on public.organization_settings
for each row execute function public.spec26_touch_version();
create trigger organization_memberships_touch before update on public.organization_memberships
for each row execute function public.spec26_touch_version();
create trigger organization_deletion_requests_touch before update on public.organization_deletion_requests
for each row execute function public.spec26_touch_version();
create trigger organization_export_requests_touch before update on public.organization_export_requests
for each row execute function public.spec26_touch_version();
create trigger organization_events_append_only before update or delete on public.organization_events
for each row execute function public.spec26_prevent_mutation();
create trigger organizations_no_delete before delete on public.organizations
for each row execute function public.spec26_prevent_mutation();
create trigger organization_memberships_no_delete before delete on public.organization_memberships
for each row execute function public.spec26_prevent_mutation();
create trigger organization_memberships_last_owner after update on public.organization_memberships
for each row when (old.role = 'owner' or old.status = 'active') execute function public.spec26_require_active_owner();
create constraint trigger organizations_initial_owner
after insert on public.organizations deferrable initially deferred
for each row execute function public.spec26_require_initial_owner();

create or replace function public.spec26_create_organization(
  p_organization_id uuid, p_slug text, p_display_name text, p_legal_name text,
  p_plan_key text, p_locale text, p_time_zone text, p_creation_source text,
  p_created_by_user_id uuid, p_initial_owner_user_id uuid,
  p_initial_owner_membership_id uuid, p_request_id text
) returns setof public.organizations
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_organization public.organizations%rowtype;
begin
  if p_creation_source = 'self_service' then raise exception 'SELF_SERVICE_DISABLED'; end if;
  if p_slug in ('api', 'app', 'auth', 'admin', 'billing', 'help', 'invitations',
    'login', 'logout', 'new', 'platform', 'register', 'settings', 'status', 'support', 'www') then
    raise exception 'RESERVED_SLUG';
  end if;
  if p_creation_source = 'platform' and p_created_by_user_id is null then
    raise exception 'PLATFORM_ACTOR_REQUIRED';
  end if;
  insert into public.organizations (
    id, slug, display_name, legal_name, plan_key, locale, time_zone,
    creation_source, created_by_user_id
  ) values (
    p_organization_id, p_slug, btrim(p_display_name), nullif(btrim(p_legal_name), ''),
    p_plan_key, p_locale, p_time_zone, p_creation_source, p_created_by_user_id
  ) returning * into v_organization;
  insert into public.organization_settings (organization_id) values (p_organization_id);
  insert into public.organization_memberships (
    id, organization_id, user_id, role, status, joined_at
  ) values (
    p_initial_owner_membership_id, p_organization_id, p_initial_owner_user_id, 'owner', 'active', now()
  );
  insert into public.organization_events (
    organization_id, event_type, actor_type, actor_user_id, target_type, target_id, request_id, metadata
  ) values (
    p_organization_id, 'organization.created', 'platform_operator', p_created_by_user_id,
    'organization', p_organization_id, p_request_id,
    jsonb_build_object('creation_source', p_creation_source, 'plan_key', p_plan_key)
  );
  return next v_organization;
end;
$$;

create or replace function public.spec26_create_invitation(
  p_invitation_id uuid, p_organization_id uuid, p_email_normalized text,
  p_intended_role text, p_token_hash text, p_token_prefix text,
  p_expires_at timestamptz, p_invited_by_membership_id uuid, p_request_id text
) returns setof public.organization_invitations
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor public.organization_memberships%rowtype;
  v_organization public.organizations%rowtype;
  v_invitation public.organization_invitations%rowtype;
begin
  select * into v_organization from public.organizations
  where id = p_organization_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_organization.status = 'suspended' then raise exception 'ORGANIZATION_SUSPENDED'; end if;
  if v_organization.status = 'pending_deletion' then raise exception 'ORGANIZATION_PENDING_DELETION'; end if;
  if v_organization.status <> 'active' then raise exception 'NOT_FOUND'; end if;

  select * into v_actor from public.organization_memberships
  where id = p_invited_by_membership_id and organization_id = p_organization_id
  for update;
  if not found or v_actor.status <> 'active' or v_actor.role not in ('owner', 'admin') then
    raise exception 'FORBIDDEN';
  end if;
  if p_intended_role = 'owner'
    or (v_actor.role = 'admin' and p_intended_role not in ('member', 'viewer'))
    or p_intended_role not in ('admin', 'member', 'viewer') then
    raise exception 'FORBIDDEN';
  end if;
  if exists (
    select 1 from public.organization_memberships m
    join auth.users u on u.id = m.user_id
    where m.organization_id = p_organization_id and m.status = 'active'
      and lower(btrim(u.email)) = p_email_normalized
  ) then
    raise exception 'ALREADY_A_MEMBER';
  end if;

  insert into public.organization_invitations (
    id, organization_id, email_normalized, intended_role, token_hash,
    token_prefix, expires_at, invited_by_membership_id
  ) values (
    p_invitation_id, p_organization_id, p_email_normalized, p_intended_role,
    p_token_hash, p_token_prefix, p_expires_at, p_invited_by_membership_id
  ) returning * into v_invitation;
  insert into public.organization_events (
    organization_id, event_type, actor_type, actor_user_id, actor_membership_id,
    target_type, target_id, request_id, metadata
  ) values (
    p_organization_id, 'member.invited', 'member', v_actor.user_id, v_actor.id,
    'invitation', p_invitation_id, p_request_id,
    jsonb_build_object('intended_role', p_intended_role, 'expires_at', p_expires_at)
  );
  return next v_invitation;
end;
$$;

create or replace function public.spec26_accept_invitation(
  p_raw_token text, p_user_id uuid, p_verified_email_normalized text, p_request_id text
) returns setof public.organization_memberships
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_invitation public.organization_invitations%rowtype;
  v_organization public.organizations%rowtype;
  v_membership public.organization_memberships%rowtype;
begin
  select * into v_invitation from public.organization_invitations
  where token_hash = encode(digest(p_raw_token, 'sha256'), 'hex');
  if not found or v_invitation.status <> 'pending' or v_invitation.expires_at <= now() then
    raise exception 'INVITATION_INVALID';
  end if;
  select * into v_organization from public.organizations where id = v_invitation.organization_id for update;
  if v_organization.status <> 'active' then raise exception 'ORGANIZATION_NOT_ACTIVE'; end if;
  select * into v_invitation from public.organization_invitations
  where id = v_invitation.id for update;
  if v_invitation.status <> 'pending' or v_invitation.expires_at <= now() then
    raise exception 'INVITATION_INVALID';
  end if;
  if lower(btrim(p_verified_email_normalized)) <> v_invitation.email_normalized then
    raise exception 'INVITATION_INVALID';
  end if;
  insert into public.organization_memberships (
    organization_id, user_id, role, status, invitation_id, invited_at, joined_at
  ) values (
    v_invitation.organization_id, p_user_id, v_invitation.intended_role, 'active',
    v_invitation.id, v_invitation.created_at, now()
  ) on conflict (organization_id, user_id) do update set
    role = excluded.role, status = 'active', invitation_id = excluded.invitation_id,
    invited_at = excluded.invited_at, joined_at = now(), suspended_at = null,
    suspended_by_user_id = null, suspension_reason_code = null,
    removed_at = null, removed_by_user_id = null, removal_reason_code = null
  where organization_memberships.status in ('suspended', 'removed')
  returning * into v_membership;
  if not found then raise exception 'ALREADY_A_MEMBER'; end if;
  update public.organization_invitations set
    status = 'accepted', accepted_at = now(), accepted_by_user_id = p_user_id,
    accepted_membership_id = v_membership.id, version = version + 1
  where id = v_invitation.id;
  insert into public.organization_events (
    organization_id, event_type, actor_type, actor_user_id, actor_membership_id,
    target_type, target_id, request_id, metadata
  ) values (
    v_invitation.organization_id, 'member.invitation_accepted', 'member', p_user_id,
    v_membership.id, 'membership', v_membership.id, p_request_id,
    jsonb_build_object('role', v_membership.role, 'context_refresh_required', true)
  );
  return next v_membership;
end;
$$;

create or replace function public.spec26_resend_invitation(
  p_organization_id uuid, p_invitation_id uuid, p_replacement_invitation_id uuid,
  p_token_hash text, p_token_prefix text, p_expires_at timestamptz,
  p_actor_membership_id uuid, p_request_id text
) returns setof public.organization_invitations
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor public.organization_memberships%rowtype;
  v_old public.organization_invitations%rowtype;
  v_new public.organization_invitations%rowtype;
begin
  perform 1 from public.organizations where id = p_organization_id and status = 'active' for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into v_actor from public.organization_memberships
  where id = p_actor_membership_id and organization_id = p_organization_id and status = 'active' for update;
  if not found or v_actor.role not in ('owner', 'admin') then raise exception 'FORBIDDEN'; end if;
  select * into v_old from public.organization_invitations
  where id = p_invitation_id and organization_id = p_organization_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_old.status <> 'pending' then raise exception 'INVITATION_INVALID'; end if;
  if v_actor.role = 'admin' and v_old.intended_role = 'admin' then raise exception 'FORBIDDEN'; end if;

  update public.organization_invitations set
    status = 'replaced', replaced_at = now(), replacement_invitation_id = p_replacement_invitation_id,
    version = version + 1
  where id = v_old.id;
  insert into public.organization_invitations (
    id, organization_id, email_normalized, intended_role, token_hash, token_prefix,
    token_version, expires_at, invited_by_membership_id
  ) values (
    p_replacement_invitation_id, p_organization_id, v_old.email_normalized,
    v_old.intended_role, p_token_hash, p_token_prefix, v_old.token_version + 1,
    p_expires_at, p_actor_membership_id
  ) returning * into v_new;
  insert into public.organization_events (
    organization_id, event_type, actor_type, actor_user_id, actor_membership_id,
    target_type, target_id, request_id, metadata
  ) values (
    p_organization_id, 'member.invitation_resent', 'member', v_actor.user_id, v_actor.id,
    'invitation', v_new.id, p_request_id,
    jsonb_build_object('replaced_invitation_id', v_old.id, 'token_version', v_new.token_version)
  );
  return next v_new;
end;
$$;

create or replace function public.spec26_revoke_invitation(
  p_organization_id uuid, p_invitation_id uuid, p_actor_membership_id uuid, p_request_id text
) returns setof public.organization_invitations
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor public.organization_memberships%rowtype;
  v_invitation public.organization_invitations%rowtype;
begin
  perform 1 from public.organizations where id = p_organization_id and status = 'active' for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into v_actor from public.organization_memberships
  where id = p_actor_membership_id and organization_id = p_organization_id and status = 'active' for update;
  if not found or v_actor.role not in ('owner', 'admin') then raise exception 'FORBIDDEN'; end if;
  select * into v_invitation from public.organization_invitations
  where id = p_invitation_id and organization_id = p_organization_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_actor.role = 'admin' and v_invitation.intended_role = 'admin' then raise exception 'FORBIDDEN'; end if;
  if v_invitation.status = 'revoked' then return next v_invitation; return; end if;
  if v_invitation.status <> 'pending' then raise exception 'INVITATION_INVALID'; end if;
  update public.organization_invitations set
    status = 'revoked', revoked_at = now(), revoked_by_membership_id = v_actor.id,
    version = version + 1
  where id = v_invitation.id returning * into v_invitation;
  insert into public.organization_events (
    organization_id, event_type, actor_type, actor_user_id, actor_membership_id,
    target_type, target_id, request_id, metadata
  ) values (
    p_organization_id, 'member.invitation_revoked', 'member', v_actor.user_id, v_actor.id,
    'invitation', v_invitation.id, p_request_id, '{}'::jsonb
  );
  return next v_invitation;
end;
$$;

create or replace function public.spec26_resolve_invitation(p_raw_token text)
returns table (
  organization_display_name text, email_masked text, intended_role text, expires_at timestamptz
) language sql security definer set search_path = public, extensions, pg_temp stable as $$
  select coalesce(s.public_display_name, o.display_name),
    left(i.email_normalized, 1) || '***@' || split_part(i.email_normalized, '@', 2),
    i.intended_role, i.expires_at
  from public.organization_invitations i
  join public.organizations o on o.id = i.organization_id and o.status = 'active'
  join public.organization_settings s on s.organization_id = o.id
  where i.token_hash = encode(digest(p_raw_token, 'sha256'), 'hex')
    and i.status = 'pending' and i.expires_at > now()
  limit 1
$$;

create or replace function public.spec26_mutate_membership(
  p_organization_id uuid, p_target_user_id uuid, p_next_role text,
  p_next_status text, p_expected_version integer, p_reason_code text,
  p_actor_membership_id uuid, p_request_id text
) returns setof public.organization_memberships
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor public.organization_memberships%rowtype;
  v_target public.organization_memberships%rowtype;
  v_event_type text;
  v_prior_role text;
begin
  perform 1 from public.organizations where id = p_organization_id and status = 'active' for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into v_actor from public.organization_memberships
  where id = p_actor_membership_id and organization_id = p_organization_id and status = 'active' for update;
  select * into v_target from public.organization_memberships
  where organization_id = p_organization_id and user_id = p_target_user_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_actor.id is null or v_actor.role not in ('owner', 'admin') or v_actor.user_id = p_target_user_id then
    raise exception 'FORBIDDEN';
  end if;
  if v_target.version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if v_actor.role = 'admin' and v_target.role in ('owner', 'admin') then raise exception 'FORBIDDEN'; end if;

  if p_next_role is not null then
    if p_next_status is not null or p_next_role not in ('admin', 'member', 'viewer') then
      raise exception 'FORBIDDEN';
    end if;
    if v_actor.role = 'admin' and p_next_role = 'admin' then raise exception 'FORBIDDEN'; end if;
    v_prior_role := v_target.role;
    update public.organization_memberships set role = p_next_role where id = v_target.id
    returning * into v_target;
    v_event_type := 'member.role_changed';
  elsif p_next_status is not null then
    if p_next_status = 'active' and v_target.status <> 'suspended' then raise exception 'FORBIDDEN'; end if;
    if p_next_status = 'suspended' and v_target.status <> 'active' then raise exception 'FORBIDDEN'; end if;
    if p_next_status = 'removed' and v_target.status not in ('active', 'suspended') then raise exception 'FORBIDDEN'; end if;
    if p_next_status in ('suspended', 'removed')
      and (p_reason_code is null or p_reason_code !~ '^[a-z0-9_]{1,64}$') then
      raise exception 'FORBIDDEN';
    end if;
    update public.organization_memberships set
      status = p_next_status,
      suspended_at = case when p_next_status = 'suspended' then now() else null end,
      suspended_by_user_id = case when p_next_status = 'suspended' then v_actor.user_id else null end,
      suspension_reason_code = case when p_next_status = 'suspended' then p_reason_code else null end,
      removed_at = case when p_next_status = 'removed' then now() else removed_at end,
      removed_by_user_id = case when p_next_status = 'removed' then v_actor.user_id else removed_by_user_id end,
      removal_reason_code = case when p_next_status = 'removed' then p_reason_code else removal_reason_code end
    where id = v_target.id returning * into v_target;
    v_event_type := case p_next_status
      when 'suspended' then 'member.suspended'
      when 'active' then 'member.reactivated'
      else 'member.removed' end;
  else
    raise exception 'FORBIDDEN';
  end if;

  insert into public.organization_events (
    organization_id, event_type, actor_type, actor_user_id, actor_membership_id,
    target_type, target_id, request_id, metadata
  ) values (
    p_organization_id, v_event_type, 'member', v_actor.user_id, v_actor.id,
    'membership', v_target.id, p_request_id,
    jsonb_strip_nulls(jsonb_build_object('prior_role', v_prior_role, 'new_role', p_next_role,
      'new_status', p_next_status, 'reason_code', p_reason_code))
  );
  return next v_target;
end;
$$;

create or replace function public.spec26_transfer_ownership(
  p_organization_id uuid, p_source_owner_membership_id uuid, p_target_user_id uuid,
  p_source_role_after text, p_expected_organization_version integer,
  p_expected_target_membership_version integer, p_request_id text
) returns setof public.organization_memberships
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_organization public.organizations%rowtype;
  v_source public.organization_memberships%rowtype;
  v_target public.organization_memberships%rowtype;
  v_target_prior_role text;
begin
  select * into v_organization from public.organizations
  where id = p_organization_id and status = 'active' for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_source_role_after not in ('owner', 'admin', 'member', 'viewer') then raise exception 'FORBIDDEN'; end if;
  if exists (
    select 1 from public.organization_events where organization_id = p_organization_id
      and event_type = 'ownership.transferred' and request_id = p_request_id
  ) then
    return query select * from public.organization_memberships
      where organization_id = p_organization_id
        and (id = p_source_owner_membership_id or user_id = p_target_user_id)
      order by id;
    return;
  end if;
  if v_organization.version <> p_expected_organization_version then raise exception 'VERSION_CONFLICT'; end if;
  select * into v_source from public.organization_memberships
  where id = p_source_owner_membership_id and organization_id = p_organization_id for update;
  select * into v_target from public.organization_memberships
  where user_id = p_target_user_id and organization_id = p_organization_id for update;
  if v_source.id is null or v_source.role <> 'owner' or v_source.status <> 'active'
    or v_target.id is null or v_target.status <> 'active' or v_target.id = v_source.id then
    raise exception 'FORBIDDEN';
  end if;
  if v_target.version <> p_expected_target_membership_version then raise exception 'VERSION_CONFLICT'; end if;

  v_target_prior_role := v_target.role;
  update public.organization_memberships set role = 'owner' where id = v_target.id returning * into v_target;
  update public.organization_memberships set role = p_source_role_after where id = v_source.id returning * into v_source;
  update public.organizations set version = version + 1 where id = p_organization_id;
  insert into public.organization_events (
    organization_id, event_type, actor_type, actor_user_id, actor_membership_id,
    target_type, target_id, request_id, metadata
  ) values (
    p_organization_id, 'ownership.transferred', 'member', v_source.user_id, v_source.id,
    'membership', v_target.id, p_request_id,
    jsonb_build_object('target_prior_role', v_target_prior_role, 'source_role_after', p_source_role_after)
  );
  return next v_source;
  return next v_target;
end;
$$;

create unique index organization_events_ownership_request_idx
  on public.organization_events (organization_id, request_id)
  where event_type = 'ownership.transferred';

create or replace function public.spec26_update_organization_settings(
  p_organization_id uuid, p_expected_version integer, p_public_display_name text,
  p_primary_color text, p_accent_color text, p_feature_defaults jsonb,
  p_actor_membership_id uuid, p_request_id text
) returns setof public.organization_settings
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor public.organization_memberships%rowtype;
  v_settings public.organization_settings%rowtype;
begin
  perform 1 from public.organizations where id = p_organization_id and status = 'active' for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into v_actor from public.organization_memberships
  where id = p_actor_membership_id and organization_id = p_organization_id
    and status = 'active' and role in ('owner', 'admin') for update;
  if not found then raise exception 'FORBIDDEN'; end if;
  select * into v_settings from public.organization_settings
  where organization_id = p_organization_id for update;
  if v_settings.version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  update public.organization_settings set
    public_display_name = p_public_display_name,
    primary_color = p_primary_color,
    accent_color = p_accent_color,
    feature_defaults = p_feature_defaults
  where organization_id = p_organization_id returning * into v_settings;
  insert into public.organization_events (
    organization_id, event_type, actor_type, actor_user_id, actor_membership_id,
    target_type, target_id, request_id, metadata
  ) values (
    p_organization_id, 'organization.settings_updated', 'member', v_actor.user_id, v_actor.id,
    'organization_settings', p_organization_id, p_request_id,
    jsonb_build_object('changed_fields', jsonb_build_array(
      'public_display_name', 'primary_color', 'accent_color', 'feature_defaults'))
  );
  return next v_settings;
end;
$$;

create or replace function public.spec26_mark_invitation_delivery(
  p_invitation_id uuid, p_delivery_state text, p_error_code text
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_delivery_state not in ('sent', 'failed') then raise exception 'FORBIDDEN'; end if;
  if p_error_code is not null and p_error_code !~ '^[A-Z0-9_]{1,64}$' then raise exception 'FORBIDDEN'; end if;
  update public.organization_invitations set
    delivery_state = p_delivery_state,
    last_delivery_error_code = case when p_delivery_state = 'failed' then p_error_code else null end,
    last_sent_at = now(), send_count = send_count + 1, version = version + 1
  where id = p_invitation_id and status = 'pending';
  if not found then raise exception 'INVITATION_INVALID'; end if;
end;
$$;

alter table public.user_profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_settings enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.organization_events enable row level security;
alter table public.organization_deletion_requests enable row level security;
alter table public.organization_export_requests enable row level security;
alter table public.organization_legal_holds enable row level security;

revoke all on public.user_profiles, public.organizations, public.organization_settings,
  public.organization_memberships, public.organization_invitations, public.organization_events,
  public.organization_deletion_requests, public.organization_export_requests,
  public.organization_legal_holds from public, anon, authenticated;
grant select, insert, update on public.user_profiles, public.organizations,
  public.organization_settings, public.organization_memberships,
  public.organization_invitations, public.organization_deletion_requests,
  public.organization_export_requests, public.organization_legal_holds to service_role;
grant select, insert on public.organization_events to service_role;
revoke all on function public.spec26_create_organization(uuid, text, text, text, text, text, text, text, uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.spec26_create_organization(uuid, text, text, text, text, text, text, text, uuid, uuid, uuid, text)
  to service_role;
revoke all on function public.spec26_create_invitation(uuid, uuid, text, text, text, text, timestamptz, uuid, text)
  from public, anon, authenticated;
grant execute on function public.spec26_create_invitation(uuid, uuid, text, text, text, text, timestamptz, uuid, text)
  to service_role;
revoke all on function public.spec26_accept_invitation(text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.spec26_accept_invitation(text, uuid, text, text)
  to service_role;
revoke all on function public.spec26_resend_invitation(uuid, uuid, uuid, text, text, timestamptz, uuid, text)
  from public, anon, authenticated;
grant execute on function public.spec26_resend_invitation(uuid, uuid, uuid, text, text, timestamptz, uuid, text)
  to service_role;
revoke all on function public.spec26_revoke_invitation(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.spec26_revoke_invitation(uuid, uuid, uuid, text)
  to service_role;
revoke all on function public.spec26_resolve_invitation(text) from public, anon, authenticated;
grant execute on function public.spec26_resolve_invitation(text) to service_role;
revoke all on function public.spec26_mutate_membership(uuid, uuid, text, text, integer, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.spec26_mutate_membership(uuid, uuid, text, text, integer, text, uuid, text)
  to service_role;
revoke all on function public.spec26_transfer_ownership(uuid, uuid, uuid, text, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.spec26_transfer_ownership(uuid, uuid, uuid, text, integer, integer, text)
  to service_role;
revoke all on function public.spec26_update_organization_settings(uuid, integer, text, text, text, jsonb, uuid, text)
  from public, anon, authenticated;
grant execute on function public.spec26_update_organization_settings(uuid, integer, text, text, text, jsonb, uuid, text)
  to service_role;
revoke all on function public.spec26_mark_invitation_delivery(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.spec26_mark_invitation_delivery(uuid, text, text)
  to service_role;
revoke all on function public.spec26_touch_version(), public.spec26_protect_organization_identity(),
  public.spec26_prevent_mutation(), public.spec26_require_active_owner(),
  public.spec26_require_initial_owner()
  from public, anon, authenticated;

comment on table public.organizations is 'SPEC-26 customer security boundaries; rows and slugs are retained as tombstones.';
comment on table public.organization_memberships is 'SPEC-26 organization authority; profile and Auth metadata are non-authoritative.';
comment on column public.organization_invitations.token_hash is 'SHA-256 only. Raw invitation tokens must never be persisted.';
