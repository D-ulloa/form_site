-- SPEC-25 forward-only containment. Historical migrations remain unchanged.

drop trigger if exists contract_admin_on_signup on auth.users;
drop function if exists public.grant_contract_admin_on_signup();

drop trigger if exists trigger_make_condicional on public.contract_entries;
drop function if exists public.enviar_a_make_condicional();
