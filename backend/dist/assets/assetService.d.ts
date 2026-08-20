import type { OrganizationScope } from '../platform/scope.js';
import { type AssetReceiverPolicy } from './receiverPolicy.js';
import type { PrivateAssetStorageAdapter } from './storageAdapter.js';
import type { AssetAuthorizationContext, AssetUploadDescriptor, InitializeAssetSessionInput, StoredAssetRecord } from './types.js';
interface UploadIntentRecord {
    readonly id: string;
    readonly organization_id: string;
    readonly asset_id: string;
    readonly receiver_key: string;
    readonly bucket_name: string;
    readonly object_path: string;
    readonly state: string;
}
export interface AssetServiceRepository {
    initialize(scope: OrganizationScope, input: InitializeAssetSessionInput & {
        readonly descriptors: readonly (AssetUploadDescriptor & {
            readonly bucket_name: string;
            readonly category: string;
            readonly retention_class: string;
        })[];
    }): Promise<Readonly<Record<string, unknown>>>;
    listSessionIntents(scope: OrganizationScope, sessionId: string): Promise<readonly UploadIntentRecord[]>;
    recordUrlIssued(scope: OrganizationScope, sessionId: string, intentId: string, expiresAt: string): Promise<void>;
    findInternal(scope: OrganizationScope, assetId: string): Promise<StoredAssetRecord | null>;
    finalize(scope: OrganizationScope, input: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>>;
}
export declare function createAssetService(dependencies: {
    readonly repository: AssetServiceRepository;
    readonly storage: PrivateAssetStorageAdapter;
    readonly authorizeOwner: (context: AssetAuthorizationContext, ownerType: string, ownerId: string) => Promise<boolean>;
    readonly reserveQuota: (scope: OrganizationScope, bytes: number, idempotencyKey: string) => Promise<void>;
    readonly detectContent?: (bucketName: string, objectPath: string) => Promise<{
        readonly detected_mime: string;
        readonly checksum_sha256?: string;
    }>;
    readonly registry?: ReadonlyMap<string, AssetReceiverPolicy>;
}): {
    initialize(context: AssetAuthorizationContext, input: Omit<InitializeAssetSessionInput, "principal" | "request_fingerprint" | "request_id">): Promise<Readonly<{
        upload_session_id: string;
        expires_at: unknown;
        uploads: Readonly<{
            asset_id: string;
            upload_intent_id: string;
            upload_url: string;
            required_headers: Readonly<Record<string, string>>;
        }>[];
    }>>;
    finalize(context: AssetAuthorizationContext, input: {
        readonly upload_session_id: string;
        readonly expected_version: number;
        readonly asset_ids: readonly string[];
    }): Promise<Readonly<Record<string, unknown>>>;
    issueView(context: AssetAuthorizationContext, assetId: string, ownerVisible: boolean): Promise<{
        readonly signed_url: string;
        readonly expires_at: string;
    }>;
};
export {};
//# sourceMappingURL=assetService.d.ts.map