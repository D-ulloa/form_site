import type { ContractEntryRecord, ContractRole, ContractRoleSchema, ContractValidationIssue } from '../contracts/types.js';
export type ContractRoleFieldsValidationResult = {
    readonly success: true;
    readonly fields: Readonly<Record<string, unknown>>;
} | {
    readonly success: false;
    readonly errors: readonly ContractValidationIssue[];
};
export declare function validateContractRoleSubmissionFields(input: {
    readonly entry: ContractEntryRecord;
    readonly role: ContractRole;
    readonly roleSchema: ContractRoleSchema;
    readonly fields: Readonly<Record<string, unknown>>;
}, environment?: NodeJS.ProcessEnv): ContractRoleFieldsValidationResult;
//# sourceMappingURL=validateContractRoleSubmission.d.ts.map