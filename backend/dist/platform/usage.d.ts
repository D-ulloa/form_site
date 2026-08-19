import type { OrganizationScope } from './scope.js';
export declare const USAGE_METRICS: readonly ["seats.active", "contracts.created", "properties.created", "storage.bytes", "uploads.completed", "external_links.issued", "invitations.issued", "provider.deliveries", "provider.attempts", "exports.completed", "processing.operations"];
export type UsageMetricKey = typeof USAGE_METRICS[number];
export interface UsageEventInput {
    readonly idempotency_key: string;
    readonly metric_key: UsageMetricKey;
    readonly quantity: number;
    readonly unit: string;
    readonly source_type: string;
    readonly source_id?: string;
    readonly actor_type: 'member' | 'organization_api_key' | 'external_contract_link' | 'platform_support' | 'system_worker' | 'migration';
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
export declare function createUsageService(repository: UsageRepository): {
    record(scope: OrganizationScope, input: UsageEventInput): Promise<UsageEventRecord>;
};
export interface QuotaState {
    readonly consumed: number;
    readonly reserved: number;
    readonly limit_value: number | null;
}
export declare function assertQuotaAvailable(state: QuotaState, quantity: number): void;
//# sourceMappingURL=usage.d.ts.map