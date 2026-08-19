import { createPlatformServiceRoleClient } from '../platform/serviceRoleClient.js';
import { PlatformError } from '../platform/errors.js';
import { assertRowsInOrganization } from '../platform/scope.js';
function assertScopedRow(scope, data) {
    const row = data;
    if (row.organization_id !== scope.organization_id)
        throw new Error('ORGANIZATION_SCOPE_MISMATCH');
    return row;
}
function databaseFailure(error, data) {
    const message = error?.message ?? (!data ? 'NO_DATA' : 'DATABASE_FAILURE');
    if (message.includes('NOT_FOUND'))
        throw new PlatformError('NOT_FOUND');
    if (message.includes('VERSION_CONFLICT') || message.includes('DRAFT_STATE_CONFLICT'))
        throw new PlatformError('VERSION_CONFLICT');
    if (message.includes('IDEMPOTENCY_CONFLICT'))
        throw new PlatformError('IDEMPOTENCY_CONFLICT');
    throw new PlatformError('DEPENDENCY_UNAVAILABLE');
}
export function createMultiTenantPropertyRepository(clientOverride, environment = process.env) {
    const client = () => clientOverride ?? createPlatformServiceRoleClient(environment);
    return {
        async createDraft(scope, input) {
            const { data, error } = await client().rpc('spec30_create_property_draft', {
                p_organization_id: scope.organization_id,
                p_schema_version: input.schema_version,
                p_partial_payload: input.partial_payload,
                p_idempotency_key: input.idempotency_key,
                p_request_fingerprint: input.request_fingerprint,
                p_request_id: input.request_id,
                p_actor_user_id: input.actor.user_id,
                p_actor_membership_id: input.actor.membership_id,
                p_actor_name: input.actor.name,
                p_actor_email: input.actor.email,
                p_expires_at: input.expires_at,
            }).single();
            if (error || !data)
                databaseFailure(error, data);
            return assertScopedRow(scope, data);
        },
        async updateDraft(scope, input) {
            const { data, error } = await client().rpc('spec30_update_property_draft', {
                p_organization_id: scope.organization_id, ...input,
            }).single();
            if (error || !data)
                databaseFailure(error, data);
            return assertScopedRow(scope, data);
        },
        async createEditDraft(scope, input) {
            const { data, error } = await client().rpc('spec30_create_edit_draft', {
                p_organization_id: scope.organization_id, ...input,
            }).single();
            if (error || !data)
                databaseFailure(error, data);
            return assertScopedRow(scope, data);
        },
        async list(scope, input) {
            if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100)
                throw new PlatformError('INVALID_CURSOR');
            let query = client().from('properties').select('*').eq('organization_id', scope.organization_id)
                .order('updated_at', { ascending: false }).order('id', { ascending: false }).limit(input.limit);
            if (input.status?.length)
                query = query.in('status', [...input.status]);
            if (input.created_by_user_id)
                query = query.eq('created_by_user_id', input.created_by_user_id);
            if (input.assigned_to_user_id)
                query = query.eq('assigned_to_user_id', input.assigned_to_user_id);
            if (input.search?.trim())
                query = query.ilike('search_text', `%${input.search.trim().replace(/[%_,()]/gu, '')}%`);
            if (input.cursor)
                query = query.or(`updated_at.lt.${input.cursor.updated_at},and(updated_at.eq.${input.cursor.updated_at},id.lt.${input.cursor.id})`);
            const { data, error } = await query;
            if (error)
                databaseFailure(error);
            return assertRowsInOrganization(scope, (data ?? []));
        },
        async findById(scope, propertyId) {
            const { data, error } = await client().from('properties').select('*')
                .eq('organization_id', scope.organization_id).eq('id', propertyId).maybeSingle();
            if (error)
                databaseFailure(error);
            if (!data)
                return null;
            return assertRowsInOrganization(scope, [data])[0] ?? null;
        },
        async history(scope, propertyId) {
            const { data, error } = await client().from('property_revisions').select([
                'id', 'organization_id', 'property_id', 'revision_number', 'previous_revision_id',
                'schema_version', 'change_kind', 'change_summary', 'created_by_actor_type',
                'created_by_user_id', 'actor_name_snapshot', 'created_at', 'request_id',
            ].join(',')).eq('organization_id', scope.organization_id).eq('property_id', propertyId)
                .order('revision_number', { ascending: false });
            if (error)
                databaseFailure(error);
            return assertRowsInOrganization(scope, (data ?? []));
        },
        async submitDraft(scope, input) {
            const { data, error } = await client().rpc('spec30_finalize_property_draft', {
                p_organization_id: scope.organization_id, ...input,
            }).single();
            if (error || !data)
                databaseFailure(error, data);
            return assertScopedRow(scope, data);
        },
        async transition(scope, input) {
            const { data, error } = await client().rpc('spec30_transition_property', {
                p_organization_id: scope.organization_id, ...input,
            }).single();
            if (error || !data)
                databaseFailure(error, data);
            return assertRowsInOrganization(scope, [data])[0];
        },
        async retryRun(scope, input) {
            const { data, error } = await client().rpc('spec30_retry_property_run', {
                p_organization_id: scope.organization_id, ...input,
            }).single();
            if (error || !data)
                databaseFailure(error, data);
            return assertScopedRow(scope, data);
        },
        async findRun(scope, runId) {
            const { data, error } = await client().from('property_submission_runs').select([
                'id', 'organization_id', 'property_id', 'revision_id', 'retry_of_run_id',
                'run_kind', 'state', 'attempt_count', 'available_at', 'started_at', 'finished_at',
                'error_code', 'error_summary', 'retriable', 'request_id', 'created_at', 'updated_at', 'version',
            ].join(',')).eq('organization_id', scope.organization_id).eq('id', runId).maybeSingle();
            if (error)
                databaseFailure(error);
            if (!data)
                return null;
            return assertScopedRow(scope, data);
        },
        async runSteps(scope, runId) {
            const { data, error } = await client().from('property_submission_run_steps').select([
                'id', 'organization_id', 'run_id', 'property_id', 'revision_id', 'step_key',
                'state', 'attempt_count', 'safe_external_id', 'error_code', 'error_summary',
                'retriable', 'started_at', 'finished_at', 'version',
            ].join(',')).eq('organization_id', scope.organization_id).eq('run_id', runId)
                .order('created_at', { ascending: true });
            if (error)
                databaseFailure(error);
            return assertRowsInOrganization(scope, (data ?? []));
        },
    };
}
//# sourceMappingURL=multiTenantRepository.js.map