# Testing Strategy

Status: 2026-07-29.

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
- SPEC-11 repeatable `inquilinos`/`garantes` arrays, schema upload slots, client-token-authorized presigning, paired/private DNI reference enforcement, approval-field rejection, IPC/IPL validation, and UTC-safe server date recalculation including leap years and zero/absent update intervals.
- SPEC-12 Spanish-only hosted-form UI, `Propietario` presentation, compact contract-generation actions, hidden role-schema panels, guarantor subsection rendering, and per-guarantor salary-receipt/property-guarantee validation in both the browser and backend.
- SPEC-13 `Contrato` subdivision metadata, manual-only entry creation, immutable submission-row reads, schema-defined user/client inspection order, every partial/empty state, and validated short-lived DNI viewing URLs.
- SPEC-14 per-guarantor file-receiver metadata, exact evidence MIME and configurable size limits, client-token-authorized/rate-limited evidence presigning, strict path and live Storage-metadata verification, duplicate-reference rejection, typed verification outages, two-files-per-receiver and one-file-per-guarantor rules, and subsection-grouped administrator signed views without storage-location leakage.
- SPEC-17 stable `/contracts/admin/:entryId` links, `Direccion`-first presentation, Argentinian placeholders, Google OAuth session boundaries, and required Frontal/Dorso DNI validation including PDF acceptance.
- The retained SPEC-09 compatibility boundary, including:
- Runtime contract configuration, public/private projection, malformed destination rejection, and strict service-account-only Google auth.
- Strict request validation for unknown fields, no numeric coercion, email, impossible ISO dates, minimum limits, contract-type mismatch, and allowed `meta.origin` values.
- Formula-injection sanitization for leading `=`, `+`, `-`, and `@`, including leading whitespace.
- Deterministic row order, optional blanks, mapping errors, exact header-row preflight, and duplicate-label order.
- Exact `RAW` append parameters, returned range, transient-only retries, and permanent Google failures.
- Sensitive-field and mapped-row redaction, expanded PII coverage, exclusive audit creation, strict receipt IDs, and isolated filesystem reads.
- Orchestration order, receipt shape, metrics, failure short-circuiting, non-retriable post-append audit failure, and submission ID format.
- Bearer, trusted-gateway, exact-development, and explicit insecure-agent authentication; fail-closed defaults and precedence; owner scope; and API-key scope.
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
- `AgentModal` dialog labeling, cancellation, and accessibility.
- Axe checks for all field controls, Step B, and `AgentModal`.

## Recommended test expectations

- Unit tests for `frontend/src/features/properties/schemas/propertySchema.ts` and media validation hooks.
- Integration tests for `backend/src/routes/properties.ts` and `backend/src/services/createPropertySubmission.ts`.
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

Focused SPEC-14 backend coverage lives in `backend/tests/contract-entries-spec14.test.ts`.
