export interface ContractSubmissionRateLimitResult {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}

export interface ContractSubmissionRateLimiter {
  check(key: string): ContractSubmissionRateLimitResult;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function createContractSubmissionRateLimiter(
  environment: NodeJS.ProcessEnv = process.env,
  now: () => number = Date.now,
): ContractSubmissionRateLimiter {
  const maximum = positiveInteger(environment.CONTRACT_SUBMISSION_RATE_LIMIT, 10);
  const windowMs = positiveInteger(
    environment.CONTRACT_SUBMISSION_RATE_WINDOW_MS,
    15 * 60 * 1000,
  );
  const buckets = new Map<string, { count: number; resetAt: number }>();

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
