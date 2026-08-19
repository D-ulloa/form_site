# Engineering Standards

Status: 2026-08-18.

## Project conventions

- Use TypeScript with strict typing in both `frontend` and `backend`.
- Keep frontend pages and feature modules separate: pages under `frontend/src/pages`, feature logic under `frontend/src/features`.
- Keep UI primitives in `frontend/src/components/ui`.
- Keep backend HTTP adapters thin and business logic in `backend/src/services`.
- Keep mapping logic in `backend/src/mappers`.
- Keep shared utilities in `backend/src/utils`.
- Keep contract destination IDs and mappings backend-only; expose an explicit public-schema projection instead of serializing server config.

## Frontend standards

- Use React Hook Form for form state and Zod for schema validation.
- Use `useCreatePropertySubmission` for submission side effects.
- Maintain explicit route structure: `/`, `/properties/new`, `/properties/success/:submissionId`.
- Treat those property routes as contained legacy compatibility surfaces. New
  property work uses organization-namespaced routes, durable drafts/results,
  immutable revisions, explicit `OrganizationScope`, optimistic versions,
  idempotency fingerprints, and organization-first browser keys.
- Legacy agent metadata may remain in local storage for presentation only; it must never authorize or attribute a property/contract request.
- Render contract controls from the public schema and normalize values before transport. Client validation must never replace backend validation.
- Keep SPEC-14 evidence receivers passive during file selection. Begin the signed upload preflight only from the explicit form submission action, lock the editable form during the save sequence, promote successful uploads to stable form-state references for retry, and remove `uploadUrl` before constructing the role payload.
- Do not add `CONTRACTS_API_KEY` or any other server secret to `VITE_*` configuration.

## Backend standards

- Authenticate property and contract requests before parsing uploads, validation that can touch providers/files, or other side effects; then validate all payloads.
- Use explicit step results for Drive, upload, Sheets, and Make.
- Return clear outcomes: `success`, `partial_failure`, or `failure`.
- Persist property logs and legacy SPEC-09 audits under `backend/logs/`; persist SPEC-10 contract entries, immutable role audits, and events in Supabase.
- Use environment variables only for secrets and external service configuration.
- Authenticate contract submit/audit routes before validation or filesystem access. Never trust a request-body user ID as the authenticated principal.
- Keep `X-Authenticated-User-Id` behind a reviewed proxy and require the explicit gateway adapter flag. Accept `X-User-Id` only when `NODE_ENV` is exactly `development`; no preview override may enable it.
- Gateway and development principals override body attribution and remain owner-scoped. API-key principals preserve explicit body attribution and are intentionally unscoped Azar-only compatibility; do not conflate attribution with authentication.
- Never edit an applied migration to remove a compromised value. Revoke it externally, preserve historical evidence, and add a forward migration.
- Configure `TRUST_PROXY_HOPS` to the exact known proxy count before relying on `req.ip` in audits. Keep it `0` for direct connections.
- Validate SPEC-10 fields against role-specific schema projections and write them only through the server-side atomic Supabase function.
- Independently validate contract media references before persistence: exact field and MIME allowlists, positive configured sizes, per-receiver counts, uniqueness, private bucket, entry/role/repeatable-item/filename path ownership, and live private-object MIME/size metadata.
- Keep DNI and guarantor evidence in separate private buckets. Persist only stable bucket/path metadata; never persist signed upload or administrator view URLs.
- Sign administrator media views only after validating the stored reference, return short-lived URLs, and omit storage bucket/path details from the normalized inspection response.
- Generate 32-byte role tokens, store only HMAC hashes, compare them in constant time, and return regenerated raw URLs once.
- Enforce HTTPS in production, `no-store`/`no-referrer` response headers, and per-IP/entry submission rate limits.
- Restrict contract administration to the server API key, the Supabase administrator-grant table, or configured `CONTRACT_ADMIN_USER_IDS`.
- For retained SPEC-09 routes, sanitize formula-leading strings, map fields deterministically, and use `RAW` for Sheet appends.
- Use the dedicated service-account helper for contract Sheet reads and writes. Do not let contract integration fall through to property user OAuth.
- Read and validate the complete ordered Sheet header row before append; preserve duplicate labels by position and fail before writing on any mismatch.
- Redact sensitive values in both structured fields and mapped rows. Never log Google credentials, API keys, authorization headers, or raw service errors containing secrets.
- Resolve `CONTRACT_AUDIT_LOGS_DIR` when each audit operation runs. Use it only for a writable persistent mount; a configured path on Vercel remains ephemeral and is not an audit-retention solution.
- Treat audit-write failure after a successful external append as a reconciliation event; do not silently report a fully audited success.
- Do not describe an append retry as duplicate-safe unless an idempotency mechanism is added. `retriable` classifies the provider failure, not whether Google committed the row.

## Multi-tenant platform standards

- Organization-owned persistence methods require `OrganizationScope`; never derive it from request JSON, slug, creator, assignee, or email.
- Match `organization_id` in every service-role query/RPC and assert every returned row. Cross-organization IDs map to generic `NOT_FOUND`.
- Create new platform service-role clients only in `backend/src/platform/serviceRoleClient.ts`. Existing constructors are documented legacy migration targets, not examples.
- Give parent tables `unique (id, organization_id)` and children composite organization foreign keys. Add organization-leading indexes from real query paths.
- Enable and force RLS without permissive browser policies for backend-only tables. A `security definer` RPC must use a fixed safe search path, schema-qualified objects, explicit scope, restricted execute grants, and real-database tests.
- Persist successful sensitive mutation, audit, usage, and outbox intent atomically. Fail high-risk work with `AUDIT_UNAVAILABLE` when required audit persistence is unavailable.
- Use `redactTelemetry` before general log/audit sinks. Do not send raw secrets, token/hash values, signed URLs, private paths, identity data, customer payloads, or raw provider errors.
- Use the distributed limiter policy registry for new protected actions. Process-local maps are forbidden as production authority.
- Use bounded, filter-bound opaque cursors and SQL filtering. Never fetch a global collection and filter it in application code.
- Jobs carry organization scope and idempotency, use fair claims and bounded retry/dead-letter behavior, and stay paused after restore until reconciliation.

## Documentation expectations

- Keep `docs/prd.md` as the source of property-workflow scope decisions; use SPEC-10 through SPEC-19 and the numbered canonical docs for Contract Generation behavior.
- Use the numbered `docs/` structure for new canonical docs.
- Add implementation notes to the appropriate numbered folder rather than to root-level `docs/` files.
