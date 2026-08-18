# SPEC-29 / MT-SPEC-05 Multi-tenant SaaS — contracts, external links, revision history, assets, branding, and templates

**Date:** 2026-08-18
**Priority:** critical, core customer domain
**Status:** pending prerequisite implementation and policy approval
**Roadmap identifier:** MT-SPEC-05
**Dependencies:** MT-SPEC-02 through MT-SPEC-04 and the shared asset contract in MT-SPEC-07
**Blocks:** contract-domain completion and final Azar/Solar certification in MT-SPEC-10

---

## Specification identity

**Name:** End-to-end multi-tenant contract creation, administration, revisions, external participation, files, branding, and templates.

**Description:** Convert every contract behavior into an organization-owned workflow while preserving external user/client links, immutable correction history, private evidence, existing validation and inspection behavior, status/generation functions, and safe tenant-specific branding.

**Why it is necessary:** Contracts are durably stored today, but access depends on an individual creator, null legacy rows are visible globally, lists are loaded without database tenant scope, external links and provider behavior are not organization-aware, token hashes live on entries, and administrative corrections lack complete actor and optimistic-concurrency semantics. These weaknesses can expose Azar records to Solar or overwrite history even after an organization layer is added elsewhere.

## Summary

Every contract entry becomes an aggregate owned by one non-null `organization_id`. The organization—not its creator—is the security owner. `created_by_user_id` and `assigned_to_user_id` remain typed attribution/workflow fields inside that tenant and cannot substitute for ownership.

All member operations consume SPEC-27's `OrganizationRequestContext`; API-key, external-link, support, and worker operations use their separate typed contexts. Repository methods and database functions require organization ID, use composite tenant relationships from SPEC-28, and push organization filter, visibility policy, search, filters, stable sorting, and bounded cursor pagination into SQL. Cross-tenant UUIDs return generic `404` and create no side effect.

External user/client access is represented by separate hashed, expiring, revocable `contract_access_links`, each bound to one organization, entry, role, and allowed operation set. A raw link may optionally be exchanged for a short-lived entry-scoped HttpOnly capability session so the token can be removed from the address bar. Link holders cannot list contracts, enter the dashboard, switch organizations, or attach/view another entry's assets.

Each role submission or authorized correction appends an immutable `contract_submissions` revision. The contract entry keeps current projection references for fast reads. One transaction validates the complete result, inserts the revision, advances the projection and aggregate version, records actor-aware domain/audit events, and creates required outbox intents. Stale `expected_version` updates return `409`; historical submissions are never overwritten.

Contract DNI, salary receipt, guarantor evidence, generated documents, and future attachments use SPEC-31's organization-owned asset model. APIs return asset metadata and short-lived views only after organization, entry, role, and asset association checks; raw storage paths and provider IDs are not public contracts.

Hard-coded Azar branding is replaced with the entry organization's approved public branding and safe platform fallbacks. Contract schemas become immutable versioned templates: global templates are explicitly global, tenant templates are organization-owned, organization enablement is explicit, and every entry permanently references the template version used at creation.

This document defines the implementation contract. It does not migrate existing entries/files/tokens, publish a production template, rotate live links, or enable Solar; SPEC-34 owns migration and final cutover.

## Authority and relationship to other specifications

This is the fifth formal implementation SPEC derived from:

- `docs/09-roadmap/specs/research/23-RESEARCH-multi-tenant-saas-architecture.md`;
- `docs/09-roadmap/specs/research/24-RESEARCH-multi-tenant-saas-specification-roadmap.md`;
- `docs/09-roadmap/specs/pending/26-SPEC-multi-tenant-organizations-memberships-onboarding-and-lifecycle.md`;
- `docs/09-roadmap/specs/pending/27-SPEC-multi-tenant-identity-sessions-authorization-apis-and-frontend-context.md`;
- `docs/09-roadmap/specs/pending/28-SPEC-multi-tenant-database-enforcement-audit-abuse-observability-and-recovery.md`; and
- `docs/09-roadmap/specs/pending/31-SPEC-multi-tenant-private-assets-uploads-retention-and-storage-migration.md`.

SPEC-26 owns organizations, roles, fixed capabilities, membership lifecycle, organization-wide versus assigned-only policy selection, and public branding settings. SPEC-27 owns sessions, principal separation, context middleware, API errors, cursors, and frontend organization isolation. SPEC-28 owns composite constraints, RLS/service-role enforcement, audit, limits, quotas, observability, and recovery. SPEC-31 owns asset lifecycle, uploads, verification, signing, retention, and storage migration. This SPEC defines how contracts consume those guarantees.

SPEC-32 owns tenant-specific generated-document, Google/Make, outbox, worker, secret, and provider delivery. Contract transactions create outbox intent; they do not invoke a global provider destination directly. SPEC-33 owns advanced plan/custom-domain features. SPEC-34 owns Azar backfill, null-owner removal, legacy-link/resource remediation, compatibility retirement, and adversarial release certification.

The completed SPEC-09 through SPEC-22 contract series remains the functional baseline for schemas, two-party roles, computed fields, partial completion, repeated tenants/guarantors, DNI/evidence uploads, inspection ordering, manual entry creation, stable links, status actions, generation trigger, archive, edit forms, authentication UX, and contract management presentation. This SPEC preserves those functions unless it explicitly strengthens ownership, history, authorization, or privacy.

## Current repository context

The existing implementation contains these concrete migration targets:

- `contract_entries` has no `organization_id`, assignment, aggregate version, current template-version foreign key, or current revision foreign keys.
- `created_by_user_id` is nullable text, and legacy null rows are intentionally visible to every authenticated administrator.
- `listEntries()` fetches the global collection in batches of 1000 and filters in JavaScript.
- `findEntry`, `listSubmissions`, archive, status, generation, token replacement, and submission RPCs do not require organization ID.
- RLS is enabled, but the service-role repository bypasses it and depends on application correctness.
- `contract_submissions` is unique on `(entry_id, role)`, while corrections update/replace rather than provide a fully typed immutable revision chain.
- User/client token hashes are columns on the entry and have no explicit expiry, status, prefix, creator, last use, or independent revocation record.
- Current authorization may use global API key, application `isAdmin`, compatibility headers, creator identity, or role token.
- Entry summaries and inspections lack aggregate version, assignment, template version, actor-aware current revision metadata, and organization-safe asset handles.
- DNI/evidence types include raw `storage_path`, bucket, and public-path/provider details.
- Contract schema selection is environment/static configuration and existing public forms contain a hard-coded customer branding path.
- Status/generation updates can be direct table updates rather than one atomic domain transaction with event, audit, usage, and outbox intent.

This list supplements SPEC-25's executable inventory. Implementation must also inspect frontend cache keys, session token storage, Google Sheet/generation configuration, runtime audit files, tests, scripts, and every legacy route before cutover.

## Motivation

Adding an organization column is insufficient if a global list is still loaded, if a direct UUID lookup omits tenant scope, if an external token identifies an entry without its organization, if a signed file view trusts a raw path, or if a correction overwrites the evidence needed to explain who changed a contract. Contracts contain identity and financial evidence, so each path must preserve ownership and history under success, retry, concurrency, and failure.

Templates and branding also carry tenant boundaries. A schema change must not reinterpret old entries; an Azar logo must not appear in a Solar link; and a tenant-specific template cannot become visible or enabled for another organization through a global registry shortcut.

## Objective

Implement a contract aggregate whose ownership, member access, external participation, revisions, files, branding, templates, generation intent, UI state, and history are explicitly organization-scoped; whose state changes are atomic, actor-aware, idempotent, and concurrency-safe; and whose complete existing behavior passes same-tenant and Azar/Solar negative tests.

## Terminology

- **Contract entry:** Organization-owned aggregate coordinating template version, two external roles, current projections, status, assignment, assets, and generation state.
- **Contract role:** Existing external form role `user` or `client`; not an organization membership role.
- **Member actor:** Authenticated organization member acting through `OrganizationRequestContext`.
- **External actor:** Holder of one `ContractLinkContext` for one entry and role.
- **Current projection:** Fast-read pointer/snapshot of the latest accepted revision per role and combined state.
- **Submission revision:** Immutable validated role payload with monotonically increasing revision number and actor evidence.
- **Correction:** New revision created by an authorized member/support principal; never an update of prior revision content.
- **Access link:** Revocable credential record bound to one organization, entry, role, allowed operations, and expiry.
- **Capability session:** Optional short-lived HttpOnly cookie exchanged from a raw link and scoped to one link/entry/role.
- **Contract asset association:** Organization/entry/role/revision/field relationship to an asset owned by SPEC-31.
- **Template:** Logical contract form/document definition, either explicit global catalog content or one organization's private definition.
- **Template version:** Immutable schema, validation, presentation, branding behavior, and generation configuration snapshot.
- **Enablement:** Organization-scoped permission to create new entries from a published template version.
- **Aggregate version:** Positive optimistic-concurrency version on the entry.

New visible/persisted contracts use `snake_case`; environment variables use `UPPER_SNAKE_CASE`. Internal TypeScript follows repository conventions.

## Scope

### Includes

- Organization ownership and actor/assignment/version/template metadata for entries, submissions, events, links, and associations.
- Scoped repositories/RPCs, composite constraints, tenant-leading indexes, RLS, and service-role assertions.
- SQL list/search/status/creator/assignee/template/date filters with stable cursor pagination.
- Approved organization-wide or assigned-only record visibility and named capabilities for every contract operation.
- Create, list, detail, inspection, correction, submission, status, archive, generation, link, history, and attachment flows.
- Hashed external links, expiry, one-time raw display, regeneration/rotation, revocation, last-use, fingerprinting, rate limits, and optional capability sessions.
- Immutable role revisions and current projections with actor/concurrency semantics.
- Private DNI/evidence/generated-document association and signed views through SPEC-31.
- Safe public organization branding with platform fallback.
- Global versus organization-owned immutable template versions and organization enablement.
- Organization-aware API contracts, frontend routes, caches, drafts, mutations, and accessible states.
- Migration compatibility requirements consumed by SPEC-34.

### Excludes

- Organization/membership administration or role-capability registry ownership.
- Session, CSRF, support-grant, or API-key infrastructure beyond consuming SPEC-27 contexts.
- Generic asset upload/signing/retention/storage implementation owned by SPEC-31.
- Google/Make secrets, provider folders/Sheets, workers, and delivery reliability owned by SPEC-32.
- Legal drafting or approval of contract language.
- Arbitrary tenant-authored executable code, SQL, JavaScript, HTML, or unsafe template expressions.
- Editing a published template version or reinterpreting historical entries after schema changes.
- Public listing/search of entries or organization membership through external links.
- Physically deleting entries/revisions/events/assets outside approved retention/deletion/legal-hold workflows.

## Dependency and product-policy gate

Implementation/enablement requires:

1. SPEC-26's record visibility decision: `organization_wide` or `assigned_only`, including owner/admin oversight and assignment rules.
2. Stable contract capability keys in the SPEC-26 registry.
3. SPEC-27 contexts, current membership validation, step-up rules, errors, cursor convention, and frontend tenant routing.
4. SPEC-28 scoped repository/RPC, audit, rate-limit, quota, RLS, and idempotency infrastructure.
5. SPEC-31 asset association/upload/signing and retention contract, co-designed before contract file migration.
6. Decisions for link expiry defaults/maximums, capability-session use, link regeneration semantics, public branding fields, template publishing authority, correction permissions, archive/status transitions, and generated-document behavior.
7. A SPEC-34 migration manifest for existing entries/submissions/events/tokens/assets/templates/provider references.

Unknown policy denies the affected optional action. It cannot default to global visibility, permanent links, overwrite corrections, or public files.

## Non-negotiable contract invariants

1. Every active contract entry has one non-null `organization_id` after migration.
2. Every submission, event, access link, asset association, generation intent, and tenant template child repeats and matches its parent organization.
3. Organization ownership belongs to the customer, not creator, assignee, external role, email, slug, token, path, or provider ID.
4. Every member operation consumes current SPEC-27 context and a named capability.
5. Every repository/RPC operation requires `organization_id`; no optional scope or unscoped `find_by_id`/`list_all` remains.
6. Service-role use retains explicit tenant predicates and database assertions even with RLS.
7. Lists are filtered, searched, sorted, and paginated in SQL; the global collection is never loaded for application filtering.
8. Foreign UUIDs return generic `404`, do not reveal existence, and create no event, link, revision, asset view, provider intent, or other side effect.
9. Ownership/creator/assignment fields are server-derived or same-tenant validated; request values never assign ownership.
10. External credentials resolve one organization, entry, role, allowed operation set, and expiry.
11. Raw link tokens are displayed/transmitted only as necessary and never persisted/logged/audited/analysed.
12. Link holders never obtain dashboard membership, organization selection, list/search, unrelated record, or unrelated asset access.
13. Link rotation/revocation invalidates the predecessor according to approved overlap policy and is concurrency-safe.
14. Every accepted initial submission or correction appends an immutable revision.
15. Current projections point to verified revisions and are updated in the same transaction.
16. Historical submissions/events are never edited to represent a new correction.
17. Every revision records role, number, predecessor, actor type/ID, request ID, time, and redacted summary.
18. Stale corrections/status/archive/link/template-sensitive changes return `409` and do not overwrite.
19. Entry, projection, revision, event, audit, usage, and outbox intent update atomically where the business action requires them.
20. Asset association requires matching organization, entry, role/revision/field purpose, and verified asset state.
21. Public APIs never expose raw storage paths, buckets, provider IDs, service credentials, or durable signed URLs.
22. Signed media is issued only after context plus current association authorization and remains short-lived/non-cacheable as required.
23. Public forms expose only approved branding; unsafe values are sanitized and platform fallbacks are deterministic.
24. Global templates live in explicit global tables; organization-owned templates always have non-null ownership.
25. Published template versions are immutable and entries permanently reference one exact version.
26. Retiring/disabling a template prevents new entry creation but never changes historical rendering/validation.
27. Existing schema validation, computed fields, inspection order, repeated roles, partial state, status, archive, generation, and upload requirements remain functional.
28. Frontend query/mutation/draft/token keys include immutable organization UUID and respect SPEC-27 context epochs.
29. Disabled/incomplete contract features are rejected in backend/workers as well as hidden in UI.
30. Audit/log/metrics contain actor/request/organization evidence without tokens, raw evidence, private paths, or unnecessary PII.

## Roles, capabilities, and record visibility

The canonical capability registry should provide named operations covering at least:

- `contracts.create`;
- `contracts.read`;
- `contracts.update`;
- `contracts.assign`;
- `contracts.change_status`;
- `contracts.archive`;
- `contracts.manage_links`;
- `contracts.view_history`;
- `contracts.view_assets`;
- `contracts.generate`;
- `contract_templates.read`; and
- `contract_templates.manage`.

Names may be consolidated only if the final route matrix remains least-privileged. Route code never compares role strings directly.

If policy is `organization_wide`, a capability permits organization-wide domain access subject to narrower restrictions. If `assigned_only`, member/viewer list/detail/mutation predicates require assignment/approved participation while owners/admins retain approved oversight. In both modes:

- `organization_id` is always the first boundary;
- creator/assignee cannot expose another organization;
- reassignment target must be an active membership in the same organization;
- removing/suspending a member preserves the contract and history;
- submit-on-behalf-of/support/API-key behavior requires a distinct context/capability and actor type; and
- external roles remain unrelated to membership roles.

## Data model

All tenant tables follow SPEC-28: UUIDs, UTC timestamps, non-null `organization_id` after migration, unique `(id, organization_id)`, composite child references, tenant-leading indexes, deny-by-default RLS, restricted functions, and no browser writes. Mutable aggregates use positive `version`; append-only rows do not update normally.

### `contract_entries`

Required fields include aggregate/organization UUIDs, optional tenant-unique `human_code`, fixed `template_version_id`, bounded `direccion`, approved status, current user/client submission pointers, combined projection, typed creator/updater, nullable same-tenant assignee, state timestamps, and aggregate `version`.

`schema_id` may remain temporarily for migration, but canonical behavior uses the fixed template version. `created_by` text is historical display only. Token hashes move to link rows. Existing filled flags/times/JSON are generated compatibility projections or replaced after consumers migrate.

Indexes lead with organization for created time, status, creator, assignee, template, and justified normalized search. No global index substitutes for tenant predicates.

### `contract_submissions`

Each row is an immutable role revision with organization/entry, `user` or `client`, positive `revision_number`, prior `supersedes_submission_id`, matching template version, complete validated payload, actor type and source-specific actor IDs, request/idempotency IDs, submitted time, initial/correction/migration kind, and redacted summary.

Actor types distinguish external user/client link, member, organization API key, support, and controlled migration. Exactly one actor-source shape is valid. The predecessor shares organization, entry, role, and prior number. Replace one-row-per-role uniqueness with unique revision numbering/current pointers. Normal flows cannot update/delete revision payloads.

### `contract_events`

Append-only tenant/entry events include type, aggregate version, actor/request, occurred time, safe reason, and bounded data. Cover create, submission/correction, completion, assignment, status/archive, link lifecycle, generation, assets, and template state. Domain events explain history; SPEC-28 audit records privileged/security activity. Neither stores raw tokens, sensitive values, paths, signed URLs, provider payloads, or credentials.

### `contract_access_links`

Each link has tenant/entry/role, token prefix plus keyed/peppered hash/version, allowed operations, active/revoked/expired/replaced state, mandatory bounded expiry, creator, throttled last-use, rotation chain, revocation evidence, and version. One effective link per entry/role is recommended unless an approved multi-recipient use case exists. Raw links are high entropy, shown/delivered once, never retrieved, and constant-time verified.

### Optional `contract_link_sessions`

If approved, exchange creates a short-lived opaque capability session containing only hashed token, parent link/organization/entry/role, expiry/use/revocation evidence. Use a dedicated narrow-path host-only Secure HttpOnly cookie and strip the raw URL token immediately. It cannot access dashboards, switch context, outlive its parent link, or survive rotation/revocation.

### `contract_asset_associations`

Store organization, entry, asset, optional submission revision, role, canonical schema field/purpose, ordinal, creation actor/time, and removal history. Composite constraints prove entry, revision, and asset share organization. Purposes cover DNI sides, salary receipts, guarantor evidence, generated documents, and approved attachments. Storage/provider metadata remains on the SPEC-31 asset, not public payloads.

### Template tables

`contract_templates` stores logical identity with explicit `global` or `organization` scope, ownership consistent with scope, stable key, display metadata, lifecycle, creator, and timestamps. Global templates carry no tenant; tenant templates require one.

Immutable `contract_template_versions` store version/state (`draft`, `published`, `retired`), contract type, ordered role schemas/fields/repeatables/subsections/uploads, validation/computed rules, safe presentation, generated-document configuration reference, fingerprint, author/publisher, and supersession. Publishing freezes content; corrections create a new version. Validation rejects executable expressions, unsafe HTML/URLs/CSS, duplicate/reserved fields, invalid uploads/computations, and unbounded structures.

`organization_contract_template_enablements` explicitly enables one global or same-tenant published version for one organization, with actor/time/state/version and only safe overrides. Global existence does not imply enablement. Disabling/retiring blocks new entries but never reinterprets history.

### Projection integrity

Current pointers reference submissions with the same organization, entry, role, and template. Derived flags/times/combined projection update in the same transaction or rebuild deterministically. Reconciliation detects pointer, payload, revision, and status disagreement without broadly exposing content.

## Database functions and repositories

Every method begins with organization scope and actor context. Required operations cover scoped create/find/list/history, append revision, archive/status/generation, assignment, and link rotation/revocation. Organization is never optional. The service-role client stays private to scoped repositories.

Database functions accept organization, entry, actor/request/idempotency/version; lock the scoped aggregate; assert parent/child tenant; validate state/concurrency; atomically commit revision/projection/event/audit/usage/outbox intent; and return safe results. Remove unscoped `listEntries()`, `findEntry(entryId)`, raw status updates, and RPCs whose only ownership input is entry UUID.

## List, search, detail, and inspection

SQL applies organization, visibility policy, status/creator/assignee/template/date filters, bounded address/code search, allowlisted stable sorting defaulting to `(created_at desc, id desc)`, and SPEC-27 cursors/page limits. Never filter a global/full tenant collection in JavaScript. Counts remain tenant/visibility scoped.

Summaries include safe ID/code/address, fixed template, status/completion, creator/assignment, current revision times, archive/generation state, aggregate version, and permitted actions—not tokens, payloads, or raw assets.

After scoped authorization, detail preserves template inspection order, sections/subsections/repeatables/computed fields, partial state, current projections, safe revision/asset/event metadata, versions, and actions. History is separately capability-controlled and paginated. Full historical payload/assets require explicit authorization and retention eligibility.

## Contract creation

1. Require active member context and `contracts.create`.
2. Derive organization and actor server-side.
3. Verify the selected immutable template version is published and enabled.
4. Apply rate, quota, and idempotency controls.
5. Validate bounded metadata and same-tenant assignment.
6. Generate entry ID/code and secure role links.
7. Atomically create entry, links, event, audit/usage, and notification outbox intents.
8. Return raw links only once to the authorized creation response.

Same idempotency key/fingerprint returns the same result without duplicate links or notifications; changed fingerprint conflicts.

## External link lifecycle

Raw URLs use a fragment or immediate exchange that avoids logs/referrers. The frontend reads into memory, exchanges through a limited endpoint, replaces the address bar, and retains only capability cookie/in-memory context. Without capability sessions, use SPEC-27 Authorization rather than query tokens.

Resolution validates hash, state/expiry/role/operations, entry tenant/status/template, and abuse limits, then returns only public form configuration, approved reference/address, completion state, and safe branding.

External submission derives tenant/entry/role from `ContractLinkContext`, validates the complete fixed-template payload, finalizes scoped assets, requires idempotency, and atomically appends revision/projection. It cannot submit another role/entry. External correction is denied by default unless a newly issued correction-capable state/link is approved. Member correction requires `contracts.update`, visibility, full-result validation, `expected_version`, reason/summary, and an immutable revision.

Link rotation requires `contracts.manage_links`, entry version, role validation, and step-up if required. Rotation creates a successor and replaces predecessor atomically with no overlap by default. Revocation invalidates capability sessions. Invalid/expired/replaced links use generic responses. Never redisplay a link; rotate a lost one.

## Revision and state transactions

For submissions/corrections: lock by tenant/entry; verify expected version/context/capability/link/state/template; load current revision; validate the complete result; verify assets; allocate next role revision safely; insert immutable revision; advance projection; recompute completion/status; increment entry version/actor/time; append event/audit/usage/outbox; commit as one unit.

Status, archive, assignment, link changes, and generation use the same scoped lock/version/event discipline. Direct updates omitting version or evidence are forbidden. Implementation documents an explicit transition table preserving `open`, `complete`, `generar_contrato`, and `archived`. Archive is idempotent for the same version/state; reopening is disabled unless approved. Generation creates outbox intent and pending state, not proof of a generated document.

## Assets and signed media

All new uploads follow SPEC-31's draft/presign/verify/finalize flow. Contract authorization creates an organization/entry/role/field-scoped upload intent; completion independently verifies provider object metadata before association. A request cannot nominate an arbitrary storage path, bucket, provider file ID, organization, entry, or revision.

Before issuing a signed view, the backend validates the current member/link/support context, organization, entry visibility, association purpose/role, asset state, retention/legal hold, and requested disposition. External user/client links see only assets explicitly allowed for their role/step. Member inspection requires `contracts.view_assets`. Signed URLs are short-lived, response-only, private/no-store, and never persisted in submission payloads, query caches beyond expiry, audit, or analytics.

Replacing/correcting an attachment appends a new association/revision relationship while preserving historical evidence under retention policy. Disassociation does not immediately delete the asset; SPEC-31 owns reference counting, grace, quarantine, retention, and deletion. Generated documents are also assets and must be associated with the exact entry/template/current revision set that produced them.

## Public branding

External form/bootstrap responses expose only an approved organization public-branding projection: safe display name, verified logo asset handle/view, and allowlisted theme tokens. Never expose organization settings wholesale, provider configuration, internal slug/UUID unless required by the public contract, contact/member lists, custom HTML/CSS/JavaScript, or private asset paths.

Sanitize colors, URLs, text lengths, and logo types. Accessibility contrast/focus/error states remain usable regardless of tenant theme. If branding is absent, invalid, unavailable, or disabled, use reviewed platform defaults. Never fall back to Azar-specific branding for Solar. Branding is resolved from the entry organization after link authorization and may be snapshotted/versioned if legal/product policy requires historical rendering.

## Template lifecycle

### Create and draft

Authorized template managers may create organization templates only inside their tenant. Global templates require a separate platform-authoring context. Draft schemas are validated on every save, versioned for concurrency, unavailable for entry creation, and previewed only in the authoring scope using synthetic data.

### Publish

Publishing requires capability, expected draft version, complete schema/compatibility validation, safe generation configuration, actor/reason, and optional step-up/approval policy. It creates or freezes an immutable published version and emits audit/event evidence. Existing published content is never updated in place.

### Enable, disable, retire

Organization enablement requires the version to be published and either global or owned by that organization. Disablement prevents new entry creation but does not break existing entry forms/history. Retirement prevents new enablements/entries and does not change old entries. Whether an unfinished external role can complete after disable/retire is an explicit transition policy recorded at action time; default should preserve already-issued valid entries unless a security/legality reason revokes them.

### Compatibility and schema evolution

Every entry validates/renders with its fixed version. New required fields, option changes, computed rules, uploads, document mappings, labels, or ordering affect only new entries on a new version. Template tooling may compare versions and report breaking changes, but cannot migrate historical payloads silently. Any explicit entry migration needs a separate audited domain operation/spec and immutable before/after history.

## Generated contract behavior

`generar_contrato` and the existing generation trigger become an organization-scoped, version-checked domain action requiring `contracts.generate`. The transaction records generation request state and an outbox intent containing organization, entry, template version, current revision identifiers/fingerprints, requester, idempotency key, and integration-configuration reference.

SPEC-32 workers resolve only the entry organization's integration, produce the asset/provider outcome idempotently, and report queued/processing/succeeded/partially_failed/failed or approved states. Provider success is not inferred from status alone. Retrying a failed delivery does not create a new contract revision unless business data changed and cannot target another tenant's folder, Sheet, webhook, or secret.

## API surface

Representative member routes use the SPEC-27 organization namespace:

```text
POST   /api/organizations/:organization_id/contracts
GET    /api/organizations/:organization_id/contracts
GET    /api/organizations/:organization_id/contracts/:entry_id
GET    /api/organizations/:organization_id/contracts/:entry_id/history
POST   /api/organizations/:organization_id/contracts/:entry_id/revisions/:role
PATCH  /api/organizations/:organization_id/contracts/:entry_id/assignment
PATCH  /api/organizations/:organization_id/contracts/:entry_id/status
POST   /api/organizations/:organization_id/contracts/:entry_id/archive
POST   /api/organizations/:organization_id/contracts/:entry_id/generation
POST   /api/organizations/:organization_id/contracts/:entry_id/links/:role/rotate
POST   /api/organizations/:organization_id/contracts/:entry_id/links/:role/revoke
GET    /api/organizations/:organization_id/contract_templates
POST   /api/organizations/:organization_id/contract_templates
```

External exchange/schema/submission routes use a separate public/link namespace that never accepts organization authority from the caller. Asset operations follow SPEC-31 routes and carry canonical association intents.

Requests and responses use `snake_case`, bounded payloads, `request_id`, idempotency and `expected_version` where specified. Apply SPEC-27 errors: `401` missing identity/link credential, `403` known-context missing operation, generic `404` foreign/unknown resource, `409` stale/state/idempotency conflict, `410` only when revealing an already-resolved link/entry expiration is approved, `422` validation, `429` abuse control, and fail-closed `503` dependencies.

## Frontend behavior

Member contract management lives under `/t/:organization_slug/contracts`. Every query/mutation key begins with confirmed organization UUID and includes filters/entry/history/version as relevant. List filters/search/pagination are server-driven. Detail and modal state clear on tenant switch, membership loss, archive, logout, and context epoch change.

The UI preserves current behavior: manual entry creation, stable public role links, clean list display, selected-detail scrolling, schema-ordered inspection, partial roles, repeated tenant/guarantor sections, computed fields, DNI/evidence placement, correction forms, status/archive/generation actions, validation feedback, and accessible loading/success/error states.

Enhancements required by this SPEC include assignment and actor/revision history; version-conflict UI that preserves unsaved edits and allows refetch/review rather than overwrite; link expiry/state/rotate/revoke without redisplaying secrets; template/version selection and permitted management; asset views that expire safely; organization branding on external forms; and queued/generation state from canonical backend data.

External pages render only after link exchange/context validation, remove raw tokens from the URL, isolate role/entry/tenant caches and storage, and clear secrets on submit/revoke/expiry. A logged-in member cookie cannot union with link authority. Delayed Azar responses cannot render after a Solar switch.

## Migration and compatibility

SPEC-34 performs an additive migration:

1. Add nullable organization, version, actor, assignment, template, current pointer, link, association, and revision fields/tables.
2. Seed fixed Azar and a published immutable template version matching each existing schema configuration.
3. Backfill verified entries to Azar and fix template references.
4. Type/validate creator identities where possible; keep unknown attribution explicit rather than granting access.
5. Convert existing user/client token hashes into Azar `contract_access_links` with reviewed expiry/status policy without exposing raw values.
6. Convert existing initial submissions and administrative updates into ordered immutable revisions using events/audits/timestamps where evidence exists; quarantine ambiguity.
7. Derive event/submission/asset organization from the entry and verify zero mismatch.
8. Register/migrate DNI/evidence/generated documents through SPEC-31.
9. Run shadow scoped lists/details/history/projections and reconcile counts, IDs, hashes, samples, and links.
10. Apply final non-null, composite constraints, indexes, RLS, grants, and scoped RPCs.
11. Switch APIs/frontend/workers, invalidate legacy link capability/session state as policy requires, and remove global/null-owner paths.

Legacy adapters must authenticate canonically, resolve exactly one organization, call scoped services, emit last-use telemetry, and expire. Rollback never restores null-owner global visibility, unscoped list/filtering, raw-path access, or global provider destinations.

## Security, audit, privacy, and operations

- Audit every privileged create/read-sensitive/history/correction/assignment/status/archive/link/template/generation/asset action with organization, actor type/ID, request, result, reason, and safe changes.
- Treat contract payloads, DNI, income/guarantor evidence, tokens, and generated documents as sensitive; minimize display, logs, telemetry, support access, and exports.
- Rate-limit creation, link resolution/exchange/submission/rotation, signed views, corrections, generation, and template validation/publishing on appropriate tenant/principal/link/entry/IP keys.
- Apply quotas to entries, revisions, active links, uploads/storage, generated documents, and deliveries without allowing one tenant to exhaust shared capacity.
- Monitor cross-tenant denials, foreign UUID attempts, invalid-link rates, stale conflicts, projection mismatch, failed signing, generation backlog/failure, dead letters, and template-validation failures with bounded labels.
- Backups/restores preserve revision/link/asset/template relationships and do not replay completed generation/provider effects.
- Retention, legal hold, export, quarantine, and deletion include all contract revisions/events/links/link sessions/assets/generated documents and provider copies.

## Affected implementation areas

Expected changes include ordered migrations under `supabase/migrations/`; `backend/src/contracts/types.ts`; contract schemas/environment validation; `contractEntryRepository.ts`, `contractEntryService.ts`, token/auth/request-context, inspection, upload/view, audit/metrics, Google generation services; contract routes; shared organization/context/asset/outbox modules; all contract pages/components/hooks/APIs/cache keys/types; environment examples; and architecture/API/integration/testing/operations/migration docs.

Already-applied migrations are not edited. Add forward-only migrations and reconcile production history first.

## Implementation deliverables

1. Additive contract, link, revision, association, and template migrations.
2. Scoped repositories/RPCs and route/capability matrix.
3. Organization-owned entry/list/detail/history/correction/status/archive/generation services.
4. Hashed expiring role-link lifecycle and optional capability-session exchange.
5. Immutable template catalog/version/enablement validator and management flow.
6. SPEC-31 upload/association/signed-view integration.
7. Organization public-branding projection and platform fallback.
8. Organization-aware frontend routing, queries, mutations, conflicts, history, links, assets, and templates.
9. Migration/backfill/shadow/reconciliation tooling consumed by SPEC-34.
10. Real-database, storage, frontend, and Azar/Solar adversarial suites.
11. Updated architecture, API, schema, integrations, testing, operations, and support documentation.

## Test plan

### Unit tests

- Role/template schema validation including current repeated fields, subsections, uploads, computed dates, and invalid unsafe definitions.
- Link entropy, hash/pepper, expiry, allowed operations, rotation/revocation, and capability-session binding.
- Capability and organization-wide/assigned-only visibility predicates.
- Cursor/filter/sort validation and public error sanitization.
- Complete-result revision validation, numbering, predecessor, actor shape, redacted summaries, projection recomputation, and transition table.
- Branding allowlist/sanitization/fallback and template scope/version/enablement rules.
- Asset association purpose/role/revision validation and signed-view authorization.
- Frontend organization query keys, epoch guards, conflict handling, and token cleanup.

### Database integration tests

- Non-null ownership, unique `(id, organization_id)`, composite entry-child/asset/template constraints, and tenant-leading indexes.
- RLS positive/negative coverage using ordinary roles plus scoped service-role repository assertions.
- SQL pagination/search/filter/visibility with realistic data volume and no global list.
- Concurrent initial submissions, corrections, link rotations, assignment/status/archive/generation, and stale `expected_version`.
- Immutable revision/event/template enforcement and current-pointer consistency.
- Atomic rollback across entry, revision, event, audit, usage, asset association, and outbox failure.
- Idempotent retries return same result without duplicate revision/link/event/delivery.
- Global template versus tenant-template enablement isolation.

### Route and service tests

- Create/list/detail/inspection/history/correct/assign/status/archive/generate/link/asset/template operations for every applicable role/capability.
- Organization/creator/actor derived from typed context and caller ownership rejected.
- Foreign UUID yields generic `404` and zero side effects.
- External user/client links see and submit only their role/entry.
- Invalid, expired, revoked, replaced, replayed, or wrong-role links fail generically.
- Capability-session exchange strips token behavior and parent revocation when enabled.
- API-key/support actions retain their actor type/scope and never become member/link context.
- Signed media requires matching tenant/entry/role/association and reveals no raw paths.
- Generation creates the correct tenant outbox intent and never invokes a global destination.

### Frontend tests

- Tenant-scoped list/search/filter/cursor/detail under Azar and Solar.
- Direct URL and delayed-response tenant-switch isolation.
- Existing manual create, partial forms, repeated roles, inspection order, correction, status, archive, and generation UX.
- `409` correction conflict preserves user edits and does not overwrite.
- Link state/expiry/rotation/revocation never redisplays old raw values.
- External token removal, isolated cache/storage, branding, completion, expiry, and error states.
- Asset upload/view expiry and no raw-path rendering.
- Template selection/version/disablement and permission-aware controls.
- Logout, role downgrade, reassignment, suspension, and archive clear/invalidate state.

### Storage, provider, migration, and resilience tests

- Cross-tenant asset association/presign/complete/sign/delete attempts.
- Wrong bucket/path/provider metadata and orphan/unverified asset rejection.
- Existing Azar entry/submission/event/token/file/template backfill, resume, rerun, quarantine, and reconciliation.
- Shadow old/new projections/lists and immutable history checksums.
- Provider timeout, duplicate generation claim, retry, dead letter, restore, and no completed-effect replay.
- Load/performance for tenant-skewed lists/history/search and concurrent external submission.
- Rate/quotas in Solar do not throttle or expose Azar beyond approved shared fairness.

Automated tests use fake provider adapters and isolated database/storage fixtures. They never call production APIs.

## Acceptance criteria

1. Every active entry, submission, event, link, association, and generation record has verified organization ownership.
2. Composite constraints reject cross-tenant children, current pointers, assets, and tenant templates.
3. Every repository/RPC requires organization ID and actor/request context.
4. No global list or JavaScript post-filter authorization remains.
5. Lists apply tenant, visibility, filters, stable sorting, bounded cursor, and tenant-leading query plans in SQL.
6. Creator/assignee are typed attribution/workflow fields and never ownership.
7. Every member contract action uses SPEC-27 context and named capabilities.
8. Foreign Azar/Solar UUIDs return generic `404` with zero side effects.
9. Entry creation derives organization/actor and is idempotent.
10. Existing two-party forms, schemas, validation, computed fields, repeated items, partial states, inspection order, status, archive, generation, and upload requirements remain functional.
11. User/client credentials are independent hashed link records bound to one tenant/entry/role/operations.
12. Links have mandatory expiry policy, fingerprinting, rate limits, last-use, rotation, revocation, and one-time raw display.
13. Optional capability sessions are short-lived, HttpOnly, entry-scoped, URL-stripping, and parent-revoked.
14. External actors cannot list, dashboard, switch tenants, change roles, or access another entry/asset.
15. Every initial submission/correction appends an immutable numbered revision.
16. Revisions distinguish external user/client, member, API key, support, and migration actors.
17. Current projections, aggregate version, revision, event, audit, usage, and outbox intent update atomically.
18. Stale edits/status/archive/link/generation operations return `409` without overwriting.
19. Historical entries remain fixed to their exact template version.
20. Global and organization templates are structurally distinct and tenant enablements cannot cross organizations.
21. Published template versions are immutable; draft/published/retired and enable/disable behavior is tested.
22. Template validation prevents executable/unsafe/unbounded definitions.
23. DNI/evidence/generated documents use SPEC-31 associations and no public raw paths/provider IDs.
24. Signed views require tenant/entry/role/asset validation and expire safely.
25. Public forms show only sanitized entry-organization branding with neutral platform fallback, never another tenant's branding.
26. Generation is organization-scoped, version/idempotency aware, outbox-backed, and routed by SPEC-32.
27. Frontend queries, mutations, drafts, tokens, and responses include organization UUID/context epoch.
28. Azar/Solar switch/direct URL/cache/link/asset/history/provider negative tests pass.
29. Current users can access organization-owned contracts according to approved visibility while suspension/removal preserves ownership/history.
30. API errors/status codes, snake_case contracts, pagination, concurrency, no-store, and request correlation follow SPEC-27.
31. Audit, logs, and metrics include safe actor/tenant/request evidence without tokens, evidence contents, private paths, credentials, or unnecessary PII.
32. Rate limits/quotas/fairness cover create, links, submit, correct, sign, generate, and template actions.
33. Backup/restore preserves contract relationships without replaying completed provider effects.
34. SPEC-34 migrates or quarantines every legacy entry/submission/event/link/file/template and removes null-owner/global compatibility.
35. Unit, real-database, route, storage, frontend, migration, performance, recovery, and adversarial tests pass.
36. Canonical architecture, API, environment, integration, testing, operation, migration, and support docs match implementation.

## Verification commands and evidence

Implementation adds stable commands for contract schema/template validation, database constraint/RLS tests, route/frontend/storage tests, migration reconciliation, and Azar/Solar certification. Final verification includes equivalents of:

```bash
git status --short
git diff --check
rg -n "listEntries\(\)|findEntry\(entryId|legacy/no-owner|user_token_hash|client_token_hash|storagePath|publicPath" backend frontend
npm --prefix backend run typecheck
npm --prefix frontend run build
npm --prefix backend test
npm --prefix frontend test
supabase migration list
```

Because the repository currently has no root documentation-check script, use available Markdown/link checks and record the result; adopt `docs:check` if introduced later. Evidence binds code revision, migration head, role/capability/route matrix, template fingerprints, fixture IDs, feature flags, test results, provider destinations, and approvals.

## Documentation and traceability

- Map every roadmap scope item and acceptance criterion to migrations/code/tests/operations evidence.
- Maintain the route matrix with principal, capability/scope, visibility, tenant predicate, concurrency, audit, and tests.
- Maintain a template schema/version compatibility guide and safe authoring rules.
- Document link delivery/exchange/rotation/revocation and incident response without sample real tokens.
- Document asset purposes, retention, signed-view behavior, and generated-document state.
- Update pending/completed indexes only when implementation status changes.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Foreign entry lookup leaks data | Tenant-scoped lookup, generic `404`, RLS and negative tests |
| Global list/filter persists | SQL-scoped repository contract and query-plan tests |
| Creator mistaken for owner | Non-null organization ownership; creator only attribution |
| Correction overwrites evidence | Append-only revision plus current pointers and `expected_version` |
| External link grants broad access | Separate scoped context, expiry, operations, rate limits, revocation |
| Token leaks through URL/logs | Fragment/exchange, immediate stripping, hash-only storage, redaction |
| Asset path crosses tenants | Composite association and authorization before signing |
| Template update changes history | Immutable published version fixed on entry |
| Tenant template becomes global | Explicit scope checks and organization enablement constraints |
| Azar branding appears for Solar | Resolve after link tenant authorization with neutral fallback |
| Generation reaches wrong provider | Tenant outbox/configuration and destination-aware tests |
| Retry duplicates revision/delivery | Scoped idempotency, atomic transactions, provider reconciliation |
| Service role bypasses RLS | Required tenant repository predicates and database assertions |
| Legacy null rows remain visible | SPEC-34 backfill/quarantine, non-null enforcement, compatibility removal |

## Completion gate

MT-SPEC-05 is complete only when every existing contract function works independently for Azar and Solar through scoped repositories/RPCs; entries and all children have enforced ownership; immutable revision/actor/concurrency history is canonical; external links are isolated and revocable; private assets are associated/signed safely; branding is tenant-correct; template versions are immutable and tenant-enabled; and unit, route, real-database, storage, frontend, migration, provider, and adversarial tests pass.

It remains pending until SPEC-34 migrates or quarantines all legacy rows, links, and files; removes null-owner/global access and unscoped compatibility; and proves Solar cannot observe or affect Azar contracts through lists, direct URLs, links, history, assets, caches, generated documents, or provider destinations, and vice versa.

