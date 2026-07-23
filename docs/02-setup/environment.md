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

- `CONTRACT_GOOGLE_FORM_LINK` — public Google Form URL displayed in modal step A.
- `CONTRACT_GOOGLE_SHEET_ID` — spreadsheet ID used only for contract submissions.
- `CONTRACT_GOOGLE_SHEET_NAME` — exact tab name used as the contract append range.
- `CONTRACTS_API_KEY` — optional shared bearer credential for protected contract endpoints. Use this only from a server-side client or trusted gateway; never expose it through a `VITE_*` variable.
- `CONTRACT_AUDIT_LOGS_DIR` — optional contract audit directory, resolved at each audit read/write call. Blank or unset uses `backend/logs`. In production, set an absolute path only when it points to a mounted persistent volume with backend read/write access.

The three `CONTRACT_GOOGLE_*` values are server configuration. The public schema endpoint exposes the Form link but does not expose the spreadsheet ID, tab name, or column mapping.

Contract Generation deliberately ignores `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REFRESH_TOKEN`. Configure `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` even when the property workflow already uses user OAuth. `GOOGLE_SUBJECT_EMAIL` remains optional for service-account delegation.

`CONTRACT_AUDIT_LOGS_DIR` changes where the process reads and writes audit JSON; it does not provision storage or change filesystem durability. In particular, setting it to a path on Vercel's ephemeral deployment filesystem, including a temporary directory, does not provide durable receipts across instances or deployments. Use an external durable audit sink for Vercel.

## Contract request identity

Protected contract routes accept these authentication modes:

- `Authorization: Bearer <CONTRACTS_API_KEY>` when `CONTRACTS_API_KEY` is configured.
- `X-Authenticated-User-Id: <verified-user-id>` from a trusted upstream gateway.
- `X-User-Id: <local-user-id>` only when `NODE_ENV=development` exactly. Missing, `test`, `production`, and differently cased values fail closed.

Authentication precedence is trusted `X-Authenticated-User-Id`, then explicit `Authorization`, then development `X-User-Id`. A gateway or development identity is authoritative and replaces body `meta.userId` for audit attribution. A valid API key authenticates an unscoped server client and preserves body `meta.userId` as the attributed audit owner; that body value is attribution, not a credential.

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
