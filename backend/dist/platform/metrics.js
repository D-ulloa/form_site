const METRIC_NAME = /^[a-z][a-z0-9_.]{2,127}$/u;
const SAFE_LABEL_KEYS = new Set([
    'service', 'environment', 'deployment', 'route', 'action', 'actor_class',
    'outcome', 'error_class', 'provider_class', 'policy_key', 'state',
]);
const SAFE_LABEL_VALUE = /^[A-Za-z0-9_.:/-]{1,96}$/u;
export const REQUIRED_METRIC_FAMILIES = [
    'authorization.denied', 'session.revocation', 'token.validation',
    'upload.failure', 'queue.depth', 'queue.oldest_age', 'worker.retry',
    'worker.dead_letter', 'provider.latency', 'rate_limit.decision',
    'rate_limit.health', 'quota.consumption', 'quota.denial', 'database.pool',
    'database.query_latency', 'database.lock_wait', 'backup.age',
    'restore.drill', 'audit.append_failure',
];
export function createSafeMetrics(sink) {
    return {
        async record(name, value, labels = {}) {
            if (!METRIC_NAME.test(name) || !Number.isFinite(value))
                throw new Error('INVALID_METRIC');
            for (const [key, labelValue] of Object.entries(labels)) {
                if (!SAFE_LABEL_KEYS.has(key) || !SAFE_LABEL_VALUE.test(labelValue)) {
                    throw new Error('UNSAFE_METRIC_LABEL');
                }
            }
            await sink.record(name, value, labels);
        },
    };
}
//# sourceMappingURL=metrics.js.map