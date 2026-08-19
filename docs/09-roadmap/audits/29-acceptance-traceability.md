# SPEC-29 acceptance traceability

Status: additive implementation evidence, 2026-08-18. Final completion remains owned by the SPEC-34 cutover certificate.

| Scope | Implementation evidence | Automated evidence |
|---|---|---|
| Organization ownership and composite boundaries | `20260818180000_spec29_multitenant_contract_domain.sql` adds tenant ownership, composite entry/child keys, assignment membership constraint, tenant-leading indexes, forced RLS, and browser grant removal | `spec29-migration-contract.test.ts` |
| Immutable revisions and concurrency | `spec29_append_contract_revision` locks `(organization_id, entry_id)`, verifies `expected_version`, applies scoped idempotency, appends revision/event/audit/usage, and advances projection pointers atomically | `spec29-contract-domain.test.ts`, `spec29-migration-contract.test.ts` |
| External role links | Independent hash-only link/session tables and version-checked zero-overlap rotate/revoke functions | token/state unit tests and migration contract tests |
| Template isolation | Structurally distinct global and organization template/version tables, organization enablements, fixed entry references, bounded definitions, and immutable published versions | template validator and migration contract tests |
| Private assets | Organization/entry/role/revision/field/purpose association relation without public provider paths | migration contract tests; SPEC-31 supplies provider verification/signing tests |
| Public branding | allowlisted display name, UUID asset handle, uppercase hex theme colors, and neutral platform fallback | branding unit tests |
| Scoped repository | `multiTenantRepository.ts` requires `OrganizationScope`, applies list/search/filter/cursor in SQL, and asserts returned ownership | backend typecheck; database execution tests remain cutover-gated |
| Frontend isolation | query keys start with organization UUID and context epoch, delayed-response guard, conflict edit preservation, and fragment token cleanup | `multiTenantContractState.test.ts` |
| Operations | link incident, reconciliation, conflict, immutability, and recovery procedures | `spec29-contract-domain-runbook.md` |

## Deferred owning-spec gates

- SPEC-27: canonical session/API-key/support/link request-context middleware and organization route mounting.
- SPEC-31: shared asset foreign key, upload finalization, verified association, retention, and signed media.
- SPEC-32: provider secrets, outbox claiming, Google/Make routing, generated-document delivery, and provider receipts.
- SPEC-34: Azar ownership/template/link/revision/file backfill, quarantine, non-null validation, legacy token-column removal, route switch, Solar enablement, and adversarial certification.

The pending SPEC is not moved to `completed/` while any of these gates remains open.
