begin;
-- SPEC-43. Additive migration; unknown legacy states deliberately abort.
-- POL-09 baseline: unattached uploads expire after 24h; attached records are retained.
do $$ begin
  if exists(select from public.arrangement_orders where status not in ('open','in_progress','solved','archived')) then
    raise exception 'SPEC43_UNKNOWN_LEGACY_STATUS: inventory and approve a mapping before migrating';
  end if;
end; $$;
alter table public.arrangement_orders
  add constraint arrangement_orders_status_enum check(status in ('open','in_progress','solved','archived')),
  add column description text,
  add column arrangement_property_id uuid,
  add column created_by_membership_id uuid,
  add column created_at timestamptz,
  add column submitted_at timestamptz,
  add column updated_at timestamptz,
  add column version integer not null default 1 check(version > 0),
  add column submission_state text not null default 'legacy' check(submission_state in ('legacy','draft','submitted','expired')),
  add column idempotency_key text,
  add column request_fingerprint text,
  add column active_upload_session_id uuid,
  add column requires_upload_batch boolean not null default false,
  add foreign key(arrangement_property_id, organization_id) references public.arrangement_properties(id, organization_id),
  add foreign key(created_by_membership_id, organization_id) references public.organization_memberships(id, organization_id),
  add foreign key(active_upload_session_id, organization_id) references public.asset_upload_sessions(id, organization_id),
  add constraint arrangement_order_complete check (submission_state = 'legacy' or
    (description is not null and description = btrim(description) and char_length(description) between 1 and 5000
      and arrangement_property_id is not null and created_by_membership_id is not null and created_at is not null
      and updated_at is not null and idempotency_key is not null and char_length(idempotency_key) between 8 and 128
      and request_fingerprint is not null and request_fingerprint ~ '^[0-9a-f]{64}$')),
  add check ((submission_state = 'submitted') = (submitted_at is not null));
alter table public.arrangement_orders alter column submission_state set default 'draft';
create unique index arrangement_order_idempotency on public.arrangement_orders(organization_id,created_by_membership_id,idempotency_key);
create index arrangement_order_history on public.arrangement_orders(organization_id,submitted_at desc nulls last,id desc) where submission_state in ('submitted','legacy');
create index arrangement_order_status on public.arrangement_orders(organization_id,status,submitted_at desc nulls last,id desc) where submission_state in ('submitted','legacy');
create index arrangement_order_property_history on public.arrangement_orders(organization_id,arrangement_property_id,submitted_at desc,id desc) where submission_state='submitted';
create index arrangement_order_drafts on public.arrangement_orders(organization_id,created_by_membership_id,created_at) where submission_state='draft';
create table public.arrangement_order_assets (
  organization_id uuid not null, order_id uuid not null, asset_id uuid not null,
  sort_order integer not null check(sort_order between 0 and 39), created_at timestamptz not null default now(),
  primary key(organization_id,order_id,asset_id), unique(asset_id,organization_id), unique(organization_id,order_id,sort_order),
  foreign key(order_id,organization_id) references public.arrangement_orders(id,organization_id),
  foreign key(asset_id,organization_id) references public.media_assets(id,organization_id)
);
alter table public.arrangement_order_assets enable row level security;
alter table public.arrangement_order_assets force row level security;
revoke all on public.arrangement_order_assets from public,anon,authenticated,service_role;
revoke all on public.arrangement_orders from public,anon,authenticated,service_role;
grant select on public.arrangement_orders to service_role; -- previous read-only backend

alter table public.media_assets drop constraint media_assets_category_check;
alter table public.media_assets add constraint media_assets_category_check check(category in ('contract_dni','contract_evidence','property_image','property_video','organization_logo','export','arrangement_image','arrangement_video'));
alter table public.media_assets drop constraint media_assets_object_path_check;
alter table public.media_assets add constraint media_assets_object_path_check check(object_path ~ '^organizations/[0-9a-f-]{36}/(contracts|properties|branding|exports|arrangements)/[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$');
alter table public.asset_upload_intents drop constraint asset_upload_intents_expected_category_check;
alter table public.asset_upload_intents add constraint asset_upload_intents_expected_category_check check(expected_category in ('contract_dni','contract_evidence','property_image','property_video','organization_logo','export','arrangement_image','arrangement_video'));
alter table public.asset_upload_sessions drop constraint asset_upload_sessions_owner_type_check;
alter table public.asset_upload_sessions add constraint asset_upload_sessions_owner_type_check check(owner_type in ('contract_entry','property_draft','property_revision','organization_branding','export','arrangement_order'));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('arrangement-media','arrangement-media',false,104857600,array['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

alter table public.organization_events drop constraint organization_events_event_type_check;
alter table public.organization_events add constraint organization_events_event_type_check check (event_type in (
  'organization.created', 'organization.settings_updated', 'organization.suspended',
  'organization.reactivated', 'organization.deletion_requested', 'organization.deletion_cancelled',
  'organization.deletion_blocked', 'organization.deleted', 'organization.export_requested',
  'member.invited', 'member.invitation_resent', 'member.invitation_revoked',
  'member.invitation_accepted', 'member.invitation_link_issued', 'member.invitation_account_activated',
  'member.role_changed', 'member.suspended', 'member.reactivated', 'member.removed', 'member.left',
  'ownership.transferred', 'arrangement.property_created', 'arrangement.inquilino_associated', 'arrangement.order_submitted', 'arrangement.order_status_changed'
));


create or replace function public.spec31_initialize_asset_upload(
  p_organization_id uuid, p_owner_type text, p_owner_id uuid, p_capability_key text,
  p_principal_type text, p_principal_reference_id uuid, p_principal_fingerprint text,
  p_idempotency_key text, p_request_fingerprint text, p_request_id text,
  p_expires_at timestamptz, p_descriptors jsonb
) returns public.asset_upload_sessions
language plpgsql security definer set search_path = pg_catalog as $$
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
    when 'arrangement_order' then 'arrangements' when 'property_draft' then 'properties' when 'property_revision' then 'properties'
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
language plpgsql security definer set search_path = pg_catalog as $$
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
    if v_session.owner_type <> 'arrangement_order' then
    insert into public.usage_events (
      organization_id, idempotency_key, metric_key, quantity, unit, source_type,
      source_id, actor_type, request_id, metadata
    ) values (
      p_organization_id, 'asset-bytes:' || v_intent.asset_id, 'storage.bytes',
      v_intent.expected_bytes, 'bytes', 'media_asset', v_intent.asset_id,
      v_session.principal_type, p_request_id, jsonb_build_object('category', v_intent.expected_category)
    ) on conflict (organization_id, metric_key, idempotency_key) do nothing;
    end if;
  end loop;
  if exists (select 1 from public.asset_upload_intents where organization_id = p_organization_id
    and upload_session_id = v_session.id and state <> 'verified') then raise exception 'ASSET_STATE_CONFLICT'; end if;
  update public.asset_upload_sessions set state = 'consumed', finalized_at = now(), updated_at = now(), version = version + 1
   where id = v_session.id and organization_id = p_organization_id returning * into v_session;
  return v_session;
end;
$$;


create or replace function public.spec39_list_arrangement_orders(
  p_organization_id uuid,
  p_status text default null,
  p_after_id uuid default null,
  p_limit integer default 25
) returns jsonb
language plpgsql stable security invoker
set search_path = pg_catalog
as $$
declare result jsonb;
begin
  if p_organization_id is null or p_limit is null or p_limit < 1 or p_limit > 100
    or (p_status is not null and (char_length(p_status) not between 1 and 64 or p_status <> btrim(p_status))) then
    raise exception 'INVALID_REQUEST' using errcode = '22023';
  end if;

  -- The availability predicate is deliberately provisional, not a lifecycle enum.
  with available as not materialized (
    select o.id, o.organization_id, o.name, o.status
    from public.arrangement_orders o
    where o.organization_id = p_organization_id and o.status in ('open', 'in_progress') and o.submission_state in ('legacy','submitted')
  ), page as (
    select a.* from available a
    where (p_status is null or a.status = p_status)
      and (p_after_id is null or a.id > p_after_id)
    order by a.id limit p_limit + 1
  ), visible as (
    select p.* from page p order by p.id limit p_limit
  )
  select jsonb_build_object(
    'organization_id', p_organization_id,
    'items', coalesce((select jsonb_agg(to_jsonb(v) order by v.id) from visible v), '[]'::jsonb),
    'available_statuses', coalesce((select jsonb_agg(s.status order by s.status)
      from (select distinct a.status from available a) s), '[]'::jsonb),
    'next_after_id', case when (select count(*) from page) > p_limit
      then (select v.id from visible v order by v.id desc limit 1) else null end
  ) into result;
  return result;
end;
$$;


-- One lock order shared with organization governance, including reads that authorize URLs.
create function public.spec43_require_actor(p_org uuid,p_actor uuid,p_tenant boolean,p_write boolean)
returns public.organization_memberships language plpgsql security definer set search_path=pg_catalog as $$
declare a public.organization_memberships;
begin
  perform 1 from public.organizations where id=p_org and status='active' for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into a from public.organization_memberships where id=p_actor and organization_id=p_org for update;
  if not found or a.status <> 'active' then raise exception 'FORBIDDEN'; end if;
  if p_tenant then
    if a.role <> 'inquilino' then raise exception 'FORBIDDEN'; end if;
    if a.arrangement_property_id is null then raise exception 'PROPERTY_REQUIRED'; end if;
    perform 1 from public.arrangement_properties where id=a.arrangement_property_id and organization_id=p_org for key share;
    if not found then raise exception 'NOT_FOUND'; end if;
  elsif a.role not in ('owner','admin','member','viewer') or (p_write and a.role='viewer') then raise exception 'FORBIDDEN';
  end if;
  return a;
end; $$;

create function public.spec43_order_projection(o public.arrangement_orders,p_actor uuid,p_tenant boolean)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
  select jsonb_build_object('id',o.id,'organization_id',o.organization_id,'name',o.name,'description',o.description,
    'status',o.status,'property',case when p.id is null then null else jsonb_build_object('id',p.id,'name',p.name) end,
    'created_at',o.created_at,'submitted_at',o.submitted_at,'updated_at',o.updated_at,'version',o.version,
    'legacy',o.submission_state='legacy','created_by_you',p_tenant and o.created_by_membership_id=p_actor,
    'assets',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'display_filename',m.display_filename,
      'mime',m.provider_mime,'bytes',m.provider_bytes) order by x.sort_order)
      from public.arrangement_order_assets x join public.media_assets m on m.id=x.asset_id and m.organization_id=x.organization_id
      where x.organization_id=o.organization_id and x.order_id=o.id and m.state='attached'),'[]'::jsonb))
  from (select 1) seed left join public.arrangement_properties p on p.id=o.arrangement_property_id and p.organization_id=o.organization_id;
$$;

-- Only backend service_role can call this dispatcher. No browser-supplied actor or property.
create function public.spec43_arrangements(p_organization_id uuid,p_actor_membership_id uuid,p_action text,p_input jsonb,p_request_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  a public.organization_memberships; o public.arrangement_orders; s public.asset_upload_sessions;
  r public.usage_reservations; i public.asset_upload_intents; m public.media_assets;
  tenant boolean := p_action like 'tenant.%'; action text := regexp_replace(p_action,'^(tenant|internal)\.','');
  result jsonb; items jsonb; d jsonb; v jsonb; descriptors jsonb := '[]'::jsonb;
  total bigint := 0; images integer := 0; videos integer := 0; n integer := 0;
  lim integer; prior_status text; desc_text text; fingerprint text;
begin
  if p_action not in ('tenant.list','internal.list','tenant.draft','tenant.submit','tenant.cancel','internal.status',
    'tenant.session_initialize','tenant.session_context','tenant.session_finalize','tenant.session_revoke','tenant.view','internal.view')
    or p_input is null or jsonb_typeof(p_input)<>'object' then raise exception 'INVALID_REQUEST'; end if;
  a := public.spec43_require_actor(p_organization_id,p_actor_membership_id,tenant,action not in ('list','view'));
  if action='list' then
    lim := (p_input->>'limit')::integer;
    if lim is null or lim not between 1 and 100 or (p_input->>'status' is not null and p_input->>'status' not in ('open','in_progress','solved','archived')) then raise exception 'INVALID_REQUEST'; end if;
    with page as (
      select x.* from public.arrangement_orders x where x.organization_id=p_organization_id
        and ((tenant and x.submission_state='submitted' and x.arrangement_property_id=a.arrangement_property_id)
          or (not tenant and x.submission_state in ('submitted','legacy')))
        and (p_input->>'status' is null or x.status=p_input->>'status')
        and (p_input->>'after_id' is null or
          ((p_input->>'after_at' is not null and (x.submitted_at is null or (x.submitted_at,x.id)<((p_input->>'after_at')::timestamptz,(p_input->>'after_id')::uuid)))
          or (p_input->>'after_at' is null and x.submitted_at is null and x.id<(p_input->>'after_id')::uuid)))
      order by x.submitted_at desc nulls last,x.id desc limit lim+1
    ) select coalesce(jsonb_agg(public.spec43_order_projection(page,p_actor_membership_id,tenant) order by submitted_at desc nulls last,id desc),'[]'::jsonb) into items from page;
    return jsonb_build_object('organization_id',p_organization_id,'property_id',case when tenant then a.arrangement_property_id end,'items',items);
  end if;
  if action='draft' then
    desc_text := btrim(p_input->>'description');
    if desc_text is null or char_length(desc_text) not between 1 and 5000 or coalesce(p_input->>'idempotency_key','') !~ '^[A-Za-z0-9._:-]{8,128}$' then raise exception 'INVALID_REQUEST'; end if;
    fingerprint := encode(extensions.digest(convert_to(desc_text,'UTF8'),'sha256'),'hex');
    select * into o from public.arrangement_orders where organization_id=p_organization_id and created_by_membership_id=a.id and idempotency_key=p_input->>'idempotency_key' for update;
    if found then
      if o.request_fingerprint<>fingerprint or o.arrangement_property_id<>a.arrangement_property_id then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
      if o.submission_state='expired' then raise exception 'DRAFT_EXPIRED'; end if;
    else
      insert into public.arrangement_orders(organization_id,name,description,arrangement_property_id,created_by_membership_id,created_at,updated_at,idempotency_key,request_fingerprint)
      values(p_organization_id,btrim(left(desc_text,200)),desc_text,a.arrangement_property_id,a.id,now(),now(),p_input->>'idempotency_key',fingerprint) returning * into o;
    end if;
    return jsonb_build_object('id',o.id,'submission_state',o.submission_state,'status',o.status,'version',o.version,'upload_session_id',o.active_upload_session_id);
  end if;
  select * into o from public.arrangement_orders where id=(p_input->>'order_id')::uuid and organization_id=p_organization_id for update;
  if not found or (tenant and o.arrangement_property_id is distinct from a.arrangement_property_id) then raise exception 'NOT_FOUND'; end if;
  if action='cancel' then
    if o.created_by_membership_id is distinct from a.id or o.submission_state='legacy' then raise exception 'NOT_FOUND'; end if;
    if o.submission_state='submitted' then return jsonb_build_object('id',o.id,'submission_state','submitted'); end if;
    if o.active_upload_session_id is not null then
      update public.asset_upload_sessions set state='revoked',revoked_at=coalesce(revoked_at,now()),finalized_at=null,updated_at=now(),version=version+1
        where id=o.active_upload_session_id and organization_id=p_organization_id and owner_type='arrangement_order' and owner_id=o.id and state<>'revoked';
    end if;
    update public.arrangement_orders set submission_state='expired',active_upload_session_id=null,updated_at=now() where id=o.id and submission_state='draft';
    return jsonb_build_object('id',o.id,'submission_state','expired');
  end if;
  if action in ('status','view') then
    if o.submission_state not in ('submitted','legacy') or (tenant and o.submission_state<>'submitted') then raise exception 'NOT_FOUND'; end if;
  else
    if o.created_by_membership_id<>a.id or o.submission_state not in ('draft','submitted') then raise exception 'NOT_FOUND'; end if;
    if action='submit' and o.submission_state='submitted' then return public.spec43_order_projection(o,a.id,tenant); end if;
    if o.submission_state<>'draft' then raise exception 'NOT_FOUND'; end if;
    if o.created_at <= now()-interval '24 hours' then raise exception 'DRAFT_EXPIRED'; end if;
  end if;
  if action='status' then
    if p_input->>'status' is null or p_input->>'status' not in ('open','in_progress','solved','archived') or (p_input->>'expected_version')::integer is null then raise exception 'INVALID_REQUEST'; end if;
    if o.version<>(p_input->>'expected_version')::integer then
      return jsonb_build_object('error','VERSION_CONFLICT','current',jsonb_build_object('id',o.id,'status',o.status,'version',o.version));
    end if;
    if o.status=p_input->>'status' then return public.spec43_order_projection(o,a.id,false); end if;
    prior_status := o.status;
    update public.arrangement_orders set status=p_input->>'status',version=version+1,updated_at=now() where id=o.id returning * into o;
    insert into public.organization_events(organization_id,event_type,actor_type,actor_user_id,actor_membership_id,target_type,target_id,request_id,metadata)
    values(p_organization_id,'arrangement.order_status_changed','member',a.user_id,a.id,'arrangement_order',o.id,p_request_id,jsonb_build_object('old_status',prior_status,'new_status',o.status,'version',o.version));
    return public.spec43_order_projection(o,a.id,false);
  elsif action='view' then
    select ma.* into m from public.arrangement_order_assets x join public.media_assets ma on ma.id=x.asset_id and ma.organization_id=x.organization_id
    where x.order_id=o.id and x.organization_id=p_organization_id and x.asset_id=(p_input->>'asset_id')::uuid and ma.state='attached';
    if not found then raise exception 'NOT_FOUND'; end if;
    return to_jsonb(m); -- internal adapter only; HTTP exposes only the short-lived URL
  elsif action='session_initialize' then
    if coalesce(p_input->>'idempotency_key','') !~ '^[A-Za-z0-9._:-]{8,128}$' or jsonb_typeof(p_input->'descriptors') is distinct from 'array' or jsonb_array_length(p_input->'descriptors') not between 1 and 40 then raise exception 'INVALID_REQUEST'; end if;
    for d in select value from jsonb_array_elements(p_input->'descriptors') loop
      if d->>'receiver_key'='arrangement.image' then
        images:=images+1;
        if coalesce(d->>'declared_mime','') not in ('image/jpeg','image/png','image/webp') or (d->>'declared_bytes')::bigint>10485760 then raise exception 'UPLOAD_INVALID'; end if;
      elsif d->>'receiver_key'='arrangement.video' then
        videos:=videos+1;
        if coalesce(d->>'declared_mime','') not in ('video/mp4','video/webm','video/quicktime') or (d->>'declared_bytes')::bigint>104857600 then raise exception 'UPLOAD_INVALID'; end if;
      else raise exception 'UPLOAD_INVALID'; end if;
      if (d->>'declared_bytes')::bigint is null or (d->>'declared_bytes')::bigint<1 or coalesce(d->>'checksum_sha256','') !~ '^[0-9a-f]{64}$'
        or coalesce(char_length(btrim(d->>'original_filename')),0) not between 1 and 256 then raise exception 'UPLOAD_INVALID'; end if;
      total:=total+(d->>'declared_bytes')::bigint;
      descriptors:=descriptors||jsonb_build_array(d||jsonb_build_object('bucket_name','arrangement-media','category',replace(d->>'receiver_key','.','_'),'retention_class','property_media','repeatable_item_id',n::text));
      n:=n+1;
    end loop;
    if images>30 or videos>10 or total>1073741824 then raise exception 'UPLOAD_INVALID'; end if;
    fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object('owner',o.id,'descriptors',descriptors)::text,'UTF8'),'sha256'),'hex');
    select * into s from public.asset_upload_sessions where organization_id=p_organization_id and principal_reference_id=a.id and capability_key='inquilino.arrangements.create' and idempotency_key=p_input->>'idempotency_key' for update;
    if found then
      if s.request_fingerprint<>fingerprint or s.owner_id<>o.id then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
      if s.id is distinct from o.active_upload_session_id or s.state not in ('open','consumed') or (s.state='open' and s.expires_at<=now()) then raise exception 'SESSION_INVALID'; end if;
      return to_jsonb(s);
    end if;
    if o.active_upload_session_id is not null then raise exception 'SESSION_INVALID'; end if;
    select * into r from public.spec28_reserve_quota(p_organization_id,'storage.bytes','arrangement:'||o.id||':'||encode(extensions.digest(convert_to(p_input->>'idempotency_key','UTF8'),'sha256'),'hex'),total,p_request_id,now()+interval '24 hours');
    s:=public.spec31_initialize_asset_upload(p_organization_id,'arrangement_order',o.id,'inquilino.arrangements.create','member',a.id,
      encode(extensions.digest(convert_to(a.id::text,'UTF8'),'sha256'),'hex'),p_input->>'idempotency_key',fingerprint,p_request_id,now()+interval '55 minutes',descriptors);
    update public.arrangement_orders set active_upload_session_id=s.id,requires_upload_batch=true where id=o.id;
    return to_jsonb(s);
  elsif action='submit' then
    if o.requires_upload_batch and o.active_upload_session_id is null then raise exception 'UPLOAD_INCOMPLETE'; end if;
    if o.active_upload_session_id is not null then
      select * into s from public.asset_upload_sessions where id=o.active_upload_session_id and organization_id=p_organization_id and owner_type='arrangement_order' and owner_id=o.id and principal_reference_id=a.id for update;
      if not found or s.state<>'consumed' then raise exception 'UPLOAD_INCOMPLETE'; end if;
      for i in select * from public.asset_upload_intents where upload_session_id=s.id and organization_id=p_organization_id order by repeatable_item_id::integer for update loop
        select * into m from public.media_assets where id=i.asset_id and organization_id=p_organization_id for update;
        if not found or i.state<>'verified' or m.state<>'verified' or m.detected_mime is distinct from m.declared_mime or m.provider_bytes is distinct from m.declared_bytes then raise exception 'UPLOAD_INCOMPLETE'; end if;
        insert into public.arrangement_order_assets(organization_id,order_id,asset_id,sort_order) values(p_organization_id,o.id,m.id,n);
        n:=n+1;
        update public.media_assets set state='attached',attached_at=now(),updated_at=now(),version=version+1 where id=m.id;
        update public.asset_upload_intents set state='consumed',consumed_at=now(),updated_at=now(),version=version+1 where id=i.id;
      end loop;
      if n=0 then raise exception 'UPLOAD_INCOMPLETE'; end if;
    end if;
    update public.arrangement_orders set submission_state='submitted',submitted_at=now(),updated_at=now(),version=version+1 where id=o.id returning * into o;
    insert into public.organization_events(organization_id,event_type,actor_type,actor_user_id,actor_membership_id,target_type,target_id,request_id,metadata)
    values(p_organization_id,'arrangement.order_submitted','member',a.user_id,a.id,'arrangement_order',o.id,p_request_id,jsonb_build_object('status',o.status,'property_id',o.arrangement_property_id,'asset_count',n));
    return public.spec43_order_projection(o,a.id,true);
  end if;
  -- Session identifiers are references. Always recheck owner, principal and active batch.
  select * into s from public.asset_upload_sessions where id=(p_input->>'session_id')::uuid and organization_id=p_organization_id
    and owner_type='arrangement_order' and owner_id=o.id and principal_type='member' and principal_reference_id=a.id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if action='session_revoke' and s.state='revoked' then return to_jsonb(s); end if;
  if s.id is distinct from o.active_upload_session_id then raise exception 'NOT_FOUND'; end if;
  if action='session_revoke' then
    update public.asset_upload_sessions set state='revoked',revoked_at=now(),finalized_at=null,updated_at=now(),version=version+1 where id=s.id returning * into s;
    update public.arrangement_orders set active_upload_session_id=null where id=o.id;
    -- Keep reserved quota until physical cleanup: issued provider URLs cannot be revoked.
    return to_jsonb(s);
  end if;
  if s.state not in ('open','consumed') or (s.state='open' and s.expires_at<=now()) then raise exception 'SESSION_INVALID'; end if;
  if action='session_context' then
    return jsonb_build_object('session',to_jsonb(s),'intents',coalesce((select jsonb_agg(to_jsonb(x) order by x.repeatable_item_id::integer) from public.asset_upload_intents x where x.organization_id=p_organization_id and x.upload_session_id=s.id),'[]'),
      'assets',coalesce((select jsonb_agg(to_jsonb(ma)) from public.media_assets ma join public.asset_upload_intents x on x.asset_id=ma.id and x.organization_id=ma.organization_id where x.upload_session_id=s.id and x.organization_id=p_organization_id),'[]'));
  elsif action='session_finalize' then
    if s.state='consumed' then return to_jsonb(s); end if;
    if jsonb_typeof(p_input->'objects') is distinct from 'array' or jsonb_array_length(p_input->'objects')<>(select count(*) from public.asset_upload_intents where upload_session_id=s.id and organization_id=p_organization_id) then raise exception 'UPLOAD_INVALID'; end if;
    for v in select value from jsonb_array_elements(p_input->'objects') loop
      select * into i from public.asset_upload_intents where id=(v->>'upload_intent_id')::uuid and upload_session_id=s.id and organization_id=p_organization_id;
      if not found or v->>'detected_mime' is distinct from i.expected_mime or v->>'provider_mime' is distinct from i.expected_mime
        or (v->>'provider_bytes')::bigint is distinct from i.expected_bytes or v->>'checksum_sha256' is distinct from i.expected_checksum
        or v->>'object_path' is distinct from i.object_path or v->>'bucket_name' is distinct from i.bucket_name then raise exception 'UPLOAD_INVALID'; end if;
    end loop;
    s:=public.spec31_finalize_asset_upload(p_organization_id,s.id,(p_input->>'expected_version')::integer,p_input->'objects',p_request_id);
    select * into r from public.usage_reservations where organization_id=p_organization_id and metric_key='storage.bytes' and idempotency_key='arrangement:'||o.id||':'||encode(extensions.digest(convert_to(s.idempotency_key,'UTF8'),'sha256'),'hex');
    perform public.spec28_finalize_quota(p_organization_id,r.id,true,'bytes','asset_upload_session',s.id,'member',p_request_id,'{}');
    return to_jsonb(s);
  end if;
  raise exception 'INVALID_REQUEST';
end; $$;
revoke all on function public.spec43_require_actor(uuid,uuid,boolean,boolean),public.spec43_order_projection(public.arrangement_orders,uuid,boolean),public.spec43_arrangements(uuid,uuid,text,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.spec43_arrangements(uuid,uuid,text,jsonb,text) to service_role;

-- Worker-only, organization-scoped orphan cleanup. Archive is not closure; associated assets never qualify.
create function public.spec43_cleanup_assets(p_organization_id uuid,p_action text,p_asset_id uuid,p_result text,p_request_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare m public.media_assets; s public.asset_upload_sessions; r public.usage_reservations; result jsonb:='[]'; receipt public.asset_deletion_receipts;
begin
  perform 1 from public.organizations where id=p_organization_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_action='claim' then
    update public.arrangement_orders set submission_state='expired',updated_at=now() where organization_id=p_organization_id and submission_state='draft' and created_at<=now()-interval '24 hours';
    for m in select ma.* from public.media_assets ma
      join public.asset_upload_intents i on i.asset_id=ma.id and i.organization_id=ma.organization_id
      join public.asset_upload_sessions us on us.id=i.upload_session_id and us.organization_id=i.organization_id
      join public.arrangement_orders o on o.id=us.owner_id and o.organization_id=us.organization_id
      where ma.organization_id=p_organization_id and us.owner_type='arrangement_order'
        and ma.state in ('pending','uploaded','verifying','verified','quarantined','deleting','deletion_failed')
        and ma.created_at<=now()-interval '24 hours' and (us.state='revoked' or o.submission_state='expired')
        and ma.legal_hold_reference is null and (ma.retain_until is null or ma.retain_until<=now())
        and not exists(select from public.arrangement_order_assets x where x.asset_id=ma.id and x.organization_id=ma.organization_id)
      order by ma.created_at,ma.id limit 25 for update of ma loop
      update public.media_assets set state='deleting',logical_deleted_at=coalesce(logical_deleted_at,now()),updated_at=now(),version=version+1 where id=m.id;
      insert into public.asset_deletion_receipts(organization_id,asset_id,deletion_request_id,reason_code,policy_version,logical_denial_at,storage_result,actor_type,request_id)
      values(p_organization_id,m.id,m.id,'UNATTACHED_EXPIRED',1,coalesce(m.logical_deleted_at,now()),'pending','system_worker',p_request_id)
      on conflict(organization_id,asset_id,deletion_request_id) do nothing;
      result:=result||jsonb_build_array(jsonb_build_object('id',m.id,'organization_id',p_organization_id,'bucket_name',m.bucket_name,'object_path',m.object_path));
    end loop;
    return result;
  elsif p_action='complete' then
    if p_result not in ('deleted','not_found_reconciled','failed') or p_result is null then raise exception 'INVALID_REQUEST'; end if;
    select * into m from public.media_assets where id=p_asset_id and organization_id=p_organization_id for update;
    if not found or m.category not in ('arrangement_image','arrangement_video') then raise exception 'NOT_FOUND'; end if;
    if m.state='deleted' then return jsonb_build_object('id',m.id,'state','deleted'); end if;
    if m.state<>'deleting' or m.legal_hold_reference is not null or exists(select from public.arrangement_order_assets where asset_id=m.id and organization_id=p_organization_id) then raise exception 'NOT_FOUND'; end if;
    select * into receipt from public.asset_deletion_receipts where organization_id=p_organization_id and asset_id=m.id and deletion_request_id=m.id for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    -- SPEC-31 evidence is append-only: record an outcome, never rewrite the claim.
    insert into public.asset_deletion_receipts(organization_id,asset_id,deletion_request_id,reason_code,policy_version,
      logical_denial_at,storage_result,actor_type,safe_error_code,request_id,created_at,completed_at)
    values(p_organization_id,m.id,gen_random_uuid(),'UNATTACHED_EXPIRED',1,receipt.logical_denial_at,p_result,'system_worker',
      case when p_result='failed' then 'STORAGE_UNAVAILABLE' end,p_request_id,clock_timestamp(),clock_timestamp());
    update public.media_assets set state=case when p_result='failed' then 'deletion_failed' else 'deleted' end,
      physical_deleted_at=case when p_result<>'failed' then now() end,updated_at=now(),version=version+1 where id=m.id;
    if p_result<>'failed' then
      select us.* into s from public.asset_upload_sessions us join public.asset_upload_intents i on i.upload_session_id=us.id and i.organization_id=us.organization_id where i.asset_id=m.id and i.organization_id=p_organization_id;
      select * into r from public.usage_reservations where organization_id=p_organization_id and metric_key='storage.bytes' and idempotency_key='arrangement:'||s.owner_id||':'||encode(extensions.digest(convert_to(s.idempotency_key,'UTF8'),'sha256'),'hex') for update;
      if r.state='finalized' then
        perform public.spec28_record_usage(p_organization_id,'arrangement-deleted:'||m.id,'storage.bytes',-m.provider_bytes,'bytes','media_asset',m.id,'system_worker',p_request_id,'{}');
        update public.quota_snapshots set consumed=consumed-m.provider_bytes,updated_at=now(),version=version+1 where organization_id=p_organization_id and metric_key='storage.bytes';
      elsif r.state='reserved' and not exists(select from public.asset_upload_intents i join public.media_assets ma on ma.id=i.asset_id and ma.organization_id=i.organization_id where i.upload_session_id=s.id and i.organization_id=p_organization_id and ma.state<>'deleted') then
        perform public.spec28_finalize_quota(p_organization_id,r.id,false,'bytes','asset_upload_session',s.id,'system_worker',p_request_id,'{}');
      end if;
    end if;
    return jsonb_build_object('id',m.id,'state',case when p_result='failed' then 'deletion_failed' else 'deleted' end);
  end if;
  raise exception 'INVALID_REQUEST';
end; $$;
revoke all on function public.spec43_cleanup_assets(uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.spec43_cleanup_assets(uuid,text,uuid,text,text) to service_role;

create or replace function public.spec31_record_asset_upload_issuance(
  p_organization_id uuid, p_upload_session_id uuid, p_upload_intent_id uuid,
  p_url_expires_at timestamptz
) returns public.asset_upload_intents
language plpgsql security definer set search_path = pg_catalog as $$
declare v_intent public.asset_upload_intents;
begin
  if p_url_expires_at <= clock_timestamp() or p_url_expires_at > clock_timestamp() + (case when exists(select from public.asset_upload_sessions where id=p_upload_session_id and organization_id=p_organization_id and owner_type='arrangement_order') then interval '2 hours' else interval '1 hour' end)
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


commit;
