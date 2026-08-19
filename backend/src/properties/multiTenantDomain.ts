import { createHash } from 'node:crypto';
import { PlatformError } from '../platform/errors.js';
import type { OrganizationRequestContext } from '../contracts/multiTenantDomain.js';

export type PropertyStatus = 'draft' | 'active' | 'archived';
export type PropertyRunState = 'queued' | 'processing' | 'succeeded' | 'partially_failed'
  | 'failed' | 'blocked' | 'cancelled';

export function requirePropertyCapability(
  context: OrganizationRequestContext,
  capability: 'properties.read' | 'properties.write' | 'properties.manage',
): void {
  if (!context.capabilities.has(capability)) throw new PlatformError('FORBIDDEN');
}

export function canSeeProperty(
  context: OrganizationRequestContext,
  property: {
    readonly organization_id: string;
    readonly created_by_user_id: string;
    readonly assigned_to_user_id: string | null;
  },
): boolean {
  if (property.organization_id !== context.scope.organization_id) return false;
  if (context.record_visibility === 'organization' || context.role === 'owner' || context.role === 'admin') return true;
  return property.created_by_user_id === context.user_id || property.assigned_to_user_id === context.user_id;
}

export function assertPropertyVersion(actual: number, expected: number): void {
  if (!Number.isSafeInteger(expected) || expected < 1 || actual !== expected) {
    throw new PlatformError('VERSION_CONFLICT');
  }
}

export function assertPropertyLifecycle(current: PropertyStatus, next: PropertyStatus): void {
  if (current === next) return;
  const allowed = current === 'draft' ? next === 'active' : current === 'active'
    ? next === 'archived' : next === 'active';
  if (!allowed) throw new PlatformError('VERSION_CONFLICT');
}

export function canRetryPropertyRun(run: {
  readonly state: PropertyRunState;
  readonly retriable: boolean;
}): boolean {
  return run.retriable && (run.state === 'failed' || run.state === 'partially_failed' || run.state === 'blocked');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function propertyRequestFingerprint(action: string, payload: unknown): string {
  return createHash('sha256').update(action).update('\0').update(stableJson(payload)).digest('hex');
}

export function assertIdempotentReplay(
  storedFingerprint: string,
  action: string,
  payload: unknown,
): void {
  if (storedFingerprint !== propertyRequestFingerprint(action, payload)) {
    throw new PlatformError('IDEMPOTENCY_CONFLICT');
  }
}

export function redactPropertyChangeSummary(
  previous: Readonly<Record<string, unknown>>,
  next: Readonly<Record<string, unknown>>,
): Readonly<{ changed_fields: readonly string[]; changed_field_count: number }> {
  const changedFields = [...new Set([...Object.keys(previous), ...Object.keys(next)])]
    .filter((key) => stableJson(previous[key]) !== stableJson(next[key])).sort();
  return Object.freeze({ changed_fields: Object.freeze(changedFields), changed_field_count: changedFields.length });
}
