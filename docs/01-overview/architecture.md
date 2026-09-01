# Architecture

Status: 2026-09-01.

## SPEC-25 containment boundary

The deployment remains `azar_legacy_single_organization`; tenant-scoped routes
exist but no second production organization is authorized, and real Solar data is
release-blocked. Property presign and
submit require the reviewed Azar session and overwrite caller actor fields with
the signed identity before validation or side effects. Browser agent state is
not authorization or attribution. Open registration and automatic administrator
grants are disabled. Application cookies have an independent secret/version,
new Drive folders remain under verified private ACLs, and the historical fixed
database-to-Make trigger is removed; current tenant contract generation uses an organization-scoped outbox and bounded worker path.

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
- `src/integrations/`: contract Make payload loading, SSRF-safe dispatch, delivery claiming, and worker orchestration.
- `src/platform/`, `src/identity/`, and `src/organizations/`: service-role, session, context, governance, and provisioning boundaries.

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
- Send property compatibility payloads to Make synchronously; for tenant contract generation, materialize an outbox delivery and dispatch it through the bounded worker after commit.
- Persist current contract state/audits in Supabase and property/legacy audit files under `backend/logs/`.

Property Google operations may use configured user OAuth with a service-account fallback. Legacy SPEC-09 Contract Sheet reads and writes use `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` exclusively and never fall back to user OAuth credentials.

## Current contract authorization boundary

The active main-page authentication flow supports login for pre-reviewed Supabase email/password and Google accounts. Registration is closed in real-data environments and neither login path creates an administrator grant. The backend converts successful login into a signed, HttpOnly, versioned application session cookie. Contract and property routes do not use the editable property agent ID. The legacy `X-User-Id` path exists only in exact local development with synthetic data.

Hosted client forms and both client upload-preflight routes require the client role token. Hosted user forms accept the user role token or authenticated owner. Administrator routes accept a SPEC-19 administrator session, the server API key, or a compatibility identity listed in `CONTRACT_ADMIN_USER_IDS`. Raw role tokens are never stored.

## Legacy SPEC-09 authorization boundary

`GET /api/contracts/schemas/:schemaId` is public because it contains only form labels, constraints, and the Google Form link. Submission and audit routes require one of these identities:

- `Authorization: Bearer <CONTRACTS_API_KEY>` for a configured shared internal client.
- `X-Authenticated-User-Id` inserted by a reviewed gateway when `CONTRACT_TRUSTED_GATEWAY_ENABLED=true`.
- `X-User-Id` only when `NODE_ENV` is exactly the lowercase value `development`.

The trusted gateway header takes precedence over a forwarded `Authorization` header and the browser-supplied identity header. Gateway, development, and insecure-agent principals replace the request body's `meta.userId` before the audit is created. An API-key principal is unscoped and preserves the explicit `meta.userId` as audit attribution.

The production proxy must remove client-supplied `X-Authenticated-User-Id` values before inserting its verified value. `X-User-Id` is rejected when `NODE_ENV` is absent, `test`, `production`, differently cased, or any value other than `development`; deprecated flags cannot override this. The API key must stay server-side and must not be compiled into a Vite `VITE_*` variable.

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

## Current organization-governance boundary

SPEC-26 adds empty, additive governance tables for profiles, organizations,
settings, memberships, invitations, append-only events, exports, deletion
requests, and legal holds. Organization UUIDs—not slugs, email domains,
profiles, legacy administrator grants, or record creators—are the customer
security boundary. One Auth user may retain different memberships and roles in
multiple organizations.

The versioned canonical capability registry and organization services live in
`backend/src/organizations/`; staged UI contracts live in
`frontend/src/features/organizations/`. Effective authority requires an active
membership and an allowed organization state. Unknown roles and capabilities
fail closed. Browser database roles have no governance-table access; RLS is
enabled without browser policies.

These tables do not alter current contract/property ownership. No Azar or Solar
row is created by SPEC-26. SPEC-27 now mounts governance endpoints behind a
revocable opaque application session, current organization/membership lookup,
capability evaluation, exact Origin, and CSRF validation. The protected
`/t/:organizationSlug/*` frontend resolves the slug through the server and uses
the returned immutable organization UUID for context, cache, draft, and epoch
boundaries; the slug is never treated as authorization.

SPEC-27 stores only keyed session/API-key hashes, keeps role and organization
authority out of cookies, revalidates current membership on protected requests,
and keeps support disabled by default. The historical signed administrator
cookie, global API key, trusted identity header, and legacy contract/property
routes remain Azar-only compatibility surfaces pending SPEC-34 migration and
removal; they are not organization authority and cannot authorize Solar.

## Staged shared platform-control boundary

SPEC-28 adds empty organization-owned stores for append-only audit and usage
events, atomic distributed rate-limit buckets, quota reservations, fair jobs,
deletion tombstones, and recovery evidence. Browser roles receive no table or
RPC access; RLS is enabled and forced. Privileged functions use a fixed
`pg_catalog` search path, schema-qualified objects, and explicit organization
arguments. No production data or organization is seeded.

New backend platform code lives under `backend/src/platform/`. It uses a
branded non-optional `OrganizationScope`, asserts returned organization IDs,
constructs the service-role client through one platform factory, applies safe
request IDs/errors/redaction, HMACs rate-limit subjects, signs pagination
cursors, and keeps restored external work paused until reconciliation. The
request-ID middleware applies to every backend response before JSON parsing.

The governance/context layer is mounted, but production remains Azar-contained.
Existing contract/property repositories, local logs/maps, and compatibility
principals remain legacy surfaces; they cannot authorize Solar or substitute for
SPEC-34 migration certification.

SPEC-30 adds the replacement property persistence boundary: organization-owned
durable drafts, immutable revisions, processing runs/steps, domain events, and
metadata-only provider intents. PostgreSQL is canonical; Drive, Sheets, Make,
local logs, and browser navigation state are projections or compatibility
evidence. This additive schema is not the current property write path. The mounted
`/api/organizations/:organization/properties/legacy` route remains a compatibility
surface; the durable SPEC-30 property domain and SPEC-31 asset platform are not
fully cut over.

SPEC-31 adds the shared private-file boundary. `media_assets` is canonical for
organization ownership and provider identity; durable upload sessions/intents
bind one trusted principal, owner, receiver, and exact generated object. Domain
tables—not a polymorphic path—associate verified assets with contract revisions,
property revisions, branding, or exports. New paths start with the immutable
organization UUID, while ordinary projections omit bucket, path, checksum, and
signed capabilities. All Storage buckets remain private.

The backend asset registry, receiver policies, state/verification rules, scoped
repository, and provider adapter live under `backend/src/assets/`. The browser
stores stable asset IDs and organization/epoch-partitioned state under
`frontend/src/features/assets/`; upload/view URLs remain transient memory-only
capabilities. This additive boundary does not mount routes or migrate objects:
SPEC-27 supplies trusted request context, SPEC-32 owns exported copies, and
SPEC-34 certifies Azar registration/cutover before Solar.

SPEC-32 adds the provider projection boundary. Domain transactions write
immutable, minimized `outbox_events`; deterministic fanout resolves only active
integrations owned by that event's organization. Stateless workers use fair
organization scheduling, atomic leases, fixed credential/configuration versions,
append-only attempts, stable external-resource markers, bounded retry, and
reconciliation before any resend after an ambiguous outcome. Secrets remain in
an external store (or approved envelope boundary), Drive resources are private,
Sheets are organization-separated, and webhook destinations/signatures are
organization-specific. The general integration-management API remains unmounted, but contract-generation
delivery is now mounted through the tenant contract status route. That route commits
intent first, then performs one bounded worker pass; a scheduler can run the same
worker independently. SPEC-34 still owns provider inventory, production cutover,
and removal of legacy direct-call paths.

SPEC-34 adds a restricted migration and release evidence plane under the
`migration_control` schema. It records immutable source mappings, validation,
artifact-bound certification, and Solar rollout decisions without granting normal
application authority. Backend helpers validate fixed distinct Azar/Solar identity,
quarantine ambiguous inventory, forbid core-isolation waivers, and gate real-data
stages on exact certification. The browser consumes only a closed feature projection
partitioned by organization, context epoch, and certification fingerprint.

This is an additive framework, not a production cutover. No Azar/Solar organization,
customer mapping, external destination, feature enablement, or release certification
is seeded by repository migration. Those actions require reviewed manifests,
production-shaped rehearsal, real-database/provider evidence, and named approval.
