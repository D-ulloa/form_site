import type { ContractFieldValue, ContractSchemaDefinition, MappedContractSheetRow } from '../contracts/types.js';
export declare const REDACTED_CONTRACT_VALUE = "[REDACTED]";
export interface ContractAuditInput {
    readonly schema: ContractSchemaDefinition;
    readonly fields: Readonly<Record<string, ContractFieldValue>>;
    readonly mappedRow: MappedContractSheetRow;
    readonly spreadsheetId: string;
    readonly sheetName: string;
    readonly appendedRange: string;
    readonly submissionId: string;
    readonly userId: string;
    readonly timestamp: string;
    readonly requestId: string;
    readonly ip: string;
}
export interface ContractAuditLog {
    readonly schemaId: string;
    readonly contractType: string;
    readonly fields: Readonly<Record<string, ContractFieldValue>>;
    readonly mappedRow: readonly ContractFieldValue[];
    readonly spreadsheetId: string;
    readonly sheetName: string;
    readonly appendedRange: string;
    readonly submissionId: string;
    readonly userId: string;
    readonly timestamp: string;
    readonly requestId: string;
    readonly ip: string;
}
export interface ContractAuditStorageOptions {
    readonly logsDirectory?: string;
}
export declare function resolveContractAuditLogsDirectory(options?: ContractAuditStorageOptions, environment?: NodeJS.ProcessEnv): string;
export declare class InvalidContractSubmissionIdError extends Error {
    constructor();
}
export declare class ContractAuditAlreadyExistsError extends Error {
    constructor(submissionId: string, cause: unknown);
}
export declare class ContractAuditNotFoundError extends Error {
    constructor(submissionId: string, cause: unknown);
}
export declare class ContractAuditIntegrityError extends Error {
    constructor(submissionId: string, cause?: unknown);
}
export declare function buildContractAuditLog(input: ContractAuditInput): ContractAuditLog;
export declare function persistContractAuditLog(audit: ContractAuditLog, options?: ContractAuditStorageOptions): Promise<void>;
export declare function readContractAuditLog(submissionId: string, options?: ContractAuditStorageOptions): Promise<ContractAuditLog>;
//# sourceMappingURL=contractAuditLogger.d.ts.map