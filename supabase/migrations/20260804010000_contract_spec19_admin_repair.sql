-- SPEC-19 repairs administrator grants for accounts that were created through
-- the main page before the signup trigger was deployed or while it was out of
-- sync. The grant table remains the durable source of administrator access.
create table if not exists public.contract_admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role = 'admin'),
  created_at timestamptz not null default now()
);

alter table public.contract_admin_users enable row level security;

create or replace function public.grant_contract_admin_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.raw_user_meta_data ->> 'main_page_registration' = 'true' then
    insert into public.contract_admin_users (user_id, role)
    values (new.id, 'admin')
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists contract_admin_on_signup on auth.users;
create trigger contract_admin_on_signup
after insert on auth.users
for each row execute function public.grant_contract_admin_on_signup();

insert into public.contract_admin_users (user_id, role)
select id, 'admin'
from auth.users
where raw_user_meta_data ->> 'main_page_registration' = 'true'
on conflict (user_id) do nothing;

