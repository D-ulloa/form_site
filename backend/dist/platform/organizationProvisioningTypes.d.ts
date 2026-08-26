export interface OrganizationProvisioningManifest {
    readonly schema_version: 1;
    readonly operation_id: string;
    readonly requested_at: string;
    readonly requested_by_operator_user_id: string;
    readonly approval_reference: string;
    readonly operator_owner_identity_equality_approved?: true | undefined;
    readonly organization: {
        readonly slug: string;
        readonly display_name: string;
        readonly legal_name: string;
        readonly plan_key: 'internal' | 'standard' | 'enterprise';
        readonly locale: string;
        readonly time_zone: string;
    };
    readonly initial_owner: {
        readonly email: string;
        readonly display_name: string;
        readonly locale: string;
        readonly time_zone: string;
    };
}
export type OrganizationProvisioningState = 'reserved' | 'completed' | 'attention_required';
export interface OrganizationProvisioningOperation {
    readonly operation_id: string;
    readonly claim_state: 'created' | 'resumed' | 'replayed';
    readonly state: OrganizationProvisioningState;
    readonly manifest_fingerprint: string;
    readonly organization_id: string;
    readonly organization_slug: string;
    readonly owner_user_id: string | null;
    readonly owner_membership_id: string;
    readonly activation_required: boolean | null;
    readonly handoff_state: 'pending' | 'ready' | 'failed' | 'not_required';
    readonly request_id: string;
    readonly evidence_timestamp: string;
}
export interface OrganizationProvisioningPreflight {
    readonly operator_eligible: boolean;
    readonly slug_available: boolean;
    readonly migration_conflict: boolean;
}
export interface OrganizationProvisioningReceipt {
    readonly operation_id: string;
    readonly manifest_fingerprint: string;
    readonly organization_id: string;
    readonly organization_slug: string;
    readonly owner_user_id: string;
    readonly owner_membership_id: string;
    readonly result: 'created' | 'already_applied';
    readonly activation_state: 'required' | 'active';
    readonly handoff_state: 'pending' | 'ready' | 'failed' | 'not_required';
    readonly request_id: string;
    readonly evidence_timestamp: string;
    readonly owner_email_masked: string;
}
export type OrganizationProvisioningErrorCode = 'INVALID_MANIFEST' | 'MANIFEST_TOO_LARGE' | 'SECRET_MATERIAL_FORBIDDEN' | 'INVALID_TARGET_ENVIRONMENT' | 'PROVISIONING_DISABLED' | 'FINGERPRINT_REQUIRED' | 'FINGERPRINT_MISMATCH' | 'FORBIDDEN' | 'APPROVAL_REQUIRED' | 'SLUG_CONFLICT' | 'MIGRATION_INVENTORY_CONFLICT' | 'OWNER_IDENTITY_AMBIGUOUS' | 'OWNER_IDENTITY_INELIGIBLE' | 'OWNER_PROVISIONING_FAILED' | 'IDEMPOTENCY_CONFLICT' | 'PROVISIONING_IN_PROGRESS' | 'READBACK_FAILED' | 'AUDIT_UNAVAILABLE' | 'NOT_FOUND';
export declare class OrganizationProvisioningError extends Error {
    readonly code: OrganizationProvisioningErrorCode;
    constructor(code: OrganizationProvisioningErrorCode);
}
//# sourceMappingURL=organizationProvisioningTypes.d.ts.map