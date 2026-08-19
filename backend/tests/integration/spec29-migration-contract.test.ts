import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../../../supabase/migrations/20260818180000_spec29_multitenant_contract_domain.sql',
  import.meta.url,
);

test('SPEC-29 migration installs explicit template, link, asset, and generation relations', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const table of [
    'global_contract_templates', 'global_contract_template_versions', 'contract_templates',
    'contract_template_versions', 'organization_contract_template_enablements',
    'contract_access_links', 'contract_link_sessions', 'contract_asset_associations',
    'contract_generation_intents',
  ]) assert.match(sql, new RegExp(`create table public\\.${table} \\(`, 'u'));
  assert.match(sql, /organization_id uuid not null references public\.organizations/u);
  assert.match(sql, /contract_access_links_one_active_role_idx/u);
  assert.match(sql, /token_hash text not null unique/u);
  assert.doesNotMatch(sql, /raw_token text/u);
});

test('SPEC-29 tenant children use composite keys and tenant-leading indexes', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /contract_entries_id_organization_unique unique \(id, organization_id\)/u);
  assert.match(sql, /foreign key \(entry_id, organization_id\)[\s\S]+references public\.contract_entries\(id, organization_id\)/u);
  assert.match(sql, /contract_entries_tenant_timeline_idx[\s\S]+\(organization_id, created_at desc, id desc\)/u);
  assert.match(sql, /contract_submissions_tenant_history_idx[\s\S]+\(organization_id, entry_id, role, revision_number desc\)/u);
  assert.match(sql, /contract_entries_assignee_membership_fk/u);
});

test('SPEC-29 history and published versions are immutable and browser access is denied', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /contract_submissions_append_only/u);
  assert.match(sql, /contract_events_append_only/u);
  assert.match(sql, /global_contract_template_versions_immutable/u);
  assert.match(sql, /IMMUTABLE_CONTRACT_HISTORY/u);
  assert.match(sql, /force row level security/u);
  assert.match(sql, /from public, anon, authenticated/u);
});

test('SPEC-29 scoped RPCs lock the tenant aggregate and enforce version and idempotency', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const fn of ['spec29_append_contract_revision', 'spec29_rotate_contract_link', 'spec29_revoke_contract_link']) {
    assert.match(sql, new RegExp(`function public\\.${fn}`, 'u'));
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn}[\\s\\S]+from public, anon, authenticated`, 'u'));
  }
  assert.match(sql, /where id = p_entry_id and organization_id = p_organization_id for update/u);
  assert.match(sql, /VERSION_CONFLICT/u);
  assert.match(sql, /IDEMPOTENCY_CONFLICT/u);
  assert.match(sql, /insert into public\.audit_events/u);
  assert.match(sql, /insert into public\.usage_events/u);
});

test('SPEC-29 explicitly leaves legacy cutover and shared asset FK to owning specs', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /SPEC-34 owns backfill/u);
  assert.match(sql, /SPEC-31 installs the shared asset table/u);
  assert.doesNotMatch(sql, /organization_id uuid not null[\s\S]{0,100}alter table public\.contract_entries/u);
});
