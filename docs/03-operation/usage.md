# Usage

Status: 2026-07-29.

## Frontend user flow

- `/` — action selection page.
- `/properties/new` — new property form page.
- `/properties/success/:submissionId` — result page for the submission.
- Contract Generation creates an entry card from `/`; hosted forms use `/contracts/:entryId/user` and `/contracts/:entryId/client`, and administration uses `/contracts/admin`.

The main workflow is:

1. Configure agent metadata if needed.
2. Open `Agregar nueva propiedad`.
3. Complete the property fields and upload media files.
4. Submit the form.
5. Review the result page and any failure details.

The Contract Generation workflow is:

1. Select `Generar contrato` on `/`; opening the section does not create a database entry.
2. Click `Generar nueva entrada para contrato` to make the authenticated create call.
3. Open the hosted user form and copy the client link from the entry card.
4. The client starts with one `Inquilino` and one `Garante`, may add/remove additional records, and may upload a complete Frente/Dorso DNI image pair for each record.
5. The user completes `Propietario` and `Contrato`. `Contrato` groups its duration fields under `Vigencia`, rent fields under `Canon`, and adjustment fields under `Ajuste`; `Formateada_1` and `Formateada_2` remain computed and read-only.
6. Each submit is independently validated and stored in Supabase.
7. After the first submit, the entry waits for the other role; after the second, it becomes `complete` with a combined payload.
8. Configured administrators use `/contracts/admin` to inspect schema-ordered submissions and associated media, archive entries, or regenerate links.

## Backend endpoints

- `GET /health` — health check.
- `POST /properties/submit` — accepts multipart/form-data submissions.
- `POST /api/contracts/create` — authenticated entry creation; returns one-time user and client URLs.
- `GET /api/contracts/:entryId/schema?role=user|client` — token- or owner-authorized role schema and status.
- `POST /api/contracts/:entryId/dni-uploads/presign?token=...` — client-token-authorized private signed URLs for front/back DNI image uploads.
- `POST /api/contracts/:entryId/submit?role=user|client` — validated role submission and atomic Supabase persistence.
- `GET /api/contracts/admin/entries` and `GET /api/contracts/admin/entries/:entryId` — administrator list and database-backed, ordered inspection with short-lived media links.
- `POST /api/contracts/admin/entries/:entryId/archive` — archive and close links.
- `POST /api/contracts/admin/entries/:entryId/tokens/:role/regenerate` — replace one role token and return its new URL once.

Legacy SPEC-09 compatibility endpoints:

- `GET /api/contracts/schemas/:schemaId` — legacy public schema.
- `POST /api/contracts/submit` — authenticated JSON contract submission.
- `GET /api/contracts/audits/:submissionId` — authenticated redacted audit record.

Property endpoints are implemented in `backend/src/routes/properties.ts`; current Contract Generation endpoints are in `backend/src/routes/contractEntries.ts`; legacy SPEC-09 endpoints remain in `backend/src/routes/contracts.ts`.

Legacy SPEC-09 submit and audit calls require a valid bearer API key, a trusted gateway `X-Authenticated-User-Id`, or `X-User-Id` with backend `NODE_ENV=development` exactly. `X-Request-Id` is optional and supports correlation. The public schema route does not require authentication.

In development, the frontend derives `X-User-Id` from the configured agent for current owner/admin requests and legacy submit/audit requests. In production, it sends no API key or identity header and relies on the same-origin gateway to authenticate the request and inject `X-Authenticated-User-Id`. The gateway identity has precedence over forwarded authorization.

For legacy SPEC-09, gateway and development identities replace the submitted `meta.userId` before audit creation and may read only audits with that resulting owner. A valid API key preserves the submitted `meta.userId` for audit attribution and is not owner-scoped when reading audits. The audit control retains its real `href`, but JavaScript intercepts normal activation to fetch and render the JSON inside the receipt view.

When deployed behind a reverse proxy, set `TRUST_PROXY_HOPS` to the exact known hop count so the audit receives the intended client `req.ip`. Keep `0` for direct connections.

For legacy SPEC-09 on a deployment with a persistent filesystem mount, set `CONTRACT_AUDIT_LOGS_DIR` to that writable mount path before starting the backend. The audit route and submission logger resolve the setting at call time. Do not use this setting as a durability workaround on Vercel; its deployment filesystem remains ephemeral.

## Contract submission flow

1. The backend authenticates entry creation and stores only HMAC hashes of two 32-byte random tokens.
2. A role page presents its token or, for the user role, authenticated owner identity.
3. The backend enforces production HTTPS, no-store/no-referrer headers, and per-IP/entry rate limits.
4. Fields are validated against only the role-specific schema. Client arrays require at least one item each; DNI references must be absent or a valid front/back pair tied to the current entry.
5. The backend discards caller-provided formatted dates and recalculates them from `Inicio` and the optional whole-number `Actualización` month interval.
6. The Supabase RPC locks the entry, rejects duplicate or archived submissions, inserts the immutable audit row, and updates the role payload.
7. If both roles are filled, the same transaction writes `combined_submission`, marks the entry complete, and records a completion event.

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

Contract endpoints additionally use:

- `401` — missing or invalid authentication.
- `403` — authenticated identity is not authorized.
- `404` — unknown schema, entry, or audit receipt.
- `409` — that role already submitted.
- `410` — entry archived.
- `426` — HTTPS required in production.
- `429` — per-IP/entry rate limit exceeded.
- `502` — upstream Google failure on legacy endpoints.
- `503` — retriable Google availability/quota failure on legacy endpoints.

Validation and mapping errors are not retriable until the payload or server configuration is corrected. A browser following an audit URL must still pass through the authenticated gateway; bearer clients must fetch the URL with their `Authorization` header.

The append operation is non-idempotent. Automatic transient retries and later UI retries can be ambiguous if Google committed a row but its response was lost. Treat `retriable: true` as an availability classification, not a no-write guarantee, and reconcile the configured Sheet before retrying an uncertain submission. Audit-write failures after a confirmed append are explicitly non-retriable and include identifiers for reconciliation.

## Important limits

- The deployed backend currently enforces a safe upload payload cap of ~3.8 MB.
- The backend also validates a higher internal total size limit of 1 GB for supported file uploads.
- Supported upload fields: `files` and `cover_file_name`.
