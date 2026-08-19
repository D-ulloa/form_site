const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface ContractTenantState {
  readonly organizationId: string;
  readonly contextEpoch: number;
}

function tenantPrefix(state: ContractTenantState): readonly ['contracts', string, number] {
  if (!UUID.test(state.organizationId) || !Number.isSafeInteger(state.contextEpoch) || state.contextEpoch < 1) {
    throw new Error('INVALID_CONTRACT_TENANT_STATE');
  }
  return ['contracts', state.organizationId, state.contextEpoch] as const;
}

export const contractQueryKeys = Object.freeze({
  all: (state: ContractTenantState) => tenantPrefix(state),
  list: (state: ContractTenantState, filters: Readonly<Record<string, unknown>> = {}) =>
    [...tenantPrefix(state), 'list', filters] as const,
  detail: (state: ContractTenantState, entryId: string) =>
    [...tenantPrefix(state), 'detail', entryId] as const,
  history: (state: ContractTenantState, entryId: string) =>
    [...tenantPrefix(state), 'history', entryId] as const,
  templates: (state: ContractTenantState) => [...tenantPrefix(state), 'templates'] as const,
});

export function isCurrentContractResponse(
  responseState: ContractTenantState,
  currentState: ContractTenantState,
): boolean {
  return responseState.organizationId === currentState.organizationId
    && responseState.contextEpoch === currentState.contextEpoch;
}

export interface ContractConflictState<T> {
  readonly kind: 'version_conflict';
  readonly expectedVersion: number;
  readonly latestVersion: number;
  readonly unsavedFields: T;
}

export function preserveContractVersionConflict<T>(
  unsavedFields: T,
  expectedVersion: number,
  latestVersion: number,
): ContractConflictState<T> {
  return Object.freeze({ kind: 'version_conflict', expectedVersion, latestVersion, unsavedFields });
}

/**
 * Public links are delivered in the URL fragment. This consumes the token once,
 * removes it from browser history, and leaves persistence to an HttpOnly exchange cookie.
 */
export function consumeContractLinkFragment(
  location: Pick<Location, 'hash' | 'pathname' | 'search'>,
  replaceState: (data: unknown, unused: string, url?: string | URL | null) => void,
): string | null {
  const params = new URLSearchParams(location.hash.replace(/^#/u, ''));
  const token = params.get('token');
  if (!token) return null;
  params.delete('token');
  const remaining = params.toString();
  replaceState(null, '', `${location.pathname}${location.search}${remaining ? `#${remaining}` : ''}`);
  return token;
}
