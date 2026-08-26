# SPEC-36 Production readiness — organization and initial-owner provisioning

**Date:** 2026-08-25
**Priority:** release blocker
**Status:** repository implementation staged; disabled pending real-database/provider rehearsal, SPEC-37 handoff, and approval
**Roadmap identifier:** PROD-SPEC-02
**Dependencies:** SPEC-26 through SPEC-28, SPEC-34, and SPEC-35
**Blocks:** repeatable production customer creation and delegation to organization owners

---

## Specification identity

**Name:** Restricted, atomic, idempotent organization and initial-owner provisioning.

**Description:** Turn the staged `OrganizationService.createOrganization` and `spec26_create_organization` transaction into a controlled production operation with a reviewed operator, immutable manifest, dry-run, exact Auth identity resolution, audit evidence, and safe handoff to the initial owner.

**Why it is necessary:** The domain transaction exists but no production route, UI, or command exposes it. Operators currently need manual Supabase user/profile creation and direct RPC/SQL. That bypasses a repeatable approval boundary and can create organizations with the wrong owner, plan, slug, or partial evidence.

## Summary

First-release organization creation remains platform-created and invite-only. It is not a customer self-service route.

This specification defines a restricted CLI as the first production interface. The CLI consumes a reviewed non-secret manifest, performs read-only preflight by default, requires an explicit execution flag, calls SPEC-35 for the owner identity/profile, and calls the existing organization domain service so organization, settings, owner membership, and governance event commit atomically.

The interface must be usable in a controlled deployment/operations environment without exposing the service-role key, accepting a password, or requiring manual database writes. A future platform UI may call the same service only after a separately approved `PlatformRequestContext` and MFA/step-up boundary are production-certified.

This document does not create a production organization or user and does not authorize Solar rollout outside SPEC-34.

## Authority and dependencies

- SPEC-26 owns organization fields, immutable slug, settings, initial owner, last-owner invariant, plan allowlist, events, and platform-created policy.
- SPEC-27 owns platform-principal separation, sessions, step-up, request context, and the rule that a customer owner is not a platform operator.
- SPEC-28 owns audit, idempotency, rate/abuse controls, telemetry, and service-role containment.
- SPEC-34 owns existing Azar migration, Solar stage gates, manifests, certification artifacts, and real-data authorization.
- SPEC-35 owns Auth-user/profile provisioning and exact identity reconciliation.

SPEC-36 operationalizes only the new-customer bootstrap transaction. It cannot waive SPEC-34 migration or isolation gates.

## Repository implementation status

- `platform:provision-organization` now provides strict preflight, execute, replay, and status modes outside the web runtime.
- Forced-RLS operation/event evidence reserves deterministic organization/membership UUIDs and reconciles the canonical SPEC-26 transaction.
- SPEC-35 supplies exact passwordless owner identity/profile provisioning; manifests and receipts are secret-free and fingerprint-bound.
- The mounted customer governance router intentionally has no create-organization endpoint, and execution remains disabled by default.
- Disposable-project database/provider races, negative grants, SPEC-37 delivery, and named production approval remain open completion gates.

The correct closure is a narrow operations interface, not a temporary unauthenticated HTTP endpoint.

## Scope

### Includes

- Restricted `platform:provision-organization` CLI and reusable application service.
- Versioned, schema-validated, non-secret provisioning manifest.
- Dry-run/preflight, execute, status, and safe resume behavior.
- Exact initial-owner identity/profile preparation through SPEC-35.
- Platform-operator eligibility and actor evidence.
- Atomic organization/settings/owner/event creation through the canonical service/RPC.
- Idempotency, slug reservation/conflict handling, audit, output redaction, runbook, and certification.
- Initial-owner activation/handoff state for SPEC-37.

### Excludes

- Public organization creation or signup.
- Browser access to service-role credentials.
- Direct inserts into organization/settings/membership tables.
- Inviting non-owner members; SPEC-37 owns that flow.
- Assigning owner through a normal invitation.
- Billing, plan purchase, custom domains, SSO, or support impersonation.
- Migrating Azar or authorizing Solar outside SPEC-34.

## Non-negotiable invariants

1. Organization creation is platform-only and denied to customer sessions, API keys, external links, support grants, and anonymous callers.
2. The platform actor and initial owner are explicit, separate identities; equality is allowed only if approved and recorded, never inferred.
3. The initial owner is an exact SPEC-35 Auth identity with a valid profile and eligible email state.
4. The CLI never accepts or prints a password, raw Auth activation link, session token, service key, or invitation token.
5. Organization, default settings, active owner membership, and creation event commit in one database transaction.
6. No organization can exist without an active owner; no owner membership can point to a missing/ineligible Auth user.
7. Slug is canonical, validated, reserved, immutable, and never generated from an unreviewed customer name.
8. `plan_key`, creation source, locale, and time zone come from a reviewed allowlist/manifest, not client metadata or environment fallback.
9. Execution is idempotent by immutable operation ID plus canonical manifest fingerprint.
10. Reusing an operation ID with different input fails closed.
11. A provider or database ambiguity is reconciled before retry; retry cannot create a second organization.
12. The CLI uses the application service and canonical RPC; direct SQL is forbidden in the normal runbook.
13. Browser database roles cannot execute the creation RPC.
14. Provisioning never writes `contract_admin_users`, `CONTRACT_ADMIN_USER_IDS`, free-text company/role metadata, or a global customer key.
15. Successful provisioning does not create a logged-in browser session for the owner.
16. The owner must authenticate/activate and obtain a fresh SPEC-27 organization context before access.

## Provisioning manifest

The first-release manifest is a restricted operational file with this logical shape:

```json
{
  "schema_version": 1,
  "operation_id": "orgprov_...",
  "requested_at": "2026-08-25T00:00:00.000Z",
  "requested_by_operator_user_id": "00000000-0000-0000-0000-000000000000",
  "approval_reference": "approved-change-reference",
  "organization": {
    "slug": "customer-slug",
    "display_name": "Customer display name",
    "legal_name": "Customer legal name",
    "plan_key": "standard",
    "locale": "es",
    "time_zone": "America/Caracas"
  },
  "initial_owner": {
    "email": "owner@example.com",
    "display_name": "Owner name",
    "locale": "es",
    "time_zone": "America/Caracas"
  }
}
```

The manifest contains no password, provider token, API key, invitation token, customer payload, billing secret, private storage path, or integration destination. Its canonical SHA-256 fingerprint is recorded with execution evidence. Production manifests live in restricted operational storage, not Git or the application deployment environment.

The first implementation accepts `creation_source=platform` only. Migration creation remains SPEC-34-owned and self-service remains disabled.

## Operator and approval boundary

The command must verify that `requested_by_operator_user_id` is an active, MFA-required `platform_operators` identity and that the deployment/approval boundary explicitly authorizes organization provisioning. The current table does not store customer-style capabilities, so implementation must not invent one from a membership role. If operator enrollment/MFA cannot be proved non-interactively, execution requires a short-lived deployment identity plus a separately recorded named human approval. A customer owner role is never sufficient.

Production execution requires:

- a validated manifest fingerprint;
- a named approval/change reference;
- an eligible operator/deployment identity;
- a fresh database/preflight read;
- audit availability;
- exact production project/environment confirmation; and
- explicit `--execute` plus an expected fingerprint.

The default command is dry-run. Interactive “type the customer name” confirmation is not a substitute for immutable input and approval evidence.

## Command contract

Target scripts:

```text
npm --prefix backend run platform:provision-organization -- --manifest <restricted-path>
npm --prefix backend run platform:provision-organization -- --manifest <restricted-path> --execute --expected-fingerprint <sha256>
npm --prefix backend run platform:provision-organization -- --operation-id <id> --status
```

Dry-run performs all safe validation and reads but creates no Auth user, profile, organization, membership, event, email, or session. It reports safe planned actions and blockers.

Execute returns a safe receipt containing operation ID, manifest fingerprint, organization UUID/slug, owner user UUID, owner membership UUID, result (`created` or `already_applied`), activation state, request ID, and evidence timestamp. Email may be masked. No raw secret or provider action link is output.

## Execution workflow

1. Parse, size-bound, schema-validate, and canonicalize the manifest.
2. Verify environment/project identity and reject local/preview/unknown targets for a production manifest.
3. Verify operator eligibility and approval reference.
4. Load or reserve `operation_id`; reject fingerprint mismatch.
5. Validate slug/reserved words, names, locale, time zone, plan, and source.
6. Preflight exact slug and owner identity/profile state plus SPEC-34 inventory conflicts.
7. In execute mode, call SPEC-35 to provision/reconcile the initial owner.
8. Call `OrganizationService.createOrganization` with a typed `PlatformActorContext` and canonical request ID.
9. The RPC atomically creates organization, settings, initial owner membership, and governance event.
10. Read back and assert all returned IDs, owner role/status, settings row, organization status, and event evidence.
11. Record the immutable safe provisioning receipt/audit.
12. Invoke SPEC-37 activation/notification handoff only after the organization transaction commits. Notification failure does not roll back the customer; it creates a visible resumable handoff state.

## Idempotency and partial failure

| Failure point | Required behavior |
|---|---|
| Before Auth creation | No change; retry from preflight |
| Auth identity created, profile missing | SPEC-35 resume repairs profile; no duplicate Auth user |
| Owner ready, organization RPC fails | No organization/settings/membership retained; retry same operation |
| RPC response lost after commit | Reconcile by operation evidence, manifest fingerprint, slug, and exact owner before retry |
| Organization created, owner notification fails | Keep organization and owner membership; mark handoff pending/failed and resend through SPEC-37 |
| Read-back assertion fails | Disable owner handoff and raise incident; do not create another organization |

Deleting a successfully created organization is not an automated rollback. Lifecycle correction follows SPEC-26 and approved incident procedures.

## HTTP and UI policy

No production customer-facing HTTP route is added by the first implementation. `POST /api/platform/organizations` remains unmounted until a separate platform UI has certified operator sessions, MFA/step-up, CSRF/Origin, distributed limiting, audit, approval evidence, and equivalent idempotency.

The owner sees the organization only after activation/login and server-confirmed membership context. The frontend never receives the provisioning manifest or platform receipt.

## Affected implementation areas

- New forward migration for provisioning operations/receipts if required.
- `backend/src/platform/` manifest parser, operator resolver, CLI, receipt/audit, and target-environment guard.
- Existing `backend/src/organizations/organizationService.ts` and repository/RPC, without weakening validation.
- `backend/package.json` scripts.
- SPEC-35 identity service and SPEC-37 delivery handoff.
- Environment examples for explicit target identity and restricted manifest policy.
- Production organization-provisioning runbook and traceability document.

## Required tests

### Unit/contract tests

- Manifest canonicalization, fingerprint stability, schema versions, size limits, and forbidden fields.
- Reserved/duplicate slug, plan, locale, time-zone, email, and name validation.
- Dry-run has zero writes/provider calls.
- Execute requires exact fingerprint/operator/approval/environment.
- Operation replay returns `already_applied`; changed input with same ID fails.
- Receipt redaction and safe command output.

### Real-database/concurrency tests

- Organization/settings/owner/event atomicity.
- Browser roles cannot execute RPC or read provisioning evidence.
- Two executions of the same operation create one organization.
- Two different operations racing for one slug create at most one organization.
- RPC response-loss reconciliation does not duplicate.
- Owner foreign key/profile eligibility and active-owner invariant.
- No legacy global grant or customer key is created.

### End-to-end rehearsal

- Provision a synthetic owner/customer in a disposable production-shaped project.
- Activate/login as owner, load one membership, resolve `/t/:slug` context, and verify capabilities.
- Verify owner cannot access platform operations.
- Verify a different/zero-membership user cannot access the organization.
- Exercise failed notification and safe resend without recreating organization.
- Remove synthetic fixtures only in the disposable environment using the approved teardown process.

## Acceptance criteria

1. A documented restricted command is the sole first-release production creation path.
2. Dry-run is default and provably has no writes or provider effects.
3. Execution requires an exact immutable manifest fingerprint and approved operator evidence.
4. SPEC-35 resolves/provisions the initial owner without passwords or duplicate identities.
5. Organization, settings, active owner membership, and event commit atomically.
6. Idempotent retry cannot create a second organization or owner membership.
7. The command uses canonical service/RPC boundaries and central service-role client.
8. No browser role or customer principal can invoke the operation.
9. No legacy admin grant, public registration, customer API key, or logged-in owner session is created.
10. Safe receipts and audits contain no secrets and are sufficient to reconcile ambiguity.
11. Notification failure is visible/resumable and does not duplicate or delete the organization.
12. Real-database concurrency, negative-grant, and production-shaped end-to-end tests pass.
13. Runbooks cover preflight, approval, execution, status, retry, handoff failure, and incident escalation.
14. SPEC-34 explicitly authorizes any real Azar/Solar action; this specification alone does not.

## Rollout, rollback, and completion gate

Deploy the command disabled from ordinary web runtime, certify in a disposable project, verify production read-only preflight, then execute only against an approved synthetic/canary or named customer operation. The production web service must not gain a platform creation route as a side effect.

Rollback removes execution permission/disables the command while preserving receipts and created organization state. It never restores direct manual SQL as the documented normal path, deletes a committed organization, or removes the last owner.

SPEC-36 is complete only when the command, manifest contract, operator boundary, atomic/idempotent persistence, real-database races, safe receipt, owner handoff, runbook, and named production approval are implemented and evidenced.

## References

- `docs/09-roadmap/specs/pending/26-SPEC-multi-tenant-organizations-memberships-onboarding-and-lifecycle.md`
- `docs/09-roadmap/specs/pending/27-SPEC-multi-tenant-identity-sessions-authorization-apis-and-frontend-context.md`
- `docs/09-roadmap/specs/pending/28-SPEC-multi-tenant-database-enforcement-audit-abuse-observability-and-recovery.md`
- `docs/09-roadmap/specs/pending/34-SPEC-multi-tenant-azar-migration-cutover-certification-and-solar-rollout.md`
- `docs/09-roadmap/specs/pending/35-SPEC-production-auth-user-and-profile-provisioning.md`
- `docs/03-operation/spec26-organization-governance-runbook.md`
- `docs/03-operation/spec27-identity-session-and-context-runbook.md`
- `docs/05-integrations/api-contracts.md`
- `docs/07-development/engineering-standards.md`
