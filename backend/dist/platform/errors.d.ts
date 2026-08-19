export type PlatformErrorCode = 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VERSION_CONFLICT' | 'IDEMPOTENCY_CONFLICT' | 'ORGANIZATION_LOCKED' | 'RATE_LIMITED' | 'AUDIT_UNAVAILABLE' | 'LIMITER_UNAVAILABLE' | 'QUOTA_EXCEEDED' | 'INVALID_CURSOR' | 'DEPENDENCY_UNAVAILABLE';
export declare class PlatformError extends Error {
    readonly code: PlatformErrorCode;
    readonly status: number;
    readonly retry_after_seconds?: number;
    constructor(code: PlatformErrorCode, options?: {
        retry_after_seconds?: number;
    });
}
export declare function safeErrorEnvelope(error: unknown, requestId: string): {
    readonly status: number;
    readonly body: {
        readonly error: {
            readonly code: PlatformErrorCode;
            readonly request_id: string;
        };
    };
    readonly retry_after_seconds?: number;
};
//# sourceMappingURL=errors.d.ts.map