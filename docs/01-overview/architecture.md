# Architecture

Status: 2026-08-06.

## Stack

- Frontend: React 19, TypeScript, Vite 8, Tailwind CSS v4, React Router v7.
- Backend: Node.js, Express v5, TypeScript strict mode, ES Modules.
- Integrations: Supabase Postgres/Storage, Google Drive API, Google Sheets API, and Make webhook.

## Frontend architecture

The frontend lives under `frontend/` and is organized into:

- `src/pages/`: top-level route pages.
- `src/features/properties/`: property form sections, validation, submit hooks, payload mapping, and media handling.
- `src/features/contracts/`: contract entry modal, role schema types, dynamic field renderer, validation, and API client.
- `src/app/contexts/`: global agent context persisted to localStorage.
- `src/components/ui/`: reusable UI elements such as buttons, alerts, and modals.

Important frontend flows:

- `ActionSelectionPage`: entry point that launches property creation or Contract Generation.
- `NewPropertyPage`: composes section components and orchestrates form submission.
- `SubmissionSuccessPage`: shows submission status and integration results.
- `ContractEntryModal`: remains passive until its dedicated create action is clicked, then presents the hosted user form and copyable client link.
- `ContractFormPage`: renders role-only fields, including repeatable client records, private front/back DNI uploads, passive per-guarantor supporting-file receivers, live read-only computed dates, and the user-side `Contrato` subdivisions. Submitted role data can be corrected through the same role flow; administrator inspection remains read-only while administrator editing uses the dedicated update route. Supporting files remain local until the explicit `Guardar` action performs the upload preflight; the form locks during that sequence and retains stable references for safe retry.
- `ContractAdminPage`: lists entries; renders selected immutable submissions in schema order with partial/empty states, DNI media, and supporting files grouped under their guarantor subdivisions with signed views; and lets administrators edit role data, update generation status, archive entries, or regenerate role links.

The contract UI contains no Supabase service key or token hashing secret. It consumes role-authorized schema routes and treats frontend validation as usability only; the backend remains authoritative.

## Backend architecture

The backend lives under `backend/` and is structured into:

- `src/index.ts`: Express app entrypoint.
- `src/routes/`: route adapters for HTTP endpoints.
- `src/config/`: validated contract schemas, role projections, and legacy private Sheet mappings.
- `src/services/`: domain orchestration and integration adapters.
- `src/mappers/`: mapping logic for Google Sheets and Make payloads.
- `src/utils/`: shared utilities for auth, retry policy, sanitization, and size limits.

Key backend responsibilities:

- Validate incoming property payloads.
- Create contract entries with independent HMAC-hashed user and client tokens.
- Serve role-specific schemas only after token or owner authorization.
- Validate flat user fields or strict repeatable client arrays, recalculate computed dates, and atomically persist each role submission to Supabase.
- Authorize client DNI and supporting-file upload intents, rate-limit the supporting-file preflight, issue private Supabase signed upload URLs, and validate supporting-file paths plus actual private Storage MIME/size metadata before persistence.
- Validate the exact supporting-file MIME allowlist, configurable per-file limit, maximum of two files per receiver, and minimum of one file across both receivers for every guarantor.
- Read immutable role submissions for administrator inspection, reconstruct their form order from the authoritative schema, and sign validated private media references for short-lived viewing without returning storage locations.
- Assemble the combined submission when both roles are complete.
- Enforce production HTTPS, per-entry/IP rate limiting, admin access, archive, and token regeneration.
- Create a Google Drive folder and upload media.
- Append canonical property rows to Google Sheets; retained SPEC-09 routes still append `RAW` legacy contract rows.
- Send a properly formatted payload to the Make webhook.
- Persist current contract state/audits in Supabase and property/legacy audit files under `backend/logs/`.

Property Google operations may use configured user OAuth with a service-account fallback. Legacy SPEC-09 Contract Sheet reads and writes use `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` exclusively and never fall back to user OAuth credentials.

## Current contract authorization boundary

The active main-page authentication flow supports Supabase email/password registration and login plus Google OAuth through Supabase. The backend converts either successful method into a signed, HttpOnly application session cookie; main-page registrations and Google OAuth sessions receive administrator access in `public.contract_admin_users`. Contract creation and administrator routes do not use the property agent ID. The legacy `X-User-Id` development path remains only for compatibility with the property and retained SPEC-09 flows.

Hosted client forms and both client upload-preflight routes require the client role token. Hosted user forms accept the user role token or authenticated owner. Administrator routes accept a SPEC-19 administrator session, the server API key, or a compatibility identity listed in `CONTRACT_ADMIN_USER_IDS`. Raw role tokens are never stored.

## Legacy SPEC-09 authorization boundary

`GET /api/contracts/schemas/:schemaId` is public because it contains only form labels, constraints, and the Google Form link. Submission and audit routes require one of these identities:

- `Authorization: Bearer <CONTRACTS_API_KEY>` for a configured shared internal client.
- `X-Authenticated-User-Id` inserted by a trusted authentication gateway.
- `X-User-Id` when `NODE_ENV` is exactly the lowercase value `development`, or when the dangerous hosted-preview opt-in `CONTRACT_ALLOW_INSECURE_AGENT_ID=true` is set.

The trusted gateway header takes precedence over a forwarded `Authorization` header and the browser-supplied identity header. Gateway, development, and insecure-agent principals replace the request body's `meta.userId` before the audit is created. An API-key principal is unscoped and preserves the explicit `meta.userId` as audit attribution.

The production proxy must remove client-supplied `X-Authenticated-User-Id` values before inserting its verified value. By default, `X-User-Id` is rejected when `NODE_ENV` is absent, `test`, `production`, differently cased, or any value other than `development`. The explicit insecure preview flag overrides that rejection and permits caller spoofing, so it must not be used with sensitive data. The API key must stay server-side and must not be compiled into a Vite `VITE_*` variable.

## Deployment shape

- Local frontend dev: `cd frontend && npm run dev`.
- Local backend dev: `cd backend && npm run dev`.
- The backend may run behind a prefix such as `/_/backend` in production; the frontend API client supports that prefix.
- A gateway deployment must preserve `Authorization` and `X-Request-Id`, inject verified identity headers, and strip spoofable trusted headers from inbound traffic.
- `TRUST_PROXY_HOPS` controls Express proxy trust for audit IP attribution. `0` or an invalid value leaves proxy trust disabled; a positive safe integer trusts exactly that many hops. Configure it only to the known deployment topology.

## Runtime boundary

- Frontend UI is stateless beyond local agent persistence.
- Backend persists current contract state and audits in Supabase, while contract DNI and supporting files live in separate private Supabase Storage buckets; property-flow logs and legacy SPEC-09 audits may still use disk.
- The canonical schema for submission validation is expressed in `frontend/src/features/properties/schemas/propertySchema.ts` and validated in `backend/src/services/validatePropertyPayload.ts`.
- Contract configuration is backend-authoritative. SPEC-10 role projections expose only assigned fields; legacy public projections omit `spreadsheetId`, `sheetName`, and `columnMap`.
- Legacy contract audit reads and writes resolve `CONTRACT_AUDIT_LOGS_DIR` at call time. Leave it blank for `backend/logs`, or point it at an actual mounted persistent volume.
- Legacy local audit files are only durable on a persistent filesystem. Changing the directory does not make an ephemeral filesystem durable; Vercel deployments must export audits to durable external storage rather than treating the deployment filesystem as a record store.
- Contract submission and legacy audit IPs come from Express `req.ip`; forwarded addresses affect that value only when `TRUST_PROXY_HOPS` enables the corresponding trusted proxy chain.
- Legacy Google Sheets `values.append` is not idempotent. A timeout or lost response can leave the server unable to prove whether a row was written, so transient retry guidance does not guarantee that retrying cannot duplicate a row.
