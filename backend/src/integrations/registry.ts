import { z } from 'zod';
import type { IntegrationProvider, IntegrationPurpose, SafeIntegration } from './types.js';

const opaqueId = z.string().min(3).max(256).regex(/^[A-Za-z0-9._:-]+$/u);
const base = z.object({ display_name: z.string().trim().min(1).max(80) }).strict();

const schemas = {
  google_drive: base.extend({ parent_folder_id: opaqueId, shared_drive_id: opaqueId.optional() }).strict(),
  google_sheets: base.extend({ spreadsheet_id: opaqueId, tab_name: z.string().trim().min(1).max(100),
    schema_version: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/u) }).strict(),
  make_webhook: base.extend({ endpoint_origin: z.union([z.string().url().max(2048), z.literal('shared://make')]),
    supports_idempotency: z.boolean(), receipt_endpoint_origin: z.string().url().max(2048).optional() }).strict(),
} satisfies Record<IntegrationProvider, z.ZodType>;

const purposes: Readonly<Record<IntegrationProvider, ReadonlySet<IntegrationPurpose>>> = {
  google_drive: new Set(['property_export']),
  google_sheets: new Set(['property_sheet', 'contract_sheet']),
  make_webhook: new Set(['property_events', 'contract_generation']),
};

export function validateIntegrationConfiguration(
  provider: IntegrationProvider,
  purpose: IntegrationPurpose,
  value: unknown,
): Readonly<Record<string, unknown>> {
  if (!purposes[provider].has(purpose)) throw new Error('INVALID_INTEGRATION_CONFIGURATION');
  return Object.freeze(schemas[provider].parse(value) as Record<string, unknown>);
}

export function safeIntegrationProjection(row: SafeIntegration & {
  readonly configuration?: unknown; readonly credential_ref?: unknown; readonly endpoint_url?: unknown;
}): SafeIntegration {
  return Object.freeze({
    id: row.id, organization_id: row.organization_id, provider: row.provider, purpose: row.purpose,
    state: row.state, configuration_version: row.configuration_version,
    masked_destination: row.masked_destination, health_state: row.health_state,
    health_error_code: row.health_error_code, health_checked_at: row.health_checked_at, version: row.version,
  });
}
