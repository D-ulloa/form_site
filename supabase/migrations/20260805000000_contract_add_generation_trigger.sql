ALTER TABLE public.contract_entries
  ADD COLUMN IF NOT EXISTS generar_contrato_trigger boolean NOT NULL DEFAULT false;
