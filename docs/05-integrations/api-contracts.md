# API Contracts

Status: 2026-06-05.

## `POST /properties/submit`

### Purpose

Submit a new property for processing by the backend.

### Request format

- `Content-Type`: `multipart/form-data`
- Fields:
  - `agent_user_id`
  - `agent_name`
  - `agent_email`
  - `cover_file_name`
  - All property fields defined by `frontend/src/features/properties/schemas/propertySchema.ts`
- Files:
  - `files` — one or more uploaded image/video files.

### Validation rules

- Property fields are validated against the Zod schema in `backend/src/services/validatePropertyPayload.ts`.
- File MIME types are validated by `backend/src/utils/sizeLimits.ts`.
- Total upload size is capped at `3.8 MB` for this deployment and a higher internal hard cap of `1 GB`.

### Behavior

The backend will:

1. Validate form fields and uploaded files.
2. Create a Google Drive folder.
3. Upload media files.
4. Append a row to Google Sheets.
5. Send the payload to the Make webhook.
6. Persist a submission log.

### Response

Response body shape:

```json
{
  "outcome": "success | failure | partial_failure",
  "property_id": "PROP-YYYY-XXXX",
  "submission_id": "SUB-YYYY-MM-DD-XXXX",
  "drive_folder_url": "...",
  "drive_folder_name": "...",
  "steps": {
    "drive_folder": "ok | failed | skipped",
    "file_upload": "ok | failed | skipped",
    "sheets": "ok | failed | skipped",
    "make": "ok | failed | skipped"
  },
  "error": "..."
}
```

- `200` for `success`.
- `207` for `partial_failure`.
- `400` for validation and request errors.
- `413` for payload size violations.
- `500` for backend failures.

## `GET /health`

- Returns `{ "status": "ok" }`.
- Used for liveness checks.

## Frontend integration

The frontend API client is implemented in `frontend/src/features/properties/services/propertyApi.ts`.

- In development, the frontend sends requests to the current origin.
- In production, it prefixes requests with `/_/backend`.

## Integration contracts

- `backend/src/mappers/sheetRowMapper.ts` maps property payloads to Google Sheets row arrays.
- `backend/src/mappers/makePayloadMapper.ts` builds the canonical Make JSON payload.
