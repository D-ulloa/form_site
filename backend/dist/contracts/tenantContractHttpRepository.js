import { createPlatformServiceRoleClient } from '../platform/serviceRoleClient.js';
import { PlatformError } from '../platform/errors.js';
function toEntry(row) {
    return {
        id: row.id, schemaId: row.schema_id, direccion: row.direccion,
        createdBy: row.created_by, createdByUserId: row.created_by_user_id,
        createdAt: row.created_at, userTokenHash: row.user_token_hash,
        clientTokenHash: row.client_token_hash, userFilled: row.user_filled,
        clientFilled: row.client_filled, userSubmittedAt: row.user_submitted_at,
        clientSubmittedAt: row.client_submitted_at, userSubmission: row.user_submission,
        clientSubmission: row.client_submission, combinedSubmission: row.combined_submission,
        status: row.status, archivedAt: row.archived_at, version: row.version,
    };
}
function failure(error, data) {
    const message = error?.message ?? (data ? 'DATABASE_FAILURE' : 'NO_DATA');
    if (message.includes('NOT_FOUND'))
        throw new PlatformError('NOT_FOUND');
    if (message.includes('FORBIDDEN'))
        throw new PlatformError('FORBIDDEN');
    if (message.includes('VERSION_CONFLICT') || message.includes('INVALID_STATE')) {
        throw new PlatformError('VERSION_CONFLICT');
    }
    throw new PlatformError('DEPENDENCY_UNAVAILABLE');
}
export function createTenantContractHttpRepository(clientOverride, environment = process.env) {
    const client = () => clientOverride ?? createPlatformServiceRoleClient(environment);
    const find = async (scope, entryId) => {
        const { data, error } = await client().from('contract_entries').select('*')
            .eq('organization_id', scope.organization_id).eq('id', entryId).maybeSingle();
        if (error)
            failure(error);
        return data ? toEntry(data) : null;
    };
    return {
        async create(scope, actor, input) {
            const { data, error } = await client().rpc('spec29_create_tenant_contract', {
                p_organization_id: scope.organization_id, p_entry_id: input.id,
                p_schema_id: input.schema_id, p_direccion: input.direccion,
                p_created_by_user_id: actor.user_id, p_created_by_membership_id: actor.membership_id,
                p_user_token_hash: input.user_token_hash, p_client_token_hash: input.client_token_hash,
                p_request_id: actor.request_id,
            }).single();
            if (error || !data)
                failure(error, data);
            return toEntry(data);
        },
        async list(scope) {
            const { data, error } = await client().from('contract_entries').select('*')
                .eq('organization_id', scope.organization_id)
                .order('created_at', { ascending: false }).limit(1000);
            if (error)
                failure(error);
            return (data ?? []).map((row) => toEntry(row));
        },
        find,
        async submissions(scope, entryId) {
            if (!await find(scope, entryId))
                throw new PlatformError('NOT_FOUND');
            const { data, error } = await client().from('contract_submissions')
                .select('id,entry_id,role,submission,submission_meta,submitted_at')
                .eq('entry_id', entryId).order('submitted_at', { ascending: true });
            if (error)
                failure(error);
            return (data ?? []).map((row) => ({
                id: String(row.id), entryId: String(row.entry_id), role: row.role,
                submission: row.submission,
                metadata: row.submission_meta,
                submittedAt: String(row.submitted_at),
            }));
        },
        async setStatus(scope, actor, entryId, expectedVersion, status) {
            const { data, error } = await client().rpc('spec29_set_tenant_contract_status', {
                p_organization_id: scope.organization_id, p_entry_id: entryId,
                p_expected_version: expectedVersion, p_status: status,
                p_actor_user_id: actor.user_id, p_actor_membership_id: actor.membership_id,
                p_request_id: actor.request_id,
            }).single();
            if (error || !data)
                failure(error, data);
            return toEntry(data);
        },
        async archive(scope, actor, entryId, expectedVersion) {
            const { data, error } = await client().rpc('spec29_archive_tenant_contract', {
                p_organization_id: scope.organization_id, p_entry_id: entryId,
                p_expected_version: expectedVersion, p_actor_user_id: actor.user_id,
                p_actor_membership_id: actor.membership_id, p_request_id: actor.request_id,
            }).single();
            if (error || !data)
                failure(error, data);
            return toEntry(data);
        },
        async replaceToken(scope, actor, entryId, expectedVersion, role, tokenHash) {
            const { data, error } = await client().rpc('spec29_replace_tenant_contract_token', {
                p_organization_id: scope.organization_id, p_entry_id: entryId,
                p_expected_version: expectedVersion, p_role: role, p_token_hash: tokenHash,
                p_actor_user_id: actor.user_id, p_actor_membership_id: actor.membership_id,
                p_request_id: actor.request_id,
            }).single();
            if (error || !data)
                failure(error, data);
            return toEntry(data);
        },
        async appendRevision(scope, actor, entry, role, fields, idempotencyKey) {
            const { data, error } = await client().rpc("spec29_append_contract_revision", {
                p_organization_id: scope.organization_id, p_entry_id: entry.id, p_role: role,
                p_expected_version: entry.version ?? 1, p_submission: fields,
                p_reason: "administrator_update", p_idempotency_key: idempotencyKey,
                p_request_id: actor.request_id, p_actor_type: "member",
                p_actor_user_id: actor.user_id, p_actor_membership_id: actor.membership_id,
                p_external_capability_id: null, p_api_key_id: null,
                p_support_session_id: null, p_support_reason: null,
            }).single();
            if (error || !data)
                failure(error, data);
            return toEntry(data);
        },
    };
}
//# sourceMappingURL=tenantContractHttpRepository.js.map