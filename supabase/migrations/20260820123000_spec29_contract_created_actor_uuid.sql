-- SPEC-29 fix: contract_entries.created_by_user_id is a legacy text column.
-- Tenant-created rows contain UUID text, but contract_events.actor_user_id is uuid.

create or replace function public.log_contract_entry_created()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  v_membership_id uuid;
  v_request_id text;
  v_actor_user_id uuid;
begin
  if new.organization_id is not null then
    v_membership_id := nullif(current_setting('app.actor_membership_id', true), '')::uuid;
    v_request_id := coalesce(nullif(current_setting('app.request_id', true), ''), 'tenant_contract_create');
    v_actor_user_id := new.created_by_user_id::uuid;
  end if;
  insert into public.contract_events (
    organization_id, entry_id, event_type, event_data, actor_type, actor_user_id,
    actor_membership_id, request_id, aggregate_version, occurred_at
  ) values (
    new.organization_id, new.id, 'created', jsonb_build_object('schema_id', new.schema_id),
    case when new.organization_id is null then null else 'member' end,
    v_actor_user_id, v_membership_id, v_request_id, new.version, new.created_at
  );
  return new;
end;
$$;
