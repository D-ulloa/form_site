export type SelfServiceAuthMethod = 'password' | 'google';
export type SelfServiceOnboardingState = 'started' | 'identity_created' | 'organization_created' | 'completed' | 'failed_recoverable' | 'rejected';
export interface SelfServiceRegistrationInput {
    readonly operation_id: string;
    readonly full_name: string;
    readonly email: string;
    readonly organization_name: string;
    readonly terms_accepted: boolean;
    readonly auth_method: SelfServiceAuthMethod;
}
export interface SelfServicePasswordRegistrationInput extends SelfServiceRegistrationInput {
    readonly password: string;
    readonly password_confirmation: string;
    readonly remember_me: boolean;
}
export interface SelfServiceOnboardingOperation {
    readonly operation_id: string;
    readonly claim_state: 'created' | 'replayed' | 'resumed';
    readonly state: SelfServiceOnboardingState;
    readonly auth_user_id: string | null;
    readonly organization_id: string | null;
    readonly organization_slug: string;
    readonly owner_membership_id: string | null;
    readonly failure_code: string | null;
}
export type SelfServiceOnboardingErrorCode = 'REGISTRATION_DISABLED' | 'INVALID_REQUEST' | 'EXISTING_ACCOUNT' | 'ONBOARDING_IN_PROGRESS' | 'IDEMPOTENCY_CONFLICT' | 'AUTH_DEPENDENCY_UNAVAILABLE' | 'ONBOARDING_RECOVERY_REQUIRED' | 'FORBIDDEN';
export declare class SelfServiceOnboardingError extends Error {
    readonly code: SelfServiceOnboardingErrorCode;
    readonly status: number;
    constructor(code: SelfServiceOnboardingErrorCode);
}
//# sourceMappingURL=selfServiceOnboardingTypes.d.ts.map