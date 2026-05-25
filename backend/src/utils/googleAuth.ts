import { google } from 'googleapis';

/**
 * Creates a Google Auth client. Supports:
 * 1. User OAuth2 Client (Option 4) via GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN
 * 2. Service Account JSON fallback via GOOGLE_SERVICE_ACCOUNT_KEY_JSON
 */
export function createGoogleAuth(scopes: string[]) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (clientId && clientSecret && refreshToken) {
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      'http://localhost:3000/oauth2callback'
    );
    oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });
    return oauth2Client as any; // Cast as any to resolve type expectations in older SDKs if needed
  }

  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON;
  if (!keyJson) {
    throw new Error(
      'Missing Google credentials. Please set either GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN (User OAuth2) or GOOGLE_SERVICE_ACCOUNT_KEY_JSON (Service Account) in your environment variables.',
    );
  }
  const credentials = JSON.parse(keyJson) as object;
  return new google.auth.GoogleAuth({ credentials, scopes });
}

