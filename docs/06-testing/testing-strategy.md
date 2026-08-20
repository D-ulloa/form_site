# Testing Strategy

Status: 2026-08-19.

SPEC-27 adds `spec27-identity.test.ts` and
`spec27-migration-contract.test.ts` for 256-bit opaque credentials, independent
keyed hashes, host-only production cookies, CSRF/exact-Origin enforcement,
expiry/revocation/rotation shape, session limits, API-key CIDR restrictions,
current membership and cross-organization denial, forced RLS/grants, and safe
HTTP bootstrap/logout. Frontend `tenantState.test.ts` proves UUID/epoch-first
query keys, stale-callback denial, and organization-partitioned draft keys.
These repository tests do not replace disposable real-Postgres concurrency,
RLS, Auth, browser multi-tab, proxy, or production-shaped Azar/Solar evidence.

SPEC-25 adds fail-before-side-effect coverage for closed registration and
unauthenticated property requests, server-derived actor tests, exact-development
identity tests, startup guard tests, session-version behavior, forward-migration
markers, and static assertions against public Drive permissions or new webhook
literals. Production providers are verified manually against the containment
runbook; automated tests never call production APIs.

## Current coverage

The property workflow retains lightweight validation helpers. Contract Generation requires focused automated unit and route/integration coverage because its validation, authorization, mapping, and audit behavior form a security-sensitive boundary.

### Backend validation and manual tests

- `backend/test_upload_with_file.ts` — helper script to verify file upload behavior with real Drive integration.
- `backend/real_schema_test.ts` — schema validation test helper.
- `backend/test_special_keys.ts` — special-key validation helper.

### Frontend checks

- `npm run lint` in `frontend`.
- `npm run build` in `frontend` to verify Vite and TypeScript output.

### Current Contract Generation coverage

The backend suite runs with `cd backend && npm test`. It covers:

- SPEC-10 role splitting (`Inquilino`/`Garantes` vs. `Testigos`/`Contrato`), HMAC token storage and verification, entry creation, both role submissions, combined completion, admin inspection, token regeneration, and archive lifecycle.
- SPEC-11 repeatable `inquilinos`/`garantes` arrays, schema upload slots, client-token-authorized presigning, paired/private DNI reference enforcement, approval-field rejection, IPC/ICL validation, and UTC-safe server date recalculation including leap years and zero/absent update intervals.
- SPEC-12 Spanish-only hosted-form UI, `Propietario` presentation, compact contract-generation actions, hidden role-schema panels, guarantor subsection rendering, and per-guarantor salary-receipt/property-guarantee validation in both the browser and backend.
- SPEC-13 `Contrato` subdivision metadata, manual-only entry creation, immutable submission-row reads, schema-defined user/client inspection order, every partial/empty state, and validated short-lived DNI viewing URLs.
- SPEC-14 per-guarantor file-receiver metadata, exact evidence MIME and configurable size limits, client-token-authorized/rate-limited evidence presigning, strict path and live Storage-metadata verification, duplicate-reference rejection, typed verification outages, two-files-per-receiver and one-file-per-guarantor rules, and subsection-grouped administrator signed views without storage-location leakage.
- SPEC-15 UI polish and downloadable attachment presentation.
- SPEC-16 editable feedback, administrator corrections, and `Direccion` identification.
- SPEC-17 stable `/contracts/admin/:entryId` links, `Direccion`-first presentation, Argentinian placeholders, and required Frontal/Dorso DNI validation including PDF acceptance.
- SPEC-18 `IPC`/`ICL` selection, simplified upload guidance, and editable feedback recovery.
- SPEC-19 email/password request validation, Google OAuth session exchange, signed and remembered session cookies, logout, Supabase administrator-principal boundaries, migration trigger markers, dedicated unnamed login/register screens, and removal of agent setup from the main entry.
- The retained SPEC-09 compatibility boundary, including:
- Runtime contract configuration, public/private projection, malformed destination rejection, and strict service-account-only Google auth.
- Strict request validation for unknown fields, no numeric coercion, email, impossible ISO dates, minimum limits, contract-type mismatch, and allowed `meta.origin` values.
- Formula-injection sanitization for leading `=`, `+`, `-`, and `@`, including leading whitespace.
- Deterministic row order, optional blanks, mapping errors, exact header-row preflight, and duplicate-label order.
- Exact `RAW` append parameters, returned range, transient-only retries, and permanent Google failures.
- Sensitive-field and mapped-row redaction, expanded PII coverage, exclusive audit creation, strict receipt IDs, and isolated filesystem reads.
- Orchestration order, receipt shape, metrics, failure short-circuiting, non-retriable post-append audit failure, and submission ID format.
- Bearer, explicitly enabled trusted-gateway, and exact-development authentication; fail-closed precedence, owner scope, API-key scope, and inability of deprecated flags to enable hosted `X-User-Id`.
- Direct/cacheable public schemas, validation short-circuiting, exact receipts, typed `400/401/403/404/500/502/503` responses, and sanitized operational error logs.
- User-scoped attribution override, API-key attribution preservation, bounded request IDs, proxy-derived IP capture, and safe proxy-hop parsing.
- Authenticated audit retrieval, owner mismatch, API-key reads, invalid/missing IDs, missing records, and integrity failures.
- Call-time `CONTRACT_AUDIT_LOGS_DIR` resolution, explicit test overrides, and blank-value fallback to `backend/logs`.
- Schema-injected validation across all six field types, required `false`, select/pattern/length/max/email/date rules, and invalid schema rules.

The frontend suite covers:

- Real ISO calendar dates; required, email, range, pattern, length, and select rules; number/default normalization; and all six rendered field controls.
- Repeatable client blocks with one default item, add/remove behavior, two DNI controls per block, nested payload normalization, Ajuste options, read-only computed controls, and calendar-safe computed date previews.
- Passive salary-receipt/property-guarantee receivers, exact type and 10 MB default validation, cumulative two-file limits, removal and previews, multi-guarantor evidence isolation, submit-time form locking and presign/upload sequencing, stable-reference retry without duplicate uploads, ambiguous-response reconciliation, nested server errors, and admin grouping.
- Editable and read-only `Vigencia`, `Canon`, and `Ajuste` groups; passive contract-entry opening with an explicit creation action; and structured administrator inspection for both, partial, empty, and media states.
- Copy success and failure, normalized single-submit locking, retained data and focused server field errors, safe Sheet/audit receipt links, and Step B accessibility.
- Authenticated inline audit loading and failure display while retaining the audit `href`.
- Dedicated SPEC-19 login/register fields, password confirmation, API submission, redirects, site-palette presentation, and Google-compatible unnamed authentication copy.
- `AgentModal` dialog labeling, cancellation, and accessibility.
- Axe checks for all field controls, Step B, and `AgentModal`.

## Recommended test expectations

- Unit tests for `frontend/src/features/properties/schemas/propertySchema.ts` and media validation hooks.
- Integration tests for `backend/src/routes/properties.ts` and `backend/src/services/createPropertySubmission.ts`.
- SPEC-30 migration contract tests cover composite organization ownership,
  immutable history, scoped RPC/grant shape, atomic durable intents, and the
  absence of provider calls in the canonical transaction. Domain/frontend unit
  tests cover visibility, version/idempotency/retry decisions, redacted
  summaries, tenant cache/recovery keys, stale-response rejection, and conflict
  retention. Real-database/provider execution remains a SPEC-31/32/34 gate.
- Additional staging coverage for the Supabase database migration/RPC, RLS grants, and the private `contract-dni`/`contract-evidence` bucket restrictions.
- End-to-end tests covering the full property submission path, including Drive/Sheets/Make integration if feasible.
- Accessibility checks for the hosted role form, entry modal, and contract admin UI; legacy two-step modal tests remain compatibility coverage.
- An optional staging test against a least-privileged sandbox spreadsheet. Never point automated tests at a production contract sheet.
- Release validation checks for `npm run build` and `npm run typecheck`.

## Validation commands

- `cd frontend && npm run lint`
- `cd frontend && npm test`
- `cd frontend && npm run build`
- `cd backend && npm test`
- `cd backend && npm run typecheck`
- `cd backend && npm run build`

Tests that write audits use a temporary directory and remove their own fixtures; they must not modify committed historical files under `backend/logs/`.

Focused SPEC-14 backend coverage lives in `backend/tests/integration/contract-entries-spec14.test.ts`.

## SPEC-26 governance coverage

SPEC-26 adds static migration-contract tests plus unit coverage for the complete
versioned role matrix, deny-by-default capability evaluation, state machines,
last-owner validation, slug/email/locale/time-zone and branding validation,
allowlisted feature defaults, 256-bit invitation tokens, constant-time hash
comparison, and recursive secret redaction.

A disposable Supabase certification remains mandatory before completion. Apply
`20260818120000_spec26_organization_governance.sql`, verify grants and RLS using
browser roles, and race invitation acceptance plus two owner-reducing
transactions. Static SQL inspection cannot prove runtime isolation or locking.

## SPEC-28 platform-control coverage

`spec28-platform-controls.test.ts` covers validated organization scope and
returned-row assertions, safe error envelopes, recursive telemetry canaries,
fail-closed audit and limiter behavior, two-client shared limiter capacity,
usage idempotency contracts, quota denial, signed/filter-bound cursors, bounded
pages, fair scheduling/backoff/dead letters, manifest organization binding, and
external-effect reconciliation decisions.

`spec28-migration-contract.test.ts` checks the additive tables, organization
ownership, composite actor reference, organization-leading indexes,
append-only triggers, enabled/forced deny-by-default RLS, fixed function search
paths, restricted grants, atomic limiter/usage/job RPC shapes, request
correlation installation, and the new platform service-role import boundary.

Before production activation, apply both SPEC-26 and SPEC-28 migrations to a
disposable Supabase/Postgres project. Run concurrent limiter and job claims;
Azar/Solar RLS, composite-FK, cross-scope, append-only, rollback, and query-plan
tests; then perform isolated full/logical restore exercises. Static tests do not
substitute for those gates and automated tests must never use production
providers or state.

## SPEC-31 private asset coverage

`spec31-asset-platform.test.ts` covers organization-prefixed sanitized paths, receiver parity, active/unknown type denial, exact provider metadata and detected MIME verification, state transitions, tenant-first view authorization, property cover/order, safe disposition, and hold/association-aware cleanup. `spec31-migration-contract.test.ts` checks the durable registry/session/intent/receipt/mapping schema, composite contract/property/branding ownership, safe projection, forced RLS/grant removal, scoped idempotent RPC shape, atomic audit/usage evidence, and append-only history. Frontend `assetState.test.ts` covers organization/epoch cache partitioning, stable asset-ID promotion, transient URL removal, stale response rejection, and object-URL revocation.

Before production activation, apply the SPEC-31 migration to disposable Postgres/Supabase Storage. Race two finalizers and association versus cleanup; exercise Azar/Solar composite-FK/RLS attacks, quotas, reissue/revoke/expiry, missing/replaced/mismatched objects, scanner outage/quarantine, private direct list/read/delete denial, idempotent deletion receipts, restore tombstones/holds, and multi-instance behavior. Use generated non-sensitive fixtures only. Static SQL tests and mocked Storage do not certify provider behavior.

## SPEC-32 integration/outbox coverage

`spec32-integrations.test.ts` covers the provider registry, masked projections,
organization-bound secret AAD, transient secret cleanup, SSRF IP/DNS cases,
bounded exact-body signing, cross-tenant provider guards, private Drive ACLs,
Sheet receipts, delivery transitions/backoff, and zero/one/multiple reconciliation.
Migration tests cover all seven relations, composite ownership, indexes,
append-only evidence, deny-by-default grants, deterministic fanout, fair leased
claims, and token/version transitions. Frontend tests cover tenant cache keys,
stale responses, secret canaries, and write-only clearing.

Before activation, apply through SPEC-32 to disposable Postgres and race claims,
lease expiry, disable/rotation, and manual retry. Use distinct synthetic
Azar/Solar folders, Sheets, receivers, secrets, and credentials; test direct-ID,
timeout-before/after-commit, redirect/rebinding, duplicate markers, provider
outage, and restore reconciliation. Automated tests must use fakes and never a
production provider or credential.

## SPEC-34 migration and release coverage

`spec34-migration-control-plane.test.ts` covers manifest identity, feature/threshold
gates, deterministic fingerprints, quarantine-first disposition, legal holds,
non-waivable certification, approvals, and Solar containment. The migration contract
test checks the restricted durable evidence model, idempotency, append-only records,
artifact binding, forced RLS, and ordinary-role grant removal. Frontend
`rolloutState.test.ts` covers organization/epoch/certification partitioning, closed
responses, stale rejection, and disabled-route behavior.

These are static/additive checks. Release evidence must also apply the complete migration
chain to empty and production-shaped disposable databases; interrupt/resume/rerun
backfills; exercise Azar/Solar RLS, identifiers, assets, providers, caches, sessions,
workers, restore, rollback, ambiguity, and performance; and compare distinct staging
destinations. Automated suites never use production tenants, data, or credentials.
