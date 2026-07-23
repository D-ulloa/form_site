# API Contracts

Status: 2026-07-21.

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

## Contract endpoint authorization

`GET /api/contracts/schemas/:schemaId` is public. `POST /api/contracts/submit` and `GET /api/contracts/audits/:submissionId` require one of:

- `Authorization: Bearer <CONTRACTS_API_KEY>`
- `X-Authenticated-User-Id: <verified-user-id>` from a trusted gateway
- `X-User-Id: <local-user-id>` only when backend `NODE_ENV=development` exactly

`X-Request-Id` is optional on protected requests. The backend generates a request ID when it is absent and records it in the audit. A production proxy must strip caller-supplied `X-Authenticated-User-Id` before inserting a verified value.

Authentication precedence is gateway header, Bearer authorization, then development header. A present trusted gateway identity wins even when a forwarded authorization value is malformed. An explicit malformed, unconfigured, or wrong Bearer value fails without falling back to `X-User-Id`.

Gateway and development principals are user-scoped: the route replaces body `meta.userId` with the authenticated header identity, records that owner in the audit, and permits audit reads only for the same owner. The bearer key authenticates an unscoped internal client, preserves explicit body `meta.userId` for audit attribution, and may read any contract audit. It must never be embedded in frontend source or a `VITE_*` variable.

## `GET /api/contracts/schemas/:schemaId`

### Purpose

Return the client-safe schema used to render Contract Generation. The response is the public schema object directly, not a `{ "schema": ... }` wrapper.

Abbreviated response example (the registered schema returns all sections and fields):

```json
{
  "schemaId": "rent-contract-v1",
  "contractType": "rent-contract-v1",
  "googleFormLink": "https://forms.gle/example",
  "sections": [
    {
      "title": "Inquilino",
      "fields": [
        {
          "name": "tenant_full_name",
          "label": "Nombre Completo (Apellidos, Nombres)",
          "type": "string",
          "required": true,
          "sensitive": true
        }
      ]
    }
  ]
}
```

The public object supports field types `string`, `email`, `number`, `date`, `boolean`, and `select`, with applicable `required`, `min`, `max`, `pattern`, `maxLength`, and `options` constraints. It never contains `spreadsheetId`, `sheetName`, `columnMap`, credentials, or API keys.

- `200` for a known schema.
- `404` for an unknown `schemaId`.
- `500` when server contract configuration is invalid.

Successful public schemas use `Cache-Control: public, max-age=300`. Schema errors use `no-store`.

## `POST /api/contracts/submit`

### Purpose

Validate an in-app contract form, append one row to the configured Google Sheet, persist a redacted audit record, and return an append receipt.

### Request

The following shows the envelope and representative field types. A valid `rent-contract-v1` request must include every required field returned by the public schema.

```json
{
  "schemaId": "rent-contract-v1",
  "contractType": "rent-contract-v1",
  "fields": {
    "tenant_full_name": "Apellidos, Nombres",
    "tenant_email": "tenant@example.com",
    "tenant_age": 30,
    "contract_start_date": "2026-08-01",
    "contract_months": 24
  },
  "meta": {
    "userId": "agent-001",
    "origin": "ui"
  }
}
```

- `Content-Type`: `application/json`.
- The server-wide JSON body limit is `256kb`.
- `schemaId` and `contractType` must match the authoritative registered schema.
- `fields` is flat. Unknown fields, missing required fields, type mismatches, invalid dates/emails/patterns, out-of-range numbers, and select values outside `options` are rejected.
- Dates use the ISO wire format `YYYY-MM-DD`.
- The backend validates independently of the browser and escapes formula-leading string values before mapping.
- `meta.userId` does not grant authorization. Gateway/development authentication replaces it for audit attribution; API-key authentication deliberately preserves it as explicit business attribution.

### Success response

```json
{
  "receipt": {
    "submissionId": "SUB-2026-07-21-A1B2C3D4",
    "timestamp": "2026-07-21T18:30:00.000Z",
    "sheetUrl": "https://docs.google.com/spreadsheets/d/example/edit",
    "appendedRange": "Contracts!A42:AG42",
    "auditUrl": "/api/contracts/audits/SUB-2026-07-21-A1B2C3D4"
  }
}
```

Before appending, the backend reads `'<sheetName>'!1:1` with row-major formatted values and requires the returned row to match every configured header by length and index. This preserves repeated Google Form labels without collapsing them into a header-name lookup. A mismatch stops processing before any write and returns a non-retriable `500` with the first mismatched column and administrator remediation.

After preflight, the Sheet append uses `spreadsheets.values.append` with `valueInputOption=RAW`, range `'<sheetName>'!A1`, and deterministic schema/mapping order. Both the header read and append use the configured service account only; user OAuth credentials are not considered. A successful response means the append metadata was obtained and the required audit record was persisted.

### Errors

- `400` — request/schema validation failed; response includes an actionable `errors` list.
- `401` — authentication is missing or invalid.
- `403` — authenticated identity is not permitted.
- `404` — `schemaId` is not registered.
- `500` — contract configuration, column mapping, or audit persistence failed; mapping errors include administrator remediation.
- `502` — Google rejected the append with a non-availability upstream failure.
- `503` — temporary Google availability, quota, or retry exhaustion failure.

Google error responses include a truthful `retriable` flag, but `values.append` is non-idempotent and the API has no idempotency key or deduplication store. A transient failure or lost response can occur after Google commits the row. Clients preserve entered values, but operators should inspect the Sheet before retrying an ambiguous result; `retriable: true` does not prove that no row was written. If the append is confirmed and audit persistence then fails, the response is explicitly non-retriable and operators reconcile by its request/submission identifiers.

Protected submit responses use `Cache-Control: no-store` and return the selected/generated `X-Request-Id` response header.

## `GET /api/contracts/audits/:submissionId`

### Purpose

Return the authenticated, redacted audit record for a contract receipt. The response is the audit object directly, not a `{ "audit": ... }` wrapper.

Abbreviated response example (the real `mappedRow` retains all schema-ordered columns):

```json
{
  "schemaId": "rent-contract-v1",
  "contractType": "rent-contract-v1",
  "fields": {
    "tenant_full_name": "[REDACTED]",
    "contract_months": 24
  },
  "mappedRow": ["[REDACTED]", 24],
  "spreadsheetId": "example",
  "sheetName": "Contracts",
  "appendedRange": "Contracts!A42:AG42",
  "submissionId": "SUB-2026-07-21-A1B2C3D4",
  "userId": "agent-001",
  "timestamp": "2026-07-21T18:30:00.000Z",
  "requestId": "request-123",
  "ip": "203.0.113.10"
}
```

All fields marked `sensitive` are redacted in both `fields` and `mappedRow`. The route validates the submission ID and reads only from the audit directory; the logs directory is never exposed as static content.

The route resolves `CONTRACT_AUDIT_LOGS_DIR` at read time, matching the submission logger's call-time write resolution. Blank or unset uses `backend/logs`. The setting must refer to genuinely persistent storage when audit durability is required; it does not make Vercel's ephemeral filesystem persistent.

Gateway and development principals can retrieve only an audit whose stored `userId` matches their authenticated header identity. The API-key principal is intentionally unscoped. Audit responses use `Cache-Control: no-store`, return `X-Request-Id`, and set `X-Content-Type-Options: nosniff`.

- `200` when the audit exists.
- `400` for an invalid submission ID.
- `401` or `403` for authorization failures.
- `404` when the audit does not exist.

## `GET /health`

- Returns `{ "status": "ok" }`.
- Used for liveness checks.

## Frontend integration

Property API calls are implemented in `frontend/src/features/properties/services/propertyApi.ts`; contract API calls live under `frontend/src/features/contracts/`.

- In development, the frontend sends requests to the current origin.
- In production, it prefixes requests with `/_/backend`.
- The public contract schema call does not send a credential.
- Protected browser calls rely on the same-origin authenticated gateway in production and the local identity header only when the backend has exact `NODE_ENV=development`.
- Development submit and audit fetches send `X-User-Id` from the configured agent; the backend accepts it only with exact `NODE_ENV=development`. Production sends neither that header nor a browser API key.
- Selecting the receipt's audit link is intercepted to make an authenticated, same-origin request and render the returned redacted JSON inline. The underlying safe `href` remains available.

## Integration contracts

- `backend/src/mappers/sheetRowMapper.ts` maps property payloads to Google Sheets row arrays.
- `backend/src/mappers/makePayloadMapper.ts` builds the canonical Make JSON payload.
- The backend contract registry owns contract field ordering, sensitivity, and private Sheet mapping.
