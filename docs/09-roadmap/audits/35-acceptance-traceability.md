# SPEC-35 acceptance traceability

Status: repository implementation, 2026-08-25. No production user, activation,
membership, organization, role, operator, or legacy administrator grant was created.

| Scope | Implementation evidence | Automated evidence |
|---|---|---|
| Canonical service boundary | `identityProvisioningService.ts` validates trusted actor/purpose, canonical email, bounded fields, defaults, safe outcomes, and disabled state | `spec35-identity-provisioning.test.ts` |
| Narrow Auth adapter | `supabaseAdminAdapter.ts` uses only the central service-role client, exact normalized-email resolution, passwordless unconfirmed creation, and ignores provider metadata | backend typecheck and unit tests |
| Idempotency and ambiguity | Durable payload/email fingerprints, active-email uniqueness, advisory serialization, SPEC-34 quarantine check, provider-ambiguous state, and reconcile-before-create retry | unit and migration contract tests |
| Profile safety | Atomic insert-on-conflict create-if-absent preserves existing display name, locale, and time zone; `user_id` remains the profile primary key | unit and migration contract tests |
| Restricted evidence | Forced-RLS operation/event tables, append-only events, browser grant revocation, no plaintext email/provider secrets, and required audit in state-changing RPCs | `spec35-migration-contract.test.ts` |
| Operator boundary | Disabled-by-default server CLI requires an active MFA operator, AAL2 step-up reference, request ID, idempotency key, and accepts no password/role/user UUID | typecheck; documentation review |
| Startup and operations | Production validation requires explicit enablement, defaults, email pepper, and allowed activation origin; runbook covers outage, ambiguity, orphan repair, disablement, and revocation | unit/static evidence; deployment validation remains open |

## Acceptance disposition

- Criteria 1–10 and 13–14 have repository controls and automated static/unit evidence.
  The service never writes organization, membership, operator, customer, or legacy-admin
  authority, and public registration remains closed.
- Criteria 11–12 require disposable and production-shaped Supabase concurrency, partial
  failure, RLS/grant, password/Google identity, and SPEC-34 inventory evidence. Those
  external gates remain open; this document does not claim them.
- Production audit availability, deployment distributed controls for any future mounted
  route, activation delivery, canary evidence, dashboards, privacy retention approval,
  and named sign-off remain open. The current entry point is a restricted server command,
  not a public or organization-administration API.

The SPEC remains pending until those real-provider, real-database, operational, and
approval gates are recorded. Repository implementation alone does not authorize enablement.
