import { google } from 'googleapis';
/**
 * Creates a Google Auth client. Supports:
 * 1. User OAuth2 Client (Option 4) via GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN
 * 2. Service Account JSON fallback via GOOGLE_SERVICE_ACCOUNT_KEY_JSON
 * 3. Optional domain-wide delegation via GOOGLE_SUBJECT_EMAIL (for Workspace/service-account setups)
 */
export function createGoogleAuth(scopes) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
    if (clientId && clientSecret && refreshToken) {
        const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, 'http://localhost:3000/oauth2callback');
        oauth2Client.setCredentials({
            refresh_token: refreshToken,
        });
        return oauth2Client; // Cast as any to resolve type expectations in older SDKs if needed
    }
    const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON;
    if (!keyJson) {
        throw new Error('Missing Google credentials. Please set either GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN (User OAuth2) or GOOGLE_SERVICE_ACCOUNT_KEY_JSON (Service Account) in your environment variables.');
    }
    let credentials;
    try {
        credentials = JSON.parse(keyJson);
    }
    catch (err) {
        throw new Error(`GOOGLE_SERVICE_ACCOUNT_KEY_JSON is not valid JSON: ${err instanceof Error ? err.message : 'Invalid format'}`);
    }
    const subject = process.env.GOOGLE_SUBJECT_EMAIL?.trim();
    if (subject) {
        return new google.auth.GoogleAuth({
            credentials,
            scopes,
            clientOptions: { subject },
        });
    }
    return new google.auth.GoogleAuth({ credentials, scopes });
}
//# sourceMappingURL=googleAuth.js.map