-- SPEC-11 stores DNI images in a private bucket. Browser uploads use short-lived
-- signed upload URLs issued only after the contract client token is verified.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'contract-dni',
  'contract-dni',
  false,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif'
  ]::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

comment on table public.contract_entries is
  'SPEC-11 two-party contract entries with repeatable client records and private DNI references.';
