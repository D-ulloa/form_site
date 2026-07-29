# API Contracts

Status: 2026-07-29.

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

## SPEC-10 through SPEC-14 contract entry API

All responses below use `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: no-referrer`. Production requests must resolve as HTTPS. Entry creation uses the gateway/development/API-key identity boundary by default; an intentionally insecure preview can opt into caller-supplied agent IDs. Role reads, client upload preflights, and submits require the matching role token, except that an authenticated owner can use the user route without a token.

### `POST /api/contracts/create`

Authenticated request: `{ "schemaId": "rent-contract-v1" }`; `schemaId` is optional. API-key callers also supply `createdBy`. Returns `201` with `{ entryId, userUrl, clientUrl, createdAt, status: "open" }`. The URLs contain raw tokens that are not stored or recoverable. The live UI calls this endpoint only after the operator clicks `Generar nueva entrada para contrato`; opening or rendering the contract section is passive.

### `GET /api/contracts/:entryId/schema?role=user|client&token=...`

Returns `{ schemaId, contractType, role, sections, entry, readOnly, values }`. Client sections are `Inquilino` and `Garantes` and include `repeatable` metadata (`name`, item/add labels, `minItems: 1`) plus two `uploads` definitions for the front/back DNI slots. Each `Garantes` subsection also exposes its SPEC-14 `fileReceivers` metadata: `name`, Spanish `label`, `maxFiles: 2`, `maxSizeBytes`, and the exact accepted MIME list. User sections are `Propietario` and `Contrato`; the latter exposes `Vigencia`, `Canon`, and `Ajuste` subsection metadata in form order. `contract_selection` is a select with `IPC`/`IPL`, and the formatted date definitions are marked `readOnly` and `computed`. Submitted or complete role pages remain accessible as read-only. Archived entries return `410`.

### `POST /api/contracts/:entryId/dni-uploads/presign?token=...`

Client token required. Request: `{ "uploads": [{ "collection": "inquilinos|garantes", "itemIndex": 0, "slot": "front|back", "originalName": "dni.jpg", "mimeType": "image/jpeg", "sizeBytes": 1000 }] }`. A request may contain at most one front and one back descriptor for a collection/item index. Only configured raster image MIME types and positive sizes within `CONTRACT_DNI_MAX_IMAGE_BYTES` are accepted.

Returns `{ "uploads": [{ uploadUrl, originalName, mimeType, sizeBytes, storagePath, storageBucket, publicPath, slot }] }`. `uploadUrl` is used for the direct `PUT` and must not be persisted. The remaining private reference is included in the corresponding repeated record at role submission time.

### `POST /api/contracts/:entryId/evidence-uploads/presign?token=...`

Client token required. This endpoint is called only after the user explicitly submits the client form; selecting files does not call it.

Request:

```json
{
  "uploads": [
    {
      "collection": "garantes",
      "itemIndex": 0,
      "field": "recibo_sueldo_files",
      "filename": "recibo-julio.pdf",
      "mimeType": "application/pdf",
      "size": 245760
    }
  ]
}
```

`field` must be `recibo_sueldo_files` or `garantia_propietaria_files`. Each descriptor requires a nonnegative guarantor index, a nonempty filename, one of `application/pdf`, `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/bmp`, or `image/tiff`, and a positive safe-integer size no greater than `CONTRACT_EVIDENCE_MAX_FILE_BYTES`. A request may include at most 20 descriptors and at most two for the same guarantor/field receiver.

Response:

```json
{
  "uploads": [
    {
      "filename": "recibo-julio.pdf",
      "mimeType": "application/pdf",
      "size": 245760,
      "storagePath": "contracts/entry-id/client/garantes/0/recibo_sueldo_files/uuid-recibo-julio.pdf",
      "storageBucket": "contract-evidence",
      "uploadUrl": "https://storage.example/signed-upload"
    }
  ]
}
```

The response preserves descriptor order. The browser sends each file directly to its `uploadUrl`, removes that transient property, and includes the remaining stable reference in the matching guarantor array. The route rejects archived or already-submitted client entries and never makes the private bucket public. It uses the contract limiter under an independent `evidence:<ip>:<entryId>` key, so upload preflights do not consume role-submit attempts; the default eleventh preflight within 15 minutes returns retriable `429`.

### `POST /api/contracts/:entryId/submit?role=user|client&token=...`

Request: `{ "fields": { ... } }`. User fields remain flat. Client fields use first-class arrays:

```json
{
  "fields": {
    "inquilinos": [{ "tenant_full_name": "Garcia, Juan" }],
    "garantes": [
      {
        "guarantor_full_name": "Perez, Maria",
        "guarantor_company": "Empresa SA",
        "recibo_sueldo_files": [
          {
            "filename": "recibo-julio.pdf",
            "mimeType": "application/pdf",
            "size": 245760,
            "storagePath": "contracts/entry-id/client/garantes/0/recibo_sueldo_files/uuid-recibo-julio.pdf",
            "storageBucket": "contract-evidence"
          }
        ],
        "garantia_propietaria_files": []
      }
    ]
  }
}
```

Both repeatable arrays require at least one strict object. Each object accepts only that section's scalar fields, configured front/back references, and configured evidence arrays. DNI images are optional as a pair: neither may be present, or both must be present. A lone side, extra field/slot, non-image MIME type, oversized object, wrong bucket/path, or reference belonging to another entry returns `400`.

Every guarantor must retain the existing SPEC-12 scalar-subsection rule and also provide at least one evidence reference across `recibo_sueldo_files` and `garantia_propietaria_files`. Each evidence array accepts zero to two strict `{ filename, mimeType, size, storagePath, storageBucket }` objects. The backend revalidates the exact MIME set, configured size, private bucket, entry/client/guarantor-index/field/filename-scoped path, and path uniqueness. It then reads each private object's Storage metadata with concurrency capped at four and requires exact MIME/byte-size matches before persistence. Unknown properties, transient `uploadUrl` values, duplicate paths, a missing/mismatched object, a third file, or no evidence across the pair return `400`; a Storage outage or incomplete metadata returns retriable `503 EVIDENCE_VERIFICATION_UNAVAILABLE`.

The user payload must not contain `approve_contract`. `contract_selection`, when present, must be `IPC` or `IPL`. Caller-provided `contract_formatted_start`/`contract_formatted_update` values are ignored: the server stores `Formateada_1` as the last calendar day before the `contract_start_date` month and stores `Formateada_2` as that date plus the optional nonnegative whole-number `contract_update` months.

The server supplies entry, role, IP, user agent, and timestamps; caller-supplied metadata is not accepted. Success returns `{ submissionId, entryId, status, submittedAt }`. The transactional Supabase function writes `contract_submissions`, updates the role fields on `contract_entries`, and writes `combined_submission` when both roles are filled. Duplicate role submissions return `409`; throttled attempts return `429` and `Retry-After`.

### Administrator endpoints

- `GET /api/contracts/admin/entries`
- `GET /api/contracts/admin/entries/:entryId`
- `POST /api/contracts/admin/entries/:entryId/archive`
- `POST /api/contracts/admin/entries/:entryId/tokens/:role/regenerate`

The API key is an administrator. Every user-scoped identity must also appear in `CONTRACT_ADMIN_USER_IDS`; this means an insecure preview caller can spoof an administrator ID. Read responses never expose token hashes. A regenerated raw URL is returned once.

`GET /api/contracts/admin/entries/:entryId` reads the selected entry and its immutable `contract_submissions` rows from Supabase. It retains the compatibility properties `entry`, `userSubmission`, `clientSubmission`, and `combinedSubmission`, and adds an ordered inspection model:

```json
{
  "inspection": {
    "hasSubmissions": true,
    "submissions": [
      {
        "submissionId": "uuid",
        "role": "user",
        "submittedAt": "2026-07-29T13:00:00.000Z",
        "sections": [
          {
            "title": "Contrato",
            "fields": [],
            "subsections": [
              {
                "title": "Vigencia",
                "fields": [
                  {
                    "name": "contract_months",
                    "label": "meses",
                    "type": "number",
                    "value": 24
                  }
                ]
              }
            ],
            "items": []
          }
        ]
      }
    ]
  }
}
```

The server reconstructs section and field order from the authoritative role schema rather than JSONB object-key order. When both rows exist, `user` is returned before `client`; partial entries include only the available role, and entries without submissions return `hasSubmissions: false` with an empty array. Repeatable sections expose ordered `items`. Valid stored DNI references appear under their item’s `media` array with labels, file metadata, and a short-lived signed `viewUrl`; bucket names and storage paths are not included in that inspection model.

SPEC-14 evidence appears in the `media` array of the matching guarantor subsection:

```json
{
  "title": "Recibo de sueldo",
  "fields": [],
  "media": [
    {
      "fieldName": "recibo_sueldo_files",
      "label": "Subir recibo de sueldo",
      "filename": "recibo-julio.pdf",
      "mimeType": "application/pdf",
      "size": 245760,
      "viewUrl": "https://storage.example/signed-view",
      "expiresAt": "2026-07-29T13:10:00.000Z"
    }
  ]
}
```

The server validates each stored evidence reference before signing it. Evidence view URLs expire after ten minutes; `storageBucket`, `storagePath`, and upload URLs are omitted from the normalized inspection response.

## Legacy SPEC-09 contract endpoint authorization

`GET /api/contracts/schemas/:schemaId` is public. `POST /api/contracts/submit` and `GET /api/contracts/audits/:submissionId` require one of:

- `Authorization: Bearer <CONTRACTS_API_KEY>`
- `X-Authenticated-User-Id: <verified-user-id>` from a trusted gateway
- `X-User-Id: <local-user-id>` only when backend `NODE_ENV=development` exactly
- `X-User-Id: <agent-id>` outside development only with `CONTRACT_ALLOW_INSECURE_AGENT_ID=true`

`X-Request-Id` is optional on protected requests. The backend generates a request ID when it is absent and records it in the audit. A production proxy must strip caller-supplied `X-Authenticated-User-Id` before inserting a verified value.

Authentication precedence is gateway header, Bearer authorization, then `X-User-Id`. A present trusted gateway identity wins even when a forwarded authorization value is malformed. An explicit malformed, unconfigured, or wrong Bearer value fails without falling back to `X-User-Id`.

Gateway, development, and insecure-agent principals are user-scoped: the route replaces body `meta.userId` with the authenticated header identity, records that owner in the audit, and permits audit reads only for the same owner. The bearer key authenticates an unscoped internal client, preserves explicit body `meta.userId` for audit attribution, and may read any contract audit. It must never be embedded in frontend source or a `VITE_*` variable.

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
- `meta.userId` does not grant authorization. User-scoped header authentication replaces it for audit attribution; API-key authentication deliberately preserves it as explicit business attribution.

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

User-scoped principals can retrieve only an audit whose stored `userId` matches their authenticated header identity. The API-key principal is intentionally unscoped. Audit responses use `Cache-Control: no-store`, return `X-Request-Id`, and set `X-Content-Type-Options: nosniff`.

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
- Protected browser calls rely on the same-origin authenticated gateway in production by default and use the local identity header when the backend has exact `NODE_ENV=development`.
- With `VITE_CONTRACT_ALLOW_INSECURE_AGENT_ID=true`, the production bundle also sends `X-User-Id` from the configured agent. The backend accepts it outside development only with `CONTRACT_ALLOW_INSECURE_AGENT_ID=true`. Production never sends a browser API key.
- Selecting the receipt's audit link is intercepted to make an authenticated, same-origin request and render the returned redacted JSON inline. The underlying safe `href` remains available.

## Integration contracts

- `backend/src/mappers/sheetRowMapper.ts` maps property payloads to Google Sheets row arrays.
- `backend/src/mappers/makePayloadMapper.ts` builds the canonical Make JSON payload.
- The backend contract registry owns contract field ordering, sensitivity, and private Sheet mapping.
