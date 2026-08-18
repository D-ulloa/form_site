# SPEC-34 / MT-SPEC-10 Multi-tenant SaaS — Azar migration, final cutover, certification, and Solar rollout

**Date:** 2026-08-18
**Priority:** critical, final multi-tenant release gate
**Status:** pending prerequisite specifications, implementation, rehearsal, and go/no-go approval
**Roadmap identifier:** MT-SPEC-10
**Dependencies:** MT-SPEC-01 through MT-SPEC-08, plus every MT-SPEC-09 module selected for Solar
**Blocks:** production onboarding of Solar or any second organization with real data

---

## Specification identity

**Name:** Existing-data migration, legacy resource remediation, final constraint enforcement, compatibility removal, adversarial certification, and staged release.

**Description:** Define and execute the additive migration from the current single-tenant deployment to the organization architecture; prove every existing user, business row, file, provider destination, credential, and operational artifact belongs to Azar or is quarantined; enforce the final tenant boundary; remove every compatibility bypass; and use Solar as a controlled isolation canary.

**Why it is necessary:** Organization-aware application code alone does not secure existing null-owned rows, old sessions, raw file references, public Drive folders, global provider destinations, legacy routes, or insecure identity fallbacks. A second organization may hold real data only after the existing Azar estate has been classified, migrated, reconciled, constrained, restored in rehearsal, and subjected to end-to-end cross-tenant attacks.

## Summary

This specification is the final release contract for converting the existing application into a production multi-tenant SaaS. It joins the preceding design specifications into one controlled migration and certification program.

The work proceeds additively. New organization-aware tables and nullable ownership columns are deployed first. A fixed, reviewed Azar organization is seeded. Existing identities, contract data, property artifacts, Storage objects, Drive/Sheets/Make resources, and configuration are inventoried and assigned to Azar only when evidence supports that decision. Anything unverifiable is quarantined rather than made globally visible. Shadow comparisons and controlled dual-write/read periods prove the new paths before non-null constraints, composite foreign keys, tenant-leading indexes, tested RLS, and organization-scoped provider routing become mandatory.

After the migration is proven, all null-owner visibility, `contract_admin_users` authorization, global customer API keys, insecure agent identities, old application sessions, fixed webhook behavior, and legacy global adapters are removed or disabled. A real-database adversarial suite then certifies Azar/Solar isolation across synchronous APIs, direct identifiers, files, external links, background jobs, integrations, support, billing, reporting, caches, session changes, concurrency, recovery, and failure ambiguity.

Solar is the release canary, not a test shortcut. It advances from an empty organization through synthetic data and a controlled user cohort to real data only when the exact enabled feature set has passed its gates. Any unfinished feature is disabled in both its UI and every backend/API/background path.

This document defines the implementation and evidence contract. It does not perform production migration, choose unapproved business mappings, rotate credentials, alter provider ACLs, create Solar, or authorize the release by itself.

## Authority and relationship to other specifications

This is the tenth formal implementation SPEC derived from:

- `docs/09-roadmap/specs/research/23-RESEARCH-multi-tenant-saas-architecture.md`;
- `docs/09-roadmap/specs/research/24-RESEARCH-multi-tenant-saas-specification-roadmap.md`;
- `docs/09-roadmap/specs/pending/25-SPEC-multi-tenant-policy-threat-model-containment-and-inventory.md`;
- `docs/09-roadmap/specs/pending/26-SPEC-multi-tenant-organizations-memberships-onboarding-and-lifecycle.md`;
- `docs/09-roadmap/specs/pending/28-SPEC-multi-tenant-database-enforcement-audit-abuse-observability-and-recovery.md`;
- `docs/09-roadmap/specs/pending/30-SPEC-multi-tenant-properties-submissions-modifications-and-management.md`;
- `docs/09-roadmap/specs/pending/31-SPEC-multi-tenant-private-assets-uploads-retention-and-storage-migration.md`;
- `docs/09-roadmap/specs/pending/32-SPEC-multi-tenant-integrations-secrets-outbox-google-and-make.md`; and
- `docs/09-roadmap/specs/pending/33-SPEC-multi-tenant-commercial-saas-and-enterprise-extensions.md`.

MT-SPEC-03 and MT-SPEC-05 are not currently present as project documents. Their required authentication/request-context and contract-domain contracts must be drafted, approved, and implemented before this final gate can pass. All referenced multi-tenant documents are currently pending; this SPEC cannot treat a proposed contract as implemented evidence.

The preceding specifications own their domain designs. This SPEC owns their migration order, proof of existing-state classification, final enforcement, compatibility retirement, whole-system certification, and staged release. If a conflict exists, the stricter tenant-isolation or fail-closed rule applies until the owning specifications are reconciled explicitly.

## Current repository context

The present application contains single-tenant assumptions that this migration must address explicitly:

- Supabase migrations under `supabase/migrations/` define the existing contract persistence and access-control history. Applied migrations must not be edited.
- Contract administration still uses application sessions containing global `isAdmin` state and authorization backed by `contract_admin_users`.
- Contract routes contain a legacy/no-owner visibility rule.
- `CONTRACT_ALLOW_INSECURE_AGENT_ID` and the matching frontend compatibility identity can admit an identifier without the final organization session model.
- Property submission retains a legacy multipart route and accepts caller-visible `agent_user_id` values.
- Property upload sessions are currently process-local and keyed to an agent identifier rather than a durable organization context.
- Contract and property file services use global Supabase bucket/prefix configuration and raw provider operations.
- Google Drive, Sheets, and Make use global environment destinations such as `GOOGLE_DRIVE_PARENT_FOLDER_ID`, `GOOGLE_SHEET_ID`, `CONTRACT_GOOGLE_SHEET_ID`, and `MAKE_WEBHOOK_URL`.
- Legacy contract Google Form/Sheet configuration is still present for compatibility endpoints.
- Existing browser caches and `sessionStorage` contract tokens are not yet partitioned by organization.
- Current provider workflows can report success without proving that the resource reached the correct tenant-specific destination.

These are inventory starting points, not an exhaustive list. MT-SPEC-01's executable surface inventory remains authoritative and must be refreshed immediately before each rehearsal and production cutover.

## Motivation

The most dangerous migration failure is a successful-looking release that silently assigns ambiguous data to Azar, exposes null-owned records to every organization, sends Solar work to Azar's providers, preserves a global administrator bypass, or rolls back into global visibility. The migration therefore requires evidence for each artifact and negative proof for each boundary.

The first tenant is also a migration customer. Azar's existing workflows, immutable history, files, audit meaning, and provider outcomes must survive the change without duplication or loss. Solar supplies the first independent boundary against which the architecture can be tested under real routing and lifecycle behavior.

## Objective

Migrate the complete existing Azar estate into explicit organization ownership; quarantine every unresolved artifact; enforce tenant identity at application, database, storage, cache, worker, and provider boundaries; remove obsolete global compatibility mechanisms; prove restoration and phase-safe rollback; certify every enabled path with a two-organization adversarial matrix; and release Solar through a monitored, reversible canary without ever restoring cross-tenant visibility as a fallback.

## Terminology

- **Azar:** Reviewed organization representing the legitimate existing single-tenant customer estate.
- **Solar:** Controlled second organization used as the isolation canary before accepting unrestricted second-tenant real data.
- **Migration manifest:** Versioned, immutable input identifying the run, environment, fixed organization IDs/slugs, source snapshots, approved mappings, feature selection, and expected checksums.
- **Inventory item:** One discovered row, object, identity, credential reference, provider resource, runtime artifact, or compatibility path requiring disposition.
- **Disposition:** Reviewed outcome: migrate to Azar, retain as already scoped, quarantine, exclude as non-business/test data, or delete after approved grace and retention checks.
- **Quarantine:** Deny-by-default state outside normal tenant queries and provider processing, accessible only through audited remediation tooling.
- **Backfill:** Idempotent attachment or conversion of existing state to the canonical organization model.
- **Shadow comparison:** Read-only comparison between old and new representations or destinations without changing the user-visible result.
- **Dual-write:** Temporary, idempotent write to old and new representations when required for transition; never permission to invoke an external side effect twice.
- **Compatibility adapter:** Temporary authenticated endpoint translating a legacy contract into the canonical organization-aware service.
- **Final constraint:** Non-null ownership, composite relationship, RLS, uniqueness, index, or application invariant applied after verified backfill.
- **Certification run:** Immutable record of the exact revision, schema, flags, fixtures, destinations, tests, results, exceptions, and approvals evaluated for release.
- **Canary:** Restricted Solar cohort and workload used to validate production behavior before broader release.
- **Go/no-go:** Recorded multi-owner decision to advance, hold, or roll back a release phase.

New visible and persisted contracts use `snake_case`; environment variables use `UPPER_SNAKE_CASE`. Internal TypeScript follows repository conventions.

## Scope

### Includes

- Supabase migration-history reconciliation and additive ordered migrations.
- Fixed Azar organization creation with reviewed slug/settings.
- Existing user, administrator, role, and membership review.
- Contract entry, submission, event, revision, link, and file-association backfill.
- Recoverable property-log import into canonical properties, revisions, processing runs, and assets.
- Complete Storage and external-provider resource inventory, ownership registration, controlled copy, quarantine, retention, and deletion decisions.
- Azar-specific Drive, Sheet, Make, and secret configuration seeded from reviewed global settings.
- Public Drive ACL remediation and legacy credential rotation.
- Additive deployment, temporary adapters, shadow reads/counts, and tightly bounded dual-write.
- Final constraints, RLS policies, tenant-leading indexes, and removal of null-owner behavior.
- Replacement and removal of legacy admin/API-key/identity/session paths.
- Backups, restore rehearsal, phase-specific rollback, and outbox replay protection.
- Real-database Azar/Solar fixtures and the complete adversarial test matrix.
- Staged Solar rollout, monitoring, quantitative thresholds, approvals, rollback, and post-release verification.
- Documentation, support readiness, incident exercises, and evidence retention.

### Excludes

- Inferring organization membership or durable roles from free-text identity metadata.
- Automatically assigning ambiguous artifacts to Azar merely because Azar is the first tenant.
- Editing an already-applied Supabase migration.
- Allowing null ownership, global visibility, or disabled RLS as rollback mechanisms.
- Treating UI hiding as feature disablement or authorization.
- Running real external side effects in automated tests; provider boundaries use fakes, dedicated staging resources, or explicitly approved sandbox accounts.
- Selecting prices, custom domains, SSO, dedicated infrastructure, analytics, or another MT-SPEC-09 module that product has not selected for Solar.
- Deleting quarantined data before review, retention/legal-hold evaluation, backup, notice where required, and expiration of the approved grace period.
- Using Solar production data to discover whether migration controls work.

## Dependency and readiness gate

No production backfill begins until all of the following are recorded:

1. MT-SPEC-01 through MT-SPEC-08 are approved and their required implementation is deployed to the rehearsal environment.
2. Missing MT-SPEC-03 and MT-SPEC-05 documents are approved and implemented.
3. Every MT-SPEC-09 module intended for Solar is explicitly listed as `enabled_for_certification`; all others are backend-disabled and UI-disabled.
4. The live surface inventory has no unknown privileged route, worker, bucket, prefix, destination, secret store, cache, cron, or support path.
5. Migration history and deployed database schema have been reconciled across local, staging, and production.
6. A production-equivalent rehearsal has completed from a sanitized snapshot.
7. Backup creation and point-in-time/selected restore capabilities have been proven.
8. Security, product, data owner, backend, frontend, operations, provider owner, support, and release owner are named.
9. Quantitative stop/rollback thresholds are approved before the window begins.
10. Customer communication, maintenance/read-only behavior, and incident channels are approved.

An unmet prerequisite is a no-go, not an exception that can be accepted during the cutover call.

## Non-negotiable migration and release invariants

1. Every active business row has one non-null `organization_id` before Solar can hold real data.
2. Every child row agrees with its parent organization's identity and is protected by a composite relationship or equivalent tested invariant.
3. Every live asset and provider resource has one recorded owner and canonical parent; unresolved resources are quarantined.
4. No normal tenant query can return quarantined data.
5. Azar uses one fixed, reviewed UUID and slug per environment, declared in the migration manifest and never generated independently by each script.
6. Solar uses a distinct fixed reviewed UUID/slug and distinct provider destinations.
7. Existing rows are assigned to Azar only by an approved rule with recorded evidence and counts.
8. Free-text user metadata never grants a durable role or membership.
9. Active membership and capability checks replace global admin flags and legacy grant tables.
10. Organization context is server-derived; caller-provided IDs are consistency assertions only.
11. Null ownership never means globally visible.
12. Legacy routes are authenticated adapters to canonical services, not alternate repositories or authorization paths.
13. A compatibility adapter cannot remain enabled after its published retirement gate.
14. Dual-write is bounded by flags, metrics, an owner, a deadline, idempotency, and reconciliation.
15. Dual-write never sends two emails, webhooks, Sheet appends, Drive writes, or other external effects for one logical event.
16. Shadow reads cannot disclose comparison results or alternate-tenant data to the requester.
17. Backfill jobs are batchable, resumable, idempotent, observable, and safe under retry.
18. Every backfill decision retains source ID, source fingerprint, destination ID, run ID, decision, reason, and reviewer where required.
19. No destructive cleanup occurs in the same phase as initial discovery or assignment.
20. Historical revisions/events retain immutable meaning, authorship evidence, and timestamps.
21. Provider success requires the correct organization destination, not merely an HTTP success status.
22. Completed outbox effects are never replayed by migration, restore, or rollback.
23. RLS is tested with ordinary authenticated roles and cannot be bypassed by application omission.
24. Service-role paths still require explicit organization predicates and audit context.
25. Tenant-leading indexes exist for every enabled tenant-scoped access path before production load.
26. Cross-tenant direct UUIDs and tokens produce generic not-found/invalid behavior without existence leaks.
27. Old application sessions are invalidated at final cutover; all new sessions resolve active organization-aware authorization.
28. Role downgrade, suspension, logout, and organization switch invalidate or partition browser/server caches and in-flight results.
29. Raw Storage paths and external provider IDs are never accepted as proof of tenant ownership.
30. Old credentials are rotated or revoked after verified cutover, not merely removed from documentation.
31. Backups taken before enforcement/removal are access-controlled, encrypted, inventoried, retention-bound, and never mounted as globally visible data.
32. Rollback restores a secure prior phase or disables affected functionality; it never restores global visibility or insecure identity.
33. Every enabled Solar feature passes same-tenant positive and Azar/Solar negative tests at every reachable interface.
34. Disabled Solar features reject backend/API/background execution as well as disappearing from the UI.
35. No release approval is based only on row counts; identifiers, relationships, checksums, samples, and side-effect destinations are reconciled.
36. Exceptions are explicit, time-bounded, owned, risk-approved, monitored, and cannot waive a core isolation invariant.
37. Migration logs and dashboards do not contain secrets, raw credentials, access tokens, or unnecessary personal data.
38. A failed scope assertion stops the affected operation and emits a tenant-safe alert.
39. Azar remains functional and isolated throughout the Solar canary.
40. Solar real-data enablement requires the final immutable certification artifact and named go/no-go approval.

## Migration control plane and evidence model

Migration evidence must be durable and queryable. It may live in a restricted migration schema or equivalent reviewed store, but it must not depend only on terminal output or mutable spreadsheets.

### `migration_runs`

Required fields:

- `id`;
- `environment`;
- `manifest_version`;
- `source_snapshot_id` and `source_schema_version`;
- `application_revision` and `target_schema_version`;
- `started_at`, `completed_at`, and `status`;
- `mode` (`dry_run`, `rehearsal`, `production`, `validation`, or `rollback`);
- `azar_organization_id` and `solar_organization_id`;
- `initiated_by_user_id` and approval references;
- `checkpoint` and resumability metadata;
- expected/observed aggregate fingerprints; and
- immutable result artifact location.

### `migration_inventory_items`

Required fields:

- `id`, `migration_run_id`, `source_system`, `artifact_type`, and `source_identifier`;
- `source_parent_identifier` and normalized source fingerprint;
- discovered ownership signals without treating them as authorization;
- `proposed_disposition`, `final_disposition`, and target organization/resource identifiers;
- `reason_code`, evidence reference, confidence classification, reviewer, and review timestamp;
- quarantine state and retention/deletion eligibility;
- processing status, attempts, last error code, and timestamps; and
- uniqueness preventing the same source artifact from receiving conflicting active mappings.

### `migration_mappings`

Mappings retain source-to-canonical identity across reruns and rollback:

- source system/type/ID;
- source fingerprint;
- canonical table/type/ID;
- organization ID;
- migration run/version;
- mapping state;
- copied-object checksum/version where applicable; and
- supersession or rollback reference without erasing history.

### `migration_validation_results`

Each result records:

- run, stage, invariant/check identifier, and query/tool version;
- expected and actual value;
- pass/fail/waived status;
- sanitized evidence location;
- started/completed timestamps;
- affected organization and artifact class; and
- approver for any non-core exception.

Core isolation checks cannot be waived.

### `release_certifications`

The final certification binds:

- application commit, build artifact, database schema/migration head, worker version, and frontend version;
- feature flags and enabled MT-SPEC-09 modules;
- Azar/Solar fixture and provider-destination identifiers;
- test suite versions and immutable results;
- migration and restore rehearsal run IDs;
- open exceptions and expiration dates;
- monitoring dashboard/alert versions;
- go/no-go approvals and timestamps; and
- Solar rollout cohort and rollback thresholds.

Production release is invalid if deployed artifacts or flags differ materially from this record.

## Inventory and disposition rules

### Identity inventory

Inventory all Supabase Auth users, application profile records, `contract_admin_users`, legacy password/Google identities, external role-link identities, customer API keys, support identities, suspended/deleted accounts, and orphan author IDs.

For each person or machine identity:

1. Normalize identifiers without merging solely by display name.
2. Establish legitimate ownership using reviewed source evidence.
3. Create or link the canonical user profile.
4. Create an Azar membership only when approved.
5. Translate legacy privileges to the least-privileged canonical role/capabilities through a reviewed mapping table.
6. Mark uncertain, duplicate, stale, or unauthorized grants for quarantine/revocation.
7. Require owners to be explicitly reviewed; no metadata-derived owner.
8. Preserve an audit link from old grant to new membership.

### Contract inventory

Inventory every contract entry, current/revised payload, submission, event, status transition, archive marker, external role token/link, DNI/evidence object, created/updated actor, Google reference, and audit record.

Entries with verified existing-business provenance backfill to Azar. Children derive `organization_id` from the canonical parent in the same controlled operation. Validation rejects any parent-child disagreement, orphan, duplicate logical contract, altered immutable revision, missing asset, or token whose intended entry/role cannot be proven.

### Property inventory

Inventory structured rows plus current file/runtime sources, including submission logs, audit logs, processing status, local job files, uploaded media metadata, Drive folder/file IDs, Sheet results, Make payload/outcome, and retry history.

Recoverable records become canonical Azar properties, immutable revisions, processing runs, outbox events, and asset links according to MT-SPEC-06 through MT-SPEC-08. A line in a log is not trusted merely because it parses: required identity, timestamps, fingerprints, and referential evidence must be checked. Unverifiable or partial records are quarantined with a remediation reason.

### Asset inventory

Enumerate every object in all known Supabase buckets/prefixes and every referenced contract/property/branding provider resource. Compare storage enumeration to database references in both directions.

Each object must be one of:

- registered in place with proven Azar organization and canonical parent;
- copied into the canonical organization-prefixed private location with immutable mapping/checksum;
- retained as immutable historical source with access removed and a canonical association;
- quarantined for review; or
- scheduled for deletion only after policy, backup, legal hold, customer review, and grace-period gates.

Unreferenced does not automatically mean disposable, and referenced does not automatically prove ownership.

### Provider and credential inventory

Inventory Drive folders/files/ACLs, Sheets, Make webhooks/scenarios, OAuth/service-account grants, global environment destinations, webhook secrets, external role-token secrets, Storage signing credentials, and any operator-maintained provider mapping.

Seed Azar's canonical integration records from reviewed current configuration. Create separate Solar staging/production destinations. Remove public or link-wide ACLs where policy forbids them. Rotate/revoke superseded credentials after the new route is proven. Never copy secret values into migration reports.

### Compatibility inventory

Inventory every legacy route, request field, header, cookie, session claim, env flag, frontend fallback, raw-path operation, global cache key, cron/worker, support script, and runbook instruction that can bypass canonical organization resolution. Each receives an owner, replacement, disable flag, last-use telemetry, retirement version, negative test, and removal evidence.

## Database migration history and schema sequencing

1. Export the production migration ledger and schema fingerprint.
2. Reconcile it against ordered files under `supabase/migrations/`, including previously applied contract migrations.
3. Stop if a filename/checksum/order differs or an applied migration lacks a reviewed repository counterpart.
4. Never edit an applied file. Add a later, forward-only migration that corrects it.
5. Test upgrade from a production-equivalent snapshot and creation from an empty database.
6. Record pre/post schema fingerprints, function/policy definitions, grants, indexes, triggers, and migration head.
7. Separate additive schema, backfill, validation, constraint enforcement, and cleanup/removal into independently observable phases.

The required order is:

1. Create organization/member/session/audit/domain/asset/integration/outbox/migration structures.
2. Add nullable `organization_id` and new relationship columns to existing tables.
3. Add non-validating checks or indexes that do not reject existing rows where supported.
4. Deploy application code capable of canonical reads/writes while legacy paths remain controlled.
5. Backfill and reconcile.
6. Validate zero-gate queries.
7. Add/validate composite foreign keys, tenant-scoped uniqueness, and tenant-leading indexes.
8. Make organization ownership non-null for active business data.
9. Enable/test final RLS and revoke obsolete grants.
10. Remove null-owner/global compatibility logic and later remove obsolete columns/tables only after the retention window.

## Migration phases

### Phase 0 — freeze, snapshot, and readiness

- Freeze schema/route/provider changes unrelated to the approved cutover.
- Refresh the executable surface inventory and enabled-feature manifest.
- Capture database, Storage, runtime-file, and provider inventories with fingerprints.
- Create and verify protected backups.
- Establish a maintenance/read-only strategy and change log.
- Run the migration in `dry_run` mode; review every ambiguous decision.
- Approve go/no-go roles, thresholds, communications, and rollback commands.

Exit: prerequisites pass, inventory is complete enough to explain discrepancies, and a rehearsal from the same class of snapshot has passed.

### Phase 1 — additive foundation

- Apply additive schema only.
- Deploy canonical repositories, authorization context, audit, asset, integration, outbox, and migration tooling behind server-enforced flags.
- Leave nullable columns only for the explicit transition window.
- Verify old behavior remains available to Azar without exposing new tenant paths.

Exit: schema/app compatibility tests pass in both old-controlled and new-shadow modes.

### Phase 2 — seed Azar and reviewed configuration

- Create Azar using the fixed manifest UUID/slug.
- Apply reviewed settings, branding, lifecycle state, retention, limits, and selected feature configuration.
- Seed integration metadata referencing the approved secret store.
- Record all seed values and checksums; reruns must be idempotent.

Exit: exactly one canonical Azar exists and no duplicate slug/UUID/configuration has been generated.

### Phase 3 — identities and memberships

- Import/link legitimate current users.
- Replace reviewed `contract_admin_users` grants with Azar memberships and least privilege.
- Create machine/API identities only with explicit scope and rotation metadata.
- Quarantine/revoke ambiguous grants.
- Compare expected active users, memberships, roles, suspended states, and orphan authors.

Exit: every active user path resolves canonical membership and the reviewer signs the mapping report.

### Phase 4 — contracts

- Backfill every verified contract entry to Azar.
- Derive submission/event/revision/association ownership from its parent.
- Register contract assets without altering immutable content.
- Map external role links/tokens to the canonical entry, role, expiry, and organization.
- Reconcile counts, identifiers, statuses, revisions, hashes, and samples.

Exit: no active unassigned contract row, parent-child mismatch, orphan asset, or unreviewed active legacy grant remains.

### Phase 5 — properties

- Parse and fingerprint recoverable property logs/runtime state.
- Import canonical property identity, revisions, processing runs, and actor/timestamp history.
- Relate uploads and provider results.
- Quarantine records that cannot meet minimum provenance or completeness rules.
- Reconcile source records, canonical records, revisions, runs, files, and terminal outcomes.

Exit: every discovered business artifact is canonical or quarantined and no legacy file is the sole active source of truth.

### Phase 6 — assets

- Enumerate database-to-storage and storage-to-database differences.
- Register, copy, or quarantine every live object according to the approved disposition.
- Verify byte size, MIME/type policy, hash, canonical parent, organization prefix, privacy, and signed-view behavior.
- Preserve immutable mapping when keys change.
- Disable public access and raw-path bypasses after verification.

Exit: zero unmapped live assets and successful Azar/Solar signed-view denial tests.

### Phase 7 — integrations and external resources

- Create organization-scoped integration records and secret references.
- Seed Azar destinations from reviewed globals and configure distinct Solar test destinations.
- Remediate Drive ACLs and validate Sheet/folder/webhook ownership.
- Introduce canonical outbox/worker routing with idempotency.
- Rotate/revoke fixed webhook and old credentials when the canonical path is stable.

Exit: destination-aware tests prove Azar events reach only Azar resources and Solar events only Solar resources.

### Phase 8 — controlled shadow and transition period

- Enable canonical writes for a restricted Azar cohort.
- Use dual-write only where an old representation must remain temporarily readable.
- Compare old/new counts, hashes, statuses, latency, and provider outcomes continuously.
- Record every divergence and pause on a threshold breach.
- Prevent background workers from consuming the same logical event twice.
- Publish adapter last-use metrics and drive usage to zero.

Exit: the approved stability window completes with no unexplained divergence or isolation alert.

### Phase 9 — final database enforcement

- Re-run zero-gate queries on a stable snapshot.
- Apply/validate composite foreign keys and tenant-scoped uniqueness.
- Apply non-null ownership to active business data.
- Create/verify tenant-leading indexes and query plans.
- Enable final RLS policies and revoke obsolete table/function/bucket grants.
- Verify ordinary roles, service-role repositories, and background workers separately.

Exit: final constraints are valid, RLS negative tests pass, and performance stays within approved limits.

### Phase 10 — compatibility and session removal

- Remove null-owner visibility.
- Stop reading/writing `contract_admin_users` for authorization.
- Revoke global customer API keys and replace them with scoped credentials.
- Set insecure identity flags off and remove code/config after the observation window.
- Disable/remove legacy routes or retain only explicitly approved authenticated adapters with a near-term removal issue.
- End dual-write and old-representation fallback.
- Increment the application session/authz version; invalidate all old sessions and sensitive cached tokens.
- Remove global integration destinations from runtime execution.

Exit: repository scan, runtime telemetry, configuration audit, and negative tests prove bypasses are absent or disabled.

### Phase 11 — adversarial certification

- Restore the protected snapshot into an isolated rehearsal target.
- Re-run migration and confirm deterministic results/checksums.
- Execute the complete real-database and provider-separation matrix.
- Exercise incident, rollback, secret-rotation, dead-letter, duplicate-claim, and ambiguous-timeout runbooks.
- Produce the immutable certification artifact.

Exit: all core checks pass; any accepted non-core exception is approved, bounded, monitored, and unrelated to tenant isolation.

### Phase 12 — Solar canary

Solar advances through these gates independently:

1. Create an empty Solar organization with distinct configuration and provider resources.
2. Run synthetic owner/admin/member/viewer workflows and cross-tenant attacks.
3. Invite a limited internal/pilot cohort with synthetic/non-sensitive data.
4. Enable only the certified feature manifest.
5. Admit a bounded first real-data cohort after explicit go/no-go.
6. Expand gradually only after each approved observation window.

At every stage, compare Azar and Solar authorization failures, latency, error rate, asset signing, quotas, audit completeness, queue age, provider destination, dead letters, and support activity. A boundary violation triggers immediate no-go and containment; it cannot be accepted as a canary anomaly.

### Phase 13 — closure

- Verify Azar and Solar after the full observation window.
- Remove temporary adapters, flags, migration credentials, and elevated operator access on schedule.
- Archive evidence and publish the final migration ledger.
- Resolve or retain quarantine under approved policy.
- Update architecture, environment, API, integrations, testing, operations, support, and onboarding documentation.
- Schedule delayed credential revocation/data cleanup checks and a post-implementation review.

Exit: no temporary unsafe mechanism remains, docs describe deployed reality, and normal operational ownership has accepted the system.

## Dual-write, shadow-read, and reconciliation contract

Every transitional path must declare:

- authoritative source before, during, and after the phase;
- exact read precedence and fail-closed behavior;
- idempotency key and uniqueness boundary;
- whether the secondary action is a data projection or external side effect;
- retry and partial-failure behavior;
- divergence metric/alert;
- reconciliation command and evidence;
- enable/disable owner;
- expiration date and removal issue; and
- secure rollback state.

External work follows one canonical outbox event. Multiple projections may observe it, but only the selected organization integration may claim the provider effect. Ambiguous provider timeouts are reconciled using stable provider/idempotency identifiers before retry. A missing new record does not authorize fallback to an unscoped global read.

## Mandatory validation gates

Before final constraints and again before Solar real data, automated checks must prove:

- zero active business rows with null organization ownership;
- zero child rows whose organization differs from their parent;
- zero duplicate active tenant-scoped natural keys;
- zero live asset objects without canonical organization/parent mapping;
- zero canonical asset records whose expected object is missing or checksum-invalid;
- zero normal references to quarantined artifacts;
- zero active users relying solely on `contract_admin_users`, free-text roles, or insecure agent identity;
- zero enabled legacy routes capable of unresolved/global access;
- zero active global customer API keys;
- zero old session versions accepted;
- zero integration executions using an unscoped global destination;
- zero public/overbroad provider ACLs in reviewed resources;
- zero completed outbox effects eligible for duplicate replay;
- expected source/canonical counts by artifact type and organization;
- expected stable-ID mappings and aggregate fingerprints;
- reviewed membership/role/suspension totals;
- RLS policy, grant, function security, and bucket policy fingerprints;
- tenant-leading query plans for production access patterns; and
- no unresolved critical/high isolation alert or unexpired core exception.

Reports must expose discrepancies by opaque reference and reason without leaking one tenant's content to another tenant or into broad operational logs.

## Real-database certification fixture

The isolated certification database includes at minimum:

- Azar and Solar, each with owner, admin, member/agent, and viewer identities;
- one user with legitimate memberships in both organizations;
- suspended, invited, expired, removed, and deleted membership states;
- organization-scoped API keys and revoked/expired keys;
- support identities with no access, requested access, approved bounded access, expired access, and emergency access states;
- public/external contract role tokens for each organization, including expired/revoked/replayed/tampered forms;
- contracts with revisions, submissions, events, status/history/archive states, DNI/evidence assets, and external roles;
- properties with revisions, uploads, processing runs, retries, archives, and assets;
- branding assets and tenant settings;
- integration destinations/secrets, outbox events, claimed jobs, failed jobs, dead letters, and provider reconciliation records;
- optional billing/domain/SSO/analytics data only for MT-SPEC-09 modules selected for Solar; and
- deliberately malformed cross-tenant parent/child attempts that constraints must reject.

Fixture IDs are deterministic, data is synthetic, and teardown cannot target production resources.

## Adversarial test matrix

For every enabled resource and feature, test same-organization success and cross-organization denial through:

- list/search/filter/pagination/count;
- detail and direct UUID lookup;
- create/edit/replace/status/archive/restore/delete;
- revision and event history;
- external role links and tokens;
- upload presign/complete/verify/associate/delete;
- signed asset view/download and guessed raw path;
- processing retry/cancel/status and worker claim;
- export/report/analytics;
- integration configuration/test/enable/disable;
- support access and impersonation-equivalent flows;
- billing/entitlement/domain/SSO paths when enabled; and
- audit/log/metric access.

The suite must also cover:

1. Swap an Azar resource ID into a valid Solar request and the reverse.
2. Use an Azar external role token against Solar entries/assets and the reverse.
3. Change body/query `organization_id` while preserving another tenant's session.
4. Attempt organization switching with in-flight requests and stale responses.
5. Verify caches partition by organization and clear on switch/logout.
6. Replay invitations, sessions, API keys, upload sessions, and role tokens after revocation/expiry.
7. Downgrade a role and suspend/remove membership during active requests.
8. Run concurrent membership, revision, quota, and worker claims.
9. Verify generic 404/invalid responses and absence of timing/count/existence leaks.
10. Exhaust rate/usage quotas in Solar without affecting Azar and vice versa.
11. Send Azar/Solar provider work to distinct staging folders, Sheets, and webhook receivers; assert exact destination and payload scope.
12. Simulate provider timeout before response, timeout after commit, duplicate delivery, reordered delivery, and partial success.
13. Simulate duplicate worker claims, lease expiry, crash/restart, dead letter, retry, cancellation, and reconciliation.
14. Rotate secrets while jobs and signed links are active.
15. Restore backups and prove completed outbox work is not replayed.
16. Roll forward/back each additive migration phase without global visibility.
17. Verify query plans and load behavior with realistic per-tenant skew.
18. Exercise security incident, provider outage, quarantine, and tenant-disable runbooks.

Automated tests do not call live production APIs. Dedicated staging destinations must be clearly named, access-restricted, and emptied/retained under test policy.

## Feature certification and disablement

The Solar release manifest lists every frontend surface, backend route, worker/cron, provider integration, export, support operation, and MT-SPEC-09 module as `certified_enabled` or `disabled`.

For a disabled feature:

- navigation and controls are absent or clearly unavailable;
- direct frontend routes cannot initiate it;
- backend endpoints return the approved unavailable response before side effects;
- workers/cron consumers cannot claim its events;
- provider callbacks cannot activate it;
- API keys/support tools cannot bypass the flag; and
- negative tests remain in the certification suite.

Flags are server-authoritative, organization/cohort scoped, audited, default off for unknown organizations, and incapable of bypassing membership/capability/RLS checks.

## Solar rollout monitoring and rollback triggers

Before release, owners must approve numeric thresholds and evaluation windows for:

- any cross-tenant authorization/RLS/storage/provider alert;
- authentication/session/membership resolution failures;
- API error and latency regression by organization and route class;
- database constraint/RLS errors and connection saturation;
- queue age, claim contention, retries, dead letters, and duplicate prevention;
- provider destination mismatch, reconciliation backlog, and delivery failure;
- upload verification/signing failures and orphan cleanup backlog;
- migration/shadow divergence;
- quota/rate-limit anomalies and noisy-neighbor impact;
- audit/log pipeline loss;
- support volume and confirmed customer impact; and
- optional-module health for each enabled MT-SPEC-09 module.

Immediate containment is mandatory for suspected cross-tenant access, wrong provider destination, unauthorized support access, invalid RLS/grant drift, or credential compromise. The safe response is to disable the affected feature/cohort, suspend processing, revoke scoped credentials, quarantine uncertain results, or return to the last secure additive phase. Never disable tenant checks or expose null-owned/global data to preserve availability.

## Rollback and recovery strategy

Each phase has a tested rollback unit:

- additive schema remains in place if old safe code can ignore it;
- backfill rows are reversed through recorded mappings or superseded, never by blind bulk deletion;
- copied assets retain checksums/mappings until source and destination validation plus retention approval;
- provider routing falls back only to a previously verified organization-scoped destination;
- final constraints are not removed to resolve an ownership error—affected writes/features are stopped and data remediated;
- compatibility code can be re-enabled only if it is authenticated, explicitly organization-resolving, still certified, and within its approved transition window;
- sessions remain invalidated after cutover even if an application build rolls back; and
- outbox records preserve idempotency and provider reconciliation state across restore.

Required recovery rehearsals include full database restore, selected tenant/resource recovery where supported, Storage/object recovery, secret restoration/rotation, provider mapping restoration, and application/worker rollback. Restored environments start with external delivery disabled until completed effects and destination configuration are reconciled.

## Security, privacy, and audit requirements

- Migration operators use named, time-bounded, least-privileged credentials and approved network paths.
- Elevated access is logged with reason, run, scope, and expiry; shared accounts are forbidden.
- Snapshots and evidence are encrypted, access-controlled, retention-bound, and sanitized when used outside production.
- Reports use opaque identifiers and aggregates; raw business content is included only when necessary and restricted.
- Quarantine access is audited and unavailable to ordinary organization roles.
- Every disposition override, role mapping, asset deletion, ACL change, secret rotation, flag transition, go/no-go, and rollback emits an audit event.
- Audit records are append-only and include actor, organization where applicable, target, action, result, reason, correlation/run ID, source, timestamp, and sanitized before/after metadata.
- Provider credentials and token material never appear in Git, migration manifests, test fixtures, logs, or certification artifacts.
- Privacy/retention/legal-hold requirements apply to backups, migration tables, quarantined artifacts, and copied provider resources—not only canonical rows.

## Operational ownership and go/no-go governance

Named owners are required for:

- release command and final go/no-go;
- data classification/backfill;
- identity/membership approval;
- database migrations/RLS;
- contracts;
- properties;
- assets/Storage;
- Google/Make and other integrations;
- security/incident containment;
- backups/restore;
- frontend/session/cache behavior;
- observability/SRE;
- support/customer communications; and
- every selected MT-SPEC-09 module.

The go/no-go record must include prerequisite status, exact artifacts, validation results, open exceptions, thresholds, current dashboards, rollback readiness, customer-impact plan, approvers, decision, and timestamp. Silence or absence from the call is not approval.

## Expected API and user behavior

- Existing Azar users reauthenticate and enter an explicitly resolved Azar context.
- Multi-organization users select/switch through the canonical organization flow; URLs, caches, requests, and responses retain the selected context safely.
- Azar sees only Azar contracts, properties, assets, history, integrations, reports, and enabled functions.
- Solar sees only Solar equivalents and only features certified in its manifest.
- Cross-tenant or stale identifiers return generic failure and create no observable side effect.
- Migrated Azar records preserve stable identifiers where safe; changed IDs have durable mappings and redirects/adapters only where authorized.
- Unverifiable records do not appear in normal UI/API; authorized operators remediate them through quarantine tooling.
- Users receive clear reauthentication/feature-unavailable/provider-pending messages without internal IDs, tenant existence, secrets, or another tenant's state.
- Provider results are shown only after their organization/destination association has been verified or represented as pending/reconciling.

## Affected implementation areas

Exact filenames may evolve under prerequisite SPECs, but implementation is expected to affect:

### Database and migrations

- `supabase/migrations/` with new ordered additive/backfill/constraint/cleanup migrations;
- organization, membership, session, audit, contract, property, asset, integration, outbox, quota, and optional-module tables/policies;
- restricted migration evidence tables/functions; and
- RLS, grants, triggers, composite constraints, tenant-scoped uniqueness, and tenant-leading indexes.

### Backend

- `backend/src/index.ts` and route registration;
- `backend/src/routes/contractPasswordAuth.ts`;
- `backend/src/routes/contractEntries.ts`;
- `backend/src/routes/contracts.ts`;
- `backend/src/routes/properties.ts`;
- contract/property repositories and services;
- `backend/src/services/contractAuth.ts` and `contractPasswordAuth.ts`;
- upload/session/Storage services;
- Google authentication/Drive/Sheets services;
- Make webhook/payload services;
- organization context, capabilities, audit, assets, integration, outbox, worker, quota, and migration modules introduced by prior SPECs;
- environment validation and startup checks; and
- migration/reconciliation/certification CLI tooling and tests.

### Frontend

- organization-aware authentication and routing;
- `frontend/src/pages/ActionSelectionPage.tsx` and authentication pages;
- contract/property create and management pages;
- organization selector and membership states;
- query/cache keys and cache purge behavior;
- `sessionStorage`/local persistence for contract tokens and organization context;
- legacy identity and property submission compatibility;
- server-backed feature availability; and
- Solar-disabled route and control behavior.

### Configuration and operations

- `backend/.env.example` and frontend environment examples;
- removal of runtime dependence on global customer destinations and insecure identity flags;
- deployment manifests, secret store references, worker schedules, feature flags, alerts, dashboards, and backups;
- provider folders/Sheets/webhook receivers and ACLs; and
- cutover, rollback, restore, incident, quarantine, credential-rotation, and support runbooks.

### Documentation

- `docs/01-overview/architecture.md` and `project-overview.md`;
- `docs/02-setup/environment.md`, `external-services.md`, and `installation.md`;
- `docs/03-operation/runtime-files.md` and `usage.md`;
- `docs/05-integrations/api-contracts.md`;
- `docs/06-testing/testing-strategy.md`;
- `docs/07-development/engineering-standards.md`;
- roadmap/spec indexes and status; and
- customer support/onboarding and internal incident documentation.

## Implementation deliverables

1. Approved migration manifest schema and production manifest.
2. Reconciled Supabase migration history report.
3. Additive, backfill, enforcement, and cleanup migrations.
4. Idempotent migration CLI/jobs with dry-run, batching, checkpoints, quarantine, and immutable results.
5. Reviewed Azar organization/settings seed.
6. User/admin-to-membership mapping report.
7. Contract/property/asset/provider inventory and disposition ledger.
8. Tenant-specific integration/secret migration and ACL/credential remediation.
9. Shadow/dual-write dashboards and reconciliation tooling.
10. Compatibility retirement register and repository/runtime removal evidence.
11. Backup/restore and phase rollback runbooks with rehearsal evidence.
12. Real-database deterministic Azar/Solar fixture.
13. Whole-system adversarial and provider-separation suites.
14. Solar feature manifest, staged rollout plan, thresholds, dashboards, and approvals.
15. Immutable final release certification.
16. Updated architecture, API, environment, integration, test, operation, and support docs.

## Test plan

### Unit tests

- Manifest/schema validation and fixed-ID enforcement.
- Classification and disposition rules.
- Role mapping with rejection of metadata inference.
- Idempotency keys, fingerprints, checksums, and mapping uniqueness.
- Batch checkpoints, retries, and quarantine transitions.
- Feature-manifest and server-side disablement evaluation.
- Session-version rejection and cache-key construction.
- Destination selection and provider reconciliation.
- Sanitization of logs/evidence.

### Database integration tests

- Upgrade from representative legacy schema/data and empty-database creation.
- Backfill rerun without duplicates or mutation of immutable history.
- Null, mismatched parent-child, and cross-tenant constraint rejection.
- RLS positive/negative coverage for every role/table/function/storage policy.
- Service-role repository predicates and audit.
- Tenant uniqueness/index/query-plan behavior.
- Transaction interruption and checkpoint resume.
- Quarantine exclusion.
- Restore with outbox replay prevention.

### Backend integration tests

- Auth/session/membership replacement of legacy admin behavior.
- Every resource/path matrix item for Azar and Solar.
- Legacy adapters resolve explicit organization and fail closed.
- API key, support, external token, upload, export, retry, and integration isolation.
- Worker claims, leases, duplicates, dead letters, and ambiguous provider results.
- Backend feature disablement independent of frontend state.

### Frontend tests

- Reauthentication after session-version cutover.
- Organization switch, URL/context consistency, cache partition, cache clearing, and in-flight response rejection.
- Direct-route and hidden-control behavior for disabled Solar features.
- Generic cross-tenant errors with no stale data flash.
- Multi-organization and suspended/removed membership UX.
- Contract/property/token/upload flows under Azar and Solar contexts.

### Migration and operational tests

- Dry run, rehearsal, production-shaped batch, interruption, resume, rollback, and rerun.
- Source/destination counts, mappings, checksums, samples, and quarantine.
- Storage/provider enumeration in both directions.
- ACL and credential rotation verification.
- Backup/restore and completed-effect reconciliation.
- Alert delivery, dashboards, stop thresholds, incident roles, and customer communications.

### Performance and resilience tests

- Realistic Azar-heavy/Solar-light skew and concurrent tenant workload.
- Tenant-leading list/detail/history queries.
- Backfill throttling without starving production.
- Queue backlog, provider outage, rate limits, retries, and noisy-neighbor quotas.
- Cache/session churn during organization switching and role changes.

## Acceptance criteria

1. Supabase migration history is reconciled and no applied migration is edited.
2. Azar has one fixed reviewed UUID/slug and settings manifest.
3. Every existing legitimate user/grant is mapped to a reviewed membership/role or quarantined/revoked.
4. No durable role is inferred from free-text metadata.
5. Every active contract entry belongs to Azar or another evidenced organization; otherwise it is quarantined.
6. Every contract child agrees with its parent organization.
7. Recoverable property artifacts are canonicalized; unverifiable ones are quarantined.
8. Every live Storage/provider object is mapped, registered/copied, retained under controlled history, quarantined, or approved for delayed deletion.
9. Azar and Solar use distinct private provider destinations and organization-scoped integration records.
10. Public/overbroad provider ACLs in scope are remediated.
11. Superseded fixed webhooks and credentials are rotated/revoked with evidence.
12. Backfill is idempotent, resumable, observable, and reconciled by more than counts alone.
13. Shadow/dual-write divergences are zero or fully explained and approved before enforcement.
14. No dual-write path duplicates an external effect.
15. Active organization ownership is non-null.
16. Composite parent-child constraints and tenant-scoped uniqueness are valid.
17. Tenant-leading indexes/query plans meet approved performance limits.
18. Final RLS/grants/bucket policies pass ordinary-role and service-role tests.
19. Null-owner global visibility is removed.
20. `contract_admin_users` and global admin flags no longer authorize runtime access.
21. Global customer API keys are replaced/revoked.
22. Insecure identities and global compatibility paths are disabled and removed on schedule.
23. Legacy routes are removed or remain only as approved authenticated organization-resolving adapters.
24. Dual-write and old-representation fallback are disabled after the proven transition.
25. Old application sessions are invalidated and rejected.
26. Browser/server caches and tokens are organization-partitioned and revoked on context/authorization changes.
27. Backup and restore rehearsal succeeds without replaying completed outbox effects.
28. Phase rollback is tested and never relies on global visibility, null ownership, or disabled authorization.
29. The deterministic real-database Azar/Solar fixture covers every required identity/resource state.
30. Every enabled list/detail/direct-ID/write/history/upload/view/retry/export/support/billing/integration path passes same-tenant and cross-tenant tests.
31. Azar role tokens cannot access Solar resources and Solar role tokens cannot access Azar resources.
32. Cache switching, in-flight requests, logout, invitation replay, downgrade, suspension, stale sessions, concurrency, quota, and generic-error tests pass.
33. Distinct staging provider destinations receive only their organization's effects.
34. Ambiguous timeouts, duplicate claims, dead letters, rotation, restore, rollback, performance, and incident exercises pass.
35. Every Solar feature is explicitly `certified_enabled` or disabled in UI, backend/API, and background processing.
36. Numeric release thresholds, owners, observation windows, and rollback actions are approved before canary start.
37. Any suspected tenant-boundary or wrong-destination event stops advancement and triggers containment.
38. The immutable certification matches the deployed code, schema, workers, frontend, flags, fixture, and provider configuration.
39. Architecture, environment, API, integration, testing, operations, support, and onboarding docs match deployed behavior.
40. Security, product, data, engineering, operations, provider, support, and release owners record final go/no-go approval.
41. Solar receives no real data until all prior criteria and the roadmap completion gate pass.

## Verification commands and evidence

Exact scripts will be introduced by implementation; their names must be documented and stable before rehearsal. The final verification sequence must include equivalents of:

```bash
git status --short
git diff --check
rg -n "contract_admin_users|CONTRACT_ALLOW_INSECURE_AGENT_ID|VITE_CONTRACT_ALLOW_INSECURE_AGENT_ID|legacy/no-owner|MAKE_WEBHOOK_URL|GOOGLE_DRIVE_PARENT_FOLDER_ID" backend frontend docs
npm --prefix backend run typecheck
npm --prefix frontend run build
npm --prefix backend test
npm --prefix frontend test
supabase migration list
```

Implementation must add project-owned commands for:

- migration manifest validation;
- migration dry run/rehearsal/execution/resume;
- inventory/disposition completeness;
- zero-gate and schema/RLS/grant/index verification;
- Storage/provider reconciliation;
- compatibility-surface checks;
- real-database Azar/Solar adversarial certification;
- backup/restore/outbox reconciliation;
- Solar feature-manifest validation; and
- documentation links/index checks.

Evidence retained for release includes command/version, timestamp, environment, revision/schema head, sanitized output or immutable artifact link, result, owner, and approval. A passing command against a different revision, flags, database head, or provider configuration is not transferable.

## Documentation and traceability requirements

- Link every implementation PR/migration/test/runbook/dashboard to this SPEC and its owning prerequisite SPEC.
- Maintain a matrix from each roadmap included-scope item and acceptance criterion to code, test, and operational evidence.
- Update pending/completed indexes only when actual implementation status changes.
- Record architectural or business-policy changes as explicit decisions, not silent deviations in migration scripts.
- Preserve manifest, mapping, validation, certification, go/no-go, rollback, incident, and post-release artifacts under approved retention.
- Document temporary compatibility with an owner and removal date; undocumented temporary behavior is a release blocker.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Ambiguous legacy data is assigned to Azar | Evidence-based disposition; quarantine by default; reviewed mappings |
| Applied database history is rewritten | Reconcile ledger/checksums; forward-only ordered migrations |
| Backfill partially completes or reruns | Idempotency, batches, checkpoints, mappings, reconciliation |
| Child rows/assets receive wrong tenant | Derive from canonical parent; composite constraints; bidirectional inventory |
| Global compatibility survives cutover | Executable inventory, last-use telemetry, repository/runtime scans, negative tests |
| Provider reports success to wrong destination | Organization-scoped configuration and destination assertions |
| Dual-write duplicates effects | One canonical outbox event, stable idempotency, reconciliation before retry |
| Rollback reopens global visibility | Secure phase rollback; disable feature/processing instead of tenant checks |
| Restore redelivers external work | Restore with delivery disabled; reconcile completed outbox/provider IDs |
| Old sessions retain global admin | Session-version bump and universal reauthentication |
| Browser cache leaks after switch | Tenant-keyed caches, cancellation, purge, stale-response rejection |
| Solar launches unfinished functionality | Exact feature manifest plus UI/backend/worker disablement tests |
| Tests pass but production config differs | Certification binds code/schema/flags/providers and deployment verifies match |
| Migration harms Azar availability | Rehearsal, throttling, read-only window, dashboards, phase stop/rollback |
| Evidence contains secrets or PII | Sanitized structured artifacts, restricted storage, retention controls |

## Completion gate

MT-SPEC-10 is the final multi-tenant release gate. Solar may hold real data only after:

- all existing data and resources have explicit organization ownership or approved quarantine;
- final constraints, RLS, grants, storage policy, provider separation, and tenant-leading indexes are enforced and tested;
- compatibility identities, global authorization/destination paths, old sessions, and transitional dual-write/fallbacks are removed or securely retired;
- production-equivalent migration and backup/restore rehearsals pass without duplicate external work;
- the complete Azar/Solar adversarial matrix passes for every enabled feature;
- every unfinished feature is disabled in UI, backend/API, and background execution;
- rollout monitoring, numeric thresholds, owners, containment, and secure rollback are ready; and
- the immutable certification and named final go/no-go approval match the artifacts actually deployed.

Until that gate passes, the system may continue migration/rehearsal work for Azar, but it is not approved to store Solar production data or claim completed multi-tenant SaaS isolation.
