export interface RetryOptions {
  /** Maximum number of attempts (including the first try). Default: 3 */
  maxAttempts: number;
  /** Initial delay in ms before the second attempt. Default: 500 */
  initialDelayMs: number;
  /** Multiplier applied to the delay on each subsequent attempt. Default: 2 */
  backoffFactor: number;
}

const DEFAULTS: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 500,
  backoffFactor: 2,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes `fn` with exponential backoff retry.
 * Throws the last error if all attempts fail.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const opts: RetryOptions = { ...DEFAULTS, ...options };
  let lastError: unknown;
  let delayMs = opts.initialDelayMs;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < opts.maxAttempts) {
        await sleep(delayMs);
        delayMs *= opts.backoffFactor;
      }
    }
  }

  throw lastError;
}
