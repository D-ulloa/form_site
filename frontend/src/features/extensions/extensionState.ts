const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MODULES = new Set(['billing', 'custom_domains', 'enterprise_sso', 'dedicated_isolation', 'analytics']);
const STATES = new Set(['not_configured', 'design_approved', 'implemented', 'certified', 'enabled', 'retired']);

export interface ExtensionTenantState { readonly organizationId: string; readonly contextEpoch: number }
export interface SafeExtensionModule {
  readonly organization_id: string;
  readonly module_key: string;
  readonly state: string;
  readonly version: number;
}

function prefix(state: ExtensionTenantState): readonly ['extension-modules', string, number] {
  if (!UUID.test(state.organizationId) || !Number.isSafeInteger(state.contextEpoch) || state.contextEpoch < 1) {
    throw new Error('INVALID_EXTENSION_TENANT_STATE');
  }
  return ['extension-modules', state.organizationId, state.contextEpoch] as const;
}

export const extensionQueryKeys = Object.freeze({
  all: (state: ExtensionTenantState) => prefix(state),
  modules: (state: ExtensionTenantState) => [...prefix(state), 'modules'] as const,
  module: (state: ExtensionTenantState, moduleKey: string) => {
    if (!MODULES.has(moduleKey)) throw new Error('UNKNOWN_EXTENSION_MODULE');
    return [...prefix(state), 'module', moduleKey] as const;
  },
});

export function parseSafeExtensionModule(value: Readonly<Record<string, unknown>>): SafeExtensionModule {
  const forbidden = ['certification_evidence', 'provider_customer_id', 'provider_subscription_id',
    'secret', 'client_secret', 'certificate_private_key', 'resource_manifest'];
  if (forbidden.some((key) => key in value)) throw new Error('UNSAFE_EXTENSION_RESPONSE');
  if (typeof value.organization_id !== 'string' || !UUID.test(value.organization_id)
    || typeof value.module_key !== 'string' || !MODULES.has(value.module_key)
    || typeof value.state !== 'string' || !STATES.has(value.state)
    || !Number.isSafeInteger(value.version)) throw new Error('INVALID_EXTENSION_RESPONSE');
  return Object.freeze({ organization_id: value.organization_id, module_key: value.module_key,
    state: value.state, version: value.version as number });
}

export function isCurrentExtensionResponse(response: ExtensionTenantState, current: ExtensionTenantState): boolean {
  return response.organizationId === current.organizationId && response.contextEpoch === current.contextEpoch;
}

export function isExtensionRouteAvailable(module: SafeExtensionModule | null, organizationId: string): boolean {
  return module?.organization_id === organizationId && module.state === 'enabled';
}
