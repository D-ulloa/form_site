import { createHash } from 'node:crypto';
export function sha256Hex(value) {
    return createHash('sha256').update(value).digest('hex');
}
export function validateExportManifest(manifest, expectedOrganizationId, now = new Date()) {
    if (manifest.organization_id !== expectedOrganizationId)
        throw new Error('RESTORE_ORGANIZATION_MISMATCH');
    if (manifest.schema_version < 1 || Date.parse(manifest.time_boundary) > now.getTime()
        || Date.parse(manifest.expires_at) <= now.getTime())
        throw new Error('INVALID_RESTORE_MANIFEST');
    if (!manifest.encryption_reference || Object.values(manifest.object_counts).some((count) => !Number.isSafeInteger(count) || count < 0)
        || Object.values(manifest.checksums).some((hash) => !/^[0-9a-f]{64}$/u.test(hash))) {
        throw new Error('INVALID_RESTORE_MANIFEST');
    }
}
export function decideRestoredIntent(state, evidence) {
    if (!['processing', 'sent', 'unknown'].includes(state))
        return state === 'pending' ? 'pause' : 'block';
    if (!evidence)
        return 'pause';
    if (evidence === 'provider_confirmed')
        return 'record_recovered_receipt';
    if (evidence === 'provider_missing')
        return 'resume_idempotently';
    return 'block';
}
//# sourceMappingURL=recovery.js.map