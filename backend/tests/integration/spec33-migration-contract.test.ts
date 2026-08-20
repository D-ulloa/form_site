import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../../../supabase/migrations/20260819300000_spec33_commercial_extension_framework.sql', import.meta.url);

test('SPEC-33 migration installs a closed fail-closed module registry with every module off', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /create table public\.extension_module_definitions/u);
  assert.match(sql, /create table public\.organization_extension_modules/u);
  for (const moduleKey of ['billing', 'custom_domains', 'enterprise_sso', 'dedicated_isolation', 'analytics']) {
    assert.match(sql, new RegExp(`\\('${moduleKey}'\\)`, 'u'));
  }
  assert.doesNotMatch(sql, /values\s*\([^)]*'enabled'/iu);
  assert.match(sql, /default 'not_configured'/u);
});

test('SPEC-33 organization module state is tenant-owned, audited, versioned and RLS protected', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const table of ['organization_extension_modules', 'extension_module_state_events']) {
    assert.match(sql, new RegExp(`${table}[\\s\\S]+organization_id uuid not null`, 'u'));
  }
  assert.match(sql, /unique \(organization_id, module_key\)/u);
  assert.match(sql, /organization_extension_modules_tenant_state_idx/u);
  assert.match(sql, /extension_module_events_append_only/u);
  assert.match(sql, /force row level security/u);
  assert.match(sql, /revoke all on table public\.%I from public, anon, authenticated/u);
});

test('SPEC-33 only permits certified modules to become enabled and requires evidence', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /old\.state='certified' and new\.state in \('implemented','enabled','retired'\)/u);
  assert.match(sql, /v_readiness <> 'certified'.*MODULE_NOT_CERTIFIED/u);
  for (const key of ['migration', 'code', 'tests', 'documentation', 'operations', 'reviewer']) {
    assert.match(sql, new RegExp(`'${key}'`, 'u'));
  }
  assert.match(sql, /organization_extension_modules_safe/u);
});

test('SPEC-33 migration provisions no optional module or real customer/provider state', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.doesNotMatch(sql, /create table public\.(plans|organization_subscriptions|organization_domains|organization_identity_providers|analytics_facts)/iu);
  assert.doesNotMatch(sql, /stripe|saml_metadata|client_secret|certificate_private_key|customer_id|price_id/iu);
  assert.match(sql, /no price, provider account, customer domain, IdP, dedicated environment, or analytics data/iu);
});
