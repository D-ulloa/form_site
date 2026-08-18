# SPEC-25 containment and incident runbook

Status: implementation baseline, 2026-08-18. The deployment remains
`azar_legacy_single_organization`; real Solar data is prohibited.

## Before a production change

The operations owner captures an encrypted provider-supported database backup,
identity/grant manifest, Storage manifest, and provider metadata manifests. The
record includes UTC time, owner, encryption/key custodian, retention, size,
SHA-256, migration state, and a successful readability check. Evidence stays
outside Git under least privilege. Never paste payloads, tokens, secret URLs,
credentials, DNI, or financial evidence into tickets or general logs.

Reconcile migration history, revoke the committed Make hook in Make, disable its
scenario, inspect available request history, verify the Drive parent has only
approved private user/group access, deploy code, and then apply
`20260818000000_spec25_containment.sql`. Review the temporary Azar admin list and
increment `CONTRACT_SESSION_VERSION` after removals. Do not rotate
`CONTRACT_TOKEN_SECRET` merely to clear application sessions.

## Severity and response targets

- SEV-1: credible public/cross-customer sensitive-data exposure, service-role or
  integration-secret compromise, or active old Make hook. Respond in 15 minutes.
- SEV-2: public Drive ACL, unauthorized grant/session, production `X-User-Id`,
  API-key misuse, or material inventory mismatch. Respond in one hour.
- SEV-3: blocked attempt, configuration drift, inaccessible inventory source,
  or redacted logging defect. Respond in one business day.

Named incident commander, technical, product, operations, and legal/privacy
contacts must exist in the protected on-call system before production sign-off.
Legal/privacy owns jurisdiction-specific notification decisions.

## Containment and recovery

1. Preserve provider history, UTC timestamps, checksums, Git revision,
   configuration fingerprints, and affected opaque IDs.
2. Disable the affected frontend and every backend/worker path. Do not delete
   evidence or customer content.
3. For identity events, remove/freeze the grant and increment the session
   version. Revoke only the affected role token if an external link is involved.
4. For Drive, remove `anyone`, domain, and unapproved external permissions after
   evidence capture; grant only reviewed Azar users/groups. Never restore public
   access as rollback.
5. For Make, disable/revoke the hook/scenario and database trigger. Preserve
   business intent for reconciliation and never report delivery success.
6. For credential compromise, fingerprint, rotate/revoke, propagate to every
   scope, redeploy, and verify both old-value failure and new-value activation.
7. Determine affected records, people, period, and provider copies. Product and
   legal/privacy approve any customer communication.
8. Re-enable only after reconciliation balances, monitoring shows no recurrence,
   and incident commander plus security owner approve.
9. Complete a post-incident review and assign later-SPEC changes.

Emergency grants require two-person approval, reason, explicit expiry, protected
audit evidence, and a session-version increment when removed.
