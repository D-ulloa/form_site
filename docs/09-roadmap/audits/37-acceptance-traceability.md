# SPEC-37 acceptance traceability

Status: repository implementation complete and disabled; production completion gates open.

| Acceptance area | Repository evidence | Remaining external evidence |
|---|---|---|
| Delivery and truthful state | `invitationDelivery.ts`, `invitationWorkflow.ts`, delivery-attempt migration, governance UI | Verified domain, provider sandbox/canary, reconciliation and alert evidence |
| Identity and exact-email acceptance | SPEC-35 integration plus `spec37_accept_invitation_handoff` | Existing/new password and Google end-to-end runs |
| Raw-token and auth handoff safety | Fragment exchange, hashed 15-minute browser/origin-bound handoff, HttpOnly cookie | Fixation/replay/cross-browser penetration evidence |
| Resend/revoke/races | Transactional SPEC-37 wrappers and handoff invalidation | Real-Postgres accept/resend/revoke/expiry/suspension races |
| Webhooks | Raw-body Svix verification, hashed dedupe/reference, delivery-only SQL | Signed duplicate/bounce/complaint provider runs and failure alerts |
| Tenant lists and UI | Scoped bounded masked RPCs, mounted endpoints, loaded governance controls | Azar/Solar direct-ID and browser-role certification |
| Operations | Fail-closed configuration and SPEC-37 runbook | Named security/operations/product approvals and rollback rehearsal |

Automated evidence is in the SPEC-37 backend unit/migration tests and frontend
organization-governance integration test. It is not evidence of DNS configuration,
provider authorization, real database locking/RLS, deliverability, or human approval.
