# SPEC-26 / MT-SPEC-02 Multi-tenant SaaS foundation — organizations, memberships, onboarding, and lifecycle governance

**Date:** 2026-08-18
**Priority:** critical
**Status:** implemented in repository; completion approval and real-database certification pending
**Roadmap identifier:** MT-SPEC-02
**Dependencies:** SPEC-25 / MT-SPEC-01
**Blocks:** MT-SPEC-03 through MT-SPEC-10 and the onboarding of any second real organization

---

## Specification identity

**Name:** Organization foundation, profiles, memberships, roles, invitations, settings, and lifecycle.

**Description:** Define the complete customer and user-management domain that makes Azar, Solar, and future agencies independent organizations with their own users, roles, settings, branding, and lifecycle.

**Why it is necessary:** Supabase Auth identifies a person but does not establish which agency owns data or what that person can do for it. The current free-text company metadata and global `isAdmin` grant cannot express organization ownership, collaboration, suspension, or offboarding.

## Summary

This specification creates the durable organization and membership foundation for the multi-tenant SaaS. It defines:

- organizations as the customer security boundary;
- application profiles as non-authoritative user presentation data;
- memberships as the relationship that grants a user a role in one organization;
- fixed roles resolved into named capabilities;
- secure invitation creation, delivery, acceptance, resend, expiration, and revocation;
- organization and membership state machines;
- last-owner protection and atomic ownership transfer;
- safe settings and basic branding;
- export, suspension, reactivation, deletion, retention, and legal-hold governance contracts; and
- the APIs, frontend administration screens, domain events, migrations, and tests required to make those rules enforceable.

The schema must support one Supabase Auth user having different roles in multiple organizations. An organization owns its records; an individual creator does not. Removing a user from Azar must not delete Azar's records or remove that user's valid membership in Solar.

This document defines required behavior and implementation contracts. It does not itself apply migrations, create Azar or Solar in production, send invitations, alter user grants, or change runtime code.

## Authority and relationship to other specifications

This is the second formal implementation SPEC derived from:

- `docs/09-roadmap/specs/research/23-RESEARCH-multi-tenant-saas-architecture.md`;
- `docs/09-roadmap/specs/research/24-RESEARCH-multi-tenant-saas-specification-roadmap.md`; and
- `docs/09-roadmap/specs/pending/25-SPEC-multi-tenant-policy-threat-model-containment-and-inventory.md`.

SPEC-26 may be reviewed while SPEC-25 is pending, but implementation may begin only after SPEC-25's completion gate passes. The approved values of POL-02, POL-03, POL-04, POL-07, POL-08, POL-09, POL-10, and POL-11 are inputs to this SPEC. If an approved value differs from the recommended baseline used here, this SPEC must be revised explicitly before implementation.

Earlier project SPECs remain historical behavior references:

- SPEC-17 and SPEC-19 establish Supabase password/Google identity and the current application cookie, but their global administrator model is superseded by membership roles.
- SPEC-19's free-text `company` and `role` registration fields do not create organizations or memberships and must not be migrated as authority.
- SPEC-22's `created_by_user_id` remains useful attribution but is not the organization boundary.
- SPEC-10 through SPEC-22 contract behavior remains owned by the organization once MT-SPEC-05 performs the domain migration.
- SPEC-25's reviewed temporary Azar allowlist remains a compatibility boundary until MT-SPEC-03 and MT-SPEC-10 complete the identity migration.

## Context

The current repository has no `organizations`, `organization_memberships`, `organization_invitations`, `organization_settings`, or application profile tables. Supabase Auth users are treated as globally eligible contract administrators when they appear in `contract_admin_users`. The signed application cookie contains only user details and `isAdmin`; it does not identify a membership, role, capability set, organization, or revocable session.

The registration UI captures `company` and `role` as free text and writes them into editable user metadata. The main routes are global paths such as `/contracts/admin` and `/properties/new`. The frontend session model exposes only one global administrator user. This can describe one internal agency, but it cannot distinguish Azar from Solar or express one user working for both.

Without a durable organization domain:

- business rows have no customer owner;
- a role has no organization in which it applies;
- a removed employee cannot be offboarded from one agency while retaining access to another;
- invitations cannot safely establish membership;
- there is no last-owner rule or ownership-transfer transaction;
- settings, branding, plan keys, integrations, exports, or lifecycle state have no customer parent;
- deletion and retention cannot be coordinated across database, Storage, providers, jobs, logs, and backups; and
- later repository/RLS/API changes have no trusted organization key to enforce.

## Motivation

Multi-tenancy is a relationship model, not a label added to a user profile. A global Auth user may legitimately be an Azar administrator and a Solar viewer. A contract created by that person for Azar must remain Azar's property after the person leaves. Conversely, knowing an organization slug, email domain, record creator, or branding name must never create access.

This SPEC makes those distinctions durable and testable before contract, property, file, and integration records are migrated. It also prevents account onboarding and organization lifecycle behavior from being implemented independently in incompatible ways.

## Objective

Implement one durable, auditable organization-governance domain in which every customer has an immutable identity, every customer user has an explicit stateful membership and named capabilities, every invitation is single-use and email-bound, and every lifecycle transition preserves ownership, history, and downstream cleanup obligations.

## Terminology

- **Auth user:** the global identity in Supabase Auth. An Auth user has no customer access by identity alone.
- **User profile:** global presentation/preferences data linked one-to-one to an Auth user. It is not authorization.
- **Organization:** a SaaS customer such as Azar or Solar and the primary ownership/security boundary.
- **Membership:** the durable relationship between one Auth user and one organization.
- **Role:** one of `owner`, `admin`, `member`, or `viewer` stored on a membership.
- **Capability:** a named server-authorized operation derived from the active membership role and organization state.
- **Organization owner:** a member with the `owner` role. This is unrelated to a rental-property owner/`Propietario`.
- **Invitation:** a single-use, expiring, email-bound capability to create or reactivate one non-owner membership.
- **Active organization:** an organization whose state permits normal authorized work.
- **Suspended organization:** an organization whose mutations and external deliveries are blocked.
- **Pending-deletion organization:** an organization inside an approved deletion grace period with normal work disabled.
- **Deleted organization:** a terminal customer state after required cleanup receipts have completed; it is not a missing row.
- **Membership removal:** a soft terminal access state that preserves historical attribution.
- **Ownership transfer:** an atomic transaction that promotes a target active member to owner and optionally changes the initiating owner's role without ever leaving the organization ownerless.
- **External contract participant:** a role-link holder for one contract. This person is not an organization member.
- **Platform operator:** a separate service operator identity defined by MT-SPEC-03. It is never represented by an organization role.

New visible contracts use `snake_case`. New database and JSON fields use `organization_id`, never `tenant_id`, for the SaaS customer.

## Scope

### Includes

- `organizations` with UUID, immutable slug, names, status, locale, time zone, plan key, creation source/actor, timestamps, version, and deletion state.
- `user_profiles` without company, role, or other authorization-bearing metadata.
- `organization_settings` with safe branding, record-visibility policy, and non-authoritative feature defaults.
- `organization_memberships` with organization, user, role, status, invitation/join dates, suspension/removal history, and optimistic version.
- Multiple memberships and different roles for one Auth user.
- Canonical owner/admin/member/viewer role-capability matrix.
- Organization-wide collaboration by default, with optional `assigned_only` policy inside organization scope.
- Last-active-owner protection, member departure, additional owners, and atomic ownership transfer.
- `organization_invitations` with normalized email, hashed token, non-owner intended role, expiration, inviter, delivery state, resend rotation, acceptance, revocation, and replay prevention.
- Platform-created/invite-only organization onboarding for the first release.
- Separate create-organization and join-by-invitation workflows.
- Member and invitation APIs and accessible administration screens.
- Organization active, suspended, pending-deletion, and deleted state transitions.
- Membership active, suspended, and removed state transitions.
- Reactivation, export requests, deletion requests/grace period, legal holds, cleanup contracts, and final deletion receipts.
- Preservation of historical actor attribution through soft membership state.
- Basic validated branding and public branding projection.
- Server-owned `plan_key` and safe feature defaults without implementing billing.
- Immutable organization-governance events and traceability into MT-SPEC-04 audit events.

### Excludes

- Final opaque/revocable sessions, organization selection, request middleware, CSRF, password recovery, MFA, scoped API keys, and platform-support authorization; MT-SPEC-03 owns them.
- Business-table `organization_id` columns, shared RLS policy framework, distributed rate limits, durable global audit, observability, backups, and restore tooling; MT-SPEC-04 owns them.
- Organization-scoped contract repository/API behavior; MT-SPEC-05 owns it.
- Durable property records and organization-scoped property workflows; MT-SPEC-06 owns them.
- Final logo/media asset registry, Storage cleanup, signed views, and file deletion; MT-SPEC-07 owns them.
- Provider credentials, integration configuration, external deletion, outbox, workers, and invitation-provider infrastructure shared with other notifications; MT-SPEC-08 owns them.
- Subscription billing, custom domains, SSO, dedicated deployments, and analytics; MT-SPEC-09 owns them.
- Production creation/backfill of Azar, migration of current users/grants, or creation of real Solar; MT-SPEC-10 owns them.
- Custom roles or per-member capability overrides.
- Automatic membership from an email domain.
- Hard deletion of membership rows to represent offboarding.

## Dependency and policy gate

The implementation must consume the approved SPEC-25 decision record. The following recommended values are the baseline for this draft:

| Policy | Baseline consumed by SPEC-26 |
|---|---|
| POL-02 | Organizations are platform-created and membership is invite-only for the first release |
| POL-03 | Authorized members collaborate across organization records; `assigned_only` is an optional secondary filter |
| POL-04 | One Auth user may hold roles in multiple organizations |
| POL-07 | Dashboard routing is path-based and branding is organization-specific; custom domains are deferred |
| POL-08 | Every organization has a server-assigned `plan_key`; automated billing is deferred |
| POL-09 | Numeric retention/grace periods and legal bases must be approved before deletion can be enabled |
| POL-10 | Platform support access is separate and denied by default |
| POL-11 | Suspension blocks mutations and integration delivery; approved owner read/export/reactivation behavior is explicit |

No implementation may replace an unapproved policy with an engineer-selected default. If retention, suspension, onboarding, or support-access values remain unresolved, the corresponding feature must remain disabled and the SPEC cannot be completed.

## Non-negotiable domain invariants

1. An Auth user has no organization authority without an active membership.
2. A profile, email domain, invitation email, organization slug, route, client field, or former `contract_admin_users` row is not a membership.
3. One membership belongs to exactly one organization and one Auth user.
4. A user may have at most one membership row per organization, preserving history through state changes.
5. A role applies only inside the membership's organization.
6. Effective capability is the intersection of active Auth identity, active membership, role matrix, organization state, and any approved record-visibility policy.
7. Capability checks deny by default; there is no wildcard customer administrator.
8. Every organization has at least one active owner while it is active, suspended, or pending deletion.
9. Concurrent membership mutations cannot remove, suspend, or demote all active owners.
10. Owner role cannot be granted through an email invitation; it requires an authenticated ownership operation.
11. Membership removal/suspension never deletes organization records or historical actor attribution.
12. Removing one membership never deletes the Auth user or another organization's membership.
13. Invitations are single-use, expire, are bound to one normalized verified email and organization, and store no raw token.
14. An invitation can create access only after exact-email authentication and an atomic acceptance transaction.
15. Reusing, resending, revoking, replacing, or concurrently accepting an invitation cannot create duplicate memberships.
16. Membership must never be granted solely because the user's email domain matches an organization.
17. Organization slug is immutable and is only a routing/display identifier.
18. `created_by_user_id` and `assigned_to_user_id` remain attribution/workflow fields; `organization_id` is ownership.
19. Organization state changes apply before any business mutation or external delivery.
20. A deleted organization row/slug remains reserved as a tombstone for audit and restore safety.
21. Branding values cannot inject HTML, CSS, scripts, arbitrary URLs, or cross-organization assets.
22. Plan and feature values can restrict or present functionality but cannot grant authorization.
23. Every governance mutation and rejected privileged transition has actor/request evidence without raw invitation tokens or unnecessary PII.
24. Customer owners and admins can never use organization APIs to view another organization's members, invitations, settings, lifecycle, or events.

## Data model

All IDs are UUIDs generated by the server/database. All timestamps are `timestamptz` stored in UTC. Every mutable aggregate carries a positive integer `version` for optimistic concurrency. Normal application flows must not physically delete organizations or memberships.

### 1. `user_profiles`

| Field | Contract |
|---|---|
| `user_id` | UUID primary key referencing `auth.users(id)` with deletion restricted while retained membership/history exists |
| `display_name` | Required trimmed text, 1–160 Unicode characters |
| `locale` | Required validated BCP 47 language tag |
| `time_zone` | Required validated IANA time-zone identifier |
| `created_at` / `updated_at` | Server timestamps |
| `version` | Positive integer incremented on every update |

Rules:

- Email identity remains authoritative in Supabase Auth and is not copied into the profile as an authorization source.
- `company` and free-text `role` metadata are not migrated into profile authority.
- Profile fields may be used for display, localization, and actor snapshots only.
- A user may update only approved personal fields after MT-SPEC-03 authenticates the request.
- Profile changes cannot alter memberships, roles, organizations, plan keys, or capabilities.
- If account deletion is later supported, historical events retain an immutable safe actor snapshot or tombstone according to retention policy.

### 2. `organizations`

| Field | Contract |
|---|---|
| `id` | UUID primary key and immutable internal identity |
| `slug` | Required globally unique lowercase routing slug; immutable after insertion |
| `display_name` | Required trimmed customer-facing name, 1–160 characters |
| `legal_name` | Optional trimmed legal name, maximum 240 characters |
| `status` | `active`, `suspended`, `pending_deletion`, or `deleted` |
| `plan_key` | Required server-assigned key from an allowlisted plan registry |
| `locale` | Required validated BCP 47 tag |
| `time_zone` | Required validated IANA identifier |
| `creation_source` | `platform`, `migration`, or reserved `self_service` |
| `created_by_user_id` | Reviewed creator Auth user where applicable; nullable only for documented system migration |
| `status_reason_code` | Safe allowlisted code, never free-form sensitive detail |
| `status_changed_at` | Timestamp of latest status transition |
| `created_at` / `updated_at` | Server timestamps |
| `deleted_at` | Null until final deletion completes |
| `version` | Positive integer used by settings/lifecycle mutations |

Slug requirements:

- 3–63 characters;
- lowercase ASCII letters, digits, and internal hyphens only;
- begins and ends with an alphanumeric character;
- globally unique after normalization;
- rejects reserved route/platform words from a reviewed server registry;
- generated/selected collision handling is deterministic and visible to the platform creator;
- cannot be changed to reassign a URL or impersonate another organization.

Authorization uses `id` and membership. Slug resolution must always be followed by membership/capability validation in MT-SPEC-03.

### 3. `organization_settings`

| Field | Contract |
|---|---|
| `organization_id` | Primary key and foreign key to `organizations(id)` with delete restricted |
| `record_visibility` | `organization` or `assigned_only`; defaults to the approved POL-03 value |
| `public_display_name` | Optional safe override; fallback is organization `display_name` |
| `primary_color` / `accent_color` | Optional normalized `#RRGGBB` values passing contrast/safety validation |
| `logo_asset_id` | Nullable future reference to an organization-owned verified asset; unusable until MT-SPEC-07 |
| `feature_defaults` | Versioned allowlisted JSON object for UX/workflow defaults only |
| `feature_schema_version` | Positive integer identifying validation schema |
| `created_at` / `updated_at` | Server timestamps |
| `version` | Positive integer for optimistic concurrency |

Rules:

- Settings are created in the same transaction as the organization.
- Do not accept raw logo URLs, HTML, CSS, SVG markup, JavaScript, external font URLs, or arbitrary JSON keys.
- Feature defaults cannot exceed server entitlements and cannot grant a capability.
- `assigned_only` is applied only after organization scope and only by domains that explicitly implement/test it.
- Owners/admins changing settings cannot alter `plan_key`, billing state, organization status, or security policy through this table.
- Public branding is exposed through a separate allowlisted projection.

### 4. `organization_memberships`

| Field | Contract |
|---|---|
| `id` | UUID primary key |
| `organization_id` | Required foreign key to `organizations(id)` |
| `user_id` | Required foreign key to `auth.users(id)` |
| `role` | `owner`, `admin`, `member`, or `viewer` |
| `status` | `active`, `suspended`, or `removed` |
| `invitation_id` | Nullable accepted invitation that established/reactivated membership |
| `invited_at` | Nullable original invitation timestamp |
| `joined_at` | Required once membership becomes active |
| `suspended_at` / `suspended_by_user_id` | Nullable suspension evidence |
| `suspension_reason_code` | Nullable allowlisted safe reason |
| `removed_at` / `removed_by_user_id` | Nullable removal evidence |
| `removal_reason_code` | Nullable allowlisted safe reason |
| `created_at` / `updated_at` | Server timestamps |
| `version` | Positive integer for optimistic concurrency |

Constraints:

- unique `(organization_id, user_id)`;
- unique `(id, organization_id)` for later composite references;
- state/timestamp consistency checks;
- `joined_at` cannot be cleared by suspension/removal;
- removed/suspended membership rows remain retained;
- re-invitation reactivates the existing pair transactionally rather than inserting a duplicate;
- direct table mutations are denied to browser roles.

An invitation is stored only in `organization_invitations` until acceptance because an invitee may not yet have an Auth user. The membership state therefore does not include `invited`.

### 5. `organization_invitations`

| Field | Contract |
|---|---|
| `id` | UUID primary key |
| `organization_id` | Required organization foreign key |
| `email_normalized` | Required canonical email, maximum 320 characters |
| `intended_role` | `admin`, `member`, or `viewer`; never `owner` |
| `token_hash` | Unique SHA-256 hash of a cryptographically random raw token |
| `token_prefix` | Optional short non-secret lookup/support prefix |
| `token_version` | Positive integer incremented on resend/replacement |
| `status` | `pending`, `accepted`, `revoked`, or `replaced` |
| `expires_at` | Required future timestamp; always checked transactionally |
| `invited_by_membership_id` | Active owner/admin membership in the same organization |
| `created_at` / `last_sent_at` | Server timestamps |
| `send_count` | Nonnegative count |
| `delivery_state` | `pending`, `sent`, or `failed` |
| `last_delivery_error_code` | Safe provider classification without raw response |
| `accepted_at` / `accepted_by_user_id` | Nullable acceptance evidence |
| `accepted_membership_id` | Nullable resulting membership |
| `revoked_at` / `revoked_by_membership_id` | Nullable revocation evidence |
| `replaced_at` / `replacement_invitation_id` | Nullable resend/replacement chain |
| `version` | Positive integer |

Constraints and policy:

- only one effective pending invitation per `(organization_id, email_normalized)`;
- token entropy is at least 256 bits;
- raw tokens are returned only to the internal delivery boundary and are never stored;
- initial recommended expiration is 72 hours; approval of this SPEC approves that value unless SPEC-25's decision record provides another reviewed value;
- expiration is enforced from `expires_at` even if a background job has not changed `status`;
- resend creates a new token/hash and marks the prior invitation `replaced` so old links stop working immediately;
- invitation lists never return token hashes, raw tokens, full delivery-provider responses, or unnecessary account-existence data;
- owner invitations are forbidden; owner promotion uses the ownership workflow;
- email normalization is implemented once in a shared backend utility and tested against Supabase's accepted identity format.

### 6. `organization_events`

This append-only domain history exists before MT-SPEC-04's generalized `audit_events` and must be traceable into it.

| Field | Contract |
|---|---|
| `id` | UUID primary key |
| `organization_id` | Required organization foreign key |
| `event_type` | Allowlisted versioned event name |
| `actor_type` | `member`, `platform_operator`, or `system` |
| `actor_user_id` / `actor_membership_id` | Nullable according to actor type; organization-consistent when present |
| `target_type` / `target_id` | Safe target identity |
| `request_id` | Required bounded correlation identifier |
| `metadata` | Redacted allowlisted JSON summary |
| `occurred_at` | Server timestamp |

Required event types include:

- `organization.created`;
- `organization.settings_updated`;
- `organization.suspended`;
- `organization.reactivated`;
- `organization.deletion_requested`;
- `organization.deletion_cancelled`;
- `organization.deletion_blocked`;
- `organization.deleted`;
- `organization.export_requested`;
- `member.invited`;
- `member.invitation_resent`;
- `member.invitation_revoked`;
- `member.invitation_accepted`;
- `member.role_changed`;
- `member.suspended`;
- `member.reactivated`;
- `member.removed`;
- `member.left`; and
- `ownership.transferred`.

Events contain IDs, prior/new safe states, and reason codes—not raw invitation tokens, full emails, credentials, provider errors, or customer-content payloads.

### 7. Lifecycle support tables

#### `organization_deletion_requests`

Store organization, requesting owner membership, request/confirmation timestamps, policy version, scheduled deletion time, state (`pending`, `cancelled`, `executing`, `blocked`, `completed`), cancellation/finalization actor, safe reason code, and version. Enforce at most one nonterminal request per organization.

#### `organization_export_requests`

Store organization, requesting owner membership, approved export scope, state (`queued`, `processing`, `ready`, `failed`, `expired`), request/ready/expiry timestamps, future private asset reference, safe error code, and version. Never store a public export URL.

#### `organization_legal_holds`

Store organization, state (`active` or `released`), safe reason code, restricted external case/evidence reference, platform actor, placed/released timestamps, and version. Customer APIs receive only the minimum status needed to explain that deletion cannot complete.

The detailed export file, asset cleanup, provider cleanup, worker execution, generalized audit, and platform-operator authorization are completed by MT-SPEC-03, MT-SPEC-04, MT-SPEC-07, and MT-SPEC-08. These support rows define the durable governance contract and block premature final deletion.

## Database constraints, indexes, and access

### Required constraints

- Every mutable table has explicit allowed-state and version checks.
- `organizations.slug` has a lowercased format check, unique index, and database protection against updates.
- `organization_memberships` has unique `(organization_id, user_id)` and `(id, organization_id)`.
- Invitation inviter/revoker membership references use composite `(membership_id, organization_id)` relationships.
- Accepted invitation and resulting membership must share the same organization and user.
- Settings, lifecycle requests, holds, exports, and events cannot reference another organization's membership.
- Browser `anon` and `authenticated` roles receive no direct write or function execution grants.
- RLS is enabled immediately with deny-by-default behavior. MT-SPEC-04 adds the final user-JWT/service-role policy harness.
- Security-definer functions have fixed safe `search_path`, explicit grants, server-supplied actor context, and no public execution.
- Physical organization or membership deletion is denied outside a separately reviewed retention/migration procedure.

### Required indexes

- unique `organizations(slug)`;
- `organizations(status, created_at)`;
- unique `organization_memberships(organization_id, user_id)`;
- `organization_memberships(user_id, status, organization_id)` for organization selection;
- `organization_memberships(organization_id, status, role, joined_at)` for administration;
- unique pending invitation by `(organization_id, email_normalized)`;
- unique `organization_invitations(token_hash)`;
- `organization_invitations(organization_id, status, expires_at)`;
- `organization_invitations(email_normalized, status, expires_at)` for acceptance;
- `organization_events(organization_id, occurred_at desc)`;
- lifecycle request/hold indexes beginning with `organization_id` and state.

Every list path must use bounded cursor pagination; no repository may load all organizations or memberships and filter them in application memory.

## Roles and named capabilities

Roles are fixed in this release. The database stores a role key; the backend owns one canonical, versioned role-capability registry. Route/service code asks for named capabilities and never repeats ad hoc role comparisons.

### Capability matrix

| Capability | Owner | Admin | Member | Viewer |
|---|---:|---:|---:|---:|
| `organization.read` | Yes | Yes | Yes | Yes |
| `organization.update_settings` | Yes | Yes | No | No |
| `organization.request_deletion` | Yes | No | No | No |
| `organization.cancel_deletion` | Yes | No | No | No |
| `organization.export` | Yes | No | No | No |
| `members.read` | Yes | Yes | No | No |
| `members.invite` | Yes | Yes, limited roles | No | No |
| `members.manage_member` | Yes | Yes | No | No |
| `members.manage_admin` | Yes | No | No | No |
| `members.transfer_ownership` | Yes | No | No | No |
| `contracts.read` | Yes | Yes | Yes | Yes |
| `contracts.write` | Yes | Yes | Yes | No |
| `contracts.manage` | Yes | Yes | No | No |
| `contracts.manage_links` | Yes | Yes | No | No |
| `properties.read` | Yes | Yes | Yes | Yes |
| `properties.write` | Yes | Yes | Yes | No |
| `properties.manage` | Yes | Yes | No | No |
| `files.read` | Yes | Yes | Yes | No |
| `integrations.read` | Yes | Yes | No | No |
| `integrations.manage` | Yes | No | No | No |
| `audit.read` | Yes | Yes | No | No |
| `billing.read` | Yes | No | No | No |
| `billing.manage` | Yes | No | No | No |

Rules:

- Owner may invite admin/member/viewer and manage any membership subject to last-owner protection.
- Admin may invite member/viewer and change, suspend, reactivate, or remove member/viewer memberships only.
- Admin cannot create, promote, demote, suspend, remove, or transfer an owner/admin.
- No organization role can create platform-operator authority.
- Member/viewer cannot list organization membership or invitations by default.
- Viewer private-file access is denied by default because attachments include highly sensitive evidence.
- External contract participants are not included in this matrix.
- Future custom roles require a separate SPEC and migration.
- A role capability may be further restricted by organization status, membership status, plan entitlement, and record visibility, but never expanded by a frontend flag.

### Record visibility policy

`record_visibility = organization` is the recommended default:

- role capability determines whether a member may read/write the organization domain;
- creator/assignee fields support attribution, filters, and workflow;
- organization scope is always applied first.

`record_visibility = assigned_only` is optional:

- it applies only to ordinary member/viewer business-record queries explicitly designed for it;
- owners/admins retain organization-wide governance access;
- it never hides memberships, lifecycle obligations, or security events from authorized governance roles;
- it cannot make a record visible outside its organization;
- MT-SPEC-05 and MT-SPEC-06 must define/test precise contract/property semantics before the setting can be enabled.

Until those domain SPECs implement it, the backend must reject attempts to enable `assigned_only` with `409 POLICY_NOT_AVAILABLE` rather than storing a setting with no enforcement.

## Organization creation and onboarding

### First-release organization creation

Under the recommended POL-02 decision, organizations are created only by a separately authorized platform operator:

1. Verify the initial owner Auth user and confirmed email.
2. Validate slug, names, locale, time zone, plan key, and creation source.
3. Lock/reserve the slug.
4. In one database transaction create the organization, default settings, initial active owner membership, and `organization.created` event.
5. Return a safe organization summary; never return provider configuration or secrets.
6. Require the owner to reauthenticate/refresh organization context through MT-SPEC-03 before access.

If any step fails, no partial organization/settings/membership is retained.

The service and schema may support reserved `self_service` creation, but the route and UI remain disabled until POL-02 is changed through an approved decision and a separate review covers abuse, email verification, billing/plan selection, slug squatting, and automated provisioning.

SPEC-26 does not create production Azar or Solar. MT-SPEC-10 uses the reviewed creation service to create Azar with fixed approved identifiers and later creates Solar as the isolation canary.

### Create versus join

The UI and API must keep these concepts distinct:

- **Create organization:** establishes a new customer and initial owner; platform-only in the first release.
- **Join organization:** accepts one valid invitation after the invitee authenticates/verifies the exact invited email.

The legacy registration `company` text must not create, select, discover, or join an organization.

## Invitation lifecycle

### Invitation creation

- Require an active organization and an actor with `members.invite`.
- Resolve the maximum role the actor may invite.
- Normalize the email on the server and validate syntax/length.
- Reject an existing active membership with `409 ALREADY_A_MEMBER`.
- Handle suspended/removed memberships only through an explicit reactivation invitation.
- Prevent duplicate effective pending invitations for the same organization/email.
- Generate a 32-byte cryptographically secure token, store only its hash, and expose the raw token solely to the delivery boundary.
- Create invitation and `member.invited` event transactionally.
- Queue/send email only after the transaction commits.
- Return invitation metadata without revealing whether the email belongs to an existing global account.

### Invitation delivery

The invitation email must contain:

- safe public organization display name;
- inviter display name;
- intended role label;
- expiration time in the recipient's locale/time zone where available;
- one HTTPS acceptance link;
- security copy explaining that the link is single-use and should not be forwarded.

The acceptance URL should place the raw token in a URL fragment, for example `/invitations/accept#invitation_token=...`, so it is not sent in the initial HTTP request or referrer. The frontend reads it into memory and submits it in the body of `POST /api/invitations/accept`. It must not persist the token to local storage, analytics, error reporting, or logs.

Email-provider selection/configuration must be documented before invitation delivery is enabled. Tests use a fake adapter. Delivery failure keeps the invitation auditable and allows authorized resend; it does not create membership.

### Resolve and accept

Invitation resolution may return only:

- safe organization display name/branding;
- intended role;
- expiration state; and
- a masked invited email.

Acceptance requires:

1. valid raw token hash;
2. `pending` status and unexpired `expires_at`;
3. active organization;
4. authenticated Auth user;
5. verified Auth email;
6. exact normalized email match;
7. allowed intended role;
8. no conflicting active membership; and
9. database lock/version preventing concurrent reuse.

In one transaction:

- lock the invitation and organization;
- create or reactivate the unique membership;
- set role/status/join timestamps;
- mark the invitation accepted with actor/membership;
- append `member.invitation_accepted`;
- issue a session-invalidation/context-refresh signal consumed by MT-SPEC-03.

Raw token reuse, wrong email, replaced/revoked/expired token, suspended/deleted organization, or concurrent loser creates no membership or partial state.

### Resend, revoke, and expiration

- Resend requires `members.invite` and the same role-boundary rules.
- Resend creates a replacement token/invitation version and invalidates the previous raw link immediately.
- Revoke requires authorization, locks the invitation, records actor/time, and is idempotent for an already revoked invitation.
- Acceptance and revoke races are serialized; exactly one terminal outcome wins.
- Expiration is authoritative from server time even before cleanup.
- Expired invitation cleanup must never delete governance events.
- Distributed invitation/rate-abuse limits are completed by MT-SPEC-04; until then invitation endpoints cannot be enabled for a second real organization.

### No domain-based enrollment

- Do not search or suggest organizations from a submitted email domain.
- Do not create membership because an email ends with an organization's domain.
- Do not expose organization existence through registration or invitation errors.
- Future verified-domain/JIT provisioning belongs to MT-SPEC-09 enterprise SSO.

## Membership lifecycle

### Active membership

An active membership may receive capabilities from its role only while the organization is active and the Auth account is eligible. Profile state or frontend cache never substitutes for this lookup.

### Role change

- Require expected membership version and an actor with the appropriate management capability.
- Validate actor/target role hierarchy.
- Prevent admin from modifying admin/owner.
- Prevent promotion to owner through the general role endpoint.
- Lock organization and relevant memberships.
- Preserve prior role in `organization_events`.
- Trigger current-session/capability refresh in MT-SPEC-03.
- Return `409 VERSION_CONFLICT` on stale updates.

### Suspension and reactivation

- Suspension preserves the membership row and role but makes it unauthorized.
- Record actor, timestamp, safe reason code, and event.
- Suspension takes effect for protected requests through MT-SPEC-03 revocation/context checks.
- Suspending an active owner is rejected if it would leave no other active owner.
- Reactivation requires an authorized owner/admin within hierarchy and clears current suspension fields while preserving events.
- A removed membership cannot be reactivated by the generic suspension endpoint; use a new invitation.

### Removal and voluntary departure

- API "delete member" normally transitions to `removed` rather than deleting.
- Removal records actor, time, reason, and event.
- Historical business/audit references remain valid.
- Owner/admin cannot remove themselves through a target-member operation; use the explicit leave/transfer flow.
- A member/admin/viewer may leave voluntarily if no lifecycle lock blocks it.
- An owner may leave or become non-owner only when another active owner exists.
- Removing one organization's membership does not delete the Auth user/profile or other memberships.

### Last-owner invariant

Every mutation that could reduce active owners must:

1. lock the organization row;
2. load active owner memberships inside the transaction;
3. validate the post-mutation owner count;
4. write membership changes and governance events atomically; and
5. reject with `409 LAST_OWNER_REQUIRED` if the result would have zero active owners.

Concurrency tests must prove that two simultaneous owner demotions/removals/suspensions cannot both commit.

### Ownership transfer

- Require `members.transfer_ownership`, step-up authentication from MT-SPEC-03, expected organization/membership versions, and explicit confirmation.
- Target must be an active membership in the same organization.
- Lock organization, source owner, target, and active-owner set.
- Promote the target to owner first.
- Optionally retain the source as owner or demote it to `admin`, `member`, or `viewer` according to explicit request.
- Do not support `removed` as an implicit transfer side effect; departure is a separate confirmed action.
- Append one `ownership.transferred` event with safe prior/new roles.
- Refresh/revoke affected sessions.
- A retry with the same request identifier is idempotent and cannot oscillate roles.

## Organization settings and basic branding

### Settings behavior

- Owners/admins may read/update allowed settings with `organization.update_settings`.
- Updates require an expected version or `If-Match` and return `409 VERSION_CONFLICT` on stale state.
- Locale and time zone use server-maintained valid registries.
- Record visibility cannot be enabled until consuming domains enforce it.
- Feature defaults are validated against an allowlist/schema version.
- Settings mutations create `organization.settings_updated` with changed field names, not sensitive values.

### Branding behavior

- Public branding contains only display name, approved logo asset projection, and validated color tokens.
- A missing/invalid logo uses a platform default.
- `logo_asset_id` must belong to the same organization and be in a verified/approved branding state once MT-SPEC-07 is available.
- Until MT-SPEC-07, logo upload/selection remains disabled; storing an arbitrary URL is forbidden.
- Color values must be normalized and meet accessibility contrast requirements for generated UI combinations.
- External contract pages receive only the public projection, never settings, member, plan, billing, integration, or lifecycle details.
- The direct Azar asset replacement occurs in MT-SPEC-05 after each contract entry is organization-owned.

## Organization lifecycle

### State machine

| Current state | Allowed transition | Authorized actor | Result |
|---|---|---|---|
| none | `active` | Platform creation/migration service | Organization, settings, owner, event created atomically |
| `active` | `suspended` | Authorized platform operator | Mutations and external delivery blocked |
| `suspended` | `active` | Authorized platform operator | Normal capability evaluation resumes |
| `active` or `suspended` | `pending_deletion` | Confirmed active owner request subject to policy | Grace period begins; normal work disabled |
| `pending_deletion` | prior safe state | Confirmed active owner/platform cancellation | Deletion request cancelled |
| `pending_deletion` | `deleted` | System finalizer after all gates/receipts | Customer access ends; tombstone retained |
| `deleted` | none | No normal API actor | Terminal; disaster recovery is separate |

Direct state writes are forbidden. Use reviewed transactional functions/services with expected version, reason, actor, request ID, and event.

### Active

- Normal role/capability behavior applies.
- Organization creation, business records, invitations, settings, and integrations are still limited by the completion of their owning SPECs.

### Suspended

- Block all customer business mutations, member/invitation changes, file issuance, and new integration deliveries.
- Sessions may authenticate globally but cannot establish an active organization context.
- Return `423 ORGANIZATION_SUSPENDED` for known authorized users, without exposing private reason details.
- Owner read/export behavior follows approved POL-11. Security suspension may override read/export.
- Only a separately authorized platform operator may suspend/reactivate in the first release.
- Preserve data and memberships; suspension is not deletion.

### Pending deletion

- Block normal writes, invitations, role changes, asset issuance, and integration deliveries.
- Permit only explicitly approved owner read/export, deletion status, and cancellation actions.
- Record deletion policy version and scheduled time using the numeric grace period approved under POL-09.
- Active legal hold blocks finalization but does not erase the deletion request.
- Reauthentication/step-up confirmation is required by MT-SPEC-03.

### Deleted

- Mark only after all required downstream cleanup receipts succeed or are explicitly retained under policy/legal hold.
- Deny customer organization context and reserve UUID/slug.
- Retain minimum organization/membership/event tombstones according to approved policy.
- Do not automatically delete Auth users; they may belong to another organization.
- A physical database restore must reapply deletion tombstones before exposing data.

## Export, retention, legal hold, and deletion effects

### Export

- Only an active owner with `organization.export` may request a full organization export.
- Export request records scope, policy version, actor, state, and expiration.
- Generated export is private, encrypted where required, short-lived, and downloaded only after current authorization.
- Export contains an inventory/manifest/checksum and documented exclusions.
- Actual domain serializers and file packaging are completed with MT-SPEC-04 through MT-SPEC-08.
- Export failure never weakens deletion or authorization controls.

### Legal hold

- Only the separate platform/legal authority defined by policy may place/release a hold.
- Hold details live in restricted evidence; customer response exposes only necessary status.
- Active hold prevents destructive finalization and retention purge.
- Hold does not grant platform support access to customer content.
- Every hold transition is immutable and audited.

### Downstream deletion contract

Before `deleted`, finalizer requires durable receipts for:

| Domain | Required effect |
|---|---|
| Database business rows | Delete, anonymize, or retain by approved data-class policy and legal hold |
| Membership/profile | Preserve required actor history; remove organization access; do not delete cross-organization Auth identity |
| Storage | Remove or retain assets by class; no orphan remains accessible |
| Drive/Sheets/Make | Revoke access, disable delivery, and delete/anonymize provider copies where supported/policy permits |
| Integration secrets | Revoke and delete organization-owned secret references |
| Jobs/outbox/deliveries | Cancel pending work and prevent replay |
| Exports | Expire and delete private artifacts |
| Logs/audit | Retain only approved minimum, redacted and access-controlled |
| Backups | Record tombstone and eventual expiry; restored systems reapply deletion before service |
| Billing | Close/cancel according to MT-SPEC-09 without restoring application access |

The finalizer fails closed in `blocked` when any required receipt is missing. It must never mark deletion complete merely because a provider call was attempted.

## Plan key and feature defaults

- Every organization has a non-null server-assigned `plan_key` from an allowlisted registry.
- No customer settings endpoint can write `plan_key`.
- Initial plan key and feature defaults are supplied by platform creation/migration input approved under POL-08.
- Feature defaults configure presentation/workflow only; entitlement checks remain server-side.
- Billing is not required for organization isolation.
- Payment or plan failure can invoke approved suspension policy but can never grant or broaden access.
- MT-SPEC-09 may add subscriptions/entitlements without changing organization identity or membership semantics.

## Affected contracts and files

The implementation may refine filenames to match repository conventions, but it must preserve the responsibilities and public contracts below.

### Database and migrations

- Add forward-only migrations for `user_profiles`, `organizations`, `organization_settings`, `organization_memberships`, `organization_invitations`, `organization_events`, `organization_deletion_requests`, `organization_export_requests`, and `organization_legal_holds`.
- Add the unique constraints, partial indexes, foreign keys, lifecycle checks, last-owner protections, and deny-by-default RLS policies defined by this specification.
- Extend Supabase-generated or repository-owned database types after migrations are applied.
- Do not retrofit tenant columns onto contract, submission, modification, file, token, or audit records in this specification; those changes belong to MT-SPEC-04 and later specifications.

### Backend

- Add organization, membership, invitation, organization-settings, lifecycle-request, and organization-event repositories and services under `backend/src`.
- Add authenticated organization and invitation route modules and register them in `backend/src/index.ts`.
- Add capability evaluation that consumes authenticated user identity, membership state, organization state, role, and organization settings without trusting client-provided organization or role claims.
- Integrate invitation delivery through a replaceable provider boundary whose test implementation performs no real network calls.
- Reuse the existing Supabase client boundary where safe, but do not use the service-role client as a substitute for tenant-aware authorization.
- Preserve the existing legacy contract-password session flow until MT-SPEC-03 replaces it; do not silently reinterpret its free-text `company` or `role` fields as authoritative membership data.

Expected areas include:

- `backend/src/index.ts`
- `backend/src/routes/`
- `backend/src/services/`
- `backend/src/repositories/` or the repository-equivalent directory adopted by the project
- `backend/src/types.ts` and tenant-specific type modules
- `backend/tests/`

### Frontend

- Add organization creation, organization settings, member list, invitation, role-management, ownership-transfer, suspension/reactivation, export-request, and deletion-request screens or components under `frontend/src`.
- Add organization and membership API clients using the snake_case contracts in this specification.
- Add route guards that distinguish platform administration, organization ownership, organization administration, ordinary membership, and unauthenticated invitation acceptance.
- Preserve current contract-entry routes until MT-SPEC-03 introduces the authoritative organization context and MT-SPEC-04 scopes domain data.

Expected areas include:

- `frontend/src/App.tsx`
- `frontend/src/pages/`
- `frontend/src/features/organizations/`
- `frontend/src/features/auth/`
- `frontend/src/components/`

### Public, persisted, and operational contracts

- New HTTP paths, JSON properties, database identifiers, event names, audit action names, environment variables, and machine-consumed error codes are visible contracts and must use snake_case or UPPER_SNAKE_CASE as applicable.
- Invitation token hashes, lifecycle request state, ownership state, organization state, settings, and organization-event records are persisted compatibility contracts.
- Invitation email templates and delivery-provider configuration are operational contracts; providers may change without changing invitation semantics.
- No existing public endpoint, route, or response may be removed merely because an organization-aware replacement exists; deprecation and removal require an explicit later migration plan.

### Documentation

- Update environment-variable examples without adding secrets.
- Document platform-operator organization provisioning, invitation troubleshooting, last-owner recovery, suspension, export, legal hold, cancellation, and deletion runbooks.
- Update the roadmap status only after every completion gate in this specification is satisfied.


## Backend service boundaries

Create cohesive modules instead of adding organization logic to contract-specific auth services:

- `organizationRepository` — scoped persistence with no unbounded/global business methods.
- `organizationService` — creation, safe updates, and lifecycle orchestration.
- `membershipRepository` and `membershipService` — role/state mutation and last-owner locking.
- `invitationRepository` and `invitationService` — token lifecycle and acceptance.
- `organizationSettingsService` — validation and safe projections.
- `organizationGovernanceEventRepository` — append-only events.
- `organizationLifecycleService` — export/deletion/hold request state.
- `roleCapabilities` — immutable/versioned capability registry.
- shared email normalization, slug validation, branding validation, and request-ID utilities.

Every authenticated domain method receives a typed actor/context argument rather than reading request headers or global variables. MT-SPEC-03 constructs that context. Platform bootstrap methods use a separate explicit platform context and cannot be called through customer routes.

Route adapters validate public `snake_case` payloads, call services, and translate typed errors. Business transactions and authorization-sensitive invariants do not live in React components or route handlers.

## API contracts

These routes define the target interface. Routes that require the MT-SPEC-03 request context remain unmounted or fail closed until that SPEC is complete.

### Organization/profile

```text
GET    /api/profile
PATCH  /api/profile
GET    /api/organizations
GET    /api/organizations/:organization_id
PATCH  /api/organizations/:organization_id
GET    /api/organizations/:organization_id/settings
PATCH  /api/organizations/:organization_id/settings
GET    /api/organizations/:organization_id/public-branding
```

`GET /api/organizations` returns only organizations in which the current user has a retained membership, with safe membership role/state summaries. It is cursor-paginated even if the first users have few memberships.

### Membership and invitation administration

```text
GET    /api/organizations/:organization_id/members
POST   /api/organizations/:organization_id/invitations
GET    /api/organizations/:organization_id/invitations
POST   /api/organizations/:organization_id/invitations/:invitation_id/resend
POST   /api/organizations/:organization_id/invitations/:invitation_id/revoke
POST   /api/invitations/resolve
POST   /api/invitations/accept
PATCH  /api/organizations/:organization_id/members/:user_id
POST   /api/organizations/:organization_id/members/:user_id/suspend
POST   /api/organizations/:organization_id/members/:user_id/reactivate
DELETE /api/organizations/:organization_id/members/:user_id
POST   /api/organizations/:organization_id/members/me/leave
POST   /api/organizations/:organization_id/ownership-transfers
```

List endpoints use opaque cursor pagination, stable sorting, bounded page size, and organization-scoped filters.

### Lifecycle

```text
POST   /api/platform/organizations
POST   /api/platform/organizations/:organization_id/suspend
POST   /api/platform/organizations/:organization_id/reactivate
POST   /api/organizations/:organization_id/exports
GET    /api/organizations/:organization_id/exports/:export_id
POST   /api/organizations/:organization_id/deletion-requests
GET    /api/organizations/:organization_id/deletion-requests/current
POST   /api/organizations/:organization_id/deletion-requests/:request_id/cancel
POST   /api/platform/organizations/:organization_id/legal-holds
POST   /api/platform/organizations/:organization_id/legal-holds/:hold_id/release
```

Platform routes are contracts only; MT-SPEC-03 must define/authenticate the platform operator before they are mounted.

### Representative request shapes

New public keys are `snake_case`:

```json
{
  "email": "member@example.com",
  "intended_role": "member"
}
```

```json
{
  "invitation_token": "one-time-raw-token"
}
```

```json
{
  "target_user_id": "00000000-0000-0000-0000-000000000000",
  "source_owner_role_after_transfer": "admin",
  "expected_organization_version": 3,
  "expected_target_membership_version": 2
}
```

Raw invitation tokens shown above are illustrative placeholders and must never be used in tests/logs as production material.

### API behavior and errors

- `401`: no valid identity/session.
- `403`: authenticated but missing capability.
- generic `404`: organization/resource outside the caller's membership scope.
- `409 VERSION_CONFLICT`: stale optimistic version.
- `409 LAST_OWNER_REQUIRED`: mutation would leave zero active owners.
- `409 ALREADY_A_MEMBER` or `INVITATION_ALREADY_PENDING` where disclosure is safe to an authorized member manager.
- `410 INVITATION_INVALID`: generic expired/revoked/replaced/used token result.
- `423 ORGANIZATION_SUSPENDED`: current member knows their organization but it is suspended.
- `423 ORGANIZATION_PENDING_DELETION`: normal work blocked during grace period.
- `503 DEPENDENCY_NOT_READY`: staged downstream export/asset/provider capability unavailable.

Invitation resolve/accept errors must not reveal whether an arbitrary email/account/organization exists. Cross-organization direct UUID access returns generic `404`.

All protected responses use `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, and `X-Content-Type-Options: nosniff`. Cookie/CSRF/CORS details are finalized in MT-SPEC-03.

## Frontend requirements

### Application organization model

MT-SPEC-03 replaces the global `AdminSession` with user, organizations, active membership, role, capabilities, and organization status. SPEC-26 defines the types and screens that consume that context without treating frontend state as authority.

### Routes

Target protected routes include:

```text
/t/:organization_slug/settings/organization
/t/:organization_slug/settings/members
/t/:organization_slug/settings/invitations
/t/:organization_slug/settings/lifecycle
/invitations/accept
```

Platform creation/hold/suspension screens are separate and hidden until platform authorization exists.

### Member administration

- Paginated member list with display name, safe email where authorized, role, state, joined date, and available actions.
- Role/state filters and deterministic empty/loading/error states.
- Invite form with email and only roles the actor may grant.
- Pending/expired/failed-delivery invitation list with resend/revoke actions.
- Role-change, suspension, reactivation, removal, leave, and ownership-transfer dialogs.
- Last-owner and hierarchy limitations explained before submission and enforced by server.
- No member/invitation data remains visible after organization switch/logout.

### Invitation acceptance

- Read token from URL fragment into memory and remove it from the address bar with `history.replaceState`.
- Do not put it in local storage, query keys, analytics, crash reports, or DOM text.
- Show safe organization name, masked email, intended role, and expiration.
- If unauthenticated, carry acceptance through the approved auth handoff without converting the invitation into a dashboard session by itself.
- Require verified exact-email identity before acceptance.
- Provide generic states for invalid, expired, replaced, revoked, already used, wrong-account, and temporarily unavailable cases without account enumeration.

### Settings and lifecycle

- Organization name/locale/time-zone/branding form with optimistic concurrency.
- Record-visibility option disabled until domain support is complete.
- Plan key shown read-only only to authorized owner/admin where useful.
- Suspension/pending-deletion banners with allowed actions.
- Export request/status accessible only to owner.
- Deletion request/cancel flow requires clear destructive confirmation, approved grace-period date, and downstream-impact explanation.
- Ownership transfer identifies target and source post-transfer role explicitly.

### Accessibility and security UX

- All forms use labels, field descriptions, inline errors, and focus movement to the first error.
- Dialogs trap/restore focus, have accessible names/descriptions, and support keyboard cancellation where safe.
- Status changes use text and ARIA live regions, not color alone.
- Destructive operations require explicit confirmation; ownership/deletion requires step-up authentication when MT-SPEC-03 lands.
- Hidden/disabled controls are usability only; backend authorization remains authoritative.
- A cross-organization `404` must not expose another organization's name or content.

## Governance events, audit, and privacy

- Write the domain mutation and `organization_events` row in the same database transaction.
- Include request ID, actor, target, safe prior/new state, outcome, and timestamp.
- A rejected last-owner/role/lifecycle attempt is written to the generalized security audit once MT-SPEC-04 exists; do not mutate domain history on a failed transaction.
- General logs may contain organization ID, request ID, event type, role key, and safe error code.
- General logs must not contain invitation raw token/hash, complete email lists, private legal-hold details, export URLs, provider errors, or customer content.
- Invitation email is PII and must be visible only to authorized managers and delivery/acceptance services.
- Public branding projection contains no member, plan, integration, billing, lifecycle-reason, legal-hold, or internal ID data unless explicitly required.
- Retention of invitations, removed memberships, events, exports, deletion requests, and holds follows approved POL-09 values.

## Expected behavior

### Main case

1. A reviewed platform operator creates Azar through the domain service.
2. Organization, settings, initial owner membership, and event commit atomically.
3. The Azar owner invites an administrator by verified email.
4. Only the invitation hash is stored; the delivery adapter sends the raw link.
5. The invitee signs in or creates an Auth identity through MT-SPEC-03 and verifies the exact email.
6. Acceptance atomically creates the Azar membership and consumes the invitation.
7. The same Auth user may later accept a Solar invitation with a different role.
8. Organization context resolves the correct role/capabilities for each membership.
9. Owner/admin can manage permitted members while last-owner and hierarchy rules hold.
10. Settings and branding remain organization-owned and safely projected.
11. Suspension/offboarding immediately removes effective organization capabilities without deleting records/history.
12. Export/deletion requests follow approved governance and wait for all downstream receipts.

### Edge cases

- Existing Auth user has no membership: authenticated globally but no organization dashboard access.
- Same user is Azar owner and Solar viewer: each organization returns a distinct role/capability set.
- Invite email has case/whitespace differences: shared canonical normalization determines exact match.
- Invitee authenticates with a different email: generic invalid/wrong-account state, no membership.
- Two acceptance requests race: one membership/acceptance commits; the other fails generically.
- Resend and old-link acceptance race: transaction ordering yields one valid token generation only.
- Removed member is re-invited: accepted invitation reactivates the existing membership row and preserves history.
- Last owner attempts leave/demotion/removal/suspension: `409 LAST_OWNER_REQUIRED`.
- Two owners concurrently try to remove each other: row lock/post-state check prevents ownerless commit.
- Admin targets another admin/owner: `403` with no side effect.
- Slug collision or reserved slug: validation conflict, no partial organization.
- Organization becomes suspended during invitation acceptance: acceptance fails and invitation remains safe.
- Deletion becomes due under legal hold: request becomes/remains blocked; no destructive finalization.
- User removed from Azar but active in Solar: Auth user/profile/Solar membership remain intact.
- Logo asset belongs to another organization: reject generically; no public projection.
- `assigned_only` selected before contract/property support: `409 POLICY_NOT_AVAILABLE`.

### Required failures

- Supabase identity, company metadata, role metadata, email domain, or slug alone cannot create membership.
- Cross-organization member/invitation/settings/lifecycle IDs return generic `404`.
- Browser direct writes to governance tables/functions fail.
- Invitation raw token never appears in persisted rows, logs, query parameters, or list responses.
- Used/revoked/replaced/expired invitation cannot create/reactivate membership.
- General role endpoint cannot assign owner.
- Admin cannot modify owner/admin.
- No mutation can leave zero active owners.
- Suspended/removed membership yields no capability.
- Suspended/pending-deletion organization blocks normal mutations and external delivery.
- Feature/plan/branding values cannot grant authorization.
- Final deletion cannot complete with missing cleanup receipt or active legal hold.
- No production organization is created before SPEC-25 completion and MT-SPEC-10 migration authorization.

## Implementation sequence

### Phase 1 — policy and schema approval

1. Confirm SPEC-25 completion and approved policy values.
2. Approve terminology, state machines, capability matrix, retention/grace values, and invitation expiry.
3. Reconcile Supabase migration history.
4. Define traceability from each requirement/acceptance criterion to migration, service, test, and documentation.

### Phase 2 — additive database foundation

1. Add profile, organization, settings, membership, invitation, events, and lifecycle-support tables.
2. Add constraints, indexes, RLS enabled/deny defaults, safe functions, and comments.
3. Add role-capability registry/version in backend.
4. Test migrations against a disposable database.
5. Do not create/backfill production Azar or alter `contract_admin_users` in this phase.

### Phase 3 — domain services

1. Implement repositories and typed errors.
2. Implement transactional organization creation.
3. Implement invitation token/delivery lifecycle.
4. Implement membership role/state, last-owner locking, and ownership transfer.
5. Implement settings/public branding projection.
6. Implement lifecycle/export/deletion/hold request state and events.

### Phase 4 — staged APIs and frontend

1. Build thin route adapters accepting the future MT-SPEC-03 actor context.
2. Keep routes unmounted/fail closed until authoritative session/membership middleware exists.
3. Build organization/member/invitation/settings/lifecycle UI against mocked/fixture context.
4. Add accessible and Azar/Solar negative tests.

### Phase 5 — handoff

1. Verify schema, domain services, migration rollback, concurrency, API contracts, UI states, and docs.
2. Hand the organization/membership/capability interfaces to MT-SPEC-03.
3. Keep production on the contained SPEC-25 Azar-only path.
4. Production data creation/backfill occurs only under MT-SPEC-10.

## Migration, compatibility, and rollback

### Additive migration

- Add new ordered migration files; never edit applied SPEC-19/SPEC-22 migrations.
- New tables are initially empty in production.
- Do not infer organizations/memberships from free-text Auth metadata.
- Do not automatically copy `contract_admin_users` into memberships.
- Do not create a global/default organization for null values.
- Enable RLS and revoke browser writes before any data is inserted.
- All default settings/plan values come from approved platform input, not client JSON.

### Compatibility period

- SPEC-25's reviewed Azar admin allowlist/session remains the current application boundary until MT-SPEC-03.
- New organization routes remain inaccessible rather than using the global admin cookie as customer membership.
- Existing contract/property paths do not consume new organizations until their owning SPECs.
- Existing external role links remain separate capabilities.
- The production database may contain empty organization tables safely before cutover.

### Rollback

- Roll back application code while retaining additive empty/new tables.
- Do not drop tables containing governance events, accepted invitations, memberships, lifecycle requests, or holds during an incident.
- Correct schema with forward migrations after deployment.
- If invitation delivery is unsafe/unavailable, disable invitations; do not manually create unauthorized memberships.
- If role/state evaluation is uncertain, deny the operation.
- If last-owner verification fails, block all owner-reducing mutations.
- Never roll back to automatic global admin grants, email-domain joins, public membership discovery, or hard membership deletion.

## Required tests

Tests must be written before implementation and use existing TypeScript/backend/frontend patterns. Real provider calls are not used by default.

### Unit tests

- Slug normalization, reserved words, immutable update rejection, and collision handling.
- Email normalization and exact verified-email comparison.
- Profile/name/locale/time-zone/color/feature-setting validation.
- Complete role-capability matrix and deny-by-default unknown roles/capabilities.
- Role hierarchy and allowed invitation roles.
- Organization and membership state transitions.
- Last-owner post-state validation.
- Invitation token entropy/hash/constant-time comparison, expiry, resend rotation, and redaction.
- Public branding projection allowlist.
- Plan/feature values cannot grant capabilities.
- Typed error/status mapping and safe log serialization.

### Real-database and migration tests

- Apply all existing and new migrations in order to a disposable Supabase/Postgres database.
- Table, check, unique, composite foreign-key, index, trigger/function, grant, and RLS definitions match the SPEC.
- Browser roles cannot read/write governance tables directly unless an explicitly tested safe policy exists.
- Service operations create organization/settings/owner/event atomically.
- Organization slug cannot be updated directly or through service.
- Duplicate membership and pending invitation constraints hold under concurrency.
- Cross-organization invitation/membership/event/lifecycle references are rejected by constraints.
- Two concurrent owner-reducing transactions cannot both commit.
- Invitation accept/resend/revoke races produce one consistent terminal result.
- Event rows are append-only.
- Migration rollback rehearsal preserves existing contract data and new governance history.

### Backend integration/API tests

Use at least:

- Azar owner, admin, member, viewer;
- Solar owner, admin, member, viewer;
- one user who is Azar admin and Solar viewer;
- suspended/removed memberships;
- active/suspended/pending-deletion organizations;
- pending/expired/revoked/replaced/accepted invitations;
- one legal hold and deletion request.

Test:

- same-organization allowed actions by capability;
- insufficient-role denials;
- Azar actor against every Solar organization/member/invitation/settings/export/deletion UUID and vice versa;
- generic `404` with no side effect;
- invitation create/list/resend/revoke/accept and exact-email behavior;
- existing-account and new-account invitation flows through mocked MT-SPEC-03 identity;
- multi-membership role separation;
- role changes, suspension, reactivation, removal, leave, and ownership transfer;
- last-owner and concurrency errors;
- organization suspension/reactivation and pending-deletion restrictions;
- export/deletion/hold state transitions and missing receipt failure;
- settings optimistic concurrency and `assigned_only` availability guard;
- public branding contains no private fields;
- cursor pagination, bounds, filters, and stable ordering.

### Frontend tests

- Member/invitation/settings/lifecycle routes render loading, empty, success, unauthorized, suspended, conflict, and failure states.
- Role-based visible controls match capability summaries without replacing backend enforcement.
- Cross-organization switch clears/partitions member and invitation data in the MT-SPEC-03 integration fixture.
- Invite token is read from fragment, removed from the address bar, held only in memory, and excluded from query keys/logging.
- Exact-email/wrong-account, expired, revoked, replaced, used, and unavailable invitation states.
- Role/hierarchy/last-owner error presentation.
- Ownership transfer and deletion confirmation accessibility.
- Keyboard navigation, focus management, labels, dialog behavior, ARIA live status, and axe checks.
- Branding colors maintain approved contrast and unsafe inputs are not rendered.

### Security and regression tests

- No raw invitation token/hash appears in database snapshots, logs, analytics mocks, errors, URLs after fragment cleanup, or list responses.
- No endpoint joins by domain or free-text company/role.
- No customer role reaches platform routes.
- Unknown role/capability fails closed.
- Removed/suspended membership cannot use stale frontend state to mutate.
- Suspended/pending-deletion organization cannot issue invitations or integration work.
- Final owner and cross-organization attacks leave no event/business side effect.
- Existing approved Azar authentication and external contract role-link behavior remain intact during the staged period.
- No server secret or private settings field reaches frontend bundles/public branding.

## Acceptance criteria

This SPEC is complete only when:

1. SPEC-25's required policy decisions and completion evidence are approved.
2. Name, terminology, scope, state machines, and all twenty-four domain invariants are approved.
3. `user_profiles` exists and no profile/company/role metadata grants authorization.
4. `organizations` has immutable UUID/slug, names, status, locale, time zone, plan key, actor/timestamps, deletion state, and version.
5. `organization_settings` has validated branding, record visibility, safe feature defaults, and optimistic version.
6. `organization_memberships` preserves one durable user/organization row with role, state, invitation/join, suspension/removal history, and version.
7. One Auth user can hold different roles in Azar and Solar test fixtures.
8. `organization_invitations` stores only hashed single-use tokens and complete expiry/delivery/acceptance/revocation/replacement evidence.
9. Governance events and lifecycle support tables preserve append-only actor/state evidence.
10. Database constraints reject cross-organization references and duplicate memberships/invitations.
11. RLS is enabled and browser direct mutation is denied.
12. The canonical owner/admin/member/viewer capability matrix is implemented and version-tested.
13. Unknown roles/capabilities deny by default and no global customer admin exists in the new domain.
14. Organization-wide visibility is the default and `assigned_only` cannot activate before consuming domains support it.
15. Organization creation atomically creates settings, initial active owner, and event.
16. First-release self-service organization creation and domain-based joining are disabled.
17. Invitation creation, email delivery contract, resend rotation, expiry, revocation, exact-email acceptance, existing/new-account flow, and replay prevention are implemented/tested.
18. Owner cannot be assigned through invitation or general role update.
19. Admin cannot manage admin/owner, and other role hierarchy rules pass.
20. Concurrent operations cannot leave an organization without an active owner.
21. Ownership transfer is atomic, confirmed, versioned, idempotent, and audited.
22. Membership suspension/removal takes away access without deleting history or another organization membership.
23. Organization active/suspended/pending-deletion/deleted transitions and allowed operations match the approved state machine.
24. Export, deletion request/cancel, legal hold, cleanup receipt, and tombstone contracts are implemented or safely staged behind unavailable dependencies.
25. Final deletion cannot complete with active hold or missing required cleanup receipts.
26. Basic settings/public branding accepts only allowlisted safe values and never exposes private organization data.
27. `plan_key` is non-null, server-owned, and cannot grant authorization.
28. All new public API/persisted names use `snake_case`.
29. Organization/member/invitation/settings/lifecycle endpoints use typed context/capabilities or remain unmounted until MT-SPEC-03.
30. Azar/Solar cross-organization API tests return generic `404` with no side effects.
31. Frontend member/invitation/settings/lifecycle screens meet capability, state, conflict, and accessibility requirements.
32. Real-database migration, constraint, concurrency, security, backend, frontend, and regression suites pass.
33. Canonical architecture, API, environment, operation, testing, engineering, privacy/retention, and support documentation is updated.
34. A traceability matrix links each acceptance criterion to migration, code, tests, docs, evidence, and reviewer.
35. Production remains contained Azar-only; no production organization/member backfill or real Solar data is created by this SPEC.
36. Product, security, data, backend, frontend, operations, and privacy/legal owners approve completion.

## Completion gate and handoff

Passing this SPEC means the organization-governance domain and its tested contracts exist. It does not mean protected requests are tenant-aware or that business data has been migrated.

MT-SPEC-03 may proceed when:

- organization/profile/membership/invitation/settings schemas are stable;
- capability keys and role matrix are versioned;
- organization and membership state machines are implemented;
- actor/context interfaces are defined;
- invitation acceptance can signal session/context refresh;
- last-owner/ownership transfer behavior is proven under concurrency;
- public branding/private settings projections are separated; and
- no organization API is exposed through the old global administrator boundary.

Solar remains blocked until MT-SPEC-01 through MT-SPEC-08 and MT-SPEC-10 pass, plus any enabled MT-SPEC-09 module.

## Required deliverables

- Approved SPEC-26 / MT-SPEC-02.
- Ordered additive Supabase migration(s).
- Database schema/constraint/index/RLS/grant documentation.
- Canonical role-capability registry and matrix.
- Organization, membership, invitation, settings, event, and lifecycle services/repositories.
- Staged API routers and typed public contracts.
- Member, invitation, settings, and lifecycle frontend screens.
- Mock invitation delivery adapter and documented production-provider decision.
- Unit, real-database, backend integration, frontend, accessibility, concurrency, and security tests.
- Azar/Solar/multi-membership fixture.
- Lifecycle/export/deletion/legal-hold cleanup contract.
- Canonical documentation updates.
- Acceptance-criterion traceability and closure evidence.

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

Focused checks must also verify:

```bash
rg -n "company|role|isAdmin|contract_admin_users" backend/src frontend/src supabase/migrations
rg -n "organization_id|organization_memberships|organization_invitations|organization_settings" backend/src frontend/src supabase/migrations
rg -n "invitation_token|token_hash|email_normalized" backend/src frontend/src
rg -n "tenant_id|[A-Za-z]+[A-Z][A-Za-z]+:" docs/05-integrations docs/09-roadmap/specs/pending/26-SPEC-multi-tenant-organizations-memberships-onboarding-and-lifecycle.md
```

Matches are classified, not blindly rejected: historical migrations/compatibility types may still mention global roles during staged migration, while all new visible contracts must follow this SPEC and the LLM guide.

The repository currently has no root `package.json` or `docs:check` script. Until one exists, documentation verification uses required-section review, path/reference validation, Markdown checks, `git diff --check`, and the backend/frontend commands above.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Membership is accidentally inferred from Auth metadata | Only transactional membership rows authorize; metadata is presentation/import evidence only |
| Organization is left ownerless by concurrent requests | Lock organization/owner set and validate post-state in one transaction |
| Invitation token leaks through URL/logs | Fragment-based handoff, hash-only persistence, no-store/no-referrer, redaction |
| Email normalization joins wrong identity | One shared tested normalizer plus verified exact normalized Auth email |
| Resend leaves old token valid | Replacement transaction invalidates old invitation before delivery |
| Admin escalates to owner | Separate capabilities/endpoints; owner forbidden in invitations/general role patch |
| Soft removal grows membership history | Retention/index policy preserves attribution while maintaining query performance |
| Feature/plan flag becomes authorization | Capabilities come only from membership role and state; flags can restrict, never grant |
| Slug is treated as tenant proof | Immutable ID/membership authorization after slug resolution |
| Lifecycle finalizer deletes incomplete data | Required domain receipts and legal-hold gate; fail closed as blocked |
| New APIs are exposed through old global session | Keep unmounted until MT-SPEC-03 context is complete |
| Empty schema is mistaken for completed migration | Explicit MT-SPEC-10 backfill/Solar blocker and acceptance evidence |

## References

### Multi-tenant source documents

- `docs/09-roadmap/specs/research/23-RESEARCH-multi-tenant-saas-architecture.md`
- `docs/09-roadmap/specs/research/24-RESEARCH-multi-tenant-saas-specification-roadmap.md`
- `docs/09-roadmap/specs/pending/25-SPEC-multi-tenant-policy-threat-model-containment-and-inventory.md`

### Previous project SPECs used for behavior and format

- `docs/09-roadmap/specs/completed/10-SPEC-contract-generation-reworked.md`
- `docs/09-roadmap/specs/completed/17-SPEC-contract-generation-reworked.md`
- `docs/09-roadmap/specs/completed/19-SPEC-contract-generation-reworked.md`
- `docs/09-roadmap/specs/completed/20-SPEC-contract-generation-reworked.md`
- `docs/09-roadmap/specs/completed/21-SPEC-administrar-contratos-navigation.md`
- `docs/09-roadmap/specs/pending/22-SPEC-contract-management-ui-and-access-control.md`

### Repository guidance and canonical documentation

- `references/llm-guide.md`
- `references/documentation-structure-guide.md`
- `docs/01-overview/project-overview.md`
- `docs/01-overview/architecture.md`
- `docs/02-setup/environment.md`
- `docs/02-setup/external-services.md`
- `docs/05-integrations/api-contracts.md`
- `docs/06-testing/testing-strategy.md`
- `docs/07-development/engineering-standards.md`

---

Status: pending product, security, data, backend, frontend, operations, and privacy/legal approval. Author: redacted.
