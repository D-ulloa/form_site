import type { ContractAdminInspection, ContractDniImageReference, ContractEntryRecord, ContractEvidenceFileReference, ContractRole, ContractRoleSectionDefinition, ContractSubmissionRecord } from '../contracts/types.js';
import { type ContractDniSignedView } from './contractDniUploadService.js';
import { type ContractEvidenceSignedView } from './contractEvidenceUploadService.js';
export interface ContractAdminInspectionDependencies {
    readonly issueDniViewUrl: (reference: ContractDniImageReference, environment: NodeJS.ProcessEnv) => Promise<ContractDniSignedView>;
    readonly issueEvidenceViewUrl: (reference: ContractEvidenceFileReference, environment: NodeJS.ProcessEnv) => Promise<ContractEvidenceSignedView>;
}
export declare function getContractSubmissionRecordsByRole(entryId: string, submissions: readonly ContractSubmissionRecord[]): ReadonlyMap<ContractRole, ContractSubmissionRecord>;
export declare function hydrateContractRoleValuesWithDownloadUrls(entry: ContractEntryRecord, role: ContractRole, sections: readonly ContractRoleSectionDefinition[], values: Readonly<Record<string, unknown>>, environment: NodeJS.ProcessEnv, dependencyOverrides?: Partial<ContractAdminInspectionDependencies>): Promise<Readonly<Record<string, unknown>>>;
export declare function buildContractAdminInspection(entry: ContractEntryRecord, submissions: readonly ContractSubmissionRecord[], environment?: NodeJS.ProcessEnv, dependencyOverrides?: Partial<ContractAdminInspectionDependencies>): Promise<ContractAdminInspection>;
//# sourceMappingURL=contractAdminInspectionService.d.ts.map