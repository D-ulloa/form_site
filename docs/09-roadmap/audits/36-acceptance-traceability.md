# SPEC-36 acceptance traceability

Status: repository implementation, 2026-08-25. No production organization, user,
membership, operator, activation, or legacy administrator grant was created.

| Scope | Implementation evidence | Automated evidence |
|---|---|---|
| Restricted command | `platform:provision-organization` is a standalone CLI; dry-run is default and execute requires an exact fingerprint and owner-only manifest permissions | `spec36-organization-provisioning.test.ts`; backend typecheck |
| Manifest/target boundary | Strict versioned schema, canonical SHA-256, size/unknown/secret-field rejection, reviewed approval reference, exact production project ref, deployment identity, named operator and AAL2 session | unit tests and runbook review |
| Exact owner | Reuses SPEC-35 service and narrow Auth adapter; preflight resolves without writes; execute uses the operation-derived identity idempotency key and accepts no password | SPEC-35 and SPEC-36 unit tests |
| Atomic organization | Canonical `OrganizationService.createOrganization` invokes the service-role-only SPEC-26 transaction for organization, settings, active owner, and event | SPEC-26 migration tests and SPEC-36 service tests |
| Idempotency/reconciliation | Immutable operation fingerprint, deterministic reserved UUIDs, operation/slug advisory locks, unique slug reservation, replay receipts, and readback reconciliation after an ambiguous RPC result | unit and migration contract tests |
| Safe evidence/handoff | Forced-RLS operations, append-only events, redacted receipts, readback assertions, visible `attention_required`, and resumable `pending` handoff | unit and migration contract tests |
| Containment | Central service-role client, no HTTP route, no browser grants, no direct creation SQL in the SPEC-36 migration, and no legacy grant/key mutation | migration contract tests and source review |

## Acceptance disposition

Criteria 1–10 and 13–14 have repository controls and static/unit evidence. Criterion 11
has the durable `pending` handoff boundary but its failed-delivery/resend transitions
remain owned by SPEC-37. Criterion 12 and the production completion gate require a disposable production-shaped
Supabase rehearsal covering real concurrent RPC execution, browser-role negative grants,
provider response loss, activation/login/context isolation, failed delivery/resend after
SPEC-37, teardown, and named approval evidence. SPEC-36 therefore remains pending.

The implementation is disabled by default and does not itself authorize a real customer,
Azar migration, Solar rollout, operator enrollment, or activation delivery.
