-- SPEC-45: canonical assignments, scoped projections and durable invalidations.
begin;
alter table public.arrangement_orders
  add column assigned_personal_membership_id uuid,
  add constraint arrangement_assignee_scope foreign key(assigned_personal_membership_id,organization_id)
    references public.organization_memberships(id,organization_id),
  drop constraint arrangement_orders_status_enum,
  add constraint arrangement_orders_status_enum check(status in ('open','in_progress','solved','archived','rejected')),
  add constraint arrangement_assignment_state check(assigned_personal_membership_id is null or
    (submission_state='submitted' and arrangement_property_id is not null and created_by_membership_id is not null and status='in_progress'));
create index arrangement_personal_orders on public.arrangement_orders
  (organization_id,assigned_personal_membership_id,submitted_at desc nulls last,id desc)
  where submission_state='submitted' and assigned_personal_membership_id is not null and status in ('open','in_progress');
-- Extend the existing audit catalog without dropping any earlier event types.
do $$ declare definition text; begin
  select pg_get_constraintdef(oid) into definition from pg_constraint where conrelid='public.organization_events'::regclass and conname='organization_events_event_type_check';
  definition:=replace(definition,'''arrangement.order_status_changed''::text', '''arrangement.order_status_changed''::text, ''arrangement.assignment_changed''::text, ''arrangement.order_rejected''::text');
  alter table public.organization_events drop constraint organization_events_event_type_check;
  execute 'alter table public.organization_events add constraint organization_events_event_type_check '||definition;
end; $$;
create table public.arrangement_scope_revisions(
  organization_id uuid not null references public.organizations(id),
  audience text not null check(audience in ('internal','tenant','personal')),
  scope_id uuid not null, revision bigint not null default 1 check(revision>0),
  primary key(organization_id,audience,scope_id)
);
alter table public.arrangement_scope_revisions enable row level security;
alter table public.arrangement_scope_revisions force row level security;
revoke all on public.arrangement_scope_revisions from public,anon,authenticated,service_role;
create function public.spec45_bump_revision(org uuid,aud text,scope uuid) returns void
language sql security definer set search_path=pg_catalog as $$
  insert into public.arrangement_scope_revisions(organization_id,audience,scope_id) select org,aud,scope where scope is not null
  on conflict(organization_id,audience,scope_id) do update set revision=public.arrangement_scope_revisions.revision+1;
$$;
create function public.spec45_order_changed() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
  if NEW.submission_state not in ('submitted','legacy') then return NEW; end if;
  if TG_OP='UPDATE' and (NEW.version,NEW.submission_state,NEW.status,NEW.assigned_personal_membership_id)
    is not distinct from (OLD.version,OLD.submission_state,OLD.status,OLD.assigned_personal_membership_id) then return NEW; end if;
  perform public.spec45_bump_revision(NEW.organization_id,'internal',NEW.organization_id);
  if NEW.submission_state='submitted' then perform public.spec45_bump_revision(NEW.organization_id,'tenant',NEW.arrangement_property_id); end if;
  -- A former assignee receives only a change to their own opaque revision.
  if TG_OP='UPDATE' and OLD.assigned_personal_membership_id is distinct from NEW.assigned_personal_membership_id then
    perform public.spec45_bump_revision(NEW.organization_id,'personal',OLD.assigned_personal_membership_id);
  end if;
  perform public.spec45_bump_revision(NEW.organization_id,'personal',NEW.assigned_personal_membership_id);
  return NEW;
end; $$;
create trigger spec45_order_changed after insert or update on public.arrangement_orders for each row execute function public.spec45_order_changed();
create function public.spec45_member_changed() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
  if (NEW.role,NEW.status,NEW.arrangement_property_id) is distinct from (OLD.role,OLD.status,OLD.arrangement_property_id) then
    perform public.spec45_bump_revision(NEW.organization_id,'internal',NEW.organization_id);
    perform public.spec45_bump_revision(NEW.organization_id,'personal',NEW.id);
  end if;
  return NEW;
end; $$;
create trigger spec45_member_changed after update on public.organization_memberships for each row execute function public.spec45_member_changed();

create function public.spec45_require_actor(org uuid,actor uuid,audience text,writing boolean default false)
returns public.organization_memberships language plpgsql security definer set search_path=pg_catalog as $$
declare a public.organization_memberships;
begin
  if audience not in ('internal','tenant','personal') then raise exception 'INVALID_REQUEST'; end if;
  perform 1 from public.organizations where id=org and status='active' for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into a from public.organization_memberships where id=actor and organization_id=org for update;
  if not found or a.status<>'active' then raise exception 'FORBIDDEN'; end if;
  if audience='personal' then
    if a.role<>'personal' or writing then raise exception 'FORBIDDEN'; end if;
  elsif audience='tenant' then
    if a.role<>'inquilino' or writing then raise exception 'FORBIDDEN'; end if;
    if a.arrangement_property_id is null then raise exception 'PROPERTY_REQUIRED'; end if;
  elsif a.role not in ('owner','admin','member','viewer') or (writing and a.role='viewer') then raise exception 'FORBIDDEN'; end if;
  return a;
end; $$;
create function public.spec45_order_projection(o public.arrangement_orders,a public.organization_memberships)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
  select public.spec43_order_projection(o,a.id,a.role='inquilino') ||
  case when a.role in ('owner','admin','member','personal') then jsonb_build_object('requester',
    case when o.submission_state='legacy' or author.id is null then null else jsonb_build_object(
      'name',nullif(p.display_name,''),'email',case when coalesce(u.email_confirmed_at,u.confirmed_at) is not null then u.email end,
      'contact_number',author.inquilino_contact_number) end) else '{}'::jsonb end ||
  case when a.role in ('owner','admin','member') then jsonb_build_object('assignee',case when assignee.id is null then null else
    jsonb_build_object('id',assignee.id,'name',assignee.personal_name,'occupation',assignee.personal_occupation,
      'available',assignee.role='personal' and assignee.status='active') end) else '{}'::jsonb end
  from (select 1) seed
  left join public.organization_memberships author on author.id=o.created_by_membership_id and author.organization_id=o.organization_id
  left join public.user_profiles p on p.user_id=author.user_id
  left join auth.users u on u.id=author.user_id
  left join public.organization_memberships assignee on assignee.id=o.assigned_personal_membership_id and assignee.organization_id=o.organization_id;
$$;
create function public.spec45_arrangements(p_organization_id uuid,p_actor_membership_id uuid,p_action text,p_input jsonb,p_request_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare a public.organization_memberships; target public.organization_memberships; o public.arrangement_orders;
  prior public.arrangement_orders; m public.media_assets; aud text:=split_part(p_action,'.',1); action text:=split_part(p_action,'.',2);
  lim integer; items jsonb; next_status text; next_assignee uuid; rev bigint; scope uuid;
begin
  if p_input is null or jsonb_typeof(p_input)<>'object' or p_action not in (
    'internal.list','tenant.list','personal.list','internal.detail','tenant.detail','personal.detail',
    'internal.view','tenant.view','personal.view','internal.assignees','internal.assign','internal.unassign','internal.reject','internal.status',
    'internal.changes','tenant.changes','personal.changes') then raise exception 'INVALID_REQUEST'; end if;
  a:=public.spec45_require_actor(p_organization_id,p_actor_membership_id,aud,action in ('assignees','assign','unassign','reject','status'));
  if action='changes' then
    scope:=case aud when 'internal' then p_organization_id when 'tenant' then a.arrangement_property_id else a.id end;
    select revision into rev from public.arrangement_scope_revisions where organization_id=p_organization_id and audience=aud and scope_id=scope;
    return jsonb_build_object('revision',coalesce(rev,0)::text);
  end if;
  if action in ('list','assignees') then
    lim:=(p_input->>'limit')::integer;
    if lim is null or lim not between 1 and 100 then raise exception 'INVALID_REQUEST'; end if;
    if action='assignees' then
      select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',personal_name,'occupation',personal_occupation) order by id),'[]'::jsonb) into items
      from (select id,personal_name,personal_occupation from public.organization_memberships where organization_id=p_organization_id
        and role='personal' and status='active' and (p_input->>'after_id' is null or id>(p_input->>'after_id')::uuid) order by id limit lim+1) q;
      return jsonb_build_object('organization_id',p_organization_id,'items',items);
    end if;
    if p_input->>'status' is not null and (p_input->>'status' not in ('open','in_progress','solved','archived','rejected') or aud='personal') then raise exception 'INVALID_REQUEST'; end if;
    with page as (select x.* from public.arrangement_orders x where x.organization_id=p_organization_id
      and ((aud='internal' and x.submission_state in ('submitted','legacy'))
        or (aud='tenant' and x.submission_state='submitted' and x.arrangement_property_id=a.arrangement_property_id)
        or (aud='personal' and x.submission_state='submitted' and x.status in ('open','in_progress') and x.assigned_personal_membership_id=a.id))
      and (p_input->>'status' is null or x.status=p_input->>'status')
      and (p_input->>'after_id' is null or
        ((p_input->>'after_at' is not null and (x.submitted_at is null or (x.submitted_at,x.id)<((p_input->>'after_at')::timestamptz,(p_input->>'after_id')::uuid)))
        or (p_input->>'after_at' is null and x.submitted_at is null and x.id<(p_input->>'after_id')::uuid)))
      order by x.submitted_at desc nulls last,x.id desc limit lim+1)
    select coalesce(jsonb_agg(public.spec45_order_projection(page,a) order by submitted_at desc nulls last,id desc),'[]'::jsonb) into items from page;
    return jsonb_build_object('organization_id',p_organization_id,'property_id',case when aud='tenant' then a.arrangement_property_id end,'items',items);
  end if;
  -- All mutators use the organization lock before membership/order locks, as governance does.
  if action='assign' then
    select * into target from public.organization_memberships where id=(p_input->>'assigned_personal_membership_id')::uuid and organization_id=p_organization_id for update;
    if not found or target.role<>'personal' or target.status<>'active' then raise exception 'ASSIGNEE_UNAVAILABLE'; end if;
  end if;
  select * into o from public.arrangement_orders where id=(p_input->>'order_id')::uuid and organization_id=p_organization_id for update;
  if not found or o.submission_state not in ('submitted','legacy')
    or (aud='tenant' and (o.submission_state<>'submitted' or o.arrangement_property_id is distinct from a.arrangement_property_id))
    or (aud='personal' and (o.submission_state<>'submitted' or o.status not in ('open','in_progress') or o.assigned_personal_membership_id is distinct from a.id)) then raise exception 'NOT_FOUND'; end if;
  if action='detail' then return public.spec45_order_projection(o,a); end if;
  if action='view' then
    select ma.* into m from public.arrangement_order_assets x join public.media_assets ma on ma.id=x.asset_id and ma.organization_id=x.organization_id
    where x.order_id=o.id and x.organization_id=p_organization_id and x.asset_id=(p_input->>'asset_id')::uuid and ma.state='attached';
    if not found then raise exception 'NOT_FOUND'; end if;
    return to_jsonb(m);
  end if;
  if jsonb_typeof(p_input->'expected_version') is distinct from 'number' or (p_input->>'expected_version')::integer<1 then raise exception 'INVALID_REQUEST'; end if;
  if o.version<>(p_input->>'expected_version')::integer then
    return jsonb_build_object('error','VERSION_CONFLICT','current',jsonb_build_object('id',o.id,'status',o.status,'version',o.version));
  end if;
  prior:=o; next_assignee:=o.assigned_personal_membership_id; next_status:=o.status;
  if action='assign' then
    if o.submission_state<>'submitted' or o.arrangement_property_id is null or o.created_by_membership_id is null or o.status not in ('open','in_progress') then raise exception 'INVALID_TRANSITION'; end if;
    next_status:='in_progress'; next_assignee:=target.id;
  elsif action='unassign' then
    if o.status not in ('open','in_progress') then raise exception 'INVALID_TRANSITION'; end if;
    -- A replay after removing an assignment is a no-op, but an unassigned in-progress order is not implicitly changed.
    if o.assigned_personal_membership_id is not null then next_status:='open'; end if;
    next_assignee:=null;
  elsif action in ('reject','status') then
    next_status:=case when action='reject' then 'rejected' else p_input->>'status' end;
    if next_status is null or next_status not in ('open','in_progress','solved','archived','rejected') then raise exception 'INVALID_REQUEST'; end if;
    if next_status='rejected' and (o.submission_state<>'submitted' or o.status not in ('open','in_progress','rejected'))
      or (o.status='rejected' and next_status not in ('rejected','open')) then raise exception 'INVALID_TRANSITION'; end if;
    if next_status<>'in_progress' then next_assignee:=null; end if;
  else raise exception 'INVALID_REQUEST'; end if;
  if (o.status,o.assigned_personal_membership_id) is not distinct from (next_status,next_assignee) then return public.spec45_order_projection(o,a); end if;
  update public.arrangement_orders set status=next_status,assigned_personal_membership_id=next_assignee,version=version+1,updated_at=now() where id=o.id returning * into o;
  insert into public.organization_events(organization_id,event_type,actor_type,actor_user_id,actor_membership_id,target_type,target_id,request_id,metadata)
  values(p_organization_id,case when next_status='rejected' then 'arrangement.order_rejected'
    when prior.assigned_personal_membership_id is distinct from next_assignee then 'arrangement.assignment_changed' else 'arrangement.order_status_changed' end,
    'member',a.user_id,a.id,'arrangement_order',o.id,p_request_id,jsonb_build_object('old_status',prior.status,'new_status',o.status,
      'old_assignee',prior.assigned_personal_membership_id,'new_assignee',next_assignee,'version',o.version));
  return public.spec45_order_projection(o,a);
end; $$;
-- Keep older read DTOs intact. The old status entry point must enforce the new state machine.
alter function public.spec43_arrangements(uuid,uuid,text,jsonb,text) rename to spec43_arrangements_compat_base;
revoke all on function public.spec43_arrangements_compat_base(uuid,uuid,text,jsonb,text) from public,anon,authenticated,service_role;
create function public.spec43_arrangements(p_organization_id uuid,p_actor_membership_id uuid,p_action text,p_input jsonb,p_request_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
  if p_action='internal.status' then
    result:=public.spec45_arrangements(p_organization_id,p_actor_membership_id,p_action,p_input,p_request_id);
    return result-'requester'-'assignee';
  end if;
  return public.spec43_arrangements_compat_base(p_organization_id,p_actor_membership_id,p_action,p_input,p_request_id);
end; $$;
revoke all on function public.spec45_bump_revision(uuid,text,uuid),public.spec45_order_changed(),public.spec45_member_changed(),
  public.spec45_require_actor(uuid,uuid,text,boolean),public.spec45_order_projection(public.arrangement_orders,public.organization_memberships),
  public.spec45_arrangements(uuid,uuid,text,jsonb,text),public.spec43_arrangements(uuid,uuid,text,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.spec45_arrangements(uuid,uuid,text,jsonb,text),public.spec43_arrangements(uuid,uuid,text,jsonb,text) to service_role;
commit;
