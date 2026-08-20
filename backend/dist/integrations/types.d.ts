import type { OrganizationScope } from '../platform/scope.js';
export type IntegrationProvider = 'google_drive' | 'google_sheets' | 'make_webhook';
export type IntegrationPurpose = 'property_export' | 'property_sheet' | 'property_events' | 'contract_sheet' | 'contract_generation';
export type IntegrationState = 'draft' | 'active' | 'disabled' | 'unhealthy' | 'rotating' | 'revoked';
export type DeliveryState = 'pending' | 'leased' | 'processing' | 'succeeded' | 'retry_wait' | 'reconciling' | 'unknown' | 'failed' | 'dead_letter' | 'blocked' | 'cancelled';
export interface SafeIntegration {
    readonly id: string;
    readonly organization_id: string;
    readonly provider: IntegrationProvider;
    readonly purpose: IntegrationPurpose;
    readonly state: IntegrationState;
    readonly configuration_version: number;
    readonly masked_destination: string;
    readonly health_state: 'untested' | 'healthy' | 'unhealthy' | 'expired';
    readonly health_error_code: string | null;
    readonly health_checked_at: string | null;
    readonly version: number;
}
export interface IntegrationExecutionContext {
    readonly scope: OrganizationScope;
    readonly integration_id: string;
    readonly provider: IntegrationProvider;
    readonly purpose: IntegrationPurpose;
    readonly configuration_version: number;
    readonly credential_version: number;
    readonly configuration: Readonly<Record<string, unknown>>;
}
export interface OutboxEnvelope {
    readonly event_id: string;
    readonly event_type: string;
    readonly schema_version: '1';
    readonly organization_reference: string;
    readonly resource_id: string;
    readonly resource_version: number;
    readonly occurred_at: string;
    readonly idempotency_key: string;
    readonly data: Readonly<Record<string, unknown>>;
}
export interface LeasedDelivery {
    readonly id: string;
    readonly organization_id: string;
    readonly outbox_event_id: string;
    readonly integration_id: string;
    readonly provider: IntegrationProvider;
    readonly purpose: IntegrationPurpose;
    readonly state: 'leased';
    readonly lease_token: string;
    readonly lease_expires_at: string;
    readonly attempt_count: number;
    readonly idempotency_key: string;
    readonly event: OutboxEnvelope;
}
export type ProviderOutcome = {
    readonly kind: 'succeeded';
    readonly external_id: string;
    readonly receipt_reference?: string;
} | {
    readonly kind: 'transient_failure';
    readonly error_code: string;
    readonly retry_after_seconds?: number;
} | {
    readonly kind: 'permanent_failure';
    readonly error_code: string;
} | {
    readonly kind: 'ambiguous';
    readonly error_code: string;
};
//# sourceMappingURL=types.d.ts.map