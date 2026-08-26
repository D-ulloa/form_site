export type IdentityProvisioningPurpose = 'initial_owner' | 'organization_invitee';
export type IdentityProvisioningOutcome = 'existing_active' | 'existing_activation_required' | 'created_activation_required' | 'reconciled_after_ambiguity' | 'blocked_ambiguous' | 'blocked_ineligible';
export type IdentityProfileState = 'created' | 'existing';
export interface ProvisionIdentityInput {
    readonly email: string;
    readonly display_name?: string;
    readonly locale?: string;
    readonly time_zone?: string;
    readonly purpose: IdentityProvisioningPurpose;
    readonly request_id: string;
    readonly idempotency_key: string;
}
declare const trustedProvisioningActor: unique symbol;
export interface PlatformProvisioningActor {
    readonly actor_type: 'platform_operator';
    readonly user_id: string;
    readonly assurance_level: 'aal2';
    readonly step_up_reference: string;
    readonly [trustedProvisioningActor]: true;
}
export interface InvitationProvisioningActor {
    readonly actor_type: 'organization_invitation';
    readonly user_id: string;
    readonly membership_id: string;
    readonly organization_id: string;
    readonly [trustedProvisioningActor]: true;
}
export type IdentityProvisioningActor = PlatformProvisioningActor | InvitationProvisioningActor;
/** Trusted authentication/authorization code is the only intended caller of these factories. */
export declare function createPlatformProvisioningActor(input: Omit<PlatformProvisioningActor, typeof trustedProvisioningActor>): PlatformProvisioningActor;
export declare function createInvitationProvisioningActor(input: Omit<InvitationProvisioningActor, typeof trustedProvisioningActor>): InvitationProvisioningActor;
export interface ProvisionIdentityResult {
    readonly user_id: string | null;
    readonly email_normalized: string;
    readonly outcome: IdentityProvisioningOutcome;
    readonly profile_state: IdentityProfileState | null;
    readonly activation_required: boolean;
    readonly provider_reconciliation_reference: string | null;
    readonly idempotency: 'created' | 'resumed' | 'replayed';
}
export type IdentityProvisioningErrorCode = 'IDENTITY_AMBIGUOUS' | 'IDENTITY_INELIGIBLE' | 'PROFILE_CONFLICT' | 'IDENTITY_PROVIDER_UNAVAILABLE' | 'AUDIT_UNAVAILABLE' | 'IDEMPOTENCY_CONFLICT' | 'PROVISIONING_IN_PROGRESS' | 'PROVISIONING_DISABLED' | 'FORBIDDEN';
export declare class IdentityProvisioningError extends Error {
    readonly code: IdentityProvisioningErrorCode;
    readonly status: number;
    constructor(code: IdentityProvisioningErrorCode);
}
export {};
//# sourceMappingURL=identityProvisioningTypes.d.ts.map