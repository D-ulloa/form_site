# SPEC-32 / MT-SPEC-08 Multi-tenant SaaS — integrations, secrets, outbox, Google, and Make

**Date:** 2026-08-18
**Priority:** critical
**Status:** pending prerequisite specifications and approval
**Roadmap identifier:** MT-SPEC-08
**Dependencies:** SPEC-25 / MT-SPEC-01 through SPEC-31 / MT-SPEC-07, including the missing MT-SPEC-03 and MT-SPEC-05 contracts
**Blocks:** safe contract/property provider cutover in MT-SPEC-10 and onboarding any second real organization

---

## Specification identity

**Name:** Organization integration configuration, encrypted secrets, private Google resources, transactional outbox, workers, and secure webhooks.

**Description:** Replace process-global provider configuration and direct delivery with organization-resolved destinations and a durable idempotent event-delivery system.

**Why it is necessary:** Database isolation is incomplete if Solar data is written into Azar’s Drive, Sheet, or Make scenario. Current requests call global providers directly, Drive folders are public, Sheet appends are ambiguous, and the database Make trigger sends a complete row to one fixed endpoint.

## Summary

This specification creates the integration boundary required for more than one organization. It defines:

- organization-owned Google Drive, Google Sheets, Make/webhook, and future provider configurations;
- platform-managed credentials with separate per-organization destinations as the first-release model;
- managed/envelope-encrypted secret references and rotation;
- private Drive resources and explicit least-privilege sharing;
- separate organization spreadsheets by default;
- transactional `outbox_events` created with domain changes;
- durable `integration_deliveries` and append-only delivery attempts;
- leased, fairly scheduled, bounded, idempotent workers compatible with Vercel/Supabase;
- stable external resource identifiers and provider-specific reconciliation;
- versioned allowlisted webhook payloads and organization-specific signing;
- SSRF-resistant administrator-configured endpoints;
- side-effect-free health tests, safe integration administration, and manual retry/dead-letter handling;
- suspension, disconnect, rotation, deletion, backup, and restore semantics; and
- staging/adversarial tests using distinct Azar and Solar folders, Sheets, receivers, credentials, failures, and rotations.

Canonical contract, property, and asset data remains in PostgreSQL/private Storage. Google and Make are projections. Provider failure never changes organization ownership or recreates business revisions.

This document defines implementation contracts. It does not configure production credentials, create real Azar/Solar provider resources, call providers, migrate external data, remove a production trigger, or enable Solar.

## Authority and relationship to other specifications

This is the eighth formal implementation SPEC derived from:

- `docs/09-roadmap/specs/research/23-RESEARCH-multi-tenant-saas-architecture.md`;
- `docs/09-roadmap/specs/research/24-RESEARCH-multi-tenant-saas-specification-roadmap.md`;
- `docs/09-roadmap/specs/pending/25-SPEC-multi-tenant-policy-threat-model-containment-and-inventory.md`;
- `docs/09-roadmap/specs/pending/26-SPEC-multi-tenant-organizations-memberships-onboarding-and-lifecycle.md`;
- `docs/09-roadmap/specs/pending/28-SPEC-multi-tenant-database-enforcement-audit-abuse-observability-and-recovery.md`;
- `docs/09-roadmap/specs/pending/30-SPEC-multi-tenant-properties-submissions-modifications-and-management.md`; and
- `docs/09-roadmap/specs/pending/31-SPEC-multi-tenant-private-assets-uploads-retention-and-storage-migration.md`.

MT-SPEC-03 and MT-SPEC-05 are not currently present as project documents. This SPEC may be reviewed, but it cannot complete until trusted member/machine/support context and contract-owned event/resource interfaces exist.

Ownership boundaries:

- MT-SPEC-03 authenticates organization members, organization API keys, workers, and support principals.
- SPEC-28 supplies scoped persistence, audit, usage, rate limits, fair claims, observability, backup, restore, and incident standards.
- MT-SPEC-05 supplies contract events/projections and stable contract/revision/link semantics.
- SPEC-30 supplies immutable property revisions/runs and the approved POL-06 projection.
- SPEC-31 supplies canonical private asset IDs and exported-copy tracking.
- This SPEC owns provider resolution, secrets, configuration, outbox delivery, external resources, and reconciliation.
- MT-SPEC-10 owns production resource inventory, migration, trigger removal/cutover, and Solar rollout.

## Previous behavior that must be preserved

The migration must preserve the intended functions of existing flows:

- property creation projects to Drive, Sheets, and Make;
- property media is exported in deterministic order with a cover selection;
- contract Sheet mapping/header validation remains deterministic;
- Sheet formula injection protections remain effective;
- contract/property provider outcomes remain visible to authorized users;
- transient provider failures use bounded retry classification;
- stable returned Drive/Sheet identifiers needed for operations remain available through safe projections; and
- backend-only credentials never reach the browser.

The following mechanisms are replaced:

- global `GOOGLE_*`, `MAKE_WEBHOOK_URL`, and `CONTRACT_GOOGLE_*` values as customer routing authority;
- implicit user-OAuth/service-account fallback during a business operation;
- direct provider calls in an HTTP request;
- automatic retry where commit outcome is ambiguous;
- `anyone`/`reader` Drive permissions;
- a fixed database Make URL and whole-row webhook trigger;
- local/console provider outcome authority;
- fuzzy Sheet reconciliation by time and submitted values;
- unscoped global `CONTRACTS_API_KEY` provider authority; and
- retry that recreates a contract/property revision or asset.

## Context

The current property adapters read one process-wide Drive parent folder, spreadsheet/range, Make URL, and Google credential selection. Drive folders receive `anyone` reader access. Contract compatibility uses another global Sheet destination. The database Make trigger embeds one URL and posts `to_jsonb(NEW)` when the generation flag changes.

Provider calls happen synchronously and use generic retry. Google Sheet append has no native application idempotency key; a timeout may occur after a row was committed. Current documentation recommends manually searching by time/values, which is insufficient for multi-tenant correctness. There is no durable outbox, lease, delivery record, dead-letter state, secret rotation link, or organization/provider health boundary.

## Motivation

Database isolation fails if an Azar event is delivered through Solar credentials or into Solar's folder, Sheet, or webhook. Provider routing must therefore resolve from the already-authorized owning organization and immutable event, not from environment fallback, client input, or current UI context.

External APIs are not part of a database transaction. The application must commit intent first, then deliver idempotently and reconcile ambiguous outcomes before retrying.

## Objective

Implement one organization-scoped integration platform in which every provider configuration, secret reference, outbox event, delivery, attempt, external resource, health check, and retry has explicit ownership; all delivery is durable and idempotent; credentials/resources are private and least-privileged; and no provider failure, timeout, worker race, restore, or operator action can cross the Azar/Solar boundary or duplicate a business revision.

## Terminology

- **Integration:** Organization-owned configuration for one provider/capability/destination.
- **Provider:** A supported external system such as Google Drive, Google Sheets, or Make/webhook.
- **Credential reference:** Opaque pointer/version to secret material; not the secret itself.
- **Platform-managed credential:** Credential controlled by the SaaS operator, with distinct organization destinations.
- **Organization-owned credential:** Future credential authorized by the customer, still stored/used through the same secret boundary.
- **Outbox event:** Immutable organization-owned delivery intent written in the domain transaction.
- **Delivery:** Provider/integration-specific execution of one outbox event.
- **Attempt:** Append-only evidence of one leased provider call/reconciliation action.
- **Lease:** Time-bounded exclusive claim that permits one worker to process a delivery.
- **External resource:** Stable Drive folder/file, Sheet/spreadsheet/row marker, or provider event identity mapped to an organization/domain resource.
- **Ambiguous outcome:** Provider may have committed, but the application did not receive conclusive acknowledgement.
- **Reconciliation:** Provider lookup by stable identifiers/idempotency markers before retry.
- **Dead letter:** Terminal operational state requiring authorized adjudication/retry.
- **Health test:** Bounded non-business-side-effect validation of credentials/configuration/destination.
- **Webhook signing secret:** Organization/integration-specific secret used to authenticate outbound events.

New public/persisted JSON uses `snake_case`; environment variables use `UPPER_SNAKE_CASE`. Internal TypeScript follows repository conventions.

## Scope

### Includes

- Google Drive, Google Sheets, Make/outbound webhooks, and an extensible provider registry.
- Organization integration configuration, state, health, destination metadata, and safe projections.
- Managed secret storage or envelope encryption with external key material.
- Connect/configure/test/enable/disable/rotate/disconnect lifecycle.
- Private Google folders/files and organization-separated Sheets.
- Atomic outbox creation and durable delivery/attempt/external-resource records.
- Worker leases, concurrency, fairness, retry, reconciliation, dead letters, and manual retry.
- Versioned contract/property/asset payload mapping.
- Outbound signature/replay controls and SSRF-safe custom URLs.
- Safe integration UI, API, audit, metrics, alerts, recovery, and migration.
- Removal/replacement contract for the fixed database Make trigger and direct request delivery.

### Excludes

- Identity, organization, domain, or asset implementation owned by prior SPECs.
- Incoming third-party webhooks other than health-test acknowledgements; billing webhooks belong to MT-SPEC-09.
- General workflow automation designer.
- Customer-authored executable transformations.
- Making Drive the canonical asset store.
- Guaranteeing exactly-once behavior from providers that offer neither idempotency nor reconciliation; such deliveries remain blocked/manual rather than guessed.
- Production migration/cutover and real resource creation owned by MT-SPEC-10.

## Dependency and policy gate

Completion requires:

- POL-05 platform-managed credentials and distinct organization destinations;
- POL-06 property revision projection;
- POL-09 provider-copy/delivery/audit/secret-backup retention;
- POL-10 support access;
- POL-11 suspension behavior;
- MT-SPEC-03 trusted member/machine/support context and scoped API keys;
- SPEC-28 outbox/audit/usage/rate/fairness/recovery contracts;
- MT-SPEC-05 contract event/projection contract;
- SPEC-30 property revision/run contract; and
- SPEC-31 canonical asset/exported-copy contract.

Unresolved credentials, destination ownership, signing, SSRF, or idempotency policy leaves the integration disabled. There is no fallback to global production configuration for a second organization.

## Non-negotiable integration invariants

1. Every integration, outbox event, delivery, attempt, external resource, and health record has one non-null `organization_id`.
2. Provider configuration resolves from the immutable event's organization, never request JSON, slug, browser state, email, or global fallback.
3. A delivery can reference only an integration belonging to the same organization/event.
4. Composite constraints enforce organization equality across domain event, outbox, delivery, integration, and resource.
5. Cross-organization identifiers return generic not-found and produce no provider call.
6. Credentials are never stored plaintext in application tables, code, logs, audits, errors, payloads, test fixtures, or browser responses.
7. Secret decryption/use occurs only in the provider adapter execution boundary.
8. Credential references and versions are organization/integration-bound and auditable.
9. Platform-managed credentials use distinct private destination resources per organization.
10. Provider selection never silently falls back from organization-owned OAuth to a global service account or vice versa.
11. Every Drive folder/file is private and has no `anyone` permission.
12. Every Drive share is explicit, least-privileged, organization-approved, inventoried, and removable.
13. Each organization uses a separate spreadsheet by default; any alternative requires equivalent isolation evidence.
14. External resource IDs are stable authority for reconciliation; names, addresses, timestamps, and URLs are not.
15. Business state and outbox event commit atomically.
16. No provider call occurs inside the business database transaction.
17. Outbox events are immutable, versioned, allowlisted, size-bounded, and contain no credentials/tokens/private paths/unnecessary PII.
18. Each provider delivery has a stable organization-scoped idempotency key.
19. Workers claim deliveries with atomic leases; two workers cannot concurrently execute the same valid lease.
20. Lease expiry never implies the provider did not commit.
21. Ambiguous outcomes reconcile before retry.
22. Retry operates on delivery state and fixed event payload; it never recreates business revisions/assets.
23. Confirmed success cannot be manually retried into duplicate delivery.
24. Provider attempts are append-only and safely redacted.
25. Retries use bounded exponential backoff/jitter; permanent failures/dead letters do not loop forever.
26. One organization cannot monopolize worker/provider capacity.
27. Organization suspension/disconnect/credential revocation prevents new delivery claims immediately according to POL-11.
28. Outbound webhook payloads and signatures are versioned, replay-resistant, and organization-specific.
29. Administrator-supplied URLs cannot reach loopback, private, link-local, metadata, unsupported port/scheme, or rebinding destinations.
30. Redirects, timeouts, response sizes, and logged bodies are bounded.
31. Health tests do not create real business records or send customer payloads.
32. Integration UI exposes masked safe configuration/health only.
33. Restore leaves deliveries paused until credentials, destinations, successes, unknown outcomes, and tombstones are reconciled.
34. No Azar event, credential, worker, resource, or receipt can be delivered to or observed through Solar integration state, and vice versa.

## Data model

All tables follow SPEC-28 UUID, timestamp, composite organization, RLS/grant, actor/request, index, version, and service-role requirements.

### 1. `organization_integrations`

- `id`, `organization_id`;
- `provider` in a closed registry such as `google_drive`, `google_sheets`, `make_webhook`;
- `purpose` such as `property_export`, `property_sheet`, `property_events`, `contract_sheet`, `contract_generation`;
- state in `draft`, `active`, `disabled`, `unhealthy`, `rotating`, `revoked`;
- `credential_ref`, `credential_version`;
- schema-validated safe `configuration` containing destination IDs/options but no secrets;
- safe masked destination summary;
- health state/error class/checked time;
- created/updated actor, timestamps, and version.

Unique constraints prevent two active integrations for the same organization/provider/purpose unless the provider contract explicitly permits deterministic fan-out.

### 2. Secret records/references

Application tables store only:

- opaque secret-store reference;
- secret type/purpose;
- organization/integration association;
- version, state, created/rotated/revoked timestamps;
- fingerprint/masked descriptor safe for comparison; and
- actor/request/audit references.

Preferred storage is a managed secret manager. If application encryption is approved, use envelope encryption with authenticated encryption, unique nonce, AAD binding organization/integration/secret type/version, and a key-encryption key outside the database/backups. Ciphertext, nonce, tag, wrapped data key, and algorithm version are stored; plaintext/key never is.

### 3. `outbox_events`

- `id`, `organization_id`;
- event type/schema version;
- aggregate type/id/revision/version;
- immutable allowlisted payload or stable projection reference;
- idempotency key and request ID;
- occurred/available time;
- fan-out status such as `pending`, `materialized`, `completed`, `blocked`, `cancelled`;
- retention/integrity version.

The domain transaction creates it. Ordinary application code cannot update payload/ownership after commit.

### 4. `integration_deliveries`

- `id`, `organization_id`, `outbox_event_id`, `integration_id`;
- provider/purpose and stable idempotency key;
- state in `pending`, `leased`, `processing`, `succeeded`, `retry_wait`, `reconciling`, `unknown`, `failed`, `dead_letter`, `blocked`, `cancelled`;
- attempt count, next attempt time;
- lease owner/token/acquired/expires fields;
- credential/configuration version fixed for the attempt or delivery policy;
- safe response/error class;
- stable external ID/receipt reference;
- original/retry/reconciliation linkage;
- timestamps and version.

Unique `(organization_id, integration_id, outbox_event_id, purpose)` and provider idempotency constraints prevent duplicate fan-out.

### 5. `integration_delivery_attempts`

Append-only rows containing organization, delivery, attempt number/type (`deliver`, `reconcile`, `health_test`, `manual_retry`), lease/worker, credential/config versions, start/finish, safe request fingerprint, safe response status/class, outcome, external ID, next-action decision, request/actor, and timing. Raw bodies, URLs with secrets, authorization, content, and credentials are excluded.

### 6. `integration_external_resources`

Maps organization/domain/asset/revision/delivery to stable provider resource:

- provider/integration/configuration version;
- resource type and opaque stable provider ID;
- parent resource ID reference;
- safe display/masked metadata;
- state in `active`, `missing`, `orphaned`, `deleting`, `deleted`, `unknown`;
- idempotency marker, created/verified/deleted times;
- exported asset/domain reference and deletion receipt linkage.

Provider URLs are generated on demand or safe-projected; they are not ownership.

### 7. `integration_health_checks`

Organization/integration, check kind, configuration/credential version, state, safe error class, latency, actor/request, checked/expiry time. No business payload or secret is stored.

## Secret lifecycle

### Creation and use

- `integrations.manage` is required for organization configuration; platform credential provisioning uses a separate platform authority.
- Validate credential type/provider/purpose before storage.
- Write secret first, then transactionally activate reference/configuration without exposing plaintext.
- Provider adapter retrieves only the exact active version for the leased delivery.
- Decrypted material is short-lived in memory, never cached globally, and zeroed/released where practical.

### Rotation

- Create a new version; do not overwrite old secret material.
- Validate via side-effect-free health test.
- Atomically mark new version active for new claims.
- In-flight lease uses its recorded version or is safely requeued before call.
- Keep old version only for a bounded rollback/grace policy, then revoke/delete with receipt.
- Rotation creates audit/alerts and never logs both fingerprints as secrets.

### Revocation/disconnect

- Disable new claims before revoking credentials.
- Cancel/block eligible pending deliveries according to domain/lifecycle policy.
- Reconcile processing/unknown deliveries.
- Revoke provider credential/sharing and secret material where supported.
- Preserve safe historical receipts and resource deletion obligations.
- Disconnect does not delete canonical contract/property/asset data.

## Integration configuration and authorization

Only owner with `integrations.manage` may connect, rotate, disconnect, or change credential-bearing/high-risk destinations under SPEC-26's initial matrix. Admin with `integrations.read` may view masked safe health/configuration where allowed, but cannot retrieve secrets.

Every mutation requires:

- active membership/organization and capability;
- recent step-up authentication where MT-SPEC-03 policy requires;
- optimistic version;
- distributed rate limit;
- reason/confirmation for destructive change;
- validation/health test where applicable; and
- immutable audit.

Platform support remains denied by default and requires POL-10's separate time-bound support session/reason/audit.

## First-release credential and resource model

POL-05 baseline:

- platform-managed Google credential(s), scoped as narrowly as provider capability permits;
- a distinct private Drive subtree/folder boundary per organization;
- a separate spreadsheet per organization and purpose by default;
- a distinct Make scenario/webhook endpoint and signing secret per organization/purpose; and
- no customer credential fallback or shared destination selected by environment order.

Multiple organizations may use one platform service account only if each destination is explicitly separated/shared, adapter authorization checks organization mapping, and staging/adversarial evidence proves no cross-resource operation. A future organization-owned OAuth mode uses the same integration/secret/delivery interfaces.

## Google Drive contract

- Adapter receives resolved organization integration plus event/asset context; it never reads a global parent folder as routing authority.
- Create under the exact configured organization parent.
- Store provider folder/file IDs and parent mapping.
- Never add `anyone`/public/link permissions.
- Explicit sharing targets only approved organization group/account with minimum role.
- Verify created resource parent/ownership/Drive before recording success.
- Use provider metadata/application properties containing non-sensitive event/delivery/idempotency markers where supported.
- On timeout/unknown, search by stable marker inside exact configured parent/Drive; do not create until reconciled.
- File export consumes SPEC-31 asset stream/service and records an exported-copy resource/receipt.
- Names are presentation only and contain no secret/token.
- Delete/unshare follows retention/legal hold/domain deletion and produces a receipt.

Canonical file remains in private Storage unless an approved domain explicitly defines Drive as a required projection.

## Google Sheets contract

- Separate spreadsheet per organization/purpose is default.
- Adapter receives exact spreadsheet ID, tab/range/schema, and credential context from integration configuration.
- Validate spreadsheet identity/access and complete expected header/schema before business delivery.
- Use `RAW` and formula-neutralized projection values where defined by existing contract behavior.
- Every projected row contains stable `event_id`, `delivery_id`, `idempotency_key`, organization-safe resource ID, revision/version, and schema version in reserved columns or an equivalently enforceable mapping.
- Persist updated range/row marker/spreadsheet/tab receipt.
- On ambiguous append, query exact organization spreadsheet/tab for stable idempotency marker before retry.
- Never reconcile by address, timestamp window, or full customer values.
- Multiple matching markers are a data-integrity incident/dead letter, not another append.
- Property revisions follow SPEC-30's approved POL-06 append/current-view contract.
- Contract mapping/header ordering from prior SPECs remains deterministic.

## Make and outbound webhook contract

### Payload

Each event is versioned and allowlisted. Minimum envelope:

```json
{
  "event_id": "00000000-0000-0000-0000-000000000000",
  "event_type": "property.revised",
  "schema_version": "1",
  "organization_reference": "opaque-safe-reference",
  "resource_id": "00000000-0000-0000-0000-000000000000",
  "resource_version": 2,
  "occurred_at": "2026-08-18T12:00:00.000Z",
  "idempotency_key": "opaque-delivery-key",
  "data": {}
}
```

`data` is event-specific, schema-validated, size-bounded, and minimized. It excludes raw token/hash, credentials, authorization, private paths, signed URLs, unrestricted database rows, internal notes, and unnecessary PII.

### Signing and replay resistance

- Use an organization/integration-specific secret and versioned HMAC algorithm where receiver supports it.
- Sign exact raw body plus timestamp and event/delivery identity.
- Send key/version identifier, timestamp, event ID, and signature through documented headers.
- Receiver tolerance window and event-ID deduplication are documented/tested.
- Rotate with bounded dual-verification period when required.
- Never put signature secret in URL/query/payload/log.

### Delivery outcome

- Bound connect/total timeout, redirect count, response bytes, and concurrency.
- Accept only documented success status/receipt format.
- Classify transient/permanent/auth/configuration/rate/ambiguous failures safely.
- If receiver honors idempotency key, retry same delivery safely.
- If it cannot prove idempotency or expose reconciliation, ambiguous delivery becomes `unknown`/dead letter for manual adjudication rather than blind replay.

## SSRF and destination validation

If authorized administrators can provide webhook URLs:

- require `https` and approved ports/provider patterns;
- reject credentials in URL, fragments, excessive length, control characters, and unsupported schemes;
- reject loopback, private, link-local, multicast, unspecified, metadata-service, and reserved IP ranges for IPv4/IPv6;
- resolve all DNS answers and reject if any prohibited;
- defend rebinding through an approved egress proxy or connect-time resolved-address validation with correct TLS SNI/host verification;
- revalidate every redirect target and limit redirects; never forward secrets/signature across an unapproved host transition;
- bound resolution/connect/total time and response bytes;
- block proxy environment bypass unless explicitly controlled; and
- revalidate periodically and before sensitive connection tests/delivery according to policy.

Validation failure returns safe configuration error without disclosing internal network details.

## Transactional outbox lifecycle

1. Contract/property/asset/governance transaction validates complete domain change.
2. Same transaction writes immutable outbox event, audit, usage, and domain event.
3. Fan-out materializer selects exact active integration(s) for event organization/type/purpose and creates unique deliveries.
4. Worker claims eligible delivery using atomic lease and fair organization scheduling.
5. Worker revalidates organization/integration/credential/configuration state and suspension.
6. It records attempt start, constructs fixed versioned projection, then calls provider outside database locks.
7. Conclusive success stores stable receipt/resource and marks delivery succeeded.
8. Conclusive transient failure schedules bounded retry.
9. Ambiguous outcome enters reconciliation, not blind retry.
10. Permanent/configuration/exhausted failure enters failed/dead-letter/blocked with authorized visibility.
11. Outbox completes only when required deliveries are terminal according to domain policy.

## Worker, lease, fairness, and retry contract

The first implementation uses PostgreSQL outbox/delivery tables plus a scheduled/queue-invoked stateless worker compatible with Vercel/Supabase. It must not rely on a perpetual in-process loop or HTTP request completion. An alternative durable queue must satisfy identical contracts/tests.

- Atomic claim uses reviewed scoped function and `for update skip locked` or equivalent.
- Lease has random token, owner, acquisition, expiry, heartbeat/renewal policy, and attempt number.
- State update requires current lease token/version.
- Provider call is never made with an already-known invalid/expired lease unless reconciliation policy explicitly handles it.
- Expired processing becomes `unknown`/reconciling before another call.
- Concurrency bounded globally, per provider/configuration, and per organization.
- Fair rotation prevents one organization/retry storm from starvation.
- Backoff is capped exponential with jitter and respects provider `Retry-After` safely.
- Attempts/dead-letter thresholds are action/provider policy, not hard-coded ad hoc.
- Manual retry creates an audited retry decision/delivery attempt against the same outbox event/resource version.

## Reconciliation by provider

### Drive

Lookup exact configured parent/Drive for application property/idempotency marker and expected resource type. Verify parent/owner/organization mapping before adopting. Zero matches may retry; one valid match records success; multiple/mismatched matches dead-letter and alert.

### Sheets

Search exact configured spreadsheet/tab reserved idempotency column. Zero matches may append; one exact matching resource/revision records success; conflicting or multiple rows dead-letter and alert.

### Make/webhook

Use receiver receipt/status API or event-ID idempotency contract if configured. Without reliable reconciliation/deduplication, unknown outcome requires manual confirmation; it is not automatically resent.

Every reconciliation action/decision is append-only, audited, safe, and cannot change the fixed business revision.

## Integration health tests

Health tests:

- require `integrations.manage` and rate limits;
- validate credential without returning it;
- verify exact Drive parent access, Sheet identity/header, or webhook TLS/signature acknowledgement;
- use provider metadata/read-only calls or a designated sandbox marker that is immediately reconciled/cleaned;
- never create a real property/contract, append production business row, upload customer file, or send customer payload;
- persist safe state/latency/error class and expiry;
- do not automatically activate configuration until required test/approval passes; and
- avoid exposing account lists or unrelated provider resources.

## Organization lifecycle behavior

- Suspension blocks new business delivery claims immediately; owner read/export/reactivation follows POL-11.
- Pending deletion blocks normal delivery and initiates provider inventory/cleanup planning.
- Legal hold prevents destructive provider deletion where applicable but does not permit new business delivery.
- Disconnect disables new claims, reconciles in-flight/unknown work, and preserves deletion obligations.
- Organization deletion requires provider secret revocation, resource sharing removal, external-copy deletion/retention receipts, and no replayable queued work before final completion.
- Reactivation never silently re-enables revoked/disconnected integration; explicit health/approval is required.

## API contracts

```text
GET    /api/organizations/:organization_id/integrations
POST   /api/organizations/:organization_id/integrations
GET    /api/organizations/:organization_id/integrations/:integration_id
PATCH  /api/organizations/:organization_id/integrations/:integration_id
POST   /api/organizations/:organization_id/integrations/:integration_id/test
POST   /api/organizations/:organization_id/integrations/:integration_id/enable
POST   /api/organizations/:organization_id/integrations/:integration_id/disable
POST   /api/organizations/:organization_id/integrations/:integration_id/rotate
DELETE /api/organizations/:organization_id/integrations/:integration_id

GET    /api/organizations/:organization_id/integration-deliveries
GET    /api/organizations/:organization_id/integration-deliveries/:delivery_id
POST   /api/organizations/:organization_id/integration-deliveries/:delivery_id/retry
POST   /api/organizations/:organization_id/integration-deliveries/:delivery_id/reconcile
```

Responses expose provider/purpose/state, masked destination, safe health, configuration version, timestamps, delivery status/attempt summaries, safe error codes, and permitted actions. They never expose secret references usable outside the server, plaintext/ciphertext, full webhook URL with secret material, credential JSON, tokens, raw provider bodies, private paths, or customer payload.

### Errors

- `400 INVALID_INTEGRATION_CONFIGURATION`, `UNSAFE_DESTINATION`, `INVALID_CURSOR`.
- `401` missing identity.
- `403` missing capability/step-up/support scope.
- generic `404` for missing/cross-organization integration/delivery/resource.
- `409 VERSION_CONFLICT`, `DELIVERY_STATE_CONFLICT`, `IDEMPOTENCY_CONFLICT`.
- `423 ORGANIZATION_SUSPENDED`, `INTEGRATION_DISABLED`, `DELIVERY_BLOCKED`.
- `429` rate/quota with safe `Retry-After`.
- `502 PROVIDER_REJECTED` only where a synchronous test contract requires it.
- `503 SECRET_STORE_UNAVAILABLE`, `PROVIDER_UNAVAILABLE`, `WORKER_UNAVAILABLE`, `RECONCILIATION_REQUIRED`.

## Frontend requirements

### Integration settings

- Route under `/t/:organization_slug/settings/integrations` after trusted context.
- List provider/purpose, enabled/health state, masked destination, last check, safe problem/remediation, and permitted actions.
- Credential input is write-only; never prefill/reveal stored secret.
- Step-up/confirmation for connect, rotate, disconnect, destination change.
- Clear test pending/success/failure states with accessible live regions.
- Unknown/dead-letter/provider-health states use text, not color alone.

### Delivery visibility

- Contract/property administration shows queued, processing, succeeded, retry-wait, unknown/reconciling, failed, blocked, and dead-letter projections.
- Authorized retry/reconcile action targets delivery only and explains that it will not recreate the business revision.
- Show request/event/delivery safe identifiers for support without customer payload.
- Pagination/filter by provider, purpose, state, resource, and time under organization scope.

### Isolation

- Query/mutation keys include immutable organization ID.
- Switch/logout cancels requests and removes/partitions integration/delivery/health caches and unsaved secret fields.
- Secret form values never enter local storage, query cache, analytics, crash reports, URL, DOM after submission, or persisted drafts.
- Direct navigation waits for validated organization/capability.

## Audit, usage, observability, and privacy

- Audit create/change/test/enable/disable/rotate/disconnect, secret version activation/revocation, delivery/retry/reconcile/dead-letter, sharing changes, and support access.
- General audit records provider/purpose/version/safe IDs/changed field names/outcome, never secrets/full destinations/customer payload/raw bodies.
- Usage counts provider deliveries/attempts and exported bytes idempotently without double counting retries as business actions.
- Metrics/alerts cover queue depth/oldest age, lease expiry, retries, dead letters, unknown outcomes, auth/config errors, provider latency/health, secret rotation age, public ACL detection, cross-organization denials, and noisy-neighbor pressure.
- Organization/customer values are not uncontrolled metric labels.
- Logs use organization/request/event/delivery correlation and safe provider error class.
- Provider response bodies are bounded then discarded/redacted unless a separately approved restricted diagnostic record is necessary.

## Backup, restore, and incident behavior

- Backups include configuration metadata, outbox/delivery/attempt/resource mappings, secret references/versions, and encrypted secret records where approved—not plaintext external keys.
- Secret-manager backup/recovery is documented/tested separately.
- Restored integrations start disabled or validation-pending according to recovery policy.
- Restored deliveries/workers remain paused.
- Reapply deleted organization/resource tombstones, credential revocations, integration disable state, and legal holds.
- Reconcile succeeded/processing/unknown/retryable deliveries against external stable IDs before claims resume.
- Runbooks cover credential compromise, cross-organization routing, public Drive ACL, webhook SSRF, fixed-trigger leakage, provider outage, duplicate Sheet/Drive/Make effect, failed rotation, queue backlog, and restore replay risk.

## Expected behavior

### Main property case

1. Azar property revision commits with versioned outbox event.
2. Fan-out resolves Azar Drive, Sheet, and Make integrations only.
3. Deliveries capture fixed config/credential versions and idempotency keys.
4. Fair worker leases each delivery and revalidates Azar state.
5. Private Drive export, versioned Sheet row, and signed Make event execute independently.
6. Stable receipts/resources persist and property run shows durable outcomes.
7. Failure/retry does not recreate property revision or successful provider effects.
8. Solar resources/credentials are never queried or used.

### Main contract case

1. Authorized contract state/revision creates allowlisted event/outbox.
2. Contract Sheet adapter resolves exact organization Sheet/configuration.
3. Header/schema validates and row includes stable idempotency marker.
4. Any Make generation event uses versioned minimal payload, replacing whole-row fixed trigger.
5. External link holders cannot configure/retry/list organization integrations.

### Edge cases

- Google commits but response times out: delivery enters reconciliation; exact marker finds resource; no duplicate.
- Lease expires during call: next worker reconciles before call.
- Secret rotates with pending work: each attempt uses recorded/approved version; no mixed hidden fallback.
- Integration disabled while leased: pre-call revalidation blocks; post-call unknown reconciles.
- Organization suspended with queued work: claims block without deleting intent.
- Sheet contains duplicate idempotency markers: dead-letter/security alert, no append.
- Make has no dedupe/status interface and outcome is unknown: manual adjudication, no blind retry.
- DNS resolves public during save and private during delivery: connect-time/egress defense blocks.
- Redirect points to metadata service: rejected before secret/signature forwarding.
- Restore predates provider success receipt: workers remain paused until reconciliation.
- Same service account can access Azar/Solar parents: adapter still enforces exact integration/resource mapping and tests direct-ID attacks.

### Required failures

- Provider call without organization/integration context.
- Global environment fallback for organization routing.
- Cross-organization integration/delivery/resource reference.
- Browser retrieval of secrets/decrypted material.
- Plaintext secret in database/general backup/log/audit/error.
- Public/link Drive permission.
- Shared Sheet without approved equivalent isolation.
- Provider call inside business transaction.
- Duplicate delivery claim/call without lease/version.
- Blind retry after ambiguous outcome.
- Retry that recreates business revision.
- Whole-row/fixed-URL Make trigger.
- Unsafe URL/redirect/DNS destination.
- Health test with customer payload/business side effect.
- Restore resuming workers before reconciliation.

## Affected contracts and files

### Database

- Forward migrations for `organization_integrations`, secret metadata/references, `outbox_events`, `integration_deliveries`, `integration_delivery_attempts`, `integration_external_resources`, and `integration_health_checks`.
- Composite constraints, organization-leading indexes, RLS/grants, scoped claim/lease/state functions, retention/deletion receipts.
- Remove/disable fixed Make HTTP trigger only in approved cutover migration after durable replacement is live.

### Backend

- Integration repository/service/secret broker/provider registry/config validation/health services.
- Outbox materializer, delivery repository, stateless worker, lease, retry, reconciliation, dead-letter, and manual-operation services.
- Refactor Google/Make adapters to require resolved integration context.
- Domain projection builders consume fixed contract/property revisions and asset IDs.
- SSRF-safe outbound HTTP client and signature service.

Expected areas include:

- `backend/src/utils/googleAuth.ts`
- `backend/src/services/googleDriveService.ts`
- `backend/src/services/googleSheetsService.ts`
- `backend/src/services/contractGoogleSheetsService.ts`
- `backend/src/services/makeWebhookService.ts`
- `backend/src/utils/retryPolicy.ts`
- new integration/outbox/worker modules
- `backend/src/routes/`
- `backend/tests/`
- `supabase/migrations/`

### Frontend

- Add integration settings/health/rotation/disconnect UI.
- Consume delivery state in contract/property management without secrets/raw errors.
- Organization-safe query/cache/form lifecycle.

### Configuration and documentation

- Replace global customer-routing variables with bootstrap/secret-manager/platform credential references where still required.
- Update environment, external services, API, architecture, engineering, testing, operations, security/privacy, retention, observability, backup/restore, incident, and migration docs.
- Add provider setup, rotation, reconciliation, dead-letter, ACL, SSRF, outage, deletion, and restore runbooks.

## Implementation sequence

### Phase 1 — approve provider and secret architecture

- Approve purpose/provider registry, credential model/store/encryption, destination separation, webhook signature/SSRF, states, idempotency markers, retention, and worker deployment.
- Inventory current environment credentials/destinations, Drive/Sheets/Make resources, ACLs, triggers, and retry behavior.

### Phase 2 — additive persistence and harness

- Add tables/constraints/RLS/grants/claim functions and Azar/Solar provider fixtures.
- Add fake providers/receivers and no-real-provider automated tests.

### Phase 3 — services and workers

- Implement secret broker, configuration/health, outbox fan-out, leased stateless worker, adapters, reconciliation, dead letters, audit/metrics.
- Keep production delivery contained/disabled until domain integrations pass.

### Phase 4 — domain/frontend adoption

- MT-SPEC-05, SPEC-30, and SPEC-31 create/consume versioned events/resources.
- Add integration/delivery UI and durable contract/property status.
- Stop direct provider calls after equivalence/idempotency tests.

### Phase 5 — staging isolation certification

- Use distinct Azar/Solar folders, Sheets, webhook receivers, signing secrets, failures, rotations, and credentials.
- Test direct-ID attacks, ambiguous commits, leases, fairness, suspension, disconnect, restore, and ACL scans.

### Phase 6 — MT-SPEC-10 handoff

- Produce resource/credential/ACL/trigger/event inventory and cutover plan.
- Keep Solar blocked until production migration/certification.

## Migration, compatibility, and rollback

### Migration

- Register current Azar destinations/credentials as reviewed Azar integration records; never infer Solar/global ownership.
- Store only new secret references/encrypted material through approved migration channel; do not copy secrets into SQL/log evidence.
- Inventory and register stable external IDs/ACLs and ambiguous duplicates/orphans.
- Shadow/dual-delivery is prohibited unless destination is non-production sandbox and deduplication/evidence is approved.
- Backfill outbox only for explicitly selected undelivered business events; do not replay historical rows broadly.
- Disable/remove direct request delivery and fixed trigger only after durable delivery parity/reconciliation passes.
- Revoke public ACLs and legacy credentials/configuration during MT-SPEC-10 cutover.

### Compatibility

- Global variables may bootstrap the contained Azar migration only behind explicit one-organization compatibility and cannot resolve Solar.
- Existing synchronous API responses may expose durable queued/run state through adapters, not wait for provider completion as authority.
- Historical local logs/provider URLs remain evidence only.
- Existing contract Sheet header/mapping rules remain preserved under organization configuration.

### Rollback

- Migrations are forward-only.
- Provider outage rolls back by pausing workers/delivery, not returning to direct calls/global routing/public ACLs.
- Preserve outbox/delivery/attempt/resource evidence through application rollback.
- Never retry unknown work merely because code rolled back.
- Restore/recovery follows SPEC-28 reconciliation before traffic/workers.

## Required tests

### Unit/contract tests

- Provider/purpose/configuration schemas and safe projections.
- Secret envelope/AAD/version/rotation/revocation interfaces using fake secret store.
- No secret serialization/redaction canaries.
- Event/payload allowlists, schema versions, size bounds, signatures, replay window.
- SSRF URL/IP/DNS/redirect/IPv6/metadata/timeout/size controls.
- Delivery/lease/state/backoff/dead-letter/manual retry decisions.
- Provider-specific idempotency/reconciliation outcomes.

### Real-database/concurrency tests

- Clean/upgrade migrations, constraints, RLS/grants, scoped functions.
- Azar/Solar cross-reference attacks across every table/function.
- Atomic domain/outbox/audit/usage commit/rollback.
- Unique fan-out/idempotency.
- Concurrent claims, lease token/version, expiry/heartbeat, fair scheduling.
- Append-only attempts/events and organization-leading plans.
- Service-role explicit scoping.

### Adapter/integration tests

- Distinct fake/staging Azar/Solar credentials/destinations.
- Drive exact parent/private ACL/stable marker/create/upload/reconcile/delete.
- Sheet exact spreadsheet/tab/header/RAW/formula safety/idempotency marker/reconcile.
- Make allowlisted payload/signature/rotation/dedupe/safe error classification.
- Timeout before/after provider commit, zero/one/multiple reconciliation matches.
- No real APIs in automated tests; optional controlled staging suite only.

### API/frontend tests

- Capability/step-up/version/rate/audit for integration lifecycle.
- Masked read/write-only secrets and no cache/local-storage leakage.
- Delivery lists/detail/retry/reconcile generic cross-organization `404`.
- All integration/delivery states and accessible feedback.
- Organization ID in every query/mutation key; switch/logout cleanup.

### Operations/recovery tests

- Queue/worker crash, lease expiry, backlog/fairness, dead letters, alerts.
- Credential compromise/rotation/disconnect and public ACL remediation.
- Restore pauses and reconciles success/unknown/pending work before resume.
- Logical Azar export contains no Solar integration/secret/resource/delivery data and vice versa.
- Fixed trigger/direct-call/public-ACL/global-fallback absence checks.

## Acceptance criteria

This SPEC is complete only when:

1. Required policy and MT-SPEC-02 through MT-SPEC-07 contracts are approved.
2. All thirty-four integration invariants are approved and traceable.
3. Integration/outbox/delivery/attempt/resource/health tables have non-null organization scope and composite constraints.
4. Every provider operation resolves exact owning organization/integration without client/global fallback.
5. Managed secret storage or approved envelope encryption is implemented with external key material and organization-bound AAD.
6. Plaintext/decrypted secrets never appear in application tables, browser, logs, audits, errors, tests, or general backups.
7. Connect/test/enable/disable/rotate/disconnect enforce capability, version, rate, confirmation/step-up, and audit.
8. First-release platform credentials use distinct private destinations per organization.
9. Google Drive resources are private with no `anyone` permissions and exact parent/resource mapping.
10. Sheets are organization-separated by default and every row has stable event/delivery/idempotency/resource/version markers.
11. Contract/property mapping/header/formula behavior remains correct.
12. Outbox events commit atomically with domain/audit/usage changes and are immutable/versioned/minimized.
13. Unique integration deliveries fan out deterministically and cannot cross organizations.
14. Stateless durable workers claim with atomic leases and cannot concurrently deliver one valid lease.
15. Worker concurrency/fairness prevents one organization/provider from starving another.
16. Retry/backoff/dead-letter/manual retry operate on fixed delivery/event, never business revisions.
17. Ambiguous Drive/Sheet/Make outcomes reconcile before any resend/recreate.
18. Confirmed success cannot be duplicated by automatic/manual retry.
19. Stable external IDs/resources/receipts are persisted and names/time/URLs are not authority.
20. Make/webhook payloads are allowlisted, versioned, bounded, minimized, and exclude secrets/tokens/private paths/unnecessary PII.
21. Organization-specific webhook signing/replay controls and secret rotation pass.
22. Administrator URLs pass HTTPS/port/redirect/DNS/rebinding/private-network/timeout/response-size protections.
23. Health tests are bounded, safe, and free of real business/customer side effects.
24. Integration/delivery UI exposes only masked safe state and authorized actions.
25. Organization suspension/disconnect/revocation blocks new claims and handles in-flight/unknown work safely.
26. Organization deletion tracks credential/share/resource/exported-copy cleanup receipts.
27. Structured redacted logs, metrics, alerts, audit, usage, and rate controls pass SPEC-28.
28. Restore keeps integrations/workers paused and reconciles tombstones/revocations/success/unknown work before resume.
29. Fixed database Make HTTP trigger is removed/disabled through approved migration after replacement.
30. Direct request provider delivery and global customer routing are retired after cutover.
31. Public Drive ACLs are inventoried/remediated before Solar.
32. Staging tests use distinct Azar/Solar folders, Sheets, receivers, secrets, credentials, failures, and rotations.
33. Every Azar/Solar direct-ID/config/resource/worker attack returns safe failure with no provider call.
34. No automated test calls production providers or stores real credentials/customer payloads.
35. Query/mutation caches and secret form state are organization-isolated and cleared on switch/logout.
36. Canonical environment, external-services, API, architecture, engineering, testing, privacy/retention, operations, observability, backup/restore, incident, and migration docs are updated.
37. Provider/credential/resource/ACL/trigger/outstanding-delivery inventory and MT-SPEC-10 handoff are complete.
38. A traceability matrix links each criterion to migration, code, tests, docs, evidence, and reviewer.
39. Production remains contained Azar-only; this SPEC creates no real Solar integration/resource.
40. Product, security, data, backend, frontend, operations, integration, and privacy/legal owners approve completion.

## Completion gate and handoff

Passing SPEC-32 means every provider call resolves the owning organization, resources are externally separated/private, secrets are controlled, and delivery is durable/idempotent/reconcilable. It does not authorize production migration or Solar.

MT-SPEC-10 may cut over when:

- current credentials/destinations/resources/ACLs/trigger/deliveries are inventoried;
- Azar configuration/resources are registered and health-checked;
- direct calls/fixed trigger can be disabled without lost events;
- pending/unknown historical work is reconciled;
- public Drive ACLs and global credentials are remediated/rotated;
- full restore and logical export tests pass; and
- Azar/Solar staging certification and rollback/incident runbooks pass.

## Required deliverables

- Approved SPEC-32 / MT-SPEC-08.
- Integration/outbox/delivery/attempt/resource/health migrations and security evidence.
- Secret broker/store/encryption/rotation/revocation implementation and runbook.
- Provider/purpose/configuration/payload schema registries.
- Organization-resolved Drive, Sheets, and Make adapters.
- Transactional outbox/fan-out/stateless leased worker/retry/reconciliation/dead-letter system.
- SSRF-safe outbound HTTP/signature services.
- Integration settings and delivery-state frontend.
- Dashboards, alerts, provider/secret/ACL/reconciliation/restore runbooks.
- Unit, database, concurrency, adapter, API, frontend, accessibility, staging, and recovery tests.
- Production inventory and MT-SPEC-10 cutover handoff.
- Canonical documentation and acceptance traceability.

## Verification

```bash
cd backend
npm test
npm run typecheck
npm run build

cd ../frontend
npm test
npm run lint
npm run build

cd ..
git diff --check
```

Focused checks classify all historical/compatibility matches:

```bash
rg -n "GOOGLE_|MAKE_WEBHOOK_URL|CONTRACT_GOOGLE_|process\.env" backend/src
rg -n "type: 'anyone'|permissions\.create|webViewLink" backend/src
rg -n "net\.http_post|enviar_a_make|trigger_make" supabase/migrations
rg -n "outbox_events|integration_deliveries|organization_integrations|integration_external_resources" backend/src frontend/src supabase/migrations
rg -n "Authorization|credential|refresh_token|service_account|webhook.*secret|private_key" backend/src frontend/src
rg -n "fetch\(|withRetry|append|createDriveFolder|sendToMakeWebhook" backend/src
```

No root `package.json` or `docs:check` script currently exists. Until added, documentation verification uses required-section/reference review, Markdown checks, `git diff --check`, and backend/frontend commands above.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Azar data routed to Solar provider | Immutable organization integration resolution, composite constraints, distinct staging resources, direct-ID tests |
| Database contains usable secret | Managed store or envelope encryption with external key and AAD; write-only UI |
| Service account can access multiple tenants | Exact configured parent/Sheet mapping and adapter assertions; least privilege; adversarial tests |
| Drive link bypasses application | No `anyone`; explicit sharing; canonical private Storage and exported-copy tracking |
| Sheet append duplicates after timeout | Stable idempotency column and exact reconciliation before append |
| Webhook retry duplicates event | Receiver event-ID dedupe/idempotency; unknown becomes manual if unsupported |
| Worker lease expires mid-call | Expiry becomes unknown/reconciling, never immediate resend |
| Noisy organization starves queue | Global/provider/organization concurrency and fair scheduling |
| Custom webhook reaches internal network | HTTPS/port/IP/DNS/rebinding/redirect/egress/time/size controls |
| Rotation breaks in-flight deliveries | Versioned secrets/config recorded per attempt and bounded activation/rollback |
| Health test causes real side effect | Read-only/designated sandbox validation and strict payload prohibition |
| Restore replays external work | Workers paused; stable-ID reconciliation and tombstones/revocations first |
| Legacy fixed trigger leaks broad data | Inventory/disable/remove after allowlisted outbox replacement; incident review |
| Global fallback survives for Solar | Explicit Azar-only compatibility and certification checks before second organization |

## References

### Multi-tenant source documents

- `docs/09-roadmap/specs/research/23-RESEARCH-multi-tenant-saas-architecture.md`
- `docs/09-roadmap/specs/research/24-RESEARCH-multi-tenant-saas-specification-roadmap.md`
- `docs/09-roadmap/specs/pending/25-SPEC-multi-tenant-policy-threat-model-containment-and-inventory.md`
- `docs/09-roadmap/specs/pending/26-SPEC-multi-tenant-organizations-memberships-onboarding-and-lifecycle.md`
- `docs/09-roadmap/specs/pending/28-SPEC-multi-tenant-database-enforcement-audit-abuse-observability-and-recovery.md`
- `docs/09-roadmap/specs/pending/30-SPEC-multi-tenant-properties-submissions-modifications-and-management.md`
- `docs/09-roadmap/specs/pending/31-SPEC-multi-tenant-private-assets-uploads-retention-and-storage-migration.md`

### Previous project SPECs used for behavior and format

- `docs/09-roadmap/specs/completed/09-SPEC-contract-generation.md`
- `docs/09-roadmap/specs/completed/10-SPEC-contract-generation-reworked.md`
- `docs/09-roadmap/specs/completed/13-SPEC-contract-generation-reworked.md`
- `docs/09-roadmap/specs/completed/14-SPEC-contract-generation-reworked.md`
- `docs/09-roadmap/specs/completed/17-SPEC-contract-generation-reworked.md`
- `docs/09-roadmap/specs/completed/19-SPEC-contract-generation-reworked.md`

### Repository guidance and canonical documentation

- `references/llm-guide.md`
- `references/documentation-structure-guide.md`
- `docs/prd.md`
- `docs/01-overview/project-overview.md`
- `docs/01-overview/architecture.md`
- `docs/02-setup/environment.md`
- `docs/02-setup/external-services.md`
- `docs/03-operation/runtime-files.md`
- `docs/05-integrations/api-contracts.md`
- `docs/06-testing/testing-strategy.md`
- `docs/07-development/engineering-standards.md`

---

Status: pending prerequisite specifications plus product, security, data, backend, frontend, operations, integration, and privacy/legal approval. Author: redacted.
