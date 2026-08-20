import { createOrganizationScope } from '../platform/scope.js';
import { deliveryDecision, retryDelayMs } from './deliveryDomain.js';
export function createIntegrationWorker(dependencies) {
    const now = dependencies.now ?? (() => new Date());
    return {
        async run(workerId, limit = 10, leaseSeconds = 60) {
            const deliveries = await dependencies.repository.claim(workerId, Math.min(Math.max(limit, 1), 50), leaseSeconds);
            for (const delivery of deliveries) {
                if (delivery.organization_id !== createOrganizationScope(delivery.organization_id).organization_id) {
                    await dependencies.repository.abandon(delivery, 'SCOPE_MISMATCH');
                    continue;
                }
                const context = await dependencies.repository.resolveExecutionContext(delivery);
                if (!context || context.scope.organization_id !== delivery.organization_id
                    || context.integration_id !== delivery.integration_id || context.provider !== delivery.provider
                    || new Date(delivery.lease_expires_at).getTime() <= now().getTime()) {
                    await dependencies.repository.abandon(delivery, 'INTEGRATION_CONTEXT_INVALID');
                    continue;
                }
                await dependencies.repository.start(delivery);
                let outcome;
                try {
                    const adapter = dependencies.adapters[delivery.provider];
                    outcome = delivery.event && delivery.state === 'leased'
                        ? await adapter.deliver(context, delivery)
                        : { kind: 'permanent_failure', error_code: 'INVALID_DELIVERY' };
                }
                catch {
                    // A thrown provider call cannot prove non-commit; it must reconcile.
                    outcome = { kind: 'ambiguous', error_code: 'PROVIDER_OUTCOME_UNKNOWN' };
                }
                const decision = deliveryDecision(outcome, delivery.attempt_count + 1, dependencies.max_attempts ?? 8);
                const nextAttemptAt = decision === 'retry_wait'
                    ? new Date(now().getTime() + retryDelayMs(delivery.attempt_count)).toISOString() : null;
                await dependencies.repository.finish(delivery, outcome, decision, nextAttemptAt);
            }
            return deliveries.length;
        },
    };
}
//# sourceMappingURL=worker.js.map