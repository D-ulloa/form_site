import { PlatformError } from './errors.js';
import { redactTelemetry } from './redaction.js';
export const USAGE_METRICS = [
    'seats.active', 'contracts.created', 'properties.created', 'storage.bytes',
    'uploads.completed', 'external_links.issued', 'invitations.issued',
    'provider.deliveries', 'provider.attempts', 'exports.completed', 'processing.operations',
];
export function createUsageService(repository) {
    return {
        record(scope, input) {
            if (!USAGE_METRICS.includes(input.metric_key) || !Number.isSafeInteger(input.quantity)
                || input.quantity === 0 || input.idempotency_key.length < 8) {
                throw new Error('INVALID_USAGE_EVENT');
            }
            return repository.record(scope, {
                ...input,
                metadata: redactTelemetry(input.metadata ?? {}),
            });
        },
    };
}
export function assertQuotaAvailable(state, quantity) {
    if (!Number.isSafeInteger(quantity) || quantity <= 0)
        throw new Error('INVALID_QUOTA_QUANTITY');
    if (state.limit_value !== null && state.consumed + state.reserved + quantity > state.limit_value) {
        throw new PlatformError('QUOTA_EXCEEDED');
    }
}
//# sourceMappingURL=usage.js.map