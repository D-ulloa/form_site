import { google } from 'googleapis';
export class GoogleServiceAccountConfigurationError extends Error {
    constructor(message, cause) {
        super(message, { cause });
        this.name = 'GoogleServiceAccountConfigurationError';
    }
}
/**
 * Creates service-account auth without consulting user OAuth credentials.
 * Contract Sheet writes use this helper to keep their principal explicit.
 */
export function createGoogleServiceAccountAuth(scopes, environment = process.env) {
    const keyJson = environment.GOOGLE_SERVICE_ACCOUNT_KEY_JSON?.trim();
    if (!keyJson) {
        throw new GoogleServiceAccountConfigurationError('GOOGLE_SERVICE_ACCOUNT_KEY_JSON is required for contract Sheet writes.');
    }
    let credentials;
    try {
        const parsed = JSON.parse(keyJson);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            throw new Error('Credentials must be a JSON object.');
        }
        credentials = parsed;
    }
    catch (error) {
        throw new GoogleServiceAccountConfigurationError('GOOGLE_SERVICE_ACCOUNT_KEY_JSON must contain valid service-account JSON.', error);
    }
    const subject = environment.GOOGLE_SUBJECT_EMAIL?.trim();
    return new google.auth.GoogleAuth({
        credentials,
        scopes: [...scopes],
        ...(subject ? { clientOptions: { subject } } : {}),
    });
}
//# sourceMappingURL=googleServiceAccountAuth.js.map