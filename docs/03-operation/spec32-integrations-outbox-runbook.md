# SPEC-32 integrations and outbox operations

Status: additive implementation, 2026-08-19. Provider cutover, production credentials/resources, and Solar remain blocked by SPEC-27, SPEC-34, live certification, and approvals.

## Safety boundary

PostgreSQL domain data is canonical; Drive, Sheets, and Make are projections. Resolve the immutable event's `organization_id`, then the exact active `organization_integrations` row. Never accept routing from request JSON, a slug, browser state, a resource name/URL, or the legacy `GOOGLE_*`, `CONTRACT_GOOGLE_*`, or `MAKE_WEBHOOK_URL` variables. Those variables are contained Azar-only compatibility inputs until SPEC-34 removes them.

Application rows contain only an opaque secret-store reference, version, state, and fingerprint. Secret plaintext and encryption keys never enter SQL, logs, audits, general backups, browser responses, or tickets. Decrypt only inside the provider adapter, bind envelope AAD to organization/integration/type/version, and clear temporary buffers after use.

## Configure, test, and enable

Only a trusted SPEC-27 context with `integrations.manage`, current step-up, version, rate allowance, and audit may mutate configuration. Create or rotate the secret first, save only its opaque reference, validate the closed provider/purpose schema, and perform a read-only health check against the exact destination. Enable only after health and approval pass. A health check must not create a property/contract, append a production row, upload customer content, or send customer data.

Drive destinations must be private, under the registered parent, and contain no `anyone` permission. Sheets use a separate spreadsheet per organization/purpose and reserved event/delivery/idempotency/resource/version columns. Webhooks require HTTPS/443, public DNS answers at validation and connection, redirect revalidation, bounded time/body, organization-specific HMAC, timestamp tolerance, and receiver event-ID dedupe.

## Worker and delivery response

Invoke the stateless worker from a durable scheduler. `spec32_claim_deliveries` rotates organizations, locks with `skip locked`, and records a random lease token/expiry. Immediately before a provider call, reload organization, integration, credential/configuration versions, and lease. Every state mutation must present the current organization, delivery, lease token, and version.

- Confirmed success records the stable external ID/receipt and cannot be retried.
- A conclusive transient failure uses capped jittered backoff and a fixed event payload.
- A timeout, thrown provider call, or expired in-call lease is ambiguous and enters reconciliation before another call.
- A permanent, exhausted, conflicting, or multiple-match result enters dead letter.
- Manual retry is audited against the same event/revision; it never recreates a domain revision or asset.

Drive reconciliation searches the exact registered parent by marker. Sheets searches the exact spreadsheet/tab/idempotency column. Zero matches may retry; one exact match may be adopted; multiple or mismatched results are an incident. A webhook without dedupe/receipt status remains manual after ambiguity.

## Suspension, disconnect, and rotation

Suspension or disconnect blocks new claims immediately. Reconcile leased/processing/unknown work before revocation. Rotation creates and tests a new version, atomically selects it for new claims, retains the old version only for the approved grace window, then records revocation/deletion evidence. Reactivation never silently enables a revoked integration.

Organization deletion requires no replayable work plus secret revocation, Drive unsharing/private ACL verification, external-copy cleanup/retention receipts, and legal-hold handling. Canonical database/assets are not deleted merely because an integration disconnects.

## Recovery and incident response

After restore, keep integrations and workers paused. Reapply tombstones, holds, revocations, and disabled states; inventory success/processing/unknown/retry work by organization; then reconcile stable provider markers before claims resume. Rollback pauses delivery and uses a forward fix—it never restores direct request calls, a fixed database trigger, public ACLs, or blind retry.

Treat any cross-organization provider call/success, public Drive ACL, secret/plaintext exposure, unsafe destination, duplicate effect, lease bypass, fixed-trigger activity, or restored replay as a containment incident. Disable the affected integration/worker, revoke compromised material, preserve redacted attempts/receipts, follow SPEC-25/SPEC-28, and keep Solar blocked.

Protected zero-result checks include orphan/cross-tenant FK audits, duplicate active integrations and idempotency markers, expired leases, unknown age, dead-letter age, public ACL inventory, secret-reference state, destination health, and outbox backlog/fairness. Do not export payloads, URLs, private IDs, or credential references into general dashboards.
