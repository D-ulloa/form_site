-- SPEC-42 additive foundation. Apply the enforcement migration before enabling writes.
begin;

create table public.arrangement_properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 200),
  created_by_membership_id uuid not null,
  created_at timestamptz not null default now(),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 128),
  payload_fingerprint text not null,
  unique (id, organization_id),
  unique (organization_id, created_by_membership_id, idempotency_key),
  foreign key (created_by_membership_id, organization_id)
    references public.organization_memberships(id, organization_id) on delete restrict
);
create index arrangement_properties_list_idx on public.arrangement_properties(organization_id, id);

alter table public.organization_invitations add column arrangement_property_id uuid,
  add constraint invitations_arrangement_property_fk foreign key (arrangement_property_id, organization_id)
    references public.arrangement_properties(id, organization_id) on delete restrict;
alter table public.organization_memberships add column arrangement_property_id uuid,
  add constraint memberships_arrangement_property_fk foreign key (arrangement_property_id, organization_id)
    references public.arrangement_properties(id, organization_id) on delete restrict;
create index invitations_arrangement_property_idx on public.organization_invitations(organization_id, arrangement_property_id, id);
create index memberships_arrangement_property_idx on public.organization_memberships(organization_id, arrangement_property_id, id);
create index memberships_unassigned_inquilino_idx on public.organization_memberships(organization_id, id)
  where role = 'inquilino' and status = 'active' and arrangement_property_id is null;

-- A claim survives a crash around Auth provisioning. It contains no token or raw email.
create table public.arrangement_invitation_operations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  actor_membership_id uuid not null,
  arrangement_property_id uuid not null,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 128),
  payload_fingerprint text not null,
  invitation_id uuid,
  created_at timestamptz not null default now(),
  unique (organization_id, actor_membership_id, idempotency_key),
  foreign key (actor_membership_id, organization_id) references public.organization_memberships(id, organization_id),
  foreign key (arrangement_property_id, organization_id) references public.arrangement_properties(id, organization_id),
  foreign key (invitation_id, organization_id) references public.organization_invitations(id, organization_id)
);

alter table public.arrangement_properties enable row level security;
alter table public.arrangement_properties force row level security;
alter table public.arrangement_invitation_operations enable row level security;
alter table public.arrangement_invitation_operations force row level security;
revoke all on public.arrangement_properties, public.arrangement_invitation_operations from public, anon, authenticated, service_role;
-- Application access is through the scoped RPCs only, including for service_role.

alter table public.organization_events drop constraint organization_events_event_type_check;
alter table public.organization_events add constraint organization_events_event_type_check check (event_type in (
  'organization.created', 'organization.settings_updated', 'organization.suspended',
  'organization.reactivated', 'organization.deletion_requested', 'organization.deletion_cancelled',
  'organization.deletion_blocked', 'organization.deleted', 'organization.export_requested',
  'member.invited', 'member.invitation_resent', 'member.invitation_revoked',
  'member.invitation_accepted', 'member.invitation_link_issued', 'member.invitation_account_activated',
  'member.role_changed', 'member.suspended', 'member.reactivated', 'member.removed', 'member.left',
  'ownership.transferred', 'arrangement.property_created', 'arrangement.inquilino_associated'
));

-- All SPEC-42 mutations serialize with governance by locking the organization first.
create function public.spec42_require_manager(p_organization_id uuid, p_actor_membership_id uuid)
returns public.organization_memberships language plpgsql security definer set search_path = pg_catalog as $$
declare v_actor public.organization_memberships%rowtype;
begin
  perform 1 from public.organizations where id = p_organization_id and status = 'active' for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into v_actor from public.organization_memberships where organization_id = p_organization_id
    and id = p_actor_membership_id for update;
  if not found or v_actor.status <> 'active' or v_actor.role not in ('owner','admin') then raise exception 'FORBIDDEN'; end if;
  return v_actor;
end; $$;

create function public.spec42_create_arrangement_property(p_organization_id uuid, p_actor_membership_id uuid,
  p_name text, p_idempotency_key text, p_request_id text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_actor public.organization_memberships%rowtype; v_property public.arrangement_properties%rowtype;
declare v_name text := btrim(p_name); v_fingerprint text;
begin
  v_actor := public.spec42_require_manager(p_organization_id, p_actor_membership_id);
  if v_name is null or char_length(v_name) not between 1 and 200
    or p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 128 then raise exception 'INVALID_REQUEST'; end if;
  v_fingerprint := encode(extensions.digest(v_name, 'sha256'), 'hex');
  select * into v_property from public.arrangement_properties where organization_id = p_organization_id
    and created_by_membership_id = p_actor_membership_id and idempotency_key = p_idempotency_key;
  if found then
    if v_property.payload_fingerprint <> v_fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  else
    insert into public.arrangement_properties(organization_id, name, created_by_membership_id, idempotency_key, payload_fingerprint)
      values (p_organization_id, v_name, p_actor_membership_id, p_idempotency_key, v_fingerprint) returning * into v_property;
    insert into public.organization_events(organization_id, event_type, actor_type, actor_user_id,
      actor_membership_id, target_type, target_id, request_id, metadata)
      values (p_organization_id, 'arrangement.property_created', 'member', v_actor.user_id,
        v_actor.id, 'arrangement_property', v_property.id, p_request_id, '{}'::jsonb);
  end if;
  return jsonb_build_object('organization_id', p_organization_id, 'id', v_property.id, 'name', v_property.name);
end; $$;

create function public.spec42_list_arrangement_properties(p_organization_id uuid, p_actor_membership_id uuid,
  p_after_id uuid, p_limit integer)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_items jsonb;
begin
  if p_limit is null or p_limit not between 1 and 101 then raise exception 'INVALID_REQUEST'; end if;
  if not exists(select 1 from public.organization_memberships m join public.organizations o on o.id = m.organization_id
    where m.organization_id = p_organization_id and m.id = p_actor_membership_id and m.status = 'active'
      and m.role in ('owner','admin','member','viewer') and o.status = 'active') then raise exception 'FORBIDDEN'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by p.id), '[]'::jsonb) into v_items
    from (select id, name from public.arrangement_properties where organization_id = p_organization_id
      and (p_after_id is null or id > p_after_id) order by id limit p_limit) p;
  return jsonb_build_object('organization_id', p_organization_id, 'items', v_items);
end; $$;

create function public.spec42_list_property_people(p_organization_id uuid, p_actor_membership_id uuid,
  p_property_id uuid, p_collection text, p_after_id uuid, p_limit integer)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_items jsonb;
begin
  perform public.spec42_require_manager(p_organization_id, p_actor_membership_id);
  if p_limit is null or p_limit not between 1 and 101 or p_collection is null
    or p_collection not in ('inquilinos','invitations','available') then raise exception 'INVALID_REQUEST'; end if;
  if p_collection <> 'available' and not exists(select 1 from public.arrangement_properties
    where id = p_property_id and organization_id = p_organization_id) then raise exception 'NOT_FOUND'; end if;
  if p_collection = 'invitations' then
    select coalesce(jsonb_agg(x.item order by x.id), '[]'::jsonb) into v_items from (
      select i.id, jsonb_build_object('id', i.id, 'email_masked', left(i.email_normalized,1) || '***@' || split_part(i.email_normalized,'@',2),
        'status', case when i.status = 'pending' and i.expires_at <= now() then 'expired' else i.status end,
        'expires_at', i.expires_at, 'version', i.version) as item
      from public.organization_invitations i where i.organization_id = p_organization_id and i.arrangement_property_id = p_property_id
        and (p_after_id is null or i.id > p_after_id) order by i.id limit p_limit
    ) x;
  else
    select coalesce(jsonb_agg(x.item order by x.id), '[]'::jsonb) into v_items from (
      select m.id, jsonb_build_object('id', m.id, 'display_name', p.display_name, 'role', m.role,
        'status', m.status, 'version', m.version) as item
      from public.organization_memberships m join public.user_profiles p on p.user_id = m.user_id
      where m.organization_id = p_organization_id and (p_after_id is null or m.id > p_after_id)
        and ((p_collection = 'available' and m.role = 'inquilino' and m.status = 'active' and m.arrangement_property_id is null)
          or (p_collection = 'inquilinos' and m.arrangement_property_id = p_property_id)) order by m.id limit p_limit
    ) x;
  end if;
  return jsonb_build_object('organization_id', p_organization_id, 'items', v_items);
end; $$;

create function public.spec42_associate_inquilino(p_organization_id uuid, p_actor_membership_id uuid,
  p_property_id uuid, p_membership_id uuid, p_expected_version integer, p_request_id text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_actor public.organization_memberships%rowtype; v_member public.organization_memberships%rowtype;
begin
  v_actor := public.spec42_require_manager(p_organization_id, p_actor_membership_id);
  if not exists(select 1 from public.arrangement_properties where id = p_property_id and organization_id = p_organization_id) then raise exception 'NOT_FOUND'; end if;
  select * into v_member from public.organization_memberships where id = p_membership_id and organization_id = p_organization_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_member.role <> 'inquilino' or v_member.status <> 'active' then raise exception 'ASSOCIATION_UNAVAILABLE'; end if;
  if v_member.arrangement_property_id is distinct from p_property_id then
    if v_member.arrangement_property_id is not null then raise exception 'PROPERTY_CONFLICT'; end if;
    if p_expected_version is null or v_member.version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
    update public.organization_memberships set arrangement_property_id = p_property_id where id = v_member.id returning * into v_member;
    insert into public.organization_events(organization_id,event_type,actor_type,actor_user_id,actor_membership_id,target_type,target_id,request_id,metadata)
      values(p_organization_id,'arrangement.inquilino_associated','member',v_actor.user_id,v_actor.id,'membership',v_member.id,p_request_id,
        jsonb_build_object('arrangement_property_id',p_property_id));
  end if;
  return jsonb_build_object('organization_id', p_organization_id, 'id', v_member.id, 'version', v_member.version,
    'arrangement_property_id', v_member.arrangement_property_id);
end; $$;

revoke all on function public.spec42_require_manager(uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public.spec42_create_arrangement_property(uuid,uuid,text,text,text),
  public.spec42_list_arrangement_properties(uuid,uuid,uuid,integer),
  public.spec42_list_property_people(uuid,uuid,uuid,text,uuid,integer),
  public.spec42_associate_inquilino(uuid,uuid,uuid,uuid,integer,text) from public, anon, authenticated;
grant execute on function public.spec42_create_arrangement_property(uuid,uuid,text,text,text),
  public.spec42_list_arrangement_properties(uuid,uuid,uuid,integer),
  public.spec42_list_property_people(uuid,uuid,uuid,text,uuid,integer),
  public.spec42_associate_inquilino(uuid,uuid,uuid,uuid,integer,text) to service_role;
commit;
