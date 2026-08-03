-- SPEC-17 permits PDF DNI uploads in addition to the existing image formats.
-- Keep the bucket private and aligned with the backend allowlist.
update storage.buckets
set public = false,
    allowed_mime_types = array[
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/heic',
      'image/heif'
    ]::text[]
where id = 'contract-dni';

comment on table public.contract_entries is
  'SPEC-17 contract entries with stable administration routes and required DNI policy support.';

