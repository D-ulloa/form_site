# Usage

Status: 2026-06-05.

## Frontend user flow

- `/` — action selection page.
- `/properties/new` — new property form page.
- `/properties/success/:submissionId` — result page for the submission.

The main workflow is:

1. Configure agent metadata if needed.
2. Open `Agregar nueva propiedad`.
3. Complete the property fields and upload media files.
4. Submit the form.
5. Review the result page and any failure details.

## Backend endpoints

- `GET /health` — health check.
- `POST /properties/submit` — accepts multipart/form-data submissions.

The backend route is implemented in `backend/src/routes/properties.ts`.

## Submission flow

1. The frontend builds `FormData` with property fields, agent metadata, `cover_file_name`, and `files`.
2. The backend parses uploaded files with Multer.
3. The backend validates request fields using `validatePropertyPayload`.
4. The backend validates MIME types and total upload size.
5. The backend creates a Drive folder.
6. The backend uploads files.
7. The backend appends a Sheets row.
8. The backend sends the Make webhook payload.
9. The backend persists a JSON log.

## Response codes

- `200` — success.
- `207` — partial failure (Sheets or Make failed after Drive/upload succeeded).
- `400` — validation or request error.
- `413` — upload payload too large.
- `500` — backend failure.

## Important limits

- The deployed backend currently enforces a safe upload payload cap of ~3.8 MB.
- The backend also validates a higher internal total size limit of 1 GB for supported file uploads.
- Supported upload fields: `files` and `cover_file_name`.
