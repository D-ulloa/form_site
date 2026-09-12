-- Disposable database only. Run in a transaction (psql -1), after SPEC-26/27/35/37/40.
insert into auth.users (id, email, email_confirmed_at)
values ('10000000-0000-4000-8000-000000000001', 'owner@example.test', now()),
  ('10000000-0000-4000-8000-000000000002', 'admin@example.test', now()),
  ('10000000-0000-4000-8000-000000000003', 'other@example.test', now()),
  ('10000000-0000-4000-8000-000000000004', 'solar-owner@example.test', now()),
  ('10000000-0000-4000-8000-000000000005', 'inquilino@example.test', null),
  ('10000000-0000-4000-8000-000000000006', 'second@example.test', null);
insert into public.user_profiles (user_id, display_name, locale, time_zone)
select id, split_part(email, '@', 1), 'es', 'America/Caracas' from auth.users;
insert into public.organizations (id, slug, display_name, plan_key, locale, time_zone, creation_source)
values ('20000000-0000-4000-8000-000000000001', 'azar', 'Azar', 'internal', 'es', 'America/Caracas', 'platform'),
  ('20000000-0000-4000-8000-000000000002', 'solar', 'Solar', 'internal', 'es', 'America/Caracas', 'platform');
insert into public.organization_settings (organization_id) select id from public.organizations;
insert into public.organization_memberships (id, organization_id, user_id, role, status, joined_at)
values ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'admin', 'active', now()),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003', 'member', 'active', now()),
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000004', 'owner', 'active', now());
