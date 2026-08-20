import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../../../supabase/migrations/20260819000000_spec31_private_asset_platform.sql', import.meta.url,
);

test('SPEC-31 installs the durable private asset aggregate and safe projection', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const table of [
    'media_assets', 'asset_upload_sessions', 'asset_upload_intents',
    'organization_branding_assets', 'export_assets', 'asset_deletion_receipts',
    'asset_migration_mappings',
  ]) assert.match(sql, new RegExp(`create table public\\.${table} \\(`, 'u'));
  assert.match(sql, /create or replace view public\.asset_safe_projection/u);
  assert.match(sql, /'property-media', 'property-media', false/u);
  assert.match(sql, /'organization-branding', 'organization-branding', false/u);
  assert.doesNotMatch(sql.match(/create or replace view public\.asset_safe_projection[\s\S]+?from public\.media_assets;/u)?.[0] ?? '',
    /bucket_name|object_path|checksum_value/u);
});

test('SPEC-31 enforces tenant ownership, private grants, and explicit domain associations', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /object_path like \('organizations\/' \|\| organization_id::text \|\| '\/%'\)/u);
  assert.match(sql, /contract_asset_associations_asset_tenant_fk[\s\S]+\(asset_id, organization_id\)[\s\S]+media_assets\(id, organization_id\)/u);
  assert.match(sql, /property_revision_assets_asset_tenant_fk[\s\S]+\(asset_id, organization_id\)[\s\S]+media_assets\(id, organization_id\)/u);
  assert.match(sql, /organization_settings_logo_asset_tenant_fk/u);
  assert.match(sql, /force row level security/u);
  assert.match(sql, /revoke all on table public\.%I from public, anon, authenticated/u);
  assert.match(sql, /grant select, insert, update on public\.media_assets[\s\S]+to service_role/u);
});

test('SPEC-31 upload RPCs are scoped, idempotent, single-use, and provider-free', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const fn of [
    'spec31_initialize_asset_upload', 'spec31_record_asset_upload_issuance',
    'spec31_finalize_asset_upload', 'spec31_revoke_asset_upload',
  ]) {
    assert.match(sql, new RegExp(`function public\\.${fn}`, 'u'));
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn}[\\s\\S]+from public, anon, authenticated`, 'u'));
  }
  assert.match(sql, /IDEMPOTENCY_CONFLICT/u);
  assert.match(sql, /ASSET_METADATA_MISMATCH/u);
  assert.match(sql, /state = 'consumed'/u);
  assert.match(sql, /insert into public\.audit_events/u);
  assert.match(sql, /insert into public\.usage_events/u);
  assert.doesNotMatch(sql, /createSignedUploadUrl|createSignedUrl|http_post|net\.http/iu);
});

test('SPEC-31 makes historical association and deletion evidence append-only', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /IMMUTABLE_ASSET_HISTORY/u);
  for (const trigger of [
    'contract_asset_associations_append_only', 'property_revision_assets_spec31_append_only',
    'asset_deletion_receipts_append_only', 'asset_migration_mappings_append_only',
  ]) assert.match(sql, new RegExp(trigger, 'u'));
  assert.match(sql, /decision in \('mapped_azar', 'quarantined', 'missing', 'duplicate'\)/u);
  assert.match(sql, /SPEC-34 owns production execution/u);
});
