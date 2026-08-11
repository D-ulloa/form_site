import { type SupabaseClient } from '@supabase/supabase-js';
import type { ContractEvidenceFileField, ContractEvidenceFileReference, ContractValidationIssue } from '../contracts/types.js';
export declare const CONTRACT_EVIDENCE_FILE_MIME_TYPES: readonly ["application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp", "image/tiff"];
export declare const CONTRACT_EVIDENCE_FILE_MIME_TYPE_SET: ReadonlySet<string>;
export interface ContractEvidenceUploadDescriptor {
    readonly collection: 'garantes';
    readonly itemIndex: number;
    readonly field: ContractEvidenceFileField;
    readonly filename: string;
    readonly mimeType: string;
    readonly size: number;
}
export interface ContractEvidencePresignedUpload extends ContractEvidenceFileReference {
    readonly uploadUrl: string;
}
export interface ContractEvidenceSignedView {
    readonly viewUrl: string;
    readonly expiresAt: string;
}
export interface ContractEvidenceReferenceVerificationTarget {
    readonly path: string;
    readonly reference: ContractEvidenceFileReference;
}
export type ContractEvidenceReferenceVerifier = (targets: readonly ContractEvidenceReferenceVerificationTarget[], environment: NodeJS.ProcessEnv) => Promise<readonly ContractValidationIssue[]>;
export declare class ContractEvidenceUploadConfigurationError extends Error {
    constructor();
}
export declare class ContractEvidenceUploadValidationError extends Error {
    constructor(message: string);
}
export declare class ContractEvidenceVerificationUnavailableError extends Error {
    constructor();
}
export declare function getContractEvidenceStorageBucket(environment?: NodeJS.ProcessEnv): string;
export declare function getContractEvidenceMaxFileBytes(environment?: NodeJS.ProcessEnv): number;
export declare function sanitizeContractEvidenceFileName(rawName: string): string;
export declare function isContractEvidenceStoragePath(input: {
    readonly entryId: string;
    readonly itemIndex: number;
    readonly field: ContractEvidenceFileField;
    readonly filename: string;
    readonly storagePath: string;
}): boolean;
export declare function issueContractEvidenceUploadUrls(entryId: string, descriptors: readonly ContractEvidenceUploadDescriptor[], environment?: NodeJS.ProcessEnv, clientOverride?: SupabaseClient): Promise<readonly ContractEvidencePresignedUpload[]>;
export declare function verifyContractEvidenceReferences(targets: readonly ContractEvidenceReferenceVerificationTarget[], environment?: NodeJS.ProcessEnv, clientOverride?: SupabaseClient): Promise<readonly ContractValidationIssue[]>;
export declare function issueContractEvidenceViewUrl(reference: ContractEvidenceFileReference, environment?: NodeJS.ProcessEnv, clientOverride?: SupabaseClient, now?: () => Date): Promise<ContractEvidenceSignedView>;
//# sourceMappingURL=contractEvidenceUploadService.d.ts.map