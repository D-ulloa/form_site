# SPEC-34 acceptance traceability

Status: additive control-plane evidence, 2026-08-19. No production migration, tenant seed,
provider mutation, certification, go/no-go, or Solar real-data rollout has occurred.

| Scope | Implementation evidence | Automated evidence |
|---|---|---|
| Restricted evidence model | `20260819400000_spec34_migration_certification_control_plane.sql` creates runs, inventory, mappings, validation, certification, and rollout events in deny-by-default `migration_control` | `spec34-migration-contract.test.ts` |
| Manifest and identity gate | `migration/controlPlane.ts` validates distinct fixed UUIDs/slugs, source/deployment identity, exact feature states, thresholds, approvals, and excludes secret-shaped fields | `spec34-migration-control-plane.test.ts`; `spec34:validate-manifest` |
| Classification and idempotency | Evidence/reviewer-required Azar assignment, quarantine default, legal-hold-safe deletion, fingerprints, unique source mappings, and append-only mapping evidence | backend unit and migration contract tests |
| Certification and canary | Artifact/provider/rehearsal/validation/feature/threshold/approval gate; core waivers forbidden; linear Solar stages and mandatory incident containment | backend unit and migration contract tests |
| Browser disablement | Organization/epoch/certification-partitioned keys, closed safe feature projection, stale-result rejection, and exact `certified_enabled` availability | `rolloutState.test.ts` |
| Operations | Runbook covers preparation, CLI validation, inventory, quarantine, cutover, restore, incident containment, Solar progression, and closure | documentation review |

## Acceptance disposition

- Criteria 2, 12, 14, 26, 35–38: repository gates exist for fixed distinct identities,
  deterministic fingerprints, quarantine-first decisions, feature disablement, numeric
  thresholds, artifact-bound certification, and containment. They are not production evidence.
- Criteria 1, 3–11, 13, 15–25, and 27–34 require approved legacy inventories, implemented
  SPEC-27 identity/request context, migration/backfill/enforcement/cleanup migrations, real
  Storage/provider resources, compatibility retirement, session invalidation, and real-database
  adversarial/restore/performance exercises. They remain open.
- Criterion 39 has repository documentation for the staged control plane. Customer support,
  onboarding, deployment dashboards, and environment-specific operating material remain open.
- Criteria 40–41 require named cross-functional approvals and an immutable production
  certification matching deployed artifacts. They remain open and Solar real data is forbidden.

The additive schema and static tests do not claim completed multi-tenant isolation. Moving this
SPEC to `completed` requires the external evidence above, not only merging these files.
