import { createPlatformServiceRoleClient } from '../platform/serviceRoleClient.js';
import { createContractGenerationPayloadLoader, createMakeWebhookAdapter } from './makeWebhookAdapter.js';
import { createSupabaseContractMakeDeliveryRepository } from './supabaseContractMakeDeliveryRepository.js';
import { createIntegrationWorker } from './worker.js';
function workerId(triggerId) {
    const normalized = triggerId.replace(/[^A-Za-z0-9._:-]/gu, '_').slice(0, 96);
    return `contract-make:${normalized || 'request'}`;
}
function workerLimit(environment) {
    const value = Number(environment.CONTRACT_MAKE_WORKER_LIMIT ?? '10');
    return Number.isSafeInteger(value) && value >= 1 && value <= 50 ? value : 10;
}
/** Runs one bounded claim/delivery pass after a contract-generation commit. */
export function createContractMakeDeliveryRunner(environment = process.env, client = createPlatformServiceRoleClient(environment)) {
    const worker = createIntegrationWorker({
        repository: createSupabaseContractMakeDeliveryRepository(client),
        adapters: {
            make_webhook: createMakeWebhookAdapter({ payloads: createContractGenerationPayloadLoader(client), environment }),
            google_drive: { async deliver() { return { kind: 'permanent_failure', error_code: 'UNSUPPORTED_PROVIDER' }; },
                async reconcile() { return { kind: 'ambiguous', error_code: 'UNSUPPORTED_PROVIDER' }; } },
            google_sheets: { async deliver() { return { kind: 'permanent_failure', error_code: 'UNSUPPORTED_PROVIDER' }; },
                async reconcile() { return { kind: 'ambiguous', error_code: 'UNSUPPORTED_PROVIDER' }; } },
        },
    });
    return {
        run(triggerId) {
            return worker.run(workerId(triggerId), workerLimit(environment));
        },
    };
}
//# sourceMappingURL=contractMakeDeliveryRunner.js.map