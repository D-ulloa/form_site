# SPEC-26 organization governance runbook

Status: staged, 2026-08-18. This runbook authorizes no production customer
creation, membership backfill, invitation delivery, suspension, or deletion.

## Deployment and verification

1. Confirm SPEC-25 containment is active and no automatic administrator grant
   or fixed Make trigger has returned.
2. Back up the database and reconcile applied Supabase migrations.
3. Apply `20260818120000_spec26_organization_governance.sql` to a disposable
   database. Verify all nine tables are empty, RLS-enabled, and denied to
   `anon` and `authenticated`.
4. Exercise atomic creation with synthetic Auth users. Verify one organization,
   one settings row, one active owner, and one event—or no rows after failure.
5. Race invitation accept/resend/revoke and owner-reducing mutations. Stop if
   more than one terminal invitation outcome occurs or an organization becomes
   ownerless.
6. Run backend/frontend tests, builds, lint, and `git diff --check`.

## Provisioning

Organizations are platform-created and invite-only. Self-service creation,
email-domain enrollment, metadata-derived membership, and copying
`contract_admin_users` are forbidden. SPEC-26 creates neither Azar nor Solar;
SPEC-34 owns reviewed production identifiers and backfill. Until SPEC-27
authenticates platform operators, provisioning functions must not be exposed by
HTTP or called from a browser.

## Invitation troubleshooting

Persist and log neither raw tokens nor hashes. Delivery failure leaves the
invitation auditable and creates no membership. Resend rotates the token and
replaces the old invitation. Treat expired, replaced, revoked, used,
wrong-account, and unknown tokens as the same public invalid result. Provider
selection is unresolved, so production sending stays disabled and tests use the
fake adapter.

## Last-owner recovery

Never bypass `LAST_OWNER_REQUIRED` by editing membership rows. Confirm the
organization UUID, active-owner set, actor/request evidence, and lifecycle
state. Use atomic ownership transfer after SPEC-27 step-up authentication is
available. If correctness is uncertain, block owner-reducing operations and
escalate to security; do not create a global administrator membership.

## Suspension, export, and deletion

Only the future platform-operator boundary may suspend/reactivate. Suspension
preserves data and memberships while blocking customer mutations/delivery.
Exports return `DEPENDENCY_NOT_READY` until private packaging exists. Deletion
requests remain disabled because there is no approved numeric grace period and
cleanup workers do not exist. A legal hold or any missing database, Storage,
provider, secret, job, export, audit, backup, or billing receipt keeps
finalization blocked. Never delete an Auth user solely because one organization
relationship ends.

## Rollback

Roll back application code while retaining additive governance tables. Do not
drop organization, membership, invitation, event, request, export, or hold
history. Correct schema through a forward migration. Reapply deletion
tombstones before exposing a restored database.

