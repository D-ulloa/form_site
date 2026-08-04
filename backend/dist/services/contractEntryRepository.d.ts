import { type SupabaseClient } from '@supabase/supabase-js';
import type { ContractEntryRecord, ContractRole, ContractEntryStatus, ContractSubmissionMetadata, ContractSubmissionRecord } from '../contracts/types.js';
export interface CreateContractEntryRecordInput {
    readonly id: string;
    readonly schemaId: string;
    readonly direccion: string;
    readonly createdBy: string;
    readonly createdAt: string;
    readonly userTokenHash: string;
    readonly clientTokenHash: string;
}
export interface SaveContractRoleSubmissionInput {
    readonly submissionId: string;
    readonly authorizedTokenHash: string | null;
    readonly entryId: string;
    readonly role: ContractRole;
    readonly fields: Readonly<Record<string, unknown>>;
    readonly metadata: ContractSubmissionMetadata;
    readonly submittedAt: string;
}
export interface UpdateContractRoleSubmissionInput extends SaveContractRoleSubmissionInput {
}
export interface ContractEntryRepository {
    createEntry(input: CreateContractEntryRecordInput): Promise<ContractEntryRecord>;
    findEntry(entryId: string): Promise<ContractEntryRecord | null>;
    listEntries(): Promise<readonly ContractEntryRecord[]>;
    listSubmissions(entryId: string): Promise<readonly ContractSubmissionRecord[]>;
    saveRoleSubmission(input: SaveContractRoleSubmissionInput): Promise<ContractEntryRecord>;
    updateRoleSubmission?(input: UpdateContractRoleSubmissionInput): Promise<ContractEntryRecord>;
    archiveEntry(entryId: string, archivedAt: string): Promise<ContractEntryRecord>;
    updateStatus?(entryId: string, status: ContractEntryStatus): Promise<ContractEntryRecord>;
    updateGenerationTrigger?(entryId: string): Promise<ContractEntryRecord>;
    replaceTokenHash(entryId: string, role: ContractRole, tokenHash: string, occurredAt: string): Promise<ContractEntryRecord>;
}
export declare class ContractDatabaseConfigurationError extends Error {
    constructor();
}
export declare class ContractEntryNotFoundError extends Error {
    constructor(entryId: string);
}
export declare class ContractEntryStateError extends Error {
    readonly code: 'archived' | 'already_submitted' | 'access_changed';
    constructor(code: 'archived' | 'already_submitted' | 'access_changed');
}
export declare function createContractEntryRepository(environment?: NodeJS.ProcessEnv, clientOverride?: SupabaseClient): ContractEntryRepository;
//# sourceMappingURL=contractEntryRepository.d.ts.map