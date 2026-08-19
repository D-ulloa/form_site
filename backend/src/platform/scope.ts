const ORGANIZATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

declare const trustedScope: unique symbol;

export interface OrganizationScope {
  readonly organization_id: string;
  readonly [trustedScope]: true;
}

/** Only trusted authentication/context code may call this constructor. */
export function createOrganizationScope(organizationId: string): OrganizationScope {
  if (!ORGANIZATION_ID.test(organizationId)) throw new Error('INVALID_ORGANIZATION_SCOPE');
  return Object.freeze({ organization_id: organizationId }) as OrganizationScope;
}

export function assertRowsInOrganization<T extends { readonly organization_id: string }>(
  scope: OrganizationScope,
  rows: readonly T[],
): readonly T[] {
  if (rows.some((row) => row.organization_id !== scope.organization_id)) {
    throw new Error('ORGANIZATION_SCOPE_MISMATCH');
  }
  return rows;
}

export interface ScopedRepository<RecordType, CreateInput, PatchInput> {
  list(scope: OrganizationScope, query: Readonly<Record<string, unknown>>): Promise<readonly RecordType[]>;
  findById(scope: OrganizationScope, recordId: string): Promise<RecordType | null>;
  insert(scope: OrganizationScope, input: CreateInput): Promise<RecordType>;
  update(
    scope: OrganizationScope,
    recordId: string,
    expectedVersion: number,
    patch: PatchInput,
  ): Promise<RecordType>;
}
