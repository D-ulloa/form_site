# API Contracts

Status: 2026-09-01.

## Shared SPEC-28 API conventions

Every backend response receives an effective `X-Request-Id`. A caller value is
accepted only when it matches `[A-Za-z0-9][A-Za-z0-9._:-]{0,127}`; otherwise the
server generates an unpredictable ID. The same ID follows durable audit,
usage, jobs, and future outbox work.

New public errors use this envelope and do not expose database/provider text:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "request_id": "req_example"
  }
}
```

Status conventions are `401 UNAUTHENTICATED`, `403 FORBIDDEN`, generic `404
NOT_FOUND`, `409 VERSION_CONFLICT`/`IDEMPOTENCY_CONFLICT`, `423
ORGANIZATION_LOCKED`, `429 RATE_LIMITED`, and `503 AUDIT_UNAVAILABLE`/
`LIMITER_UNAVAILABLE`/`DEPENDENCY_UNAVAILABLE`. A `429` also carries a bounded
integer `Retry-After` without confirming whether the target exists.

New organization list endpoints use `snake_case` envelopes, a default page of
25, maximum 100, stable `(created_at, id)` order, and an opaque signed cursor
bound to the active filters. Invalid/tampered/incompatible cursors return `400
INVALID_CURSOR`; unbounded limits are rejected. Request JSON on ordinary
organization routes must not contain caller-selected `organization_id`.

SPEC-30 defines the future organization property contract under
`/api/organizations/:organization_id/property-drafts`, `/properties`, and
`/property-submission-runs`. Its durable `202` result is identified by
`property_id`, `revision_id`, and `submission_run_id`; status is fetched from
the scoped run instead of browser navigation state. These routes remain
unmounted until SPEC-27 context, SPEC-31 assets, SPEC-32 integrations, and
SPEC-34 cutover are certified.

These conventions are implemented as shared backend primitives. Domain APIs
adopt them in SPEC-27 and SPEC-29 through SPEC-32; current compatibility routes
retain their documented response shapes until their owning cutover.

## Property compatibility API

The current tenant UI uses the same handler through
`/api/organizations/:organization/properties/legacy/media/presign` and
`/api/organizations/:organization/properties/legacy/submit`. The original
`/properties/...` mounts remain compatibility paths.

### `POST /properties/submit`

### Purpose

Submit a new property for processing by the backend.

### Request format

- `Content-Type`: `multipart/form-data`
- Fields:
  - `cover_file_name`
  - All property fields defined by `frontend/src/features/properties/schemas/propertySchema.ts`
- Files:
  - `files` — one or more uploaded image/video files.

### Validation rules

- A valid reviewed application session is required; missing/invalid sessions return `401` before parsing or side effects.
- Actor ID, name, and email are derived from the session. Caller values are overwritten.
- Property fields are validated against the Zod schema in `backend/src/services/validatePropertyPayload.ts`.
- File MIME types are validated by `backend/src/utils/sizeLimits.ts`.
- Total upload size is capped at `3.8 MB` for this deployment and a higher internal hard cap of `1 GB`.

### Behavior

The backend will:

1. Validate form fields and uploaded files.
2. Create a Google Drive folder.
3. Persist media according to the configured strategy: private Supabase Storage is the current default; legacy Drive upload is available when explicitly enabled.
4. Append a row to Google Sheets.
5. Send the property payload to the Make webhook.
6. Persist a submission log; serverless console output contains only redacted identifiers/outcome.

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

## Contract entry APIs: tenant current and legacy compatibility

All responses below use `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: no-referrer`. Production requests must resolve as HTTPS. Current tenant entry creation and administrator routes require the signed application session, organization context, capability checks, and CSRF protection for mutations. Retained global compatibility routes may additionally use the reviewed gateway, API key, or exact-development identity boundary. Role reads, client upload preflights, and submits require the matching role token, except that an authenticated owner can use the user route without a token.

### `POST /api/organizations/:organization/contracts/create`

The current tenant UI sends `{ "schemaId": "rent-contract-v1", "Direccion": "..." }`
with the application session and CSRF token. The server resolves the organization from
current membership context, creates the scoped `contract_entries` row, and returns
`201` with `entryId`, tenant admin URL, one-time user URL, client URL, `createdAt`,
and `status: "open"`. Opening or rendering the contract section remains passive.

### Legacy `POST /api/contracts/create`

Authenticated request: `{ "schemaId": "rent-contract-v1" }`; `schemaId` is optional. API-key callers also supply `createdBy`. Returns `201` with `{ entryId, userUrl, clientUrl, createdAt, status: "open" }`. The URLs contain raw tokens that are not stored or recoverable. This route is retained for global compatibility; the live tenant UI uses the organization-namespaced route above.

### `GET /api/contracts/:entryId/schema?role=user|client&token=...`

Returns `{ schemaId, contractType, role, sections, entry, readOnly, values }`. Client sections are `Inquilino` and `Garantes` and include `repeatable` metadata (`name`, item/add labels, `minItems: 1`) plus two `uploads` definitions for the front/back DNI slots. Each `Garantes` subsection also exposes its SPEC-14 `fileReceivers` metadata: `name`, Spanish `label`, `maxFiles: 2`, `maxSizeBytes`, and the exact accepted MIME list. User sections are `Propietario` and `Contrato`; the latter exposes `Vigencia`, `Canon`, and `Ajuste` subsection metadata in form order. `contract_selection` is a select with `IPC`/`ICL`, and the formatted date definitions are marked `readOnly` and `computed`. Submitted role pages remain accessible for correction through the same role flow; administrator inspection is read-only. Archived entries return `410`.

### `POST /api/contracts/:entryId/dni-uploads/presign?token=...`

Client token required. Request: `{ "uploads": [{ "collection": "inquilinos|garantes", "itemIndex": 0, "slot": "front|back", "originalName": "dni.jpg", "mimeType": "image/jpeg", "sizeBytes": 1000 }] }`. A request may contain at most one front and one back descriptor for a collection/item index. PDF plus the configured JPG, PNG, WEBP, GIF, HEIC, and HEIF MIME types, with positive sizes within `CONTRACT_DNI_MAX_IMAGE_BYTES`, are accepted.

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

Both repeatable arrays require at least one strict object. Each object accepts only that section's scalar fields, configured front/back references, and configured evidence arrays. Current visible DNI receivers require both sides. PDF and the configured image MIME types are accepted. A lone side, extra field/slot, unsupported MIME type, oversized object, wrong bucket/path, or reference belonging to another entry returns `400`.

Every guarantor must retain the existing SPEC-12 scalar-subsection rule and also provide at least one evidence reference across `recibo_sueldo_files` and `garantia_propietaria_files`. Each evidence array accepts zero to two strict `{ filename, mimeType, size, storagePath, storageBucket }` objects. The backend revalidates the exact MIME set, configured size, private bucket, entry/client/guarantor-index/field/filename-scoped path, and path uniqueness. It then reads each private object's Storage metadata with concurrency capped at four and requires exact MIME/byte-size matches before persistence. Unknown properties, transient `uploadUrl` values, duplicate paths, a missing/mismatched object, a third file, or no evidence across the pair return `400`; a Storage outage or incomplete metadata returns retriable `503 EVIDENCE_VERIFICATION_UNAVAILABLE`.

The user payload must not contain `approve_contract`. `contract_selection`, when present, must be `IPC` or `ICL`. Caller-provided `contract_formatted_start`/`contract_formatted_update` values are ignored: the server stores `Formateada_1` as the last calendar day before the `contract_start_date` month and stores `Formateada_2` as that date plus the optional nonnegative whole-number `contract_update` months.

The server supplies entry, role, IP, user agent, and timestamps; caller-supplied metadata is not accepted. Success returns `{ submissionId, entryId, status, submittedAt }`. The transactional Supabase function writes `contract_submissions`, updates the role fields on `contract_entries`, and writes `combined_submission` when both roles are filled. Repeated role submissions use the correction path, append a new submission-history row, and return `200`; throttled attempts return `429` and `Retry-After`.

### Tenant administrator endpoints

- `GET /api/organizations/:organization/contracts/admin/entries`
- `GET /api/organizations/:organization/contracts/admin/entries/:entryId`
- `POST /api/organizations/:organization/contracts/admin/entries/:entryId/archive`
- `POST /api/organizations/:organization/contracts/admin/entries/:entryId/tokens/:role/regenerate`
- `PATCH` or `PUT /api/organizations/:organization/contracts/admin/entries/:entryId/submissions/:role` — validate and replace a submitted role payload while retaining submission history.
- `POST /api/organizations/:organization/contracts/admin/entries/:entryId/status` — update lifecycle state. `generar_contrato` commits outbox intent and attempts one bounded worker pass; the response reports `triggered` or `queued`, not downstream Make completion.

### Legacy administrator endpoints

- `GET /api/contracts/admin/entries`
- `GET /api/contracts/admin/entries/:entryId`
- `POST /api/contracts/admin/entries/:entryId/archive`
- `POST /api/contracts/admin/entries/:entryId/tokens/:role/regenerate`
- `PATCH` or `PUT /api/contracts/admin/entries/:entryId/submissions/:role` — validate and replace a submitted role payload while retaining submission history.
- `POST /api/contracts/admin/entries/:entryId/status` — update lifecycle intent. Selecting `generar_contrato` records the flag but returns `{ "integration": { "delivery": "deferred", "reason": "SPEC25_CONTAINMENT" } }`; the fixed database webhook is disabled.

The API key and authenticated Supabase accounts recorded in `public.contract_admin_users` are administrators. Compatibility user-scoped identities must also appear in `CONTRACT_ADMIN_USER_IDS`; an insecure preview caller can spoof an administrator ID. Read responses never expose token hashes. A regenerated raw URL is returned once.

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

## Authentication endpoints

- `POST /api/auth/register` — returns `403 REGISTRATION_CLOSED`; synthetic accounts are created only through isolated test fixtures, never this runtime route.
- `POST /api/auth/login` — validates Supabase identity without granting organization authority and creates a server-side revocable opaque session.
- `POST /api/auth/google/session` — validates a Google token and creates the same opaque application-session boundary without automatic membership.
- `GET /api/auth/session` — returns safe user, device-session, and current membership summaries with `no-store`; it returns no cookie, token hash, role assertion, or secret.
- `GET /api/auth/sessions` — lists safe device-session metadata for the current user.
- `POST /api/auth/sessions/rotate` — atomically revokes the predecessor and issues new session and CSRF cookies.
- `POST /api/auth/sessions/revoke-others` — revokes the user's other active sessions.
- `POST /api/auth/logout` — revokes the current server-side session and clears both cookies.
- `POST /api/auth/password/reset/request` — returns the same accepted response for known and unknown accounts; Supabase performs the approved reset delivery.
- `POST /api/auth/password/change` and `POST /api/auth/email/change` — require current opaque session, exact Origin, CSRF, and `aal2`; successful changes revoke other sessions.

Cookie-authenticated mutations require an exact allowed `Origin`, the readable
same-origin CSRF cookie, and an equal `X-CSRF-Token` header whose keyed hash
matches the session row. Production session cookies use the `__Host-` prefix,
`Secure`, `HttpOnly`, `Path=/`, and `SameSite=Lax`. Authentication failures do
not fall back to legacy headers or global keys.

`GET /api/organizations/:organization/context` resolves either a UUID or routing
slug, reloads the active membership and organization, and returns the immutable
UUID, current role/state, and effective capability summary. Governance and API
key endpoints use UUID paths and repeat this server-side context check. Raw API
keys are returned once at issuance; later reads expose metadata only. API-key
issuance requires `integrations.manage` and an `aal2` session.

## Legacy SPEC-09 contract endpoint authorization

`GET /api/contracts/schemas/:schemaId` is public. `POST /api/contracts/submit` and `GET /api/contracts/audits/:submissionId` require one of:

- `Authorization: Bearer <CONTRACTS_API_KEY>`
- `X-Authenticated-User-Id: <verified-user-id>` from a reviewed gateway with `CONTRACT_TRUSTED_GATEWAY_ENABLED=true`
- `X-User-Id: <local-user-id>` only when backend `NODE_ENV=development` exactly

`X-Request-Id` is optional on protected requests. The backend generates a request ID when it is absent and records it in the audit. A production proxy must strip caller-supplied `X-Authenticated-User-Id` before inserting a verified value.

Authentication precedence is gateway header, Bearer authorization, then `X-User-Id`. A present trusted gateway identity wins even when a forwarded authorization value is malformed. An explicit malformed, unconfigured, or wrong Bearer value fails without falling back to `X-User-Id`.

Gateway and development principals are user-scoped: the route replaces body `meta.userId` with the authenticated header identity, records that owner in the audit, and permits audit reads only for the same owner. The bearer key authenticates an unscoped Azar-only internal client, preserves explicit body `meta.userId` for audit attribution, and may read any contract audit. It must never be embedded in frontend source or a `VITE_*` variable.

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
    "tenant_is_adult": true,
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
- Protected current-contract browser calls rely on the same-origin application session cookie. Retained SPEC-09 compatibility calls may use the gateway, API key, or exact-development identity boundary.
- Production bundles never send `X-User-Id` or a browser API key. Exact local development may send `X-User-Id` only for isolated synthetic compatibility tests.
- Selecting the receipt's audit link is intercepted to make an authenticated, same-origin request and render the returned redacted JSON inline. The underlying safe `href` remains available.

## Integration contracts

- `backend/src/mappers/sheetRowMapper.ts` maps property payloads to Google Sheets row arrays.
- `backend/src/mappers/makePayloadMapper.ts` builds the canonical Make JSON payload.
- The backend contract registry owns contract field ordering, sensitivity, and private Sheet mapping.

## Organization API contract (mounted boundary)

The SPEC-26/SPEC-27 organization, profile, settings, membership, invitation,
ownership-transfer, and lifecycle paths are mounted under `/api` behind the typed
application-session context. The slug is resolved to an immutable organization UUID
and never acts as authority. Mutations require exact Origin and CSRF validation,
capability checks, optimistic versions where applicable, and audit evidence. The
production deployment remains Azar-contained; mounting these routes does not authorize
Solar or a second production organization.

Protected responses use `Cache-Control: no-store`, `Referrer-Policy:
no-referrer`, and `X-Content-Type-Options: nosniff`. Cross-organization IDs
produce generic `404`; optimistic and last-owner conflicts use typed `409`
codes; suspended/pending-deletion states use `423`; unavailable staged
dependencies use `503 DEPENDENCY_NOT_READY`.

Invitation links use
`/invitations/accept#invitation_token=<one-time-token>`. The frontend removes
the fragment immediately and exchanges it once at `POST /api/invitations/handoff`.
The server returns no handle in JSON; it sets a host-only HttpOnly, SameSite=Strict,
15-minute cookie bound to the exact origin and a browser nonce. Resolve and accept
receive no raw token. Persisted rows contain only invitation, handle, binding, origin,
event, and provider-reference hashes.

SPEC-37 mounts bounded `GET /api/organizations/:organizationId/members` and
`GET /api/organizations/:organizationId/invitations`, plus create, resend, and revoke
mutations. Creation/resend return the safe invitation ID, status, expiry,
`delivery_state`, and `next_action`; provider rejection is reported as `failed`, never
as sent. Invitation lists expose masked email and safe attempt state, not raw email,
tokens, provider IDs/errors, or internal cursors.

`POST /api/invitations/accept` requires the current verified identity to match the
canonical invited email and atomically consumes the handoff, accepts the invitation,
and creates/reactivates the membership. It returns only canonical organization ID and
slug plus `context_refresh_required`. `POST /api/provider-webhooks/invitation-email`
uses a bounded raw JSON body and authenticated/deduplicated delivery evidence; it has
no cookie, organization selector, or membership authority.

## SPEC-31 private asset API contract (staged; not mounted)

SPEC-31 reserves organization-scoped upload-session and asset routes under
`/api/organizations/:organization_id`. Initialization accepts owner ID,
receiver descriptors, filename, declared MIME/bytes, and optional checksum; it
never accepts organization, bucket, or object-path authority in JSON. The
immediate response contains `upload_session_id`, `asset_id`,
`upload_intent_id`, an expiring `upload_url`, and required headers. Only stable
IDs survive upload.

Finalization accepts the session version and stable IDs. The backend reads the
registered object from private Storage and verifies its exact path, bytes,
provider/detected MIME, and required checksum before marking it verified.
View/download endpoints reauthorize the current principal and exact owner, then
return a very short-lived URL or safe proxy response. Asset metadata responses
omit bucket, path, checksum, provider errors, and internal retention details.

Cross-organization session/owner/asset IDs return generic `404`. Invalid
receivers/MIME use safe `400` codes, stale/consumed state uses `409`, oversized
files use `413`, quarantine/lifecycle locks use disclosure-safe `423`, limits
use `429`, and unverifiable Storage/detection uses `503`. These routes remain
available only through the SPEC-27 trusted context boundary; provider activation
and production cutover remain SPEC-32/SPEC-34 gates.

## SPEC-32 integration and delivery API contract

Organization integration list/detail responses contain provider, purpose,
state, configuration version, masked destination, safe health/error class,
timestamps, version, and allowed actions only. Secret plaintext/ciphertext,
usable secret references, credential JSON, full endpoint URL, private provider
paths/IDs, raw bodies, and event payloads are forbidden response fields.

Lifecycle endpoints reserve create/update/test/enable/disable/rotate/disconnect;
delivery endpoints reserve list/detail/retry/reconcile under
`/api/organizations/:organization_id`. They require SPEC-27 trusted context,
`integrations.read` or `integrations.manage`, optimistic version, step-up/rate
policy where applicable, and audit. Cross-organization identifiers return a
generic `404`; stale state/version returns `409`; suspension/disabled work uses
`423`; limits use `429`; safe dependency failure uses `503`. Health tests are read-only/no-customer-payload. The general integration-management
endpoints remain unmounted in the additive implementation. The mounted exception is
tenant contract generation: `POST /api/organizations/:organization/contracts/admin/entries/:entryId/status`
with `status=generar_contrato` commits an outbox event and attempts one bounded
worker pass. Its response reports `triggered` or `queued`; neither means the
downstream Make scenario has completed.

## SPEC-34 migration and rollout contracts

There is no public migration/certification API. The `migration_control` schema is
unavailable to browser roles, and a future operator API requires separately reviewed
least-privileged functions. Browser rollout responses contain only `feature_key` and
`state`, where state is `disabled` or `certified_enabled`; provider destinations,
test evidence, exceptions, approvals, thresholds, and certification internals are
never response fields. Missing, malformed, stale, or mismatched state denies access.
