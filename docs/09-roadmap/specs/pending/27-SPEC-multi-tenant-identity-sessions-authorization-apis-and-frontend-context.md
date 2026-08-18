# SPEC-27 / MT-SPEC-03 Multi-tenant SaaS foundation — identity, sessions, authorization, APIs, and frontend organization context

**Date:** 2026-08-18
**Priority:** critical, prerequisite for every authenticated multi-tenant domain
**Status:** pending policy approval and prerequisite implementation
**Roadmap identifier:** MT-SPEC-03
**Dependencies:** MT-SPEC-01 and MT-SPEC-02
**Blocks:** authenticated implementation of MT-SPEC-04 through MT-SPEC-10

---

## Specification identity

**Name:** Revocable authentication, organization authorization, API context, scoped machine access, support access, and frontend tenant isolation.

**Description:** Replace global administrator authentication with a revocable identity and authorization layer that resolves an active membership on every protected request and propagates the same explicit organization context through backend APIs, frontend routes, caches, drafts, and asynchronous work.

**Why it is necessary:** The current signed cookie embeds stale global administrator authority, compatibility identities can bypass normal access, caller-supplied agent IDs can be treated as identity, and frontend routes/caches have no organization boundary. A single authoritative context is required so every later domain uses identical access semantics and Azar data can never appear in Solar's session, cache, request, or response.

## Summary

Supabase Auth remains the identity provider for password and Google authentication. It answers who the person is; it does not answer which organization the person may access or what that person may do. Authorization comes from a server-validated active `organization_memberships` row, the fixed role-to-capability registry from SPEC-26, the organization's current lifecycle state, and any narrower record policy.

The current self-contained `contract_password_session` cookie is replaced with a high-entropy opaque application-session token. Only a strong keyed hash is stored in `app_sessions`. Each protected request loads the session's current user/account state, resolves the organization from the explicit API namespace, validates the current membership and organization status, resolves named capabilities, and creates a typed `OrganizationRequestContext`. Role or organization authority is never copied into the browser cookie.

Human sessions, organization API keys, external contract links, and platform/support operators are separate principal types. They have separate credentials, context types, scopes, routes, audits, revocation behavior, and prohibited transitions. An external contract link can access one entry/role only; an API key cannot become a browser session; a support grant cannot become an organization membership.

The frontend moves to protected `/t/:organization_slug/...` routes backed by server-confirmed organization UUIDs. Authentication and organization providers replace caller-selected agent identity. Every React Query key, browser draft, mutation, and persisted tenant value includes immutable `organization_id`. Switching organizations or logging out cancels in-flight work, rejects stale responses, and clears or partitions all organization-owned state before rendering the destination context.

This document defines the implementation contract. It does not migrate current users, create Azar/Solar, assign memberships, enable support access, issue production keys, or perform the final compatibility cutover; SPEC-34 owns those production actions.

## Authority and relationship to other specifications

This is the third formal implementation SPEC derived from:

- `docs/09-roadmap/specs/research/23-RESEARCH-multi-tenant-saas-architecture.md`;
- `docs/09-roadmap/specs/research/24-RESEARCH-multi-tenant-saas-specification-roadmap.md`;
- `docs/09-roadmap/specs/pending/25-SPEC-multi-tenant-policy-threat-model-containment-and-inventory.md`; and
- `docs/09-roadmap/specs/pending/26-SPEC-multi-tenant-organizations-memberships-onboarding-and-lifecycle.md`.

SPEC-25 owns product policy, threat model, immediate containment, and the executable surface inventory. SPEC-26 owns organizations, memberships, fixed roles/capabilities, invitations, ownership, and lifecycle state. This SPEC consumes those contracts and owns identity verification handoff, application sessions, request context, API conventions, machine credentials, optional support access, and frontend organization isolation.

Downstream relationships:

- SPEC-28 consumes trusted actor/request/organization context for database enforcement, audit, distributed abuse controls, observability, and recovery.
- The missing MT-SPEC-05 and SPEC-30 through SPEC-32 consume the same context for contracts, properties, assets, and integrations.
- SPEC-33 may add SSO/custom-domain identity hints or billing/support surfaces, but those modules cannot bypass this context.
- SPEC-34 migrates users and grants, invalidates old sessions, removes compatibility principals, and certifies Azar/Solar isolation.

Earlier contract specifications remain behavior references but are superseded where they grant global authority. SPEC-19's self-contained signed application cookie and `contract_admin_users` model cannot remain an authorization source in the multi-tenant runtime. SPEC-22's `created_by_user_id` is attribution/within-organization filtering, not organization ownership or identity.

## Current repository context

The current implementation has concrete single-tenant surfaces:

- `backend/src/services/contractPasswordAuth.ts` signs user identity, `isAdmin`, and expiry into a cookie that cannot be centrally revoked before expiry.
- Password registration and Google login ensure a global `contract_admin_users` grant.
- Contract principal resolution accepts `Authorization`, `X-Authenticated-User-Id`, development/insecure `X-User-Id`, or the global application cookie.
- `CONTRACT_ALLOW_INSECURE_AGENT_ID` and `VITE_CONTRACT_ALLOW_INSECURE_AGENT_ID` retain a compatibility identity path.
- Property APIs accept caller-provided `agent_user_id`; upload sessions are keyed to that value.
- Current frontend session responses expose only a global user, not memberships, organization state, role, or capabilities.
- Routes such as `/contracts/admin` and `/properties/new` have no organization namespace.
- Contract React Query/session-storage keys omit organization UUIDs.
- Google browser authentication persists a Supabase session independently of the application cookie.

These are migration targets, not an exhaustive inventory. SPEC-25's surface register must discover any additional headers, scripts, cron jobs, test helpers, proxy-injected principals, keys, or caches before compatibility removal.

## Motivation

A valid Supabase user can be an Azar owner, a Solar viewer, suspended in one organization, and active in another. Encoding `isAdmin` in a long-lived cookie collapses those relationships and remains stale after role changes, suspension, account compromise, or organization shutdown.

Tenant isolation also extends beyond backend queries. A correct server can still allow an Azar response to flash after switching to Solar if request cancellation, cache keys, drafts, or persisted tokens omit organization identity. Likewise, a scoped external contract link or machine key becomes dangerous if normalized into the same principal as a dashboard member.

## Objective

Implement a revocable authentication/session layer and canonical authorization pipeline in which every protected operation derives an explicit organization, current membership, organization state, role, and named capability on the server; every non-human or external principal remains narrowly scoped; every API follows consistent context/error/pagination rules; and every frontend route, request, cache, draft, and transition is partitioned by immutable organization identity.

## Terminology

- **Identity:** Verified human or machine subject before organization authorization.
- **Supabase Auth user:** Global human identity record; not an organization membership.
- **Application session:** Revocable opaque browser credential represented by one server-side `app_sessions` row.
- **Raw session token:** High-entropy secret held only by the client cookie.
- **Session hash:** Keyed/peppered digest used for lookup; the table contains no usable raw token.
- **Membership:** SPEC-26 relationship between one user and one organization, with role and state.
- **Capability:** Named backend permission from the canonical role matrix, narrowed by current state/policy.
- **Organization context:** Validated organization UUID plus actor, session, membership, role, capabilities, and request evidence.
- **Selected organization:** Frontend navigation state confirmed by the server; never authorization.
- **Organization API key:** Revocable organization-owned machine credential with explicit scopes.
- **External contract link:** Token permitting one external role against one contract entry; never membership.
- **Platform operator:** Separately governed operator identity with no implicit organization authority.
- **Support access grant:** Time/reason/scope-bound operator access to one organization.
- **Step-up authentication:** Recent stronger verification required for high-risk actions.
- **Context epoch:** Monotonic client generation used to reject responses initiated under obsolete context.

New public JSON, persisted browser keys, audit actions, scopes, capability keys, and columns use `snake_case`. Environment variables use `UPPER_SNAKE_CASE`. Internal TypeScript follows repository conventions.

## Scope

### Includes

- Supabase password and Google identity handoff.
- Email verification, password reset/change, email change, abuse throttling, and MFA/step-up hooks.
- Opaque application-session creation, expiry, idle timeout, rotation, revocation, last-seen, logout, remembered sessions, and device management.
- Immediate authorization refresh/revocation after membership, role, account, or organization changes.
- Safe session, organization, membership, role, and capability summaries.
- Canonical `OrganizationRequestContext` and middleware order.
- Explicit organization API namespaces, errors, pagination, concurrency, and caching conventions.
- Separate contract-link, API-key, worker, and optional platform/support contexts.
- Organization-owned API-key issuance, hashing, scoping, expiry, IP restrictions, rotation, and revocation.
- Retirement of global keys/admin lists, proxy identity headers, insecure IDs, caller-supplied agent identity, and global cache keys.
- Protected organization routes, switching, permission-aware navigation, caches, drafts, multi-tab behavior, and stale-request protection.

### Excludes

- Organization/member/invitation/role ownership, defined by SPEC-26.
- RLS, repositories, canonical audit storage, distributed limits, quotas, backups, and recovery, defined by SPEC-28.
- Domain-specific contract/property/file/integration rules beyond consuming context/capabilities.
- Enterprise SSO or custom domains unless enabled under SPEC-33.
- Automatic membership based on email domain, Google tenant, metadata, registration, API key, link, or support identity.
- Custom roles or per-member capability overrides.
- Persisting raw session, invitation, API-key, link, OAuth, reset, or CSRF secrets in logs/audit/analytics.
- Treating frontend visibility as authorization or enabling support access by default.

## Dependency and policy gate

Production implementation requires:

1. Approved SPEC-25 onboarding, visibility, support, suspension, and retention policies.
2. Stable SPEC-26 organization/membership states, roles, capability registry, and invitation/ownership behavior.
3. Security-approved session durations, remembered/idle policy, rotation, CSRF, exact origins, cookies, password/reset/email change, and MFA/step-up requirements.
4. An explicit support-access decision; until approval, support entry points remain disabled.
5. Authoritative origins, proxies, secret storage, clock, and revocation-notification infrastructure.
6. A SPEC-34 inventory of current users, grants, keys, sessions, headers, and frontend persistence.

Unresolved security values are decision gates. Implementations must not choose permissive defaults silently.

## Non-negotiable identity and authorization invariants

1. Supabase Auth establishes human identity only; it never grants organization authority.
2. Every protected organization request resolves exactly one immutable `organization_id` on the server.
3. A current active membership in the same organization is required for human dashboard access.
4. Role/capabilities are loaded from current server state and never trusted from cookie, metadata, body, query, browser cache, slug, or headers.
5. Effective permission intersects account, session, membership, organization state, role capabilities, feature state, and narrower record policy.
6. Missing, expired, idle-expired, revoked, rotated, malformed, or mismatched sessions fail closed.
7. Suspension, removal, role change, password reset, compromise, and shutdown invalidate relevant authority immediately.
8. Session tokens are opaque/high entropy, stored only in secure cookies, and never returned after creation in JSON/logs.
9. No reusable raw human, machine, invitation, reset, link, or CSRF secret is persisted.
10. Session rows contain no copied role/capability grant that can outlive membership changes.
11. Slugs/hosts are routing hints; UUID and current authorization are authoritative.
12. Caller `organization_id`, `user_id`, `agent_user_id`, creator, email, or role cannot become identity.
13. Every domain receives a validated typed context; it does not reconstruct identity from Express input.
14. Repositories still require `organization_id` even when given a validated context.
15. External links access only one entry/role and never dashboard/member APIs.
16. API keys are tenant/scoped/expiring/revocable and never create browser sessions.
17. Platform/support principals are separate and receive no tenant access without an active grant.
18. Support is step-up protected, reason-bound, time-limited, visible where required, audited, and revocable.
19. Cookie-authenticated mutations require valid CSRF and Origin protections.
20. Credentialed CORS uses exact origins, never wildcard reflection.
21. Auth/reset/invitation/context errors resist account and tenant enumeration.
22. Cross-organization identifiers return generic not-found and cause no side effect.
23. Frontend visibility is usability only; backend authorization is repeated.
24. Every tenant query key and persisted draft/token key includes immutable organization UUID.
25. Switch/logout cancels work, advances context epoch, clears/partitions state, and rejects stale callbacks.
26. Direct protected navigation waits for server validation before tenant content renders.
27. Browser storage contains no app session, API key, support secret, or authority assertion.
28. Multiple tabs converge safely on logout, revocation, and context invalidation.
29. Authentication failure never falls back to a compatibility principal.
30. Security telemetry contains no raw credentials/tokens or unnecessary PII.

## Principal taxonomy

| Principal | Credential | Context | Allowed boundary | Prohibited conversion |
|---|---|---|---|---|
| Human member | Opaque cookie | `OrganizationRequestContext` | Membership capabilities in one organization | Global admin/another membership |
| Organization API key | Bearer key | `OrganizationApiKeyContext` | Named scopes in one organization | Human session/owner/support |
| External participant | Contract role token | `ContractLinkContext` | One entry, role, and allowed operations | Dashboard/API key/membership |
| Platform operator | Separate operator session | `PlatformRequestContext` | Platform-only operations | Organization member by implication |
| Support operator | Operator session + grant | `SupportRequestContext` | Approved organization/scopes/time | Persistent organization authority |
| Worker | Workload identity + job claim | `WorkerRequestContext` | One organization/job capability | Interactive principal |

One request has one principal mode. Reject ambiguous credential combinations unless an endpoint explicitly selects one without unioning privileges.

## Data model

All IDs are UUIDs and timestamps are UTC `timestamptz`. Browser roles cannot directly write security tables.

### `app_sessions`

| Field | Contract |
|---|---|
| `id` | Session-management/audit UUID, not token |
| `user_id` | Required Supabase Auth user ID |
| `token_prefix` | Short non-secret lookup prefix |
| `token_hash` / `hash_version` | Unique keyed/peppered digest and version |
| `auth_method` | Controlled password/Google/SSO/recovery method |
| `assurance_level` | Normalized current MFA/assurance state |
| `created_at` / `authenticated_at` | Creation and latest full/step-up auth |
| `absolute_expires_at` / `idle_expires_at` | Hard and optional inactivity expiry |
| `remembered` | Approved remembered-policy marker |
| `last_seen_at` | Throttled activity timestamp |
| `last_ip_network` / `user_agent_summary` | Optional minimized device evidence |
| `rotated_from_session_id` | Nullable predecessor |
| `revoked_at`, `revoked_by_actor_type`, `revoked_by_actor_id` | Revocation evidence |
| `revocation_reason` | Controlled safe reason |
| `created_request_id` / `last_request_id` | Correlation evidence |
| `version` | Positive optimistic version |

Require unique hash, bounded prefix lookup, user/expiry indexes, valid expiry/revoke state, one active successor, and an approved active-session limit. Store no authorization-bearing email, role, organization, or capabilities. The keyed digest uses a versioned secret-store pepper so database-only compromise does not yield usable tokens.

### `organization_api_keys`

| Field | Contract |
|---|---|
| `id` / `organization_id` | Key UUID and required owner |
| `name` / `key_prefix` | Bounded label and unique non-secret prefix |
| `secret_hash` / `hash_version` | Strong keyed hash and rotation version |
| `scopes` | Validated non-empty canonical machine scopes |
| `status` | `active`, `revoked`, or expired state |
| `created_by_membership_id` | Authorized issuer in same organization |
| `created_at` / `expires_at` | Creation and mandatory policy-bounded expiry |
| `last_used_at` / `last_used_ip_network` | Throttled safe metadata |
| `allowed_ip_cidrs` | Optional reviewed restrictions |
| `rotated_from_key_id` | Nullable predecessor |
| revocation fields / `version` | Actor/time/reason and optimistic version |

Generate raw keys server-side and display exactly once. Later responses return metadata only. Keys cannot manage owners, sessions, support/platform state, or another organization.

### Optional support tables

Support stays disabled unless approved. If enabled, add separate `platform_operators`, `support_access_requests`, and `support_access_grants` with operator/organization/scopes/reason/ticket, approval, assurance, start/expiry, revocation, and version. Expiry is enforced during authorization, not only cleanup. Platform operators cannot self-approve when separation of duties applies, and customer roles cannot create platform authority.

## Opaque application-session contract

- Generate at least 256 bits of cryptographically secure token entropy.
- Encode no user, role, organization, capability, or expiry in the raw token.
- Persist only the keyed/peppered hash and safe prefix.
- Use a host-only `Secure`, `HttpOnly`, `Path=/` production cookie, approved `SameSite`, no `Domain`, and preferably a `__Host-` name.
- Permit a documented local-only non-Secure cookie; production startup rejects it.
- Apply bounded `Max-Age` only for remembered sessions; server expiry remains authoritative.
- Apply `Cache-Control: no-store` to auth/session/context responses.
- Clear current and legacy cookies at logout/cutover.

Create a session only after current Supabase verification and account eligibility. A user may authenticate with zero memberships for onboarding/invitations, but protected organization access always requires membership.

Rotate on login/OAuth handoff, step-up, password recovery, high-risk policy events, pepper migration, and the approved interval. Create successor and revoke predecessor atomically. Replay fails and emits safe telemetry. Activity never revives expired/revoked sessions or extends absolute expiry. Last-seen writes are throttled.

### Revocation matrix

| Event | Required effect |
|---|---|
| Logout | Revoke current app session; clear cookie/client state |
| Logout all/device revoke | Revoke selected/all user sessions according to policy |
| Membership suspension/removal | Lose that organization immediately; revoke sessions by default or prove targeted invalidation |
| Role change | Invalidate context immediately; high-risk elevation uses step-up/rotation |
| Organization suspension/deletion | Lose affected capabilities immediately |
| Password reset/change or compromise | Apply approved revoke-all/rotation incident policy |
| Email change | Reverify and rotate/revoke; do not move memberships automatically |
| API-key rotate/revoke | Immediate key denial independent of human session |
| Support grant expiry/revoke | Immediate support denial independent of membership |

First release revalidates session, Auth eligibility, organization, and membership on every protected request. Any later authorization cache is very short, bounded, keyed by user/organization/membership version, synchronously invalidated, and fail-closed.

Users may list/revoke their own sessions using safe device labels/times/current marker. Never expose hashes/prefixes, full IP/user-agent, or another user's sessions. High-risk device actions require CSRF, recent assurance as approved, audit, and idempotency.

## Authentication workflows

Password login applies distributed abuse limits, validates bounded input and approved Origin/login-CSRF behavior, asks Supabase Auth to verify identity, checks current account/email eligibility, and creates the opaque app session. Errors resist enumeration. Login and registration never create an organization, membership, global admin grant, or `contract_admin_users` row. Public registration, if retained, creates identity/profile only; free-text company/role fields never authorize.

Google uses Supabase PKCE/OAuth with exact callbacks and validated state/PKCE. The backend verifies the Supabase result before issuing an app session. OAuth codes and Supabase access/refresh tokens never enter the app cookie, database, logs, or analytics. After handoff, the frontend clears temporary Supabase browser state so it cannot become alternate authorization.

Verification/reset/email-change flows use exact redirects and single-use tokens, avoid account disclosure, invoke approved revocation, and never move memberships or merge identities solely by email. Owners/operators require approved MFA/step-up hooks before ownership transfer, sensitive export/deletion, key issuance, support access, revoke-all, or other high-risk actions.

## CSRF, Origin, CORS, and browser security

Every cookie-authenticated mutation requires a session-bound unpredictable CSRF value in a custom header plus valid Origin. Compare in constant time, rotate with session/step-up, hold in memory where practical, and never place it in URLs, logs, analytics, or drafts. Safe methods remain side-effect free; login/logout receive explicit login-CSRF/forced-logout handling.

- Use exact scheme/host/port allowlists; never reflect arbitrary Origin or combine credentials with wildcard origin.
- Reject missing, opaque, or unapproved Origin on browser mutations except documented non-browser modes.
- Trust forwarded host/protocol only from configured proxies.
- Permit only documented preflight methods/headers.
- Use no-store, nosniff, and approved frame/referrer/content-security headers.
- Re-review cookies/callbacks before SPEC-33 custom domains are enabled.

## Canonical request contexts

### `OrganizationRequestContext`

The readonly internal type contains request/session/user IDs, authentication time/assurance, organization ID/slug/status/version, membership ID/role/status/version, canonical capabilities, and source `human_session`. Public JSON uses `snake_case`. Profile fields never authorize. Services accept validated context plus domain input, not raw requests or independently reconstructed principals.

### Mandatory middleware order

1. Establish request ID, trusted proxy/origin data, response headers, and safe log context.
2. Parse exactly one credential mode permitted for the route.
3. Validate/load the session; missing identity is `401`.
4. Resolve route organization UUID; slug alone cannot authorize.
5. Load current organization and lifecycle state.
6. Load current membership for that UUID.
7. Resolve capabilities and feature/record narrowing.
8. Enforce the named capability.
9. Attach immutable context and execute validation/handler/service.
10. Emit safe privileged audit/telemetry.

Resources cannot be loaded before tenant authorization in a way that leaks existence. Handlers cannot replace context from request values.

Other contexts remain narrow: `OrganizationApiKeyContext` has key/organization/scopes/IP and no membership; `ContractLinkContext` has exact organization/entry/role/operations; `SupportRequestContext` has operator/grant/scopes/reason/assurance/expiry only when enabled; `WorkerRequestContext` has organization/job/workload/lease/capability and never synthesized membership.

## Capability enforcement

- SPEC-26's registry is the sole role-to-capability mapping.
- Routes declare named requirements; services reassert sensitive invariants.
- Never use ad hoc `is_admin`, role ordering, emails, UI flags, or duplicated role switches.
- Owner and platform operator are unrelated identities.
- Lifecycle, record policy, and entitlements may narrow but never broaden.
- High-risk actions require capability plus step-up, concurrency/idempotency, and domain invariants.

## API conventions

Protected customer APIs use `/api/organizations/:organization_id/...`; frontend navigation uses `/t/:organization_slug/...`. The server resolves slug to UUID and the frontend uses the confirmed UUID in APIs, queries, mutations, drafts, and epochs. Body/query ownership values never authorize.

Minimum APIs include password/Google login, logout/logout-all, current session, device session list/revoke, selected password/email flows, bounded organization membership list, organization context, SPEC-26 governance routes, organization-key management when enabled, and separate platform/support routes only when approved.

`GET /api/auth/session` returns a safe no-store user/session summary plus bounded organization summaries containing `organization_id`, slug, display name, organization/membership states, role, safe capabilities, and versions. It may return an in-memory CSRF bootstrap value. It excludes secrets/hashes, other members, global admin flags, and provider configuration.

### Error and list contract

- `401`: invalid, missing, expired, or revoked identity; client clears auth state.
- `403`: principal lacks capability/scope in known context.
- `404`: unknown or foreign resource using a generic shape.
- `409`: version, idempotency, concurrency, or lifecycle conflict.
- `422`: safe field/domain validation failure.
- `429`: distributed abuse control.
- `503`: security dependency unavailable; no permissive fallback.

Errors use stable `snake_case` code, safe message, `request_id`, and safe field errors. Lists have bounded limits, deterministic ordering, allowlisted filters, and opaque/signed cursors bound to organization, endpoint, sort, filters, and principal where needed. An Azar cursor is invalid for Solar. Versioned mutations use `expected_version`; retryable creates use scoped idempotency. Sensitive responses are private/no-store.

## Organization API keys

Only active members with key-management capability and required step-up may issue keys. Requests contain bounded label, allowed scopes, mandatory policy-bounded expiry, and optional IP restrictions. The server generates a version/environment-marked prefix and secure secret, displays the raw key once, stores only a strong keyed hash, and audits creation.

Only machine-enabled routes accept bearer keys. They verify the full hash in constant time, state, expiry, IP controls, and organization lifecycle; derive organization from the key; and require route UUID equality. Wildcard/global/platform scopes are forbidden initially. Rotation creates a successor with short approved overlap or atomic predecessor revocation. Expired/revoked keys never reactivate. Last-use writes are throttled. SPEC-34 removes global customer keys after migration telemetry reaches zero.

## External contract-link boundary

Contract role tokens require hashed lookup, exact organization, entry, role, operations, expiry and revocation, same-entry asset checks, limits, replay rules, generic invalid responses, and audit. They cannot access organization selection, members, dashboards, reports, unrelated entries, sessions, or keys. A simultaneous member cookie and link token does not union privileges; the route selects one mode.

## Platform and support access

Support is denied by default. If approved, require separate operator enrollment/MFA, a request naming one organization/scopes/reason/ticket/duration, independent approval where required, recent step-up, short expiry, emergency revoke-all, customer-visible state where policy requires, grant/reason on every audit, no secret viewing or unapproved export, read-only default, separately scoped mutations, and no background continuation after expiry. Support UI is isolated and identifies its tenant clearly.

## Frontend organization architecture

Replace caller-selected identity with `AuthenticationProvider` for server session, CSRF, and authentication transitions and `OrganizationProvider` for memberships, selected slug/UUID, state, role, capabilities, and context epoch. Permission helpers affect usability only.

Startup and direct navigation render a neutral shell, load server session, resolve the authorized route context, validate membership/state, initialize the UUID query namespace/epoch, and then render. Zero-membership users see onboarding/invitations. Suspended, removed, deleted, or unknown contexts expose no stale tenant data.

Protected routes use `/t/:organization_slug`, including properties, contracts, and member settings. External links remain outside dashboard routing but retain their context. Old global redirects are temporary authenticated SPEC-34 adapters and cannot select a tenant ambiguously.

### Organization switching

1. Mark old context transitioning and disable mutations.
2. Cancel old-context requests.
3. Increment context epoch so late responses are discarded.
4. Clear forms, dialogs, selections, tenant toasts, optimistic state, object URLs, and sensitive derived data.
5. Clear or retain only correctly UUID-partitioned caches and drafts.
6. Validate target context with the server.
7. Navigate to canonical target slug and initialize target UUID.
8. Render target content only after validation.

A failed switch leaves no old or target business data visible and returns to safe organization selection/login. Switching never creates membership.

### Query, mutation, storage, and multi-tab isolation

Tenant query keys begin with immutable UUID, for example `['organization', organizationId, 'contracts', filters]`. Mutations capture UUID and epoch at invocation; callbacks recheck both before cache writes, navigation, or toasts. Optimistic updates touch only matching UUID keys.

Persisted keys contain schema version, user ID, organization UUID, resource/draft ID, and purpose. Never persist app sessions, API keys, support/invitation/OAuth/reset/CSRF secrets, or capability authority. External role tokens remain memory-only where feasible; any approved session-storage key includes organization, entry, and role and clears on completion/logout.

Use an approved same-origin multi-tab mechanism for logout, session rotation/revocation, membership refresh, and organization invalidation without transmitting business data or secrets. Every request has abort/epoch evidence; obsolete Azar responses cannot update Solar state. Navigation uses safe server capability summaries, while backend checks remain authoritative.

## Compatibility retirement

The following cannot remain production authority after SPEC-34 cutover:

- self-contained `contract_password_session` and embedded `isAdmin`;
- runtime `contract_admin_users` authorization and global admin allowlists;
- global customer `CONTRACTS_API_KEY`-style credentials;
- `X-Authenticated-User-Id` without an approved organization-bound trusted-gateway contract;
- `X-User-Id`, `CONTRACT_ALLOW_INSECURE_AGENT_ID`, and `VITE_CONTRACT_ALLOW_INSECURE_AGENT_ID`;
- caller-supplied `agent_user_id` as authentication;
- global dashboard routes that silently choose a tenant;
- organization-free query, draft, token, and cache keys; and
- old sessions after the organization-aware cutover.

Temporary adapters are off by default for new tenants, use canonical sessions, resolve exactly one organization, call canonical services, emit last-use telemetry, have an owner/removal date, and pass cross-tenant tests. Failed canonical authentication never falls back to them.

## Organization and membership state behavior

| State | Required behavior |
|---|---|
| Active organization and membership | Evaluate current capabilities normally |
| Suspended membership | Session may remain globally valid; deny this tenant and clear its content |
| Removed membership | Exclude or mark inaccessible; generic denial and cache cleanup |
| Suspended organization | Deny mutations/delivery; only explicitly approved owner read/export/reactivation |
| Pending deletion | Permit only approved lifecycle/export/cancel/read operations |
| Deleted organization | No normal context; generic denial and reserved tombstone |
| Disabled/deleted Auth user | Revoke sessions and return `401` |

Server state always wins. A user may still switch to another active membership unless account-level incident policy revokes the whole identity.

## Audit, telemetry, privacy, and failure behavior

Audit session create/rotate/step-up/logout/revoke/replay; safe auth/reset/verification outcomes; organization context resolution/denial; API-key lifecycle/use; support lifecycle/use; compatibility attempts; and suspicious capability or cross-tenant denials. Include request/principal/organization/target IDs only where safe, action/outcome/reason/source/time. Exclude cookies, tokens, Authorization, CSRF, passwords, OAuth codes, signed URLs, storage paths, credentials, identity documents, and unnecessary email/IP/user-agent data.

Use bounded metric labels. Never label by raw user/session/email/token/resource IDs or unapproved organization identifiers.

- Session or membership store unavailable: fail protected work closed with safe `503`.
- Revocation notification unavailable: direct validation still denies; alert degradation.
- Supabase unavailable during login: do not create a session.
- CSRF/Origin mismatch: deny before side effect and record safe abuse telemetry.
- Invalid key/link: generic denial without revealing prefix/tenant state.
- Frontend context fetch failure: neutral retry/logout state, never cached tenant content.
- Interrupted switch: discard mixed state and restart bootstrap.
- Audit failure follows SPEC-28 policy and never removes authorization.

## Affected implementation areas

### Database

- Ordered migrations in `supabase/migrations/` for sessions, API keys, optional support grants, security events, constraints, indexes, grants, and RLS.
- Transactional rotation, revocation, invalidation, and SPEC-34 migration support.
- Never edit already-applied migrations.

### Backend

- `backend/src/index.ts` and middleware registration.
- Replacement/refactor of `backend/src/services/contractPasswordAuth.ts` and `backend/src/routes/contractPasswordAuth.ts`.
- Principal resolution in `backend/src/services/contractAuth.ts`.
- Contract/property routes and upload-session identity handling.
- New session repository/service, Supabase adapter, CSRF/Origin middleware, organization resolver, capability integration, typed contexts, key/support services, error/pagination utilities, audit, and tests.
- Environment validation for origins, proxies, cookies, session pepper/lifetimes, MFA, and support flags.

### Frontend

- `frontend/src/App.tsx`, authentication/Google callback/action-selection pages.
- `frontend/src/features/contracts/services/adminAuthApi.ts` and `contractIdentity.ts`.
- Authentication/organization providers, protected routes, HTTP/CSRF/error client.
- React Query key factories/mutation guards, UUID drafts/token state, switcher/navigation, session/device management, and optional key/support screens.

### Documentation and operations

- Environment examples, proxy/origin/callback/cookie/secret configuration.
- Architecture, API, external-service, testing, runtime, session revocation, key rotation, support, incident, and migration documentation.

## Implementation phases

1. Approve policy/security values; define context/principal/error/pagination contracts; add deny-by-default schema.
2. Implement opaque sessions, password/Google handoff, CSRF/Origin/CORS, rotation/revocation, bootstrap, and device management.
3. Implement organization middleware, namespace APIs, capabilities, state/step-up rules, and separate key/link contexts.
4. Implement protected frontend routing, UUID queries/drafts, switching, multi-tab invalidation, and remove caller identity.
5. Keep support disabled or implement its separate approved boundary.
6. Under SPEC-34, migrate identities, invalidate old sessions, remove globals/headers/insecure IDs, and certify Azar/Solar.

Each phase is additive and fail-closed. Rollback never restores global authority.

## Test plan

### Unit tests

- Token entropy/format/hash/pepper versions and constant-time verification.
- Cookie serialization/clearing and rejection of insecure production attributes.
- Absolute, idle, remembered, rotation, and fake-clock expiry boundaries.
- Revocation, predecessor replay, and throttled last-seen.
- CSRF and exact Origin/CORS validation.
- Capability/lifecycle evaluation and context construction for every principal.
- Ambiguous-credential rejection.
- API-key prefix/hash/scope/expiry/IP/rotation/revocation.
- Error mapping, cursor binding, public naming, and sanitization.
- Frontend UUID key factories and context-epoch guards.

### Database integration tests

- Session/key constraints, indexes, grants, deny-by-default RLS, expiry cleanup, and concurrent rotation/revocation.
- Current membership and organization revalidation.
- Concurrent role/suspension/organization changes versus active requests.
- API-key organization/issuer/scope relationships.
- Support grant expiry/revoke and separation from memberships when enabled.
- Absence of raw-token columns or browser-readable security tables.

### Backend integration tests

- Password/Google handoff succeeds without automatic memberships/admin grants.
- Safe session bootstrap for zero, one, and multiple memberships.
- Missing, invalid, expired, revoked, and stale sessions return `401`.
- Missing capability is `403`; foreign record generic `404`; version conflict `409`.
- Every organization route derives route UUID and rejects body/header/user mismatches.
- Role change, suspension/removal, lifecycle change, password reset, logout, and revoke-all take effect immediately.
- CSRF/login-CSRF, Origin, CORS, cookie flags, proxy trust, no-store, and security headers.
- API-key and external-link positive scope plus cross-context denial.
- Support scope/step-up/expiry/revoke/audit when enabled.
- Compatibility headers and flags fail when disabled and cannot fallback.
- Bounded cursors cannot cross tenants, filters, or endpoints.

### Frontend tests

- Bootstrap/loading prevents stale protected content.
- Zero, one, and multiple membership selection and canonical tenant routes.
- Direct unauthorized, suspended, removed, and deleted route behavior.
- Azar/Solar switches cancel requests, advance epoch, partition/clear caches/drafts/tokens, and never flash prior data.
- Delayed old-context queries and mutation callbacks cannot affect the new context.
- Logout/revocation clears every tab and sensitive state.
- Role downgrade/suspension refreshes navigation and denies direct actions.
- Every tenant query/persisted key includes organization UUID.
- Safe `401`, `403`, `404`, and `409` UX.
- Hidden UI never substitutes for backend denial.

### Security and resilience tests

- Session fixation, malformed token, prefix collision, replay after rotation/revoke, and timing behavior.
- Login, account, and organization enumeration resistance.
- Untrusted/missing Origin, CSRF, permissive CORS, callback and return-path abuse.
- Spoofed identity/forwarding/organization/role/agent headers.
- Valid Azar session against Solar UUID, slug, record and cursor, and reverse.
- Multi-org user cannot reuse one tenant's capability in another.
- API key against wrong tenant/scope/IP/expiry and browser-session endpoints.
- Contract link against another entry/role/tenant or dashboard route.
- Support without grant, step-up, correct scope, or unexpired authorization.
- Session-store, invalidation, audit, and Supabase failure behavior.
- Representative load, membership pagination, revoke propagation, and bounded last-seen writes.

Tests use fake Supabase/provider adapters and isolated real-database fixtures. They never call production APIs.

## Acceptance criteria

1. Supabase Auth remains identity-only; no login or registration grants organization authority.
2. `app_sessions` stores strong token hashes and revocable server state only.
3. Raw app tokens contain no user, organization, role, capability, or expiry claims.
4. Production cookies are host-only, Secure, HttpOnly, Path `/`, approved SameSite, and bounded.
5. Standard, remembered, idle, absolute, rotation, last-seen, cleanup, and device flows are tested.
6. Logout, revoke, role/membership changes, security events, and lifecycle changes invalidate authority as specified.
7. Protected requests revalidate current state or use only approved short synchronously invalidated cache.
8. Session APIs return safe summaries with no-store and no secret/global authority.
9. Password, Google, verification, reset, and email-change flows resist enumeration and create no admin grant.
10. Required owner/operator MFA and step-up hooks exist before high-risk operations enable.
11. Cookie mutations enforce CSRF and exact Origin.
12. Credentialed CORS uses exact origins and no wildcard reflection.
13. `OrganizationRequestContext` is the canonical human-member context.
14. Middleware follows the specified order and request data cannot replace context.
15. Protected APIs use explicit organization namespaces.
16. Slugs/hosts remain hints followed by UUID membership/capability checks.
17. Standard `401`, `403`, generic `404`, `409`, `422`, `429`, and fail-closed `503` behavior is documented/tested.
18. Lists use bounded cursor pagination, stable sorting, filters, and tenant-bound cursors.
19. `ContractLinkContext` is one tenant/entry/role and cannot become membership.
20. Organization keys use one-time raw display, strong hash, scopes, expiry, last-use, optional IP, rotation, and revocation.
21. API keys cannot create human sessions or access forbidden governance/platform/support operations.
22. Support is separate/disabled by default and, if enabled, uses MFA, reason, approval, scope, expiry, visibility, audit, and emergency revoke.
23. Global grants, keys, identity headers, insecure IDs, caller agent IDs, and old sessions have an explicit removal path.
24. Failed canonical authentication never falls back to compatibility.
25. Frontend protected routes use server-confirmed organization UUID context.
26. Authentication/organization providers replace caller-selected identity.
27. Every tenant query and browser draft/token key contains organization UUID.
28. Switch/logout cancels requests, advances epoch, clears/partitions state, and rejects stale callbacks.
29. Direct navigation renders no tenant content before validation.
30. Multiple tabs converge safely on logout/revocation/context changes.
31. Permission-aware navigation exists while backend checks remain authoritative.
32. Cross-tenant IDs, cursors, keys, links, caches, drafts, and delayed responses pass Azar/Solar tests.
33. Auth telemetry has correlation/context without secrets or unnecessary PII.
34. Security dependency failures fail closed.
35. Contract/property flows consume canonical context without alternate unscoped repositories.
36. Architecture, environment, API, testing, operations, key, support, and migration docs match.
37. SPEC-34 proves old sessions/compatibility principals rejected before Solar real data.

## Verification commands and evidence

Implementation must add stable commands for session/context units, real-database authorization, frontend switching/cache, compatibility scans, and docs. Final verification includes equivalents of:

```bash
git status --short
git diff --check
rg -n "contract_admin_users|isAdmin|X-Authenticated-User-Id|X-User-Id|CONTRACT_ALLOW_INSECURE_AGENT_ID|VITE_CONTRACT_ALLOW_INSECURE_AGENT_ID|agent_user_id" backend frontend
npm --prefix backend run typecheck
npm --prefix frontend run build
npm --prefix backend test
npm --prefix frontend test
```

The repository currently has no root `package.json` documentation checker. If `docs:check` is introduced, it validates links, indexes, and structure without silently rewriting files. Otherwise record available Markdown/link validation.

Closure evidence includes schema/migration fingerprints, cookie/CSRF/origin review, route/capability/principal matrices, test results, compatibility scans, environment/proxy/callback validation, security decisions, session-invalidation rehearsal, and SPEC-34 Azar/Solar certification.

## Documentation and traceability

- Link migrations, middleware, contexts, tests, runbooks, and compatibility removal to this SPEC and acceptance criteria.
- Maintain a route matrix with credential mode, organization resolution, capability/scope, lifecycle, CSRF/Origin, errors, audit, and tests.
- Maintain a principal matrix proving contexts cannot union or convert.
- Record approved lifetimes, cookies, origins, proxies, MFA, and support decisions explicitly.
- Update canonical docs and roadmap indexes only when implementation/status changes.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Stale role remains in session | Opaque token, current membership lookup, immediate invalidation |
| Session table leak yields tokens | High entropy, keyed/peppered hash only, rotation |
| Fixation/replay | Rotate on auth/step-up and atomically revoke predecessor |
| CSRF/permissive CORS | Session-bound CSRF, exact Origin and CORS |
| Metadata grants access | Supabase identity-only boundary; membership authoritative |
| Caller selects another tenant | Route UUID plus membership; request fields never authorize |
| Principal privilege union | Separate credential modes, contexts, routes, and audits |
| Key leaks | One-time display, hash, scopes, expiry, optional IP, revocation |
| Invisible support super-admin | Denied by default; separate MFA/grant/reason/scope/expiry/audit |
| Azar data flashes in Solar | UUID keys, epochs, cancellation, stale-callback rejection |
| Drafts mix tenants | UUID/user/schema keys and switch/logout cleanup |
| Compatibility survives | Inventory, telemetry, negative tests, SPEC-34 removal |
| Authorization dependency fails | Fail closed; no permissive fallback |
| Route rules drift | One context pipeline, capability registry, and route matrix |

## Completion gate

MT-SPEC-03 is complete only when the revocable opaque-session flow, current membership/organization validation, canonical typed contexts/middleware, API namespace/error/pagination conventions, scoped machine/link boundaries, optional support deny-by-default boundary, protected frontend tenant routing, switch/cache/draft isolation, and compatibility retirement plan are implemented, documented, and tested.

It remains pending until real-database and frontend tests prove Azar and Solar sessions, roles, keys, links, cursors, caches, drafts, in-flight responses, and optional support grants cannot cross organizations, and SPEC-34 proves old global sessions/principals are invalidated before Solar stores real data.

