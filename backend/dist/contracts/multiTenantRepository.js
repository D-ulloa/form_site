import { createPlatformServiceRoleClient } from '../platform/serviceRoleClient.js';
import { PlatformError } from '../platform/errors.js';
import { assertRowsInOrganization } from '../platform/scope.js';
function databaseFailure(error, data) {
    const message = error?.message ?? (!data ? 'NO_DATA' : 'DATABASE_FAILURE');
    if (message.includes('NOT_FOUND'))
        throw new PlatformError('NOT_FOUND');
    if (message.includes('VERSION_CONFLICT') || message.includes('INVALID_STATE')) {
        throw new PlatformError('VERSION_CONFLICT');
    }
    if (message.includes('IDEMPOTENCY_CONFLICT'))
        throw new PlatformError('IDEMPOTENCY_CONFLICT');
    throw new PlatformError('DEPENDENCY_UNAVAILABLE');
}
function actorRpc(actor) {
    return {
        p_actor_type: actor.actor_type,
        p_actor_user_id: 'actor_user_id' in actor ? actor.actor_user_id : null,
        p_actor_membership_id: 'actor_membership_id' in actor ? actor.actor_membership_id : null,
        p_external_capability_id: 'external_capability_id' in actor ? actor.external_capability_id : null,
        p_api_key_id: 'api_key_id' in actor ? actor.api_key_id : null,
        p_support_session_id: 'support_session_id' in actor ? actor.support_session_id : null,
        p_support_reason: 'support_reason' in actor ? actor.support_reason : null,
    };
}
export function createMultiTenantContractRepository(clientOverride, environment = process.env) {
    const client = () => clientOverride ?? createPlatformServiceRoleClient(environment);
    return {
        async list(scope, input) {
            if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) {
                throw new PlatformError('INVALID_CURSOR');
            }
            let query = client().from('contract_entries').select([
                'id', 'organization_id', 'schema_id', 'direccion', 'status', 'created_by_user_id',
                'assigned_to_user_id', 'current_user_revision_id', 'current_client_revision_id',
                'template_version_id', 'global_template_version_id', 'created_at', 'updated_at', 'version',
            ].join(',')).eq('organization_id', scope.organization_id)
                .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(input.limit);
            if (input.status?.length)
                query = query.in('status', [...input.status]);
            if (input.assigned_to_user_id)
                query = query.eq('assigned_to_user_id', input.assigned_to_user_id);
            if (input.created_by_user_id)
                query = query.eq('created_by_user_id', input.created_by_user_id);
            if (input.template_version_id)
                query = query.eq('template_version_id', input.template_version_id);
            if (input.created_before)
                query = query.lt('created_at', input.created_before);
            if (input.search?.trim())
                query = query.ilike('direccion', `%${input.search.trim().replace(/[%_,()]/gu, '')}%`);
            if (input.cursor) {
                query = query.or(`created_at.lt.${input.cursor.created_at},and(created_at.eq.${input.cursor.created_at},id.lt.${input.cursor.id})`);
            }
            const { data, error } = await query;
            if (error)
                databaseFailure(error);
            return assertRowsInOrganization(scope, (data ?? []));
        },
        async findById(scope, entryId) {
            const { data, error } = await client().from('contract_entries').select('*')
                .eq('organization_id', scope.organization_id).eq('id', entryId).maybeSingle();
            if (error)
                databaseFailure(error);
            if (!data)
                return null;
            return assertRowsInOrganization(scope, [data])[0] ?? null;
        },
        async history(scope, entryId) {
            const { data, error } = await client().from('contract_submissions').select([
                'id', 'organization_id', 'entry_id', 'role', 'revision_number', 'predecessor_submission_id',
                'actor_type', 'actor_user_id', 'actor_membership_id', 'external_capability_id',
                'api_key_id', 'support_session_id', 'request_id', 'reason', 'summary', 'submitted_at',
            ].join(',')).eq('organization_id', scope.organization_id).eq('entry_id', entryId)
                .order('role', { ascending: true }).order('revision_number', { ascending: true });
            if (error)
                databaseFailure(error);
            return assertRowsInOrganization(scope, (data ?? []));
        },
        async appendRevision(scope, input) {
            const { data, error } = await client().rpc('spec29_append_contract_revision', {
                p_organization_id: scope.organization_id,
                p_entry_id: input.entry_id,
                p_role: input.role,
                p_expected_version: input.expected_version,
                p_submission: input.submission,
                p_reason: input.reason,
                p_idempotency_key: input.idempotency_key,
                p_request_id: input.request_id,
                ...actorRpc(input.actor),
            }).single();
            if (error || !data)
                databaseFailure(error, data);
            return assertRowsInOrganization(scope, [data])[0];
        },
        async rotateLink(scope, input) {
            const { data, error } = await client().rpc('spec29_rotate_contract_link', {
                p_organization_id: scope.organization_id, p_entry_id: input.entry_id, p_role: input.role,
                p_expected_version: input.expected_version, p_token_hash: input.token_hash,
                p_token_prefix: input.token_prefix, p_fingerprint: input.fingerprint,
                p_expires_at: input.expires_at, p_request_id: input.request_id,
                p_actor_membership_id: input.actor_membership_id,
            }).single();
            if (error || !data)
                databaseFailure(error, data);
            const row = data;
            if (row.organization_id !== scope.organization_id)
                throw new Error('ORGANIZATION_SCOPE_MISMATCH');
            return row;
        },
        async revokeLink(scope, input) {
            const { data, error } = await client().rpc('spec29_revoke_contract_link', {
                p_organization_id: scope.organization_id, p_entry_id: input.entry_id, p_role: input.role,
                p_expected_version: input.expected_version, p_request_id: input.request_id,
                p_actor_membership_id: input.actor_membership_id,
            }).single();
            if (error || !data)
                databaseFailure(error, data);
            return assertRowsInOrganization(scope, [data])[0];
        },
    };
}
//# sourceMappingURL=multiTenantRepository.js.map