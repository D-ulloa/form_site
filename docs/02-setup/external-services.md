# External Services

Status: 2026-06-05.

## Google Drive

The backend creates a property folder and uploads files to Google Drive.

- The parent folder ID is configured by `GOOGLE_DRIVE_PARENT_FOLDER_ID`.
- The backend supports User OAuth2 auth and a Service Account fallback.
- Drive uploads are subject to platform payload limits and Drive storage quotas.

## Google Sheets

The backend appends one row per submission to the configured sheet.

- The target sheet ID is `GOOGLE_SHEET_ID`.
- The append range is `GOOGLE_SHEET_RANGE`.
- The row mapping is implemented in `backend/src/mappers/sheetRowMapper.ts`.

## Make

The backend sends a JSON webhook payload to the Make webhook URL configured in `MAKE_WEBHOOK_URL`.

- Payload mapping is implemented in `backend/src/mappers/makePayloadMapper.ts`.
- The webhook receives full submission metadata, folder information, agent data, and media details.

## Auth modes

### User OAuth2 (recommended)

- Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REFRESH_TOKEN`.
- Uploads run under the authenticated user account and use that user's Drive quota.

### Service Account fallback

- Configure `GOOGLE_SERVICE_ACCOUNT_KEY_JSON`.
- Share the target sheet and parent Drive folder with the service account email.
- Optionally configure `GOOGLE_SUBJECT_EMAIL` for domain-wide delegation if needed.
