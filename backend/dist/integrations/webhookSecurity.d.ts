import type { OutboxEnvelope } from './types.js';
export declare function isForbiddenAddress(address: string): boolean;
export declare function validateWebhookDestination(raw: string, resolve: (hostname: string) => Promise<readonly string[]>): Promise<URL>;
export declare function serializeWebhookEnvelope(envelope: OutboxEnvelope): string;
export declare function signWebhook(body: string, timestamp: string, eventId: string, secret: Uint8Array): string;
export declare function verifyWebhookSignature(signature: string, expected: string): boolean;
//# sourceMappingURL=webhookSecurity.d.ts.map