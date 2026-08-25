import type { SupabaseClient } from '@supabase/supabase-js';
import type { ContractEntryRecord, ContractRole, ContractSubmissionRecord } from './types.js';
import type { OrganizationScope } from '../platform/scope.js';
interface TenantActor {
    readonly user_id: string;
    readonly membership_id: string;
    readonly request_id: string;
}
export interface TenantContractHttpRepository {
    create(scope: OrganizationScope, actor: TenantActor, input: {
        readonly id: string;
        readonly schema_id: string;
        readonly direccion: string;
        readonly user_token_hash: string;
        readonly client_token_hash: string;
    }): Promise<ContractEntryRecord>;
    list(scope: OrganizationScope): Promise<readonly ContractEntryRecord[]>;
    find(scope: OrganizationScope, entryId: string): Promise<ContractEntryRecord | null>;
    submissions(scope: OrganizationScope, entryId: string): Promise<readonly ContractSubmissionRecord[]>;
    setStatus(scope: OrganizationScope, actor: TenantActor, entryId: string, expectedVersion: number, status: 'open' | 'complete' | 'generar_contrato'): Promise<ContractEntryRecord>;
    archive(scope: OrganizationScope, actor: TenantActor, entryId: string, expectedVersion: number): Promise<ContractEntryRecord>;
    replaceToken(scope: OrganizationScope, actor: TenantActor, entryId: string, expectedVersion: number, role: ContractRole, tokenHash: string): Promise<ContractEntryRecord>;
    appendRevision(scope: OrganizationScope, actor: TenantActor, entry: ContractEntryRecord, role: ContractRole, fields: Readonly<Record<string, unknown>>, idempotencyKey: string): Promise<ContractEntryRecord>;
}
export declare function createTenantContractHttpRepository(clientOverride?: SupabaseClient, environment?: NodeJS.ProcessEnv): TenantContractHttpRepository;
export {};
//# sourceMappingURL=tenantContractHttpRepository.d.ts.map