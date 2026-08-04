create extension if not exists pg_net with schema extensions;

create or replace function public.enviar_a_make_condicional()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if NEW.generar_contrato_trigger is true
    and (OLD.generar_contrato_trigger is null or OLD.generar_contrato_trigger = false) then
    begin
      perform net.http_post(
        url := 'https://hook.eu1.make.com/TU_URL_DE_MAKE_AQUI',
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := jsonb_build_object(
          'type', TG_OP,
          'table', TG_TABLE_NAME,
          'schema', TG_TABLE_SCHEMA,
          'record', to_jsonb(NEW)
        )
      );
    exception when others then
      raise warning 'enviar_a_make_condicional failed for contract entry %: %', NEW.id, sqlerrm;
    end;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trigger_make_condicional on public.contract_entries;
create trigger trigger_make_condicional
  after update of generar_contrato_trigger on public.contract_entries
  for each row
  when (
    NEW.generar_contrato_trigger is true
    and coalesce(OLD.generar_contrato_trigger, false) = false
  )
  execute function public.enviar_a_make_condicional();

revoke all on function public.enviar_a_make_condicional() from public, anon, authenticated;
grant execute on function public.enviar_a_make_condicional() to service_role;
