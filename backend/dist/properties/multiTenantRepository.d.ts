import type { SupabaseClient } from '@supabase/supabase-js';
import { type OrganizationScope } from '../platform/scope.js';
export interface TenantProperty {
    readonly id: string;
    readonly organization_id: string;
    readonly property_code: string;
    readonly status: 'draft' | 'active' | 'archived';
    readonly current_revision_id: string | null;
    readonly open_draft_id: string | null;
    readonly created_by_user_id: string;
    readonly updated_by_user_id: string;
    readonly assigned_to_user_id: string | null;
    readonly created_at: string;
    readonly updated_at: string;
    readonly archived_at: string | null;
    readonly version: number;
}
export interface PropertyListQuery {
    readonly status?: readonly TenantProperty['status'][];
    readonly search?: string;
    readonly created_by_user_id?: string;
    readonly assigned_to_user_id?: string;
    readonly cursor?: {
        readonly updated_at: string;
        readonly id: string;
    };
    readonly limit: number;
}
export interface PropertyDraftActor {
    readonly user_id: string;
    readonly membership_id: string;
    readonly name: string;
    readonly email: string;
}
export interface CreatePropertyDraftInput {
    readonly schema_version: string;
    readonly partial_payload: Readonly<Record<string, unknown>>;
    readonly idempotency_key: string;
    readonly request_fingerprint: string;
    readonly request_id: string;
    readonly expires_at: string;
    readonly actor: PropertyDraftActor;
}
export declare function createMultiTenantPropertyRepository(clientOverride?: SupabaseClient, environment?: NodeJS.ProcessEnv): {
    createDraft(scope: OrganizationScope, input: CreatePropertyDraftInput): Promise<Readonly<Record<string, unknown>>>;
    updateDraft(scope: OrganizationScope, input: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>>;
    createEditDraft(scope: OrganizationScope, input: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>>;
    list(scope: OrganizationScope, input: PropertyListQuery): Promise<readonly TenantProperty[]>;
    findById(scope: OrganizationScope, propertyId: string): Promise<TenantProperty | null>;
    history(scope: OrganizationScope, propertyId: string): Promise<readonly (Record<string, unknown> & {
        organization_id: string;
    })[]>;
    submitDraft(scope: OrganizationScope, input: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>>;
    transition(scope: OrganizationScope, input: Readonly<Record<string, unknown>>): Promise<TenantProperty>;
    retryRun(scope: OrganizationScope, input: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>>;
    findRun(scope: OrganizationScope, runId: string): Promise<Readonly<Record<string, unknown>> | null>;
    runSteps(scope: OrganizationScope, runId: string): Promise<readonly (Record<string, unknown> & {
        organization_id: string;
    })[]>;
};
//# sourceMappingURL=multiTenantRepository.d.ts.map