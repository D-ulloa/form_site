import { PlatformError } from '../platform/errors.js';
import type { DeliveryState, ProviderOutcome } from './types.js';

const transitions: Readonly<Record<DeliveryState, ReadonlySet<DeliveryState>>> = {
  pending: new Set(['leased', 'blocked', 'cancelled']), leased: new Set(['processing', 'unknown', 'blocked']),
  processing: new Set(['succeeded', 'retry_wait', 'reconciling', 'unknown', 'failed', 'dead_letter']),
  succeeded: new Set(), retry_wait: new Set(['leased', 'blocked', 'cancelled']),
  reconciling: new Set(['succeeded', 'retry_wait', 'unknown', 'dead_letter']),
  unknown: new Set(['reconciling', 'dead_letter']), failed: new Set(['retry_wait', 'dead_letter']),
  dead_letter: new Set(['retry_wait', 'cancelled']), blocked: new Set(['pending', 'cancelled']), cancelled: new Set(),
};

export function assertDeliveryTransition(current: DeliveryState, next: DeliveryState): void {
  if (current === next || transitions[current].has(next)) return;
  throw new PlatformError('VERSION_CONFLICT');
}

export function deliveryDecision(outcome: ProviderOutcome, attempt: number, maxAttempts: number): DeliveryState {
  if (outcome.kind === 'succeeded') return 'succeeded';
  if (outcome.kind === 'ambiguous') return 'reconciling';
  if (outcome.kind === 'permanent_failure') return 'dead_letter';
  return attempt >= maxAttempts ? 'dead_letter' : 'retry_wait';
}

export function retryDelayMs(attempt: number, random = Math.random): number {
  const capped = Math.min(3_600_000, 1_000 * 2 ** Math.min(Math.max(attempt, 0), 12));
  return Math.floor(capped * (0.75 + random() * 0.5));
}

export function mayManuallyRetry(state: DeliveryState): boolean {
  return state === 'failed' || state === 'dead_letter';
}

export function reconcileMatches(matches: readonly { readonly external_id: string; readonly exact: boolean }[]):
  'retry' | 'adopt' | 'dead_letter' {
  if (matches.length === 0) return 'retry';
  if (matches.length === 1 && matches[0]?.exact) return 'adopt';
  return 'dead_letter';
}
