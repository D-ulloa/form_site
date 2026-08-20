const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface IntegrationTenantState { readonly organizationId: string; readonly contextEpoch: number }

function prefix(state: IntegrationTenantState): readonly ['integrations', string, number] {
  if (!UUID.test(state.organizationId) || !Number.isSafeInteger(state.contextEpoch) || state.contextEpoch < 1) {
    throw new Error('INVALID_INTEGRATION_TENANT_STATE');
  }
  return ['integrations', state.organizationId, state.contextEpoch] as const;
}

export const integrationQueryKeys = Object.freeze({
  all: (state: IntegrationTenantState) => prefix(state),
  list: (state: IntegrationTenantState) => [...prefix(state), 'list'] as const,
  detail: (state: IntegrationTenantState, integrationId: string) => [...prefix(state), 'detail', integrationId] as const,
  deliveries: (state: IntegrationTenantState, filters: Readonly<Record<string, unknown>> = {}) =>
    [...prefix(state), 'deliveries', filters] as const,
  delivery: (state: IntegrationTenantState, deliveryId: string) => [...prefix(state), 'delivery', deliveryId] as const,
});

export interface SafeIntegrationView {
  readonly id: string; readonly provider: string; readonly purpose: string; readonly state: string;
  readonly masked_destination: string; readonly health_state: string; readonly version: number;
}

export function parseSafeIntegration(value: Readonly<Record<string, unknown>>): SafeIntegrationView {
  const forbidden = ['credential_ref', 'secret', 'ciphertext', 'private_key', 'refresh_token', 'endpoint_url'];
  if (forbidden.some((key) => key in value)) throw new Error('UNSAFE_INTEGRATION_RESPONSE');
  const required = ['id', 'provider', 'purpose', 'state', 'masked_destination', 'health_state'];
  if (required.some((key) => typeof value[key] !== 'string') || !Number.isSafeInteger(value.version)) {
    throw new Error('INVALID_INTEGRATION_RESPONSE');
  }
  return Object.freeze({ id: value.id as string, provider: value.provider as string,
    purpose: value.purpose as string, state: value.state as string,
    masked_destination: value.masked_destination as string, health_state: value.health_state as string,
    version: value.version as number });
}

export function isCurrentIntegrationResponse(response: IntegrationTenantState,
  current: IntegrationTenantState): boolean {
  return response.organizationId === current.organizationId && response.contextEpoch === current.contextEpoch;
}

export function clearWriteOnlySecret(form: { secret: string }): void { form.secret = ''; }
