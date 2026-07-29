import { google } from 'googleapis';

export class GoogleServiceAccountConfigurationError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'GoogleServiceAccountConfigurationError';
  }
}

/**
 * Creates service-account auth without consulting user OAuth credentials.
 * Contract Sheet writes use this helper to keep their principal explicit.
 */
export function createGoogleServiceAccountAuth(
  scopes: readonly string[],
  environment: NodeJS.ProcessEnv = process.env,
) {
  const keyJson = environment.GOOGLE_SERVICE_ACCOUNT_KEY_JSON?.trim();
  if (!keyJson) {
    throw new GoogleServiceAccountConfigurationError(
      'GOOGLE_SERVICE_ACCOUNT_KEY_JSON is required for contract Sheet writes.',
    );
  }

  let credentials: object;
  try {
    const parsed = JSON.parse(keyJson) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('Credentials must be a JSON object.');
    }
    credentials = parsed;
  } catch (error) {
    throw new GoogleServiceAccountConfigurationError(
      'GOOGLE_SERVICE_ACCOUNT_KEY_JSON must contain valid service-account JSON.',
      error,
    );
  }

  const subject = environment.GOOGLE_SUBJECT_EMAIL?.trim();
  return new google.auth.GoogleAuth({
    credentials,
    scopes: [...scopes],
    ...(subject ? { clientOptions: { subject } } : {}),
  });
}
