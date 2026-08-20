import { createOrganizationScope } from '../platform/scope.js';
import { deliveryDecision, retryDelayMs } from './deliveryDomain.js';
import type { IntegrationExecutionContext, IntegrationProvider, LeasedDelivery, ProviderOutcome } from './types.js';

export interface DeliveryRepository {
  claim(workerId: string, limit: number, leaseSeconds: number): Promise<readonly LeasedDelivery[]>;
  resolveExecutionContext(delivery: LeasedDelivery): Promise<IntegrationExecutionContext | null>;
  start(delivery: LeasedDelivery): Promise<void>;
  finish(delivery: LeasedDelivery, outcome: ProviderOutcome, decision: ReturnType<typeof deliveryDecision>,
    nextAttemptAt: string | null): Promise<void>;
  abandon(delivery: LeasedDelivery, safeErrorCode: string): Promise<void>;
}

export interface ProviderAdapter {
  deliver(context: IntegrationExecutionContext, delivery: LeasedDelivery): Promise<ProviderOutcome>;
  reconcile(context: IntegrationExecutionContext, delivery: LeasedDelivery): Promise<ProviderOutcome>;
}

export function createIntegrationWorker(dependencies: {
  readonly repository: DeliveryRepository;
  readonly adapters: Readonly<Record<IntegrationProvider, ProviderAdapter>>;
  readonly max_attempts?: number;
  readonly now?: () => Date;
}) {
  const now = dependencies.now ?? (() => new Date());
  return {
    async run(workerId: string, limit = 10, leaseSeconds = 60): Promise<number> {
      const deliveries = await dependencies.repository.claim(workerId, Math.min(Math.max(limit, 1), 50), leaseSeconds);
      for (const delivery of deliveries) {
        if (delivery.organization_id !== createOrganizationScope(delivery.organization_id).organization_id) {
          await dependencies.repository.abandon(delivery, 'SCOPE_MISMATCH'); continue;
        }
        const context = await dependencies.repository.resolveExecutionContext(delivery);
        if (!context || context.scope.organization_id !== delivery.organization_id
          || context.integration_id !== delivery.integration_id || context.provider !== delivery.provider
          || new Date(delivery.lease_expires_at).getTime() <= now().getTime()) {
          await dependencies.repository.abandon(delivery, 'INTEGRATION_CONTEXT_INVALID'); continue;
        }
        await dependencies.repository.start(delivery);
        let outcome: ProviderOutcome;
        try {
          const adapter = dependencies.adapters[delivery.provider];
          outcome = delivery.event && delivery.state === 'leased'
            ? await adapter.deliver(context, delivery)
            : { kind: 'permanent_failure', error_code: 'INVALID_DELIVERY' };
        } catch {
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
