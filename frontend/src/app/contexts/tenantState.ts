export function tenantQueryKey(
  organizationId: string,
  contextEpoch: number,
  ...parts: readonly unknown[]
): readonly unknown[] {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/iu.test(organizationId) || !Number.isSafeInteger(contextEpoch) || contextEpoch < 1) {
    throw new Error('A confirmed organization UUID and positive context epoch are required.');
  }
  return ['organization', organizationId, contextEpoch, ...parts];
}

export function isCurrentTenantOperation(
  captured: { readonly organization_id: string; readonly epoch: number },
  current: { readonly organization_id: string; readonly epoch: number } | null,
): boolean {
  return current !== null && captured.organization_id === current.organization_id && captured.epoch === current.epoch;
}

export function tenantDraftKey(input: {
  readonly schema_version: number; readonly user_id: string; readonly organization_id: string;
  readonly resource_id: string; readonly purpose: string;
}): string {
  return ['form-site', input.schema_version, input.user_id, input.organization_id,
    input.purpose, input.resource_id].map(encodeURIComponent).join(':');
}
