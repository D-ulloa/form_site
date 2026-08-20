import type { AssetReceiverPolicy } from './receiverPolicy.js';
import type { AssetAuthorizationContext, AssetState, ProviderObjectMetadata, StoredAssetRecord, UploadIntentState, UploadSessionState } from './types.js';
export declare function sanitizeAssetFilename(rawName: string): string;
export declare function buildOrganizationAssetPath(input: {
    readonly organization_id: string;
    readonly domain: 'contracts' | 'properties' | 'branding' | 'exports';
    readonly owner_id: string;
    readonly asset_id: string;
    readonly original_filename: string;
}): string;
export declare function assertAssetTransition(current: AssetState, next: AssetState): void;
export declare function assertUploadSessionUsable(state: UploadSessionState, expiresAt: string, now?: Date): void;
export declare function assertUploadIntentUsable(state: UploadIntentState): void;
export declare function verifyProviderObject(asset: StoredAssetRecord, metadata: ProviderObjectMetadata, policy: AssetReceiverPolicy): void;
export declare function authorizeAssetRead(context: AssetAuthorizationContext, asset: Pick<StoredAssetRecord, 'organization_id' | 'state'>, ownerVisible: boolean): void;
export declare function canPhysicallyDeleteAsset(asset: Pick<StoredAssetRecord, 'state' | 'legal_hold_reference' | 'retain_until'>, associated: boolean, now?: Date): boolean;
export declare function validatePropertyAssetLayout(items: readonly {
    readonly asset_id: string;
    readonly role: 'image' | 'video';
    readonly sort_order: number;
    readonly is_cover: boolean;
}[]): void;
export declare function safeContentDisposition(policy: AssetReceiverPolicy, filename: string): string;
//# sourceMappingURL=assetDomain.d.ts.map