-- Only for the disposable database used by spec39-browser-server.ts.
begin;
insert into auth.users (id) values ('10000000-0000-4000-8000-000000000001'), ('10000000-0000-4000-8000-000000000002');
insert into public.organizations (id, slug, display_name, status, plan_key, locale, time_zone, creation_source)
values ('20000000-0000-4000-8000-000000000001', 'azar', 'Azar', 'active', 'internal', 'es-VE', 'America/Caracas', 'platform'),
       ('20000000-0000-4000-8000-000000000002', 'solar', 'Solar', 'active', 'internal', 'es-VE', 'America/Caracas', 'platform');
insert into public.organization_memberships (id, organization_id, user_id, role, status, joined_at)
values ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner', 'active', now()),
       ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'owner', 'active', now());
insert into public.arrangement_orders (id, organization_id, name, status)
select ('50000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  '20000000-0000-4000-8000-000000000001',
  case when i = 1 then 'Revisar ventana del dormitorio' else 'Orden ' || i end,
  case when i = 27 then 'in_progress' else 'open' end
from generate_series(1, 27) i;
insert into public.arrangement_orders (organization_id, name, status)
values ('20000000-0000-4000-8000-000000000001', 'Orden cerrada', 'closed'),
       ('20000000-0000-4000-8000-000000000002', 'Solo Solar', 'open');
commit;
