function positiveInteger(value, fallback) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
export function createContractSubmissionRateLimiter(environment = process.env, now = Date.now) {
    const maximum = positiveInteger(environment.CONTRACT_SUBMISSION_RATE_LIMIT, 10);
    const windowMs = positiveInteger(environment.CONTRACT_SUBMISSION_RATE_WINDOW_MS, 15 * 60 * 1000);
    const buckets = new Map();
    return {
        check(key) {
            const timestamp = now();
            const current = buckets.get(key);
            if (!current || current.resetAt <= timestamp) {
                buckets.set(key, { count: 1, resetAt: timestamp + windowMs });
                return { allowed: true, retryAfterSeconds: 0 };
            }
            if (current.count >= maximum) {
                return {
                    allowed: false,
                    retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - timestamp) / 1000)),
                };
            }
            current.count += 1;
            return { allowed: true, retryAfterSeconds: 0 };
        },
    };
}
//# sourceMappingURL=contractSubmissionRateLimiter.js.map