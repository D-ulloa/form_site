export interface ContractSubmissionRateLimitResult {
    readonly allowed: boolean;
    readonly retryAfterSeconds: number;
}
export interface ContractSubmissionRateLimiter {
    check(key: string): ContractSubmissionRateLimitResult;
}
export declare function createContractSubmissionRateLimiter(environment?: NodeJS.ProcessEnv, now?: () => number): ContractSubmissionRateLimiter;
//# sourceMappingURL=contractSubmissionRateLimiter.d.ts.map