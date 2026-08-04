# Environment

Status: 2026-07-29.

## Backend environment variables

The backend loads environment variables from `.env` using `dotenv` in `backend/src/index.ts`.

Required / recommended values:

- `NODE_ENV` — backend runtime mode. The `X-User-Id` development authentication path is enabled when this value is exactly `development`; `npm run dev` sets it explicitly.
- `PORT` — HTTP port for the backend (default `3001`).
- `TRUST_PROXY_HOPS` — number of trusted reverse-proxy hops used by Express when resolving `req.ip` for audits (default `0`, disabled). Only a nonnegative safe integer is accepted; invalid values become `0`.
- `GOOGLE_CLIENT_ID` — OAuth client ID for Google API user authentication.
- `GOOGLE_CLIENT_SECRET` — OAuth client secret for Google API user authentication.
- `GOOGLE_REFRESH_TOKEN` — OAuth refresh token for the Google account used to upload files and access Sheets.
- `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` — Minified service-account JSON. It is a fallback for the property workflow and mandatory for Contract Generation Sheet reads/writes.
- `GOOGLE_SUBJECT_EMAIL` — Delegated user email for service account domain-wide delegation.
- `GOOGLE_SHEET_ID` — Target Google Sheet ID.
- `GOOGLE_SHEET_RANGE` — Sheet range for appends (for example `Sheet1!A1`).
- `GOOGLE_DRIVE_PARENT_FOLDER_ID` — Parent Drive folder ID where property folders are created.
- `MAKE_WEBHOOK_URL` — URL for the Make webhook that receives the submission payload.

Contract Generation values:

- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` — server-only Supabase credentials used for contract rows and property media.
- `CONTRACT_PUBLIC_BASE_URL` — frontend origin used in generated user and client links, for example `https://app.example.com`.
- `CONTRACT_TOKEN_SECRET` — at least 32 random characters used to HMAC role tokens and signed password-session cookies. Rotate only with a deliberate token/session invalidation plan.
- `CONTRACTS_API_KEY` — optional server-to-server bearer credential; never expose it through `VITE_*`.
- `CONTRACT_ALLOW_INSECURE_AGENT_ID` — dangerous opt-in for hosted previews that accepts the browser-controlled `X-User-Id` header when set to exactly `true`. Leave unset or `false` for secure deployments.
- `CONTRACT_ADMIN_USER_IDS` — comma-separated user IDs allowed to use the admin API and UI.
- `CONTRACT_SUBMISSION_RATE_LIMIT` — allowed attempts per IP/entry and limiter namespace (default `10`). Role submits and SPEC-14 evidence preflights use independent counters.
- `CONTRACT_SUBMISSION_RATE_WINDOW_MS` — window shared by those independent counters (default `900000`).
- `CONTRACT_DNI_STORAGE_BUCKET` — private Supabase Storage bucket for SPEC-11 DNI images (default `contract-dni`).
- `CONTRACT_DNI_MAX_IMAGE_BYTES` — maximum size of one DNI image (default `10485760`, 10 MB). Keep this aligned with the bucket object limit.
- `CONTRACT_DNI_UPLOADS_REQUIRED` — set to `true` to require both Frontal and Dorso DNI uploads for every visible DNI receiver; production environments enforce this policy regardless of the variable.
- `CONTRACT_EVIDENCE_STORAGE_BUCKET` — separate private Supabase Storage bucket for SPEC-14 guarantor evidence (default `contract-evidence`).
- `CONTRACT_EVIDENCE_MAX_FILE_BYTES` — maximum size of one salary-receipt or property-guarantee file (default `10485760`, 10 MB). Keep this aligned with the evidence bucket object limit.

Apply these migrations in order before enabling the complete flow:

1. `backend/supabase/migrations/20260724000000_contract_entries.sql`
2. `backend/supabase/migrations/20260727000000_contract_spec11.sql`
3. `backend/supabase/migrations/20260729000000_contract_spec14.sql`
4. `backend/supabase/migrations/20260731000000_contract_spec16.sql`
5. `backend/supabase/migrations/20260803000000_contract_spec17.sql`
6. `backend/supabase/migrations/20260803010000_contract_spec19.sql`
7. `backend/supabase/migrations/20260804000000_contract_add_generar_contrato_status.sql`
8. `backend/supabase/migrations/20260804010000_contract_spec19_admin_repair.sql`
9. `backend/supabase/migrations/20260805000000_contract_add_generation_trigger.sql`
10. `backend/supabase/migrations/20260806000000_contract_generate_trigger_webhook.sql`

The first migration enables RLS and grants the atomic submission function only to `service_role`; the second provisions the default private DNI bucket; the third provisions the default private evidence bucket with the SPEC-14 MIME allowlist; the fourth adds the durable `Direccion` identifier and update RPC; the fifth enables PDF DNI objects while preserving the private bucket policy; the sixth provisions the SPEC-19 administrator-grant table and signup trigger; the eighth repairs missing administrator grants for existing main-page accounts and reasserts the signup trigger. The seventh, ninth, and tenth migrations add and connect the contract-generation status trigger/webhook. Browsers never write database tables directly and receive Storage upload access only through server-issued signed URLs after client-token authorization.

If either storage bucket setting changes from its default, provision an equivalent private bucket with the matching size and MIME restrictions. The migrations create only `contract-dni` and `contract-evidence`.

`CONTRACT_GOOGLE_FORM_LINK`, `CONTRACT_GOOGLE_SHEET_ID`, `CONTRACT_GOOGLE_SHEET_NAME`, and `CONTRACT_AUDIT_LOGS_DIR` support only the retained SPEC-09 compatibility endpoints. The live SPEC-10 through SPEC-14 UI does not use them.

## Contract request identity

Entry creation and administrator routes accept these authentication modes:

- `Authorization: Bearer <CONTRACTS_API_KEY>` when `CONTRACTS_API_KEY` is configured.
- `X-Authenticated-User-Id: <verified-user-id>` from a trusted upstream gateway.
- The signed Supabase email/password administrator session cookie from `/api/auth/login` or `/api/auth/register`.
- `X-User-Id: <local-user-id>` when `NODE_ENV=development` exactly.
- `X-User-Id: <agent-id>` outside development only when the backend has the explicit insecure opt-in `CONTRACT_ALLOW_INSECURE_AGENT_ID=true`.

Authentication precedence is trusted `X-Authenticated-User-Id`, then explicit `Authorization`, then the signed Supabase password session, then `X-User-Id`. Hosted client forms and their DNI/evidence upload-preflight endpoints require the client token. Hosted user forms accept their user token or the authenticated owner. API-key callers and accounts recorded in `contract_admin_users` are administrators; other user-scoped compatibility principals must be listed in `CONTRACT_ADMIN_USER_IDS`.

Clients may send `X-Request-Id` for correlation. The backend generates one when omitted or invalid and returns the selected value as a response header. In production, the reverse proxy must strip inbound `X-Authenticated-User-Id` and add a value derived from its authenticated session.

The hosted agent-ID opt-in does not authenticate a person: any caller can spoof any agent ID, including an ID listed in `CONTRACT_ADMIN_USER_IDS`. Use it only with disposable preview data, and remove both insecure flags before handling real contracts.

Set `TRUST_PROXY_HOPS` to the exact number of known reverse-proxy hops between the client and Express. Leaving it at `0` ignores forwarded addresses for `req.ip`; setting it too high can let an untrusted caller influence the IP stored in contract audits.

## Frontend environment configuration

The frontend uses Vite and sets the API prefix in `frontend/src/features/properties/services/propertyApi.ts`:

- development: no prefix.
- production: `/_/backend`.

No contract secret is configured in the frontend. The frontend sends same-origin credentials to the password-auth API. The property flow may still send its configured agent ID during local development; contract creation and administration use the Supabase session instead.

For an intentionally insecure hosted preview, set `VITE_CONTRACT_ALLOW_INSECURE_AGENT_ID=true` on the frontend and `CONTRACT_ALLOW_INSECURE_AGENT_ID=true` on the backend. Both values are case-sensitive. The Vite variable is embedded at build time, so redeploy after changing it.

## Example

Copy `.env.example` to `.env` in `/backend` and fill in all required values before starting the backend.

Keep `backend/.env` local. It is ignored by Git, and secret values must not be written to logs, responses, public schemas, or frontend environment files.
