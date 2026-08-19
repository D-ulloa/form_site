const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface PropertyTenantState {
  readonly organizationId: string;
  readonly contextEpoch: number;
  readonly userId: string;
}

function tenantPrefix(state: PropertyTenantState): readonly ['properties', string, number] {
  if (!UUID.test(state.organizationId) || !UUID.test(state.userId)
    || !Number.isSafeInteger(state.contextEpoch) || state.contextEpoch < 1) {
    throw new Error('INVALID_PROPERTY_TENANT_STATE');
  }
  return ['properties', state.organizationId, state.contextEpoch] as const;
}

export const propertyQueryKeys = Object.freeze({
  all: (state: PropertyTenantState) => tenantPrefix(state),
  list: (state: PropertyTenantState, filters: Readonly<Record<string, unknown>> = {}) =>
    [...tenantPrefix(state), 'list', filters] as const,
  detail: (state: PropertyTenantState, propertyId: string) =>
    [...tenantPrefix(state), 'detail', propertyId] as const,
  history: (state: PropertyTenantState, propertyId: string) =>
    [...tenantPrefix(state), 'history', propertyId] as const,
  run: (state: PropertyTenantState, runId: string) =>
    [...tenantPrefix(state), 'run', runId] as const,
  draft: (state: PropertyTenantState, draftId: string) =>
    [...tenantPrefix(state), 'draft', draftId] as const,
});

export function propertyRecoveryKey(
  state: PropertyTenantState,
  draftId: string,
  schemaVersion: string,
): string {
  if (!UUID.test(draftId) || !/^[A-Za-z0-9._-]{1,64}$/u.test(schemaVersion)) {
    throw new Error('INVALID_PROPERTY_RECOVERY_KEY');
  }
  return ['property-draft', state.organizationId, state.userId, draftId, schemaVersion].join(':');
}

export function isCurrentPropertyResponse(
  responseState: PropertyTenantState,
  currentState: PropertyTenantState,
): boolean {
  return responseState.organizationId === currentState.organizationId
    && responseState.contextEpoch === currentState.contextEpoch
    && responseState.userId === currentState.userId;
}

export interface PropertyConflictState<T> {
  readonly kind: 'version_conflict';
  readonly expectedVersion: number;
  readonly latestVersion: number;
  readonly unsavedPayload: T;
}

export function preservePropertyVersionConflict<T>(
  unsavedPayload: T,
  expectedVersion: number,
  latestVersion: number,
): PropertyConflictState<T> {
  return Object.freeze({ kind: 'version_conflict', expectedVersion, latestVersion, unsavedPayload });
}

export type PropertyRunState = 'queued' | 'processing' | 'succeeded' | 'partially_failed'
  | 'failed' | 'blocked' | 'cancelled';

export function isTerminalPropertyRun(state: PropertyRunState): boolean {
  return state === 'succeeded' || state === 'partially_failed' || state === 'failed'
    || state === 'blocked' || state === 'cancelled';
}
