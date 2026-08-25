-- SPEC-29 follow-up: tenant-aware HTTP contract creation and administration.

create or replace function public.log_contract_entry_created()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  v_membership_id uuid;
  v_request_id text;
begin
  if new.organization_id is not null then
    v_membership_id := nullif(current_setting('app.actor_membership_id', true), '')::uuid;
    v_request_id := coalesce(nullif(current_setting('app.request_id', true), ''), 'tenant_contract_create');
  end if;
  insert into public.contract_events (
    organization_id, entry_id, event_type, event_data, actor_type, actor_user_id,
    actor_membership_id, request_id, aggregate_version, occurred_at
  ) values (
    new.organization_id, new.id, 'created', jsonb_build_object('schema_id', new.schema_id),
    case when new.organization_id is null then null else 'member' end,
    new.created_by_user_id, v_membership_id, v_request_id, new.version, new.created_at
  );
  return new;
end;
$$;

create or replace function public.spec29_create_tenant_contract(
  p_organization_id uuid, p_entry_id uuid, p_schema_id text, p_direccion text,
  p_created_by_user_id uuid, p_created_by_membership_id uuid,
  p_user_token_hash text, p_client_token_hash text, p_request_id text
) returns setof public.contract_entries
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_entry public.contract_entries%rowtype;
  v_display_name text;
begin
  if p_organization_id is null or p_entry_id is null
    or char_length(btrim(p_schema_id)) not between 1 and 128
    or char_length(btrim(p_direccion)) not between 1 and 256
    or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or p_user_token_hash !~ '^v1:[0-9a-f]{64}$'
    or p_client_token_hash !~ '^v1:[0-9a-f]{64}$' then
    raise exception 'INVALID_CONTRACT_CREATE';
  end if;
  select coalesce(nullif(btrim(p.display_name), ''), u.email)
    into v_display_name
  from public.organization_memberships m
  join public.organizations o on o.id = m.organization_id and o.status = 'active'
  join auth.users u on u.id = m.user_id
  left join public.user_profiles p on p.user_id = m.user_id
  where m.id = p_created_by_membership_id
    and m.organization_id = p_organization_id
    and m.user_id = p_created_by_user_id
    and m.status = 'active'
    and m.role in ('owner', 'admin', 'member');
  if not found then raise exception 'FORBIDDEN'; end if;

  perform set_config('app.actor_membership_id', p_created_by_membership_id::text, true);
  perform set_config('app.request_id', p_request_id, true);
  insert into public.contract_entries (
    id, organization_id, schema_id, direccion, created_by, created_by_user_id,
    updated_by_user_id, created_at, updated_at, user_token_hash, client_token_hash
  ) values (
    p_entry_id, p_organization_id, btrim(p_schema_id), btrim(p_direccion),
    v_display_name, p_created_by_user_id, p_created_by_user_id,
    clock_timestamp(), clock_timestamp(), p_user_token_hash, p_client_token_hash
  ) returning * into v_entry;

  insert into public.audit_events (
    organization_id, request_id, actor_type, actor_user_id, actor_membership_id,
    action, target_type, target_id, outcome, source, changed_fields, metadata
  ) values (
    p_organization_id, p_request_id, 'member', p_created_by_user_id, p_created_by_membership_id,
    'contracts.created', 'contract', p_entry_id, 'succeeded', 'api.contracts',
    array['organization_id', 'schema_id', 'direccion'], '{}'::jsonb
  );
  insert into public.usage_events (
    organization_id, idempotency_key, metric_key, quantity, unit, source_type,
    source_id, actor_type, request_id, metadata
  ) values (
    p_organization_id, 'contract-create:' || p_entry_id::text, 'contracts.created', 1,
    'count', 'contract', p_entry_id, 'member', p_request_id, '{}'::jsonb
  );
  return next v_entry;
end;
$$;

create or replace function public.spec29_set_tenant_contract_status(
  p_organization_id uuid, p_entry_id uuid, p_expected_version integer,
  p_status text, p_actor_user_id uuid, p_actor_membership_id uuid, p_request_id text
) returns setof public.contract_entries
language plpgsql security definer set search_path = pg_catalog as $$
declare v_entry public.contract_entries%rowtype; v_now timestamptz := clock_timestamp();
begin
  perform 1 from public.organization_memberships where id = p_actor_membership_id
    and organization_id = p_organization_id and user_id = p_actor_user_id
    and status = 'active' and role in ('owner', 'admin');
  if not found then raise exception 'FORBIDDEN'; end if;
  if p_status not in ('open', 'complete', 'generar_contrato') then raise exception 'INVALID_STATE'; end if;
  select * into v_entry from public.contract_entries where id = p_entry_id
    and organization_id = p_organization_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_entry.version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if v_entry.status = 'archived' then raise exception 'INVALID_STATE'; end if;
  update public.contract_entries set status = p_status,
    generar_contrato_trigger = case when p_status = 'generar_contrato' then true else generar_contrato_trigger end,
    generation_state = case when p_status = 'generar_contrato' then 'queued' else generation_state end,
    updated_by_user_id = p_actor_user_id, updated_at = v_now, version = version + 1
  where id = p_entry_id and organization_id = p_organization_id returning * into v_entry;
  insert into public.contract_events (organization_id, entry_id, event_type, event_data,
    actor_type, actor_user_id, actor_membership_id, request_id, aggregate_version, occurred_at)
  values (p_organization_id, p_entry_id,
    case when p_status = 'generar_contrato' then 'generation_requested' else 'status_changed' end,
    jsonb_build_object('status', p_status), 'member', p_actor_user_id,
    p_actor_membership_id, p_request_id, v_entry.version, v_now);
  return next v_entry;
end;
$$;

create or replace function public.spec29_archive_tenant_contract(
  p_organization_id uuid, p_entry_id uuid, p_expected_version integer,
  p_actor_user_id uuid, p_actor_membership_id uuid, p_request_id text
) returns setof public.contract_entries
language plpgsql security definer set search_path = pg_catalog as $$
declare v_entry public.contract_entries%rowtype; v_now timestamptz := clock_timestamp();
begin
  perform 1 from public.organization_memberships where id = p_actor_membership_id
    and organization_id = p_organization_id and user_id = p_actor_user_id
    and status = 'active' and role in ('owner', 'admin');
  if not found then raise exception 'FORBIDDEN'; end if;
  select * into v_entry from public.contract_entries where id = p_entry_id
    and organization_id = p_organization_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_entry.version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if v_entry.status = 'archived' then return next v_entry; return; end if;
  update public.contract_entries set status = 'archived', archived_at = v_now,
    updated_by_user_id = p_actor_user_id, updated_at = v_now, version = version + 1
  where id = p_entry_id and organization_id = p_organization_id returning * into v_entry;
  insert into public.contract_events (organization_id, entry_id, event_type, event_data,
    actor_type, actor_user_id, actor_membership_id, request_id, aggregate_version, occurred_at)
  values (p_organization_id, p_entry_id, 'archived', '{}'::jsonb, 'member',
    p_actor_user_id, p_actor_membership_id, p_request_id, v_entry.version, v_now);
  return next v_entry;
end;
$$;

create or replace function public.spec29_replace_tenant_contract_token(
  p_organization_id uuid, p_entry_id uuid, p_expected_version integer, p_role text,
  p_token_hash text, p_actor_user_id uuid, p_actor_membership_id uuid, p_request_id text
) returns setof public.contract_entries
language plpgsql security definer set search_path = pg_catalog as $$
declare v_entry public.contract_entries%rowtype; v_now timestamptz := clock_timestamp();
begin
  perform 1 from public.organization_memberships where id = p_actor_membership_id
    and organization_id = p_organization_id and user_id = p_actor_user_id
    and status = 'active' and role in ('owner', 'admin');
  if not found then raise exception 'FORBIDDEN'; end if;
  if p_role not in ('user', 'client') or p_token_hash !~ '^v1:[0-9a-f]{64}$' then raise exception 'INVALID_LINK'; end if;
  select * into v_entry from public.contract_entries where id = p_entry_id
    and organization_id = p_organization_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_entry.version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if v_entry.status = 'archived' then raise exception 'INVALID_STATE'; end if;
  update public.contract_entries set
    user_token_hash = case when p_role = 'user' then p_token_hash else user_token_hash end,
    client_token_hash = case when p_role = 'client' then p_token_hash else client_token_hash end,
    updated_by_user_id = p_actor_user_id, updated_at = v_now, version = version + 1
  where id = p_entry_id and organization_id = p_organization_id returning * into v_entry;
  insert into public.contract_events (organization_id, entry_id, event_type, event_data,
    actor_type, actor_user_id, actor_membership_id, request_id, aggregate_version, occurred_at)
  values (p_organization_id, p_entry_id, 'token_regenerated', jsonb_build_object('role', p_role),
    'member', p_actor_user_id, p_actor_membership_id, p_request_id, v_entry.version, v_now);
  return next v_entry;
end;
$$;

revoke all on function public.spec29_create_tenant_contract(uuid,uuid,text,text,uuid,uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.spec29_set_tenant_contract_status(uuid,uuid,integer,text,uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.spec29_archive_tenant_contract(uuid,uuid,integer,uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.spec29_replace_tenant_contract_token(uuid,uuid,integer,text,text,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.spec29_create_tenant_contract(uuid,uuid,text,text,uuid,uuid,text,text,text) to service_role;
grant execute on function public.spec29_set_tenant_contract_status(uuid,uuid,integer,text,uuid,uuid,text) to service_role;
grant execute on function public.spec29_archive_tenant_contract(uuid,uuid,integer,uuid,uuid,text) to service_role;
grant execute on function public.spec29_replace_tenant_contract_token(uuid,uuid,integer,text,text,uuid,uuid,text) to service_role;
