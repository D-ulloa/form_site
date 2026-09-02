-- SPEC-38 repair: pgcrypto functions are installed in the extensions schema.

create or replace function public.spec38_claim_contract_generation_deliveries(
  p_worker_id text,
  p_limit integer,
  p_lease_seconds integer
) returns table (
  id uuid, organization_id uuid, outbox_event_id uuid, integration_id uuid,
  provider text, purpose text, state text, lease_token uuid, lease_expires_at timestamptz,
  attempt_count integer, idempotency_key text, version integer, event jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if char_length(p_worker_id) not between 3 and 128
    or p_limit not between 1 and 50
    or p_lease_seconds not between 15 and 300 then
    raise exception 'INVALID_CLAIM';
  end if;

  update public.integration_deliveries d
  set state = 'unknown', safe_error_code = 'LEASE_EXPIRED',
      lease_owner = null, lease_token = null, lease_acquired_at = null,
      lease_expires_at = null, updated_at = clock_timestamp(), version = d.version + 1
  from public.outbox_events e
  where e.id = d.outbox_event_id
    and e.organization_id = d.organization_id
    and e.aggregate_type = 'contract'
    and e.event_type = 'contract.generation.requested'
    and d.provider = 'make_webhook'
    and d.purpose = 'contract_generation'
    and d.state in ('leased', 'processing')
    and d.lease_expires_at <= clock_timestamp();

  return query
  with fair as materialized (
    select d.id, d.organization_id,
      row_number() over (partition by d.organization_id order by d.next_attempt_at, d.id) as tenant_rank
    from public.integration_deliveries d
    join public.organization_integrations i
      on i.id = d.integration_id
      and i.organization_id = d.organization_id
      and i.state = 'active'
      and i.provider = 'make_webhook'
      and i.purpose = 'contract_generation'
    join public.outbox_events e
      on e.id = d.outbox_event_id
      and e.organization_id = d.organization_id
      and e.aggregate_type = 'contract'
      and e.event_type = 'contract.generation.requested'
    join public.organizations o on o.id = d.organization_id and o.status = 'active'
    where d.state in ('pending', 'retry_wait')
      and d.next_attempt_at <= clock_timestamp()
      and (d.lease_expires_at is null or d.lease_expires_at <= clock_timestamp())
  ), picked as (
    select d.id, d.organization_id
    from public.integration_deliveries d
    join fair f on f.id = d.id and f.organization_id = d.organization_id
    where d.state in ('pending', 'retry_wait')
    order by f.tenant_rank, d.organization_id, d.id
    limit p_limit
    for update of d skip locked
  ), claimed as (
    update public.integration_deliveries d
    set state = 'leased', lease_owner = p_worker_id, lease_token = extensions.gen_random_uuid(),
      lease_acquired_at = clock_timestamp(),
      lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
      attempt_count = d.attempt_count + 1, updated_at = clock_timestamp(), version = d.version + 1
    from picked p
    where d.id = p.id and d.organization_id = p.organization_id
    returning d.*
  )
  select c.id, c.organization_id, c.outbox_event_id, c.integration_id, c.provider, c.purpose,
    c.state, c.lease_token, c.lease_expires_at, c.attempt_count, c.idempotency_key, c.version,
    jsonb_build_object(
      'event_id', e.id,
      'event_type', e.event_type,
      'schema_version', e.schema_version,
      'organization_reference', c.organization_id::text,
      'resource_id', e.aggregate_id,
      'resource_version', e.aggregate_version,
      'occurred_at', e.occurred_at,
      'idempotency_key', c.idempotency_key,
      'data', e.payload
    )
  from claimed c
  join public.outbox_events e
    on e.id = c.outbox_event_id and e.organization_id = c.organization_id;
end;
$$;

revoke all on function public.spec38_claim_contract_generation_deliveries(text, integer, integer) from public, anon, authenticated;
grant execute on function public.spec38_claim_contract_generation_deliveries(text, integer, integer) to service_role;
