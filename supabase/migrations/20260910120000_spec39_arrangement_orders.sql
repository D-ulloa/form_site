-- SPEC-39: read-only arrangement dashboard. No production fixtures or lifecycle.
create table public.arrangement_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 200 and name = btrim(name)),
  status text not null default 'open'
    check (char_length(status) between 1 and 64 and status = btrim(status)),
  unique (id, organization_id)
);

create index arrangement_orders_organization_id_idx on public.arrangement_orders (organization_id, id);
create index arrangement_orders_organization_status_id_idx on public.arrangement_orders (organization_id, status, id);
alter table public.arrangement_orders enable row level security;
alter table public.arrangement_orders force row level security;
revoke all on public.arrangement_orders from public, anon, authenticated, service_role;
grant select on public.arrangement_orders to service_role;

create function public.spec39_list_arrangement_orders(
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
    where o.organization_id = p_organization_id and o.status in ('open', 'in_progress')
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

revoke all on function public.spec39_list_arrangement_orders(uuid, text, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.spec39_list_arrangement_orders(uuid, text, uuid, integer) to service_role;
