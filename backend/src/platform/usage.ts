import { PlatformError } from './errors.js';
import { redactTelemetry } from './redaction.js';
import type { OrganizationScope } from './scope.js';

export const USAGE_METRICS = [
  'seats.active', 'contracts.created', 'properties.created', 'storage.bytes',
  'uploads.completed', 'external_links.issued', 'invitations.issued',
  'provider.deliveries', 'provider.attempts', 'exports.completed', 'processing.operations',
] as const;
export type UsageMetricKey = typeof USAGE_METRICS[number];

export interface UsageEventInput {
  readonly idempotency_key: string;
  readonly metric_key: UsageMetricKey;
  readonly quantity: number;
  readonly unit: string;
  readonly source_type: string;
  readonly source_id?: string;
  readonly actor_type: 'member' | 'organization_api_key' | 'external_contract_link'
    | 'platform_support' | 'system_worker' | 'migration';
  readonly request_id: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
export interface UsageEventRecord extends UsageEventInput {
  readonly id: string;
  readonly organization_id: string;
  readonly occurred_at: string;
}
export interface UsageRepository {
  record(scope: OrganizationScope, input: UsageEventInput): Promise<UsageEventRecord>;
}

export function createUsageService(repository: UsageRepository) {
  return {
    record(scope: OrganizationScope, input: UsageEventInput): Promise<UsageEventRecord> {
      if (!USAGE_METRICS.includes(input.metric_key) || !Number.isSafeInteger(input.quantity)
        || input.quantity === 0 || input.idempotency_key.length < 8) {
        throw new Error('INVALID_USAGE_EVENT');
      }
      return repository.record(scope, {
        ...input,
        metadata: redactTelemetry(input.metadata ?? {}) as Readonly<Record<string, unknown>>,
      });
    },
  };
}

export interface QuotaState {
  readonly consumed: number;
  readonly reserved: number;
  readonly limit_value: number | null;
}

export function assertQuotaAvailable(state: QuotaState, quantity: number): void {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error('INVALID_QUOTA_QUANTITY');
  if (state.limit_value !== null && state.consumed + state.reserved + quantity > state.limit_value) {
    throw new PlatformError('QUOTA_EXCEEDED');
  }
}
