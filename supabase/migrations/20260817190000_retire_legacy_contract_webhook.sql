-- Some production projects also installed this older generation webhook outside
-- the migration ledger. Contract generation now uses the tenant outbox worker.
-- This must precede SPEC-25, which drops the shared trigger function.
drop trigger if exists contract_entry_generate_contract_webhook on public.contract_entries;
