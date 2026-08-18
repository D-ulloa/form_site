export type OrganizationErrorCode = 'ALREADY_A_MEMBER' | 'DEPENDENCY_NOT_READY' | 'FORBIDDEN' | 'INVITATION_ALREADY_PENDING' | 'INVITATION_INVALID' | 'LAST_OWNER_REQUIRED' | 'NOT_FOUND' | 'ORGANIZATION_PENDING_DELETION' | 'ORGANIZATION_SUSPENDED' | 'POLICY_NOT_AVAILABLE' | 'VERSION_CONFLICT';
export declare class OrganizationDomainError extends Error {
    readonly code: OrganizationErrorCode;
    readonly http_status: number;
    constructor(code: OrganizationErrorCode, message?: string);
}
export declare function mapOrganizationPersistenceError(error: {
    message: string;
}): never;
//# sourceMappingURL=errors.d.ts.map