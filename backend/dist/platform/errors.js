const STATUS_BY_CODE = {
    UNAUTHENTICATED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    VERSION_CONFLICT: 409,
    IDEMPOTENCY_CONFLICT: 409,
    ORGANIZATION_LOCKED: 423,
    RATE_LIMITED: 429,
    AUDIT_UNAVAILABLE: 503,
    LIMITER_UNAVAILABLE: 503,
    QUOTA_EXCEEDED: 409,
    INVALID_CURSOR: 400,
    DEPENDENCY_UNAVAILABLE: 503,
};
export class PlatformError extends Error {
    code;
    status;
    retry_after_seconds;
    constructor(code, options = {}) {
        super(code);
        this.code = code;
        this.name = 'PlatformError';
        this.status = STATUS_BY_CODE[code];
        if (options.retry_after_seconds !== undefined) {
            this.retry_after_seconds = Math.max(1, Math.ceil(options.retry_after_seconds));
        }
    }
}
export function safeErrorEnvelope(error, requestId) {
    const safe = error instanceof PlatformError ? error : new PlatformError('DEPENDENCY_UNAVAILABLE');
    return {
        status: safe.status,
        body: { error: { code: safe.code, request_id: requestId } },
        ...(safe.retry_after_seconds === undefined ? {} : { retry_after_seconds: safe.retry_after_seconds }),
    };
}
//# sourceMappingURL=errors.js.map