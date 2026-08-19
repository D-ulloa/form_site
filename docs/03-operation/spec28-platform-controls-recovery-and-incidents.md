# SPEC-28 platform controls, recovery, and incident runbook

Status: staged, 2026-08-18. This runbook authorizes no production restore,
support access, policy override, Solar activation, or real provider call.

## Owners and activation gate

Before activation, the release record must name the incident commander,
database/recovery owner, backend owner, security owner, product owner,
privacy/legal notification owner, and communications channel. It must also
record approved RPO/RTO, PITR and backup retention, audit/log/usage retention,
limiter failure policy, alert destinations, restore environment, evidence
location, exercise date, and approvers. Missing values keep the path disabled.

Staging and production require separate database projects, secrets, telemetry
sinks, backup locations, and alert destinations. Secrets live only in the
approved secret manager. `PLATFORM_AUDIT_REQUIRED=true`; no fail-open privileged
mode is approved. Support access remains disabled.

## Deployment and database certification

1. Confirm SPEC-25 containment and SPEC-26 schema, then reconcile migration
   history and take the approved backup.
2. Apply `20260818160000_spec28_platform_controls.sql` to a disposable database.
   Verify every table is empty, RLS-enabled/forced, and unavailable to `anon`
   and `authenticated`; verify function execute grants and fixed search paths.
3. Seed synthetic Azar/Solar organizations, users, active/removed/suspended
   memberships, mixed-parent fixtures, and safe canary values. Use no real PII.
4. Prove cross-organization reads/writes/RPCs and reassignment fail; prove
   composite FKs, append-only triggers, usage idempotency, atomic final limiter
   unit, concurrent fair claims, rollback, and returned-scope assertions.
5. Capture reviewed `EXPLAIN (ANALYZE, BUFFERS)` plans at representative volume
   without customer content. Organization filtering must lead each scoped plan.
6. Run backend/frontend checks and `git diff --check`. Keep platform/domain HTTP
   activation off until SPEC-27 supplies trusted context.

## Monitoring and alerts

Dashboards use bounded labels: service, environment, deployment, route/action,
actor class, safe outcome/error class, provider class, and policy version.
Emails, names, addresses, raw UUID labels, tokens, paths, payloads, and provider
bodies are forbidden. Access-controlled logs/traces may carry a justified
organization UUID and request ID.

Alert on suspected successful cross-organization access, audit/limiter outage,
authorization/token spikes, queue age/dead letters/retry storms, noisy-neighbor
capacity, provider routing mismatch, pool/lock/latency/storage pressure, stale
PITR/backup, failed restore drill/tombstone/hold replay, and possible credential
exposure. Every configured alert must link here and include severity, owner,
acknowledgement target, escalation target, and safe evidence location.

## Backup and restore procedure

1. Disable customer traffic, session/key issuance, workers, webhooks, email,
   presigning, and provider delivery. Restore only into an isolated environment.
2. Restore the database/configuration references through the approved provider
   workflow. Never copy plaintext secrets into a dump or evidence report.
3. Validate migration version, grants, forced RLS, functions/search paths,
   constraints, organization ownership, table counts/checksums, audit continuity,
   legal holds, tombstones, deleted/suspended organizations, and credential/session
   revocations.
4. Mark restored `processing`, `sent`, and `unknown` work paused. Compare stable
   provider identifiers and idempotency keys. Confirmed work receives a recovered
   receipt, missing work resumes only through the idempotent worker, and uncertain
   work becomes blocked/dead-letter. Never replay from database state alone.
5. For logical organization restore, validate manifest signature/checksums,
   organization ID, schema/time boundary, encryption reference, expiry, counts,
   collision/remapping plan, and excluded global dependencies. Do not rebind
   credentials, destinations, links, or assets automatically.
6. Re-run Azar/Solar adversarial tests and query plans. Open workers, then traffic,
   only after recovery/security approval; monitor the approved observation window.

## Incident playbooks

### Suspected cross-organization exposure

Disable the implicated routes/sessions/keys/workers without deleting evidence.
Record request/deployment/time/data-class scope in restricted evidence, reproduce
with synthetic fixtures, inspect scoped audit, and determine affected
organizations. The privacy/legal owner makes the POL-12 notification decision.
Forward-fix, rerun all isolation paths, approve reopen, and conduct review.

### Credential compromise

Revoke and rotate the exact credential and dependent sessions/jobs; do not add a
fallback. Inspect only scoped safe audit and provider access, rotate separate
peppers/keys only when their exposure is plausible, validate old-credential
denial, and record provider/recovery impact plus notification decision.

### Provider misrouting

Pause the organization/provider configuration and all retries. Inventory sent
objects/rows/messages by stable external ID, revoke public exposure, reconcile or
delete only where policy/provider permits, and preserve receipts. Fix routing,
test with synthetic destinations, obtain product/privacy approval, then resume
one organization at a time.

### Failed migration

Stop writes/cutover. Preserve migration and query evidence. Use a reviewed
forward repair or invoke isolated recovery; never drop scope columns, constraints,
audits, or tombstones to regain compatibility. Re-run grants/RLS/constraint and
null/quarantine tests before reopening.

### Database or data recovery

Follow the restore procedure above. A backup existing is not recovery proof.
Traffic remains closed while any tombstone, hold, revocation, ownership, audit,
or external-work result is unresolved.

### Audit or limiter outage

Privileged, support, token-validation, presign, manual-retry, and other sensitive
operations fail closed with `503`; preserve a safe request ID and alert. No
fail-open mode is approved. Restore the dependency, inspect idempotency state,
reconcile allowed safe telemetry without fabricating success audits, test the
final limiter unit concurrently, and close with owner approval.

## Rollback

Application rollback may target only a schema-compatible contained version.
Schema repair is forward-only or an approved isolated restore. Do not delete
audit/usage/history/tombstones, enable a local-map authority, or reopen global
compatibility. If scope cannot be proven, leave mutations/workers disabled and
Solar blocked.
