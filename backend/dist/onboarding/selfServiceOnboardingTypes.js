export class SelfServiceOnboardingError extends Error {
    code;
    status;
    constructor(code) {
        super(code);
        this.code = code;
        this.name = 'SelfServiceOnboardingError';
        this.status = {
            REGISTRATION_DISABLED: 403,
            INVALID_REQUEST: 422,
            EXISTING_ACCOUNT: 409,
            ONBOARDING_IN_PROGRESS: 409,
            IDEMPOTENCY_CONFLICT: 409,
            AUTH_DEPENDENCY_UNAVAILABLE: 503,
            ONBOARDING_RECOVERY_REQUIRED: 409,
            FORBIDDEN: 403,
        }[code];
    }
}
//# sourceMappingURL=selfServiceOnboardingTypes.js.map