import path from 'node:path';
import { PlatformError } from '../platform/errors.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export function sanitizeAssetFilename(rawName) {
    const safe = path.basename(rawName).normalize('NFKD').replace(/[\u0300-\u036f]/gu, '')
        .replace(/[^a-zA-Z0-9._-]/gu, '_').replace(/^[._-]+/u, '').slice(0, 120);
    return safe || 'file';
}
export function buildOrganizationAssetPath(input) {
    if (![input.organization_id, input.owner_id, input.asset_id].every((value) => UUID.test(value))) {
        throw new Error('INVALID_ASSET_PATH_SCOPE');
    }
    return `organizations/${input.organization_id}/${input.domain}/${input.owner_id}/${input.asset_id}/${sanitizeAssetFilename(input.original_filename)}`;
}
const ASSET_TRANSITIONS = Object.freeze({
    pending: new Set(['uploaded', 'quarantined', 'deleting']),
    uploaded: new Set(['verifying', 'quarantined', 'deleting']),
    verifying: new Set(['verified', 'quarantined', 'uploaded']),
    verified: new Set(['attached', 'quarantined', 'deleting']),
    quarantined: new Set(['verifying', 'deleting']),
    attached: new Set(['quarantined', 'deleting']),
    deleting: new Set(['deleted', 'deletion_failed']),
    deleted: new Set(),
    deletion_failed: new Set(['deleting']),
});
export function assertAssetTransition(current, next) {
    if (current === next)
        return;
    if (!ASSET_TRANSITIONS[current].has(next))
        throw new PlatformError('VERSION_CONFLICT');
}
export function assertUploadSessionUsable(state, expiresAt, now = new Date()) {
    if (state !== 'open' || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= now.getTime()) {
        throw new PlatformError('VERSION_CONFLICT');
    }
}
export function assertUploadIntentUsable(state) {
    if (state !== 'pending' && state !== 'url_issued' && state !== 'uploaded') {
        throw new PlatformError('VERSION_CONFLICT');
    }
}
export function verifyProviderObject(asset, metadata, policy) {
    const compatibleDetectedType = !policy.require_content_detection
        || (metadata.detected_mime !== undefined && policy.allowed_mime_types.has(metadata.detected_mime));
    if (asset.bucket_name !== metadata.bucket_name || asset.object_path !== metadata.object_path
        || metadata.bytes !== asset.declared_bytes || metadata.bytes > policy.maximum_bytes
        || !policy.allowed_mime_types.has(metadata.provider_mime) || !compatibleDetectedType
        || (policy.require_checksum && metadata.checksum_sha256 !== asset.checksum_value)) {
        throw new Error('ASSET_METADATA_MISMATCH');
    }
}
export function authorizeAssetRead(context, asset, ownerVisible) {
    if (asset.organization_id !== context.scope.organization_id || !ownerVisible)
        throw new PlatformError('NOT_FOUND');
    if (!context.capabilities.has('files.read'))
        throw new PlatformError('FORBIDDEN');
    if (asset.state === 'quarantined' || asset.state === 'deleting' || asset.state === 'deleted'
        || asset.state === 'deletion_failed')
        throw new PlatformError('NOT_FOUND');
    if (asset.state !== 'attached' && asset.state !== 'verified')
        throw new PlatformError('NOT_FOUND');
}
export function canPhysicallyDeleteAsset(asset, associated, now = new Date()) {
    if (associated || asset.legal_hold_reference !== null)
        return false;
    if (asset.state !== 'deleting' && asset.state !== 'deletion_failed')
        return false;
    return asset.retain_until === null || Date.parse(asset.retain_until) <= now.getTime();
}
export function validatePropertyAssetLayout(items) {
    const ids = new Set();
    const orders = new Set();
    let covers = 0;
    for (const item of items) {
        if (ids.has(item.asset_id) || orders.has(item.sort_order) || item.sort_order < 0)
            throw new Error('INVALID_MEDIA_ORDER');
        if (item.is_cover && item.role !== 'image')
            throw new Error('INVALID_MEDIA_COVER');
        ids.add(item.asset_id);
        orders.add(item.sort_order);
        covers += Number(item.is_cover);
    }
    if (covers > 1)
        throw new Error('INVALID_MEDIA_COVER');
}
export function safeContentDisposition(policy, filename) {
    const disposition = policy.download_disposition;
    return `${disposition}; filename="${sanitizeAssetFilename(filename).replace(/["\\]/gu, '_')}"`;
}
//# sourceMappingURL=assetDomain.js.map