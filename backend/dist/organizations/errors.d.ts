export type OrganizationErrorCode = 'INQUILINO_PROFILE_REQUIRED' | 'PERSONAL_PROFILE_REQUIRED' | 'INVALID_REQUEST' | 'PROPERTY_REQUIRED' | 'PROPERTY_CONFLICT' | 'ASSOCIATION_UNAVAILABLE' | 'IDEMPOTENCY_CONFLICT' | 'ALREADY_A_MEMBER' | 'DEPENDENCY_NOT_READY' | 'FORBIDDEN' | 'INVITATION_ALREADY_PENDING' | 'INVITATION_INVALID' | 'LAST_OWNER_REQUIRED' | 'NOT_FOUND' | 'ORGANIZATION_PENDING_DELETION' | 'ORGANIZATION_SUSPENDED' | 'POLICY_NOT_AVAILABLE' | 'VERSION_CONFLICT';
export declare class OrganizationDomainError extends Error {
    readonly code: OrganizationErrorCode;
    readonly http_status: number;
    constructor(code: OrganizationErrorCode, message?: string);
}
export declare function mapOrganizationPersistenceError(error: {
    message: string;
}): never;
//# sourceMappingURL=errors.d.ts.map