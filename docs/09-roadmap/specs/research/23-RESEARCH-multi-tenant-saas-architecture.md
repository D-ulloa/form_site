# Multi-tenant SaaS architecture and implementation plan

**Date:** 2026-08-17  
**Status:** research and proposed technical design  
**Scope:** authentication, organizations, users, authorization, contracts, property submissions, modifications, files, integrations, operations, migration, and testing

## Executive summary

The project can be converted into a multi-tenant SaaS without replacing React, Express, Supabase, Google Drive, Google Sheets, or Make. The safest fit for the current stack is a **shared application and shared database with strict organization-level partitioning**. Azar, Solar, and every future real-estate agency would be represented by an `organization` record. Every authenticated person would belong to one or more organizations through a membership record, and every business record would carry a non-null `organization_id`.

This is not only a frontend navigation change and it is not safely solved by adding `organization_id` to `contract_entries` alone. Tenant isolation has to be an invariant across every layer:

- identity and sessions;
- organization membership and roles;
- every database query and database function;
- contract creation, listing, inspection, editing, status changes, archiving, and token regeneration;
- property creation, future edits, durable submission history, and retries;
- private file paths and signed URL issuance;
- Google Drive folders, Google Sheets destinations, and Make webhooks;
- caches, rate limits, audit logs, background jobs, exports, support tooling, and backups.

The current code already contains useful foundations: Supabase Auth accounts, an HttpOnly application session, durable contract entries, immutable contract-submission history, private contract buckets, hashed contract-link tokens, and server-side API routes. However, several current behaviors are incompatible with secure SaaS tenancy:

- registration and Google sign-in automatically grant global contract-administrator access;
- contract visibility is based on the individual creator rather than an agency;
- legacy contract rows with no owner are deliberately visible to every administrator;
- the contract repository loads all entries and filters them in application memory;
- the backend uses a Supabase service-role client, which bypasses Row Level Security;
- the property endpoints are not authenticated and trust editable `agent_*` values from the browser;
- the property agent identity is stored in `localStorage` and can be changed by the caller;
- property submissions have no canonical database records suitable for listing, editing, or tenant-scoped history;
- property upload sessions are held only in process memory;
- Google Drive, Google Sheets, and Make use global configuration shared by the entire deployment;
- newly created Drive folders are explicitly shared with “anyone with the link”;
- a database migration contains a fixed Make webhook and sends the complete contract row;
- the global API key is intentionally unscoped;
- branding on the external contract form is hard-coded for Azar.

The recommended migration is to create an Azar organization for all legitimate existing production data, migrate current users into Azar memberships, add organization scope everywhere, and only then onboard Solar. Existing rows must not remain “global” or visible to all future organizations. Any legacy record that cannot be confidently assigned must be quarantined for an operator decision rather than exposed.

## 1. Terminology

The word “tenant” is overloaded in this repository. In SaaS architecture it means a customer organization, while existing contract fields such as `tenant_full_name` mean the rental tenant or `inquilino`. To prevent mistakes, this design uses:

- **Organization**: a SaaS customer such as Azar or Solar.
- **Organization member**: an authenticated employee or collaborator of that agency.
- **Rental tenant / inquilino**: the person renting a property and represented by existing contract `tenant_*` fields.
- **External contract participant**: a person using a user/client contract link without gaining organization membership.
- **Platform operator**: an explicitly authorized SaaS operator who administers the service itself, not an employee of Azar or Solar.

The database and application should use `organization_id`, not `tenant_id`, for SaaS partitioning. Existing rental-domain field names do not need to be renamed as part of this project.

## 2. Desired behavior

After this work, the expected behavior is:

1. Azar has one organization record, its own members, roles, settings, branding, contracts, properties, files, audit history, and integration destinations.
2. Solar has a separate organization record with the same capabilities.
3. An Azar member cannot list, fetch, infer, modify, archive, regenerate links for, download files from, or trigger integrations for a Solar record, even if that person knows a Solar UUID or storage path.
4. A Solar member receives the same protection from Azar.
5. Organization administrators can invite, suspend, remove, and change the roles of members in their own organization only.
6. A record created by one member belongs to the organization, not permanently to that individual. `created_by_user_id` remains attribution; `organization_id` is the security boundary.
7. External contract links continue to work for their single contract and role, but do not grant access to the agency dashboard or other records.
8. Every modification records who changed what and when. Current state can be edited where the product permits it, while historical revisions remain immutable.
9. Files and external integrations are partitioned with the same organization context as the database record that owns them.
10. Removing a member revokes organization access immediately without deleting the organization’s records.

## 3. Scope and non-goals

### 3.1 Required for a safe first multi-tenant release

- Organization creation and lifecycle state.
- User profiles, organization memberships, roles, invitations, and revocation.
- A tenant-aware application session and authorization middleware.
- Non-null `organization_id` on every durable business and operational record.
- Organization-scoped contract repository methods and database functions.
- Durable, tenant-scoped property and property-submission persistence.
- Organization-scoped file issuance, verification, viewing, and cleanup.
- Organization-specific or safely partitioned Drive, Sheets, and Make routing.
- Immutable audit records for privileged actions and modifications.
- Removal of global legacy access paths.
- Migration of existing records and users into an explicit organization.
- Cross-organization automated security tests.

### 3.2 Important SaaS capabilities that may follow the isolation release

- Paid subscriptions and automated billing.
- Plan entitlements and metered quotas.
- Custom domains.
- Tenant-defined contract templates or fields.
- Single sign-on for enterprise customers.
- Database-per-organization isolation for unusually regulated customers.
- Advanced reporting and cross-record analytics.

These may be phased, but the schema should avoid blocking them.

### 3.3 Non-goals

- Giving browser clients the Supabase service-role key.
- Treating hidden buttons or frontend route guards as authorization.
- Using a caller-supplied organization name, slug, user ID, or agent ID as proof of access.
- Keeping legacy null organization values indefinitely.
- Duplicating the complete application deployment for each normal customer.

## 4. Current-state assessment

### 4.1 Authentication and accounts

The current main-page authentication in `backend/src/services/contractPasswordAuth.ts` creates or validates Supabase Auth users and converts them into a signed application cookie. The registration form’s `company` and `role` fields are stored only as user metadata. They do not create a company boundary or membership.

Both password registration and Google session establishment call `ensureContractAdminUser`, and the migrations create a signup trigger that inserts eligible users into `public.contract_admin_users`. Consequently, an account is effectively a global administrator, not a member with an organization-scoped role.

The cookie stores `userId`, email, name, `isAdmin`, and expiration. It is signed and HttpOnly, which is useful, but role state remains valid until cookie expiration even if the durable grant changes. There is no organization ID, membership ID, session revocation record, or tenant-switching concept.

### 4.2 Contract access

`contract_entries` contains `created_by_user_id`. Current SPEC-22 logic treats it as the visibility boundary:

- records owned by the current user are visible;
- records with null ownership are visible to every administrator;
- the server-wide API key can access every record.

The list endpoint calls `repository.listEntries()` without a scope, retrieves every entry, and filters the array afterward. Detail and mutation endpoints load a record by UUID before running the ownership check. This is better than frontend-only filtering, but it is not the desired organization model and creates unnecessary exposure inside the process.

`contract_submissions` preserves history, and `contract_events` records some lifecycle operations. That foundation should be retained. The missing pieces are organization scope and reliable actor attribution for every edit.

### 4.3 Property access and persistence

The property flow currently differs significantly from the contract flow:

- `/properties/media/presign` and `/properties/submit` do not require the application session;
- the caller supplies `agent_user_id`, `agent_name`, and `agent_email`;
- the frontend stores those values in `localStorage` through `AgentContext`;
- the upload preflight binds only to that caller-controlled agent ID;
- upload-session state lives in a process-local `Map`;
- the canonical result is sent to Drive, Sheets, and Make, while the local submission log contains operational status but not the complete durable property domain;
- on Vercel, the log is written to console instead of durable storage.

This means there is currently no safe database query from which an organization can list all its properties, inspect a submitted version, edit one, or audit modifications.

### 4.4 Files

Contract DNI and evidence buckets are private and signed URLs are issued only after contract-token or administrator checks. This is a good pattern, but paths are currently based on `contracts/{entryId}/...` without an organization segment.

Property paths use a global `properties/{date}/{uuid}-{filename}` prefix. Property upload metadata is accepted back from the browser after a lightweight in-memory session check; it is not durably bound to an organization, user, draft, or property record.

The Drive adapter explicitly creates an `anyone`/`reader` permission for each property folder. That makes the folder link a bearer secret and defeats strict agency-level access once the link is copied or leaked.

### 4.5 Integrations

Property Drive, Sheets, and Make destinations come from process-wide environment variables. A single deployment therefore has one parent Drive folder, one Sheet, one webhook, and one Google credential selection.

The contract generation trigger is installed in the database with a fixed Make endpoint and posts `to_jsonb(NEW)`. The complete row can include contract PII, current submission JSON, and token hashes. It has no organization-aware routing, payload allowlist, delivery record, or reliable retry reconciliation.

### 4.6 Authorization compatibility paths

The trusted gateway header, development `X-User-Id`, insecure hosted-preview mode, `CONTRACT_ADMIN_USER_IDS`, and the global `CONTRACTS_API_KEY` predate organization membership. Each must either be removed or translated into an explicit organization-scoped principal. No compatibility principal may silently retain cross-organization authority in production.

### 4.7 Frontend state

The main landing page checks the authenticated session, but `/properties/new` can be opened directly and relies on browser agent state. Contract admin pages check the session and use React Query keys containing the user ID, not an organization ID. The public contract form imports the Azar logo directly.

After organization switching is introduced, a cache key that omits `organization_id` can render Azar data while Solar is active. Cache partitioning and clearing are therefore security-relevant, even though backend authorization remains the final boundary.

## 5. Core security invariants

The implementation should treat the following as non-negotiable invariants:

1. Every durable business row belongs to exactly one organization. `organization_id` is non-null after migration.
2. Organization scope comes from an authenticated, server-validated membership or a narrowly scoped external capability token. It never comes solely from request JSON, local storage, an email domain, or a route slug.
3. Every authenticated repository method requires an organization context in its type signature.
4. Every query, update, delete, and database function matches both the record identifier and `organization_id`.
5. Child records cannot reference a parent in another organization. Composite foreign keys enforce this in the database.
6. Cross-organization lookups return a generic `404` for normal users so the API does not confirm that another organization’s identifier exists.
7. `created_by_user_id` and `assigned_to_user_id` are attribution or workflow fields, not the primary tenant boundary.
8. The Supabase service role remains server-only. Because it bypasses RLS, application and database-function scoping must still be explicit.
9. Signed file URLs are issued only after authorization against the owning organization and record. A raw storage path is never sufficient.
10. Cache keys, background jobs, idempotency keys, rate-limit keys, logs, metrics, and external integration deliveries include organization scope.
11. Organization suspension or membership revocation takes effect on the next protected request, not only when a long-lived cookie expires.
12. Legacy records are assigned or quarantined. A null value must never mean “visible to every customer.”

## 6. Recommended tenancy model

### 6.1 Shared database, shared schema

For the current scale and Supabase architecture, use one database and one set of tables, partitioned by `organization_id`. This model provides:

- one deployable application;
- simple schema evolution;
- reasonable operating cost;
- efficient onboarding;
- centralized reporting for platform operations;
- a straightforward path from the current tables.

Database-per-organization can provide stronger physical isolation, but it greatly increases migrations, connection management, monitoring, backups, and support complexity. It should be reserved for a future contractual requirement, not used as the default. Consistently carrying `organization_id` now also creates a future migration key if selected organizations need physical separation later.

### 6.2 Organizations rather than single-owner accounts

An organization owns its records. Members collaborate inside it according to permissions. For example:

- Ana creates a contract for Azar.
- Bruno, an Azar administrator, can inspect or correct it.
- Ana later leaves Azar.
- The contract remains with Azar; Ana’s membership is suspended and she can no longer access it.

This differs from the current per-user visibility model. If the product later needs “members see only their own contracts,” that should be an additional organization setting or permission, never a replacement for `organization_id` isolation.

### 6.3 Users may belong to more than one organization

The data model should support multiple memberships even if the first UI permits only one. A consultant might legitimately work with both Azar and Solar. The same Supabase Auth user can have separate roles in each organization and must explicitly switch active context.

An auth user is global identity. A membership is the organization-owned access relationship. Removing one membership must not delete an account that still has another membership.

## 7. Proposed data model

The names and exact column types should be finalized in an implementation spec, but the following topology is recommended.

### 7.1 Identity and organization tables

| Table | Purpose | Important fields and constraints |
|---|---|---|
| `user_profiles` | Application profile for a Supabase Auth user | `user_id uuid primary key references auth.users`, display name, locale, timestamps |
| `organizations` | SaaS customer | `id uuid`, globally unique immutable slug, display name, status, plan key, created-by, timestamps |
| `organization_memberships` | User-to-organization relationship | `organization_id`, `user_id`, role, status, joined/invited timestamps; unique pair |
| `organization_invitations` | Single-use invitation | organization, normalized email, intended role, hashed token, expiration, inviter, accepted/revoked timestamps |
| `organization_settings` | Organization-level behavior and branding | legal/display name, logo asset, colors, locale/time zone, optional access policy |
| `app_sessions` | Revocable application sessions | hashed opaque token, user ID, expiry, last seen, revoked timestamp, optional current organization |
| `platform_admin_users` | Exceptional platform-operator access | user ID, status, reason/grant metadata; never conflated with organization roles |

Recommended organization states are `active`, `suspended`, `pending_deletion`, and `deleted`. Recommended membership states are `invited`, `active`, and `suspended`.

Use organization roles such as:

- `owner`: organization lifecycle, billing, integrations, users, and all business operations;
- `admin`: users and all business operations, excluding ownership transfer and possibly billing;
- `member`: normal contract/property operations;
- `viewer`: read-only access to allowed organization data.

Do not store only a boolean `isAdmin`. Resolve explicit permissions from the current membership.

### 7.2 Contract tables

Add a non-null `organization_id` to:

- `contract_entries`;
- `contract_submissions`;
- `contract_events`.

Retain `created_by_user_id`, but convert it to a UUID foreign key where legacy compatibility permits. Add `updated_by_user_id` or record the actor on each immutable event/submission. Suggested contract changes include:

- `contract_entries.organization_id uuid not null`;
- `contract_entries.created_by_user_id uuid`;
- `contract_entries.assigned_to_user_id uuid` if assignment is a real product need;
- `contract_entries.version integer not null default 1` for optimistic concurrency;
- `contract_entries.updated_at timestamptz`;
- `contract_submissions.organization_id uuid not null`;
- `contract_submissions.revision_number integer not null`;
- `contract_submissions.supersedes_submission_id uuid`;
- `contract_submissions.submitted_by_type` such as `member`, `external_user_token`, or `external_client_token`;
- `contract_submissions.submitted_by_user_id uuid null`;
- `contract_events.organization_id uuid not null`;
- `contract_events.actor_user_id uuid null`;
- `contract_events.request_id`, sanitized change metadata, and event version.

Although `organization_id` can be inferred from `entry_id`, storing it on child rows enables database constraints, efficient tenant audit queries, RLS, safer archival/export, and easier incident analysis.

### 7.3 Property and submission tables

The property flow needs a canonical database model before it can support tenant-safe listing and modifications. A suitable model is:

| Table | Purpose |
|---|---|
| `properties` | Current identity and current version of an organization’s property |
| `property_revisions` | Immutable snapshots for creation and every later modification |
| `property_submission_runs` | Operational processing attempt for Drive/Sheets/Make |
| `property_media_assets` | Verified storage objects attached to a property or draft |
| `property_events` | Lifecycle and administrative audit events |

Suggested fields:

`properties`

- `id uuid primary key`;
- `organization_id uuid not null`;
- a human-facing `property_code`, unique within the organization;
- current status such as `draft`, `active`, or `archived`;
- `current_revision_id`;
- `version integer`;
- `created_by_user_id`, `updated_by_user_id`, `created_at`, `updated_at`.

`property_revisions`

- `id uuid primary key`;
- `organization_id uuid not null`;
- `property_id uuid not null`;
- `revision_number integer not null`;
- validated property payload in `jsonb` or normalized columns plus JSON for less queried fields;
- `change_kind` such as `create`, `edit`, or `correction`;
- `change_summary`;
- `created_by_user_id`, `created_at`;
- unique `(organization_id, property_id, revision_number)`.

`property_submission_runs`

- `id uuid primary key` and optional human-facing submission code;
- organization, property, and revision IDs;
- state such as `queued`, `processing`, `succeeded`, `partially_failed`, or `failed`;
- idempotency key unique within an organization;
- integration step outcomes;
- external Drive/Sheet identifiers where appropriate;
- sanitized last error and attempt timestamps.

This separates the business record from a delivery attempt. Retrying Make or Sheets must not create a new property revision.

### 7.4 Shared file-asset model

Consider converging contract and property file references onto a durable `media_assets` table:

- `id uuid` exposed to application code instead of raw paths;
- `organization_id`;
- owning domain and record ID;
- bucket and storage path, server-only;
- original filename, detected MIME type, byte size, optional checksum;
- upload state (`pending`, `verified`, `attached`, `quarantined`, `deleted`);
- creator or external-token role;
- timestamps and retention/deletion state.

The browser should submit an asset ID after upload. The server loads that row using the current organization/contract context and verifies storage metadata before attachment. This is safer than trusting a browser-returned bucket and path embedded in arbitrary JSON.

It also provides a clean migration for existing contract JSON: immutable historical submissions can keep their original references while a backfilled asset registry establishes ownership and controls future signed views.

### 7.5 Integrations, jobs, audit, and SaaS operations

Additional tables should include:

| Table | Purpose |
|---|---|
| `organization_integrations` | Enabled provider, organization-specific destination, health, and non-secret configuration |
| `organization_integration_secrets` or secret references | Encrypted OAuth refresh tokens, webhook secrets, and credential references |
| `outbox_events` | Transactional events waiting for external delivery |
| `integration_deliveries` | Provider attempts, idempotency key, response class, retry state, external identifier |
| `audit_events` | Immutable security and business audit trail with organization and actor |
| `organization_api_keys` | Hashed, revocable, scoped server-to-server keys owned by one organization |
| `usage_events` | Metered activity for quotas or future billing |
| `subscriptions` | Optional plan/customer/subscription state when billing is introduced |

Secrets should be stored through a managed secret system or strong application encryption backed by a key that is not stored in the same database. Never return decrypted credentials to the browser.

### 7.6 Composite integrity constraints

Use composite keys to make cross-organization references impossible even if application code has a bug. Conceptually:

```sql
alter table public.contract_entries
  add constraint contract_entries_id_organization_unique
  unique (id, organization_id);

alter table public.contract_submissions
  add constraint contract_submissions_entry_organization_fk
  foreign key (entry_id, organization_id)
  references public.contract_entries (id, organization_id)
  on delete restrict;
```

Apply the same pattern to events, property revisions, media assets, delivery jobs, and assignments. Foreign keys to a user acting inside an organization may also use a composite reference to `organization_memberships(organization_id, user_id)` when the actor must be an active or historical member. Where preserving history after membership deletion matters, use soft deletion/suspension rather than deleting membership rows.

### 7.7 Indexing

Every high-volume access pattern must lead with `organization_id`, for example:

- `(organization_id, created_at desc)`;
- `(organization_id, status, created_at desc)`;
- `(organization_id, created_by_user_id, created_at desc)`;
- `(organization_id, property_code)` unique;
- `(organization_id, entry_id, submitted_at desc)`;
- `(organization_id, state, next_attempt_at)` for jobs;
- `(organization_id, occurred_at desc)` for audits.

The contract admin endpoint should use database pagination and filters. It must not fetch the entire global table and filter in JavaScript.

## 8. Authentication, sessions, and organization resolution

### 8.1 Separate authentication from organization authorization

Authentication answers “who is this?” Organization authorization answers “what can this user do for Azar?” Supabase Auth should continue to authenticate identities, but membership rows must be the source of organization access.

The current `contract_admin_users` table should be replaced by organization memberships for customer access. A separate, tightly controlled `platform_admin_users` mechanism may exist for service operators, with mandatory audit and preferably step-up authentication.

### 8.2 Recommended session design

Retain an HttpOnly cookie, but make it a revocable opaque application session:

1. Generate a high-entropy random session token at successful authentication.
2. Store only its hash in `app_sessions` with `user_id`, expiration, and revocation fields.
3. Send the raw value once in a `Secure`, `HttpOnly`, `SameSite=Lax` cookie.
4. On each protected request, validate the session and load the requested organization membership.
5. Rotate the session after login, privilege changes, password reset, and sensitive account operations.
6. Revoke all relevant sessions when the account or membership is suspended.

The cookie may cache a currently selected organization for convenience, but it must not make membership or role authoritative. A durable membership lookup—or a very short-lived cache with explicit invalidation—ensures offboarding takes effect quickly.

If the existing signed self-contained cookie is retained temporarily, add `organization_id`, membership version, and session identifier, then validate all three against the database on each protected request. Do not rely on the embedded `isAdmin` boolean for the full cookie lifetime.

### 8.3 Organization selection

Authenticated application routes should be explicit, for example:

```text
/t/azar
/t/azar/contracts
/t/azar/properties
/t/azar/settings/members
```

API routes may use the immutable organization UUID:

```text
/api/organizations/:organizationId/contracts
/api/organizations/:organizationId/properties
```

The slug is presentation and routing context. The backend resolves it to an organization, verifies membership, and uses the immutable UUID internally. Changing the URL from Azar to Solar must never grant access.

For users with multiple memberships, `GET /api/auth/session` should return the available organizations and permissions, and the UI should provide an organization switcher. Switching must cancel in-flight requests and clear or partition all organization-scoped caches.

### 8.4 Registration and onboarding

The present free-text company field must be replaced with one of two explicit flows:

**Create an organization**

- verify the email account;
- create `organizations`, an `owner` membership, default settings, and an audit event in one transaction;
- generate a unique slug without using it as the authorization key;
- take the owner through integration and branding setup.

**Join an organization by invitation**

- organization owner/admin enters an email and role;
- server creates a single-use invitation with a hashed random token and expiration;
- invitee authenticates or creates an account;
- server verifies exact normalized email, invitation state, organization state, and token;
- acceptance creates or activates the membership transactionally;
- reusing, changing, or accepting a revoked invitation fails.

Do not automatically join users based only on email domain unless a future verified-domain feature is deliberately implemented.

For an initial controlled launch, invite-only organization creation by a platform operator is the lowest-risk option. Self-service organization creation can be enabled later without changing the membership model.

### 8.5 Google sign-in

Google OAuth remains an identity method, not an authorization method. A successful Google account must not automatically receive an administrator role. After identity verification, the user must either:

- accept a valid invitation;
- resume an existing membership; or
- create a new organization if self-service onboarding is enabled.

### 8.6 Account recovery and hardening

A production SaaS authentication layer should also add:

- email verification instead of creating every password account as pre-confirmed;
- password reset and email-change flows;
- login throttling and abuse monitoring;
- optional or required MFA for owners and platform operators;
- session/device listing and revocation;
- CSRF protection for cookie-authenticated mutations, using Origin checks plus a CSRF token where appropriate;
- consistent exact-origin CORS configuration;
- non-enumerating login and invitation errors where practical.

## 9. Authorization model

### 9.1 Suggested permission matrix

The exact product roles are a business decision. A safe initial matrix is:

| Action | Owner | Admin | Member | Viewer | External link |
|---|---:|---:|---:|---:|---:|
| View organization contracts/properties | Yes | Yes | Yes | Yes | One linked contract role only |
| Create contract/property | Yes | Yes | Yes | No | No |
| Edit submissions or property revisions | Yes | Yes | Yes, if enabled | No | Linked role only |
| Archive/change contract status | Yes | Yes | Optional | No | No |
| Regenerate/revoke contract links | Yes | Yes | Optional | No | No |
| View private attachments | Yes | Yes | Yes | Optional | Own linked form only |
| Invite/suspend members | Yes | Yes | No | No | No |
| Change an owner | Yes | No | No | No | No |
| Configure integrations | Yes | Optional | No | No | No |
| Manage billing/delete organization | Yes | No | No | No | No |

Implement permissions as named capabilities such as `contracts.read`, `contracts.write`, `contracts.manage_links`, `members.manage`, and `integrations.manage`. Route handlers should check capabilities rather than repeatedly hard-code role comparisons.

### 9.2 Intra-organization record ownership

The requirement describes organization-wide separation: Azar sees Azar data and Solar sees Solar data. The recommended default is collaborative visibility inside an organization. `created_by_user_id` should therefore support attribution, filtering, and assignment, not act as the base authorization condition.

If Azar later wants agents to see only their own records, add an explicit policy such as `record_visibility = organization | assigned_only` and apply it after organization scope. Organization administrators should retain an override. This rule requires dedicated tests and must not be inferred from role labels.

### 9.3 Platform operator access

Platform support must not use the same customer administrator path. If support impersonation or emergency access is required:

- require a separate platform role;
- require a reason and preferably step-up authentication;
- display that support access is active;
- make it time-limited;
- audit every viewed or modified organization and record;
- never expose it through the ordinary global API key.

## 10. Backend request context and repository design

### 10.1 Central request context

Create middleware that produces a typed context for protected routes:

```ts
interface OrganizationRequestContext {
  requestId: string;
  userId: string;
  organizationId: string;
  membershipId: string;
  role: OrganizationRole;
  permissions: ReadonlySet<Permission>;
  sessionId: string;
}
```

The middleware sequence should be:

1. validate the application session;
2. resolve the route organization;
3. load the active membership;
4. reject suspended/deleted organizations and memberships;
5. resolve permissions;
6. attach the immutable context to the request;
7. run route-specific permission checks.

Do not let individual routes rebuild this logic independently.

External contract links need a different and deliberately narrower context:

```ts
interface ContractLinkContext {
  organizationId: string;
  entryId: string;
  role: 'user' | 'client';
  authorizedTokenHash: string;
}
```

It must never be convertible into an organization membership.

### 10.2 Make unsafe calls difficult to express

Change repository interfaces so organization context is required:

```ts
findEntry(organizationId: string, entryId: string)
listEntries(organizationId: string, filters: EntryFilters, page: Page)
archiveEntry(organizationId: string, entryId: string, actorUserId: string)
listSubmissions(organizationId: string, entryId: string)
```

Avoid optional `organizationId` arguments and avoid generic `findById` methods for tenant-owned records. The TypeScript compiler should expose missed call sites during the migration.

Authenticated queries must filter in Supabase/Postgres:

```ts
client
  .from('contract_entries')
  .select('...')
  .eq('organization_id', context.organizationId)
  .eq('id', entryId)
  .maybeSingle();
```

Never retrieve all rows and call `.filter()` for authorization.

### 10.3 Database functions

Update every contract RPC to accept organization and actor context. Inside each function:

- lock/select using both `id` and `organization_id`;
- verify the actor membership for authenticated administrative operations, or verify the current token hash for external operations;
- insert child rows with the same `organization_id`;
- record actor type and ID;
- use composite foreign keys;
- return no row for a mismatched organization;
- keep a fixed safe `search_path` and restricted grants.

The status update currently performed through a direct table update should also become a scoped transactional operation that records an audit event and writes an outbox event when generation is requested.

### 10.4 RLS and the service-role caveat

Enable and test RLS policies for all organization-owned tables. A typical policy concept is that `auth.uid()` must have an active membership matching `organization_id`. RLS is valuable defense in depth and protects future direct authenticated queries.

However, the current backend uses `SUPABASE_SERVICE_ROLE_KEY`. Service-role requests bypass RLS. Therefore:

- RLS alone is not a sufficient control for this application;
- all service-role repository queries must be explicitly scoped;
- transactional functions must verify organization and membership/token context;
- the service-role client should live only in narrowly defined data/integration modules;
- no general-purpose database client should be exposed to route code;
- longer term, consider using a user-JWT-backed database client or a dedicated least-privileged backend role for normal business queries.

### 10.5 Error handling

- Unauthenticated: `401`.
- Authenticated but lacking an organization capability: `403`.
- Record not found in the caller’s organization, including an ID that exists elsewhere: `404`.
- Suspended organization: a stable organization-state error without revealing other tenants.
- Concurrency conflict: `409` with the latest version metadata.

Do not include another organization’s name, user, record status, storage path, provider response body, or secret in an error.

### 10.6 Organization-scoped API keys

Replace the one global `CONTRACTS_API_KEY` with database-backed keys:

- key belongs to one organization;
- raw key shown once, only a strong hash stored;
- prefix identifies the candidate record without revealing the secret;
- scopes such as `contracts:create` or `properties:write`;
- expiration, last-used timestamp, creator, and revocation;
- optional IP restriction;
- every request produces the same organization request context as a member request.

A platform-level integration key, if absolutely necessary, must use a separate endpoint and explicit organization argument, with a narrow scope and complete audit. It should not make normal customer endpoints silently global.

Remove `CONTRACT_ALLOW_INSECURE_AGENT_ID` from any environment that can contain real customer data. Development identities should resolve to an explicit seeded development organization.

## 11. Contract workflow changes

### 11.1 Creation

When a member creates a contract:

- derive organization and creator from the request context;
- ignore or reject caller-supplied ownership fields;
- insert `organization_id`, `created_by_user_id`, and actor event atomically;
- generate role tokens as currently done and store only their hashes;
- include the organization’s public name/branding in the returned role experience, not in the authorization decision;
- count the creation against organization entitlements if quotas are enabled.

### 11.2 Listing and inspection

List entries using a tenant-scoped paginated SQL query. Supported filters can include status, creator, assignee, address, and creation date, but every query begins with organization scope.

Detail inspection must load the entry, submissions, events, schemas, and media from the same organization. Signed view URLs are generated only after all those relationships are validated.

### 11.3 External role links

The existing HMAC-hashed user and client link pattern can remain, subject to these changes:

- resolve the entry and its organization together;
- validate the token against the selected entry/role;
- authorize upload/view actions only for that entry and role;
- include `organization_id` in new storage paths and asset records;
- rate-limit by organization, entry, role, token fingerprint, and IP using a distributed store;
- allow an organization administrator to revoke a token without exposing its hash;
- never log raw query tokens;
- strip raw tokens from the address bar as early as practical or exchange them for a short-lived, entry-scoped HttpOnly capability session.

Public link holders remain outside the member model. An external client submitting Solar’s form cannot browse Solar’s contracts, and a copied Azar token cannot be reused against a Solar entry.

### 11.4 Corrections and modifications

The current `contract_submissions` history is valuable and should remain append-only. Improve it by recording:

- revision number;
- whether the change came from the original role link, an authenticated member, or a platform support action;
- authenticated actor ID when present;
- request ID and timestamp;
- reference to the superseded submission;
- a redacted change summary for audit display.

`contract_entries.user_submission` and `client_submission` may remain current-state projections for fast reads. The immutable submission rows are the source of history. Administrative edits must update the current projection and append history in one transaction.

Use optimistic concurrency for admin edits. The browser submits the version it opened; if another member has already changed the record, return `409` rather than silently overwriting the newer change.

### 11.5 Status changes, archive, and link regeneration

Each mutation must:

- require a named permission;
- match organization and entry ID in the database operation;
- record actor, old state, new state, request ID, and timestamp;
- enqueue external work through the outbox rather than call a fixed webhook from a raw table trigger.

### 11.6 Contract schemas and templates

The current code-defined schema can remain platform-global for the initial release. Store a schema/template version on each entry so later code changes do not reinterpret historical submissions.

If agencies will customize contract fields or generated documents, introduce versioned `contract_templates` owned by an organization. Never edit a template version in place after it has entries; publish a new version. Platform-global templates can have a null owner only in this dedicated template table and must be explicitly marked as platform templates—this must not become a general “null means globally visible” rule.

## 12. Property workflow changes

### 12.1 Authenticate every endpoint

Both property preflight and final submission must require an organization member with `properties.write`. The server derives:

- organization ID;
- user ID;
- user display name and email if a snapshot is needed;
- entitlements and upload quota.

Remove `agent_user_id`, `agent_name`, and `agent_email` as authoritative request fields. If integrations need a creator snapshot, build it on the server from the authenticated profile. The browser must not be able to submit as another agent.

### 12.2 Replace `AgentContext`

Delete the security role of `AgentContext` and the editable `form_site_agent` local-storage record. The page header can display session/membership profile data. If an administrator needs to submit on behalf of another member, implement a named `properties.create_for_member` permission, an explicit UI, server validation that the target is in the same organization, and an audit event.

### 12.3 Durable creation flow

A robust flow is:

1. Create a tenant-scoped property draft and upload session in Postgres.
2. Issue signed upload URLs for asset records under that draft.
3. Browser uploads directly to private storage.
4. Server verifies each object’s actual metadata and marks it verified.
5. Final request validates property fields, asset ownership, quota, and cover selection.
6. In one transaction, create the property, first immutable revision, submission run, audit event, and outbox records.
7. A worker performs Drive/Sheets/Make delivery with idempotency and records each attempt.
8. UI polls or subscribes to the durable submission-run status.

The initial API may remain synchronous for compatibility, but canonical records and outbox events should be committed before external calls. External providers must not be the only durable copy of a property.

### 12.4 Property modifications

Add explicit endpoints and UI for later edits rather than resubmitting an untracked full form:

- `GET` current property and version;
- `PATCH` with expected version or `If-Match`;
- server validates the complete resulting payload;
- transaction appends a `property_revision`, updates the current projection/version, records an event, and enqueues required integration updates;
- conflict returns `409` with current version;
- history endpoint returns organization-scoped revisions and actors.

Whether edits should update an existing Sheet row, append a new row, or notify Make is a product decision. It must be expressed as a versioned integration rule, not left implicit.

### 12.5 Retry and idempotency

Require an idempotency key for property creation and sensitive mutation endpoints. Store it with organization ID, actor, request fingerprint, and result. Reusing the same key and same payload returns the original result; reusing it for a different payload returns a conflict.

This prevents a browser retry from producing two Drive folders, two Sheet rows, or two properties. Provider calls also need stable delivery IDs and reconciliation because a timeout does not prove that Google or Make did not accept a request.

## 13. File and storage isolation

### 13.1 Private storage paths

Use paths that visibly encode ownership and use random asset IDs:

```text
organizations/{organizationId}/properties/{propertyId-or-draftId}/{assetId}/{safeFilename}
organizations/{organizationId}/contracts/{entryId}/client/inquilinos/{index}/{assetId}/{safeFilename}
organizations/{organizationId}/contracts/{entryId}/client/garantes/{index}/{field}/{assetId}/{safeFilename}
organizations/{organizationId}/branding/{assetId}/{safeFilename}
```

A path prefix is defense in depth, not authorization by itself. Database ownership and current membership/token checks remain mandatory.

### 13.2 Upload lifecycle

Persist upload sessions and pending assets in the database or a durable distributed store. Each upload record should bind:

- organization;
- authenticated member or external contract capability;
- intended owner record/draft;
- expected filename, MIME type, and size;
- expiration;
- single-use completion state.

After direct upload, verify actual Storage metadata. Reject wrong bucket, path, size, MIME type, owner, expired session, duplicate attachment, or an object already attached elsewhere. Consider content scanning for documents if the deployment threat model warrants it.

Process-local Maps are not sufficient on Vercel or any horizontally scaled deployment because a final request can reach a different instance.

### 13.3 Downloads and views

- Keep Supabase buckets private.
- Return short-lived signed URLs only after authorization.
- Prefer returning asset IDs to clients, not bucket/path values.
- Bind an external contract participant to the exact entry and role.
- Do not put signed URLs in durable records, analytics, or logs.
- Use download responses with safe content disposition and MIME handling.
- Define retention and deletion rules for DNI and guarantor evidence because they contain sensitive personal data.

### 13.4 Google Drive

Stop creating `anyone` reader permissions. Choose one of:

- platform-managed Google identity with a private folder subtree for each organization and explicit sharing to an organization-controlled Google group/account;
- organization-connected Google OAuth/Workspace credentials, creating resources within that organization’s Drive;
- keep files canonical in private Supabase Storage and use Drive only as an optional tenant-specific export.

The application should not return a Drive URL that bypasses organization controls. If a user is expected to open Drive directly, Google permissions must independently restrict that resource to the correct agency.

### 13.5 Orphan cleanup and quotas

Add a scheduled job that deletes expired, unattached pending uploads after a safe grace period. Track verified bytes per organization and enforce plan limits before issuing signed upload URLs. Cleanup and quota queries must be organization-scoped and auditable.

## 14. External integration architecture

### 14.1 Configuration choices

There are two viable models:

**Platform-managed connectors**

- one platform Google/Make connection;
- a distinct private Drive subtree and preferably distinct spreadsheet/destination for each organization;
- simpler onboarding;
- platform bears provider quota and must enforce strong routing.

**Bring-your-own connector**

- each organization authorizes its own Google account and configures its own Make endpoint;
- stronger external ownership and quota separation;
- more OAuth, secret management, refresh, revocation, and support work.

A practical first release is platform-managed credentials with distinct organization destinations, while designing `organization_integrations` so organization-owned OAuth can be added later.

### 14.2 Google Drive and Sheets

Move destination fields out of global environment variables for customer routing. Resolve an integration configuration only after organization authorization. Store non-secret values such as:

- Drive parent folder ID;
- spreadsheet ID and range/tab;
- enabled/disabled state;
- credential reference;
- last health check and last error classification.

Recommended isolation is one spreadsheet per organization. A shared spreadsheet with one tab per organization is cheaper but gives weaker external access separation and makes operator mistakes more dangerous. The database remains canonical; Sheets is a projection.

Every delivery should include a stable application ID. For Sheet appends, store the intended row identity and reconcile ambiguous failures before retrying. If edits update a row, store the exact external row or developer metadata identifier; do not search only by address or timestamp.

### 14.3 Make/webhooks

Remove the current fixed database webhook trigger. Rotate/revoke the committed endpoint before treating the repository or environment as secure. The replacement should:

1. write a sanitized `outbox_events` row in the same transaction as the business change;
2. let a worker resolve the owning organization’s enabled Make/webhook integration;
3. build an allowlisted payload that excludes token hashes, storage paths, secrets, and unnecessary PII;
4. include event ID, organization-scoped resource ID, schema version, and idempotency key;
5. sign requests with an organization-specific secret where the receiver supports verification;
6. record attempts and use bounded exponential backoff;
7. move exhausted deliveries to a visible dead-letter state with a safe manual retry action.

If organization administrators can enter arbitrary webhook URLs, protect the server from SSRF: require HTTPS, restrict allowed ports and providers where possible, reject loopback/private/link-local destinations after DNS resolution, defend against redirects and DNS rebinding, limit response size/time, and use controlled egress.

### 14.4 Transactional outbox and worker

External calls must not occur inside a database transaction, and a database row trigger should not directly call a customer webhook. The outbox pattern provides atomic intent plus reliable asynchronous delivery:

```text
Business transaction
  -> update contract/property
  -> append audit event
  -> insert outbox event
  -> commit

Worker
  -> claim organization-scoped event
  -> call provider with idempotency metadata
  -> record result
  -> retry or complete
```

Vercel request handlers are not a reliable long-running worker. Use a supported durable queue/worker, a Supabase queue plus scheduled processor, or a separate worker service. Claim jobs with locking/leases so two instances do not deliver the same event concurrently.

### 14.5 Integration secrets

- Encrypt OAuth refresh tokens and webhook secrets at rest with a managed key.
- Keep secret values out of `jsonb` audit payloads and provider error logs.
- Show only masked identifiers in the UI.
- Restrict connect/disconnect operations to `integrations.manage`.
- Audit secret creation, rotation, test, and revocation without recording the secret.
- Support a “test connection” operation that writes no business data or uses an explicit sandbox target.

## 15. API surface

The exact routes can evolve, but a coherent organization-scoped API might be:

### 15.1 Authentication and organizations

```text
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/password/reset-request
POST   /api/auth/password/reset
GET    /api/auth/session

POST   /api/organizations
GET    /api/organizations
GET    /api/organizations/:organizationId
PATCH  /api/organizations/:organizationId
POST   /api/organizations/:organizationId/select
```

The session response should include safe organization summaries and effective capabilities, not integration secrets or global admin flags.

### 15.2 Memberships and invitations

```text
GET    /api/organizations/:organizationId/members
POST   /api/organizations/:organizationId/invitations
GET    /api/organizations/:organizationId/invitations
POST   /api/invitations/:token/accept
POST   /api/organizations/:organizationId/invitations/:invitationId/revoke
PATCH  /api/organizations/:organizationId/members/:userId
DELETE /api/organizations/:organizationId/members/:userId
```

“Delete member” should normally suspend the membership so audit attribution remains intact.

### 15.3 Contracts

```text
POST   /api/organizations/:organizationId/contracts
GET    /api/organizations/:organizationId/contracts
GET    /api/organizations/:organizationId/contracts/:entryId
PATCH  /api/organizations/:organizationId/contracts/:entryId/submissions/:role
POST   /api/organizations/:organizationId/contracts/:entryId/archive
POST   /api/organizations/:organizationId/contracts/:entryId/status
POST   /api/organizations/:organizationId/contracts/:entryId/tokens/:role/regenerate
GET    /api/organizations/:organizationId/contracts/:entryId/history
```

External token endpoints can keep their current entry-based form, since the token resolves a single organization-bound entry:

```text
GET    /api/contracts/:entryId/schema?role=...
POST   /api/contracts/:entryId/submit?role=...
POST   /api/contracts/:entryId/dni-uploads/presign
POST   /api/contracts/:entryId/evidence-uploads/presign
```

### 15.4 Properties

```text
POST   /api/organizations/:organizationId/property-drafts
POST   /api/organizations/:organizationId/property-drafts/:draftId/media/presign
POST   /api/organizations/:organizationId/property-drafts/:draftId/submit
GET    /api/organizations/:organizationId/properties
GET    /api/organizations/:organizationId/properties/:propertyId
PATCH  /api/organizations/:organizationId/properties/:propertyId
GET    /api/organizations/:organizationId/properties/:propertyId/revisions
GET    /api/organizations/:organizationId/submission-runs/:runId
POST   /api/organizations/:organizationId/submission-runs/:runId/retry
```

### 15.5 Settings, integrations, and audit

```text
GET/PATCH /api/organizations/:organizationId/settings
GET       /api/organizations/:organizationId/integrations
PUT       /api/organizations/:organizationId/integrations/:provider
POST      /api/organizations/:organizationId/integrations/:provider/test
DELETE    /api/organizations/:organizationId/integrations/:provider
GET       /api/organizations/:organizationId/audit-events
```

List endpoints require cursor pagination, bounded page sizes, stable sorting, and tenant-scoped filters.

## 16. Frontend implementation

### 16.1 Application providers and routing

Replace `AgentProvider` with an authentication/organization layer that exposes:

- current user;
- available organizations;
- active organization;
- membership role and capabilities;
- organization settings/branding;
- loading, suspended, and unauthenticated states.

Add protected route layouts under `/t/:organizationSlug`. Opening a protected URL directly must wait for server session and membership validation. Redirecting in the browser is usability; the API remains authoritative.

### 16.2 Organization switcher

For multi-membership users:

1. cancel active organization requests;
2. clear organization-specific form drafts unless deliberately retained under a scoped key;
3. switch server/session context;
4. reset React Query data or use new keys;
5. load the new branding and navigation;
6. never briefly render the prior organization’s details.

All query keys must include the immutable organization ID:

```ts
['contracts', organizationId, filters]
['contract', organizationId, entryId]
['properties', organizationId, filters]
['members', organizationId]
```

### 16.3 Member administration

Add organization settings screens for:

- member list and role;
- invite creation, expiry, resend, and revocation;
- membership suspension/removal;
- transfer of ownership with confirmation;
- integration state;
- brand name, logo, and colors;
- plan/usage when applicable.

UI controls should be hidden or disabled based on capabilities, while the backend repeats every check.

### 16.4 Contract and property screens

- Contract lists become organization-wide according to the selected visibility policy.
- Property submissions gain list/detail/history and durable status pages.
- Creation pages use session identity instead of `AgentModal`.
- Modification forms include record version and handle `409` conflicts.
- Retry actions target a specific durable integration run, not the entire form submission blindly.
- Errors never reveal another organization’s existence.

### 16.5 Branding

Replace the direct Azar asset import on the hosted contract page with branding loaded from the entry’s organization-safe public projection. Only public branding fields should be exposed: display name, logo asset URL, and approved theme values. Do not expose organization settings, members, integration IDs, or billing data to external contract participants.

Validate uploaded logos and sanitize theme values. Provide platform defaults when no custom branding exists.

## 17. Audit history and observability

### 17.1 Immutable audit event

Every security-sensitive action should append an audit event with:

- organization ID;
- actor type and actor user/API-key ID when present;
- action name;
- target type and ID;
- request ID;
- timestamp;
- source IP and user agent subject to privacy policy;
- old/new state summary or changed field names;
- outcome and failure classification;
- support-access reason when applicable.

Sensitive contract values, DNI data, raw role tokens, signed URLs, storage paths, credentials, and password/session material must not be copied into general logs. Detailed business revisions belong in access-controlled domain tables; audit summaries should be redacted.

### 17.2 Logs and metrics

Structured application logs should include organization ID and request ID for correlation but avoid high-risk PII. Metrics can aggregate by plan or hashed/internal organization identifier; do not use user emails or addresses as labels.

Track:

- authentication failures and invitation abuse;
- authorization denials, especially cross-organization ID attempts;
- active members and organizations;
- contract/property operations;
- upload bytes and failures;
- integration queue depth, latency, retries, and dead letters;
- quota rejections;
- session revocations and support access.

### 17.3 Durable storage

Move property submission logs and retained legacy contract audit files into tenant-scoped durable database/object records. Local filesystem logging is unsuitable for a serverless SaaS and cannot provide reliable tenant listing, backup, retention, or access control.

## 18. Rate limiting, quotas, and abuse controls

Replace process-local rate limit state with a distributed store. Keys should include the relevant combination of:

- organization ID;
- user or API-key ID;
- entry/draft ID;
- external-token fingerprint;
- normalized IP;
- action namespace.

Apply limits to login, invitation creation/acceptance, link validation, upload presigning, submissions, link regeneration, integration tests, and manual retries.

SaaS quotas may include:

- active members;
- contracts/properties created per billing period;
- storage bytes;
- maximum upload size and count;
- active external links;
- integration deliveries;
- retention period.

Enforce entitlements on the server before resource creation. Record usage idempotently so retries do not count twice.

## 19. Security and privacy requirements

### 19.1 Primary threats and controls

| Threat | Required control |
|---|---|
| User changes organization ID in URL/body | Server membership resolution; scope every query and mutation |
| Direct UUID access to another agency | `(organization_id, id)` lookup and generic `404` |
| Stale administrator cookie | Revocable session plus current membership/permission check |
| Cross-organization child reference | Composite foreign keys |
| Service-role RLS bypass | Scoped repository API, database assertions, code review, integration tests |
| React Query cache shows prior tenant | Organization ID in keys, cancellation and clearing on switch |
| Signed URL or raw storage path reused | Authorization before issuance, short TTL, private bucket, asset ownership registry |
| Public Drive link leaks | Remove `anyone` permission; tenant-specific Google ACLs |
| Webhook routes data to wrong agency | Tenant-owned config, outbox event organization ID, delivery tests |
| Arbitrary webhook causes SSRF | URL validation, controlled egress, redirect/DNS protections |
| Global API key leaks all data | Organization-owned hashed scoped keys; remove global customer access |
| Logs/backups leak PII | Redaction, encryption, limited access, retention, restore controls |
| Removed employee keeps access | Membership suspension checked on each request; session revocation |
| Role link grants dashboard access | Separate capability context with one entry/role only |

### 19.2 Data protection

Contracts contain identity documents and personal financial evidence. Define and implement:

- purpose and retention periods per data type;
- private encryption-capable storage;
- least-privilege employee roles;
- organization export and deletion workflow;
- legal hold behavior if applicable;
- deletion propagation to storage and external integrations;
- backup retention and eventual deletion semantics;
- incident response and audit access;
- a process for correcting or exporting personal data.

Applicable privacy and record-retention obligations should be reviewed with qualified counsel for the jurisdictions in which the SaaS and agencies operate.

### 19.3 Backups and recovery

- Enable database point-in-time recovery appropriate to the plan.
- Back up integration configuration without exposing decrypted secrets.
- Test restoring records while preserving organization isolation.
- Document that a physical full-database restore affects all organizations; tenant-level logical restoration requires dedicated tooling.
- Ensure restored outbox jobs do not replay already delivered external actions without reconciliation.

## 20. Migration plan for existing data

The migration should be additive and staged. Do not deploy a single migration that adds nullable columns and immediately assumes isolation is complete.

### Phase 0: immediate containment and inventory

Before onboarding Solar:

- rotate the fixed Make webhook committed in the migration and replace it as part of the outbox work;
- ensure insecure agent-ID mode is disabled anywhere with real data;
- inventory all Supabase Auth users, `contract_admin_users`, contract rows, submissions, events, storage objects, property logs, Drive folders, Sheets, and webhook destinations;
- stop creating publicly shared Drive folders or clearly classify existing public links for remediation;
- back up the database and export migration reconciliation data;
- decide which existing users and records belong to Azar.

### Phase 1: add organization foundations

- Create organization, membership, invitation, session, settings, audit, integration, and platform-role tables.
- Create Azar with a fixed UUID and slug.
- Map legitimate existing accounts to Azar memberships with reviewed roles.
- Do not derive durable roles from the free-text `role` user metadata.
- Keep the application on the old behavior temporarily while validation reports are run.

### Phase 2: add nullable organization columns and backfill

- Add nullable `organization_id` to contract entries/submissions/events and new durable property tables.
- Backfill every current contract entry to Azar unless an explicit inventory says otherwise.
- Backfill submissions/events through their parent entry.
- Assign global environment integration values to Azar’s initial integration configuration.
- Import recoverable property logs into Azar records, or place unverifiable items in a quarantine table for manual resolution.
- Never preserve the SPEC-22 rule that null ownership means every future user may see the row.

Verification queries must prove:

- zero child rows disagree with their parent organization;
- zero production business rows remain unassigned;
- every active application user has a reviewed membership or is intentionally excluded;
- every storage reference maps to an assigned entry/property or is quarantined;
- generated counts and checksums match the pre-migration inventory.

### Phase 3: application dual-write and tenant-aware reads

- Deploy organization-aware sessions and route middleware.
- Write `organization_id` on all new records.
- Change repository methods and RPCs to require scope.
- Introduce tenant-aware API routes and frontend routing.
- Keep old routes only as authenticated compatibility adapters that resolve an explicit organization; do not let them remain global.
- Add shadow comparisons between old and new list counts for Azar without returning cross-tenant data.

### Phase 4: storage and integration cutover

- New uploads use organization-scoped paths and durable asset rows.
- Backfill an ownership registry for old contract files.
- For immutable historical JSON, either support a strictly Azar-only legacy path validator or copy objects to new paths and record a migration mapping. Do not silently rewrite immutable history without preserving provenance.
- Inventory property bucket objects and delete/quarantine orphans after a reviewed grace period.
- Seed Azar’s private Drive/Sheet/Make configuration.
- remove public Drive sharing and migrate existing folder permissions where operationally possible;
- replace direct webhooks with outbox delivery.

### Phase 5: enforce constraints

Only after verification:

- set `organization_id not null`;
- add composite foreign keys and tenant-leading indexes;
- enable/test RLS policies;
- remove null/global compatibility behavior;
- replace `contract_admin_users` checks with membership capabilities;
- disable the global customer API key and insecure identities;
- invalidate old application sessions so all users receive organization-aware sessions.

### Phase 6: onboard Solar as an isolation canary

- Create Solar with test members and destinations.
- Run the full cross-tenant suite against production-like staging.
- Create contracts/properties in both organizations.
- attempt direct ID, file, cache, API-key, and integration crossover attacks;
- verify provider resources and audit logs route correctly;
- only then permit real Solar data.

### Rollback principles

- Take backups before destructive constraint/removal steps.
- Prefer feature flags for route/UI cutover, not for bypassing authorization.
- Roll back code within a schema-compatible phase; do not drop new columns during an incident.
- If scope verification fails, fail closed and disable the affected operation rather than reverting to global visibility.

## 21. Testing strategy

### 21.1 Mandatory Azar/Solar test fixture

Every authorization suite should create:

- Azar owner, admin, member, and viewer;
- Solar owner, admin, member, and viewer;
- a multi-organization user with different roles;
- a suspended member;
- Azar and Solar contracts, submissions, events, properties, revisions, media, integrations, API keys, and external role tokens.

### 21.2 Cross-organization contract tests

For every list, detail, edit, status, archive, token-regeneration, schema, submission, upload, and view action, test:

- same-organization success with the required permission;
- same-organization denial with insufficient permission;
- other-organization UUID returns `404` and causes no mutation;
- an Azar link token cannot act on a Solar entry;
- a Solar storage reference cannot be attached to an Azar submission;
- archived/suspended behavior remains correct;
- history and signed media never contain another organization’s data.

### 21.3 Property tests

- property routes reject missing sessions;
- browser-supplied agent identity is ignored/rejected;
- draft and upload session are bound to organization and actor;
- upload finalization verifies actual object metadata;
- cross-organization draft, asset, property, revision, and run IDs fail;
- idempotent retry creates one property and one revision;
- optimistic concurrency prevents lost updates;
- list/detail/history are tenant-scoped and paginated;
- Drive/Sheet/Make config is selected by organization.

### 21.4 Membership and session tests

- signup does not grant global admin;
- invitations are single-use, expiring, revocable, and email-bound;
- role changes take effect without waiting for cookie expiration;
- membership suspension revokes access and active sessions;
- removing the last owner is prevented until ownership is transferred;
- organization switching clears caches and enforces the new membership;
- one user’s role in Azar does not affect their Solar role;
- suspended organizations fail closed.

### 21.5 Database and RLS tests

Use a real disposable Supabase/Postgres environment, not only mocked clients, to test:

- RLS policies for every organization table;
- service-role repository scoping;
- composite foreign keys reject mixed organizations;
- RPCs cannot mutate a mismatched organization;
- all non-null and unique constraints;
- migration/backfill verification queries;
- concurrent edits and job claiming.

### 21.6 Frontend tests

- protected direct navigation;
- organization switcher and cache isolation;
- permission-based controls;
- no prior organization content flashes after switching;
- branded public contract page shows only safe public organization data;
- logout clears all organization caches and sensitive session storage;
- conflict/retry/user-removal states are understandable and accessible.

### 21.7 Provider and end-to-end tests

In staging, use separate Azar and Solar folders, spreadsheets, and webhook receivers. Assert not only that delivery succeeds, but that the destination is correct. Include ambiguous provider timeouts, duplicate job attempts, secret rotation, revoked OAuth, dead-letter retry, and deletion behavior.

## 22. Operational SaaS capabilities

### 22.1 Organization lifecycle

Implement deliberate workflows for:

- creation and onboarding;
- suspension for security/billing issues;
- reactivation;
- data export;
- scheduled deletion with a confirmation/grace period;
- final deletion from database, storage, and configured integrations where supported.

Suspension should block writes immediately and define whether read/export remains available to owners.

### 22.2 Plans, billing, and entitlements

Billing is not required to prove tenant isolation, but a commercial SaaS normally needs:

- plan catalog and feature entitlements;
- subscription state synchronized from a billing provider;
- webhook verification and idempotency;
- grace periods and failed-payment behavior;
- usage metering and limits;
- owner-only billing portal;
- invoices/tax handling appropriate to the business.

Keep billing-provider customer IDs on the organization, not the individual user. Authorization must not depend solely on a client-side plan flag.

### 22.3 Support and administration

Create a separate platform console for organization status, integration health, usage, and audited support access. Customer-facing admin pages must never expose other organizations, even to owners.

### 22.4 Scalability

- Use cursor pagination instead of returning every contract.
- Add tenant-leading indexes before data volume grows.
- Use database connection pooling appropriate to serverless deployment.
- Move in-memory sessions/rate limits/jobs to durable distributed services.
- Bound file-verification concurrency and per-organization work queues.
- Apply fair-use limits so one organization cannot exhaust provider or worker capacity for all others.
- Keep organization ID on events/assets to support future partitioning or archival.

## 23. Suggested implementation phases

### Phase A — security and organization foundation

- Contain the public Drive/fixed webhook/global-identity risks.
- Add organizations, memberships, invitations, revocable sessions, permissions, and audit events.
- Migrate current accounts to Azar.
- Add organization-aware session and frontend routing.

### Phase B — contracts

- Add/backfill organization IDs and composite constraints.
- Refactor repositories/RPCs/routes to require scope.
- Replace per-user visibility with organization visibility plus permissions.
- Tenant-scope storage, modification history, status events, and API keys.
- Replace fixed contract Make trigger with outbox delivery.

### Phase C — properties

- Authenticate the routes and remove caller-controlled agent identity.
- Add property, revision, submission-run, media-asset, and event persistence.
- Add durable upload sessions, idempotency, list/detail/history, and edit support.

### Phase D — integrations and workers

- Add organization integration configuration and secret management.
- Partition Drive and Sheets; remove public sharing.
- Implement durable outbox, delivery records, retries, reconciliation, and dead letters.

### Phase E — organization administration

- Member/invitation UI, roles, suspension, branding, integrations, exports, deletion.
- Optional subscription, entitlements, quotas, and billing.

### Phase F — release hardening

- Complete Azar/Solar penetration-style test matrix.
- Perform migration rehearsal and restore test.
- Add monitoring/runbooks and support-access controls.
- Onboard Solar first as a controlled tenant, then generalize onboarding.

Contracts can be migrated before the full property-management UI, but **Solar must not be onboarded until all reachable production flows—including properties and external integrations—either enforce organization isolation or are explicitly disabled for Solar**.

## 24. Repository impact map

### 24.1 Backend

- `backend/src/services/contractPasswordAuth.ts`: replace global admin grant/session claims with organization onboarding and revocable session creation.
- `backend/src/routes/contractPasswordAuth.ts`: return organizations/capabilities; add verification, recovery, invitation, and lifecycle endpoints or split into dedicated routers.
- `backend/src/services/contractAuth.ts`: replace creator/global-admin logic with organization principal and permission checks; retain a separate link-capability path.
- `backend/src/routes/contractEntries.ts`: move authenticated actions under organization scope and pass context to every dependency.
- `backend/src/services/contractEntryRepository.ts`: require organization ID on every method and push filtering into SQL.
- `backend/src/services/contractEntryService.ts`: write organization/actor metadata and outbox events.
- `backend/src/services/contractDniUploadService.ts` and `contractEvidenceUploadService.ts`: use organization paths/assets and scoped signing.
- `backend/src/routes/properties.ts`: require authentication/membership, create durable drafts, and stop trusting `agent_user_id`.
- `backend/src/services/mediaUploadSessionService.ts`: replace the in-memory Map with durable tenant-bound upload records.
- `backend/src/services/supabaseStorageService.ts`: use asset records, organization paths, and post-upload verification.
- `backend/src/services/createPropertySubmission.ts`: persist business state first and enqueue integrations idempotently.
- `backend/src/services/googleDriveService.ts`: remove public sharing and accept resolved organization integration context rather than globals.
- `backend/src/services/googleSheetsService.ts` and `makeWebhookService.ts`: accept an organization integration object and run through delivery jobs.
- `backend/src/services/submissionLogger.ts` and `contractAuditLogger.ts`: replace filesystem authority with tenant-scoped durable records.
- `backend/src/index.ts`: mount organization, membership, property-management, integration, and audit routers; apply common session/request-context middleware.

### 24.2 Frontend

- `frontend/src/app/contexts/AgentContext.tsx`: remove as an identity/authorization source.
- `frontend/src/main.tsx` and `App.tsx`: add session/organization providers and protected organization routes.
- `frontend/src/features/contracts/services/adminAuthApi.ts`: expand session types to organizations, memberships, and capabilities.
- `frontend/src/pages/AuthPage.tsx`: separate account creation, organization creation, and invitation acceptance.
- `frontend/src/pages/ActionSelectionPage.tsx`: render current organization and switcher; remove agent setup dependency.
- `frontend/src/pages/NewPropertyPage.tsx`: derive actor from session and use draft/upload/finalize APIs.
- `frontend/src/pages/ContractAdminPage.tsx`: include organization ID in every query/mutation/cache key.
- `frontend/src/features/contracts/services/contractApi.ts` and property API services: use organization-scoped endpoints.
- `frontend/src/pages/ContractFormPage.tsx`: replace the hard-coded Azar logo with safe organization branding.
- add pages for properties, revision history, members, invitations, organization settings, integration health, and optionally billing.

### 24.3 Supabase

Add ordered migrations for:

1. organization and membership foundations;
2. session/invitation/platform role tables;
3. organization columns and backfill;
4. composite constraints/indexes/RLS;
5. updated contract functions and actor history;
6. property/revision/run/media tables;
7. integration/outbox/delivery/audit tables;
8. removal of fixed Make trigger and global admin behavior;
9. final non-null enforcement and compatibility cleanup.

Do not edit already-applied migration files as the deployment mechanism. Add new migrations and reconcile the existing migration history first, as the repository documentation already requires.

### 24.4 Tests and documentation

- Expand backend integration fixtures around organization context.
- Add real database/RLS migration tests.
- Add frontend multi-organization tests and two-organization Playwright scenarios.
- Update architecture, environment, API, external-service, operation, and testing documents after implementation.
- Add runbooks for invitation problems, member revocation, integration failure, data export/deletion, and suspected cross-tenant exposure.

## 25. Acceptance criteria for SaaS readiness

The system is not ready for a second real organization until all of these are true:

1. Every active business row and file asset has a verified non-null organization owner.
2. Existing production records are assigned to Azar or quarantined; none are globally visible by null convention.
3. Solar users cannot see Azar records in lists, direct URLs, history, search, exports, caches, logs, or signed files, and vice versa.
4. Cross-organization create/update/archive/status/link-regeneration calls produce no side effect.
5. Registration and Google login do not grant global administrator access.
6. Membership role changes and suspension take effect immediately enough for the defined security objective.
7. Property APIs authenticate the member and ignore caller-supplied agent identity.
8. Properties and modifications are durably stored with immutable revisions and actors.
9. Contract corrections preserve revision history and authenticated actor attribution.
10. Contract external links are limited to one entry/role and cannot enter the dashboard.
11. All storage buckets are private; new paths and asset records are organization-scoped; signed views require current authorization.
12. New Drive resources are not shared publicly and each organization’s Google destinations are separated.
13. Sheets and Make deliveries resolve configuration from the owning organization and are idempotent/auditable.
14. The fixed database Make trigger and global customer API key are removed or replaced by scoped mechanisms.
15. React Query and any other caches include organization scope and are cleared/cancelled on switch/logout.
16. Rate limits, upload sessions, jobs, and idempotency records work across multiple server instances.
17. Database constraints prevent cross-organization parent/child relationships.
18. RLS and service-role repository tests pass against a real database.
19. Azar/Solar end-to-end isolation tests pass for contracts, properties, files, members, and integrations.
20. Backup, migration rollback, incident response, and tenant suspension procedures are documented and rehearsed.

## 26. Product decisions still required

These choices change UI and policy but do not block the architecture if the recommended defaults are accepted:

1. **Existing data ownership.** Recommended: assign all verified current production data and current legitimate users to Azar; quarantine anything ambiguous.
2. **Organization onboarding.** Recommended first release: platform-created organizations and invite-only membership; add self-service organization creation after isolation is proven.
3. **Visibility within an agency.** Recommended: active members can see the agency’s records according to role; creator/assignee remains a filter and attribution. Add “assigned only” later if required.
4. **Multiple agency memberships.** Recommended: support it in the database/session now, even if the first users have one membership.
5. **Google/Make ownership.** Recommended first release: platform-managed credentials with a distinct private destination per organization; retain an upgrade path to organization-owned OAuth/webhooks.
6. **Property modification semantics.** Decide whether a modification updates an existing external Sheet row, appends a revision row, triggers Make, or performs a defined combination.
7. **Billing timing.** Recommended: defer automated billing until isolation, usage tracking, and organization lifecycle are stable, but include `plan_key`/entitlement structure now.
8. **Branding and URLs.** Recommended: path-based `/t/:slug` dashboard routing and organization branding on public forms; postpone custom domains.
9. **Retention.** Define how long contract submissions, DNI/evidence, property media, audits, and failed uploads are retained.
10. **Support access.** Decide whether platform operators may inspect customer content at all and, if so, under which approval/audit controls.

## 27. Final recommendation

Build the organization layer as a security boundary, not as a label added to the UI. Start by making Azar an explicit organization and migrating the current system into that model. Then refactor contracts, properties, storage, and integrations so `organization_id` is required end to end. Only after the two-organization isolation suite passes should Solar receive real access.

The highest-risk mistake would be to preserve current global or null-owner behavior while adding a tenant selector. The safest implementation makes cross-organization access difficult to express in TypeScript, impossible through database relationships, rejected by every API, absent from caches and external providers, and continuously tested with Azar/Solar adversarial fixtures.
