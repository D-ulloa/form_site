# Multi-tenant SaaS specification roadmap — ten consolidated SPECs

**Date:** 2026-08-17

**Status:** proposed consolidated specification catalog

**Source:** 23-RESEARCH-multi-tenant-saas-architecture.md

## Purpose

This document condenses the complete multi-tenant SaaS implementation plan into exactly ten umbrella SPECs. No feature, security requirement, migration step, operational capability, or optional enterprise extension from the prior catalog has been removed. Related work has been grouped so each SPEC owns a coherent end-to-end outcome instead of fragmenting one outcome across many documents.

The implementation term for a SaaS customer such as Azar or Solar is organization. Existing contract fields whose names start with tenant continue to mean the rental tenant or inquilino.

## Rules for the ten formal SPECs

Each formal SPEC must include the portions of this checklist that apply to its scope:

- goals, non-goals, terminology, policy decisions, and affected files;
- database tables, constraints, indexes, RLS, functions, migrations, and rollback;
- API requests, responses, errors, authentication, authorization, and pagination;
- frontend routes, states, accessibility, cache partitioning, and failure recovery;
- security invariants and negative Azar/Solar authorization cases;
- actor attribution, immutable history, audit events, redaction, logs, and metrics;
- idempotency, retries, concurrency, quotas, and provider reconciliation;
- unit, integration, real-database, provider, and end-to-end tests;
- deployment order, dual-write or compatibility behavior, backfill, verification, and rollback;
- acceptance criteria that can be verified without relying on hidden frontend controls.

A missing organization_id may never mean that a record is available to every organization.

## Implementation sequence

| Order | SPEC | Outcome | Solar release status |
|---|---|---|---|
| 1 | MT-SPEC-01 | Locks policy, inventories the current system, and contains immediate risks | Blocker |
| 2 | MT-SPEC-02 | Creates organizations, members, onboarding, and lifecycle governance | Blocker |
| 3 | MT-SPEC-03 | Establishes identity, sessions, authorization, API context, and frontend isolation | Blocker |
| 4 | MT-SPEC-04 | Establishes database enforcement, audit, operational safety, and recovery | Blocker |
| 5 | MT-SPEC-05 | Makes the complete contract domain organization-safe | Blocker |
| 6 | MT-SPEC-06 | Makes the complete property domain durable and organization-safe | Blocker |
| 7 | MT-SPEC-07 | Makes all uploaded and stored files organization-safe | Blocker |
| 8 | MT-SPEC-08 | Separates integrations and makes external delivery reliable | Blocker when integrations are enabled |
| 9 | MT-SPEC-09 | Adds commercial and enterprise extensions | Conditional |
| 10 | MT-SPEC-10 | Migrates Azar, removes legacy bypasses, and certifies Solar | Final blocker |

MT-SPEC-05 through MT-SPEC-08 may be designed in parallel after MT-SPEC-02 through MT-SPEC-04 establish their shared contracts. MT-SPEC-09 may be implemented after the core boundary unless one of its features is promised at launch.

## The ten required SPECs

### MT-SPEC-01 — Product policy, threat model, containment, and inventory

**Name:** Multi-tenant product policy, security threat model, immediate containment, and legacy inventory.

**Description:** Establish the decisions and evidence required before implementation begins, and immediately contain known risks that should not remain open during a long migration.

**Why it is necessary:** Organization isolation cannot be designed consistently until product policies and trust boundaries are explicit. The current repository also contains single-tenant behaviors—global administrator grants, caller-controlled property identities, public Drive permissions, a fixed Make endpoint, global integration destinations, and unscoped compatibility credentials—that require prompt containment and a verified inventory.

**Included scope:**

- Define organization, organization member, inquilino, external contract participant, and platform operator terminology.
- Decide whether all verified existing production data belongs to Azar and how ambiguous data is quarantined.
- Decide invite-only versus self-service organization creation.
- Decide organization-wide versus assigned-only visibility for ordinary members.
- Confirm support for one user belonging to multiple organizations.
- Decide platform-managed versus organization-owned Google and Make connections.
- Define property-edit effects on Sheets and Make.
- Define initial retention, support-access, branding, custom-domain, and billing policies.
- Identify protected assets, trust boundaries, attacker types, abuse cases, and non-negotiable organization-isolation invariants.
- Inventory Supabase Auth users, contract_admin_users, contract tables, property logs, local audit files, Storage objects, Drive folders, Sheets, Make endpoints, API keys, headers, environment variables, and current provider permissions.
- Record counts, ownership evidence, checksums, unresolved records, and a migration reconciliation baseline.
- Back up the database and export the evidence needed for rollback.
- Rotate or revoke the fixed Make endpoint and any exposed or overly broad credentials.
- Disable insecure X-User-Id behavior in every environment containing real data.
- Stop creating Drive folders with anyone-reader permission and classify existing public folders for remediation.
- Define immediate monitoring and incident steps if prior cross-customer or public-link exposure is discovered.
- State that no frontend flag, route slug, request organization name, email domain, agent ID, or null database value proves organization access.

**Dependencies:** None.

**Completion gate:** Approved policy decisions, threat model, inventory report, backups, credential rotation evidence, and containment of public/global access paths.

### MT-SPEC-02 — Organizations, memberships, onboarding, and lifecycle governance

**Name:** Organization foundation, profiles, memberships, roles, invitations, settings, and lifecycle.

**Description:** Define the complete customer and user-management domain that makes Azar, Solar, and future agencies independent organizations with their own users, roles, settings, branding, and lifecycle.

**Why it is necessary:** Supabase Auth identifies a person but does not establish which agency owns data or what that person can do for it. The current free-text company metadata and global isAdmin grant cannot express organization ownership, collaboration, suspension, or offboarding.

**Included scope:**

- Create organizations with UUID, immutable internal identity, unique slug, display/legal name, status, timestamps, creator, locale, time zone, plan key, and deletion state.
- Create user_profiles without treating profile metadata as authorization.
- Create organization_settings for safe branding, access policy, feature defaults, and public display values.
- Create organization_memberships with organization, user, role, state, invitation/join dates, and soft-removal history.
- Support users with different roles in multiple organizations.
- Define owner, admin, member, and viewer roles through named capabilities rather than a single boolean.
- Define capabilities for contracts, properties, files, links, users, integrations, exports, billing, and organization lifecycle actions.
- Define organization-wide collaboration as the recommended default, with an optional assigned-only policy layered inside organization scope.
- Preserve created_by_user_id and assigned_to_user_id as attribution/workflow fields rather than the primary tenant boundary.
- Prevent removal of the last owner and define audited ownership transfer.
- Create organization_invitations with normalized email, hashed single-use token, intended role, expiration, inviter, accepted state, and revocation.
- Define invitation email delivery, resend, expiry, exact-email acceptance, existing-account acceptance, and replay prevention.
- Separate create-an-organization onboarding from join-an-organization onboarding.
- Do not auto-join a user based only on an email domain.
- Define member list, invite, role-change, suspension, removal, and ownership-transfer APIs and accessible frontend screens.
- Define organization states such as active, suspended, pending deletion, and deleted.
- Specify what a suspended organization may read, write, export, or recover.
- Define reactivation, owner-confirmed export, deletion grace period, legal hold where applicable, final deletion, and audit requirements.
- Define database, Storage, provider, integration-secret, job, and backup-retention effects of deletion.
- Preserve historical actor attribution by suspending memberships rather than deleting required history.
- Define basic organization branding used by the dashboard and public contract forms, with safe defaults.
- Add server-side plan and feature keys without making billing a prerequisite for isolation.

**Dependencies:** MT-SPEC-01.

**Completion gate:** Organization and membership schema, RBAC matrix, invitation/member-management flows, lifecycle state machine, governance rules, and their backend/frontend acceptance tests are approved.

### MT-SPEC-03 — Identity, sessions, authorization, APIs, and frontend organization context

**Name:** Revocable authentication, organization authorization, API context, scoped machine access, support access, and frontend tenant isolation.

**Description:** Replace global administrator authentication with a revocable identity and authorization layer that resolves an active membership on every protected request and propagates the same organization context through APIs and frontend state.

**Why it is necessary:** The current signed cookie embeds stale global administrator authority, compatibility identities can bypass normal access, and frontend routes/caches have no organization boundary. A single authoritative context is required so every later domain uses identical access semantics.

**Included scope:**

- Keep Supabase Auth for identity while making organization membership the authorization source.
- Replace the self-contained administrator cookie with high-entropy opaque application sessions whose hashes are stored in app_sessions.
- Define session creation, expiration, rotation, remembered sessions, last-seen state, revocation, logout, and device/session management.
- Revalidate account, organization, and membership state on protected requests or through a very short explicitly invalidated cache.
- Revoke relevant sessions after suspension, role changes, password resets, account compromise, or organization shutdown.
- Define password login, Google authentication handoff, email verification, password reset, email change, abuse throttling, and MFA hooks for owners/platform operators.
- Add CSRF protection for cookie-authenticated mutations, Origin validation, exact-origin CORS, secure cookie attributes, and non-enumerating errors where practical.
- Return safe user, organization, membership, role, and capability summaries from the session API.
- Define a typed OrganizationRequestContext with request, session, user, organization, membership, role, and permissions.
- Define middleware order: session validation, route organization resolution, membership validation, organization-state validation, capability resolution, and handler execution.
- Use explicit authenticated API namespaces such as /api/organizations/:organizationId while treating slugs as routing hints only.
- Standardize 401 for missing identity, 403 for missing capability, generic 404 for another organization’s record, and 409 for concurrency conflict.
- Define bounded cursor pagination and stable filters for all organization lists.
- Define a separate ContractLinkContext for a single entry and role; it can never become a dashboard membership.
- Replace the global CONTRACTS_API_KEY with organization-owned keys that have a lookup prefix, strong stored hash, one-time raw display, scopes, expiration, last-used metadata, optional IP controls, rotation, and revocation.
- Retire or explicitly organization-bind CONTRACT_ADMIN_USER_IDS, X-Authenticated-User-Id, development/insecure X-User-Id, and every compatibility principal.
- Define a separate platform_admin mechanism only if support access is allowed.
- For platform support, require least privilege, step-up authentication, reason capture, time limits, visible support state where appropriate, complete audit, and emergency revocation.
- Replace AgentProvider as an identity source with authentication and organization providers.
- Add protected /t/:organizationSlug routes, active organization state, organization switching, suspended/unauthenticated states, and permission-aware navigation.
- Include immutable organization IDs in all React Query keys and scoped browser draft keys.
- Cancel in-flight requests and clear/partition caches on organization switch and logout so prior-organization data never flashes.
- Require direct navigation to protected pages to wait for server-validated context.
- Treat frontend visibility as usability only; repeat every permission check in the backend.

**Dependencies:** MT-SPEC-01 and MT-SPEC-02.

**Completion gate:** Revocable session flow, organization middleware, machine/support access boundaries, namespaced API conventions, and frontend switching/cache tests are complete.

### MT-SPEC-04 — Database enforcement, audit, abuse controls, observability, and recovery

**Name:** Shared-schema data enforcement, RLS/service-role safety, audit, distributed controls, monitoring, backups, and disaster recovery.

**Description:** Define the cross-cutting technical controls that every organization-owned domain must follow in the database and production environment.

**Why it is necessary:** Application-level filters are insufficient for contracts, identity documents, and financial evidence. The backend service role bypasses RLS, current rate limits and upload sessions are process-local, local logs are not durable, and isolation failures must be detectable and recoverable.

**Included scope:**

- Require non-null organization_id for every active business, asset, audit, job, delivery, usage, and integration record after migration.
- Define unique (id, organization_id) keys and composite child-to-parent foreign keys that reject cross-organization relationships.
- Define organization-leading indexes for status, creator, assignment, timestamps, job state, audit time, and human-facing codes.
- Require organization ID in every authenticated repository method; prohibit optional scope and unscoped findById methods.
- Require every select, insert, update, delete, lock, and RPC to match both record and organization.
- Define scoped database functions with safe search_path, restricted grants, actor context, and fail-closed behavior.
- Enable and test RLS for every organization-owned table.
- Explicitly document that service_role bypasses RLS and require scoped repositories/RPC assertions even when RLS exists.
- Limit service-role client availability and define a future least-privileged backend/user-JWT option.
- Create append-only audit_events with organization, actor type/ID, action, target, request ID, timestamp, outcome, source metadata, safe changed-field summary, and support reason.
- Exclude raw role tokens, signed URLs, credentials, secret values, storage paths, DNI content, and unnecessary PII from general audit/log payloads.
- Add actor attribution and request IDs to all privileged membership, contract, property, file, integration, retry, export, billing, and support actions.
- Replace process-local rate limits with a distributed implementation.
- Define rate keys for organization, user/API key, external-token fingerprint, entry/draft, IP, and action as appropriate.
- Cover login, invitations, link validation, presigning, submission, token regeneration, connection tests, and manual retries.
- Define idempotent usage_events and quotas for members, contracts, properties, storage bytes, upload counts/sizes, links, and deliveries.
- Prevent one organization from exhausting shared provider or worker capacity through fair scheduling and bounded concurrency.
- Add structured redacted logs with organization and request correlation.
- Add metrics and alerts for authorization denials, invitation abuse, session revocation, upload failures, queue depth, latency, retries, dead letters, quotas, and provider health.
- Avoid emails, addresses, or other sensitive values as metric labels.
- Replace local-file/console authority with durable organization-scoped audit and operational records.
- Define database point-in-time recovery, secret-safe configuration backups, logical organization export/restore, full restore, and restore validation.
- Prevent restored outbox jobs from replaying completed external actions without reconciliation.
- Define incident-response and runbooks for suspected cross-tenant exposure, credential compromise, provider misrouting, failed migration, and data recovery.
- Require cursor pagination, bounded result sizes, connection pooling, query plans, and organization-leading performance tests.
- Test RLS, service-role scoping, composite constraints, concurrent edits, rate limiting, and job claims against a real disposable database.

**Dependencies:** MT-SPEC-02 and MT-SPEC-03.

**Completion gate:** Reusable data-access standard, RLS/constraint test harness, audit schema, distributed control design, observability, backup, restore, and incident runbooks are approved.

### MT-SPEC-05 — Organization-safe contracts, links, history, media associations, and templates

**Name:** End-to-end multi-tenant contract creation, administration, revisions, external participation, files, branding, and templates.

**Description:** Convert every contract behavior into an organization-owned workflow while preserving external user/client links, immutable correction history, private evidence, and all existing contract functions.

**Why it is necessary:** Contracts are durably stored today but access is based on the individual creator, null legacy rows are visible globally, lists are loaded unscoped, external/provider behavior is not organization-aware, and administrative corrections lack complete actor/concurrency semantics.

**Included scope:**

- Add organization_id to contract_entries, contract_submissions, and contract_events.
- Apply composite constraints, organization-leading indexes, RLS, and scoped RPC patterns from MT-SPEC-04.
- Convert created_by_user_id to valid typed attribution where feasible and add assignment/current-version/update metadata.
- Require organization context in create, list, find, submissions, archive, status, trigger, and token replacement repository methods.
- Push organization filtering, search, status/creator/assignee filters, stable sorting, and cursor pagination into SQL.
- Never fetch the global entry collection and filter it in JavaScript.
- Make the organization—not the individual creator—the primary contract owner.
- Apply the approved organization-wide or assigned-only policy and role capabilities to list, detail, inspection, edit, status, archive, link management, and attachment viewing.
- Return generic 404 for an authenticated attempt to use another organization’s UUID and produce no side effect.
- Derive organization and creator from request context; reject caller-supplied ownership.
- Preserve hashed user/client role tokens and bind each capability to one organization-owned entry and one role.
- Define link creation, regeneration, revocation, expiry policy, rate limiting, token fingerprinting, and raw-token log protection.
- Optionally exchange raw link tokens for a short-lived entry-scoped HttpOnly capability session and strip tokens from the address bar.
- Ensure external link holders cannot list records, access the dashboard, change organizations, or attach another entry’s assets.
- Publish only safe public organization branding: approved name, logo, and sanitized theme values.
- Replace the hard-coded Azar logo with the entry organization’s public branding and platform defaults.
- Preserve current user/client submission projections for fast reads while treating append-only submission rows as revision history.
- Add revision number, superseded submission, actor type, authenticated actor ID, request ID, submitted time, and redacted change summary.
- Distinguish member corrections, external-user-token submissions, external-client-token submissions, API-key actions, and platform support actions.
- Update current projection, revision history, audit, event, and outbox intent atomically.
- Add optimistic concurrency/version checks and return 409 instead of silently overwriting another member’s correction.
- Preserve schema-defined inspection order, partial states, current status actions, archive, regeneration, and existing validation.
- Associate DNI and guarantor evidence through the asset ownership model in MT-SPEC-07 without exposing raw storage paths to clients.
- Generate signed media views only after organization/entry/role/asset validation.
- Define global versus organization-owned contract templates.
- Version templates immutably with draft/published/retired states, per-organization enablement, schema validation, generated-document configuration, and fixed template-version references on entries.
- Never reinterpret historical entries after a template/schema change.
- Include organization ID in all contract frontend query/mutation cache keys.
- Add unit, route, real-database, storage, frontend, and Azar/Solar negative tests for every contract action.

**Dependencies:** MT-SPEC-02 through MT-SPEC-04 and the shared asset contract from MT-SPEC-07, which may be co-designed.

**Completion gate:** All existing contract functions work for Azar and Solar independently, with scoped repositories/RPCs, revision history, external link isolation, private asset association, branding, and adversarial tests.

### MT-SPEC-06 — Organization-safe properties, submissions, modifications, and management UI

**Name:** Authenticated property creation, canonical persistence, immutable revisions, durable processing, editing, and management.

**Description:** Replace the single-use property submission flow with an organization-owned property domain that supports safe creation, listing, inspection, modification, retry, and history.

**Why it is necessary:** Property routes currently trust browser-controlled agent identity, have no canonical database records, depend on local/console logs and global providers, and cannot support tenant-scoped submissions or modifications.

**Included scope:**

- Require a valid organization membership and properties.write for every property draft, preflight, submission, edit, retry, list, and detail endpoint.
- Derive organization, actor ID, display name/email snapshot, capabilities, and quotas from server context.
- Remove agent_user_id, agent_name, and agent_email as authoritative request values.
- Remove AgentContext and form_site_agent local storage as identity/authorization sources.
- If submit-on-behalf-of is required, define a named permission, explicit UI, same-organization target validation, and full audit.
- Create properties with UUID, organization ID, organization-unique human code, status, current revision, version, creator/updater, and timestamps.
- Create immutable property_revisions with organization, property, revision number, validated payload snapshot, change kind, summary, actor, and time.
- Create property_submission_runs with organization, property/revision, state, idempotency key, step outcomes, external IDs, safe errors, attempts, and timestamps.
- Create property_events for lifecycle and administrative history.
- Use the database as canonical; Drive, Sheets, Make, filesystem logs, and console output are projections or operations, not the source of truth.
- Create a durable organization-scoped draft before file preflight.
- Finalize verified assets from MT-SPEC-07 into the first property revision.
- In one transaction, create/update business state, revision, event, audit, usage, submission run, and outbox intents.
- Require idempotency keys for creation and sensitive actions, with request fingerprints and same-result replay.
- Prevent duplicate properties, revisions, Drive folders, Sheet rows, or webhooks after browser/provider retries.
- Add paginated organization-scoped property list, search, filters, detail, revision history, processing status, and archive behavior.
- Add PATCH/edit behavior with expected version or If-Match and return 409 on stale edits.
- Validate the complete resulting property payload on every revision.
- Define whether edits update a Sheet row, append a revision row, notify Make, or perform an approved combination.
- Store stable external identifiers rather than rediscovering provider records by address/time.
- Let users retry a specific failed delivery/run without recreating a property revision.
- Show queued, processing, successful, partially failed, failed, conflict, and retry states accessibly in the frontend.
- Include organization IDs in every property query key and browser draft key.
- Replace ephemeral success-page state with durable status lookup.
- Add unit, API, real-database, frontend, and Azar/Solar tests for authentication, direct UUID attacks, revisions, concurrency, idempotency, and processing.

**Dependencies:** MT-SPEC-02 through MT-SPEC-04, plus MT-SPEC-07 and MT-SPEC-08 interfaces.

**Completion gate:** Properties are durable, editable, auditable, idempotent, manageable by the owning organization, and never attributable from caller-controlled agent fields.

### MT-SPEC-07 — Unified private file and storage isolation

**Name:** Organization-scoped asset registry, uploads, verification, downloads, retention, cleanup, and storage migration.

**Description:** Create one security model for contract DNI/evidence, property media, branding assets, and future uploaded files across Supabase Storage and any exported copy.

**Why it is necessary:** Private buckets and random paths are not sufficient ownership controls. Current property upload sessions are process-local, browser-returned paths are weakly bound, contract paths lack organization prefixes, and Drive links may bypass application authorization.

**Included scope:**

- Create a durable media_assets or equivalent registry with ID, organization, owning domain/record/draft, bucket/path, original name, detected MIME, bytes, optional checksum, upload state, actor/capability, timestamps, and retention/deletion state.
- Expose asset IDs to application clients instead of treating raw bucket/path values as authority.
- Use organization-prefixed paths for properties, contracts, branding, and future domains.
- Treat path prefixes as defense in depth; verify ownership from the database on every action.
- Persist upload sessions in Postgres or another durable distributed store instead of an in-memory Map.
- Bind every pending upload to organization, actor or external contract capability, intended record/draft, expected metadata, expiration, and single-use completion.
- Issue signed upload URLs only after membership/capability, quota, receiver, count, type, and size validation.
- Verify actual Storage object existence, MIME, byte size, bucket, path, optional checksum, and uniqueness after upload.
- Reject expired, mismatched, duplicated, cross-organization, cross-entry, cross-draft, or already attached objects.
- Preserve existing contract DNI/evidence receiver limits and required-pair/evidence rules.
- Keep all Supabase buckets private.
- Issue short-lived signed view/download URLs only after current organization or entry-role authorization.
- Never persist or log upload URLs, signed view URLs, raw tokens, or decrypted credentials.
- Define safe download content disposition, MIME handling, and optional malware/content scanning.
- Define cover-image ownership and ordering for property media.
- Define logo validation and safe public delivery for approved branding assets.
- Track verified bytes and asset counts for quotas and future billing.
- Delete expired unattached uploads after a reviewed grace period with organization-scoped audit.
- Define retention and deletion for DNI, evidence, property media, branding, exports, and backups.
- Define legacy asset ownership registration, strictly Azar-only path compatibility, object copy/move mapping, immutable-history preservation, orphan quarantine, and cleanup.
- Remove or remediate any public/bearer external copy; Google ACL requirements are completed in MT-SPEC-08.
- Test cross-organization path tampering, asset-ID reuse, signed URL issuance, metadata mismatch, multi-instance uploads, cleanup, quota behavior, and deletion.

**Dependencies:** MT-SPEC-02 through MT-SPEC-04; contract/property owner interfaces from MT-SPEC-05 and MT-SPEC-06 may be co-designed.

**Completion gate:** Every live file has verified organization ownership, all buckets/resources are private by default, and no Azar capability can issue or reuse a Solar asset URL.

### MT-SPEC-08 — Tenant-aware integrations, secrets, outbox, Google, and Make

**Name:** Organization integration configuration, encrypted secrets, private Google resources, transactional outbox, workers, and secure webhooks.

**Description:** Replace process-global provider configuration and direct delivery with organization-resolved destinations and a durable idempotent event-delivery system.

**Why it is necessary:** Database isolation is incomplete if Solar data is written into Azar’s Drive, Sheet, or Make scenario. Current requests call global providers directly, Drive folders are public, Sheet appends are ambiguous, and the database Make trigger sends a complete row to one fixed endpoint.

**Included scope:**

- Create organization_integrations with provider, organization, enabled state, safe configuration, credential reference, health, and error classification.
- Store OAuth refresh tokens, service-account references, webhook secrets, and other credentials through managed secret storage or strong application encryption backed by a separate key.
- Never return decrypted secrets to the browser or copy them into audit/provider errors.
- Define platform-managed credentials with distinct organization destinations as the recommended first release.
- Preserve an upgrade path to organization-owned Google OAuth and Make/webhook endpoints.
- Restrict connect, disconnect, rotate, test, and destination changes through integrations.manage and audit them.
- Show only masked identifiers and safe health in the organization integration UI.
- Make Google adapters accept resolved organization integration context rather than process-global destination variables.
- Give each organization a private Drive subtree or organization-owned Drive context.
- Remove anyone-reader permissions and define explicit sharing to the correct organization group/account.
- Keep canonical files in private Storage when Drive is only an optional export.
- Use a separate spreadsheet per organization by default, or document and test an equivalently strong external isolation scheme.
- Store stable Sheet/Drive external identifiers and organization-aware idempotency metadata.
- Reconcile ambiguous Google timeouts before retrying append/update operations.
- Create outbox_events inside the same transaction as contract/property changes.
- Create integration_deliveries with organization, event, provider, idempotency key, state, attempts, lease, response classification, next attempt, and external ID.
- Select a durable queue/worker compatible with Vercel/Supabase; do not rely on request completion for long-running delivery.
- Claim jobs with leases/locking so concurrent workers cannot deliver the same event.
- Use bounded exponential backoff, concurrency, fair organization scheduling, dead-letter state, and safe manual retry.
- Make retry/reconciliation operate on delivery attempts without recreating business revisions.
- Remove the fixed database Make HTTP trigger.
- Build versioned allowlisted Make/webhook payloads that omit token hashes, credentials, internal paths, and unnecessary PII.
- Include event ID, organization-safe resource ID, schema version, and idempotency key.
- Sign outbound events with an organization-specific secret where supported.
- If administrators can enter URLs, enforce HTTPS, approved ports/providers, redirect limits, DNS resolution checks, DNS-rebinding defenses, and rejection of loopback/private/link-local destinations.
- Bound connection time, total time, response size, redirects, and logged provider bodies.
- Define provider health tests that avoid production business side effects.
- Surface queued/failed/dead-letter states and authorized retry in contract/property administration.
- Add staging tests with distinct Azar and Solar folders, spreadsheets, webhook receivers, credentials, failures, and secret rotation.

**Dependencies:** MT-SPEC-02 through MT-SPEC-07.

**Completion gate:** Every provider call resolves the owning organization, Drive/Sheets/Make resources are externally separated, delivery is durable/idempotent, and provider failures cannot cross tenant boundaries.

### MT-SPEC-09 — Commercial SaaS and enterprise extensions

**Name:** Plans and billing, advanced branding/custom domains, enterprise SSO, physical isolation tiers, and tenant-safe analytics.

**Description:** Define the optional commercial and enterprise capabilities anticipated by the architecture without coupling them to the core Azar/Solar isolation release.

**Why it is necessary:** These capabilities are not required to prove a two-organization boundary, but they are part of the complete SaaS scope. Designing them as explicit modules prevents later billing, domains, identity providers, deployments, or reporting from bypassing the organization model.

**Included scope:**

- Define a plan catalog, organization subscription state, feature entitlements, trials, grace periods, failed-payment behavior, and server-side enforcement.
- Store billing-provider customer and subscription identifiers on the organization rather than an individual.
- Verify billing webhooks, make processing idempotent, audit changes, and provide an owner-only billing portal.
- Connect idempotent usage events and quotas from MT-SPEC-04 to metered billing without double counting retries.
- Define invoices and tax handling appropriate to the operating business and jurisdictions.
- Ensure payment failure never weakens authorization; define suspension/read/export behavior through MT-SPEC-02.
- Extend safe organization branding beyond the basic name/logo/theme.
- Define custom-domain ownership verification, DNS instructions, certificate provisioning/renewal, host-to-organization routing, callback URLs, CORS, cookie boundaries, phishing protections, and default-domain fallback.
- Treat a custom host as a routing hint followed by the normal membership or link-capability check.
- Define SAML/OIDC provider configuration, verified domains, identity linking, IdP metadata/certificate rotation, and enforcement.
- Define invitation-only versus just-in-time SSO provisioning, role mapping, suspension, account recovery, and break-glass owner access.
- Require successful SSO identities to resolve an active organization membership; never grant access from email domain alone.
- Define criteria for an enterprise database/project/deployment isolation tier.
- Automate dedicated environment provisioning, schema migrations, credentials, routing, Storage, integrations, monitoring, backups, disaster recovery, support, and shared-to-dedicated data transfer.
- Avoid manual repository forks for dedicated customers.
- Define organization dashboards, approved metrics, materialized views, exports, time zones, query limits, privacy, and redaction.
- Define platform-wide aggregation that exposes no customer record content to other organizations.
- Preserve organization identity through any warehouse/event pipeline and test report/export queries for cross-tenant mixing.
- Define which modules are enabled at launch and require each enabled extension to pass the same authorization, audit, backup, and Azar/Solar tests as core features.

**Dependencies:** Core organization and operational contracts from MT-SPEC-02 through MT-SPEC-08. Individual modules may be delivered later.

**Completion gate:** Each offered commercial/enterprise module has an approved design, independent enablement, organization-safe data model, server authorization, audit, migration, and negative isolation tests.

### MT-SPEC-10 — Azar migration, final cutover, cross-tenant certification, and Solar rollout

**Name:** Existing-data migration, legacy resource remediation, final constraint enforcement, compatibility removal, adversarial certification, and staged release.

**Description:** Define and execute the additive migration from the current single-tenant deployment to the new organization architecture, prove every existing artifact belongs to Azar or quarantine, remove all bypasses, and use Solar as the controlled isolation canary.

**Why it is necessary:** New organization-aware code does not secure existing null-owned rows, old sessions, raw file references, public Drive folders, global provider destinations, or legacy routes. End-to-end adversarial tests and a rehearsed cutover are required before any second organization can hold real data.

**Included scope:**

- Reconcile the Supabase CLI migration history and add new ordered migrations rather than editing already-applied files.
- Create Azar with a fixed UUID/slug and reviewed settings.
- Map legitimate current Supabase users and contract_admin_users grants to reviewed Azar memberships/roles.
- Do not infer durable roles from free-text user metadata.
- Add nullable organization columns and new domain/asset/integration tables before backfill.
- Backfill every contract entry to Azar unless evidence assigns it elsewhere.
- Backfill contract submissions/events through the parent entry and verify no disagreement.
- Import recoverable property logs into canonical Azar properties/revisions/runs or quarantine unverifiable records.
- Inventory every property and contract Storage object; register ownership, copy with mapping, preserve immutable history, quarantine, or delete only after review/grace period.
- Remediate public Drive ACLs and seed Azar’s private Drive/Sheet/Make integration configuration from the current global settings.
- Retire the fixed webhook and rotate old credentials as specified in MT-SPEC-01 and MT-SPEC-08.
- Use additive deployment, dual-write/read where necessary, shadow count comparisons, and fail-closed feature flags.
- Keep legacy routes only as authenticated adapters that resolve an explicit organization during transition.
- Verify zero unassigned active business rows, zero parent-child organization mismatches, zero unmapped live assets, reviewed active memberships, expected counts, and checksums.
- Apply organization_id not null, composite foreign keys, tenant-leading indexes, and tested RLS only after backfill verification.
- Remove the null-owner global visibility rule.
- Replace contract_admin_users and global customer API-key checks with memberships/scoped keys.
- Disable insecure identities, global compatibility paths, and dual-write code.
- Invalidate old application sessions so every user receives organization-aware authorization.
- Define rollback per additive phase; never roll back to global visibility after a failed scope check.
- Preserve backups before constraint/removal stages and test restoration without replaying completed outbox work.
- Build a real-database fixture with Azar/Solar owners, admins, members, viewers, a multi-organization user, suspended users, API keys, external role tokens, contracts, revisions, properties, assets, integrations, and jobs.
- Test same-organization success and cross-organization denial for every list, detail, direct UUID, edit, status, archive, token, history, upload, signed view, retry, export, report, support, billing, and integration path that is enabled.
- Test cache switching, in-flight requests, logout, invitation replay, role downgrade, member suspension, stale sessions, concurrency, quotas, and generic 404 behavior.
- Test an Azar role link against Solar entries/assets and the reverse.
- Use separate staging Drive folders, Sheets, and webhook receivers and assert correct destination, not merely successful response.
- Test ambiguous provider timeouts, duplicate worker claims, dead letters, secret rotation, backups/restores, migration rollback, performance, and incident runbooks.
- Define a staged Solar canary, release monitoring, go/no-go owners, rollback thresholds, and post-release verification.
- Do not enable an unfinished feature for Solar. Disable both its UI and every backend/API route if its blocker scope is not complete.
- Update architecture, environment, API, external-service, testing, operations, and support documentation after cutover.

**Dependencies:** MT-SPEC-01 through MT-SPEC-08, plus every MT-SPEC-09 module enabled for Solar.

**Completion gate:** MT-SPEC-10 is the final release gate. Solar may hold real data only after migration evidence, final constraints, compatibility removal, restore rehearsal, provider separation, and the complete adversarial test matrix pass.

## Consolidation map

The table below shows that every area from the former 38-item planning catalog remains in the ten-SPEC model. Former identifiers are traceability references, not additional active SPECs.

| New consolidated SPEC | Former planning areas absorbed |
|---|---|
| MT-SPEC-01 | Former MT-SPEC-00 and MT-SPEC-01: policy, threat model, containment, and inventory |
| MT-SPEC-02 | Former MT-SPEC-02, MT-SPEC-03, MT-SPEC-06, and MT-SPEC-25: organizations, memberships, onboarding, invitations, lifecycle, retention, export, and deletion |
| MT-SPEC-03 | Former MT-SPEC-05, MT-SPEC-07, MT-SPEC-09, MT-SPEC-23, and MT-SPEC-28: sessions, request context, APIs, frontend switching/cache, scoped keys, compatibility identities, and support access |
| MT-SPEC-04 | Former MT-SPEC-04, MT-SPEC-08, MT-SPEC-24, and MT-SPEC-26: audit, database/RLS/service-role enforcement, distributed limits/quotas, observability, backups, and recovery |
| MT-SPEC-05 | Former MT-SPEC-10 through MT-SPEC-14 and MT-SPEC-33: contract persistence, administration, revisions, external links, file associations, branding, and templates |
| MT-SPEC-06 | Former MT-SPEC-15 through MT-SPEC-18: property authentication, persistence, revisions, upload integration, APIs, and UI |
| MT-SPEC-07 | Storage portions of former MT-SPEC-14, MT-SPEC-17, MT-SPEC-25, and MT-SPEC-30: shared assets, uploads, verification, signing, cleanup, retention, deletion, and legacy file ownership |
| MT-SPEC-08 | Former MT-SPEC-19 through MT-SPEC-22 and integration portions of MT-SPEC-30: configuration, secrets, Google, outbox, workers, Make, webhooks, and provider migration |
| MT-SPEC-09 | Former MT-SPEC-27 and MT-SPEC-34 through MT-SPEC-37: billing/entitlements, custom domains, SSO, physical isolation, and analytics |
| MT-SPEC-10 | Former MT-SPEC-29 through MT-SPEC-32 plus final legacy portions of MT-SPEC-23 and MT-SPEC-30: backfill, remediation, enforcement, compatibility removal, certification, and rollout |

## Architecture coverage check

| Architecture capability | Consolidated owner |
|---|---|
| Terminology, business policy, threat model, immediate risk handling, and inventory | MT-SPEC-01 |
| Organization schema, profiles, members, roles, invitations, branding settings, lifecycle, export, retention, and deletion | MT-SPEC-02 |
| Authentication, revocable sessions, API context, authorization, frontend routing/switching/caches, API keys, and support access | MT-SPEC-03 |
| Composite database constraints, RLS/service-role safety, audit, rate limits, quotas, logs, monitoring, backups, and recovery | MT-SPEC-04 |
| Contract creation, lists, inspection, edits, history, links, status, archive, media associations, branding, and templates | MT-SPEC-05 |
| Property authentication, durable records, submissions, modifications, processing runs, history, retries, and management UI | MT-SPEC-06 |
| Contract/property/branding assets, direct uploads, verification, signed views, privacy, cleanup, retention, and storage migration | MT-SPEC-07 |
| Tenant-specific secrets and destinations, Drive/Sheets isolation, outbox/workers, Make/webhooks, idempotency, retries, and dead letters | MT-SPEC-08 |
| Plans, billing, custom domains, enterprise SSO, dedicated deployments, reporting, and analytics | MT-SPEC-09 |
| Existing Azar data/users/files/providers, dual-write, final constraints, legacy removal, adversarial tests, and Solar release | MT-SPEC-10 |

## Minimum safe release set for Solar

The minimum safe set is MT-SPEC-01 through MT-SPEC-08 and MT-SPEC-10.

MT-SPEC-09 is optional unless billing, custom domains, enterprise SSO, dedicated infrastructure, or analytics are enabled or promised for Solar at launch. Any enabled MT-SPEC-09 module becomes part of MT-SPEC-10 certification.

A feature may be deferred only when both its frontend and all of its backend/API/background paths are disabled for Solar. A frontend-only flag is not an authorization control.
