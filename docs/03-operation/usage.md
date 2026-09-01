# Usage

Status: 2026-09-01.

## Frontend user flow

- `/` — legacy/root action selection page.
- `/login`, `/register`, `/auth/callback`, `/invitations/accept` — authentication and invitation entry points.
- `/t/:organizationSlug` — organization-scoped action selection and context boundary.
- `/t/:organizationSlug/properties/new` and `/t/:organizationSlug/properties/success/:submissionId` — tenant property flow.
- `/t/:organizationSlug/contracts/admin` and `/t/:organizationSlug/contracts/admin/:entryId` — tenant contract administration.
- `/contracts/:entryId/user` and `/contracts/:entryId/client` — public hosted role forms.
- `/properties/*` and `/contracts/admin/*` — legacy frontend paths redirected to `/`.

The main workflow is:

1. Sign in with a reviewed Azar administrator account.
2. Open `Agregar nueva propiedad`.
3. Complete the property fields and upload media files.
4. Submit the form.
5. Review the result page and any failure details.

The Contract Generation workflow is:

1. Sign in with a pre-reviewed email/password or Google account. Open registration and automatic administrator grants are disabled.
2. Select `Generar contrato` on the root or tenant action page; opening the section does not create a database entry.
3. From that passive section, `Administrar contratos` opens `/t/:organizationSlug/contracts/admin` without creating an entry.
4. To start a new contract, click `Generar nueva entrada para contrato` to make the authenticated create call.
5. Open the hosted user form and copy the client link from the entry card.
6. The client starts with one `Inquilino` and one `Garante`, may add/remove additional records, and may upload a complete Frente/Dorso DNI file pair (PDF or an accepted image type) for each record. Every guarantor also selects at least one salary-receipt or property-guarantee evidence file; each of the two receivers accepts at most two files.
7. The user completes `Propietario` and `Contrato`. `Contrato` groups its duration fields under `Vigencia`, rent fields under `Canon`, and adjustment fields under `Ajuste`; `Formateada_1` and `Formateada_2` remain computed and read-only.
8. Evidence selection does not upload in the background. On client `Guardar`, the form locks, the browser requests signed evidence upload URLs, uploads the files to private storage, and submits their stable references with the validated client fields. A failed final response retains those references for retry and refreshes server state to detect an already-committed submission.
9. After the first submit, the entry waits for the other role; after the second, it becomes `complete` with a combined payload; administrators can later correct either role, set `generar_contrato`, archive the entry, or regenerate links.
10. Administrators use `/t/:organizationSlug/contracts/admin/:entryId` links to inspect schema-ordered submissions and associated media, archive entries, or regenerate role links.

## Backend endpoints

- `GET /health` — health check.
- `POST /api/organizations/:organization/properties/legacy/media/presign` and `POST /api/organizations/:organization/properties/legacy/submit` — tenant-context property compatibility flow. The legacy `/properties/...` shapes remain mounted for compatibility.
- `POST /api/organizations/:organization/contracts/create` — tenant-scoped entry creation; returns one-time user and client URLs plus the tenant admin URL. The global `/api/contracts/create` shape remains a legacy compatibility alias.
- `GET /api/contracts/:entryId/schema?role=user|client` — token- or owner-authorized role schema and status.
- `POST /api/contracts/:entryId/dni-uploads/presign?token=...` — client-token-authorized private signed URLs for front/back DNI image uploads.
- `POST /api/contracts/:entryId/evidence-uploads/presign?token=...` — client-token-authorized private signed URLs for guarantor salary-receipt/property-guarantee files.
- `POST /api/contracts/:entryId/submit?role=user|client` — validated role submission and atomic Supabase persistence.
- `GET /api/organizations/:organization/contracts/admin/entries` and `GET /api/organizations/:organization/contracts/admin/entries/:entryId` — tenant administrator list and database-backed, ordered inspection with short-lived media links.
- `POST /api/organizations/:organization/contracts/admin/entries/:entryId/archive` — tenant archive and close links.
- `POST /api/organizations/:organization/contracts/admin/entries/:entryId/tokens/:role/regenerate` — replace one role token and return its new URL once.
- `PATCH` or `PUT /api/organizations/:organization/contracts/admin/entries/:entryId/submissions/:role` — tenant administrator correction of submitted role data while retaining history. The global `/api/contracts/admin/...` shapes remain legacy compatibility endpoints.
- `POST /api/contracts/admin/entries/:entryId/status` — legacy admin status path; tenant callers should use the organization-namespaced route, whose `generar_contrato` status commits outbox intent and returns queued/triggered worker information.
- `POST /api/auth/register` — returns `403 REGISTRATION_CLOSED` outside the explicit local synthetic fixture.
- `POST /api/auth/login` — reviewed allowlist login using a signed, versioned, HTTP-only session cookie.
- `POST /api/auth/google/session` — exchange a verified Supabase Google session for the same administrator cookie.
- `GET /api/auth/session` and `POST /api/auth/logout` — inspect or close the application session.
- `GET /api/organizations/:organization/context` — resolve the authenticated organization context and capabilities.
- `GET/POST/DELETE /api/organizations/:organizationId/api-keys...` — organization API-key management under governance authorization.

Legacy SPEC-09 compatibility endpoints:

- `GET /api/contracts/schemas/:schemaId` — legacy public schema.
- `POST /api/contracts/submit` — authenticated JSON contract submission.
- `GET /api/contracts/audits/:submissionId` — authenticated redacted audit record.

The tenant adapters are implemented in `backend/src/routes/tenantContractEntries.ts` and the
compatibility property wrapper in `backend/src/routes/properties.ts`. Identity/context
routes live in `backend/src/routes/identity.ts`; legacy Contract Generation endpoints
remain in `backend/src/routes/contractEntries.ts` and `backend/src/routes/contracts.ts`.

Legacy SPEC-09 submit and audit calls require a valid bearer API key, an explicitly enabled reviewed gateway `X-Authenticated-User-Id`, or `X-User-Id` with backend `NODE_ENV=development` exactly. No hosted override can enable the latter. `X-Request-Id` is optional and supports correlation.

The current contract and property UI sends the same-origin application session cookie and does not depend on the configured property agent. Retained SPEC-09 compatibility calls may use a synthetic agent identity only in exact development. Production sends neither browser identity headers nor an API key.

For legacy SPEC-09, every user-scoped identity replaces the submitted `meta.userId` before audit creation and may read only audits with that resulting owner. A valid API key preserves the submitted `meta.userId` for audit attribution and is not owner-scoped when reading audits. The audit control retains its real `href`, but JavaScript intercepts normal activation to fetch and render the JSON inside the receipt view.

When deployed behind a reverse proxy, set `TRUST_PROXY_HOPS` to the exact known hop count so the audit receives the intended client `req.ip`. Keep `0` for direct connections.

For legacy SPEC-09 on a deployment with a persistent filesystem mount, set `CONTRACT_AUDIT_LOGS_DIR` to that writable mount path before starting the backend. The audit route and submission logger resolve the setting at call time. Do not use this setting as a durability workaround on Vercel; its deployment filesystem remains ephemeral.

## Contract submission flow

1. The backend authenticates entry creation and stores only HMAC hashes of two 32-byte random tokens.
2. A role page presents its token or, for the user role, authenticated owner identity.
3. The backend enforces production HTTPS, no-store/no-referrer headers, and per-IP/entry rate limits.
4. Fields are validated against only the role-specific schema. Client arrays require at least one item each; Visible DNI receivers require a valid front/back pair tied to the current entry; each side accepts PDF or an allowed image MIME type.
5. Every guarantor must contain at least one evidence reference across `recibo_sueldo_files` and `garantia_propietaria_files`, with no more than two references in either array. The backend validates the exact MIME allowlist, configured 10 MB default limit, private bucket, entry/guarantor/receiver/filename-scoped path, uniqueness, and actual Storage MIME/size metadata.
6. The backend discards caller-provided formatted dates and recalculates them from `Inicio` and the optional whole-number `Actualización` month interval.
7. The Supabase RPC locks the entry, rejects archived submissions, inserts an immutable audit row, and updates the role payload; repeated role saves use the update path and retain history.
8. If both roles are filled, the same transaction writes `combined_submission`, marks the entry complete, and records a completion event. Administrators may later update a submitted role; each correction retains a new submission-history row.

## Submission flow

1. The frontend builds the property request without an actor identity.
2. The backend validates the application session before parsing files or issuing uploads, then supplies the verified actor identity.
3. The backend validates request fields using `validatePropertyPayload`.
4. The backend validates MIME types and total upload size.
5. The backend creates a Drive folder.
6. With the default `MEDIA_UPLOAD_PROVIDER=supabase`, media has already been
   uploaded to private Supabase Storage through the presign flow; legacy Drive
   upload remains available when explicitly configured.
7. The backend appends a Sheets row.
8. The backend sends the property Make webhook payload.
9. The backend persists a JSON log and returns separate integration outcomes.

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
- `410` — entry archived.
- `426` — HTTPS required in production.
- `429` — per-IP/entry rate limit exceeded.
- `502` — upstream Google failure on legacy endpoints.
- `503` — retriable Google availability/quota failure on legacy endpoints.

Validation and mapping errors are not retriable until the payload or server configuration is corrected. A browser following an audit URL must still pass through the authenticated gateway; bearer clients must fetch the URL with their `Authorization` header.

The append operation is non-idempotent. Automatic transient retries and later UI retries can be ambiguous if Google committed a row but its response was lost. Treat `retriable: true` as an availability classification, not a no-write guarantee, and reconcile the configured Sheet before retrying an uncertain submission. Audit-write failures after a confirmed append are explicitly non-retriable and include identifiers for reconciliation.

## Important limits

- Property multipart submissions currently enforce a safe deployed payload cap of approximately 3.8 MB and a higher internal business cap of 1 GB.
- Contract DNI files default to 10 MB each through `CONTRACT_DNI_MAX_IMAGE_BYTES`.
- Contract evidence files default to 10 MB each through `CONTRACT_EVIDENCE_MAX_FILE_BYTES`; each evidence receiver accepts at most two files.
- Contract media uploads go directly to private Supabase Storage through signed URLs and are not part of the property multipart payload.
- New SPEC-31 flows reserve/count verified bytes through the organization usage ledger, use receiver-specific per-file/count limits, and persist only stable asset IDs. Numeric retention and production quota values remain policy-gated; operators must not infer them from the provider bucket ceiling.

## Organization-scoped operation

Identity/context, governance, tenant contract, and tenant property-compatibility
routes are mounted. They require the signed application session, current membership
context, capability checks, exact Origin/CSRF validation for mutations, and generic
cross-organization not-found behavior. A route slug is a lookup key, not authority.
Production remains Azar-contained; platform provisioning and any Azar/Solar creation
or backfill remain gated by SPEC-34.

## SPEC-32 delivery operation

Tenant contract generation writes the domain status and outbox intent in one
transaction. The status route then attempts one bounded claim/delivery pass; if no
worker is configured or no active delivery is available, it reports `queued` and a
scheduled `npm --prefix backend run worker:contract-make` pass can retry it. The Make
adapter uses organization-scoped configuration, validates the destination, and sends
fire-and-forget HTTP with stable event/idempotency headers. A timeout or HTTP dispatch
result does not prove that the Make scenario completed. Property integration remains
Azar-only synchronous compatibility behavior.

## SPEC-34 migration operation

The repository provides a non-executing manifest validator and deny-by-default
control plane. Follow `spec34-migration-cutover-and-solar-runbook.md` for inventory,
quarantine, rehearsal, validation, cutover, certification, containment, and closure.
No ordinary application route exposes migration evidence. Until an exact immutable
certification and named go/no-go exist, Solar is limited to synthetic data.
