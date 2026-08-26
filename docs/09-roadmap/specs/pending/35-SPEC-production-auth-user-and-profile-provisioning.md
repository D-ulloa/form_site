# SPEC-35 Production readiness — Auth-user and application-profile provisioning

**Date:** 2026-08-25
**Priority:** release blocker
**Status:** repository implementation staged; disabled pending real-provider certification, inventory review, and approval
**Roadmap identifier:** PROD-SPEC-01
**Dependencies:** SPEC-25, SPEC-26, SPEC-27, and the SPEC-34 identity inventory
**Blocks:** SPEC-36, SPEC-37, and production onboarding of any new owner or member

---

## Specification identity

**Name:** Idempotent Auth-user and `user_profiles` provisioning for invite-only production access.

**Description:** Define one server-owned identity-provisioning boundary that can safely prepare initial owners and invited users without public registration, global administrator grants, manual SQL, or incomplete profile rows.

**Why it is necessary:** The production registration endpoint is intentionally closed, `user_profiles` has required fields but no canonical creation path, and organization membership foreign keys require an existing Supabase Auth user. Today an operator must coordinate Auth and database changes manually, which can leave partial identities and makes onboarding neither repeatable nor auditable.

## Summary

Supabase Auth remains the global human identity provider. This specification adds a production-safe application workflow around it; it does not replace Supabase credentials, email verification, password recovery, or Google OAuth.

The workflow must:

- resolve an existing Auth identity by canonical verified email without creating duplicates;
- create an invite-only Auth identity when one does not exist;
- create or repair exactly one non-authoritative `user_profiles` row;
- never create an organization membership, owner role, `contract_admin_users` grant, platform-operator record, or customer data by identity provisioning alone;
- support password activation and Google authentication without trusting editable provider metadata as authority;
- be idempotent, auditable, enumeration-resistant, and safe to retry after provider ambiguity; and
- provide an explicit result that SPEC-36 and SPEC-37 can consume.

This document is an implementation specification only. It does not authorize creating or changing production users.

## Authority and relationship to existing specifications

- SPEC-25 remains authoritative for identity inventory, containment, and removal of legacy global grants.
- SPEC-26 remains authoritative for profiles, memberships, roles, invitations, ownership, and the rule that Auth identity alone grants no organization access.
- SPEC-27 remains authoritative for Supabase authentication handoff, opaque application sessions, email verification, password/Google flows, CSRF/Origin controls, and zero-membership sessions.
- SPEC-28 remains authoritative for audit availability, distributed limits, telemetry redaction, request correlation, and privileged failure behavior.
- SPEC-34 remains authoritative for reconciling existing production identities and grants. This specification must not silently “repair” an inventoried ambiguity.

Where this document conflicts with those specifications, the earlier security and tenant-isolation rules win and this document must be revised.

## Current repository gap

The current repository has these relevant conditions:

- `POST /api/auth/register` fails closed with `REGISTRATION_CLOSED`.
- Password and Google login can establish identity and an application session, including a zero-membership session.
- `public.user_profiles` requires `display_name`, `locale`, and `time_zone` and references `auth.users`.
- No public production route or Auth trigger creates profiles. The disabled SPEC-35
  restricted operator command now owns the server-side create-if-absent path.
- `createUserProfileRepository` reads and updates profiles but does not create them.
- Organization creation and invitation acceptance require an existing Auth user UUID.
- The Supabase service-role key exists server-side and must not be exposed to the browser or general route code.

Manual Supabase Dashboard changes are an emergency bootstrap technique, not the target production path.

## Scope

### Includes

- A typed `IdentityProvisioningService` and narrow Supabase Admin adapter.
- Canonical email normalization shared with organization invitations.
- Existing-user resolution and duplicate/ambiguous identity denial.
- Invite-only Auth-user creation or activation initiation.
- Idempotent profile creation/repair with safe defaults.
- Identity provisioning states and safe projections.
- Restricted operator command/API integration points consumed by SPEC-36 and SPEC-37.
- Audit, rate limiting, reconciliation, tests, runbooks, and deployment validation.

### Excludes

- Public self-registration or organization self-service creation.
- Membership, role, owner, platform-operator, support, or legacy admin grant creation.
- Sending organization invitation email; SPEC-37 owns it.
- Creating the organization and initial owner membership; SPEC-36 owns it.
- Custom domains, SSO, SCIM, or domain-based enrollment.
- Deleting Auth users as an onboarding rollback mechanism.

## Non-negotiable invariants

1. An Auth user and profile grant no organization authority.
2. Email is normalized once by the canonical server utility; case or whitespace variants cannot create duplicate application identities.
3. Provider user metadata such as `company`, `role`, `organization_id`, or `is_admin` is presentation input only and never authorization.
4. A provisioning caller cannot select a user UUID, verification state, membership, or role.
5. Existing identities are reused only after exact normalized-email resolution. Ambiguous provider results fail closed for operator review.
6. The service never changes the email of an existing identity to satisfy an invitation.
7. The service never auto-links two Auth users or merges history.
8. Every successfully provisioned Auth user has exactly one `user_profiles` row.
9. Profile creation is idempotent and cannot overwrite an existing user's chosen display name, locale, or time zone.
10. No password, OAuth token, provider action link, one-time code, service key, session token, or raw invitation token is persisted in application tables, audit, telemetry, or command output.
11. Passwords are never accepted as command-line arguments, organization-administration payloads, or operator-generated defaults.
12. A new identity remains without customer access until SPEC-36 or SPEC-37 atomically establishes a membership.
13. Provider timeout/ambiguity is reconciled by provider identity and operation evidence before retry; blind duplicate creation is forbidden.
14. Production code uses the central platform service-role client and a narrow Admin adapter, not ad hoc Supabase clients.
15. Legacy `contract_admin_users` and `CONTRACT_ADMIN_USER_IDS` are never populated by this flow.
16. Existing SPEC-34 identity ambiguities are quarantined and require reviewed resolution.

## Identity and profile state model

The service returns one of these internal outcomes:

| Outcome | Meaning | Allowed next step |
|---|---|---|
| `existing_active` | One existing Auth identity has the exact email and satisfies current eligibility | Create owner/member workflow |
| `existing_activation_required` | Identity exists but requires an approved activation/verification action | Deliver activation, then resume |
| `created_activation_required` | A new invite-only identity was created and has no organization access | Deliver activation, then resume |
| `reconciled_after_ambiguity` | A prior provider call was resolved to one exact identity | Continue with recorded evidence |
| `blocked_ambiguous` | Multiple/conflicting identities or inventory evidence exist | Operator review only |
| `blocked_ineligible` | Identity is banned/deleted/otherwise ineligible under approved policy | No onboarding |

These are backend/operator outcomes, not public account-discovery responses.

`user_profiles` remains presentation/preferences data. For a new identity, safe initial values are:

- `display_name`: validated name explicitly supplied by the invited person or operator; if absent, a neutral localized placeholder, never an email local part;
- `locale`: approved deployment default, initially `es` unless an explicit validated value is supplied; and
- `time_zone`: approved deployment default, initially `America/Caracas` unless an explicit validated value is supplied.

The defaults must be startup-configured/documented rather than inferred from IP address. The user can update the profile after authentication through the existing profile contract when mounted.

## Required service contract

The internal request shape is:

```ts
interface ProvisionIdentityInput {
  email: string;
  display_name?: string;
  locale?: string;
  time_zone?: string;
  purpose: 'initial_owner' | 'organization_invitee';
  request_id: string;
  idempotency_key: string;
}
```

The trusted caller context is separate from input and identifies either a reviewed platform operator or an authenticated organization invitation actor. Public request fields cannot construct that context.

The safe internal result contains only user UUID, normalized email, profile state, activation requirement, provider reconciliation reference, and idempotency outcome. It excludes provider tokens/action links and authorization claims.

## Transaction and provider workflow

1. Validate actor, purpose, request ID, bounded idempotency key, email, and profile fields.
2. Acquire an email-scoped lock or equivalent durable serialization.
3. Read the SPEC-34 identity mapping/inventory when applicable.
4. Resolve Auth users by exact canonical email through the narrow Admin adapter.
5. If zero exist, create one invite-only identity without a password and without auto-created application authority.
6. If one exists, classify eligibility and activation state without changing identity ownership.
7. If more than one or evidence conflicts, record a safe blocked outcome and stop.
8. Insert the profile if absent. If present, validate linkage and preserve user-chosen values.
9. Persist safe idempotency/audit evidence. Provider actions and local evidence must be reconciled before retry after an ambiguous response.
10. Return the typed outcome to the trusted caller.

Because Auth and application Postgres changes cannot be assumed to share one transaction, the workflow is a resumable state machine. A profile-write failure after Auth creation does not delete the Auth user; retry repairs the profile. A provider timeout first performs exact-email reconciliation.

## Interfaces

### Operator interface

First release must expose this service only through the restricted provisioning command defined by SPEC-36 or a separately approved platform route with `PlatformRequestContext`, MFA/step-up, CSRF/Origin protection, distributed rate limiting, and required audit.

There is no public `POST /register`, owner-created-password endpoint, or browser service-role endpoint.

### Organization invitation interface

SPEC-37 may call the service after an authorized invitation request. It passes the canonical invited email and purpose `organization_invitee`; it cannot request owner role or receive provider secrets. Public responses remain enumeration-resistant.

## Errors and failure behavior

- `IDENTITY_AMBIGUOUS`: operator-only blocked result; no public identity detail.
- `IDENTITY_INELIGIBLE`: generic onboarding denial.
- `PROFILE_CONFLICT`: UUID/profile linkage is inconsistent; no overwrite.
- `IDENTITY_PROVIDER_UNAVAILABLE`: safe retriable `503`; reconcile before retry.
- `AUDIT_UNAVAILABLE`: fail privileged production provisioning closed.
- `RATE_LIMITED`: distributed `429` for mounted APIs.
- `VERSION_CONFLICT`: safe retry only after re-read.

General logs use request ID and safe outcome class only. Email addresses may appear only in the restricted operator/audit boundary according to approved privacy policy, preferably as HMAC/fingerprint or masked form.

## Affected implementation areas

- Forward-only migration for durable provisioning/idempotency evidence if needed; do not edit SPEC-26/27 migrations.
- `backend/src/identity/` Admin adapter and identity provisioning service.
- `backend/src/platform/serviceRoleClient.ts` as the only service-role construction path.
- `backend/src/organizations/` profile repository create-if-absent behavior.
- Restricted CLI/platform route integration in SPEC-36.
- Invitation integration in SPEC-37.
- Environment validation for profile defaults and Auth redirect origins.
- Identity/profile provisioning runbook and acceptance traceability.

## Implementation sequence

1. Approve default locale/time zone, Auth activation methods, operator boundary, privacy retention, and ambiguity policy.
2. Add the typed Admin adapter, canonical resolver, idempotency/reconciliation evidence, and profile create-if-absent transaction.
3. Add restricted command/service integration without mounting public registration.
4. Integrate with SPEC-36 and SPEC-37 behind disabled production flags.
5. Reconcile existing identities/profile rows under SPEC-34.
6. Certify against a disposable and production-shaped Supabase project before enablement.

## Required tests

### Unit and adapter tests

- Email normalization, field bounds, safe profile defaults, and metadata non-authority.
- Zero/one/multiple identity resolution.
- Existing active, activation-required, ineligible, and ambiguous outcomes.
- Idempotency replay and mismatched-payload rejection.
- Profile create-if-absent without overwriting existing preferences.
- Provider timeout followed by reconciliation.
- Redaction of email, passwords, tokens, links, service keys, and raw provider errors.

### Real-database and provider tests

- Auth user plus exactly one profile under concurrent duplicate requests.
- RLS/grants deny browser profile insertion outside approved APIs.
- Auth creation followed by profile failure resumes safely.
- Existing profile with wrong user linkage fails closed.
- Password activation and Google login resolve the same eligible user where provider policy permits.
- No membership, organization, owner, operator, or legacy admin grant appears after identity-only provisioning.

### Security tests

- Public callers cannot enumerate existing email addresses.
- Caller-supplied UUID, role, organization, verification state, or metadata cannot alter the outcome.
- Service-role/Admin credentials never reach frontend bundles, responses, logs, or audits.
- Repeated/parallel requests cannot create duplicate identities or profiles.
- SPEC-34 ambiguous identities remain quarantined.

## Acceptance criteria

1. One documented production service owns Auth-user/profile provisioning.
2. Public registration remains closed unless a later approved specification changes policy.
3. New users are created without operator-selected passwords.
4. Existing exact-email identities are reused; ambiguous identities fail closed.
5. Every successful outcome has exactly one profile with validated values.
6. Identity/profile creation alone grants no organization or legacy administrator access.
7. Retries are idempotent and reconcile provider ambiguity before creation.
8. Profile defaults are explicit, validated, documented, and editable after authentication.
9. Raw credentials, activation links, and tokens are absent from persistence and telemetry.
10. Audit and distributed abuse controls are active for every production entry point.
11. Real Supabase tests prove concurrency, partial-failure recovery, and browser grant denial.
12. SPEC-34 inventory confirms every pre-existing production identity/profile disposition.
13. Runbooks cover provider outage, ambiguity, orphan profile repair, and operator revocation.
14. Deployment startup fails closed when required Auth/origin/default/audit configuration is missing.

## Rollout, rollback, and completion gate

Rollout is additive: deploy disabled, run disposable-project certification, reconcile current users, run canary provisioning with a synthetic non-customer address, then enable only for SPEC-36/37 trusted callers. No real customer is created during certification.

Rollback disables new provisioning and activation delivery. It does not delete Auth users or profiles created successfully, restore public registration, or re-enable global admin grants. Incomplete workflows remain resumable and audited.

SPEC-35 is complete only when the service, restricted entry point, migrations, provider reconciliation, real-database tests, configuration, runbook, and acceptance evidence are implemented and approved. A static unit test or successful manual Dashboard creation is not completion evidence.

## References

- `docs/09-roadmap/specs/pending/25-SPEC-multi-tenant-policy-threat-model-containment-and-inventory.md`
- `docs/09-roadmap/specs/pending/26-SPEC-multi-tenant-organizations-memberships-onboarding-and-lifecycle.md`
- `docs/09-roadmap/specs/pending/27-SPEC-multi-tenant-identity-sessions-authorization-apis-and-frontend-context.md`
- `docs/09-roadmap/specs/pending/28-SPEC-multi-tenant-database-enforcement-audit-abuse-observability-and-recovery.md`
- `docs/09-roadmap/specs/pending/34-SPEC-multi-tenant-azar-migration-cutover-certification-and-solar-rollout.md`
- `docs/01-overview/architecture.md`
- `docs/02-setup/environment.md`
- `docs/05-integrations/api-contracts.md`
- `docs/06-testing/testing-strategy.md`
- `docs/07-development/engineering-standards.md`
