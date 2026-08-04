ALTER TABLE public.contract_entries
DROP CONSTRAINT IF EXISTS contract_entries_status_check;

ALTER TABLE public.contract_entries
  ADD CONSTRAINT contract_entries_status_check
    CHECK (status IN ('open', 'complete', 'archived', 'generar_contrato'));
