-- Synthetic data for the disposable SPEC-43 database only; run inside a transaction.
\ir spec40_browser_fixtures.sql
insert into public.arrangement_properties(id,organization_id,name,created_by_membership_id,idempotency_key,payload_fingerprint) values
 ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Casa Norte','30000000-0000-4000-8000-000000000001','fixture-north',repeat('a',64)),
 ('40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','Casa Sur','30000000-0000-4000-8000-000000000001','fixture-south',repeat('b',64));
insert into auth.users(id,email,email_confirmed_at) values
 ('10000000-0000-4000-8000-000000000007','different@example.test',now()),
 ('10000000-0000-4000-8000-000000000008','reader@example.test',now()),
 ('10000000-0000-4000-8000-000000000009','viewer@example.test',now());
insert into public.user_profiles(user_id,display_name,locale,time_zone)
 select id,split_part(email,'@',1),'es','America/Caracas' from auth.users where id::text > '10000000-0000-4000-8000-000000000006';
insert into public.organization_memberships(id,organization_id,user_id,role,status,joined_at,arrangement_property_id) values
 ('30000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005','inquilino','active',now(),'40000000-0000-4000-8000-000000000001'),
 ('30000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000006','inquilino','active',now(),'40000000-0000-4000-8000-000000000001'),
 ('30000000-0000-4000-8000-000000000007','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000007','inquilino','active',now(),'40000000-0000-4000-8000-000000000002'),
 ('30000000-0000-4000-8000-000000000008','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000008','member','active',now(),null),
 ('30000000-0000-4000-8000-000000000009','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000009','viewer','active',now(),null);
insert into public.arrangement_orders(id,organization_id,name,status,submission_state) values
 ('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Registro anterior','open','legacy');
