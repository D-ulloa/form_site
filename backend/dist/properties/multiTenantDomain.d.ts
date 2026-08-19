import type { OrganizationRequestContext } from '../contracts/multiTenantDomain.js';
export type PropertyStatus = 'draft' | 'active' | 'archived';
export type PropertyRunState = 'queued' | 'processing' | 'succeeded' | 'partially_failed' | 'failed' | 'blocked' | 'cancelled';
export declare function requirePropertyCapability(context: OrganizationRequestContext, capability: 'properties.read' | 'properties.write' | 'properties.manage'): void;
export declare function canSeeProperty(context: OrganizationRequestContext, property: {
    readonly organization_id: string;
    readonly created_by_user_id: string;
    readonly assigned_to_user_id: string | null;
}): boolean;
export declare function assertPropertyVersion(actual: number, expected: number): void;
export declare function assertPropertyLifecycle(current: PropertyStatus, next: PropertyStatus): void;
export declare function canRetryPropertyRun(run: {
    readonly state: PropertyRunState;
    readonly retriable: boolean;
}): boolean;
export declare function propertyRequestFingerprint(action: string, payload: unknown): string;
export declare function assertIdempotentReplay(storedFingerprint: string, action: string, payload: unknown): void;
export declare function redactPropertyChangeSummary(previous: Readonly<Record<string, unknown>>, next: Readonly<Record<string, unknown>>): Readonly<{
    changed_fields: readonly string[];
    changed_field_count: number;
}>;
//# sourceMappingURL=multiTenantDomain.d.ts.map