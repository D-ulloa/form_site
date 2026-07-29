const RETRIABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const RETRIABLE_NETWORK_CODES = new Set([
  'EAI_AGAIN',
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENETUNREACH',
  'ETIMEDOUT',
]);

export class ContractSheetsAppendError extends Error {
  readonly retriable: boolean;
  readonly providerStatus: number | undefined;

  constructor(args: {
    message: string;
    retriable: boolean;
    providerStatus?: number;
    cause?: unknown;
  }) {
    super(args.message, { cause: args.cause });
    this.name = 'ContractSheetsAppendError';
    this.retriable = args.retriable;
    this.providerStatus = args.providerStatus;
  }
}

function readStatus(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\d{3}$/u.test(value)) return Number(value);
  return undefined;
}

export function getGoogleSheetsErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;

  const candidate = error as {
    status?: unknown;
    code?: unknown;
    response?: {
      status?: unknown;
      data?: { error?: { code?: unknown } };
    };
  };

  return (
    readStatus(candidate.response?.status) ??
    readStatus(candidate.response?.data?.error?.code) ??
    readStatus(candidate.status) ??
    readStatus(candidate.code)
  );
}

export function isRetriableGoogleSheetsError(error: unknown): boolean {
  const status = getGoogleSheetsErrorStatus(error);
  if (status !== undefined) return RETRIABLE_STATUS_CODES.has(status);

  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && RETRIABLE_NETWORK_CODES.has(code.toUpperCase());
}
