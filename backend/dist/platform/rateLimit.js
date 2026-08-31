import { createHmac } from 'node:crypto';
import { PlatformError } from './errors.js';
export const RATE_LIMIT_POLICIES = {
    'auth.password_login': { window_seconds: 300, limit: 10, sensitive: true },
    'auth.google_handoff': { window_seconds: 300, limit: 20, sensitive: true },
    'auth.password_recovery': { window_seconds: 900, limit: 5, sensitive: true },
    'auth.email_change': { window_seconds: 3600, limit: 3, sensitive: true },
    'auth.mfa_challenge': { window_seconds: 300, limit: 10, sensitive: true },
    'identity.provision': { window_seconds: 3600, limit: 20, sensitive: true },
    'member.invitation_create': { window_seconds: 3600, limit: 50, sensitive: true },
    'member.invitation_resend': { window_seconds: 3600, limit: 20, sensitive: true },
    'member.invitation_revoke': { window_seconds: 3600, limit: 20, sensitive: true },
    'member.invitation_handoff': { window_seconds: 300, limit: 20, sensitive: true },
    'member.invitation_resolve': { window_seconds: 300, limit: 30, sensitive: true },
    'member.invitation_accept': { window_seconds: 900, limit: 20, sensitive: true },
    'member.invitation_register': { window_seconds: 900, limit: 8, sensitive: true },
    'provider.invitation_webhook': { window_seconds: 60, limit: 120, sensitive: true },
    'contract.link_validate': { window_seconds: 300, limit: 30, sensitive: true },
    'contract.link_regenerate': { window_seconds: 3600, limit: 10, sensitive: true },
    'asset.upload_presign': { window_seconds: 60, limit: 30, sensitive: true },
    'asset.upload_finalize': { window_seconds: 300, limit: 30, sensitive: true },
    'asset.signed_view': { window_seconds: 60, limit: 60, sensitive: true },
    'contract.submit': { window_seconds: 300, limit: 20, sensitive: true },
    'contract.correct': { window_seconds: 300, limit: 20, sensitive: true },
    'contract.retry': { window_seconds: 600, limit: 10, sensitive: true },
    'property.submit': { window_seconds: 300, limit: 20, sensitive: true },
    'property.correct': { window_seconds: 300, limit: 20, sensitive: true },
    'integration.connection_test': { window_seconds: 600, limit: 10, sensitive: true },
    'integration.manual_retry': { window_seconds: 600, limit: 10, sensitive: true },
    'api_key.use_failure': { window_seconds: 300, limit: 20, sensitive: true },
    'api_key.rotate': { window_seconds: 3600, limit: 5, sensitive: true },
    'organization.export': { window_seconds: 3600, limit: 5, sensitive: true },
    'organization.deletion_request': { window_seconds: 86400, limit: 3, sensitive: true },
    'support.activate': { window_seconds: 3600, limit: 5, sensitive: true },
};
export function createDistributedRateLimiter(store, pepper) {
    if (Buffer.byteLength(pepper, 'utf8') < 32)
        throw new Error('RATE_LIMIT_PEPPER_TOO_SHORT');
    return {
        async consume(input) {
            const policy = RATE_LIMIT_POLICIES[input.policy_key];
            const subject = [input.scope?.organization_id ?? 'platform', input.principal_type,
                input.principal_id, input.client_ip ?? '', input.target_id ?? ''].join('\u001f');
            const subjectHash = createHmac('sha256', pepper).update(subject).digest('hex');
            let decision;
            try {
                decision = await store.consume({
                    ...(input.scope ? { scope: input.scope } : {}),
                    policy_key: input.policy_key,
                    subject_hash: subjectHash,
                    window_seconds: policy.window_seconds,
                    limit: policy.limit,
                    cost: input.cost ?? 1,
                    now: input.now ?? new Date(),
                });
            }
            catch {
                throw new PlatformError('LIMITER_UNAVAILABLE');
            }
            if (!decision.allowed) {
                throw new PlatformError('RATE_LIMITED', { retry_after_seconds: decision.retry_after_seconds });
            }
            return decision;
        },
    };
}
//# sourceMappingURL=rateLimit.js.map