import { withRetry } from '../utils/retryPolicy.js';
/**
 * POSTs the canonical Make payload to the configured webhook URL.
 * Uses native fetch (Node 18+) with retry on non-2xx responses.
 */
export async function sendToMakeWebhook(payload) {
    const webhookUrl = process.env.MAKE_WEBHOOK_URL;
    if (!webhookUrl) {
        throw new Error('MAKE_WEBHOOK_URL environment variable is not set');
    }
    await withRetry(async () => {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            const body = await response.text();
            throw new Error(`Make webhook responded with ${response.status}: ${body}`);
        }
    });
}
//# sourceMappingURL=makeWebhookService.js.map