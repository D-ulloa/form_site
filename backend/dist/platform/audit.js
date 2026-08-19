import { PlatformError } from './errors.js';
import { redactTelemetry } from './redaction.js';
export const AUDIT_ACTOR_TYPES = [
    'member', 'organization_api_key', 'external_contract_link',
    'platform_support', 'system_worker', 'migration',
];
function validateAudit(input) {
    if (!/^[a-z][a-z0-9_.]{2,127}$/u.test(input.action)
        || !/^[a-z][a-z0-9_]{0,63}$/u.test(input.target_type)
        || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(input.request_id)
        || (input.changed_fields?.length ?? 0) > 64)
        throw new Error('INVALID_AUDIT_EVENT');
    if (input.actor.actor_type === 'member' && !input.actor.actor_membership_id)
        throw new Error('INVALID_AUDIT_ACTOR');
    if (input.actor.actor_type === 'platform_support'
        && (!input.actor.support_session_id || !input.actor.support_reason))
        throw new Error('INVALID_AUDIT_ACTOR');
    const metadata = redactTelemetry(input.metadata ?? {});
    if (Buffer.byteLength(JSON.stringify(metadata), 'utf8') > 4096)
        throw new Error('AUDIT_METADATA_TOO_LARGE');
    return { ...input, metadata };
}
export function createAuditService(repository) {
    return {
        async appendRequired(scope, input) {
            try {
                await repository.append(scope, validateAudit(input));
            }
            catch (error) {
                if (error instanceof Error && error.message.startsWith('INVALID_AUDIT'))
                    throw error;
                throw new PlatformError('AUDIT_UNAVAILABLE');
            }
        },
    };
}
//# sourceMappingURL=audit.js.map