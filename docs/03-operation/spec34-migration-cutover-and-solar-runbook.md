# SPEC-34 migration, cutover, certification, and Solar runbook

Status: control-plane framework installed; no production manifest, tenant seed, backfill,
certification, or Solar release has been performed.

## Safety boundary

The `migration_control` schema is restricted evidence storage. It does not authorize normal
application access. Ordinary `public`, `anon`, and `authenticated` principals have no schema,
table, or function grants, and every table is force-RLS protected without browser policies.
Only a separately approved, named, time-bounded operator/worker role may receive narrow
function access in a future migration.

Never enter secret values, credentials, tokens, customer payloads, private object paths, or raw
provider URLs in manifests or evidence. Fixed organization UUIDs/slugs, snapshots, revisions,
feature choices, thresholds, approval references, and sanitized artifact references belong in
the manifest. The repository deliberately supplies no Azar/Solar production manifest.

## Before a run

1. Reconcile the deployed Supabase migration ledger and file checksums. Stop on missing,
   reordered, or modified applied migrations.
2. Name data, identity, database, domain, asset, provider, security, restore, frontend,
   observability, support, and release owners.
3. Capture protected database, Storage, runtime-file, provider, credential-reference,
   compatibility, and membership inventories from a reviewed snapshot.
4. Record distinct reviewed Azar/Solar UUIDs, slugs, provider destinations, and the exact Solar
   feature manifest. Every feature is either `certified_enabled` with an evidence reference or
   `disabled` in UI, API, and workers.
5. Approve numeric thresholds with observation windows and `hold`, `rollback`, or `contain`
   actions. A boundary or wrong-destination signal always uses containment.
6. Validate the manifest without printing its content:

   ```bash
   npm --prefix backend run spec34:validate-manifest -- /restricted/path/manifest.json
   ```

The command returns only validity and a SHA-256 fingerprint. Store the manifest itself in the
approved restricted evidence location.

## Inventory, backfill, and quarantine

Create one `migration_runs` row for the validated fingerprint. Inventory first; assignment and
cleanup are later reviewed phases. The source-system/type/identifier tuple is unique per run,
and every item retains a normalized source fingerprint. First-tenant status is never evidence.
An Azar disposition needs ownership evidence, an approved rule, a reviewer, and the fixed
manifest organization. Missing or conflicting evidence becomes `quarantine` and stays outside
normal tenant queries.

Use mappings as append-only idempotency evidence. Do not edit a mapping after retry or rollback;
append a superseding or rollback mapping. Deletion requires retention approval, reviewer,
eligibility time, backup, and no legal hold. Discovery and deletion never occur in one phase.

Backfill in bounded batches with a durable checkpoint. Stop on fingerprint drift, parent/child
scope mismatch, duplicate target, missing object, provider ambiguity, or threshold breach. A
retry must compare its source fingerprint and existing mapping before writing. Provider effects
remain one canonical outbox event and are reconciled before retry.

## Validation and certification

Run zero-gates before enforcement and before Solar real data. Record the query/tool version,
expected and actual sanitized values, evidence reference, and affected scope. Core isolation
results cannot be waived. Static SQL tests are repository evidence only; production certification
requires disposable/isolated real PostgreSQL, Storage, provider fakes or dedicated staging
destinations, a sanitized production-shaped rehearsal, and backup/restore reconciliation.

A certification is valid only when the deployed backend, frontend, worker, build artifact,
database head, feature flags, fixture, provider destinations, test results, rehearsal runs,
monitoring, thresholds, exceptions, and named approvals exactly match its immutable record.
Artifact or configuration drift is a no-go and requires a new certification.

## Cutover and Solar progression

Advance through additive schema, reviewed Azar seed, identities, contracts, properties, assets,
integrations, shadow transition, final constraints/RLS, compatibility/session retirement,
adversarial certification, and only then Solar. The Solar sequence is `not_started -> empty ->
synthetic -> pilot -> real_data -> expanded`. `real_data` and `expanded` require a passing
certification. Any boundary incident transitions to `contained`, never to the next stage.

At final cutover, invalidate old sessions, clear organization-partitioned caches/tokens, stop
legacy authorization and global destination execution, and keep restored integration workers
paused until completed effects and destinations are reconciled. Rollback disables the affected
feature/cohort or returns to a previously verified organization-scoped additive phase. It never
restores null-owner visibility, global authorization, insecure identities, public assets, or an
unscoped provider destination.

## Incident and closure

For suspected cross-tenant access, wrong destination, RLS/grant drift, support misuse, or secret
compromise: stop advancement, contain the exact cohort/path, pause claims, revoke scoped
credentials where approved, preserve sanitized evidence, and invoke the SPEC-28 incident and
recovery process. Do not trade isolation for availability.

After the observation window, verify Azar and Solar independently, archive the immutable ledger,
remove temporary adapters/elevated access on schedule, retain quarantine under policy, complete
delayed credential/ACL cleanup, and update the acceptance traceability. Until every external gate
is evidenced, Solar may use synthetic data only.
