-- SPEC-40: invitation-only inquilino membership and exclusive home capability.
-- No membership backfill; lifecycle state and contract participants remain independent.
begin;
alter table public.organization_memberships force row level security;
alter table public.organization_invitations force row level security;
alter table public.organization_memberships drop constraint organization_memberships_role_check;
alter table public.organization_memberships add constraint organization_memberships_role_check
  check (role in ('owner', 'admin', 'member', 'viewer', 'inquilino'));
alter table public.organization_invitations drop constraint organization_invitations_intended_role_check;
alter table public.organization_invitations add constraint organization_invitations_intended_role_check
  check (intended_role in ('admin', 'member', 'viewer', 'inquilino'));


create or replace function public.spec26_create_invitation(
  p_invitation_id uuid, p_organization_id uuid, p_email_normalized text,
  p_intended_role text, p_token_hash text, p_token_prefix text,
  p_expires_at timestamptz, p_invited_by_membership_id uuid, p_request_id text
) returns setof public.organization_invitations
language plpgsql security definer set search_path = pg_catalog as $$
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
    or (v_actor.role = 'admin' and p_intended_role not in ('member', 'viewer', 'inquilino'))
    or p_intended_role not in ('admin', 'member', 'viewer', 'inquilino') then
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

create or replace function public.spec26_mutate_membership(
  p_organization_id uuid, p_target_user_id uuid, p_next_role text,
  p_next_status text, p_expected_version integer, p_reason_code text,
  p_actor_membership_id uuid, p_request_id text
) returns setof public.organization_memberships
language plpgsql security definer set search_path = pg_catalog as $$
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
    if p_next_status is not null or p_next_role not in ('admin', 'member', 'viewer', 'inquilino') then
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
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_organization public.organizations%rowtype;
  v_source public.organization_memberships%rowtype;
  v_target public.organization_memberships%rowtype;
  v_target_prior_role text;
begin
  select * into v_organization from public.organizations
  where id = p_organization_id and status = 'active' for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_source_role_after not in ('owner', 'admin', 'member', 'viewer', 'inquilino') then raise exception 'FORBIDDEN'; end if;
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

create or replace function public.spec37_list_members(p_organization_id uuid, p_actor_membership_id uuid,
  p_after_id uuid, p_limit integer)
returns table (user_id uuid, display_name text, email_masked text, role text, status text,
  joined_at timestamptz, version integer, cursor_id uuid) language plpgsql security definer set search_path = pg_catalog as $$
begin
  if p_limit not between 1 and 100 or not exists (
    select 1
    from public.organization_memberships actor_membership
    where actor_membership.id = p_actor_membership_id
      and actor_membership.organization_id = p_organization_id
      and actor_membership.status = 'active'
      and actor_membership.role in ('owner', 'admin')
      and exists (select 1 from public.organizations o where o.id = p_organization_id and o.status = 'active')
  ) then raise exception 'FORBIDDEN'; end if;
  return query select m.user_id, p.display_name, left(u.email,1) || '***@' || split_part(u.email,'@',2),
    m.role, m.status, m.joined_at, m.version, m.id from public.organization_memberships m
    join public.user_profiles p on p.user_id = m.user_id join auth.users u on u.id = m.user_id
    where m.organization_id = p_organization_id and (p_after_id is null or m.id > p_after_id)
    order by m.id limit p_limit;
end;
$$;

revoke all on function public.spec37_list_members(uuid,uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.spec37_list_members(uuid,uuid,uuid,integer) to service_role;

revoke all on function public.spec26_create_invitation(uuid,uuid,text,text,text,text,timestamptz,uuid,text),
  public.spec26_mutate_membership(uuid,uuid,text,text,integer,text,uuid,text),
  public.spec26_transfer_ownership(uuid,uuid,uuid,text,integer,integer,text) from public, anon, authenticated;
grant execute on function public.spec26_create_invitation(uuid,uuid,text,text,text,text,timestamptz,uuid,text),
  public.spec26_mutate_membership(uuid,uuid,text,text,integer,text,uuid,text),
  public.spec26_transfer_ownership(uuid,uuid,uuid,text,integer,integer,text) to service_role;
commit;
