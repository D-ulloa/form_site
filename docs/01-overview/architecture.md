# Architecture

Status: 2026-07-21.

## Stack

- Frontend: React 19, TypeScript, Vite 8, Tailwind CSS v4, React Router v7.
- Backend: Node.js, Express v5, TypeScript strict mode, ES Modules.
- Integrations: Google Drive API, Google Sheets API, public Google Form links, Make webhook.

## Frontend architecture

The frontend lives under `frontend/` and is organized into:

- `src/pages/`: top-level route pages.
- `src/features/properties/`: property form sections, validation, submit hooks, payload mapping, and media handling.
- `src/features/contracts/`: contract schema transport types, two-step modal, dynamic form renderer, validation, and API client.
- `src/app/contexts/`: global agent context persisted to localStorage.
- `src/components/ui/`: reusable UI elements such as buttons, alerts, and modals.

Important frontend flows:

- `ActionSelectionPage`: entry point that launches property creation or Contract Generation.
- `NewPropertyPage`: composes section components and orchestrates form submission.
- `SubmissionSuccessPage`: shows submission status and integration results.
- `ContractGenerationModal`: loads the public schema, controls copy/form/receipt states, and keeps entered values after recoverable failures.

The contract UI does not contain Google credentials or Sheet destination metadata. It consumes the public schema route and treats frontend validation as usability only; the backend remains authoritative.

## Backend architecture

The backend lives under `backend/` and is structured into:

- `src/index.ts`: Express app entrypoint.
- `src/routes/`: route adapters for HTTP endpoints.
- `src/config/`: validated contract schemas and private Sheet mappings.
- `src/services/`: domain orchestration and integration adapters.
- `src/mappers/`: mapping logic for Google Sheets and Make payloads.
- `src/utils/`: shared utilities for auth, retry policy, sanitization, and size limits.

Key backend responsibilities:

- Validate incoming property payloads.
- Serve a client-safe public contract schema without authentication.
- Authenticate contract submissions and audit reads.
- Revalidate contract fields from the authoritative registry, sanitize formula-like values, and map them in deterministic schema order.
- Read and compare the complete contract Sheet header row by position before each append; repeated human labels remain distinct by index.
- Create a Google Drive folder and upload media.
- Append canonical property rows and `RAW` contract rows into Google Sheets.
- Send a properly formatted payload to the Make webhook.
- Persist property logs and redacted contract audit records under `backend/logs/`.

Property Google operations may use configured user OAuth with a service-account fallback. Contract Sheet reads and writes use `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` exclusively and never fall back to user OAuth credentials.

## Contract authorization boundary

`GET /api/contracts/schemas/:schemaId` is public because it contains only form labels, constraints, and the Google Form link. Submission and audit routes require one of these identities:

- `Authorization: Bearer <CONTRACTS_API_KEY>` for a configured shared internal client.
- `X-Authenticated-User-Id` inserted by a trusted authentication gateway.
- `X-User-Id` only when `NODE_ENV` is exactly the lowercase value `development`.

The trusted gateway header takes precedence over a forwarded `Authorization` header and the development header. Gateway and development principals replace the request body's `meta.userId` before the audit is created. An API-key principal is unscoped and preserves the explicit `meta.userId` as audit attribution.

The production proxy must remove client-supplied `X-Authenticated-User-Id` values before inserting its verified value. `X-User-Id` is rejected when `NODE_ENV` is absent, `test`, `production`, differently cased, or any value other than `development`. The API key must stay server-side and must not be compiled into a Vite `VITE_*` variable.

## Deployment shape

- Local frontend dev: `cd frontend && npm run dev`.
- Local backend dev: `cd backend && npm run dev`.
- The backend may run behind a prefix such as `/_/backend` in production; the frontend API client supports that prefix.
- A gateway deployment must preserve `Authorization` and `X-Request-Id`, inject verified identity headers, and strip spoofable trusted headers from inbound traffic.
- `TRUST_PROXY_HOPS` controls Express proxy trust for audit IP attribution. `0` or an invalid value leaves proxy trust disabled; a positive safe integer trusts exactly that many hops. Configure it only to the known deployment topology.

## Runtime boundary

- Frontend UI is stateless beyond local agent persistence.
- Backend persists no application database; it writes submission/audit files to disk and delegates primary state to Google Drive/Sheets/Make.
- The canonical schema for submission validation is expressed in `frontend/src/features/properties/schemas/propertySchema.ts` and validated in `backend/src/services/validatePropertyPayload.ts`.
- Contract configuration is backend-authoritative. The public projection deliberately omits `spreadsheetId`, `sheetName`, and `columnMap`.
- Contract audit reads and writes resolve `CONTRACT_AUDIT_LOGS_DIR` at call time. Leave it blank for `backend/logs`, or point it at an actual mounted persistent volume.
- Local audit files are only durable on a persistent filesystem. Changing the directory does not make an ephemeral filesystem durable; Vercel deployments must export audits to durable external storage rather than treating the deployment filesystem as a record store.
- Contract audit IPs come from Express `req.ip`; forwarded addresses affect that value only when `TRUST_PROXY_HOPS` enables the corresponding trusted proxy chain.
- Google Sheets `values.append` is not idempotent. A timeout or lost response can leave the server unable to prove whether a row was written, so transient retry guidance does not guarantee that retrying cannot duplicate a row.
