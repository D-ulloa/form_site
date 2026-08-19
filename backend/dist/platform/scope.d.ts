declare const trustedScope: unique symbol;
export interface OrganizationScope {
    readonly organization_id: string;
    readonly [trustedScope]: true;
}
/** Only trusted authentication/context code may call this constructor. */
export declare function createOrganizationScope(organizationId: string): OrganizationScope;
export declare function assertRowsInOrganization<T extends {
    readonly organization_id: string;
}>(scope: OrganizationScope, rows: readonly T[]): readonly T[];
export interface ScopedRepository<RecordType, CreateInput, PatchInput> {
    list(scope: OrganizationScope, query: Readonly<Record<string, unknown>>): Promise<readonly RecordType[]>;
    findById(scope: OrganizationScope, recordId: string): Promise<RecordType | null>;
    insert(scope: OrganizationScope, input: CreateInput): Promise<RecordType>;
    update(scope: OrganizationScope, recordId: string, expectedVersion: number, patch: PatchInput): Promise<RecordType>;
}
export {};
//# sourceMappingURL=scope.d.ts.map