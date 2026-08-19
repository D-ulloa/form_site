import type { SupabaseClient } from '@supabase/supabase-js';
import { type OrganizationScope } from '../platform/scope.js';
import type { ContractActor } from './multiTenantDomain.js';
export interface TenantContractEntry {
    readonly id: string;
    readonly organization_id: string;
    readonly schema_id: string;
    readonly direccion: string | null;
    readonly status: 'open' | 'complete' | 'generar_contrato' | 'archived';
    readonly created_by_user_id: string | null;
    readonly assigned_to_user_id: string | null;
    readonly current_user_revision_id: string | null;
    readonly current_client_revision_id: string | null;
    readonly template_version_id: string | null;
    readonly global_template_version_id: string | null;
    readonly created_at: string;
    readonly updated_at: string;
    readonly version: number;
}
export interface ContractListQuery {
    readonly status?: readonly TenantContractEntry['status'][];
    readonly search?: string;
    readonly assigned_to_user_id?: string;
    readonly created_by_user_id?: string;
    readonly template_version_id?: string;
    readonly created_before?: string;
    readonly cursor?: {
        readonly created_at: string;
        readonly id: string;
    };
    readonly limit: number;
}
export interface AppendRevisionInput {
    readonly entry_id: string;
    readonly role: 'user' | 'client';
    readonly expected_version: number;
    readonly submission: Readonly<Record<string, unknown>>;
    readonly reason: string;
    readonly idempotency_key: string;
    readonly request_id: string;
    readonly actor: ContractActor;
}
export interface RotateLinkInput {
    readonly entry_id: string;
    readonly role: 'user' | 'client';
    readonly expected_version: number;
    readonly token_hash: string;
    readonly token_prefix: string;
    readonly fingerprint: string;
    readonly expires_at: string;
    readonly request_id: string;
    readonly actor_membership_id: string;
}
export interface MultiTenantContractRepository {
    list(scope: OrganizationScope, query: ContractListQuery): Promise<readonly TenantContractEntry[]>;
    findById(scope: OrganizationScope, entryId: string): Promise<TenantContractEntry | null>;
    history(scope: OrganizationScope, entryId: string): Promise<readonly Readonly<Record<string, unknown>>[]>;
    appendRevision(scope: OrganizationScope, input: AppendRevisionInput): Promise<TenantContractEntry>;
    rotateLink(scope: OrganizationScope, input: RotateLinkInput): Promise<Readonly<Record<string, unknown>>>;
    revokeLink(scope: OrganizationScope, input: {
        readonly entry_id: string;
        readonly role: 'user' | 'client';
        readonly expected_version: number;
        readonly request_id: string;
        readonly actor_membership_id: string;
    }): Promise<TenantContractEntry>;
}
export declare function createMultiTenantContractRepository(clientOverride?: SupabaseClient, environment?: NodeJS.ProcessEnv): MultiTenantContractRepository;
//# sourceMappingURL=multiTenantRepository.d.ts.map