create extension if not exists pgcrypto;

create table if not exists public.contract_entries (
  id uuid primary key,
  schema_id text not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  user_token_hash text not null,
  client_token_hash text not null,
  user_filled boolean not null default false,
  client_filled boolean not null default false,
  user_submitted_at timestamptz,
  client_submitted_at timestamptz,
  user_submission jsonb,
  client_submission jsonb,
  combined_submission jsonb,
  status text not null default 'open'
    check (status in ('open', 'complete', 'archived')),
  archived_at timestamptz,
  check (length(user_token_hash) >= 32),
  check (length(client_token_hash) >= 32)
);

create table if not exists public.contract_submissions (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.contract_entries(id) on delete restrict,
  role text not null check (role in ('user', 'client')),
  submission jsonb not null,
  submission_meta jsonb not null,
  submitted_at timestamptz not null default now()
);

create table if not exists public.contract_events (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.contract_entries(id) on delete restrict,
  event_type text not null check (
    event_type in ('created', 'user_submitted', 'client_submitted', 'completed', 'archived', 'token_regenerated')
  ),
  event_data jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists contract_entries_created_at_idx
  on public.contract_entries (created_at desc);
create index if not exists contract_entries_status_idx
  on public.contract_entries (status, created_at desc);
create index if not exists contract_entries_created_by_idx
  on public.contract_entries (created_by, created_at desc);
create index if not exists contract_submissions_entry_idx
  on public.contract_submissions (entry_id, submitted_at);
create unique index if not exists contract_submissions_entry_role_once_idx
  on public.contract_submissions (entry_id, role);
create index if not exists contract_events_entry_idx
  on public.contract_events (entry_id, occurred_at);

alter table public.contract_entries enable row level security;
alter table public.contract_submissions enable row level security;
alter table public.contract_events enable row level security;

create or replace function public.log_contract_entry_created()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.contract_events (entry_id, event_type, event_data, occurred_at)
  values (new.id, 'created', jsonb_build_object('schemaId', new.schema_id), new.created_at);
  return new;
end;
$$;

drop trigger if exists contract_entry_created_event on public.contract_entries;
create trigger contract_entry_created_event
after insert on public.contract_entries
for each row execute function public.log_contract_entry_created();

create or replace function public.submit_contract_entry_role(
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
as $$
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
  if (p_role = 'user' and v_entry.user_filled)
     or (p_role = 'client' and v_entry.client_filled) then
    raise exception 'CONTRACT_ROLE_ALREADY_SUBMITTED';
  end if;

  insert into public.contract_submissions (
    id, entry_id, role, submission, submission_meta, submitted_at
  ) values (
    p_submission_id, p_entry_id, p_role, p_submission, p_submission_meta, p_submitted_at
  );

  if p_role = 'user' then
    update public.contract_entries
    set user_filled = true,
        user_submitted_at = p_submitted_at,
        user_submission = p_submission
    where id = p_entry_id
    returning * into v_entry;
  else
    update public.contract_entries
    set client_filled = true,
        client_submitted_at = p_submitted_at,
        client_submission = p_submission
    where id = p_entry_id
    returning * into v_entry;
  end if;

  insert into public.contract_events (entry_id, event_type, event_data, occurred_at)
  values (
    p_entry_id,
    case when p_role = 'user' then 'user_submitted' else 'client_submitted' end,
    jsonb_build_object('submissionId', p_submission_id),
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

    insert into public.contract_events (entry_id, event_type, event_data, occurred_at)
    values (
      p_entry_id,
      'completed',
      jsonb_build_object('lastSubmissionId', p_submission_id),
      p_submitted_at
    );
  end if;

  return next v_entry;
end;
$$;

create or replace function public.archive_contract_entry(
  p_entry_id uuid,
  p_archived_at timestamptz
)
returns setof public.contract_entries
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_entry public.contract_entries%rowtype;
begin
  select * into v_entry
  from public.contract_entries
  where id = p_entry_id
  for update;

  if not found then
    raise exception 'CONTRACT_ENTRY_NOT_FOUND';
  end if;
  if v_entry.status = 'archived' then
    return next v_entry;
    return;
  end if;

  update public.contract_entries
  set status = 'archived', archived_at = p_archived_at
  where id = p_entry_id
  returning * into v_entry;

  insert into public.contract_events (entry_id, event_type, event_data, occurred_at)
  values (p_entry_id, 'archived', '{}'::jsonb, p_archived_at);

  return next v_entry;
end;
$$;

create or replace function public.replace_contract_token_hash(
  p_entry_id uuid,
  p_role text,
  p_token_hash text,
  p_occurred_at timestamptz
)
returns setof public.contract_entries
language plpgsql
security invoker
set search_path = public
as $$
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

  if p_role = 'user' then
    update public.contract_entries
    set user_token_hash = p_token_hash
    where id = p_entry_id
    returning * into v_entry;
  else
    update public.contract_entries
    set client_token_hash = p_token_hash
    where id = p_entry_id
    returning * into v_entry;
  end if;

  insert into public.contract_events (entry_id, event_type, event_data, occurred_at)
  values (
    p_entry_id,
    'token_regenerated',
    jsonb_build_object('role', p_role),
    p_occurred_at
  );

  return next v_entry;
end;
$$;

revoke all on public.contract_entries from public, anon, authenticated;
revoke all on public.contract_submissions from public, anon, authenticated;
revoke all on public.contract_events from public, anon, authenticated;
grant select, insert, update on public.contract_entries to service_role;
grant select, insert on public.contract_submissions to service_role;
grant select, insert on public.contract_events to service_role;
revoke all on function public.log_contract_entry_created() from public, anon, authenticated;
grant execute on function public.log_contract_entry_created() to service_role;
revoke all on function public.submit_contract_entry_role(uuid, text, uuid, text, jsonb, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.submit_contract_entry_role(uuid, text, uuid, text, jsonb, jsonb, timestamptz)
  to service_role;
revoke all on function public.archive_contract_entry(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.archive_contract_entry(uuid, timestamptz)
  to service_role;
revoke all on function public.replace_contract_token_hash(uuid, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.replace_contract_token_hash(uuid, text, text, timestamptz)
  to service_role;

comment on table public.contract_entries is
  'SPEC-10 two-party contract entries. Raw access tokens are never stored.';
comment on table public.contract_submissions is
  'Immutable, one-per-role contract submission audit rows.';
comment on table public.contract_events is
  'Contract lifecycle event stream for operational audit and notifications.';
