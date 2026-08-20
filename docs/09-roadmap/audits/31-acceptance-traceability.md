# SPEC-31 acceptance traceability

Status: additive implementation evidence, 2026-08-19. Final production completion remains gated by the approvals, provider certification, and owning specifications below.

| Scope | Implementation evidence | Automated evidence |
|---|---|---|
| Registry and tenancy | `20260819000000_spec31_private_asset_platform.sql` adds organization-owned assets, durable sessions/intents, branding/export associations, deletion receipts, and migration mappings with composite ownership and tenant-leading indexes | `spec31-migration-contract.test.ts` |
| Private paths and projection | Database checks and `assetDomain.ts` generate `organizations/{organization}/{domain}/{owner}/{asset}/{safe_filename}`; `asset_safe_projection` omits bucket/path/checksum | asset unit and migration contract tests |
| Receiver parity | `receiverPolicy.ts` imports existing DNI/evidence MIME and configured-size rules, preserves distinct DNI slots and per-evidence-receiver count, rejects unknown/active types by default | `spec31-asset-platform.test.ts`; existing SPEC-11/14/17 suites |
| Durable lifecycle | Scoped RPCs create sessions/assets/intents atomically, fingerprint idempotency, lock finalization, compare registered provider facts, consume once, and count bytes idempotently | migration contract tests; real database race certification remains required |
| Authorization and delivery | `assetService.ts` requires trusted organization context, capability and owner authorization; `assetRepository.ts` scopes and asserts rows; delivery signs only after current authorization | asset unit tests; SPEC-27 route mounting remains deferred |
| Content and cleanup safety | Domain rules require detected allowlisted type, safe disposition, valid transitions, association/hold/retention checks; append-only deletion receipts preserve evidence | asset unit and migration contract tests |
| Property/contract/branding | Composite asset FKs bind SPEC-29/30 associations; property layout validates order/cover; branding originals/derivatives use explicit approval state | migration and domain tests |
| Browser isolation | Organization/epoch-first asset keys, stable `asset_id` promotion, transient-capability stripping, stale-response rejection, and preview revocation | `assetState.test.ts` |
| Migration and operations | Azar-only mapping/quarantine schema and private-assets runbook cover inventory, copy/verify, cleanup, incidents, recovery, and forward-only rollback | static migration tests and documentation review |

## Acceptance-criterion groups

- 1–7, 15–17, 26, 34: organization-owned schema, composite FKs, forced RLS/grants, safe projections, scoped repository, and browser isolation.
- 8–14, 21, 32–33, 35–36: durable session/intent state, receiver policy, quota hook, live verification, idempotent usage, stable frontend references, and removal of process-local authority at cutover.
- 18–20: detected MIME policy, active-content denial, safe disposition, quarantine, and explicit private-original/approved-derivative branding state. Actual derivative/scanner provider certification remains gated.
- 22–25: symbolic retention classes, legal holds, pre-delete checks, append-only receipts, and recovery contract. Numeric POL-09 values and live cleanup worker activation remain gated.
- 27–31, 39: Azar-only immutable migration mapping, ambiguity quarantine, verify-before-switch state, provider-copy handoff, and explicit Solar block.
- 37–38, 40: canonical documentation/runbook and this traceability matrix; cross-functional approval is outstanding.

## Deferred owning-spec and approval gates

- SPEC-25: final POL-09 numeric retention/legal bases, POL-10 support constraints, and POL-11 suspension decisions.
- SPEC-27 supplies trusted member/API-key context, switching, and route middleware; asset endpoint activation remains coupled to SPEC-34 provider/legacy cutover, while support stays disabled.
- SPEC-32: private exported-copy receipts, Drive ACL remediation, integration workers, and deletion coordination.
- SPEC-34: complete production inventory, Azar adjudication, copy/checksum execution, legacy resolver removal, route cutover, multi-instance/provider/restore certification, and Solar enablement.
- Product, security, data, backend, frontend, operations, storage/integration, and privacy/legal approvals remain outstanding.

The pending SPEC remains pending. This implementation does not apply a production migration, expose a public bucket, publish branding, delete/move an object, change Drive ACLs, or authorize a second real organization.
