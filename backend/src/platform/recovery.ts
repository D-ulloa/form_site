import { createHash } from 'node:crypto';

export interface OrganizationExportManifest {
  readonly organization_id: string;
  readonly export_id: string;
  readonly schema_version: number;
  readonly time_boundary: string;
  readonly included_data_classes: readonly string[];
  readonly excluded_data_classes: readonly string[];
  readonly object_counts: Readonly<Record<string, number>>;
  readonly checksums: Readonly<Record<string, string>>;
  readonly encryption_reference: string;
  readonly expires_at: string;
}

export function sha256Hex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function validateExportManifest(
  manifest: OrganizationExportManifest,
  expectedOrganizationId: string,
  now = new Date(),
): void {
  if (manifest.organization_id !== expectedOrganizationId) throw new Error('RESTORE_ORGANIZATION_MISMATCH');
  if (manifest.schema_version < 1 || Date.parse(manifest.time_boundary) > now.getTime()
    || Date.parse(manifest.expires_at) <= now.getTime()) throw new Error('INVALID_RESTORE_MANIFEST');
  if (!manifest.encryption_reference || Object.values(manifest.object_counts).some((count) => !Number.isSafeInteger(count) || count < 0)
    || Object.values(manifest.checksums).some((hash) => !/^[0-9a-f]{64}$/u.test(hash))) {
    throw new Error('INVALID_RESTORE_MANIFEST');
  }
}

export type ExternalIntentState = 'pending' | 'processing' | 'sent' | 'unknown' | 'failed';
export type ReconciliationEvidence = 'provider_confirmed' | 'provider_missing' | 'provider_unknown';

export function decideRestoredIntent(
  state: ExternalIntentState,
  evidence?: ReconciliationEvidence,
): 'pause' | 'record_recovered_receipt' | 'resume_idempotently' | 'block' {
  if (!['processing', 'sent', 'unknown'].includes(state)) return state === 'pending' ? 'pause' : 'block';
  if (!evidence) return 'pause';
  if (evidence === 'provider_confirmed') return 'record_recovered_receipt';
  if (evidence === 'provider_missing') return 'resume_idempotently';
  return 'block';
}
