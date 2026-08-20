import type { IntegrationProvider, IntegrationPurpose, SafeIntegration } from './types.js';
export declare function validateIntegrationConfiguration(provider: IntegrationProvider, purpose: IntegrationPurpose, value: unknown): Readonly<Record<string, unknown>>;
export declare function safeIntegrationProjection(row: SafeIntegration & {
    readonly configuration?: unknown;
    readonly credential_ref?: unknown;
    readonly endpoint_url?: unknown;
}): SafeIntegration;
//# sourceMappingURL=registry.d.ts.map