# SPEC-30 / MT-SPEC-06 Multi-tenant SaaS — organization-safe properties, submissions, modifications, processing, and management

**Date:** 2026-08-18
**Priority:** critical
**Status:** pending prerequisite specifications and approval
**Roadmap identifier:** MT-SPEC-06
**Dependencies:** SPEC-25 / MT-SPEC-01, SPEC-26 / MT-SPEC-02, SPEC-27 / MT-SPEC-03, SPEC-28 / MT-SPEC-04, SPEC-29 / MT-SPEC-05, and the SPEC-31/32 interfaces
**Blocks:** production property migration in MT-SPEC-10 and onboarding any second real organization

---

## Specification identity

**Name:** Authenticated property creation, canonical persistence, immutable revisions, durable processing, editing, and management.

**Description:** Replace the single-use property submission flow with an organization-owned property domain that supports safe creation, listing, inspection, modification, retry, and history.

**Why it is necessary:** Property routes currently trust browser-controlled agent identity, have no canonical database records, depend on local/console logs and global providers, and cannot support tenant-scoped submissions or modifications.

## Summary

This specification turns the current property form into a durable organization-owned workflow. It preserves the complete property schema, media workflow, Google Drive projection, Google Sheets projection, Make delivery, validation, folder naming, and visible processing results while replacing their unsafe authority model.

It defines:

- authenticated and capability-checked property routes;
- server-derived organization and actor attribution;
- durable property drafts created before media preflight;
- canonical `properties` records and immutable `property_revisions`;
- durable submission runs, step outcomes, events, audit, usage, and outbox intents;
- idempotent creation, editing, archiving, retry, and provider processing;
- organization-scoped lists, details, search, filters, revision history, and status views;
- optimistic concurrency for drafts and published property modifications;
- an explicit Sheet/Make projection rule for revisions;
- durable result pages that survive refresh and navigation;
- tenant-safe React Query and browser draft keys; and
- adversarial Azar/Solar, real-database, API, provider-adapter, frontend, and accessibility tests.

PostgreSQL becomes the source of truth. Drive, Sheets, Make, local files, console logs, and frontend navigation state are projections or operational evidence, never the canonical property record.

This document specifies behavior and implementation contracts. Its additive
repository migration and typed contracts are implemented, but they do not
migrate existing production submissions, mount the new routes, configure real
organization provider credentials, or enable Solar.

## Authority and relationship to other specifications

This is the sixth formal implementation SPEC derived from:

- `docs/09-roadmap/specs/research/23-RESEARCH-multi-tenant-saas-architecture.md`;
- `docs/09-roadmap/specs/research/24-RESEARCH-multi-tenant-saas-specification-roadmap.md`;
- `docs/09-roadmap/specs/pending/25-SPEC-multi-tenant-policy-threat-model-containment-and-inventory.md`;
- `docs/09-roadmap/specs/pending/26-SPEC-multi-tenant-organizations-memberships-onboarding-and-lifecycle.md`; and
- `docs/09-roadmap/specs/pending/28-SPEC-multi-tenant-database-enforcement-audit-abuse-observability-and-recovery.md`.

SPEC-27 / MT-SPEC-03 and SPEC-29 / MT-SPEC-05 are now present as staged
project documents and repository foundations. SPEC-29 is not a functional
dependency for the property aggregate, but its shared navigation and tenant
state conventions remain compatible. SPEC-27 is a hard release dependency
because it supplies trusted organization request context and frontend
organization switching.

SPEC-31 / MT-SPEC-07 and SPEC-32 / MT-SPEC-08 are co-designed with this SPEC, but their interfaces must be approved before property media or provider deliveries can be completed:

- MT-SPEC-07 owns durable asset/upload sessions, verification, private views, retention, and cleanup.
- MT-SPEC-08 owns organization integration configuration, credentials, outbox workers, provider delivery, retry reconciliation, and external deletion.

The original property PRD remains the source for form fields and intended business workflow. Where its create-only, synchronous, global, caller-attributed, public-Drive, or local-log assumptions conflict with approved multi-tenant security, this SPEC supersedes those implementation assumptions while preserving the user-visible property functionality.

## Previous project behavior that must be preserved

The implementation must retain, unless this SPEC explicitly replaces the mechanism:

- the complete field set represented by `scheme_reworked.json`, backend `PropertyData`, and frontend `propertySchema`;
- grouped general, location, distribution, features, details, and media form sections;
- server-side validation in addition to frontend validation;
- whitelisted image/video types, upload-size enforcement, ordering, and cover selection;
- deterministic folder naming compatible with the `OP-{localidad}-{tipo}-{calle}-{timestamp}` convention where provider projection uses a folder;
- Sheet and Make projections for every successfully finalized property revision according to the policy below;
- clear queued, processing, success, partial-failure, failure, and retry feedback;
- explicit Drive, Sheets, Make, upload, and audit/processing outcomes;
- retry behavior that preserves entered data; and
- compact, accessible internal administration UI conventions.

The following current mechanisms are explicitly replaced:

- unauthenticated `/properties/media/presign` and `/properties/submit` authorization;
- request-body `agent_user_id`, `agent_name`, and `agent_email` as identity or authority;
- `AgentContext`, `AgentModal`, and `form_site_agent` local storage as identity sources;
- process-local property upload-session maps;
- multipart request completion as the only durable property existence event;
- Drive/Sheets/Make results or `backend/logs/{submission_id}.json` as canonical state;
- console-serialized production submission logs;
- process-global provider destinations as an implicit organization selector;
- Drive `anyone`/`reader` permissions;
- ephemeral React Router success state as the only source for a result screen; and
- automatic provider retry without durable idempotency/reconciliation.

## Context

The current frontend lets the browser enter and persist agent identity. It copies that data into the property payload and media preflight. The backend validates that the same caller-controlled agent ID is used for an in-memory upload session, but it has no authenticated organization membership to validate.

The current backend then performs a long synchronous sequence: validate, generate identifiers, create a Drive folder, upload media, append a Sheet row, call Make, write a local/console submission log, and return a result. A process restart loses upload sessions. Provider timeouts can leave unknown side effects. Refreshing the success route can lose the detailed result because it came from navigation state. There is no database property list, revision history, edit transaction, archive state, or organization boundary.

This prevents safe collaboration by Azar and Solar and makes modification/retry semantics impossible to prove.

## Motivation

A property must remain owned by its agency after its creator leaves. A browser-supplied agent ID cannot establish that ownership. A Drive folder or Sheet row cannot serve as the only database record because provider availability, duplication, permissions, and eventual consistency are outside the application's transactional control.

Durable local state must be committed before provider work, and every retry must refer to the same property, revision, and delivery intent. This lets the UI truthfully show partial failure and recovery without duplicating properties, folders, rows, or webhooks.

## Objective

Implement one canonical property domain in which every draft, property, revision, submission run, event, asset association, audit record, usage event, job, and provider intent is owned by an authenticated organization; all modifications are immutable revisions; all sensitive actions are versioned and idempotent; and all processing state remains available after refresh, retry, worker restart, or provider failure.

## Terminology

- **Property:** The organization-owned aggregate representing one real-estate listing/property workflow.
- **Draft:** Durable, incomplete, versioned working state created before media upload or final validation.
- **Revision:** An immutable, fully validated snapshot of all property business fields and asset associations at one point in history.
- **Current revision:** The immutable revision referenced by `properties.current_revision_id` for normal reads.
- **Submission run:** One durable processing request for one fixed revision.
- **Run step:** Safe state/receipt for a required projection such as asset export, Drive folder, Sheets, or Make.
- **Projection:** A derived copy in Drive, Sheets, Make, search, or another external system. It is not canonical.
- **Modification:** Creation of a new validated immutable revision and atomic movement of the current revision pointer.
- **Correction:** A member-authorized revision that fixes data while preserving all earlier versions.
- **Idempotency key:** Client-generated opaque key scoped to organization/action/principal whose fingerprint prevents duplicate logical operations.
- **Property code:** Human-facing code unique within an organization; it is not authorization.
- **Actor snapshot:** Safe display name/email captured for historical display; durable actor ID/context remains authoritative.
- **Submit on behalf of:** An exceptional member action attributing workflow assignment to another same-organization member; it is not identity impersonation.

New visible/persisted contracts use `snake_case`; environment variables use `UPPER_SNAKE_CASE`. Internal TypeScript may use repository conventions.

## Scope

### Includes

- Authenticated organization context on every property operation.
- `properties.read`, `properties.write`, and `properties.manage` capability enforcement from SPEC-26.
- Organization-wide or approved `assigned_only` visibility.
- Durable partial drafts before media preflight.
- Canonical property, revision, processing-run, step, and event tables.
- Complete existing property payload validation and schema versioning.
- Server-derived creator/updater/assignee attribution.
- Optional submit-on-behalf-of only under a new named capability approved into the SPEC-26 registry.
- Asset references from MT-SPEC-07 rather than raw paths/URLs as authority.
- Transactional finalization and revision creation.
- Durable outbox/provider processing through MT-SPEC-08.
- Idempotency, optimistic concurrency, retry, archive, and history.
- Paginated list/search/filter/sort/detail APIs.
- Processing status and safe external receipt projections.
- Organization-scoped frontend routes, cache keys, draft keys, forms, management screens, and durable result pages.
- Audit, usage, rate limiting, observability, recovery, and adversarial tests from SPEC-28.

### Excludes

- Organization/session/membership implementation owned by SPEC-26 and MT-SPEC-03.
- Contract behavior owned by MT-SPEC-05.
- Asset-registry internals, upload signing, malware detection, retention, and physical cleanup owned by MT-SPEC-07.
- Credential storage, integration configuration, worker implementation, provider-specific reconciliation, and external deletion owned by MT-SPEC-08.
- Billing/payment enforcement owned by MT-SPEC-09.
- Production ownership backfill, legacy artifact adjudication, and Solar cutover owned by MT-SPEC-10.
- Public unauthenticated property creation.
- Permanent deletion through ordinary property APIs.
- Arbitrary organization-defined property schemas in the first release.
- Real-time collaborative draft editing.
- Treating Sheet/Drive/Make as a bidirectional canonical store.

## Dependency and policy gate

The following must be approved before completion:

- POL-03 organization-wide versus `assigned_only` visibility.
- POL-05 organization-specific provider ownership/routing through MT-SPEC-08.
- POL-06 property modification projection.
- POL-09 property/media/audit/provider-copy/backup retention.
- POL-11 suspension behavior for reads, writes, queued work, and retries.
- MT-SPEC-03 trusted `OrganizationRequestContext` and frontend organization switching.
- SPEC-28 scoped repositories/RPCs, audit, rate limits, usage, pagination, logging, and recovery standards.
- MT-SPEC-07 draft/property asset ownership interface.
- MT-SPEC-08 outbox, provider configuration, delivery, and reconciliation interface.

### POL-06 projection decision

The baseline required by this draft is:

- PostgreSQL immutable property revisions are canonical.
- Initial revision and every later published revision append a new versioned Sheet projection row containing stable `property_id`, `property_code`, `revision_id`, and `revision_number`.
- Existing Sheet rows are not rediscovered or overwritten by address or timestamp.
- Make receives a versioned `property.created` or `property.revised` event through the outbox.
- A correction never silently rewrites an external historical row.
- MT-SPEC-08 may optimize an explicitly materialized “current properties” Sheet view, but it must remain derived and reconciled by stable identifiers.

If product/integration owners select update-in-place or a hybrid projection instead, this SPEC and MT-SPEC-08 must be revised before edits are enabled. No unspecified external modification is allowed.

## Non-negotiable property invariants

1. Every durable property-domain row has one non-null `organization_id`.
2. Organization ownership comes only from trusted request/system context, never JSON, form data, local storage, slug, or agent fields.
3. A property belongs to the organization, not permanently to its creator or assignee.
4. Every repository/RPC action matches both organization and record.
5. Cross-organization UUID access returns generic `404` and produces no domain/provider side effect.
6. Every draft exists durably before any property media preflight is issued.
7. Drafts are incomplete working state; published revisions are complete and immutable.
8. Every published revision validates the entire resulting property payload, not only changed fields.
9. `properties.current_revision_id` references a revision belonging to the same property and organization.
10. Revision numbers are monotonic and unique per organization/property.
11. Updating a property creates a revision; it never mutates historical revision payloads.
12. Creator/updater identity and snapshots are derived from trusted context.
13. Caller-provided `agent_user_id`, `agent_name`, or `agent_email` never grants access or attribution.
14. Submit-on-behalf-of requires a named capability, explicit UI confirmation, same-organization active target, and audit.
15. Asset IDs must belong to the same organization and exact draft/property/revision purpose.
16. Raw storage paths, signed URLs, or browser-returned metadata are never asset authority.
17. Finalization atomically commits property/revision/event/audit/usage/run/outbox state before provider work.
18. No provider call occurs while a database transaction or row lock is open.
19. One idempotency key plus fingerprint represents one logical sensitive operation.
20. Same-key/same-fingerprint replay returns the existing safe state; different fingerprint returns `409`.
21. Provider retries never create a new property revision unless the property payload actually changes through an authorized edit.
22. Retrying one failed run/step cannot duplicate a confirmed folder, asset export, Sheet row, or Make event.
23. Stable provider identifiers and delivery receipts are persisted; address/time is never used to rediscover ownership.
24. A provider failure cannot erase or roll back an already committed canonical property/revision.
25. Local files, console logs, and frontend navigation state are not canonical property or processing records.
26. Organization suspension/membership removal is revalidated before mutation and worker delivery.
27. Lists/search/filter/pagination execute under organization scope in SQL.
28. Query keys, mutation keys, and browser draft keys include immutable organization ID.
29. Organization switch/logout cancels in-flight property requests and removes/partitions cached/draft data.
30. Archive is versioned/audited and blocks prohibited mutation/delivery; it does not delete history.
31. Unknown property, revision, run, step, actor, or asset state fails closed.
32. Existing property form fields and validation cannot be silently dropped during migration.
33. Sheet formula injection and provider payload allowlisting are enforced server-side.
34. Azar and Solar data, assets, runs, provider destinations, caches, and telemetry never cross.

## Authorization and visibility

| Operation | Required capability | Additional rules |
|---|---|---|
| List/detail/current revision | `properties.read` | Apply active organization and record-visibility policy |
| View revision/run history | `properties.read` | Same record visibility; safe provider projections only |
| Create/update own draft | `properties.write` | Active membership/organization; server actor |
| Finalize new property | `properties.write` | Complete validation, assets, quota, idempotency |
| Edit active property | `properties.write` | Visibility, expected version, complete-result validation |
| Retry own/visible failed run | `properties.write` | Approved run/step state and distributed limit |
| Assign/reassign or submit on behalf | `properties.manage` plus approved named capability where required | Same-organization active target; audit |
| Archive/reactivate | `properties.manage` | Version check, lifecycle policy, audit |
| View private assets | `files.read` | MT-SPEC-07 authorization; viewer denied by default |

Frontend visibility is usability only. Every backend service repeats the capability, organization-state, membership-state, visibility, record-state, and version checks.

### `assigned_only`

When organization settings select `assigned_only`:

- owner/admin with `properties.manage` may access all organization properties;
- member access is limited to records created by or assigned to that member according to the approved policy;
- viewer behavior follows the approved SPEC-26 policy and never exceeds `properties.read`;
- assignment is same-organization and auditable;
- creator/assignee filters remain SQL predicates inside organization scope; and
- the setting cannot be enabled until list/detail/history/edit/retry/archive/media/provider paths all pass policy tests.

## Data model

All IDs are UUIDs generated by server/database; timestamps are UTC `timestamptz`. Composite organization constraints, RLS, grants, indexes, actor fields, and versions follow SPEC-28.

### 1. `properties`

The mutable aggregate header:

- `id uuid primary key`;
- `organization_id uuid not null`;
- `property_code text not null`, human-facing and organization-unique;
- `status text not null` in `draft`, `active`, `archived`;
- `current_revision_id uuid null` while incomplete draft, non-null for active/archived property;
- `open_draft_id uuid null` when an edit draft exists;
- `created_by_user_id uuid not null`;
- `updated_by_user_id uuid not null`;
- `assigned_to_user_id uuid null` with same-organization membership validation;
- `created_at`, `updated_at`, `archived_at`;
- `version integer not null check (version > 0)`; and
- optional safe search projection columns approved for indexed list filters.

Required uniqueness includes `(id, organization_id)`, `(organization_id, property_code)`, and an organization/current-state list index. Property code is generated atomically; it is never accepted as ownership proof.

### 2. `property_drafts`

Durable incomplete working state:

- `id`, `organization_id`, `property_id`;
- `purpose` in `create`, `edit`;
- `base_revision_id` null for creation and fixed for edit;
- `partial_payload jsonb not null` using the canonical schema's visible field names;
- `schema_version text not null`;
- `status` in `open`, `finalizing`, `finalized`, `abandoned`, `expired`;
- `created_by_user_id`, `updated_by_user_id`, safe actor snapshots;
- `created_at`, `updated_at`, `expires_at`, `finalized_at`; and
- positive `version`.

Only one open edit draft per property/user policy is allowed as approved. Draft autosave uses expected version. Draft payload may be incomplete but must reject unknown fields, invalid types, unsafe sizes, and ownership/actor properties.

### 3. `property_revisions`

Immutable canonical history:

- `id`, `organization_id`, `property_id`;
- `revision_number integer not null check (revision_number > 0)`;
- `previous_revision_id uuid null`;
- `source_draft_id uuid null`;
- `schema_version text not null`;
- `payload jsonb not null`, fully normalized and validated;
- `change_kind` in `created`, `edited`, `corrected`, `restored`;
- `change_summary jsonb not null`, redacted field-name/summary projection;
- `created_by_actor_type`, `created_by_user_id`, optional machine/support reference;
- safe `actor_name_snapshot`, `actor_email_snapshot` only where approved;
- `request_id`, `created_at`; and
- optional payload checksum/integrity version.

Constraints enforce `(organization_id, property_id, revision_number)` uniqueness and all same-organization references. Ordinary application roles cannot update/delete revisions.

### 4. `property_revision_assets`

Association owned jointly with MT-SPEC-07:

- `organization_id`, `property_id`, `revision_id`, `asset_id`;
- semantic `role` such as `image` or `video`;
- stable `sort_order`;
- `is_cover boolean` with at most one cover image per revision;
- association timestamp/actor.

The table stores asset IDs, never signed URLs. Asset verification/finalization must prove same organization, draft/record ownership, MIME, byte count, upload completion, uniqueness, and allowed role before revision commit.

### 5. `property_submission_runs`

One durable request to process one fixed revision:

- `id`, `organization_id`, `property_id`, `revision_id`;
- `retry_of_run_id uuid null` referencing the original same-organization run;
- `run_kind` in `initial_publish`, `revision_publish`, `manual_retry`, `reconciliation`;
- `state` in `queued`, `processing`, `succeeded`, `partially_failed`, `failed`, `blocked`, `cancelled`;
- `idempotency_key`, `request_fingerprint`;
- `requested_by_actor_type` and typed actor reference;
- `attempt_count`, `available_at`, `started_at`, `finished_at`;
- safe `error_code`, `error_summary`, `retriable`;
- `request_id`, timestamps, and version.

Unique organization/action/idempotency constraints prevent duplicate logical runs. A manual retry creates one new run linked through `retry_of_run_id`, fixes the same immutable revision, carries/references confirmed successful receipts, and schedules only eligible failed, blocked, or uncertain steps after reconciliation. It never resets or duplicates successful steps.

### 6. `property_submission_run_steps`

Durable safe step projection:

- `id`, `organization_id`, `run_id`, `property_id`, `revision_id`;
- `step_key` from an allowlist such as `asset_export`, `drive_folder`, `sheets_projection`, `make_delivery`;
- state in `pending`, `processing`, `succeeded`, `failed`, `blocked`, `skipped`;
- attempt count and timestamps;
- stable external configuration/delivery/receipt references from MT-SPEC-08;
- safe external IDs needed for reconciliation;
- safe error code/summary and `retriable`;
- idempotency key and version.

Credentials, webhook URLs, provider tokens, raw response bodies, public links, and customer payloads do not belong here.

### 7. `property_events`

Append-only domain timeline containing organization, property, optional revision/run, event type, actor/request, safe metadata, and occurrence time. Events include draft creation/abandonment, property creation/edit/archive/reactivation, assignment, run queued/completed/failed/retried, and reconciliation outcomes.

`property_events` complements generalized `audit_events`; it does not replace security audit.

## Database constraints and indexes

- Every child references `(parent_id, organization_id)`.
- `current_revision_id` and `open_draft_id` must belong to the same property/organization.
- `assigned_to_user_id` must resolve to an active same-organization membership when set.
- Revision/step/event rows are append-only as applicable.
- Published payload and schema version are non-null.
- State transitions use reviewed scoped RPCs or transactions; arbitrary state updates are revoked.
- Organization-leading indexes cover status/update/code, creator/assignee, revision order, draft owner/state, run state/availability, and event time.
- RLS is enabled/forced where applicable and browser direct mutation of run/step/event/audit/outbox tables is denied.
- Service-role repositories remain explicitly scoped and assert returned organization.

## Canonical property schema and validation

- The backend owns one versioned canonical schema covering every current `PropertyData` field.
- Public frontend schema is a safe projection of the same version or is contract-tested against it.
- Existing Spanish business-field labels may remain as domain payload keys for compatibility; new wrapper/system fields use `snake_case`.
- Unknown fields are rejected.
- Numeric fields do not silently accept invalid numeric strings.
- Required text is trimmed/validated without altering meaningful business data.
- Booleans/arrays use explicit normalized defaults.
- Select/enum values are allowlisted.
- Sheet formula-leading text is neutralized in the Sheet projection, never by mutating canonical data.
- Full resulting payload is validated on create and every revision.
- Historical revision reads use their fixed `schema_version`; later schema changes never reinterpret stored history.
- Schema migrations provide explicit transformation/version rules and evidence.

## Draft and media lifecycle

1. Authenticated member enters the organization-scoped new-property route.
2. Client creates a durable draft with an idempotency key before media preflight.
3. Autosave updates the draft using expected version.
4. MT-SPEC-07 issues upload sessions bound to organization, actor, draft, receiver, limits, and expiry.
5. Client uploads directly according to the approved asset flow.
6. Backend finalizes/verifies assets and returns stable asset IDs.
7. Submit sends complete property fields, asset IDs/order/cover, draft version, and idempotency key.
8. Server revalidates identity, capability, state, quota, draft scope/version, complete payload, and assets.
9. Transaction creates revision 1, updates property/current revision, finalizes draft/asset associations, and writes event/audit/usage/run/outbox.
10. Response is `202` with durable property/revision/run identifiers and status URL.
11. Workers execute projections after commit.

Expired/abandoned drafts and unattached assets follow approved MT-SPEC-07 retention. They are never made visible to another organization.

## Property modification lifecycle

- Editing begins from a fixed current revision and creates a durable edit draft.
- Client submits `expected_property_version`, `base_revision_id`, complete resulting payload, asset association result, and idempotency key.
- Server rejects stale base/version with `409 VERSION_CONFLICT` and returns a safe current-version summary.
- The frontend preserves the user's draft and offers reload/compare/reapply; it never overwrites silently.
- Successful edit locks the property, verifies the base remains current, validates the full result, creates the next immutable revision, moves the current pointer, increments property version, and creates run/outbox/audit/usage/events atomically.
- Provider projection follows the approved POL-06 decision.
- A failed provider projection does not roll back the revision.
- Reverting means creating a new revision based on an authorized historical snapshot; historical rows remain unchanged.

## Processing, retry, and idempotency

- Creation/finalization, edit, archive/reactivation, and manual retry require `Idempotency-Key` or an equivalent documented snake_case request contract.
- Keys are high-entropy opaque values generated per user intent, bounded, and never reused across distinct payloads.
- Server stores a canonical request fingerprint excluding volatile transport data.
- Same key/fingerprint returns existing `202`/final operation projection.
- Same key/different fingerprint returns `409 IDEMPOTENCY_CONFLICT`.
- Worker deliveries use separate stable per-step idempotency keys.
- Transient retry uses capped exponential backoff/jitter and fair organization scheduling.
- Permanent failures become `failed`; missing configuration/suspension/hold becomes `blocked` where appropriate.
- Manual retry targets a specific run or eligible failed step and records actor/reason.
- Confirmed successful steps are not repeated.
- Unknown provider outcome is reconciled using stable external identifiers before retry.
- Retry never builds a new revision from stale frontend data.

## Provider projection contract

MT-SPEC-08 owns execution, but property intents must contain an allowlisted versioned projection built from the fixed revision.

### Drive

- Use organization-specific configuration/destination.
- Persist stable folder/file IDs and private application-authorized view references.
- Never grant `anyone` access.
- Folder name remains human-friendly but ID is authoritative.
- Reuse/reconcile a committed folder for retries rather than create another.

### Sheets

- Append one versioned row per published revision under the baseline POL-06 decision.
- Use stable property/revision identifiers and organization-specific destination.
- Validate headers/mapping before delivery.
- Use safe value handling that prevents formula execution.
- Persist delivery/range receipt; never rediscover by address/time.

### Make

- Deliver a versioned allowlisted event containing organization-safe routing reference, property/revision IDs, event type, and approved projection.
- Do not serialize database rows, credentials, private paths, or internal token hashes.
- Use stable delivery/idempotency ID and persist response classification.

## API contracts

All protected routes use MT-SPEC-03 context. Path organization must equal active context; slug is never authority.

```text
POST   /api/organizations/:organization_id/property-drafts
GET    /api/organizations/:organization_id/property-drafts/:draft_id
PATCH  /api/organizations/:organization_id/property-drafts/:draft_id
POST   /api/organizations/:organization_id/property-drafts/:draft_id/submit
POST   /api/organizations/:organization_id/property-drafts/:draft_id/abandon

GET    /api/organizations/:organization_id/properties
GET    /api/organizations/:organization_id/properties/:property_id
POST   /api/organizations/:organization_id/properties/:property_id/edit-drafts
POST   /api/organizations/:organization_id/properties/:property_id/archive
POST   /api/organizations/:organization_id/properties/:property_id/reactivate
GET    /api/organizations/:organization_id/properties/:property_id/revisions
GET    /api/organizations/:organization_id/properties/:property_id/revisions/:revision_id
GET    /api/organizations/:organization_id/properties/:property_id/events
GET    /api/organizations/:organization_id/properties/:property_id/submission-runs
GET    /api/organizations/:organization_id/property-submission-runs/:run_id
POST   /api/organizations/:organization_id/property-submission-runs/:run_id/retry
```

MT-SPEC-07 adds asset preflight/finalize/view endpoints bound to `draft_id`, `property_id`, and organization.

### Representative creation response

```json
{
  "property_id": "00000000-0000-0000-0000-000000000000",
  "property_code": "PROP-000001",
  "revision_id": "00000000-0000-0000-0000-000000000000",
  "revision_number": 1,
  "submission_run_id": "00000000-0000-0000-0000-000000000000",
  "processing_state": "queued",
  "status_url": "/api/organizations/00000000-0000-0000-0000-000000000000/property-submission-runs/00000000-0000-0000-0000-000000000000"
}
```

### List/query behavior

- Opaque cursor pagination with safe default/hard maximum.
- Stable sort by allowlisted keys with UUID tie-breaker.
- SQL filters for status, creator, assignee, created/updated range, property code, property type, operation, locality, and safe indexed search.
- Response exposes current revision summary, assignment, status, version, and latest processing summary, not private integration/storage internals.
- No global exact count or JavaScript post-filtering.

### Error behavior

- `400 INVALID_REQUEST`, `INVALID_CURSOR`, or validation errors with safe field paths.
- `401` missing/invalid identity.
- `403` missing capability.
- generic `404` for missing/cross-organization property, draft, revision, run, or asset.
- `409 VERSION_CONFLICT`, `IDEMPOTENCY_CONFLICT`, `DRAFT_STATE_CONFLICT`, or `POLICY_NOT_AVAILABLE`.
- `413` body/upload limits as applicable.
- `423 ORGANIZATION_SUSPENDED`, `ORGANIZATION_PENDING_DELETION`, or locked record state.
- `429` distributed rate/quota result with safe `Retry-After`.
- `503 DEPENDENCY_NOT_READY`, `ASSET_VERIFICATION_UNAVAILABLE`, `AUDIT_UNAVAILABLE`, or processing infrastructure unavailable.

All protected responses use safe correlation/private headers from MT-SPEC-03/04. Provider errors are never returned raw.

## Frontend requirements

### Routes

```text
/t/:organization_slug/properties
/t/:organization_slug/properties/new
/t/:organization_slug/properties/:property_id
/t/:organization_slug/properties/:property_id/edit
/t/:organization_slug/properties/:property_id/history
/t/:organization_slug/properties/:property_id/processing/:run_id
```

Direct navigation waits for server-validated context. Suspended/unauthenticated/no-capability states are explicit.

### New/edit form

- Preserve current grouped fields, labels, validation, media ordering/cover, and compact UI.
- Replace Agent controls with authenticated member/organization display.
- Create/resume durable server draft and show saved/saving/offline/conflict state accessibly.
- Autosave is debounced/idempotent and versioned; explicit submit remains required.
- Do not store sensitive complete payloads in unencrypted local storage by default.
- Browser recovery keys include organization ID, draft ID, schema version, and user ID where approved.
- Organization switch/logout cancels autosave/uploads and clears or partitions recovery state.
- Submit locks duplicate interaction while preserving recoverable state on ambiguous responses.

### Property management

- Paginated list with search/status/creator/assignee/property-type/operation/location filters.
- Stable URL-backed filters where appropriate.
- Empty/loading/error/forbidden/suspended states.
- Detail with current canonical data, safe assets, actor/assignment, version, and processing summary.
- Revision history shows revision number, time, actor, change kind, redacted summary, and authorized snapshot comparison.
- Edit conflict flow retains user work and explains resolution.
- Archive/reactivate/retry actions use confirmations and capability-aware rendering.

### Durable processing/result page

- Fetch run state from the backend by organization/run ID; never require `location.state`.
- Show `queued`, `processing`, `succeeded`, `partially_failed`, `failed`, `blocked`, `cancelled`, and conflict/retry states using text plus accessible status regions.
- Show per-step safe state and retry eligibility.
- Do not expose provider credentials, raw errors, storage paths, or public Drive URLs.
- Poll with bounded backoff or consume an approved event channel; stop on terminal state, switch, logout, or unmount.
- Refresh/bookmark must reconstruct the same authorized result.

### Cache isolation

Every property query/mutation key starts with immutable organization ID and relevant record/version identifiers. Switch/logout cancels in-flight queries/mutations, removes sensitive prior-organization data, resets forms/uploads, and prevents stale Azar data from flashing under Solar.

## Audit, privacy, usage, and observability

- Domain event and generalized audit event accompany create/edit/archive/reactivate/assign/retry and rejected privileged attempts per SPEC-28.
- Audit records changed field names/redacted summary, never complete property payload or private notes.
- `Notas Privadas`, owner/contact data, addresses, and media may be personal/confidential and follow approved access/retention.
- Usage records property creation, revisions, verified bytes/assets, and provider deliveries idempotently.
- Rate limits cover draft creation/autosave abuse, preflight/finalize, submit, edit, list/search, status polling, archive, and retry.
- Metrics cover draft abandonment/conflict, finalize latency/failure, revision conflicts, run queue/age/state, step latency/retry/dead letter, provider health, and cross-organization denials using bounded labels.
- Structured logs include safe organization/request/property/run references and error codes, never payloads, agent fields, raw provider bodies, tokens, URLs, or paths.

## Expected behavior

### Main creation case

1. Active Azar member with `properties.write` opens the Azar property form.
2. Server creates an Azar draft and attributes the authenticated member.
3. Autosave and MT-SPEC-07 media operations stay bound to that draft.
4. Submit validates complete payload, assets, quota, version, and idempotency.
5. Transaction creates property/revision/run plus event/audit/usage/outbox records.
6. API returns durable queued identifiers.
7. UI navigates to a status route that survives refresh.
8. MT-SPEC-08 workers use Azar configuration and process Drive, Sheets, and Make fairly/idempotently.
9. UI displays success or partial/failed step state and safe retry actions.
10. Solar users cannot list, fetch, infer, edit, retry, or view Azar assets/runs.

### Main modification case

1. Authorized member opens current revision and creates an edit draft.
2. User changes fields/assets and submits against expected property version.
3. Full resulting state validates.
4. Transaction appends next revision and moves current pointer.
5. Sheet revision row and Make revision event are delivered asynchronously.
6. Earlier revision and provider receipt history remain immutable.

### Edge cases

- User belongs to Azar and Solar: switching yields independent lists, drafts, assignments, providers, and caches.
- Member removed while form is open: next autosave/submit fails; no revision/provider intent.
- Organization suspended after run queued: worker blocks delivery according to POL-11.
- Two edits race: one commits; stale request receives `409` and retains its draft.
- Submit response is lost after commit: idempotent replay returns existing property/run.
- Provider times out after commit: step becomes unknown/failed and reconciles before retry.
- Sheets succeeds and Make fails: canonical revision remains; run is partially failed; retry targets Make only.
- Browser refreshes result: state loads from durable run.
- Asset belongs to Solar or another draft: generic rejection; no revision.
- Draft expires while uploads exist: no other organization can claim them; retention cleanup applies.
- Address duplicates: allowed unless a separate approved business rule exists; address is not identity.
- Same code generation races: database uniqueness/retry yields one code per property.
- Historical schema version is retired: historical revision remains readable with its fixed projection.

### Required failures

- Unauthenticated property draft/preflight/submit/list/edit/retry access.
- Caller-supplied organization/actor authority.
- Cross-organization UUID/asset/run/provider access.
- Global property fetch followed by JavaScript filtering.
- Direct browser writes to canonical revision/run/event/audit/outbox tables.
- Publishing incomplete or invalid payload.
- Mutating/deleting historical revisions.
- Attaching raw path/URL or unverified/mismatched asset.
- Silent overwrite on stale version.
- Duplicate property/revision/delivery from replay.
- Provider call inside the canonical transaction.
- Public Drive permission creation.
- Modification delivery without an approved POL-06 projection.
- Treating local log/console/navigation state as success authority.

## Affected contracts and files

### Database

- Forward migrations for `properties`, `property_drafts`, `property_revisions`, `property_revision_assets`, `property_submission_runs`, `property_submission_run_steps`, and `property_events`.
- Composite organization constraints, indexes, RLS, restricted grants, and scoped transaction functions.
- Shared audit/usage/outbox/assets/integration references from SPEC-28/MT-SPEC-07/08.

### Backend

- Replace route-heavy orchestration with thin route adapters and property draft/domain/revision/run services/repositories.
- Register authenticated organization-namespaced property routers.
- Retire authoritative `agent_*`, local upload sessions, local submission logger, and direct request-provider orchestration after cutover.
- Preserve mappers/validation/folder naming through versioned domain/provider projections.

Expected areas include:

- `backend/src/routes/properties.ts`
- `backend/src/services/createPropertySubmission.ts`
- `backend/src/services/validatePropertyPayload.ts`
- `backend/src/services/mediaUploadSessionService.ts`
- `backend/src/services/submissionLogger.ts`
- `backend/src/services/googleDriveService.ts`
- `backend/src/services/googleSheetsService.ts`
- `backend/src/services/makeWebhookService.ts`
- `backend/src/mappers/`
- new property repositories/services/types
- `backend/tests/`
- `supabase/migrations/`

### Frontend

- Replace `AgentContext`/`AgentModal` property identity with MT-SPEC-03 auth/organization context.
- Add property list/detail/edit/history/processing features and organization-scoped API/query keys.
- Preserve/reuse the existing property form sections and validation where compatible.
- Replace ephemeral success navigation data with durable status lookup.

Expected areas include:

- `frontend/src/App.tsx`
- `frontend/src/app/contexts/AgentContext.tsx` and `frontend/src/main.tsx`
- `frontend/src/pages/NewPropertyPage.tsx`
- `frontend/src/pages/SubmissionSuccessPage.tsx`
- new property management/history pages
- `frontend/src/features/properties/`

### Documentation and operations

- Update the property PRD with a clear supersession note for create-only/global assumptions.
- Update architecture, API, environment, integrations, testing, engineering, privacy/retention, operations, observability, backup, and support docs.
- Add migration, reconciliation, failed-run, orphaned-draft/asset, and provider projection runbooks.

## Implementation sequence

### Phase 1 — approve prerequisites and contracts

- Approve MT-SPEC-03 context, SPEC-28 controls, MT-SPEC-07 asset interface, MT-SPEC-08 outbox/integration interface, POL-06 projection, retention, states, schema version, and API contracts.
- Inventory current form fields, validation, mappers, provider steps, log artifacts, storage objects, and production destinations.

### Phase 2 — additive database foundation

- Add property tables, constraints, indexes, RLS/grants, scoped RPCs, and Azar/Solar fixtures.
- Add real-database concurrency/isolation tests.
- Do not expose new routes through legacy unauthenticated identity.

### Phase 3 — domain services

- Implement scoped repositories, draft autosave, validation, finalization, immutable edits, history, archive, idempotency, runs, events, audit/usage/outbox.
- Adapt existing validators/mappers with parity tests.
- Integrate MT-SPEC-07/08 test doubles; no real provider calls in automated tests.

### Phase 4 — APIs and frontend

- Add organization-namespaced routes and management UI.
- Add durable drafts/result lookup, cache isolation, switching cleanup, conflict/retry states, and accessibility.
- Keep legacy property path contained or disabled until MT-SPEC-10 cutover.

### Phase 5 — provider and recovery validation

- Connect organization-specific staging destinations through MT-SPEC-08.
- Prove idempotency, partial failure, reconciliation, suspension, restore, and fair scheduling.
- Remove public Drive ACL behavior.

### Phase 6 — migration handoff

- Produce legacy submission/provider inventory and deterministic mapping/quarantine plan for MT-SPEC-10.
- Keep production Azar-only and Solar blocked until migration/cutover evidence passes.

## Migration, compatibility, and rollback

### Migration

- Add schema and dual-write/shadow-read only through an approved bounded plan.
- Current local property logs are inventory evidence, not trusted ownership proof.
- Correlate legacy artifacts using submission/property/provider IDs and reviewed operator evidence.
- Assign verified production property records/assets/provider resources to Azar; quarantine ambiguity.
- Never import caller-controlled `agent_*` as membership/organization authority. It may become a reviewed historical display snapshot only.
- Register legacy assets through MT-SPEC-07 and provider receipts/configuration through MT-SPEC-08.
- Validate full field parity/counts/checksums and provider reconciliation before cutover.
- Remove/disable legacy unauthenticated routes and public ACLs at the authorized MT-SPEC-10 stage.

### Compatibility

- Existing field keys and frontend form behavior remain supported through schema versioning.
- Existing `/properties/new` and success URLs may redirect to Azar-scoped routes only after trusted context/backfill exists.
- Current synchronous result shape may remain a temporary adapter backed by the durable run, but cannot be authoritative or cross-organization.
- Existing provider folder naming can remain human-facing while stable IDs become authority.

### Rollback

- Database changes are forward-only; use corrective migrations.
- Do not drop organization scope, revisions, audit, idempotency, or provider receipts to restore legacy behavior.
- If provider workers fail, pause delivery while retaining canonical properties/runs.
- If tenancy cannot be proven, disable affected property routes and keep Solar blocked.
- Restore follows SPEC-28 tombstone/revocation/outbox reconciliation before traffic/workers.

## Required tests

### Unit tests

- Full current field-schema parity, normalization, validation, schema versions, and unknown fields.
- Organization-unique code generation/retry.
- Draft patch/version/state rules.
- Full-result revision validation and redacted change summaries.
- Capability/visibility/assignment decisions.
- Idempotency keys/fingerprints/replay/conflict.
- Run/step state machines and retry eligibility.
- Sheet formula sanitization and stable versioned mapping.
- Make allowlisted event mapping.
- Provider errors mapped to safe codes.

### Real-database tests

- Clean/upgrade migrations, constraints, RLS/grants, and scoped RPCs.
- Azar/Solar composite-reference attacks across every table.
- Current-revision/open-draft same-organization consistency.
- Concurrent code allocation, draft autosave, first publish, edits, archive, retries, and idempotency.
- Immutable revision/event enforcement.
- Atomic property/revision/event/audit/usage/run/outbox commit/rollback.
- Organization-leading list/filter/history/run query plans.
- Service-role explicit scoping/returned-row assertions.

### Backend API tests

- Authentication, capability, membership/organization-state revalidation.
- Caller `agent_*`/ownership rejection or ignoring as documented without authority.
- Draft/create/edit/list/detail/history/archive/reactivate/run/retry success and errors.
- Generic `404` for every Azar/Solar direct UUID attack with no side effect.
- Cursor/filter/sort bounds and assigned-only behavior.
- Complete validation and asset mismatch/failure.
- Same/different idempotency replay.
- Lost-response retry.
- Partial provider state and step-specific retry/reconciliation with mocks.
- Distributed rate/quota/audit outage behavior.
- No real external API calls.

### Frontend tests

- Existing field/form/media behavior parity.
- No Agent identity control/local-storage authority.
- Durable draft creation/autosave/resume/version conflict.
- Organization ID in every query/mutation/recovery key.
- Switch/logout cancels and removes/partitions requests/cache/drafts/uploads.
- List/detail/edit/history/filter/pagination/archive/retry UI.
- Result page refresh/bookmark and all run/step states.
- No stale Azar display under Solar.
- Direct navigation waits for validated context.
- Keyboard, focus, labels, errors, live status, dialogs, and axe coverage.

### Provider/storage/recovery tests

- MT-SPEC-07 cross-organization/cross-draft asset reuse rejection.
- Private Drive/configuration routing and absence of `anyone` ACL.
- Stable folder/Sheet/Make idempotency and receipt persistence.
- Timeout-after-commit reconciliation before retry.
- Sheets-only/Make-only/Drive-only partial failure recovery.
- Suspended organization delivery block.
- Restored runs remain paused until reconciliation.
- Logical Azar export contains no Solar property data/assets/runs/receipts and vice versa.

## Acceptance criteria

This SPEC is complete only when:

1. Required SPEC-25 policies, SPEC-26 capabilities, MT-SPEC-03 context, SPEC-28 controls, and MT-SPEC-07/08 interfaces are approved.
2. All thirty-four property invariants are approved and traceable.
3. Complete current property field/functionality parity is documented and tested.
4. Every property-domain row has non-null organization ownership and composite constraints.
5. `properties` provides organization-unique code, state, current revision, creator/updater/assignment, timestamps, and version.
6. Durable drafts exist before media preflight and support versioned incomplete autosave.
7. Published revisions are complete, immutable, schema-versioned, ordered, actor/request-attributed, and redacted-summary capable.
8. Asset associations use verified MT-SPEC-07 asset IDs with organization/draft/property/revision consistency.
9. Submission runs/steps persist state, idempotency, attempts, safe errors, and stable provider receipt references.
10. Property events are append-only and generalized audit/usage/outbox contracts are consumed.
11. RLS, service-role scoping, composite constraints, grants, and real-database adversarial tests pass.
12. Every route requires trusted active organization context and the correct property capability.
13. `agent_*`, `AgentContext`, `AgentModal`, and `form_site_agent` are removed as property identity/authority.
14. Creator/updater and organization are derived server-side.
15. Submit-on-behalf-of is absent or implemented only with named capability, explicit UI, same-organization validation, and audit.
16. Creation commits canonical property/revision/run/event/audit/usage/outbox state before provider work.
17. Every edit validates the complete result and creates a new immutable revision using optimistic concurrency.
18. Stale edits return `409` without data loss or overwrite.
19. Creation, edit, archive/reactivate, and retry are idempotent and fingerprinted.
20. Browser/provider retries cannot duplicate property, revision, folder, Sheet row, Make event, audit, or usage.
21. POL-06 projection is approved; Sheets/Make revisions use stable IDs and no address/time rediscovery.
22. Provider failure never removes canonical property state and eligible failed steps can be retried independently.
23. Unknown provider outcomes reconcile before retry.
24. No provider call occurs inside a canonical database transaction.
25. Lists/details/history/runs are SQL-scoped, bounded, cursor-paginated, stable, and policy-filtered.
26. Cross-organization direct identifiers return generic `404` and no side effect for every action.
27. Archive/reactivate and organization suspension behavior match approved lifecycle policy.
28. Frontend provides organization-scoped list, detail, edit, history, processing, conflict, and retry experiences.
29. Durable result pages reconstruct state after refresh/bookmark without navigation state.
30. Every frontend property cache/mutation/draft key includes immutable organization ID and is cleaned/partitioned on switch/logout.
31. Existing accessible form/media behavior and all queued/processing/success/partial/failed/blocked states pass tests.
32. Drive resources are private and organization-routed; no `anyone` ACL remains for live property resources.
33. Sheet/Make/Drive configuration and deliveries are organization-specific through MT-SPEC-08.
34. Local files/console logs no longer serve as production property/audit/processing authority.
35. Structured redacted telemetry, distributed limits, usage/quotas, fair scheduling, alerts, backup/restore, and reconciliation pass SPEC-28 gates.
36. Legacy submissions/assets/provider resources have an MT-SPEC-10 assignment/quarantine plan; no automatic agent-based authority migration occurs.
37. Automated tests use disposable database/storage and mocked providers, never production APIs/data.
38. Canonical property PRD, architecture, API, environment, integrations, testing, engineering, privacy/retention, operations, observability, and support docs are updated.
39. A traceability matrix links every criterion to migration, code, tests, docs, evidence, and reviewer.
40. Product, security, data, backend, frontend, operations, integration, and privacy/legal owners approve completion.

## Completion gate and handoff

Passing SPEC-30 means properties are durable, editable, auditable, idempotent, and manageable only by the owning organization. It does not authorize production backfill or Solar onboarding.

MT-SPEC-10 may migrate/cut over properties only after:

- legacy property/log/provider/asset inventory is complete;
- ownership assignment/quarantine rules are approved;
- Azar/Solar isolation and provider-routing tests pass;
- public Drive access is remediated;
- durable upload/outbox/worker infrastructure is operational;
- provider receipts reconcile without duplication;
- full restore and logical organization export tests include property state; and
- rollback/containment runbooks are exercised.

## Required deliverables

- Approved SPEC-30 / MT-SPEC-06.
- Ordered additive database migrations and RLS/grant/index/RPC evidence.
- Versioned canonical property schema/parity matrix.
- Property draft/domain/revision/run/event services and scoped repositories.
- Idempotency, concurrency, assignment, archive, retry, and projection contracts.
- MT-SPEC-07 property asset association implementation.
- MT-SPEC-08 property outbox/delivery/reconciliation implementation.
- Organization-namespaced APIs and typed public contracts.
- Property list/detail/edit/history/processing frontend.
- Durable draft/result and organization-safe cache behavior.
- Unit, real-database, API, frontend, accessibility, storage/provider, recovery, and Azar/Solar adversarial tests.
- Legacy property/provider/asset migration inventory and MT-SPEC-10 handoff.
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

Focused checks classify historical/compatibility matches:

```bash
rg -n "agent_user_id|agent_name|agent_email|AgentContext|form_site_agent" backend/src frontend/src
rg -n "mediaUploadSessionService|new Map|submissionLogger|backend/logs|console\\." backend/src
rg -n "organization_id|property_drafts|property_revisions|property_submission_runs|property_events" backend/src frontend/src supabase/migrations
rg -n "MAKE_WEBHOOK_URL|GOOGLE_SHEET_ID|GOOGLE_DRIVE_FOLDER_ID|type: 'anyone'" backend/src
rg -n "location\.state|properties/success|queryKey" frontend/src
```

No root `package.json` or `docs:check` script currently exists. Until one is added, documentation verification uses required-section/reference review, Markdown checks, `git diff --check`, and the backend/frontend commands above.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Existing form fields are lost during refactor | Versioned schema parity matrix plus frontend/backend contract tests |
| Browser agent metadata remains trusted | Remove it from authority; derive organization/actor from MT-SPEC-03 context |
| Draft media exists before ownership | Create durable scoped draft first; MT-SPEC-07 binds every upload |
| Provider timeout duplicates external state | Durable intents, stable IDs/idempotency, receipt lookup, reconciliation before retry |
| Editing silently overwrites another member | Expected version/base revision, row lock, `409`, retained user draft |
| Sheet history becomes ambiguous | Append stable property/revision IDs per approved POL-06 decision |
| Long provider calls hold database locks | Commit canonical state/outbox first; workers call providers afterward |
| Partial failure is mistaken for property loss | Canonical revision remains; durable run exposes per-step recovery |
| Organization switch flashes old data | Organization-prefixed keys plus cancel/remove/partition on switch/logout |
| Local logs are mistaken for migration truth | Treat as evidence only; reconcile with stable provider/database identifiers |
| Existing Drive folders remain public | Inventory, revoke public ACLs, private organization routing before Solar |
| Noisy tenant exhausts workers/providers | SPEC-28 fair per-organization/provider concurrency and distributed limits |
| Schema changes reinterpret history | Fixed schema version on immutable revisions |
| Provider policy remains undecided | Keep edits/deliveries disabled until POL-06/MT-SPEC-08 approval |

## References

### Multi-tenant source documents

- `docs/09-roadmap/specs/research/23-RESEARCH-multi-tenant-saas-architecture.md`
- `docs/09-roadmap/specs/research/24-RESEARCH-multi-tenant-saas-specification-roadmap.md`
- `docs/09-roadmap/specs/pending/25-SPEC-multi-tenant-policy-threat-model-containment-and-inventory.md`
- `docs/09-roadmap/specs/pending/26-SPEC-multi-tenant-organizations-memberships-onboarding-and-lifecycle.md`
- `docs/09-roadmap/specs/pending/28-SPEC-multi-tenant-database-enforcement-audit-abuse-observability-and-recovery.md`

### Previous project documents used for behavior and format

- `docs/prd.md`
- `docs/09-roadmap/specs/completed/09-SPEC-contract-generation.md`
- `docs/09-roadmap/specs/completed/10-SPEC-contract-generation-reworked.md`
- `docs/09-roadmap/specs/completed/17-SPEC-contract-generation-reworked.md`
- `docs/09-roadmap/specs/completed/19-SPEC-contract-generation-reworked.md`
- `docs/09-roadmap/specs/pending/22-SPEC-contract-management-ui-and-access-control.md`

### Repository guidance and canonical documentation

- `references/llm-guide.md`
- `references/documentation-structure-guide.md`
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
