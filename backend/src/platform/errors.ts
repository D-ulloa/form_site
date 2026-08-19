export type PlatformErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'ORGANIZATION_LOCKED'
  | 'RATE_LIMITED'
  | 'AUDIT_UNAVAILABLE'
  | 'LIMITER_UNAVAILABLE'
  | 'QUOTA_EXCEEDED'
  | 'INVALID_CURSOR'
  | 'DEPENDENCY_UNAVAILABLE';

const STATUS_BY_CODE: Readonly<Record<PlatformErrorCode, number>> = {
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
  readonly status: number;
  readonly retry_after_seconds?: number;

  constructor(readonly code: PlatformErrorCode, options: { retry_after_seconds?: number } = {}) {
    super(code);
    this.name = 'PlatformError';
    this.status = STATUS_BY_CODE[code];
    if (options.retry_after_seconds !== undefined) {
      this.retry_after_seconds = Math.max(1, Math.ceil(options.retry_after_seconds));
    }
  }
}

export function safeErrorEnvelope(error: unknown, requestId: string): {
  readonly status: number;
  readonly body: { readonly error: { readonly code: PlatformErrorCode; readonly request_id: string } };
  readonly retry_after_seconds?: number;
} {
  const safe = error instanceof PlatformError ? error : new PlatformError('DEPENDENCY_UNAVAILABLE');
  return {
    status: safe.status,
    body: { error: { code: safe.code, request_id: requestId } },
    ...(safe.retry_after_seconds === undefined ? {} : { retry_after_seconds: safe.retry_after_seconds }),
  };
}
