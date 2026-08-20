import { createPlatformServiceRoleClient } from '../platform/serviceRoleClient.js';
import { PlatformError } from '../platform/errors.js';
import { assertRowsInOrganization } from '../platform/scope.js';
function databaseFailure(error, data) {
    const message = error?.message ?? (!data ? 'NO_DATA' : 'DATABASE_FAILURE');
    if (message.includes('NOT_FOUND') || message.includes('SCOPE_MISMATCH'))
        throw new PlatformError('NOT_FOUND');
    if (message.includes('QUOTA_EXCEEDED'))
        throw new PlatformError('QUOTA_EXCEEDED');
    if (message.includes('IDEMPOTENCY_CONFLICT'))
        throw new PlatformError('IDEMPOTENCY_CONFLICT');
    if (message.includes('STATE_CONFLICT') || message.includes('SESSION_INVALID'))
        throw new PlatformError('VERSION_CONFLICT');
    throw new PlatformError('DEPENDENCY_UNAVAILABLE');
}
function assertScoped(scope, value) {
    const row = value;
    if (row.organization_id !== scope.organization_id)
        throw new Error('ORGANIZATION_SCOPE_MISMATCH');
    return row;
}
export function createAssetRepository(clientOverride, environment = process.env) {
    const client = () => clientOverride ?? createPlatformServiceRoleClient(environment);
    return {
        async initialize(scope, input) {
            const { data, error } = await client().rpc('spec31_initialize_asset_upload', {
                p_organization_id: scope.organization_id, p_owner_type: input.owner_type,
                p_owner_id: input.owner_id, p_capability_key: input.capability_key,
                p_principal_type: input.principal.type, p_principal_reference_id: input.principal.reference_id,
                p_principal_fingerprint: input.principal.fingerprint, p_idempotency_key: input.idempotency_key,
                p_request_fingerprint: input.request_fingerprint, p_request_id: input.request_id,
                p_expires_at: input.expires_at, p_descriptors: input.descriptors,
            }).single();
            if (error || !data)
                databaseFailure(error, data);
            return assertScoped(scope, data);
        },
        async finalize(scope, input) {
            const { data, error } = await client().rpc('spec31_finalize_asset_upload', {
                p_organization_id: scope.organization_id, ...input,
            }).single();
            if (error || !data)
                databaseFailure(error, data);
            return assertScoped(scope, data);
        },
        async revoke(scope, uploadSessionId, expectedVersion, requestId) {
            const { data, error } = await client().rpc('spec31_revoke_asset_upload', {
                p_organization_id: scope.organization_id, p_upload_session_id: uploadSessionId,
                p_expected_version: expectedVersion, p_request_id: requestId,
            }).single();
            if (error || !data)
                databaseFailure(error, data);
            return assertScoped(scope, data);
        },
        async findSafe(scope, assetId) {
            const { data, error } = await client().from('asset_safe_projection').select('*')
                .eq('organization_id', scope.organization_id).eq('id', assetId).maybeSingle();
            if (error)
                databaseFailure(error);
            if (!data)
                return null;
            return assertRowsInOrganization(scope, [data])[0] ?? null;
        },
        async findInternal(scope, assetId) {
            const { data, error } = await client().from('media_assets').select('*')
                .eq('organization_id', scope.organization_id).eq('id', assetId).maybeSingle();
            if (error)
                databaseFailure(error);
            return data ? assertScoped(scope, data) : null;
        },
        async listSessionIntents(scope, sessionId) {
            const { data, error } = await client().from('asset_upload_intents').select([
                'id', 'organization_id', 'upload_session_id', 'asset_id', 'receiver_key',
                'bucket_name', 'object_path', 'state', 'version',
            ].join(',')).eq('organization_id', scope.organization_id)
                .eq('upload_session_id', sessionId).order('created_at', { ascending: true });
            if (error)
                databaseFailure(error);
            return assertRowsInOrganization(scope, (data ?? []));
        },
        async recordUrlIssued(scope, sessionId, intentId, expiresAt) {
            const { data, error } = await client().rpc('spec31_record_asset_upload_issuance', {
                p_organization_id: scope.organization_id, p_upload_session_id: sessionId,
                p_upload_intent_id: intentId, p_url_expires_at: expiresAt,
            }).single();
            if (error || !data)
                databaseFailure(error, data);
            assertScoped(scope, data);
        },
    };
}
//# sourceMappingURL=assetRepository.js.map