import type { SupabaseClient } from '@supabase/supabase-js';
import { createPlatformServiceRoleClient } from '../platform/serviceRoleClient.js';
import { createContractGenerationPayloadLoader, createMakeWebhookAdapter } from './makeWebhookAdapter.js';
import { createSupabaseContractMakeDeliveryRepository } from './supabaseContractMakeDeliveryRepository.js';
import { createIntegrationWorker } from './worker.js';

export interface ContractMakeDeliveryRunner {
  run(triggerId: string): Promise<number>;
}

function workerId(triggerId: string): string {
  const normalized = triggerId.replace(/[^A-Za-z0-9._:-]/gu, '_').slice(0, 96);
  return `contract-make:${normalized || 'request'}`;
}

function workerLimit(environment: NodeJS.ProcessEnv): number {
  const value = Number(environment.CONTRACT_MAKE_WORKER_LIMIT ?? '10');
  return Number.isSafeInteger(value) && value >= 1 && value <= 50 ? value : 10;
}

/** Runs one bounded claim/delivery pass after a contract-generation commit. */
export function createContractMakeDeliveryRunner(
  environment: NodeJS.ProcessEnv = process.env,
  client: SupabaseClient = createPlatformServiceRoleClient(environment),
): ContractMakeDeliveryRunner {
  const worker = createIntegrationWorker({
    repository: createSupabaseContractMakeDeliveryRepository(client),
    adapters: {
      make_webhook: createMakeWebhookAdapter({ payloads: createContractGenerationPayloadLoader(client), environment }),
      google_drive: { async deliver() { return { kind: 'permanent_failure', error_code: 'UNSUPPORTED_PROVIDER' } as const; },
        async reconcile() { return { kind: 'ambiguous', error_code: 'UNSUPPORTED_PROVIDER' } as const; } },
      google_sheets: { async deliver() { return { kind: 'permanent_failure', error_code: 'UNSUPPORTED_PROVIDER' } as const; },
        async reconcile() { return { kind: 'ambiguous', error_code: 'UNSUPPORTED_PROVIDER' } as const; } },
    },
  });

  return {
    run(triggerId) {
      return worker.run(workerId(triggerId), workerLimit(environment));
    },
  };
}
