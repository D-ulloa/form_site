import { type SupabaseClient } from '@supabase/supabase-js';
import type { ContractDniImageReference, ContractDniImageSlot, ContractRepeatableCollection } from '../contracts/types.js';
export declare const CONTRACT_DNI_IMAGE_MIME_TYPES: Set<string>;
export interface ContractDniUploadDescriptor {
    readonly collection: ContractRepeatableCollection;
    readonly itemIndex: number;
    readonly slot: ContractDniImageSlot;
    readonly originalName: string;
    readonly mimeType: string;
    readonly sizeBytes: number;
}
export interface ContractDniPresignedUpload extends ContractDniImageReference {
    readonly uploadUrl: string;
}
export interface ContractDniSignedView {
    readonly viewUrl: string;
    readonly expiresAt: string;
}
export declare class ContractDniUploadConfigurationError extends Error {
    constructor();
}
export declare class ContractDniUploadValidationError extends Error {
    constructor(message: string);
}
export declare function getContractDniStorageBucket(environment?: NodeJS.ProcessEnv): string;
export declare function getContractDniMaxImageBytes(environment?: NodeJS.ProcessEnv): number;
export declare function issueContractDniUploadUrls(entryId: string, descriptors: readonly ContractDniUploadDescriptor[], environment?: NodeJS.ProcessEnv, clientOverride?: SupabaseClient): Promise<readonly ContractDniPresignedUpload[]>;
export declare function issueContractDniViewUrl(reference: ContractDniImageReference, environment?: NodeJS.ProcessEnv, clientOverride?: SupabaseClient, now?: () => Date): Promise<ContractDniSignedView>;
//# sourceMappingURL=contractDniUploadService.d.ts.map