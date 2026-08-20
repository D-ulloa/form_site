import { deliveryDecision } from './deliveryDomain.js';
import type { IntegrationExecutionContext, IntegrationProvider, LeasedDelivery, ProviderOutcome } from './types.js';
export interface DeliveryRepository {
    claim(workerId: string, limit: number, leaseSeconds: number): Promise<readonly LeasedDelivery[]>;
    resolveExecutionContext(delivery: LeasedDelivery): Promise<IntegrationExecutionContext | null>;
    start(delivery: LeasedDelivery): Promise<void>;
    finish(delivery: LeasedDelivery, outcome: ProviderOutcome, decision: ReturnType<typeof deliveryDecision>, nextAttemptAt: string | null): Promise<void>;
    abandon(delivery: LeasedDelivery, safeErrorCode: string): Promise<void>;
}
export interface ProviderAdapter {
    deliver(context: IntegrationExecutionContext, delivery: LeasedDelivery): Promise<ProviderOutcome>;
    reconcile(context: IntegrationExecutionContext, delivery: LeasedDelivery): Promise<ProviderOutcome>;
}
export declare function createIntegrationWorker(dependencies: {
    readonly repository: DeliveryRepository;
    readonly adapters: Readonly<Record<IntegrationProvider, ProviderAdapter>>;
    readonly max_attempts?: number;
    readonly now?: () => Date;
}): {
    run(workerId: string, limit?: number, leaseSeconds?: number): Promise<number>;
};
//# sourceMappingURL=worker.d.ts.map