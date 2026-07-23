export declare class GoogleServiceAccountConfigurationError extends Error {
    constructor(message: string, cause?: unknown);
}
/**
 * Creates service-account auth without consulting user OAuth credentials.
 * Contract Sheet writes use this helper to keep their principal explicit.
 */
export declare function createGoogleServiceAccountAuth(scopes: readonly string[], environment?: NodeJS.ProcessEnv): import("google-auth-library").GoogleAuth<import("google-auth-library/build/src/auth/googleauth.js").JSONClient>;
//# sourceMappingURL=googleServiceAccountAuth.d.ts.map