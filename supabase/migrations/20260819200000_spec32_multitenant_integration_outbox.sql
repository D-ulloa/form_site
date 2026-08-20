-- SPEC-32 / MT-SPEC-08: organization-resolved integrations, secret references,
-- transactional outbox, leased deliveries, attempts, resources and health.
-- No real provider resource, credential, legacy trigger cutover, or Solar enablement occurs here.
create extension if not exists pgcrypto;

create table public.integration_secret_references (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  integration_id uuid,
  secret_type text not null check (secret_type in ('google_service_account', 'google_oauth', 'webhook_signing')),
  secret_store_reference text not null check (char_length(secret_store_reference) between 12 and 512),
  secret_version integer not null check (secret_version > 0),
  state text not null default 'pending' check (state in ('pending', 'active', 'grace', 'revoked', 'deleted')),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  masked_descriptor text not null check (char_length(masked_descriptor) between 1 and 120),
  created_actor_type text not null check (created_actor_type in ('member', 'platform_support', 'system_worker', 'migration')),
  request_id text not null check (request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  created_at timestamptz not null default now(), rotated_at timestamptz, revoked_at timestamptz, deleted_at timestamptz,
  unique (id, organization_id), unique (organization_id, secret_store_reference),
  unique (organization_id, integration_id, secret_type, secret_version),
  check ((state = 'revoked') = (revoked_at is not null) or state <> 'revoked'),
  check ((state = 'deleted') = (deleted_at is not null) or state <> 'deleted')
);
create index integration_secret_refs_tenant_state_idx
  on public.integration_secret_references (organization_id, state, integration_id, secret_version desc);

create table public.organization_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  provider text not null check (provider in ('google_drive', 'google_sheets', 'make_webhook')),
  purpose text not null check (purpose in ('property_export', 'property_sheet', 'property_events', 'contract_sheet', 'contract_generation')),
  state text not null default 'draft' check (state in ('draft', 'active', 'disabled', 'unhealthy', 'rotating', 'revoked')),
  credential_ref_id uuid, credential_version integer check (credential_version is null or credential_version > 0),
  configuration jsonb not null default '{}'::jsonb,
  configuration_version integer not null default 1 check (configuration_version > 0),
  masked_destination text not null check (char_length(masked_destination) between 1 and 160),
  health_state text not null default 'untested' check (health_state in ('untested', 'healthy', 'unhealthy', 'expired')),
  health_error_code text check (health_error_code is null or health_error_code ~ '^[A-Z0-9_]{1,64}$'),
  health_checked_at timestamptz,
  created_actor_type text not null check (created_actor_type in ('member', 'platform_support', 'system_worker', 'migration')),
  updated_actor_type text not null check (updated_actor_type in ('member', 'platform_support', 'system_worker', 'migration')),
  request_id text not null check (request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  unique (id, organization_id),
  foreign key (credential_ref_id, organization_id)
    references public.integration_secret_references(id, organization_id) on delete restrict,
  check (jsonb_typeof(configuration) = 'object' and octet_length(configuration::text) <= 16384),
  check (not configuration ?| array['secret', 'private_key', 'refresh_token', 'access_token', 'authorization'])
);
alter table public.integration_secret_references add constraint integration_secret_refs_integration_tenant_fk
  foreign key (integration_id, organization_id)
  references public.organization_integrations(id, organization_id) on delete restrict deferrable initially deferred;
create unique index organization_integrations_one_active_idx
  on public.organization_integrations (organization_id, provider, purpose) where state = 'active';
create index organization_integrations_tenant_state_idx
  on public.organization_integrations (organization_id, state, provider, purpose, id);

create table public.outbox_events (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_.]{2,127}$'), schema_version text not null,
  aggregate_type text not null check (aggregate_type in ('contract', 'property', 'asset', 'organization')),
  aggregate_id uuid not null, aggregate_revision_id uuid, aggregate_version integer not null check (aggregate_version > 0),
  payload jsonb not null, idempotency_key text not null check (char_length(idempotency_key) between 8 and 160),
  request_id text not null check (request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  occurred_at timestamptz not null, available_at timestamptz not null default now(),
  fanout_state text not null default 'pending' check (fanout_state in ('pending', 'materialized', 'completed', 'blocked', 'cancelled')),
  integrity_version integer not null default 1 check (integrity_version > 0), created_at timestamptz not null default now(),
  unique (id, organization_id), unique (organization_id, idempotency_key),
  check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 65536),
  check (not payload ?| array['authorization', 'credential', 'private_key', 'refresh_token', 'signed_url', 'object_path'])
);
create index outbox_events_tenant_queue_idx on public.outbox_events (organization_id, fanout_state, available_at, id);

create table public.integration_deliveries (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  outbox_event_id uuid not null, integration_id uuid not null,
  provider text not null check (provider in ('google_drive', 'google_sheets', 'make_webhook')),
  purpose text not null check (purpose in ('property_export', 'property_sheet', 'property_events', 'contract_sheet', 'contract_generation')),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 160),
  state text not null default 'pending' check (state in ('pending', 'leased', 'processing', 'succeeded', 'retry_wait', 'reconciling', 'unknown', 'failed', 'dead_letter', 'blocked', 'cancelled')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 100), next_attempt_at timestamptz not null default now(),
  lease_owner text, lease_token uuid, lease_acquired_at timestamptz, lease_expires_at timestamptz,
  credential_version integer, configuration_version integer not null check (configuration_version > 0),
  safe_error_code text check (safe_error_code is null or safe_error_code ~ '^[A-Z0-9_]{1,64}$'),
  safe_response_status integer check (safe_response_status is null or safe_response_status between 100 and 599),
  external_id text, receipt_reference text, original_delivery_id uuid, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), completed_at timestamptz, version integer not null default 1 check (version > 0),
  unique (id, organization_id), unique (organization_id, integration_id, outbox_event_id, purpose),
  unique (organization_id, integration_id, idempotency_key),
  foreign key (outbox_event_id, organization_id) references public.outbox_events(id, organization_id) on delete restrict,
  foreign key (integration_id, organization_id) references public.organization_integrations(id, organization_id) on delete restrict,
  foreign key (original_delivery_id, organization_id) references public.integration_deliveries(id, organization_id) on delete restrict,
  check ((lease_token is null and lease_owner is null and lease_acquired_at is null and lease_expires_at is null)
    or (lease_token is not null and lease_owner is not null and lease_acquired_at is not null and lease_expires_at > lease_acquired_at))
);
create index integration_deliveries_tenant_queue_idx on public.integration_deliveries (organization_id, state, next_attempt_at, id);
create index integration_deliveries_fair_claim_idx on public.integration_deliveries (state, next_attempt_at, organization_id, id)
  where state in ('pending', 'retry_wait');

create table public.integration_delivery_attempts (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  delivery_id uuid not null, attempt_number integer not null check (attempt_number > 0),
  attempt_type text not null check (attempt_type in ('deliver', 'reconcile', 'health_test', 'manual_retry')),
  lease_token uuid, worker_id text, credential_version integer, configuration_version integer not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  response_status integer check (response_status is null or response_status between 100 and 599),
  error_class text check (error_class is null or error_class ~ '^[A-Z0-9_]{1,64}$'),
  outcome text check (outcome is null or outcome in ('succeeded', 'transient_failure', 'permanent_failure', 'ambiguous')),
  external_id text, next_action text, request_id text not null,
  started_at timestamptz not null default now(), finished_at timestamptz, duration_ms integer check (duration_ms is null or duration_ms >= 0),
  unique (id, organization_id), unique (organization_id, delivery_id, attempt_number, attempt_type),
  foreign key (delivery_id, organization_id) references public.integration_deliveries(id, organization_id) on delete restrict
);
create index integration_attempts_tenant_delivery_idx on public.integration_delivery_attempts (organization_id, delivery_id, attempt_number);

create table public.integration_external_resources (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  integration_id uuid not null, delivery_id uuid, provider text not null, resource_type text not null,
  provider_resource_id text not null, parent_resource_id text, aggregate_type text not null, aggregate_id uuid not null,
  revision_id uuid, asset_id uuid, idempotency_marker text not null, safe_display text,
  state text not null default 'active' check (state in ('active', 'missing', 'orphaned', 'deleting', 'deleted', 'unknown')),
  configuration_version integer not null, created_at timestamptz not null default now(), verified_at timestamptz,
  deleted_at timestamptz, deletion_receipt_reference text, unique (id, organization_id),
  unique (organization_id, integration_id, provider, provider_resource_id),
  unique (organization_id, integration_id, idempotency_marker, resource_type),
  foreign key (integration_id, organization_id) references public.organization_integrations(id, organization_id) on delete restrict,
  foreign key (delivery_id, organization_id) references public.integration_deliveries(id, organization_id) on delete restrict,
  foreign key (asset_id, organization_id) references public.media_assets(id, organization_id) on delete restrict
);
create index integration_resources_tenant_aggregate_idx on public.integration_external_resources (organization_id, aggregate_type, aggregate_id, state);

create table public.integration_health_checks (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  integration_id uuid not null, check_kind text not null check (check_kind in ('credential', 'destination', 'schema', 'signature')),
  credential_version integer, configuration_version integer not null, state text not null check (state in ('healthy', 'unhealthy')),
  safe_error_code text check (safe_error_code is null or safe_error_code ~ '^[A-Z0-9_]{1,64}$'),
  latency_ms integer not null check (latency_ms >= 0), actor_type text not null,
  request_id text not null, checked_at timestamptz not null default now(), expires_at timestamptz not null,
  unique (id, organization_id),
  foreign key (integration_id, organization_id) references public.organization_integrations(id, organization_id) on delete restrict,
  check (expires_at > checked_at)
);
create index integration_health_tenant_idx on public.integration_health_checks (organization_id, integration_id, checked_at desc);

create or replace function public.spec32_prevent_history_mutation() returns trigger
language plpgsql security invoker set search_path = pg_catalog as $$ begin raise exception 'IMMUTABLE_INTEGRATION_HISTORY'; end $$;
create trigger outbox_events_append_only before update of organization_id, event_type, schema_version, aggregate_type,
  aggregate_id, aggregate_revision_id, aggregate_version, payload, idempotency_key, occurred_at on public.outbox_events
  for each row execute function public.spec32_prevent_history_mutation();
create trigger integration_attempts_append_only before update or delete on public.integration_delivery_attempts
  for each row execute function public.spec32_prevent_history_mutation();

-- Domain event insertion and delivery intent are one transaction. The payload
-- is deliberately reconstructed from stable IDs instead of copying domain rows.
create or replace function public.spec32_capture_property_event() returns trigger
language plpgsql security definer set search_path = pg_catalog as $$
declare v_version integer;
begin
  if new.event_type not in ('property_created','property_revised','property_archived','property_reactivated') then return new; end if;
  select revision_number into v_version from public.property_revisions
    where id=new.revision_id and organization_id=new.organization_id and property_id=new.property_id;
  insert into public.outbox_events (organization_id,event_type,schema_version,aggregate_type,aggregate_id,
    aggregate_revision_id,aggregate_version,payload,idempotency_key,request_id,occurred_at)
  values (new.organization_id,replace(new.event_type,'_','.'),'1','property',new.property_id,new.revision_id,
    coalesce(v_version,1),jsonb_build_object('source_event_id',new.id,'property_id',new.property_id,
      'revision_id',new.revision_id),'property-event:'||new.id::text,new.request_id,new.occurred_at)
  on conflict (organization_id,idempotency_key) do nothing;
  return new;
end $$;
create trigger property_events_to_outbox after insert on public.property_events
  for each row execute function public.spec32_capture_property_event();

create or replace function public.spec32_capture_contract_event() returns trigger
language plpgsql security definer set search_path = pg_catalog as $$
begin
  if new.organization_id is null or new.event_type not in ('user_submitted','client_submitted','revision_appended',
    'completed','generation_requested','asset_associated') then return new; end if;
  insert into public.outbox_events (organization_id,event_type,schema_version,aggregate_type,aggregate_id,
    aggregate_version,payload,idempotency_key,request_id,occurred_at)
  values (new.organization_id,'contract.'||replace(new.event_type,'_','.'),'1','contract',new.entry_id,
    coalesce(new.aggregate_version,1),jsonb_build_object('source_event_id',new.id,'entry_id',new.entry_id),
    'contract-event:'||new.id::text,coalesce(new.request_id,'legacy-contract-event'),new.occurred_at)
  on conflict (organization_id,idempotency_key) do nothing;
  return new;
end $$;
create trigger contract_events_to_outbox after insert on public.contract_events
  for each row execute function public.spec32_capture_contract_event();

create or replace function public.spec32_enqueue_outbox(
  p_organization_id uuid, p_event_type text, p_schema_version text, p_aggregate_type text,
  p_aggregate_id uuid, p_aggregate_revision_id uuid, p_aggregate_version integer,
  p_payload jsonb, p_idempotency_key text, p_request_id text, p_occurred_at timestamptz
) returns setof public.outbox_events language plpgsql security definer set search_path = pg_catalog as $$
declare v_event public.outbox_events%rowtype;
begin
  if jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 65536
    or p_payload ?| array['authorization','credential','private_key','refresh_token','signed_url','object_path'] then
    raise exception 'INVALID_OUTBOX_PAYLOAD';
  end if;
  insert into public.outbox_events (organization_id,event_type,schema_version,aggregate_type,aggregate_id,
    aggregate_revision_id,aggregate_version,payload,idempotency_key,request_id,occurred_at)
  values (p_organization_id,p_event_type,p_schema_version,p_aggregate_type,p_aggregate_id,
    p_aggregate_revision_id,p_aggregate_version,p_payload,p_idempotency_key,p_request_id,p_occurred_at)
  on conflict (organization_id,idempotency_key) do nothing returning * into v_event;
  if not found then select * into v_event from public.outbox_events
    where organization_id=p_organization_id and idempotency_key=p_idempotency_key;
  end if;
  return next v_event;
end $$;

create or replace function public.spec32_materialize_deliveries(p_organization_id uuid, p_event_id uuid)
returns setof public.integration_deliveries language plpgsql security definer set search_path = pg_catalog as $$
declare v_event public.outbox_events%rowtype; v_delivery public.integration_deliveries%rowtype; v_integration record;
begin
  select * into v_event from public.outbox_events where id=p_event_id and organization_id=p_organization_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  for v_integration in select * from public.organization_integrations where organization_id=p_organization_id and state='active'
    and ((v_event.aggregate_type='property' and purpose in ('property_export','property_sheet','property_events'))
      or (v_event.aggregate_type='contract' and purpose in ('contract_sheet','contract_generation')))
  loop
    insert into public.integration_deliveries (organization_id,outbox_event_id,integration_id,provider,purpose,
      idempotency_key,credential_version,configuration_version)
    values (p_organization_id,p_event_id,v_integration.id,v_integration.provider,v_integration.purpose,
      encode(public.digest(p_event_id::text||':'||v_integration.id::text||':'||v_integration.purpose,'sha256'),'hex'),
      v_integration.credential_version,v_integration.configuration_version)
    on conflict (organization_id,integration_id,outbox_event_id,purpose) do update set updated_at=public.integration_deliveries.updated_at
    returning * into v_delivery; return next v_delivery;
  end loop;
  update public.outbox_events set fanout_state='materialized' where id=p_event_id and organization_id=p_organization_id;
end $$;

create or replace function public.spec32_claim_deliveries(p_worker_id text, p_limit integer, p_lease_seconds integer)
returns setof public.integration_deliveries language plpgsql security definer set search_path = pg_catalog as $$
begin
  if char_length(p_worker_id) not between 3 and 128 or p_limit not between 1 and 50 or p_lease_seconds not between 15 and 300 then
    raise exception 'INVALID_CLAIM'; end if;
  -- Expiry never means the provider did not commit. Reconciliation must decide.
  update public.integration_deliveries set state='unknown',safe_error_code='LEASE_EXPIRED',
    lease_owner=null,lease_token=null,lease_acquired_at=null,lease_expires_at=null,
    updated_at=clock_timestamp(),version=version+1
    where state in ('leased','processing') and lease_expires_at<=clock_timestamp();
  return query with fair as materialized (
    select d.id,d.organization_id,row_number() over(partition by d.organization_id order by d.next_attempt_at,d.id) tenant_rank
    from public.integration_deliveries d join public.organization_integrations i
      on i.id=d.integration_id and i.organization_id=d.organization_id and i.state='active'
    join public.organizations o on o.id=d.organization_id and o.status='active'
    where d.state in ('pending','retry_wait') and d.next_attempt_at<=clock_timestamp()
      and (d.lease_expires_at is null or d.lease_expires_at<=clock_timestamp())
  ), picked as (
    select d.id,d.organization_id from public.integration_deliveries d join fair f
      on f.id=d.id and f.organization_id=d.organization_id
    where d.state in ('pending','retry_wait')
    order by f.tenant_rank,d.organization_id,d.id limit p_limit for update of d skip locked
  )
  update public.integration_deliveries d set state='leased',lease_owner=p_worker_id,lease_token=public.gen_random_uuid(),
    lease_acquired_at=clock_timestamp(),lease_expires_at=clock_timestamp()+make_interval(secs=>p_lease_seconds),
    attempt_count=d.attempt_count+1,updated_at=clock_timestamp(),version=d.version+1
  from picked p where d.id=p.id and d.organization_id=p.organization_id returning d.*;
end $$;

create or replace function public.spec32_transition_delivery(
  p_organization_id uuid,p_delivery_id uuid,p_lease_token uuid,p_expected_version integer,p_next_state text,
  p_safe_error_code text,p_external_id text,p_receipt_reference text,p_next_attempt_at timestamptz
) returns setof public.integration_deliveries language plpgsql security definer set search_path = pg_catalog as $$
declare v_delivery public.integration_deliveries%rowtype;
begin
  select * into v_delivery from public.integration_deliveries where id=p_delivery_id and organization_id=p_organization_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_delivery.version<>p_expected_version or v_delivery.lease_token is distinct from p_lease_token then raise exception 'DELIVERY_STATE_CONFLICT'; end if;
  if p_next_state not in ('processing','succeeded','retry_wait','reconciling','unknown','failed','dead_letter','blocked','cancelled') then raise exception 'DELIVERY_STATE_CONFLICT'; end if;
  if not ((v_delivery.state='leased' and p_next_state in ('processing','unknown','blocked'))
    or (v_delivery.state='processing' and p_next_state in ('succeeded','retry_wait','reconciling','unknown','failed','dead_letter'))
    or (v_delivery.state='reconciling' and p_next_state in ('succeeded','retry_wait','unknown','dead_letter')))
    then raise exception 'DELIVERY_STATE_CONFLICT'; end if;
  update public.integration_deliveries set state=p_next_state,safe_error_code=p_safe_error_code,external_id=p_external_id,
    receipt_reference=p_receipt_reference,next_attempt_at=coalesce(p_next_attempt_at,next_attempt_at),
    completed_at=case when p_next_state in ('succeeded','dead_letter','cancelled') then clock_timestamp() else null end,
    lease_owner=case when p_next_state='processing' then lease_owner else null end,
    lease_token=case when p_next_state='processing' then lease_token else null end,
    lease_acquired_at=case when p_next_state='processing' then lease_acquired_at else null end,
    lease_expires_at=case when p_next_state='processing' then lease_expires_at else null end,
    updated_at=clock_timestamp(),version=version+1
    where id=p_delivery_id and organization_id=p_organization_id returning * into v_delivery;
  return next v_delivery;
end $$;

create view public.organization_integrations_safe as select id,organization_id,provider,purpose,state,
  configuration_version,masked_destination,health_state,health_error_code,health_checked_at,created_at,updated_at,version
  from public.organization_integrations;

do $$ declare table_name text; begin foreach table_name in array array['integration_secret_references','organization_integrations',
  'outbox_events','integration_deliveries','integration_delivery_attempts','integration_external_resources','integration_health_checks']
loop execute format('alter table public.%I enable row level security',table_name);
  execute format('alter table public.%I force row level security',table_name);
  execute format('revoke all on table public.%I from public, anon, authenticated',table_name); end loop; end $$;
revoke all on table public.organization_integrations_safe from public,anon,authenticated;
grant select on table public.organization_integrations_safe to service_role;
revoke all on function public.spec32_enqueue_outbox(uuid,text,text,text,uuid,uuid,integer,jsonb,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.spec32_materialize_deliveries(uuid,uuid) from public,anon,authenticated;
revoke all on function public.spec32_claim_deliveries(text,integer,integer) from public,anon,authenticated;
revoke all on function public.spec32_transition_delivery(uuid,uuid,uuid,integer,text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.spec32_enqueue_outbox(uuid,text,text,text,uuid,uuid,integer,jsonb,text,text,timestamptz) to service_role;
grant execute on function public.spec32_materialize_deliveries(uuid,uuid) to service_role;
grant execute on function public.spec32_claim_deliveries(text,integer,integer) to service_role;
grant execute on function public.spec32_transition_delivery(uuid,uuid,uuid,integer,text,text,text,text,timestamptz) to service_role;
