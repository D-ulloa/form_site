import type { SupabaseClient } from '@supabase/supabase-js';
export interface ContractMakeDeliveryRunner {
    run(triggerId: string): Promise<number>;
}
/** Runs one bounded claim/delivery pass after a contract-generation commit. */
export declare function createContractMakeDeliveryRunner(environment?: NodeJS.ProcessEnv, client?: SupabaseClient): ContractMakeDeliveryRunner;
//# sourceMappingURL=contractMakeDeliveryRunner.d.ts.map