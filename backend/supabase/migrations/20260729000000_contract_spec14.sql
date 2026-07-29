-- SPEC-14 stores salary-receipt and property-guarantee evidence in a private
-- bucket. The browser receives signed upload URLs only after client-token
-- authorization and persists stable bucket/path references in contract JSON.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'contract-evidence',
  'contract-evidence',
  false,
  10485760,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp',
    'image/tiff'
  ]::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

comment on table public.contract_entries is
  'SPEC-14 two-party contract entries with private guarantor evidence references.';
