-- Run with psql -v ON_ERROR_STOP=1 in a disposable database, after SPEC-26 and SPEC-39.
-- Fixtures and privilege probes are rolled back even after a successful run.
begin;
insert into public.organizations (id, slug, display_name, status, plan_key, locale, time_zone, creation_source)
values ('39000000-0000-4000-8000-000000000001', 'spec39-a', 'SPEC-39 A', 'active', 'internal', 'es-VE', 'America/Caracas', 'platform'),
       ('39000000-0000-4000-8000-000000000002', 'spec39-b', 'SPEC-39 B', 'active', 'internal', 'es-VE', 'America/Caracas', 'platform');
insert into public.arrangement_orders (id, organization_id, name, status)
select ('39000000-0000-4000-9000-' || lpad(i::text, 12, '0'))::uuid,
  '39000000-0000-4000-8000-000000000001', 'Ventana', case when i = 27 then 'in_progress' else 'open' end
from generate_series(1, 27) i;
insert into public.arrangement_orders (organization_id, name, status)
values ('39000000-0000-4000-8000-000000000001', 'Terminada', 'closed'),
       ('39000000-0000-4000-8000-000000000001', 'Desconocida', 'unrecognized'),
       ('39000000-0000-4000-8000-000000000002', 'Solo B', 'open');

do $$
begin
  assert (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'arrangement_orders') = 4;
  assert (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.arrangement_orders'::regclass);
  assert not exists (select from pg_policies where schemaname = 'public' and tablename = 'arrangement_orders');
  assert not has_table_privilege('anon', 'public.arrangement_orders', 'SELECT');
  assert not has_table_privilege('authenticated', 'public.arrangement_orders', 'SELECT');
  assert not has_table_privilege('service_role', 'public.arrangement_orders', 'INSERT');
  assert not has_table_privilege('service_role', 'public.arrangement_orders', 'UPDATE');
  assert not has_table_privilege('service_role', 'public.arrangement_orders', 'DELETE');
  assert not has_function_privilege('anon', 'public.spec39_list_arrangement_orders(uuid,text,uuid,integer)', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.spec39_list_arrangement_orders(uuid,text,uuid,integer)', 'EXECUTE');
  begin
    insert into public.arrangement_orders (organization_id, name) values ('39000000-0000-4000-8000-000000000099', 'No organization');
    raise exception 'Expected foreign key rejection';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.arrangement_orders (organization_id, name) values ('39000000-0000-4000-8000-000000000001', ' ');
    raise exception 'Expected blank name rejection';
  exception when check_violation then null; end;
  begin
    insert into public.arrangement_orders (organization_id, name, status) values ('39000000-0000-4000-8000-000000000001', 'Test', '');
    raise exception 'Expected blank status rejection';
  exception when check_violation then null; end;
end;
$$;

set local role anon;
do $$
begin
  begin
    perform * from public.arrangement_orders;
    raise exception 'Anonymous table access succeeded';
  exception when insufficient_privilege then null; end;
  begin
    perform public.spec39_list_arrangement_orders('39000000-0000-4000-8000-000000000001');
    raise exception 'Anonymous RPC access succeeded';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
set local role authenticated;
do $$
begin
  begin
    perform * from public.arrangement_orders;
    raise exception 'Browser table access succeeded';
  exception when insufficient_privilege then null; end;
  begin
    perform public.spec39_list_arrangement_orders('39000000-0000-4000-8000-000000000001');
    raise exception 'Browser RPC access succeeded';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;

set local role service_role;
do $$
declare a uuid := '39000000-0000-4000-8000-000000000001';
  b uuid := '39000000-0000-4000-8000-000000000002';
  first_page jsonb; second_page jsonb; filtered jsonb; other_org jsonb;
begin
  first_page := public.spec39_list_arrangement_orders(a);
  assert first_page->>'organization_id' = a::text;
  assert jsonb_array_length(first_page->'items') = 25;
  assert first_page->'available_statuses' = '["in_progress", "open"]'::jsonb;
  assert first_page->>'next_after_id' = '39000000-0000-4000-9000-000000000025';
  second_page := public.spec39_list_arrangement_orders(a, null, (first_page->>'next_after_id')::uuid);
  assert jsonb_array_length(second_page->'items') = 2;
  assert second_page->>'next_after_id' is null;
  assert second_page->'items'->0->>'id' = '39000000-0000-4000-9000-000000000026';
  assert second_page->'items'->1->>'id' = '39000000-0000-4000-9000-000000000027';
  assert not exists (select from jsonb_array_elements(first_page->'items' || second_page->'items') item
    where item->>'organization_id' <> a::text or item->>'status' not in ('open', 'in_progress'));
  filtered := public.spec39_list_arrangement_orders(a, 'in_progress');
  assert jsonb_array_length(filtered->'items') = 1;
  assert filtered->'items'->0->>'status' = 'in_progress';
  assert filtered->'available_statuses' = first_page->'available_statuses';
  assert public.spec39_list_arrangement_orders(a, 'closed')->'items' = '[]'::jsonb;
  assert public.spec39_list_arrangement_orders(a, 'unknown')->'items' = '[]'::jsonb;
  other_org := public.spec39_list_arrangement_orders(b);
  assert jsonb_array_length(other_org->'items') = 1;
  assert other_org->'items'->0->>'name' = 'Solo B';
  assert other_org->'available_statuses' = '["open"]'::jsonb;
  assert public.spec39_list_arrangement_orders('39000000-0000-4000-8000-000000000099')->'items' = '[]'::jsonb;
  begin
    perform public.spec39_list_arrangement_orders(null);
    raise exception 'Null scope succeeded';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.spec39_list_arrangement_orders(a, null, null, 101);
    raise exception 'Unbounded page succeeded';
  exception when invalid_parameter_value then null; end;
  begin
    insert into public.arrangement_orders (organization_id, name) values (a, 'Not allowed');
    raise exception 'Service write succeeded';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
rollback;
