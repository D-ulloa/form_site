import type { DeliveryState, ProviderOutcome } from './types.js';
export declare function assertDeliveryTransition(current: DeliveryState, next: DeliveryState): void;
export declare function deliveryDecision(outcome: ProviderOutcome, attempt: number, maxAttempts: number): DeliveryState;
export declare function retryDelayMs(attempt: number, random?: () => number): number;
export declare function mayManuallyRetry(state: DeliveryState): boolean;
export declare function reconcileMatches(matches: readonly {
    readonly external_id: string;
    readonly exact: boolean;
}[]): 'retry' | 'adopt' | 'dead_letter';
//# sourceMappingURL=deliveryDomain.d.ts.map