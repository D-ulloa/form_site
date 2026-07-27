# Engineering Standards

Status: 2026-07-21.

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
- Persist agent metadata in localStorage via `AgentContext`.
- Render contract controls from the public schema and normalize values before transport. Client validation must never replace backend validation.
- Do not add `CONTRACTS_API_KEY` or any other server secret to `VITE_*` configuration.

## Backend standards

- Validate all incoming payloads before side effects.
- Use explicit step results for Drive, upload, Sheets, and Make.
- Return clear outcomes: `success`, `partial_failure`, or `failure`.
- Persist property logs and legacy SPEC-09 audits under `backend/logs/`; persist SPEC-10 contract entries, immutable role audits, and events in Supabase.
- Use environment variables only for secrets and external service configuration.
- Authenticate contract submit/audit routes before validation or filesystem access. Never trust a request-body user ID as the authenticated principal.
- Keep `X-Authenticated-User-Id` behind a proxy that strips caller-supplied values. Accept `X-User-Id` only when `NODE_ENV` is exactly `development`.
- Gateway/development principals override body attribution and remain owner-scoped. API-key principals preserve explicit body attribution and are intentionally unscoped; do not conflate attribution with authentication.
- Configure `TRUST_PROXY_HOPS` to the exact known proxy count before relying on `req.ip` in audits. Keep it `0` for direct connections.
- Validate SPEC-10 fields against role-specific schema projections and write them only through the server-side atomic Supabase function.
- Generate 32-byte role tokens, store only HMAC hashes, compare them in constant time, and return regenerated raw URLs once.
- Enforce HTTPS in production, `no-store`/`no-referrer` response headers, and per-IP/entry submission rate limits.
- Restrict contract administration to the server API key or configured `CONTRACT_ADMIN_USER_IDS`.
- For retained SPEC-09 routes, sanitize formula-leading strings, map fields deterministically, and use `RAW` for Sheet appends.
- Use the dedicated service-account helper for contract Sheet reads and writes. Do not let contract integration fall through to property user OAuth.
- Read and validate the complete ordered Sheet header row before append; preserve duplicate labels by position and fail before writing on any mismatch.
- Redact sensitive values in both structured fields and mapped rows. Never log Google credentials, API keys, authorization headers, or raw service errors containing secrets.
- Resolve `CONTRACT_AUDIT_LOGS_DIR` when each audit operation runs. Use it only for a writable persistent mount; a configured path on Vercel remains ephemeral and is not an audit-retention solution.
- Treat audit-write failure after a successful external append as a reconciliation event; do not silently report a fully audited success.
- Do not describe an append retry as duplicate-safe unless an idempotency mechanism is added. `retriable` classifies the provider failure, not whether Google committed the row.

## Documentation expectations

- Keep `docs/prd.md` as the source of product scope decisions.
- Use the numbered `docs/` structure for new canonical docs.
- Add implementation notes to the appropriate numbered folder rather than to root-level `docs/` files.
