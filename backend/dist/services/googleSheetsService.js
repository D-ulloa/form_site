import { google } from 'googleapis';
import { withRetry } from '../utils/retryPolicy.js';
import { createGoogleAuth } from '../utils/googleAuth.js';
const SHEETS_SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
// ─── Append row ───────────────────────────────────────────────────────────────
/**
 * Appends a single row to the configured Google Sheet.
 * Column ordering is determined by the caller (sheetRowMapper).
 */
export async function appendSheetRow(row) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) {
        throw new Error('GOOGLE_SHEET_ID environment variable is not set');
    }
    const range = process.env.GOOGLE_SHEET_RANGE ?? 'Sheet1!A1';
    const auth = createGoogleAuth(SHEETS_SCOPES);
    const sheets = google.sheets({ version: 'v4', auth });
    await withRetry(() => sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [row] },
    }));
}
//# sourceMappingURL=googleSheetsService.js.map