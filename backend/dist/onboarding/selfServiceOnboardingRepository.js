import { createPlatformServiceRoleClient } from '../platform/serviceRoleClient.js';
import { SelfServiceOnboardingError } from './selfServiceOnboardingTypes.js';
function row(data, error) {
    if (!error && data)
        return data;
    const message = error?.message ?? '';
    for (const code of ['IDEMPOTENCY_CONFLICT', 'ONBOARDING_IN_PROGRESS', 'FORBIDDEN']) {
        if (message.includes(code))
            throw new SelfServiceOnboardingError(code);
    }
    if (message.includes('NOT_FOUND'))
        throw new SelfServiceOnboardingError('FORBIDDEN');
    throw new SelfServiceOnboardingError('AUTH_DEPENDENCY_UNAVAILABLE');
}
export function createSelfServiceOnboardingRepository(environment = process.env, override) {
    const client = () => override ?? createPlatformServiceRoleClient(environment);
    return {
        async claim(input) {
            const { data, error } = await client().rpc('spec41_claim_self_service_onboarding', {
                p_operation_id: input.operation_id, p_email_fingerprint: input.email_fingerprint,
                p_payload_fingerprint: input.payload_fingerprint, p_display_name: input.display_name,
                p_organization_display_name: input.organization_display_name, p_organization_slug: input.organization_slug,
                p_plan_key: input.plan_key, p_locale: input.locale, p_time_zone: input.time_zone,
                p_terms_version: input.terms_version, p_auth_method: input.auth_method, p_request_id: input.request_id,
            }).single();
            return row(data, error);
        },
        async markIdentity(operationId, userId, emailFingerprint, authMethod, requestId) {
            const { data, error } = await client().rpc('spec41_mark_self_service_identity', {
                p_operation_id: operationId, p_user_id: userId, p_email_fingerprint: emailFingerprint,
                p_auth_method: authMethod, p_request_id: requestId,
            }).single();
            return row(data, error);
        },
        async reject(operationId, reasonCode, requestId) {
            const { error } = await client().rpc('spec41_reject_self_service_onboarding', {
                p_operation_id: operationId, p_reason_code: reasonCode, p_request_id: requestId,
            });
            if (error)
                row(null, error);
        },
        async complete(operationId, userId, requestId) {
            const { data, error } = await client().rpc('spec41_complete_self_service_onboarding', {
                p_operation_id: operationId, p_user_id: userId, p_request_id: requestId,
            }).single();
            return row(data, error);
        },
        async get(operationId, userId) {
            const { data, error } = await client().rpc('spec41_get_self_service_onboarding', {
                p_operation_id: operationId, p_user_id: userId,
            }).single();
            return row(data, error);
        },
    };
}
//# sourceMappingURL=selfServiceOnboardingRepository.js.map