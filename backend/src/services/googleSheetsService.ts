import { google } from 'googleapis';
import { withRetry } from '../utils/retryPolicy.js';

// ─── Auth ────────────────────────────────────────────────────────────────────

function getAuth() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON;
  if (!keyJson) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_KEY_JSON environment variable is not set',
    );
  }
  const credentials = JSON.parse(keyJson) as object;
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

// ─── Append row ───────────────────────────────────────────────────────────────

/**
 * Appends a single row to the configured Google Sheet.
 * Column ordering is determined by the caller (sheetRowMapper).
 */
export async function appendSheetRow(
  row: (string | number | boolean)[],
): Promise<void> {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) {
    throw new Error('GOOGLE_SHEET_ID environment variable is not set');
  }
  const range = process.env.GOOGLE_SHEET_RANGE ?? 'Sheet1!A1';

  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  await withRetry(() =>
    sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    }),
  );
}
