import { google } from 'googleapis';

/**
 * Creates a GoogleAuth instance from the service account JSON stored in
 * GOOGLE_SERVICE_ACCOUNT_KEY_JSON with the requested scopes.
 *
 * Throws if the env var is missing — callers should let this propagate so the
 * request fails with a clear error rather than silently using wrong credentials.
 */
export function createGoogleAuth(scopes: string[]) {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON;
  if (!keyJson) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_KEY_JSON environment variable is not set',
    );
  }
  const credentials = JSON.parse(keyJson) as object;
  return new google.auth.GoogleAuth({ credentials, scopes });
}
