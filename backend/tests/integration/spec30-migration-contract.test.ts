import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../../../supabase/migrations/20260818200000_spec30_multitenant_property_domain.sql',
  import.meta.url,
);

test('SPEC-30 migration installs the complete durable property aggregate', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const table of [
    'properties', 'property_drafts', 'property_revisions', 'property_revision_assets',
    'property_submission_runs', 'property_submission_run_steps',
    'property_provider_intents', 'property_events',
  ]) assert.match(sql, new RegExp(`create table public\\.${table} \\(`, 'u'));
  assert.match(sql, /unique \(organization_id, property_code\)/u);
  assert.match(sql, /property_revision_assets_one_cover_idx/u);
  assert.match(sql, /property_revisions_tenant_history_idx[\s\S]+\(organization_id, property_id, revision_number desc\)/u);
});

test('SPEC-30 every child relation uses composite organization ownership', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /unique \(id, organization_id\)/u);
  for (const parent of ['properties', 'property_drafts', 'property_revisions', 'property_submission_runs']) {
    assert.match(sql, new RegExp(
      `references public\\.${parent}\\(id, organization_id(?:, [^)]+)?\\)`, 'u',
    ));
  }
  assert.match(sql, /properties_current_revision_fk[\s\S]+current_revision_id, organization_id/u);
  assert.match(sql, /properties_open_draft_fk[\s\S]+open_draft_id, organization_id/u);
  assert.match(sql, /current_revision_id, organization_id, id[\s\S]+property_revisions\(id, organization_id, property_id\)/u);
  assert.match(sql, /open_draft_id, organization_id, id[\s\S]+property_drafts\(id, organization_id, property_id\)/u);
  assert.match(sql, /organization_id, assigned_to_user_id[\s\S]+organization_memberships/u);
});

test('SPEC-30 history is immutable and browser roles have no direct access', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /property_revisions_append_only/u);
  assert.match(sql, /property_revision_assets_append_only/u);
  assert.match(sql, /property_events_append_only/u);
  assert.match(sql, /IMMUTABLE_PROPERTY_HISTORY/u);
  assert.match(sql, /force row level security/u);
  assert.match(sql, /revoke all on table public\.%I from public, anon, authenticated/u);
});

test('SPEC-30 scoped RPCs lock aggregates and enforce concurrency and idempotency', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const fn of [
    'spec30_create_property_draft', 'spec30_update_property_draft',
    'spec30_finalize_property_draft', 'spec30_create_edit_draft',
    'spec30_transition_property', 'spec30_retry_property_run',
  ]) {
    assert.match(sql, new RegExp(`function public\\.${fn}`, 'u'));
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn}[\\s\\S]+from public, anon, authenticated`, 'u'));
  }
  assert.match(sql, /organization_id = p_organization_id for update/u);
  assert.match(sql, /VERSION_CONFLICT/u);
  assert.match(sql, /DRAFT_STATE_CONFLICT/u);
  assert.match(sql, /IDEMPOTENCY_CONFLICT/u);
  assert.match(sql, /pg_advisory_xact_lock/u);
});

test('SPEC-30 finalization atomically writes projections, evidence, and no provider call', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /insert into public\.property_revisions/u);
  assert.match(sql, /insert into public\.property_submission_runs/u);
  assert.match(sql, /insert into public\.property_provider_intents/u);
  assert.match(sql, /insert into public\.property_events/u);
  assert.match(sql, /insert into public\.audit_events/u);
  assert.match(sql, /insert into public\.usage_events/u);
  assert.doesNotMatch(sql, /http_post|net\.http|googleapis|make_webhook/iu);
  assert.match(sql, /SPEC-34 owns legacy adjudication/u);
  assert.match(sql, /shared asset FK follows SPEC-31/u);
});
