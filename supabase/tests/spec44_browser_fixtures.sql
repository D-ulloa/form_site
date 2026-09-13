-- Synthetic identities only; install once in a disposable SPEC-44 database.
do $$ begin
  if current_database() not like 'spec44%' then raise exception 'Disposable spec44 database required'; end if;
end; $$;
\ir spec40_browser_fixtures.sql
insert into auth.users(id,email,email_confirmed_at) values
 ('10000000-0000-4000-8000-000000000007','member@example.test',now()),
 ('10000000-0000-4000-8000-000000000008','viewer@example.test',now()),
 ('10000000-0000-4000-8000-000000000009','personal@example.test',now()),
 ('10000000-0000-4000-8000-000000000010','tenant@example.test',now()),
 ('10000000-0000-4000-8000-000000000011','new-personal@example.test',null),
 ('10000000-0000-4000-8000-000000000012','existing-personal@example.test',now());
insert into public.user_profiles(user_id,display_name,locale,time_zone)
 select id,split_part(email,'@',1),'es','America/Caracas' from auth.users
 where id::text>='10000000-0000-4000-8000-000000000007';
insert into public.organization_memberships(id,organization_id,user_id,role,status,joined_at) values
 ('30000000-0000-4000-8000-000000000007','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000007','member','active',now()),
 ('30000000-0000-4000-8000-000000000008','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000008','viewer','active',now());
insert into public.organization_memberships(id,organization_id,user_id,role,status,joined_at,personal_name,personal_contact_number,personal_occupation)
 values('30000000-0000-4000-8000-000000000009','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000009','personal','active',now(),'Personal existente','00123','Electricista');
insert into public.organization_memberships(id,organization_id,user_id,role,status,joined_at,arrangement_property_id)
 values('30000000-0000-4000-8000-000000000010','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000010','inquilino','active',now(),
 (public.spec42_create_arrangement_property('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Casa de prueba','spec44-property','spec44-fixtures')->>'id')::uuid);

-- Controlled Auth provider boundary, exclusively in the disposable fixture schema.
create function public.spec44_fixture_auth_user(p_id uuid,p_email text,p_activate boolean) returns void
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if current_database() not like 'spec44%' then raise exception 'Disposable database required'; end if;
 if p_activate then
   update auth.users set email_confirmed_at=now(),confirmed_at=now() where id=p_id and email=p_email;
 else
   insert into auth.users(id,email) values(p_id,p_email);
 end if;
end; $$;
revoke all on function public.spec44_fixture_auth_user(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.spec44_fixture_auth_user(uuid,text,boolean) to service_role;
