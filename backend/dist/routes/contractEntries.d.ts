import { Router } from 'express';
import type { ContractDniImageReference, ContractEvidenceFileReference } from '../contracts/types.js';
import { type ContractEntryRepository } from '../services/contractEntryRepository.js';
import { type ContractDniPresignedUpload, type ContractDniSignedView, type ContractDniUploadDescriptor } from '../services/contractDniUploadService.js';
import { type ContractEvidencePresignedUpload, type ContractEvidenceReferenceVerifier, type ContractEvidenceSignedView, type ContractEvidenceUploadDescriptor } from '../services/contractEvidenceUploadService.js';
import { type ContractSubmissionRateLimiter } from '../services/contractSubmissionRateLimiter.js';
export interface ContractEntriesRouterDependencies {
    readonly environment: NodeJS.ProcessEnv;
    readonly repository: ContractEntryRepository;
    readonly rateLimiter: ContractSubmissionRateLimiter;
    readonly now: () => Date;
    readonly issueDniUploadUrls: (entryId: string, descriptors: readonly ContractDniUploadDescriptor[], environment: NodeJS.ProcessEnv) => Promise<readonly ContractDniPresignedUpload[]>;
    readonly issueDniViewUrl: (reference: ContractDniImageReference, environment: NodeJS.ProcessEnv) => Promise<ContractDniSignedView>;
    readonly issueEvidenceUploadUrls: (entryId: string, descriptors: readonly ContractEvidenceUploadDescriptor[], environment: NodeJS.ProcessEnv) => Promise<readonly ContractEvidencePresignedUpload[]>;
    readonly issueEvidenceViewUrl: (reference: ContractEvidenceFileReference, environment: NodeJS.ProcessEnv) => Promise<ContractEvidenceSignedView>;
    readonly verifyEvidenceReferences: ContractEvidenceReferenceVerifier;
}
export declare function createContractEntriesRouter(dependencyOverrides?: Partial<ContractEntriesRouterDependencies>): Router;
declare const _default: Router;
export default _default;
//# sourceMappingURL=contractEntries.d.ts.map