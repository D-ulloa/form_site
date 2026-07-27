# Environment

Status: 2026-07-21.

## Backend environment variables

The backend loads environment variables from `.env` using `dotenv` in `backend/src/index.ts`.

Required / recommended values:

- `NODE_ENV` — backend runtime mode. The `X-User-Id` development authentication path is enabled only when this value is exactly `development`; `npm run dev` sets it explicitly.
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
- `CONTRACT_TOKEN_SECRET` — at least 32 random characters used to HMAC role tokens. Rotate only with a deliberate token-regeneration plan.
- `CONTRACTS_API_KEY` — optional server-to-server bearer credential; never expose it through `VITE_*`.
- `CONTRACT_ADMIN_USER_IDS` — comma-separated trusted gateway user IDs allowed to use the admin API and UI.
- `CONTRACT_SUBMISSION_RATE_LIMIT` — allowed attempts per IP/entry window (default `10`).
- `CONTRACT_SUBMISSION_RATE_WINDOW_MS` — limiter window (default `900000`).

Apply `backend/supabase/migrations/20260724000000_contract_entries.sql` before enabling the flow. The migration enables RLS and grants the atomic submission function only to `service_role`; browsers never write Supabase tables directly.

`CONTRACT_GOOGLE_FORM_LINK`, `CONTRACT_GOOGLE_SHEET_ID`, `CONTRACT_GOOGLE_SHEET_NAME`, and `CONTRACT_AUDIT_LOGS_DIR` support only the retained SPEC-09 compatibility endpoints. The live SPEC-10 UI does not use them.

## Contract request identity

Entry creation and administrator routes accept these authentication modes:

- `Authorization: Bearer <CONTRACTS_API_KEY>` when `CONTRACTS_API_KEY` is configured.
- `X-Authenticated-User-Id: <verified-user-id>` from a trusted upstream gateway.
- `X-User-Id: <local-user-id>` only when `NODE_ENV=development` exactly. Missing, `test`, `production`, and differently cased values fail closed.

Authentication precedence is trusted `X-Authenticated-User-Id`, then explicit `Authorization`, then development `X-User-Id`. Hosted client forms require their client token. Hosted user forms accept their user token or the authenticated owner. API-key callers are administrators; gateway/development administrators must be listed in `CONTRACT_ADMIN_USER_IDS`.

Clients may send `X-Request-Id` for correlation. The backend generates one when omitted or invalid and returns the selected value as a response header. In production, the reverse proxy must strip inbound `X-Authenticated-User-Id` and add a value derived from its authenticated session.

Set `TRUST_PROXY_HOPS` to the exact number of known reverse-proxy hops between the client and Express. Leaving it at `0` ignores forwarded addresses for `req.ip`; setting it too high can let an untrusted caller influence the IP stored in contract audits.

## Frontend environment configuration

The frontend uses Vite and sets the API prefix in `frontend/src/features/properties/services/propertyApi.ts`:

- development: no prefix.
- production: `/_/backend`.

No contract secret is configured in the frontend. Vite development sends the configured agent ID as `X-User-Id`, so the backend must also run with `NODE_ENV=development`. Production relies on the same-origin trusted gateway/session boundary.

## Example

Copy `.env.example` to `.env` in `/backend` and fill in all required values before starting the backend.

Keep `backend/.env` local. It is ignored by Git, and secret values must not be written to logs, responses, public schemas, or frontend environment files.
