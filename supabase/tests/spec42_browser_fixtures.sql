-- Disposable upgrade fixture: apply AFTER the foundation migration and BEFORE enforcement.
-- These are genuine pre-cutover rows. No legacy flag or disabled guard exists in the application.
\ir spec40_browser_fixtures.sql
insert into auth.users(id,email,email_confirmed_at) values
  ('10000000-0000-4000-8000-000000000007','legacy@example.test',now()),
  ('10000000-0000-4000-8000-000000000008','existing@example.test',now()),
  ('10000000-0000-4000-8000-000000000009','reader@example.test',now()),
  ('10000000-0000-4000-8000-000000000010','viewer@example.test',now()),
  ('10000000-0000-4000-8000-000000000011','legacy-invite@example.test',null);
insert into public.user_profiles(user_id,display_name,locale,time_zone)
  select id,split_part(email,'@',1),'es','America/Caracas' from auth.users where id::text > '10000000-0000-4000-8000-000000000006';
insert into public.organization_memberships(id,organization_id,user_id,role,status,joined_at) values
  ('30000000-0000-4000-8000-000000000007','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000007','inquilino','active',now()),
  ('30000000-0000-4000-8000-000000000009','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000009','member','active',now()),
  ('30000000-0000-4000-8000-000000000010','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000010','viewer','active',now());
select public.spec37_create_manual_invitation('90000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001','legacy-invite@example.test','inquilino',
  encode(extensions.digest(repeat('l',43),'sha256'),'hex'),'spec42legacy',now()+interval '1 day',
  '30000000-0000-4000-8000-000000000001','spec42-legacy-invite','10000000-0000-4000-8000-000000000011',true);
select public.spec37_create_invitation_handoff(repeat('l',43),repeat('e',64),repeat('f',64),repeat('a',64),now()+interval '10 minutes');
insert into public.arrangement_orders(organization_id,name,status) values
  ('20000000-0000-4000-8000-000000000001','Ventana','open'),
  ('20000000-0000-4000-8000-000000000001','Puerta','in_progress'),
  ('20000000-0000-4000-8000-000000000002','Orden Solar','open');
