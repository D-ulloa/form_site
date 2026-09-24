-- SPEC-46: work reports, personal submission and tenant acceptance.
-- Additive migration after SPEC-45; applied migrations are never modified.
begin;
-- Inventory: orders without property/author stay outside the report flow.
do $$ begin
  if exists(select from public.arrangement_orders where status not in ('open','in_progress','solved','archived','rejected')) then
    raise exception 'SPEC46_UNKNOWN_LEGACY_STATUS: inventory and approve a mapping before migrating';
  end if;
end; $$;
create table public.arrangement_work_reports(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  order_id uuid not null,
  created_by_personal_membership_id uuid not null,
  body text not null check(body=btrim(body) and char_length(body) between 1 and 10000
    and body !~ '[\x00-\x08\x0B\x0C\x0E-\x1F]'),
  status text not null default 'draft' check(status in ('draft','submitted','accepted')),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  accepted_at timestamptz,
  accepted_by_membership_id uuid,
  foreign key(order_id,organization_id) references public.arrangement_orders(id,organization_id),
  foreign key(created_by_personal_membership_id,organization_id) references public.organization_memberships(id,organization_id),
  foreign key(accepted_by_membership_id,organization_id) references public.organization_memberships(id,organization_id),
  unique(organization_id,order_id),
  check((status in ('submitted','accepted'))=(submitted_at is not null)),
  check((status='accepted')=(accepted_at is not null and accepted_by_membership_id is not null)),
  check((accepted_at is null and accepted_by_membership_id is null) or status='accepted')
);
create index arrangement_work_report_status on public.arrangement_work_reports(organization_id,status,order_id);
alter table public.arrangement_work_reports enable row level security;
alter table public.arrangement_work_reports force row level security;
revoke all on public.arrangement_work_reports from public,anon,authenticated,service_role;
-- Extend the audit catalog without dropping earlier event types.
do $$ declare definition text; begin
  select pg_get_constraintdef(oid) into definition from pg_constraint where conrelid='public.organization_events'::regclass and conname='organization_events_event_type_check';
  definition:=replace(definition,'''arrangement.order_status_changed''::text',
    '''arrangement.order_status_changed''::text, ''arrangement.work_report_drafted''::text, ''arrangement.work_report_submitted''::text, ''arrangement.work_report_accepted''::text');
  alter table public.organization_events drop constraint organization_events_event_type_check;
  execute 'alter table public.organization_events add constraint organization_events_event_type_check '||definition;
end; $$;
-- Actor gate that allows personal and tenant writes for report actions only.
create function public.spec46_require_actor(org uuid,actor uuid,audience text)
returns public.organization_memberships language plpgsql security definer set search_path=pg_catalog as $$
declare a public.organization_memberships;
begin
  if audience not in ('internal','tenant','personal') then raise exception 'INVALID_REQUEST'; end if;
  perform 1 from public.organizations where id=org and status='active' for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into a from public.organization_memberships where id=actor and organization_id=org for update;
  if not found or a.status<>'active' then raise exception 'FORBIDDEN'; end if;
  if audience='personal' then
    if a.role<>'personal' then raise exception 'FORBIDDEN'; end if;
  elsif audience='tenant' then
    if a.role<>'inquilino' then raise exception 'FORBIDDEN'; end if;
    if a.arrangement_property_id is null then raise exception 'PROPERTY_REQUIRED'; end if;
    perform 1 from public.arrangement_properties where id=a.arrangement_property_id and organization_id=org for key share;
    if not found then raise exception 'NOT_FOUND'; end if;
  elsif a.role not in ('owner','admin','member','viewer') then raise exception 'FORBIDDEN'; end if;
  return a;
end; $$;
create function public.spec46_work_report_projection(r public.arrangement_work_reports,a public.organization_memberships)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
  select case
    when r.id is null then null
    when r.status='draft' and a.role not in ('owner','admin','member','personal') then null
    else jsonb_build_object(
      'status',r.status,'body',r.body,'version',r.version,
      'created_at',r.created_at,'updated_at',r.updated_at,
      'submitted_at',r.submitted_at,'accepted_at',r.accepted_at,
      'created_by',case when a.role in ('owner','admin','member') then jsonb_build_object(
        'id',r.created_by_personal_membership_id,'name',coalesce(m.personal_name,'')) else null end)
  end
  from (select 1) seed
  left join public.organization_memberships m
    on m.id=coalesce(r.created_by_personal_membership_id,'00000000-0000-0000-0000-000000000000'::uuid)
    and m.organization_id=coalesce(r.organization_id,'00000000-0000-0000-0000-000000000000'::uuid);
$$;
-- Every authorized audience projection carries work_report (null hides drafts from viewer/tenant).
create or replace function public.spec45_order_projection(o public.arrangement_orders,a public.organization_memberships)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
  select public.spec43_order_projection(o,a.id,a.role='inquilino') ||
  case when a.role in ('owner','admin','member','personal') then jsonb_build_object('requester',
    case when o.submission_state='legacy' or author.id is null then null else jsonb_build_object(
      'name',nullif(p.display_name,''),'email',case when coalesce(u.email_confirmed_at,u.confirmed_at) is not null then u.email end,
      'contact_number',author.inquilino_contact_number) end) else '{}'::jsonb end ||
  case when a.role in ('owner','admin','member') then jsonb_build_object('assignee',case when assignee.id is null then null else
    jsonb_build_object('id',assignee.id,'name',assignee.personal_name,'occupation',assignee.personal_occupation,
      'available',assignee.role='personal' and assignee.status='active') end) else '{}'::jsonb end ||
  jsonb_build_object('work_report',public.spec46_work_report_projection(r,a))
  from (select 1) seed
  left join public.organization_memberships author on author.id=o.created_by_membership_id and author.organization_id=o.organization_id
  left join public.user_profiles p on p.user_id=author.user_id
  left join auth.users u on u.id=author.user_id
  left join public.organization_memberships assignee on assignee.id=o.assigned_personal_membership_id and assignee.organization_id=o.organization_id
  left join public.arrangement_work_reports r on r.order_id=o.id and r.organization_id=o.organization_id;
$$;
-- SPEC-46 mutators: save draft, submit (solved), accept (archived). Lock order: org → actor membership → order → report.
create function public.spec46_arrangements(p_organization_id uuid,p_actor_membership_id uuid,p_action text,p_input jsonb,p_request_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare a public.organization_memberships; o public.arrangement_orders; r public.arrangement_work_reports;
  body_text text; aud text;
begin
  if p_input is null or jsonb_typeof(p_input)<>'object'
    or p_action not in ('personal.report.save','personal.report.submit','inquilino.accept') then raise exception 'INVALID_REQUEST'; end if;
  aud:=case when p_action like 'personal.%' then 'personal' else 'tenant' end;
  a:=public.spec46_require_actor(p_organization_id,p_actor_membership_id,aud);
  select * into o from public.arrangement_orders where id=(p_input->>'order_id')::uuid and organization_id=p_organization_id for update;
  if not found or o.submission_state<>'submitted' or o.arrangement_property_id is null or o.created_by_membership_id is null then
    raise exception 'NOT_FOUND';
  end if;
  if aud='personal' then
    if o.status not in ('open','in_progress') or o.assigned_personal_membership_id is distinct from a.id then raise exception 'NOT_FOUND'; end if;
    if jsonb_typeof(p_input->'expected_version') is distinct from 'number' or (p_input->>'expected_version')::integer<1 then
      raise exception 'INVALID_REQUEST';
    end if;
    if o.version<>(p_input->>'expected_version')::integer then
      return jsonb_build_object('error','VERSION_CONFLICT','current',jsonb_build_object('id',o.id,'status',o.status,'version',o.version));
    end if;
    select * into r from public.arrangement_work_reports where organization_id=p_organization_id and order_id=o.id for update;
    if p_action='personal.report.save' then
      body_text:=p_input->>'body';
      if body_text is null or body_text<>btrim(body_text) or char_length(body_text) not between 1 and 10000
        or body_text ~ '[\x00-\x08\x0B\x0C\x0E-\x1F]' then raise exception 'INVALID_REQUEST'; end if;
      if found and r.status<>'draft' then raise exception 'INVALID_TRANSITION'; end if;
      if found then
        if r.body=body_text then
          return jsonb_build_object('id',o.id,'status',o.status,'version',o.version,'work_report',public.spec46_work_report_projection(r,a));
        end if;
        update public.arrangement_work_reports set body=body_text,version=version+1,updated_at=now() where id=r.id returning * into r;
      else
        insert into public.arrangement_work_reports(organization_id,order_id,created_by_personal_membership_id,body)
        values(p_organization_id,o.id,a.id,body_text) returning * into r;
      end if;
      insert into public.organization_events(organization_id,event_type,actor_type,actor_user_id,actor_membership_id,target_type,target_id,request_id,metadata)
      values(p_organization_id,'arrangement.work_report_drafted','member',a.user_id,a.id,'arrangement_order',o.id,p_request_id,
        jsonb_build_object('report_status',r.status,'report_version',r.version,'order_status',o.status));
      return jsonb_build_object('id',o.id,'status',o.status,'version',o.version,'work_report',public.spec46_work_report_projection(r,a));
    end if;
    -- personal.report.submit
    if not found or r.status<>'draft' then raise exception 'INVALID_TRANSITION'; end if;
    if jsonb_typeof(p_input->'report_version') is distinct from 'number' or (p_input->>'report_version')::integer<1 then
      raise exception 'INVALID_REQUEST';
    end if;
    if r.version<>(p_input->>'report_version')::integer then
      return jsonb_build_object('error','VERSION_CONFLICT','current',jsonb_build_object('id',o.id,'status',o.status,'version',o.version));
    end if;
    if not exists(select 1 from public.organization_memberships m where m.organization_id=p_organization_id
      and m.role='inquilino' and m.status='active' and m.arrangement_property_id=o.arrangement_property_id) then
      raise exception 'TENANT_REQUIRED';
    end if;
    update public.arrangement_work_reports set status='submitted',submitted_at=now(),updated_at=now(),version=version+1
      where id=r.id returning * into r;
    update public.arrangement_orders set status='solved',assigned_personal_membership_id=null,version=version+1,updated_at=now()
      where id=o.id returning * into o;
    insert into public.organization_events(organization_id,event_type,actor_type,actor_user_id,actor_membership_id,target_type,target_id,request_id,metadata)
    values(p_organization_id,'arrangement.work_report_submitted','member',a.user_id,a.id,'arrangement_order',o.id,p_request_id,
      jsonb_build_object('report_status',r.status,'order_status',o.status,'order_version',o.version,'report_version',r.version));
    return jsonb_build_object('id',o.id,'status',o.status,'version',o.version,'work_report',public.spec46_work_report_projection(r,a));
  end if;
  -- inquilino.accept: property and membership derived from the session only.
  if o.arrangement_property_id is distinct from a.arrangement_property_id then raise exception 'NOT_FOUND'; end if;
  select * into r from public.arrangement_work_reports where organization_id=p_organization_id and order_id=o.id for update;
  if found and r.status='accepted' and o.status='archived' then
    return public.spec45_order_projection(o,a);
  end if;
  if not found or r.status<>'submitted' or o.status<>'solved' then raise exception 'INVALID_TRANSITION'; end if;
  if jsonb_typeof(p_input->'expected_version') is distinct from 'number' or (p_input->>'expected_version')::integer<1 then
    raise exception 'INVALID_REQUEST';
  end if;
  if o.version<>(p_input->>'expected_version')::integer then
    return jsonb_build_object('error','VERSION_CONFLICT','current',jsonb_build_object('id',o.id,'status',o.status,'version',o.version));
  end if;
  update public.arrangement_work_reports set status='accepted',accepted_at=now(),accepted_by_membership_id=a.id,updated_at=now(),version=version+1
    where id=r.id returning * into r;
  update public.arrangement_orders set status='archived',version=version+1,updated_at=now() where id=o.id returning * into o;
  insert into public.organization_events(organization_id,event_type,actor_type,actor_user_id,actor_membership_id,target_type,target_id,request_id,metadata)
  values(p_organization_id,'arrangement.work_report_accepted','member',a.user_id,a.id,'arrangement_order',o.id,p_request_id,
    jsonb_build_object('report_status',r.status,'order_status',o.status,'order_version',o.version,'report_version',r.version));
  return public.spec45_order_projection(o,a);
end; $$;
-- Generic status path cannot close or reopen orders locked by a submitted/accepted report;
-- drafts never archive. Legacy orders without a report keep prior rules.
create or replace function public.spec45_arrangements(p_organization_id uuid,p_actor_membership_id uuid,p_action text,p_input jsonb,p_request_id text)
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
    -- SPEC-46: submitted/accepted reports end only through tenant acceptance; drafts never archive.
    if exists(select 1 from public.arrangement_work_reports wr where wr.organization_id=p_organization_id and wr.order_id=o.id) then
      if exists(select 1 from public.arrangement_work_reports wr where wr.organization_id=p_organization_id and wr.order_id=o.id and wr.status in ('submitted','accepted')) then
        if action='reject' or next_status is distinct from o.status then raise exception 'INVALID_TRANSITION'; end if;
      elsif next_status='archived' then
        raise exception 'INVALID_TRANSITION';
      end if;
    end if;
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
revoke all on function public.spec46_require_actor(uuid,uuid,text),
  public.spec46_work_report_projection(public.arrangement_work_reports,public.organization_memberships),
  public.spec46_arrangements(uuid,uuid,text,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.spec46_arrangements(uuid,uuid,text,jsonb,text) to service_role;
commit;
