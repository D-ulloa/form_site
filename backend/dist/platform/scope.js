const ORGANIZATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
/** Only trusted authentication/context code may call this constructor. */
export function createOrganizationScope(organizationId) {
    if (!ORGANIZATION_ID.test(organizationId))
        throw new Error('INVALID_ORGANIZATION_SCOPE');
    return Object.freeze({ organization_id: organizationId });
}
export function assertRowsInOrganization(scope, rows) {
    if (rows.some((row) => row.organization_id !== scope.organization_id)) {
        throw new Error('ORGANIZATION_SCOPE_MISMATCH');
    }
    return rows;
}
//# sourceMappingURL=scope.js.map