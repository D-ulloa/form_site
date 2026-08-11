import type { ContractEntryRecord, ContractEntrySummary, ContractRole, ContractSubmissionMetadata, ContractValidationIssue } from '../contracts/types.js';
import type { ContractEntryRepository } from './contractEntryRepository.js';
import { type ContractEvidenceReferenceVerifier } from './contractEvidenceUploadService.js';
export interface ContractEntryLinks {
    readonly entryId: string;
    readonly direccion: string;
    readonly adminUrl: string;
    readonly userUrl: string;
    readonly clientUrl: string;
    readonly createdAt: string;
    readonly status: 'open';
}
export interface SubmitContractEntryRoleResult {
    readonly submissionId: string;
    readonly entryId: string;
    readonly status: 'open' | 'complete';
    readonly submittedAt: string;
}
export declare class ContractRoleValidationError extends Error {
    readonly errors: readonly ContractValidationIssue[];
    constructor(errors: readonly ContractValidationIssue[]);
}
export declare class ContractPublicBaseUrlConfigurationError extends Error {
    constructor();
}
export declare function toContractEntrySummary(entry: ContractEntryRecord): ContractEntrySummary;
export declare function createContractEntry(input: {
    readonly schemaId: string;
    readonly createdBy: string;
    readonly createdByUserId?: string | null;
    readonly publicBaseUrl: string;
    readonly direccion?: string;
}, repository: ContractEntryRepository, environment?: NodeJS.ProcessEnv, dependencies?: {
    readonly now?: () => Date;
    readonly generateId?: () => string;
    readonly generateToken?: () => string;
}): Promise<ContractEntryLinks>;
export declare function submitContractEntryRole(input: {
    readonly entry: ContractEntryRecord;
    readonly role: ContractRole;
    readonly authorizedTokenHash: string | null;
    readonly fields: Readonly<Record<string, unknown>>;
    readonly metadata: ContractSubmissionMetadata;
    readonly mode?: "create" | "update";
}, repository: ContractEntryRepository, dependencies?: {
    readonly generateSubmissionId?: () => string;
    readonly environment?: NodeJS.ProcessEnv;
    readonly verifyEvidenceReferences?: ContractEvidenceReferenceVerifier;
}): Promise<SubmitContractEntryRoleResult>;
export declare function regenerateContractRoleToken(input: {
    readonly entryId: string;
    readonly role: ContractRole;
    readonly publicBaseUrl: string;
}, repository: ContractEntryRepository, environment?: NodeJS.ProcessEnv, dependencies?: {
    readonly now?: () => Date;
    readonly generateToken?: () => string;
}): Promise<{
    readonly role: ContractRole;
    readonly url: string;
}>;
//# sourceMappingURL=contractEntryService.d.ts.map