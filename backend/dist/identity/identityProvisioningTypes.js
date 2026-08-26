/** Trusted authentication/authorization code is the only intended caller of these factories. */
export function createPlatformProvisioningActor(input) {
    return Object.freeze(input);
}
export function createInvitationProvisioningActor(input) {
    return Object.freeze(input);
}
export class IdentityProvisioningError extends Error {
    code;
    status;
    constructor(code) {
        super(code);
        this.code = code;
        this.name = 'IdentityProvisioningError';
        this.status = {
            IDENTITY_AMBIGUOUS: 409,
            IDENTITY_INELIGIBLE: 403,
            PROFILE_CONFLICT: 409,
            IDENTITY_PROVIDER_UNAVAILABLE: 503,
            AUDIT_UNAVAILABLE: 503,
            IDEMPOTENCY_CONFLICT: 409,
            PROVISIONING_IN_PROGRESS: 409,
            PROVISIONING_DISABLED: 503,
            FORBIDDEN: 403,
        }[code];
    }
}
//# sourceMappingURL=identityProvisioningTypes.js.map