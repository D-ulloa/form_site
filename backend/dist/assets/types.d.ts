import type { OrganizationScope } from '../platform/scope.js';
export type AssetCategory = 'contract_dni' | 'contract_evidence' | 'property_image' | 'property_video' | 'organization_logo' | 'export';
export type AssetState = 'pending' | 'uploaded' | 'verifying' | 'verified' | 'quarantined' | 'attached' | 'deleting' | 'deleted' | 'deletion_failed';
export type UploadSessionState = 'open' | 'finalizing' | 'consumed' | 'expired' | 'revoked' | 'failed';
export type UploadIntentState = 'pending' | 'url_issued' | 'uploaded' | 'verified' | 'consumed' | 'expired' | 'rejected';
export type AssetPrincipalType = 'member' | 'organization_api_key' | 'external_contract_link' | 'platform_support' | 'system_worker' | 'migration';
export type AssetOwnerType = 'contract_entry' | 'property_draft' | 'property_revision' | 'organization_branding' | 'export';
export interface AssetPrincipal {
    readonly type: AssetPrincipalType;
    readonly reference_id: string | null;
    readonly fingerprint: string;
}
export interface AssetUploadDescriptor {
    readonly receiver_key: string;
    readonly original_filename: string;
    readonly declared_mime: string;
    readonly declared_bytes: number;
    readonly repeatable_item_id?: string;
    readonly checksum_sha256?: string;
}
export interface InitializeAssetSessionInput {
    readonly owner_type: AssetOwnerType;
    readonly owner_id: string;
    readonly capability_key: string;
    readonly principal: AssetPrincipal;
    readonly idempotency_key: string;
    readonly request_fingerprint: string;
    readonly request_id: string;
    readonly expires_at: string;
    readonly descriptors: readonly AssetUploadDescriptor[];
}
export interface SafeAssetRecord {
    readonly id: string;
    readonly organization_id: string;
    readonly category: AssetCategory;
    readonly state: AssetState;
    readonly display_filename: string;
    readonly provider_mime: string | null;
    readonly provider_bytes: number | null;
    readonly created_at: string;
    readonly verified_at: string | null;
    readonly attached_at: string | null;
    readonly version: number;
}
export interface StoredAssetRecord extends SafeAssetRecord {
    readonly storage_provider: 'supabase';
    readonly bucket_name: string;
    readonly object_path: string;
    readonly declared_mime: string;
    readonly declared_bytes: number;
    readonly detected_mime: string | null;
    readonly checksum_algorithm: 'sha256' | null;
    readonly checksum_value: string | null;
    readonly retention_class: string;
    readonly retain_until: string | null;
    readonly legal_hold_reference: string | null;
}
export interface AssetAuthorizationContext {
    readonly scope: OrganizationScope;
    readonly principal: AssetPrincipal;
    readonly capabilities: ReadonlySet<string>;
    readonly request_id: string;
}
export interface ProviderObjectMetadata {
    readonly bucket_name: string;
    readonly object_path: string;
    readonly bytes: number;
    readonly provider_mime: string;
    readonly detected_mime?: string;
    readonly checksum_sha256?: string;
}
//# sourceMappingURL=types.d.ts.map