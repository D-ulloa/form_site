/**
 * Creates a Google Auth client. Supports:
 * 1. User OAuth2 Client (Option 4) via GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN
 * 2. Service Account JSON fallback via GOOGLE_SERVICE_ACCOUNT_KEY_JSON
 * 3. Optional domain-wide delegation via GOOGLE_SUBJECT_EMAIL (for Workspace/service-account setups)
 */
export declare function createGoogleAuth(scopes: string[]): any;
//# sourceMappingURL=googleAuth.d.ts.map