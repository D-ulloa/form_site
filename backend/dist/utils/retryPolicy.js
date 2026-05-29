const DEFAULTS = {
    maxAttempts: 3,
    initialDelayMs: 500,
    backoffFactor: 2,
};
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Executes `fn` with exponential backoff retry.
 * Throws the last error if all attempts fail.
 */
export async function withRetry(fn, options = {}) {
    const opts = { ...DEFAULTS, ...options };
    let lastError;
    let delayMs = opts.initialDelayMs;
    for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
        try {
            return await fn();
        }
        catch (err) {
            lastError = err;
            if (attempt < opts.maxAttempts) {
                await sleep(delayMs);
                delayMs *= opts.backoffFactor;
            }
        }
    }
    throw lastError;
}
//# sourceMappingURL=retryPolicy.js.map