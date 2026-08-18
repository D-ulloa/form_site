# SPEC-31 / MT-SPEC-07 Multi-tenant SaaS — private assets, uploads, verification, downloads, retention, and storage migration

**Date:** 2026-08-18
**Priority:** critical
**Status:** pending prerequisite specifications and approval
**Roadmap identifier:** MT-SPEC-07
**Dependencies:** SPEC-25 / MT-SPEC-01, SPEC-26 / MT-SPEC-02, MT-SPEC-03, SPEC-28 / MT-SPEC-04, and owner interfaces from MT-SPEC-05 and SPEC-30 / MT-SPEC-06
**Blocks:** MT-SPEC-08, production asset migration in MT-SPEC-10, and onboarding any second real organization

---

## Specification identity

**Name:** Organization-scoped asset registry, uploads, verification, downloads, retention, cleanup, and storage migration.

**Description:** Create one security model for contract DNI/evidence, property media, branding assets, and future uploaded files across Supabase Storage and any exported copy.

**Why it is necessary:** Private buckets and random paths are not sufficient ownership controls. Current property upload sessions are process-local, browser-returned paths are weakly bound, contract paths lack organization prefixes, and Drive links may bypass application authorization.

## Summary

This specification creates a single durable security model for every uploaded or generated file. It preserves the existing contract DNI/evidence requirements and property media experience while replacing bucket/path references as authority.

It defines:

- an organization-owned `media_assets` registry;
- durable distributed upload sessions and per-file upload intents;
- organization-prefixed private Storage paths;
- capability-, quota-, receiver-, count-, type-, and size-checked upload issuance;
- server verification of object existence, scope, metadata, detected type, size, checksum where required, and uniqueness;
- explicit domain association tables for contracts, properties, branding, exports, and future owners;
- short-lived authorized view/download delivery without exposing storage authority;
- safe content disposition, active-content handling, and scanning/quarantine hooks;
- property ordering/cover-image constraints and branding approval/renditions;
- verified-byte/count usage accounting;
- retention, legal hold, deletion, orphan cleanup, and backup/export contracts;
- Azar-only legacy path registration, copy/move mapping, and orphan quarantine; and
- adversarial Azar/Solar tests for path tampering, asset reuse, URL issuance, multi-instance behavior, cleanup, quotas, and deletion.

All Supabase buckets remain private. An asset UUID is only a lookup key; current server authorization against the asset's organization, owner, purpose, and state is always required.

This document defines implementation contracts. It does not apply migrations, move/delete production objects, publish branding, change Drive ACLs, or enable Solar.

## Authority and relationship to other specifications

This is the seventh formal implementation SPEC derived from:

- `docs/09-roadmap/specs/research/23-RESEARCH-multi-tenant-saas-architecture.md`;
- `docs/09-roadmap/specs/research/24-RESEARCH-multi-tenant-saas-specification-roadmap.md`;
- `docs/09-roadmap/specs/pending/25-SPEC-multi-tenant-policy-threat-model-containment-and-inventory.md`;
- `docs/09-roadmap/specs/pending/26-SPEC-multi-tenant-organizations-memberships-onboarding-and-lifecycle.md`;
- `docs/09-roadmap/specs/pending/28-SPEC-multi-tenant-database-enforcement-audit-abuse-observability-and-recovery.md`; and
- `docs/09-roadmap/specs/pending/30-SPEC-multi-tenant-properties-submissions-modifications-and-management.md`.

MT-SPEC-03 and MT-SPEC-05 are not currently present as project documents. This SPEC may be reviewed, but protected member requests cannot be implemented without MT-SPEC-03's trusted context, and final contract association/migration behavior cannot close without MT-SPEC-05.

MT-SPEC-08 owns exported provider copies and Google ACL remediation. Canonical asset ownership, Storage privacy, and authorization remain governed here even when a file is projected to Drive.

Earlier contract SPECs remain authoritative for existing receiver behavior:

- SPEC-11 defines repeatable Inquilino/Garante DNI front/back slots and private direct upload.
- SPEC-14 defines per-guarantor salary-receipt/property-guarantee receivers, accepted formats, counts, and minimum evidence.
- SPEC-17 makes displayed DNI front/back controls required for migrated entries and permits the configured PDF/image formats.
- SPEC-15 defines safe administrator attachment presentation/download behavior.
- SPEC-10 through SPEC-22 preserve contract history, inspection order, validation, correction, and role-link behavior.

## Context

### Current-state assessment

The repository has useful foundations:

- private `contract-dni` and `contract-evidence` buckets;
- signed direct-upload URLs issued after contract role-token checks;
- path, MIME, size, receiver, count, and live-object metadata validation;
- stable references persisted instead of signed URLs;
- short-lived administrator view URLs;
- frontend retry behavior that promotes successful uploads to stable references; and
- bounded verification concurrency.

However, stored contract JSON treats `{ storageBucket, storagePath }` as the durable reference. Paths begin with `contracts/{entry_id}` without organization prefix. There is no shared asset row, retention state, legal hold, verified-byte ledger, or durable unattached-upload cleanup record.

Property media differs further: the upload session is an in-process `Map`, its authority is a browser-controlled agent ID, and browser-returned metadata is weakly bound. Property object paths are globally prefixed. The Drive projection currently creates public bearer access.

These models cannot safely support multiple application instances or organizations.

## Motivation

A private bucket prevents anonymous listing; it does not prove that an Azar user may access a particular object or that a Solar object was not attached to an Azar record. Random names and path prefixes are defense in depth, not relational authorization.

The database must know the organization's ownership, intended receiver, upload principal, lifecycle, verified metadata, association, retention, and deletion status before it exposes or counts a file.

## Objective

Implement one durable asset platform in which every live file has a verified organization owner and domain association; every upload is pre-authorized, expiring, bounded, and single-use; every view/download is authorized at issuance; every bucket/resource remains private by default; and retention, deletion, migration, and exported-copy behavior are auditable without allowing Azar to issue or reuse any Solar asset capability.

## Terminology

- **Asset:** A durable registry record representing one stored or generated file.
- **Storage object:** Provider object addressed internally by bucket and object path.
- **Upload session:** Durable authorization envelope for one upload operation/batch.
- **Upload intent:** One expected file slot within an upload session.
- **Receiver:** Named domain field/slot and its MIME, size, count, and requiredness policy.
- **Pending asset:** Registry/intended object not yet verified and attachable.
- **Verified asset:** Object whose existence and required metadata/content checks passed.
- **Associated asset:** Verified asset linked to an exact domain record/revision/role.
- **Unattached asset:** Verified or uploaded asset whose final domain transaction did not attach it.
- **Quarantined asset:** Object blocked from view/association due to mismatch, scanning, migration ambiguity, or security review.
- **Public branding projection:** Sanitized approved derivative accessible without customer membership; it is not the private original.
- **Exported copy:** A non-canonical provider copy such as a Drive file.
- **Retention class:** Versioned policy key selecting approved retention/legal basis.
- **Deletion receipt:** Durable evidence for logical/physical deletion or provider limitation.
- **Asset fingerprint:** Safe checksum where required for integrity/duplicate detection; never an authorization credential.

New visible/persisted contracts use `snake_case`; environment variables use `UPPER_SNAKE_CASE`. Internal TypeScript follows repository conventions.

## Scope

### Includes

- Contract DNI, guarantor evidence, property images/videos, organization logos, exports, and future file categories.
- Durable assets, upload sessions/intents, associations, verification, and lifecycle.
- Organization-prefixed paths and private buckets.
- Member, external contract-link, organization API-key, platform-support, system, and migration principal binding where separately authorized.
- Quota/receiver/count/type/size checks before URL issuance.
- Post-upload object and metadata/content verification.
- Short-lived view/download authorization and safe response behavior.
- Cover image/order rules and safe branding derivatives.
- Usage accounting for verified assets/bytes.
- Unattached expiration, retention, holds, cleanup, deletion, restore, and migration.
- Removal/containment of legacy raw path authority.
- Storage/provider adapters, APIs, frontend states, tests, operations, and documentation.

### Excludes

- Organization/session/capability implementation owned by SPEC-26 and MT-SPEC-03.
- Contract/property business behavior beyond their asset owner interfaces.
- Provider credential/integration configuration, Drive sharing, outbox workers, and exported-copy deletion owned by MT-SPEC-08.
- Billing/payment enforcement owned by MT-SPEC-09.
- Production Azar mapping/cutover/Solar onboarding owned by MT-SPEC-10.
- A full digital-asset-management product or customer-visible file explorer.
- Public Supabase buckets.
- Using a signed URL as durable proof of ownership.
- Guaranteed malware detection for every format unless an approved scanner is configured; quarantine hooks and policy gates are required.

## Dependency and policy gate

Completion requires:

- SPEC-25 POL-01 ownership/quarantine decision;
- POL-09 numeric retention/grace periods and legal bases for each data class;
- POL-10 support-access constraints;
- POL-11 organization suspension behavior;
- MT-SPEC-03 trusted principal/request context;
- SPEC-28 scoped persistence, RLS/service-role, audit, usage, distributed limits, recovery, and incident controls;
- MT-SPEC-05 contract owner/revision/role-link interface;
- SPEC-30 property draft/revision interface; and
- MT-SPEC-08 exported-copy/credential/private Google interface.

No engineer-selected retention period, public ACL, file type, or cross-domain association is permitted. An unresolved scanner/active-content policy leaves the affected category quarantined or download-only.

## Non-negotiable asset invariants

1. Every live asset, upload session, upload intent, association, cleanup job, and deletion receipt has one non-null `organization_id`.
2. Organization/principal/owner scope comes from trusted context and database ownership, never request JSON, slug, raw path, filename, or local storage.
3. Every Storage bucket is private.
4. Every object path begins with an immutable organization UUID segment for defense in depth.
5. Path prefix never replaces database authorization.
6. Browser clients receive asset/upload IDs, never durable bucket/path authority.
7. Signed upload/view/download URLs are transient capabilities and are never persisted, logged, audited, placed in query caches, analytics, or general errors.
8. Raw link/session/invitation/API tokens and decrypted credentials never enter asset metadata.
9. Upload sessions are durable, distributed, expiring, purpose-bound, and single-use at finalization.
10. Every upload intent is bound to organization, principal, owner/draft/entry, receiver, expected metadata, and generated object path.
11. URL issuance occurs only after capability, organization state, quota, receiver, count, type, size, and rate checks.
12. Caller-supplied object paths/buckets are rejected for new flows.
13. Finalization verifies actual object existence, exact bucket/path, byte size, allowed/detected MIME, and optional checksum before `verified`.
14. Metadata mismatch, missing object, duplicate object, expiry, or already-consumed intent fails closed.
15. An asset cannot be attached across organizations, domains, entries, drafts, revisions, repeatable items, roles, or receivers.
16. Composite constraints enforce same-organization association wherever relationally expressible.
17. Generic/polymorphic metadata does not replace explicit domain association constraints.
18. Historical revision associations are immutable.
19. Contract DNI pair and evidence count/minimum rules remain enforced independently of successful upload.
20. Property media ordering is deterministic and each revision has at most one valid cover image.
21. Branding originals remain private; only approved sanitized projections are public.
22. Viewing/downloading always revalidates current principal, organization/entry capability, owner state, asset state, and retention/deletion state.
23. External contract role access is limited to the exact organization-owned entry, role, receiver, and permitted asset action; it never creates membership.
24. Asset UUID knowledge alone never authorizes viewing.
25. Verified bytes/counts are accounted idempotently; retries do not double count.
26. Unattached cleanup never deletes an associated or legally held asset.
27. Logical deletion removes authorization immediately before asynchronous physical cleanup.
28. Physical deletion is idempotent and produces durable evidence.
29. Organization deletion/restore reapplies holds, tombstones, deletion state, and inaccessible assets before traffic.
30. Exported copies inherit organization classification and are tracked for MT-SPEC-08 cleanup; they never become canonical.
31. Ambiguous legacy assets are quarantined, never assigned to Solar or globally visible.
32. Legacy Azar compatibility is explicit, bounded, read-only where possible, and removed after verified migration.
33. General logs/audits contain safe IDs/state/error codes only, never customer file content or private paths.
34. No Azar principal/capability can issue, finalize, associate, view, download, delete, restore, or export a Solar asset.

## Asset data model

All identifiers are UUIDs and timestamps UTC `timestamptz`. SPEC-28 composite keys, RLS, grants, actor/request attribution, indexes, versions, and service-role assertions apply.

### 1. `media_assets`

Required fields:

- `id uuid primary key`;
- `organization_id uuid not null`;
- `storage_provider` and private `bucket_name`;
- generated `object_path`;
- `original_filename`, sanitized display filename, extension;
- client-declared MIME/bytes as untrusted evidence;
- provider-reported MIME/bytes;
- server-detected MIME where policy requires;
- optional cryptographic checksum and algorithm;
- category such as `contract_dni`, `contract_evidence`, `property_image`, `property_video`, `organization_logo`, `export`;
- state in `pending`, `uploaded`, `verifying`, `verified`, `quarantined`, `attached`, `deleting`, `deleted`, `deletion_failed`;
- quarantine/error reason code without raw content;
- retention class, retain-until, legal-hold marker/reference, deletion timestamps/receipt;
- created principal/capability, request ID, timestamps, and version.

Unique constraints cover `(id, organization_id)`, provider/bucket/path, and any checksum/category duplicate policy. Bucket/path columns never appear in ordinary client projections.

### 2. `asset_upload_sessions`

- `id`, `organization_id`;
- principal type and typed principal reference/fingerprint;
- owner domain/type and exact owner/draft/entry ID;
- external contract role/capability reference where applicable;
- action/capability key;
- status in `open`, `finalizing`, `consumed`, `expired`, `revoked`, `failed`;
- expires/created/finalized/revoked timestamps;
- request ID, idempotency key/fingerprint, policy version, version.

The session is a coordination record, not a bearer credential by ID alone. Every API access repeats current authorization and ownership checks.

### 3. `asset_upload_intents`

- `id`, `organization_id`, `upload_session_id`, `asset_id`;
- receiver key and optional repeatable-item stable ID/index contract;
- expected category, original/safe filename, allowed MIME, expected bytes, optional checksum;
- server-generated bucket/path;
- state in `pending`, `url_issued`, `uploaded`, `verified`, `consumed`, `expired`, `rejected`;
- URL issuance count/expiry metadata without URL value;
- verification attempt/error metadata and timestamps/version.

One intent corresponds to one object. Reissuing an upload URL does not create a new intent/path unless the old intent is explicitly replaced and unusable.

### 4. Explicit association tables

Use domain-specific tables with composite same-organization foreign keys, including:

- `contract_submission_assets` or MT-SPEC-05 equivalent;
- `property_revision_assets` from SPEC-30;
- `organization_branding_assets`;
- `export_assets`; and
- future owner-specific tables.

Each includes organization, owner/revision, asset, receiver/category, ordering/cover/public-approval data, actor, and timestamp. A polymorphic `owner_type/owner_id` on `media_assets` may aid operations but is not sufficient relational authority.

### 5. `asset_deletion_receipts`

Append-only evidence with organization, asset, request/reason/policy, logical denial time, storage deletion attempt/result, exported-copy status reference, actor/system job, safe error, and timestamps. No signed URL, credential, private content, or raw provider response is stored.

## Storage layout and buckets

New paths use:

```text
organizations/{organization_uuid}/{domain}/{owner_uuid}/{asset_uuid}/{safe_filename}
```

Examples:

```text
organizations/{organization_uuid}/contracts/{entry_uuid}/{asset_uuid}/dni-frente.pdf
organizations/{organization_uuid}/properties/{draft_or_property_uuid}/{asset_uuid}/frente.jpg
organizations/{organization_uuid}/branding/{organization_uuid}/{asset_uuid}/logo.png
organizations/{organization_uuid}/exports/{export_uuid}/{asset_uuid}/export.zip
```

Rules:

- UUID segments are server-generated and normalized.
- Safe filename is presentation/debugging only; path uniqueness comes from asset UUID.
- No email, person name, DNI, address, token, or customer-provided directory component appears in paths.
- Separate existing buckets may remain where data-class policy differs; a single bucket is not required for a unified registry.
- Bucket MIME/size limits are defense in depth and remain aligned with stricter receiver policy.
- Browser list/read/delete permissions are denied; signed operations are issued server-side.

## Receiver policy registry

One versioned backend registry defines per receiver:

- domain/category and allowed principal types;
- required capability or exact external role;
- allowed MIME types/extensions;
- maximum per-file and aggregate bytes;
- minimum/maximum file counts;
- paired/grouped requirements;
- whether checksum/content detection/scanning is required;
- allowed download disposition;
- retention class; and
- association owner type.

Existing contract receiver rules are imported without weakening:

- DNI front/back slots remain distinct and required where enabled.
- DNI accepts only the configured SPEC-17 PDF/image allowlist and size limit.
- Each guarantor evidence receiver accepts at most two allowed SPEC-14 files.
- Each guarantor supplies at least one file across salary/property-guarantee receivers.
- Unknown receiver/category/principal combinations deny by default.

Frontend receiver metadata is a safe projection; backend policy remains authoritative.

## Upload lifecycle

### 1. Initialize

Client submits receiver descriptors, filenames, declared MIME/bytes, optional checksum, and domain owner/draft identifier. It does not submit organization, bucket, or path authority.

Server:

1. resolves trusted principal and organization;
2. verifies owner/draft/entry and capability/role;
3. applies organization lifecycle, rate, quota, receiver/count/type/size policy;
4. creates session, asset, and intent rows atomically/idempotently;
5. generates private object paths; and
6. returns asset/intent IDs and short-lived signed upload instructions.

### 2. Direct upload

The browser uploads only to the exact signed target. Signed URL lifetime is short and policy-configured. The frontend never stores it in local storage, query keys, analytics, errors, or durable form state.

### 3. Finalize and verify

Client submits intent/asset IDs plus session version. Server reauthorizes and reads actual private Storage metadata. Verification requires:

- exact provider/bucket/path;
- object exists once;
- provider byte size equals expected and permitted size;
- declared/provider/detected MIME is compatible with receiver policy;
- optional checksum matches when required;
- safe filename/category/owner/session consistency;
- session/intent active and unconsumed; and
- no duplicate association/object reuse.

Unverifiable transient provider state returns a retryable `503` without treating the asset as verified. Mismatch quarantines/rejects the intent and does not attach it.

### 4. Associate

The consuming contract/property/branding transaction revalidates verified assets and atomically creates explicit association rows, changes eligible asset state to `attached`, writes domain/audit/usage events, and consumes the upload intent/session. Failed domain submission leaves an unattached verified asset eligible for retry until retention cleanup.

## MIME, content, and download safety

- Do not trust filename extension or client `Content-Type`.
- Compare declared, provider-reported, and server-detected type according to receiver policy.
- Detect type from magic bytes for supported formats before attachment or first view.
- Reject polyglot/unknown/forbidden active content where detection policy cannot establish safety.
- Scanning-capable deployments use `pending_scan`/quarantine semantics before view/association for configured categories.
- Scanner outage follows data-class policy and never silently marks content safe.
- HTML, SVG, executable/script, macro-enabled, and other active types are denied unless separately approved with safe transformation.
- Downloads use `Content-Disposition: attachment` for risky/document types and sanitized filenames.
- Inline rendering is limited to an approved safe MIME set and uses `nosniff`, restrictive CSP/sandbox/proxy behavior as applicable.
- Range requests and response sizes are bounded; redirects are not used to disclose private paths.

## View and download authorization

Target APIs return a short-lived signed URL or stream/proxy response only after current authorization.

Member authorization checks:

- active session/membership/organization;
- owning organization and exact domain record visibility;
- required `files.read` plus domain capability;
- asset attached/verified and not deleted/quarantined/expired;
- legal/retention state; and
- receiver-specific restrictions.

External contract role checks exact entry, role, token/capability state, and receiver visibility. It cannot list organization assets, change entry/role, or retrieve administrative evidence outside its form.

Responses omit bucket/path/checksum/internal metadata. Signed capabilities use minimum lifetime and are never assumed revoked merely because membership changed; sensitive categories prefer application proxy/very short TTL where immediate control is required.

## Property media requirements

- Assets attach to a fixed property draft/revision under SPEC-30.
- Ordering uses unique contiguous or deterministically normalized `sort_order` per revision.
- Exactly zero or one attached allowed image is `is_cover`; when media exists and policy requires a cover, exactly one is required.
- Cover cannot reference video, deleted/quarantined asset, another revision, or another organization.
- Reordering/cover changes in published data create a new property revision; historical order remains immutable.
- Provider exports use asset IDs/stable receipts and never public Storage paths.

## Organization branding requirements

- Original logo asset is private and must be an allowed raster format/type/size/dimensions.
- Decode and re-encode into approved derivative formats to remove metadata/active payload where feasible.
- Strip EXIF and unnecessary metadata.
- Branding association has `draft`, `approved`, `retired` state and optimistic version.
- Public projection exposes approved organization name/theme and a safe derivative URL/proxy only.
- Public URL reveals no private bucket/path, uploader, plan, membership, or internal lifecycle details.
- Retiring/replacing branding invalidates new issuance/cache version and retains/deletes originals by approved policy.
- Cross-organization logo selection returns generic not-found.

## Quotas and usage

- Reserve proposed bytes/count before URL issuance using SPEC-28 quota primitives.
- Finalize usage from verified actual bytes, not client claims.
- Idempotent upload/finalize/retry does not double reserve/count.
- Expired/rejected/unattached cleanup releases reservation or appends compensation according to policy.
- Attached verified bytes remain counted until policy-defined deletion.
- Per-organization, data-class, per-file, batch, and request limits can restrict but never grant authorization.
- `413` reports safe limit class without leaking another organization's use; quota exhaustion uses approved `409`/`429` contract.

## Retention, legal hold, and cleanup

POL-09 must define numeric periods and legal bases for:

- contract DNI;
- guarantor evidence;
- property media;
- branding originals/derivatives;
- exports;
- unattached pending/uploaded/verified objects;
- deletion receipts/audit;
- provider copies; and
- backups.

Cleanup workers:

- claim organization-scoped work durably/fairly;
- recheck association, state, retention, hold, organization lifecycle, and version immediately before deletion;
- mark logical access denied before physical deletion;
- delete idempotently by exact registered provider/bucket/path;
- treat not-found as reconciled only after identity checks;
- write a deletion receipt and usage compensation;
- retry safe transient failures with bounded backoff;
- move permanent/unknown failures to visible blocked/dead-letter state; and
- never enumerate/delete by an unresolved client prefix.

Legal hold blocks purge but does not grant view access. Organization deletion coordinates Storage and MT-SPEC-08 exported-copy receipts before finalization.

## Legacy storage migration

### Inventory

Inventory every:

- `contract-dni` and `contract-evidence` object;
- stored contract JSON bucket/path reference;
- property Storage object/path and upload log;
- Drive property folder/file and public ACL;
- branding/static asset intended for organization identity;
- orphan, duplicate, missing, mismatched, or unreferenced object; and
- backup/export copy within migration scope.

### Ownership decisions

- Verified existing production data maps only to Azar under POL-01/MT-SPEC-10.
- Stored contract entry/submission relationship plus object metadata/path is evidence, not automatic trust.
- Browser agent metadata or path prefix alone is not ownership proof.
- Ambiguous/missing/mismatched/orphan objects enter restricted quarantine with no customer access.
- Nothing is assigned to Solar merely because it has no Azar mapping.

### Registration and move/copy

- Create registry rows with migration actor, evidence source, checksum/metadata, and retention class.
- Preserve historical submission/revision association without editing immutable history; use migration association/mapping tables where necessary.
- New organization-prefixed object is copied/verified before authoritative association changes.
- Compare bytes/checksum/type and test authorized view.
- Record old-to-new mapping and rollback/cleanup state.
- Remove old object only after retention/hold, mapping, application cutover, and backup requirements pass.
- Legacy compatibility resolver is Azar-only, read-only, monitored, and time-bounded.

Drive public ACL removal/exported-copy reconciliation is completed with MT-SPEC-08. No second organization is enabled while a legacy global/bearer path can expose assets.

## API contracts

Routes are representative; domain-specific owners may namespace further while preserving contracts.

```text
POST   /api/organizations/:organization_id/asset-upload-sessions
GET    /api/organizations/:organization_id/asset-upload-sessions/:upload_session_id
POST   /api/organizations/:organization_id/asset-upload-sessions/:upload_session_id/reissue
POST   /api/organizations/:organization_id/asset-upload-sessions/:upload_session_id/finalize
POST   /api/organizations/:organization_id/asset-upload-sessions/:upload_session_id/revoke

GET    /api/organizations/:organization_id/assets/:asset_id
POST   /api/organizations/:organization_id/assets/:asset_id/view
POST   /api/organizations/:organization_id/assets/:asset_id/download
DELETE /api/organizations/:organization_id/assets/:asset_id
```

External contract upload/view endpoints remain under the exact entry/role capability namespace and internally consume the same asset service.

### Representative upload response

```json
{
  "upload_session_id": "00000000-0000-0000-0000-000000000000",
  "expires_at": "2026-08-18T12:10:00.000Z",
  "uploads": [
    {
      "asset_id": "00000000-0000-0000-0000-000000000000",
      "upload_intent_id": "00000000-0000-0000-0000-000000000000",
      "upload_url": "https://storage.example/signed-upload",
      "required_headers": {
        "content_type": "image/jpeg"
      }
    }
  ]
}
```

`upload_url` is deliberately transient and accepted only in this immediate response. It is removed from form state after use.

### Errors

- `400 INVALID_REQUEST`, `UNKNOWN_RECEIVER`, `MIME_NOT_ALLOWED`, `ASSET_METADATA_MISMATCH`.
- `401` missing/invalid identity or external capability.
- `403` missing capability.
- generic `404` for missing/cross-organization asset/session/owner.
- `409 UPLOAD_SESSION_CONSUMED`, `ASSET_ALREADY_ATTACHED`, `ASSET_STATE_CONFLICT`, `VERSION_CONFLICT`.
- `410 UPLOAD_SESSION_INVALID` for expired/revoked external-safe flows.
- `413 FILE_TOO_LARGE` or `BATCH_TOO_LARGE`.
- `423 ASSET_QUARANTINED`, organization lifecycle lock, or legal-hold deletion block as disclosure permits.
- `429` rate/quota limit with safe `Retry-After`.
- `503 STORAGE_UNAVAILABLE`, `ASSET_VERIFICATION_UNAVAILABLE`, or `SCANNER_UNAVAILABLE`.

## Frontend requirements

- Existing file receivers remain passive until explicit save/submit where their SPEC requires it.
- Selected local files show accessible filename/type/size/preview/remove/reorder/cover states.
- Upload progress is per file and aggregate, without logging signed URLs.
- Successful upload promotes `File` state to stable `asset_id`; retry does not re-upload it.
- Finalization/association ambiguity triggers durable owner/schema refresh.
- Cross-organization switch/logout cancels in-flight requests and removes signed URLs, previews, pending uploads, and cached asset data.
- All query/mutation/draft keys include immutable organization and owner identifiers.
- View/download is requested on demand; signed URL is kept in memory only and allowed to expire.
- Expired URL refresh reauthorizes; it does not reuse an old URL.
- Quarantine/scanning/verification/expired/removed/failed states have clear text and accessible live feedback.
- Private bucket/path/checksum/internal errors never appear in UI.

## Audit, privacy, observability, and recovery

- Audit upload initialization/finalization/rejection, association, view/download issuance for sensitive classes, quarantine, branding approval, deletion, migration, and support access using safe IDs/action/state.
- General audit/logs omit filenames when sensitive, all paths/URLs/tokens/content, raw metadata, and provider errors.
- Access to DNI/evidence is particularly sensitive and follows least privilege and approved retention.
- Metrics cover issued/uploaded/verified/quarantined/attached/unattached/deleted bytes/count, verification/scanner latency, cleanup backlog/failure, URL issuance denial, and cross-organization attacks with bounded labels.
- Alerts cover anomalous download/presign rates, repeated mismatches, quarantine spike, cleanup/deletion failure, public bucket/ACL detection, and cross-organization success.
- Backups/logical exports preserve registry/association/checksum/retention/hold/deletion mappings.
- Restore reapplies deletion tombstones/holds and validates object existence/scope before view issuance.
- Missing/mismatched restored objects remain inaccessible and enter reconciliation.

## Expected behavior

### Contract evidence case

1. Valid client role capability resolves the exact Azar entry/role.
2. Receiver descriptors are validated against SPEC-11/14/17 policy.
3. Durable session/intents/assets commit with Azar scope and generated paths.
4. Browser uploads privately.
5. Finalize verifies actual objects.
6. Role submission transaction rechecks and associates asset IDs.
7. Administrator later requests an authorized short-lived view without seeing path/bucket.
8. Solar member/entry token cannot issue or use any Azar asset capability.

### Property media case

1. Active member creates an Azar property draft under SPEC-30.
2. Asset session is bound to that draft/member/organization.
3. Verified images/videos attach to revision 1 with order/cover.
4. A later reorder creates a new property revision and immutable associations.
5. MT-SPEC-08 exports private copies using tracked receipts without changing canonical Storage ownership.

### Edge cases

- Two instances finalize one intent: one transition succeeds; replay returns existing safe state.
- Upload succeeds but submission fails: asset remains unattached until retry or cleanup grace.
- Client lies about MIME/bytes: mismatch rejects/quarantines.
- Same object/asset appears twice: uniqueness and association validation reject duplication.
- Old signed URL is used after membership removal: URL lifetime bounds exposure; new issuance denied; sensitive proxy access stops immediately.
- Organization suspends mid-upload: finalization/association follows POL-11 and fails/blocks safely.
- Asset ID/path from Solar is submitted to Azar: generic rejection, no side effect.
- Scanner/storage unavailable: asset never becomes usable without approved result.
- Cleanup races with association: lock/version/state recheck preserves attached asset.
- Deletion encounters missing object: reconcile exact registered identity and record receipt.
- Legacy reference has no object: quarantine/missing evidence, never fabricate attachment.

### Required failures

- Public bucket or `anyone` Storage access.
- Process-local production upload authority.
- New client-supplied bucket/path authority.
- Upload URL/path/token persistence or logging.
- Cross-organization/cross-owner/cross-receiver association or URL issuance.
- View based only on asset UUID/path.
- Attachment before verification.
- Historical association mutation.
- Cleanup of attached/held/in-scope asset.
- Public branding of unapproved original.
- Automatic legacy assignment from path/agent metadata.
- Provider export treated as canonical.

## Affected contracts and files

### Database

- Forward migrations for `media_assets`, `asset_upload_sessions`, `asset_upload_intents`, explicit association/mapping tables, and `asset_deletion_receipts`.
- Composite organization constraints, indexes, RLS, grants, scoped functions, and Storage bucket/policy validation.

### Backend

- Add unified asset registry/repository, receiver-policy, session, verification, association, view/download, quota, cleanup, branding, and migration services.
- Refactor contract DNI/evidence and property Storage adapters to consume unified asset IDs.
- Remove the property in-memory upload-session authority after durable cutover.
- Restrict service-role Storage client creation under SPEC-28.

Expected current areas include:

- `backend/src/services/contractDniUploadService.ts`
- `backend/src/services/contractEvidenceUploadService.ts`
- `backend/src/services/supabaseStorageService.ts`
- `backend/src/services/mediaUploadSessionService.ts`
- `backend/src/routes/contractEntries.ts`
- `backend/src/routes/properties.ts`
- `backend/tests/`
- `supabase/migrations/`

### Frontend

- Replace stable bucket/path references with asset IDs in contract/property public types and services.
- Preserve receiver validation, progress, previews, stable retry, order/cover, and accessible states.
- Add on-demand authorized asset view/download services and branding projection consumption.

### Documentation and operations

- Update architecture, API, environment, external services, testing, engineering, privacy/retention, storage, backup/restore, migration, support, and incident docs.
- Add orphan cleanup, quarantine review, deletion failure, public-resource detection, migration mapping, and Storage outage runbooks.

## Implementation sequence

### Phase 1 — approve policies and owner interfaces

- Approve retention, receiver registry, path/bucket plan, content/scanning policy, branding derivatives, quota behavior, and contract/property association interfaces.
- Inventory current objects/references/provider copies.

### Phase 2 — additive registry and test harness

- Add tables, constraints, RLS/grants, private bucket validation, and Azar/Solar fixtures.
- Add Storage emulator/staging adapter contract tests and no-real-provider unit tests.

### Phase 3 — unified services

- Implement durable session/intents, signing, verification, associations, view/download, usage, cleanup, deletion, and telemetry.
- Integrate contract/property flows behind staged flags without weakening old authorization.

### Phase 4 — frontend and branding

- Migrate public payloads/forms to asset IDs.
- Add verified/quarantine/retry states and public branding derivative delivery.
- Prove cache/switch/logout isolation.

### Phase 5 — legacy migration and provider handoff

- Register/copy/verify Azar assets, quarantine ambiguity, preserve mappings/history.
- Coordinate Drive/private copy/ACL remediation with MT-SPEC-08.
- Keep Solar blocked through MT-SPEC-10 certification.

## Migration, compatibility, and rollback

### Compatibility

- Existing `{ filename, mimeType, size, storagePath, storageBucket }` contract JSON remains immutable historical data.
- During a bounded Azar-only transition, a mapping resolver may convert a validated legacy reference to a registry asset; it cannot authorize arbitrary paths.
- New writes use asset IDs after cutover.
- Legacy signed-view behavior is removed only when all reachable references are registered/quarantined and tests pass.

### Rollback

- Database migrations are forward-only.
- Never restore public buckets, client path authority, or process-local sessions as rollback.
- If registry/verification is unavailable, fail affected issuance/finalization closed while preserving existing verified associations.
- Do not delete old objects until new mapping, checksum, authorization, restore, and retention evidence passes.
- Restores follow SPEC-28 tombstone/hold/reconciliation gates.

## Required tests

### Unit and policy tests

- Receiver registry parity for SPEC-11/14/17.
- Path generation/sanitization and absence of PII/token components.
- Principal/capability/owner authorization.
- MIME/size/count/pair/group/checksum/content policy.
- Session/intent state, expiry, reissue, revoke, idempotency, concurrency.
- Property order/cover and branding validation/derivation.
- Retention/hold/cleanup/deletion decisions.
- Redaction and safe download disposition.

### Real-database/RLS tests

- Clean/upgrade migrations and composite constraints.
- Azar/Solar association attacks across every table/domain.
- Anonymous/member/external-role/API-key/support/system access matrices.
- Append-only historical associations/receipts.
- Concurrent finalize/associate/cleanup/delete races.
- Atomic association/audit/usage/domain commits.
- Organization-leading cleanup/query plans and service-role assertions.

### Storage integration tests

- Signed upload only for exact generated private target.
- Actual object missing/MIME/bytes/path/checksum mismatch.
- Duplicate, replaced, expired, consumed, cross-session, cross-owner object.
- Multi-instance upload/finalization.
- Short-lived view/download authorization and path omission.
- Bucket privacy and forbidden direct list/read/delete.
- Scanner/detection unavailable/quarantine behavior with safe test fixtures.
- Idempotent physical deletion and receipts.

### Domain/frontend tests

- Contract DNI required pair and evidence receiver limits/minimums preserved.
- Contract correction retry does not re-upload verified assets.
- Property draft/revision order/cover/history.
- Branding original/approved derivative/retirement.
- Organization ID in query/mutation/draft keys and switch/logout cleanup.
- Accessible selection, validation, progress, removal, reorder, cover, verification, quarantine, error, and download states.

### Migration/recovery tests

- Legacy Azar mapping, copy/checksum, immutable-history association, compatibility resolver, and cleanup.
- Missing/mismatch/orphan/duplicate ambiguity quarantined.
- No legacy artifact becomes Solar/global.
- Logical Azar export contains no Solar assets/mappings and vice versa.
- Restore reapplies holds/deletions and blocks missing/mismatched objects.
- Exported-copy receipts coordinate with MT-SPEC-08.

Automated tests use disposable Storage/database and generated non-sensitive fixtures. They never use real customer documents, production buckets, signed URLs, or provider credentials.

## Acceptance criteria

This SPEC is complete only when:

1. Required SPEC-25 policies, MT-SPEC-03 context, SPEC-28 controls, and contract/property owner interfaces are approved.
2. All thirty-four asset invariants are approved and traceable.
3. `media_assets`, durable upload sessions/intents, explicit associations, and deletion receipts exist with non-null organization scope.
4. Composite constraints/RLS/grants/service-role assertions reject every Azar/Solar cross-reference.
5. Every new Storage path is organization-prefixed, server-generated, unique, and free of PII/tokens.
6. Every bucket is private and browser direct list/read/delete is denied.
7. Clients use asset/intent/session IDs rather than raw bucket/path authority.
8. Upload sessions are distributed, expiring, purpose-bound, idempotent, revocable, and single-use.
9. URL issuance revalidates principal, owner, organization state, capability, rate, quota, receiver, count, MIME, and size.
10. Finalization verifies actual exact object existence/path/MIME/bytes and checksum/detected type where required.
11. Missing/mismatched/duplicate/expired/consumed/cross-owner objects cannot attach.
12. Contract DNI pair and evidence receiver behavior from SPEC-11/14/17 is preserved in backend/frontend tests.
13. Property asset order/cover and immutable revision association pass SPEC-30 tests.
14. Domain association is atomic with required event/audit/usage state.
15. Historical associations cannot be mutated/deleted by ordinary application paths.
16. View/download issuance repeats current member or external-role authorization and omits path/bucket/internal metadata.
17. Signed URLs are short-lived, memory-only, redacted, and never persisted/logged/cached as durable state.
18. Content detection/disposition and approved scanning/quarantine policy are implemented/tested.
19. Unsafe active content fails closed unless separately approved/transformed.
20. Branding originals remain private and only approved sanitized derivatives are publicly delivered.
21. Verified byte/count usage and reservation/compensation are idempotent.
22. POL-09 defines numeric retention/legal basis for every required asset class.
23. Cleanup rechecks state/association/hold/version and cannot delete attached/held assets.
24. Logical denial precedes physical deletion and deletion is idempotent with receipts.
25. Organization deletion, export, backup, and restore preserve hold/tombstone/deletion/association semantics.
26. General audit/log/metrics contain no raw content, path, URL, token, credential, or unnecessary PII.
27. Legacy objects/references/provider copies have a complete ownership/integrity/public-access inventory.
28. Verified legacy production assets map only to Azar; ambiguity is quarantined.
29. Copy/move mapping verifies checksum/type/bytes and preserves immutable history before old-object cleanup.
30. Legacy compatibility is bounded Azar-only and cannot authorize arbitrary/global paths.
31. MT-SPEC-08 tracks/remediates private exported copies and removes public Drive access before Solar.
32. Multi-instance, concurrency, quota, cleanup, deletion, recovery, and Azar/Solar adversarial suites pass.
33. Frontend preserves existing receiver/media UX and accessible states while using asset IDs.
34. Organization switch/logout cancels and removes/partitions signed URLs, previews, upload state, and cached asset data.
35. Current property in-memory upload-session authority is retired after durable cutover.
36. No automated test calls production Storage/Drive or uses customer files/secrets.
37. Canonical architecture, API, environment, external-services, testing, engineering, privacy/retention, storage, operations, migration, backup/restore, and support docs are updated.
38. A traceability matrix links each criterion to migration, code, tests, docs, evidence, and reviewer.
39. Production remains contained Azar-only; no asset is assigned to Solar by this SPEC.
40. Product, security, data, backend, frontend, operations, storage/integration, and privacy/legal owners approve completion.

## Completion gate and handoff

Passing SPEC-31 means every live application file can be represented by verified organization ownership, every upload/view/delete path is governed by the unified asset model, and private Storage isolation is proven. It does not mean legacy production objects have been migrated or external Drive copies remediated.

MT-SPEC-08 may complete when:

- canonical asset IDs/associations are stable;
- provider export receives organization/asset context, not raw caller paths;
- exported-copy receipt/deletion interfaces are defined;
- private canonical Storage remains authoritative;
- no adapter can create public Drive access; and
- ambiguous provider outcomes can reconcile against stable asset/resource IDs.

MT-SPEC-10 may cut over assets only after inventory, mapping/quarantine, copy/checksum, ACL remediation, cleanup, restore, and Azar/Solar certification pass.

## Required deliverables

- Approved SPEC-31 / MT-SPEC-07.
- Asset schema/migrations/RLS/grants/indexes/scoped RPC evidence.
- Versioned receiver-policy registry with existing contract parity.
- Durable upload/session/intent/finalization services.
- Domain association contracts for contracts, properties, branding, and exports.
- Private authorized view/download and safe content handling.
- Property order/cover and branding derivative implementation.
- Usage/quota, retention/hold, cleanup/deletion, audit/observability/recovery integration.
- Legacy object/reference/provider-copy inventory and mapping/quarantine tooling.
- Unit, real-database, Storage, domain, frontend, accessibility, migration, recovery, and adversarial tests.
- Canonical documentation/runbooks and acceptance traceability.

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
rg -n "storagePath|storageBucket|storage_path|storage_bucket|signed.*url|uploadUrl|viewUrl" backend/src frontend/src
rg -n "contract-dni|contract-evidence|properties/|organizations/" backend/src frontend/src supabase/migrations
rg -n "mediaUploadSessionService|new Map" backend/src
rg -n "type: 'anyone'|permissions.create|webViewLink" backend/src
rg -n "organization_id|media_assets|asset_upload_sessions|asset_upload_intents" backend/src frontend/src supabase/migrations
```

No root `package.json` or `docs:check` script currently exists. Until added, documentation verification uses required-section/reference review, Markdown checks, `git diff --check`, and backend/frontend commands above.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Private bucket is mistaken for record authorization | Registry/association checks on every action; path only defense in depth |
| Browser forges path or metadata | Server generates target and verifies live object/type/bytes/checksum |
| Service-role bypass exposes another organization | Required scope, composite constraints, returned-row assertions, adversarial tests |
| Upload succeeds but association fails | Durable unattached state, retry grace, safe cleanup |
| Cleanup races with association | Transactional state/lock/version/hold recheck |
| Signed URL survives revocation briefly | Minimum TTL; sensitive proxy delivery; new issuance denied immediately |
| Active content executes in browser | Deny/transform, detection, safe disposition, CSP/sandbox, quarantine |
| Malware scanner unavailable | Explicit category policy and fail-closed quarantine where required |
| Usage is double-counted on retry | Reservation/finalization idempotency and compensation events |
| Legacy path is incorrectly assigned | Azar-only evidence review; ambiguity quarantine; checksummed mapping |
| Copy/move breaks historical evidence | Immutable mapping/association and verify-before-switch/delete |
| Public Drive copy bypasses app | MT-SPEC-08 private ACL remediation and exported-copy registry |
| Retention deletes legally held evidence | Hold precedence and pre-delete revalidation |
| Storage restore resurrects deleted asset | Tombstones/deletion state reapplied before issuance |

## References

### Multi-tenant source documents

- `docs/09-roadmap/specs/research/23-RESEARCH-multi-tenant-saas-architecture.md`
- `docs/09-roadmap/specs/research/24-RESEARCH-multi-tenant-saas-specification-roadmap.md`
- `docs/09-roadmap/specs/pending/25-SPEC-multi-tenant-policy-threat-model-containment-and-inventory.md`
- `docs/09-roadmap/specs/pending/26-SPEC-multi-tenant-organizations-memberships-onboarding-and-lifecycle.md`
- `docs/09-roadmap/specs/pending/28-SPEC-multi-tenant-database-enforcement-audit-abuse-observability-and-recovery.md`
- `docs/09-roadmap/specs/pending/30-SPEC-multi-tenant-properties-submissions-modifications-and-management.md`

### Previous project SPECs used for behavior and format

- `docs/09-roadmap/specs/completed/10-SPEC-contract-generation-reworked.md`
- `docs/09-roadmap/specs/completed/11-SPEC-contract-generation-reworked.md`
- `docs/09-roadmap/specs/completed/13-SPEC-contract-generation-reworked.md`
- `docs/09-roadmap/specs/completed/14-SPEC-contract-generation-reworked.md`
- `docs/09-roadmap/specs/completed/15-SPEC-contract-generation-reworked.md`
- `docs/09-roadmap/specs/completed/17-SPEC-contract-generation-reworked.md`

### Repository guidance and canonical documentation

- `references/llm-guide.md`
- `references/documentation-structure-guide.md`
- `docs/prd.md`
- `docs/01-overview/project-overview.md`
- `docs/01-overview/architecture.md`
- `docs/02-setup/environment.md`
- `docs/02-setup/external-services.md`
- `docs/05-integrations/api-contracts.md`
- `docs/06-testing/testing-strategy.md`
- `docs/07-development/engineering-standards.md`

---

Status: pending prerequisite specifications plus product, security, data, backend, frontend, operations, storage/integration, and privacy/legal approval. Author: redacted.
