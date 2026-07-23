# Usage

Status: 2026-07-21.

## Frontend user flow

- `/` — action selection page.
- `/properties/new` — new property form page.
- `/properties/success/:submissionId` — result page for the submission.
- Contract Generation opens as a two-step modal from `/`.

The main workflow is:

1. Configure agent metadata if needed.
2. Open `Agregar nueva propiedad`.
3. Complete the property fields and upload media files.
4. Submit the form.
5. Review the result page and any failure details.

The Contract Generation workflow is:

1. Select `Contract Generation` on `/`.
2. Copy the public Google Form link in step A. The modal advances only after a successful copy.
3. Complete the schema-rendered fields in step B while using the visible JSON panel as a reference.
4. Select `Send`; invalid fields are reported before submission and are revalidated by the backend.
5. Review the returned receipt, Sheet link, and appended range. Selecting the audit link performs an authenticated fetch and displays the redacted audit JSON inline; form values remain available after a recoverable error.

## Backend endpoints

- `GET /health` — health check.
- `POST /properties/submit` — accepts multipart/form-data submissions.
- `GET /api/contracts/schemas/:schemaId` — public, client-safe contract schema.
- `POST /api/contracts/submit` — authenticated JSON contract submission.
- `GET /api/contracts/audits/:submissionId` — authenticated redacted audit record.

Property endpoints are implemented in `backend/src/routes/properties.ts`; Contract Generation endpoints are implemented in `backend/src/routes/contracts.ts`.

Contract submit and audit calls require a valid bearer API key, a trusted gateway `X-Authenticated-User-Id`, or `X-User-Id` with backend `NODE_ENV=development` exactly. `X-Request-Id` is optional and supports correlation. The public schema route does not require authentication.

In development, the frontend derives `X-User-Id` from the configured agent and sends it on both submit and inline audit requests. In production, it sends no API key or identity header and relies on the same-origin gateway to authenticate the request and inject `X-Authenticated-User-Id`. The gateway identity has precedence over forwarded authorization.

Gateway and development identities replace the submitted `meta.userId` before audit creation and may read only audits with that resulting owner. A valid API key preserves the submitted `meta.userId` for audit attribution and is not owner-scoped when reading audits. The audit control retains its real `href`, but JavaScript intercepts normal activation to fetch and render the JSON inside the receipt view.

When deployed behind a reverse proxy, set `TRUST_PROXY_HOPS` to the exact known hop count so the audit receives the intended client `req.ip`. Keep `0` for direct connections.

For a deployment with a persistent filesystem mount, set `CONTRACT_AUDIT_LOGS_DIR` to that writable mount path before starting the backend. The audit route and submission logger resolve the setting at call time. Do not use this setting as a durability workaround on Vercel; its deployment filesystem remains ephemeral.

## Contract submission flow

1. The frontend fetches the public schema without private Sheet mapping data.
2. The client normalizes values and performs schema-derived validation.
3. The backend authenticates the request and loads the authoritative schema by `schemaId`.
4. The backend rejects contract-type mismatches, unknown fields, and invalid values before any Google call.
5. Formula-like strings are escaped and fields are mapped in canonical order.
6. The backend reads row 1 and requires an exact length-and-position match with the registered headers; duplicate labels are compared in order.
7. The backend performs one `RAW` Sheet append only after header preflight passes.
8. A redacted audit file is written and a receipt is returned.

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
- `404` — unknown schema or audit receipt.
- `502` — upstream Google failure.
- `503` — retriable Google availability/quota failure.

Validation and mapping errors are not retriable until the payload or server configuration is corrected. A browser following an audit URL must still pass through the authenticated gateway; bearer clients must fetch the URL with their `Authorization` header.

The append operation is non-idempotent. Automatic transient retries and later UI retries can be ambiguous if Google committed a row but its response was lost. Treat `retriable: true` as an availability classification, not a no-write guarantee, and reconcile the configured Sheet before retrying an uncertain submission. Audit-write failures after a confirmed append are explicitly non-retriable and include identifiers for reconciliation.

## Important limits

- The deployed backend currently enforces a safe upload payload cap of ~3.8 MB.
- The backend also validates a higher internal total size limit of 1 GB for supported file uploads.
- Supported upload fields: `files` and `cover_file_name`.
