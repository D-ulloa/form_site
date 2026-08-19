# Runtime Files

Status: 2026-08-18.

## Persisted runtime artifacts

- Supabase `contract_entries` — current contract lifecycle, role payloads, and combined payload.
- Supabase `contract_submissions` — immutable one-per-role submission audits.
- Supabase `contract_events` — creation, role submission, completion, archive, and token-regeneration events.
- Supabase Storage `contract-dni` — default private SPEC-11 bucket for front/back DNI files.
- Supabase Storage `contract-evidence` — default private SPEC-14 bucket for guarantor salary-receipt and property-guarantee evidence.
- Supabase `audit_events` and `usage_events` — staged append-only SPEC-28 organization evidence.
- Supabase organization/platform limiter buckets, quota snapshots/reservations, and `platform_jobs` — staged shared operational authority; never replaced by local files in a multi-tenant path.
- Supabase `deletion_tombstones` and `recovery_evidence` — restricted append-only restore gates.

- `backend/logs/` — default local JSON location for property submissions and successful contract appends.
- `CONTRACT_AUDIT_LOGS_DIR` — optional contract-only audit location. The logger resolves it at call time for both persistence and retrieval; blank or unset falls back to `backend/logs`.

Legacy SPEC-09 contract audit names use `SUB-YYYY-MM-DD-<hex>.json`. A contract audit contains the schema and contract identifiers, redacted fields, a redacted mapped row, spreadsheet/tab metadata, appended range, submission/user/request identifiers, source IP, and timestamp. Fields marked `sensitive` are redacted by default in every audit representation, including the mapped row.

For an explicitly enabled reviewed gateway or exact-development authentication, the stored `userId` is the verified/header identity even when submitted `meta.userId` differs. No hosted insecure-agent mode exists. For API-key authentication, submitted `meta.userId` is preserved as attribution. User-scoped audit reads require that same identity; the Azar-only shared API key can read any valid contract audit.

## Build output

- `frontend/dist/` — built frontend output produced by `npm run build`.
- `backend/dist/` — compiled backend output produced by `npm run build`.

## Configuration and schema files

- `backend/.env` — local backend environment values (not committed).
- `backend/.env.example` — template environment values.
- `scheme.json` and `scheme_reworked.json` — canonical property schema references used by validation and integration logic.
- The backend contract registry — canonical contract fields, constraints, sensitivity markers, and private Sheet mapping.
- `supabase/migrations/20260729000000_contract_spec14.sql` — provisions the default private evidence bucket, 10 MB object limit, and exact PDF/image MIME allowlist.

## Temporary or generated files

- `node_modules/` — dependency installation directories.
- `frontend/dist/` and `backend/dist/` should be treated as build artifacts.
- `backend/logs/*.json` — generated audit output ignored for new files. Historical files already tracked by Git remain tracked until a separate, intentional repository cleanup.

## Notes

- The backend uses exclusive file creation for contract audit records so an existing receipt is not silently replaced.
- The contract logger creates the selected audit directory recursively. Configure a writable absolute mount path; changing the environment variable only selects a path.
- Contract audits are available only through the authenticated audit API; the logs directory is not served statically.
- Current contract submission JSON persists stable private media metadata. Signed upload URLs and ten-minute administrator view URLs are transient and are never stored in the contract tables.
- A direct evidence upload that succeeds before a final role submission fails can remain unreferenced in Storage. Only references accepted into immutable submission JSON are exposed through administrator inspection.
- Local disk is not durable on many serverless and container deployments. Production must use a mounted persistent volume or forward audit records to durable storage. A successful Sheet append followed by a disk failure requires operational reconciliation because the append cannot be rolled back.
- `CONTRACT_AUDIT_LOGS_DIR` does not make Vercel's ephemeral filesystem durable. A Vercel path may disappear between instances or deployments even when the variable is stable; use an external durable store there.
- An ambiguous Google append failure may also leave a row without an audit file because the backend persists the audit only after Google returns an appended range. Check the Sheet before retrying; this append path has no idempotency or deduplication store.
- Audit `ip` is the normalized Express `req.ip`. Configure `TRUST_PROXY_HOPS` only for known proxies; otherwise keep it at `0`.
- Legacy frontend agent metadata may remain in localStorage via `AgentContext`, but no property/contract authorization or attribution reads it.
- SPEC-28 export/backup artifacts must be encrypted, expiring, inventoried, and stored outside public buckets. Manifests contain checksums and encryption references, never plaintext secrets. Restored jobs and external intents remain paused until provider reconciliation.
