import { PlatformError } from '../platform/errors.js';
const transitions = {
    pending: new Set(['leased', 'blocked', 'cancelled']), leased: new Set(['processing', 'unknown', 'blocked']),
    processing: new Set(['succeeded', 'retry_wait', 'reconciling', 'unknown', 'failed', 'dead_letter']),
    succeeded: new Set(), retry_wait: new Set(['leased', 'blocked', 'cancelled']),
    reconciling: new Set(['succeeded', 'retry_wait', 'unknown', 'dead_letter']),
    unknown: new Set(['reconciling', 'dead_letter']), failed: new Set(['retry_wait', 'dead_letter']),
    dead_letter: new Set(['retry_wait', 'cancelled']), blocked: new Set(['pending', 'cancelled']), cancelled: new Set(),
};
export function assertDeliveryTransition(current, next) {
    if (current === next || transitions[current].has(next))
        return;
    throw new PlatformError('VERSION_CONFLICT');
}
export function deliveryDecision(outcome, attempt, maxAttempts) {
    if (outcome.kind === 'succeeded')
        return 'succeeded';
    if (outcome.kind === 'ambiguous')
        return 'reconciling';
    if (outcome.kind === 'permanent_failure')
        return 'dead_letter';
    return attempt >= maxAttempts ? 'dead_letter' : 'retry_wait';
}
export function retryDelayMs(attempt, random = Math.random) {
    const capped = Math.min(3_600_000, 1_000 * 2 ** Math.min(Math.max(attempt, 0), 12));
    return Math.floor(capped * (0.75 + random() * 0.5));
}
export function mayManuallyRetry(state) {
    return state === 'failed' || state === 'dead_letter';
}
export function reconcileMatches(matches) {
    if (matches.length === 0)
        return 'retry';
    if (matches.length === 1 && matches[0]?.exact)
        return 'adopt';
    return 'dead_letter';
}
//# sourceMappingURL=deliveryDomain.js.map