import type { IntegrationExecutionContext, LeasedDelivery, OutboxEnvelope, ProviderOutcome } from './types.js';
export interface LegacyMakeEnvelope {
    readonly type: 'UPDATE';
    readonly table: 'contract_entries';
    readonly schema: 'public';
    readonly record: Readonly<Record<string, unknown>>;
}
export interface ContractGenerationPayloadLoader {
    load(organizationId: string, entryId: string): Promise<LegacyMakeEnvelope | null>;
}
export interface RpcClient {
    rpc(functionName: string, parameters: Readonly<Record<string, unknown>>): PromiseLike<{
        readonly data: unknown;
        readonly error: {
            readonly message: string;
        } | null;
    }>;
}
export declare function createContractGenerationPayloadLoader(client: RpcClient): ContractGenerationPayloadLoader;
export interface WebhookPoster {
    post(destination: URL, headers: Readonly<Record<string, string>>, body: string): Promise<number>;
}
export declare function createMakeWebhookAdapter(dependencies: {
    readonly payloads: ContractGenerationPayloadLoader;
    readonly resolve?: (hostname: string) => Promise<readonly string[]>;
    readonly poster?: WebhookPoster;
    readonly environment?: NodeJS.ProcessEnv;
}): {
    deliver(context: IntegrationExecutionContext, delivery: LeasedDelivery): Promise<ProviderOutcome>;
    reconcile(_context: IntegrationExecutionContext, _delivery: LeasedDelivery): Promise<ProviderOutcome>;
};
export declare function isContractGenerationEnvelope(event: OutboxEnvelope): boolean;
//# sourceMappingURL=makeWebhookAdapter.d.ts.map