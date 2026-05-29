import type { MakePayload } from '../types.js';
/**
 * POSTs the canonical Make payload to the configured webhook URL.
 * Uses native fetch (Node 18+) with retry on non-2xx responses.
 */
export declare function sendToMakeWebhook(payload: MakePayload): Promise<void>;
//# sourceMappingURL=makeWebhookService.d.ts.map