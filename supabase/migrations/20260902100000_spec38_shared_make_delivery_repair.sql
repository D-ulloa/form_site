-- SPEC-38 repair: all organizations use the process-level Make endpoint.
-- The URL deliberately stays outside the database in MAKE_WEBHOOK_URL.

-- The existing materializer was recorded before it was exercised in this
-- project. pgcrypto is installed in the extensions schema, not public.
create or replace function public.spec32_materialize_deliveries(
  p_organization_id uuid,
  p_event_id uuid
) returns setof public.integration_deliveries
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_event public.outbox_events%rowtype;
  v_delivery public.integration_deliveries%rowtype;
  v_integration record;
begin
  select * into v_event
  from public.outbox_events
  where id = p_event_id and organization_id = p_organization_id
  for update;
  if not found then raise exception 'NOT_FOUND'; end if;

  for v_integration in
    select * from public.organization_integrations
    where organization_id = p_organization_id and state = 'active'
      and ((v_event.aggregate_type = 'property' and purpose in ('property_export', 'property_sheet', 'property_events'))
        or (v_event.aggregate_type = 'contract' and purpose in ('contract_sheet', 'contract_generation')))
  loop
    insert into public.integration_deliveries (
      organization_id, outbox_event_id, integration_id, provider, purpose,
      idempotency_key, credential_version, configuration_version
    ) values (
      p_organization_id, p_event_id, v_integration.id, v_integration.provider, v_integration.purpose,
      encode(extensions.digest(p_event_id::text || ':' || v_integration.id::text || ':' || v_integration.purpose, 'sha256'), 'hex'),
      v_integration.credential_version, v_integration.configuration_version
    )
    on conflict (organization_id, integration_id, outbox_event_id, purpose)
      do update set updated_at = public.integration_deliveries.updated_at
    returning * into v_delivery;
    return next v_delivery;
  end loop;

  update public.outbox_events
  set fanout_state = 'materialized'
  where id = p_event_id and organization_id = p_organization_id;
end;
$$;

create or replace function public.spec38_materialize_contract_generation_delivery()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.spec32_materialize_deliveries(new.organization_id, new.id);
  return new;
end;
$$;

drop trigger if exists contract_generation_outbox_to_delivery on public.outbox_events;
create trigger contract_generation_outbox_to_delivery
  after insert on public.outbox_events
  for each row
  when (
    new.aggregate_type = 'contract'
    and new.event_type = 'contract.generation.requested'
  )
  execute function public.spec38_materialize_contract_generation_delivery();

create or replace function public.spec38_register_shared_make_contract_integration()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.status <> 'deleted' then
    insert into public.organization_integrations (
      organization_id, provider, purpose, state, configuration, masked_destination,
      created_actor_type, updated_actor_type, request_id
    ) values (
      new.id, 'make_webhook', 'contract_generation', 'active',
      jsonb_build_object(
        'display_name', 'Shared Make contract delivery',
        'endpoint_origin', 'shared://make',
        'supports_idempotency', false
      ),
      'Shared Make webhook', 'migration', 'migration', 'spec38_shared_make_bootstrap'
    )
    on conflict (organization_id, provider, purpose) where state = 'active' do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists organizations_shared_make_contract_integration on public.organizations;
create trigger organizations_shared_make_contract_integration
  after insert on public.organizations
  for each row
  execute function public.spec38_register_shared_make_contract_integration();

insert into public.organization_integrations (
  organization_id, provider, purpose, state, configuration, masked_destination,
  created_actor_type, updated_actor_type, request_id
)
select
  o.id, 'make_webhook', 'contract_generation', 'active',
  jsonb_build_object(
    'display_name', 'Shared Make contract delivery',
    'endpoint_origin', 'shared://make',
    'supports_idempotency', false
  ),
  'Shared Make webhook', 'migration', 'migration', 'spec38_shared_make_bootstrap'
from public.organizations o
where o.status <> 'deleted'
on conflict (organization_id, provider, purpose) where state = 'active' do nothing;

do $$
declare
  v_event record;
begin
  for v_event in
    select id, organization_id
    from public.outbox_events
    where aggregate_type = 'contract'
      and event_type = 'contract.generation.requested'
      and fanout_state = 'pending'
  loop
    perform public.spec32_materialize_deliveries(v_event.organization_id, v_event.id);
  end loop;
end;
$$;

revoke all on function public.spec38_materialize_contract_generation_delivery() from public, anon, authenticated;
revoke all on function public.spec38_register_shared_make_contract_integration() from public, anon, authenticated;
