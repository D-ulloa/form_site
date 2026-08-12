-- SPEC-22 records the authenticated database identity for newly created
-- contract entries. Existing rows intentionally remain NULL so they retain
-- legacy visibility for every authenticated administrator.
alter table public.contract_entries
  add column if not exists created_by_user_id text;

create index if not exists contract_entries_created_by_user_id_idx
  on public.contract_entries (created_by_user_id, created_at desc);

comment on column public.contract_entries.created_by_user_id is
  'SPEC-22 authenticated database user ID for post-change entries; NULL means the entry predates ownership tracking.';
