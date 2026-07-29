import type { ContractSchemaConfig, ValidatedContractSubmission } from '../contracts/types.js';
import { type ContractAuditLog } from './contractAuditLogger.js';
import { type ContractSheetAppendInput, type ContractSheetAppendResult } from './googleSheetsService.js';
import { type ContractMetricsRecorder } from './contractMetrics.js';
export interface ContractSubmissionReceipt {
    readonly submissionId: string;
    readonly timestamp: string;
    readonly sheetUrl: string;
    readonly appendedRange: string;
    readonly auditUrl: string;
}
export interface CreateContractSubmissionInput {
    readonly submission: ValidatedContractSubmission;
    readonly config: ContractSchemaConfig;
    readonly requestId: string;
    readonly ip: string;
}
export interface CreateContractSubmissionDependencies {
    readonly appendRow: (input: ContractSheetAppendInput) => Promise<ContractSheetAppendResult>;
    readonly persistAudit: (audit: ContractAuditLog) => Promise<void>;
    readonly now: () => Date;
    readonly monotonicNow: () => number;
    readonly generateSubmissionId: (timestamp: Date) => string;
    readonly metrics: ContractMetricsRecorder;
}
export declare class ContractAuditPersistenceError extends Error {
    readonly retriable = false;
    readonly appendCompleted = true;
    readonly submissionId: string;
    readonly requestId: string;
    constructor(args: {
        submissionId: string;
        requestId: string;
        cause: unknown;
    });
}
export declare function generateContractSubmissionId(timestamp: Date): string;
export declare function createContractSubmission(input: CreateContractSubmissionInput, overrides?: Partial<CreateContractSubmissionDependencies>): Promise<ContractSubmissionReceipt>;
//# sourceMappingURL=createContractSubmission.d.ts.map