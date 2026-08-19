# SPEC-30 acceptance traceability

Status: additive implementation evidence, 2026-08-18. Final completion remains owned by the SPEC-34 cutover certificate and the deferred owning-spec gates below.

| Scope | Implementation evidence | Automated evidence |
|---|---|---|
| Organization ownership | `20260818200000_spec30_multitenant_property_domain.sql` gives all eight relations non-null ownership, composite keys/FKs, same-organization membership references, tenant-leading indexes, forced RLS, and browser grant removal | `spec30-migration-contract.test.ts` |
| Durable drafts | Idempotent create/edit draft and version-checked autosave RPCs create the aggregate before upload preflight and reject stale/non-open writes | migration contract tests; database execution remains cutover-gated |
| Immutable revisions | Finalization locks draft/property, checks edit base and versions, appends a numbered checksummed revision, advances the pointer, and immutable triggers block history mutation | `spec30-property-domain.test.ts`, migration contract tests |
| Runs and provider intents | Finalization creates durable runs, four allowlisted steps, metadata-only provider intents, event/audit/usage evidence, and no provider call inside the transaction | migration contract tests |
| Retry and lifecycle | Fingerprinted archive/reactivate and retry RPCs are tenant-scoped; retry fixes the revision and selects only failed/blocked steps | domain and migration contract tests |
| Canonical payload | `canonicalPropertySchema` excludes caller identity and cover transport fields, is strict, and retains the existing property business schema | backend typecheck and existing property validation tests |
| Scoped repository | `properties/multiTenantRepository.ts` scopes every query/RPC, bounds list size, paginates in SQL, and asserts returned ownership | backend typecheck; migration contract tests |
| Frontend isolation | Property keys begin with organization UUID/epoch; recovery includes organization/user/draft/schema; delayed responses and conflicts fail safely; terminal states are explicit | `multiTenantPropertyState.test.ts` |
| Operations | Conflict, immutable history, partial failure, uncertain outcome, orphan cleanup, reconciliation, recovery, and forward-only rollback procedures | `spec30-property-domain-runbook.md` |

## Invariant groups

The 34 invariants map to these enforced groups:

- 1–5, 9, 27, 34: composite ownership, scoped repositories, tenant-leading indexes, and generic scoped lookup.
- 6–8, 10–18, 30–33: durable drafts, strict canonical validation, immutable revisions/assets/events, server actor attribution, and versioned lifecycle.
- 19–26: fingerprints, unique idempotency, durable steps/intents, retry ancestry, post-commit provider execution, and membership revalidation.
- 28–29: organization-first query/recovery keys, context epochs, and delayed-response rejection.

## Deferred owning-spec gates

- SPEC-27: canonical organization request context, route middleware, organization switching, and endpoint mounting.
- SPEC-31: shared asset FK, private upload/finalization, verification, signing, retention, and cross-draft tests.
- SPEC-32: organization credentials/configuration, outbox worker, provider delivery/receipt/reconciliation, and suspension gates.
- SPEC-34: legacy property/log/provider/asset inventory, Azar assignment/quarantine, final non-null certification, route cutover, Solar enablement, restore/export evidence, and approvals.

The pending SPEC remains pending while these gates and product/security/data/backend/frontend/operations/integration/privacy approvals remain open. This repository implementation does not authorize production migration or a second real organization.
