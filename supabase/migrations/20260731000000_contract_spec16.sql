-- SPEC-16 adds a human-facing contract identifier and preserves editable current
-- role payloads while retaining each correction as a new audit row.
alter table public.contract_entries
  add column if not exists direccion text;

update public.contract_entries
set direccion = 'Sin direccion'
where direccion is null or btrim(direccion) = '';

drop index if exists public.contract_submissions_entry_role_once_idx;
create index if not exists contract_submissions_entry_role_submitted_idx
  on public.contract_submissions (entry_id, role, submitted_at desc);

create or replace function public.update_contract_entry_role(
  p_submission_id uuid,
  p_authorized_token_hash text,
  p_entry_id uuid,
  p_role text,
  p_submission jsonb,
  p_submission_meta jsonb,
  p_submitted_at timestamptz
)
returns setof public.contract_entries
language plpgsql
security invoker
set search_path = public
as $sql$
declare
  v_entry public.contract_entries%rowtype;
begin
  if p_role not in ('user', 'client') then
    raise exception 'CONTRACT_ROLE_INVALID';
  end if;

  select * into v_entry
  from public.contract_entries
  where id = p_entry_id
  for update;

  if not found then
    raise exception 'CONTRACT_ENTRY_NOT_FOUND';
  end if;
  if v_entry.status = 'archived' then
    raise exception 'CONTRACT_ENTRY_ARCHIVED';
  end if;
  if p_authorized_token_hash is not null and (
    (p_role = 'user' and v_entry.user_token_hash is distinct from p_authorized_token_hash)
    or (p_role = 'client' and v_entry.client_token_hash is distinct from p_authorized_token_hash)
  ) then
    raise exception 'CONTRACT_ACCESS_CHANGED';
  end if;
  if (p_role = 'user' and not v_entry.user_filled)
     or (p_role = 'client' and not v_entry.client_filled) then
    raise exception 'CONTRACT_ROLE_NOT_SUBMITTED';
  end if;

  insert into public.contract_submissions (
    id, entry_id, role, submission, submission_meta, submitted_at
  ) values (
    p_submission_id, p_entry_id, p_role, p_submission, p_submission_meta, p_submitted_at
  );

  if p_role = 'user' then
    update public.contract_entries
    set user_submission = p_submission,
        user_submitted_at = p_submitted_at
    where id = p_entry_id
    returning * into v_entry;
  else
    update public.contract_entries
    set client_submission = p_submission,
        client_submitted_at = p_submitted_at
    where id = p_entry_id
    returning * into v_entry;
  end if;

  insert into public.contract_events (entry_id, event_type, event_data, occurred_at)
  values (
    p_entry_id,
    case when p_role = 'user' then 'user_submitted' else 'client_submitted' end,
    jsonb_build_object('submissionId', p_submission_id, 'edited', true),
    p_submitted_at
  );

  if v_entry.user_filled and v_entry.client_filled then
    update public.contract_entries
    set status = 'complete',
        combined_submission = jsonb_build_object(
          'entryId', v_entry.id,
          'schemaId', v_entry.schema_id,
          'completedAt', p_submitted_at,
          'user', v_entry.user_submission,
          'client', v_entry.client_submission
        )
    where id = p_entry_id
    returning * into v_entry;
  end if;

  return next v_entry;
end;
$sql$;

revoke all on function public.update_contract_entry_role(uuid, text, uuid, text, jsonb, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.update_contract_entry_role(uuid, text, uuid, text, jsonb, jsonb, timestamptz)
  to service_role;

comment on table public.contract_entries is
  'SPEC-16 contract entries with human-facing identifiers and editable current role payloads.';
comment on table public.contract_submissions is
  'Role submission audit history; the newest row for a role is the current payload.';
