export interface RetryOptions {
    /** Maximum number of attempts (including the first try). Default: 3 */
    maxAttempts: number;
    /** Initial delay in ms before the second attempt. Default: 500 */
    initialDelayMs: number;
    /** Multiplier applied to the delay on each subsequent attempt. Default: 2 */
    backoffFactor: number;
}
/**
 * Executes `fn` with exponential backoff retry.
 * Throws the last error if all attempts fail.
 */
export declare function withRetry<T>(fn: () => Promise<T>, options?: Partial<RetryOptions>): Promise<T>;
//# sourceMappingURL=retryPolicy.d.ts.map