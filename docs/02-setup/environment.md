# Environment

Status: 2026-06-05.

## Backend environment variables

The backend loads environment variables from `.env` using `dotenv` in `backend/src/index.ts`.

Required / recommended values:

- `PORT` — HTTP port for the backend (default `3001`).
- `GOOGLE_CLIENT_ID` — OAuth client ID for Google API user authentication.
- `GOOGLE_CLIENT_SECRET` — OAuth client secret for Google API user authentication.
- `GOOGLE_REFRESH_TOKEN` — OAuth refresh token for the Google account used to upload files and access Sheets.
- `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` — Minified service account JSON string for fallback auth mode.
- `GOOGLE_SUBJECT_EMAIL` — Delegated user email for service account domain-wide delegation.
- `GOOGLE_SHEET_ID` — Target Google Sheet ID.
- `GOOGLE_SHEET_RANGE` — Sheet range for appends (for example `Sheet1!A1`).
- `GOOGLE_DRIVE_PARENT_FOLDER_ID` — Parent Drive folder ID where property folders are created.
- `MAKE_WEBHOOK_URL` — URL for the Make webhook that receives the submission payload.

## Frontend environment configuration

The frontend uses Vite and sets the API prefix in `frontend/src/features/properties/services/propertyApi.ts`:

- development: no prefix.
- production: `/_/backend`.

No special frontend environment variables are required for the app to run locally beyond normal Vite configuration.

## Example

Copy `.env.example` to `.env` in `/backend` and fill in all required values before starting the backend.
