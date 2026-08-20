import type { AssetCategory, AssetPrincipalType, AssetUploadDescriptor } from './types.js';
export interface AssetReceiverPolicy {
    readonly key: string;
    readonly version: number;
    readonly category: AssetCategory;
    readonly bucket: string;
    readonly allowed_principals: ReadonlySet<AssetPrincipalType>;
    readonly allowed_mime_types: ReadonlySet<string>;
    readonly maximum_bytes: number;
    readonly maximum_count: number;
    readonly retention_class: string;
    readonly download_disposition: 'inline' | 'attachment';
    readonly require_checksum: boolean;
    readonly require_content_detection: boolean;
}
export declare function createAssetReceiverRegistry(environment?: NodeJS.ProcessEnv): ReadonlyMap<string, AssetReceiverPolicy>;
export declare function requireReceiverPolicy(receiverKey: string, registry: ReadonlyMap<string, AssetReceiverPolicy>): AssetReceiverPolicy;
export declare function validateAssetUploadBatch(descriptors: readonly AssetUploadDescriptor[], principalType: AssetPrincipalType, registry: ReadonlyMap<string, AssetReceiverPolicy>): readonly AssetReceiverPolicy[];
//# sourceMappingURL=receiverPolicy.d.ts.map