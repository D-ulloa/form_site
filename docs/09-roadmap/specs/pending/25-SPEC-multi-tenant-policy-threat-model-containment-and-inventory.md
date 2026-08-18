# SPEC-25 / MT-SPEC-01 Multi-tenant SaaS foundation — product policy, threat model, containment, and inventory

**Date:** 2026-08-18
**Priority:** critical
**Status:** pending approval
**Roadmap identifier:** MT-SPEC-01
**Dependencies:** none
**Blocks:** MT-SPEC-02 through MT-SPEC-10 and the onboarding of any second real organization

---

## Specification identity

**Name:** Multi-tenant product policy, security threat model, immediate containment, and legacy inventory.

**Description:** Establish the decisions and evidence required before implementation begins, and immediately contain known risks that should not remain open during a long migration.

**Why it is necessary:** Organization isolation cannot be designed consistently until product policies and trust boundaries are explicit. The current repository also contains single-tenant behaviors—global administrator grants, caller-controlled property identities, public Drive permissions, a fixed Make endpoint, global integration destinations, and unscoped compatibility credentials—that require prompt containment and a verified inventory.

## Summary

This specification defines the first implementation boundary for converting the current Azar-oriented application into a multi-tenant SaaS. It has four inseparable outcomes:

1. approve the product and security policies that every later multi-tenant SPEC will use;
2. produce a complete, reconciliation-ready inventory of current users, data, files, identities, credentials, integrations, permissions, and runtime artifacts;
3. document the threat model and non-negotiable organization-isolation invariants; and
4. immediately contain current global or public access paths that are unsafe to leave active during the longer migration.

This SPEC does not create the organization, membership, or tenant-scoped business schemas. Those are owned by MT-SPEC-02 and later SPECs. It establishes the trusted baseline from which those changes can be implemented and prevents the current single-tenant compatibility behavior from being mistaken for safe multi-tenant isolation.

This document specifies required behavior and evidence. It does not itself rotate credentials, change provider permissions, apply migrations, or modify runtime code.

## Authority and relationship to earlier specifications

This is the first formal implementation SPEC derived from:

- `docs/09-roadmap/specs/research/23-RESEARCH-multi-tenant-saas-architecture.md`; and
- `docs/09-roadmap/specs/research/24-RESEARCH-multi-tenant-saas-specification-roadmap.md`.

The project file number is `SPEC-25` because `SPEC-22` is the latest existing implementation SPEC and the two multi-tenant research documents occupy project document numbers 23 and 24. The multi-tenant roadmap identifier remains `MT-SPEC-01`.

Earlier completed SPECs remain historical records of implemented behavior. Where this SPEC is approved, its containment rules supersede these earlier behaviors in any environment containing real data:

- SPEC-09's unscoped shared API key and process-global Sheet destination become temporary Azar-only compatibility paths and may not be used as a tenant boundary.
- SPEC-10's durable contract rows, immutable submissions, private buckets, and hashed external role tokens remain valid foundations.
- SPEC-17's hosted-preview `X-User-Id` compatibility must not be enabled with real data.
- SPEC-19's automatic administrator grant for main-page registration and Google login must be disabled until organization onboarding exists.
- SPEC-22's per-creator visibility and null-owner visibility remain temporary Azar-only compatibility behavior; neither is the future organization boundary.

If an earlier SPEC conflicts with this containment boundary, this approved SPEC governs the real-data deployment. Historical SPEC documents must not be rewritten to pretend their former behavior never existed.

## Context

The application currently combines a durable contract workflow with a property-submission workflow and several retained compatibility paths. Some foundations are security-positive: Supabase Auth identity, server-side validation, private contract buckets, HMAC-hashed role tokens, immutable contract submission rows, and an HttpOnly application cookie.

The application is nevertheless still single-tenant. The following observed implementation details make it unsafe to onboard Solar or any other independent agency:

| Boundary | Current repository evidence | Immediate risk |
|---|---|---|
| Account provisioning | `backend/src/services/contractPasswordAuth.ts` calls `ensureContractAdminUser` after password registration and Google session exchange | Any newly accepted account can become a global contract administrator |
| Database provisioning | `supabase/migrations/20260803010000_contract_spec19.sql` and its repair migration install and backfill `contract_admin_users` grants | Customer access is global, not organization-scoped |
| Application session | `ContractPasswordSession` embeds `isAdmin` in a signed cookie that can live for up to 30 days | Removing a durable grant does not independently revoke an already-issued cookie |
| Contract compatibility identities | `backend/src/services/contractAuth.ts` accepts a global API key, trusted gateway identity, and optionally browser-controlled `X-User-Id` | Compatibility principals have no organization scope |
| Legacy contract ownership | `canAccessContractEntry` grants access to null-owner records and grants the API key access to all records | A null or global key can become cross-organization access after a second agency exists |
| Property identity | `POST /properties/media/presign` and `POST /properties/submit` accept caller-supplied `agent_user_id`, `agent_name`, and `agent_email` | A caller can attribute a submission or upload session to another agent |
| Frontend identity | `frontend/src/app/contexts/AgentContext.tsx` persists editable `form_site_agent` data in `localStorage` | Browser state can be mistaken for authenticated identity |
| Upload sessions | `backend/src/services/mediaUploadSessionService.ts` stores sessions in a process-local `Map` keyed only by caller-supplied agent ID | State is neither durable nor bound to an authenticated organization |
| Drive permissions | `backend/src/services/googleDriveService.ts` creates an `anyone` / `reader` permission on every property folder | Anyone possessing a leaked URL can access the folder |
| Provider destinations | Drive, property Sheets, legacy contract Sheets, and Make use deployment-wide environment configuration | Every future organization would otherwise share Azar's destinations |
| Contract Make trigger | `supabase/migrations/20260806000000_contract_generate_trigger_webhook.sql` contains a fixed webhook and sends `to_jsonb(NEW)` | The endpoint is committed and the payload can include PII and token hashes |
| Runtime records | Property logs and retained SPEC-09 audits can live in `backend/logs/*.json` or be written to deployment console output | Local or provider logs can contain sensitive data without tenant scope or durable access controls |
| Branding and caches | The public contract page imports the Azar logo and contract admin query keys include user ID rather than organization ID | The frontend has no tenant boundary and can retain agency-specific state |

This table is evidence for scoping, not the inventory itself. The implementation of this SPEC must produce a dated inventory from each deployed environment and external provider.

## Motivation

Adding `organization_id` later will not retroactively identify who owns current rows, files, provider resources, administrator grants, or local logs. It will also not neutralize a public Drive ACL, a committed webhook, a spoofable identity header, an automatically granted administrator account, or a still-valid legacy application cookie.

If policy choices are left implicit, different implementation SPECs can make incompatible assumptions about who owns existing data, how members collaborate, whether one user may work for several agencies, where integrations live, how long sensitive evidence is retained, and whether platform staff may inspect customer content. If the current risks remain active during that design period, new data and access can continue to accumulate faster than the migration can reconcile them.

The project therefore needs one approved, reproducible, and recoverable baseline before it creates the organization foundation. This SPEC makes that baseline and its immediate safeguards an explicit release gate.

## Objective

Approve one explicit multi-tenant policy baseline, establish a trustworthy and recoverable Azar migration inventory, and close the current public, spoofable, automatically global, and fixed-destination access paths before organization-schema implementation begins.

## Terminology

The following terms are normative for this SPEC and all later multi-tenant work:

- **Organization:** a SaaS customer such as Azar or Solar.
- **Organization member:** an authenticated employee or collaborator whose access comes from an active membership in one organization.
- **Rental tenant / inquilino:** the person renting a property. Existing rental-domain fields beginning with `tenant_*` retain this meaning.
- **External contract participant:** a person using one role link for one contract without receiving dashboard membership.
- **Platform operator:** a person explicitly authorized to administer the SaaS platform rather than an employee of a customer organization.
- **Real-data environment:** any local, preview, staging, production, backup, log, or provider environment that contains actual customer, applicant, contract, property, identity-document, financial-evidence, or credential data.
- **Synthetic environment:** an isolated environment containing only generated test data and test credentials, with no access to real-data providers or backups.
- **Quarantine:** a restricted holding state for a record or asset whose ownership cannot be proven. Quarantined material is not globally visible and is excluded from normal customer access.
- **Inventory baseline:** the timestamped counts, manifests, checksums, ownership evidence, unresolved exceptions, and provider-permission snapshots used to prove migration completeness.
- **Containment:** a fail-closed temporary control that reduces current exposure without claiming that full multi-tenant isolation has been implemented.

The SaaS partition key must be called `organization_id` in new public JSON, database, and persisted contracts. Do not introduce `tenant_id` for the SaaS customer boundary.

## Scope

### Includes

- Product decisions for existing data ownership, onboarding, intra-organization visibility, multiple memberships, integrations, property-edit projections, retention, support access, branding, custom domains, plans, and billing timing.
- A threat model covering protected assets, trust boundaries, attacker types, abuse cases, privacy risks, and isolation invariants.
- Inventory of Supabase Auth users, administrator grants, contract tables, database functions/triggers/grants, Storage objects and policies, property logs, contract audit files, Drive resources, Sheets, Make scenarios/hooks, API keys, trusted headers, environment variables, deployment scopes, and provider permissions.
- Aggregate counts, deterministic checksums, ownership evidence, unresolved-item quarantine, and a reproducible reconciliation baseline.
- Encrypted backups and rollback evidence for the database and required migration manifests.
- Closure of automatic global-administrator provisioning in real-data environments.
- Temporary authentication containment for the currently unauthenticated property submission and upload paths.
- Rejection of browser-controlled `X-User-Id` outside exact local development with synthetic data.
- Revocation of the committed fixed Make endpoint and forward-only removal of its database trigger.
- Removal of new `anyone` / `reader` Drive permissions and classification of existing public Drive folders.
- Credential review, rotation, revocation, and least-privilege checks where exposure, ownership, or scope cannot be proven.
- Redacted monitoring, incident-response triggers, escalation responsibilities, and evidence preservation.
- Documentation and traceability needed for MT-SPEC-02 through MT-SPEC-10.

### Excludes

- Creating `organizations`, memberships, invitations, organization settings, or final RBAC tables; MT-SPEC-02 owns them.
- Implementing the final revocable multi-organization session and organization switcher; MT-SPEC-03 owns them.
- Adding organization foreign keys, composite constraints, RLS, distributed rate limits, or final audit infrastructure; MT-SPEC-04 owns them.
- Refactoring the complete contract domain to organization ownership; MT-SPEC-05 owns it.
- Creating the durable property/revision/submission-run domain; MT-SPEC-06 owns it.
- Implementing the final media-asset registry or storage migration; MT-SPEC-07 owns it.
- Implementing organization-owned integration configuration, outbox delivery, retries, and reconciliation; MT-SPEC-08 owns it.
- Billing, custom domains, enterprise SSO, dedicated deployments, and analytics implementation; MT-SPEC-09 owns them.
- Backfilling all legacy records and performing the final Azar/Solar cutover; MT-SPEC-10 owns it.
- Claiming that containment alone makes the application safe for a second organization.
- Rewriting Git history or editing already-applied Supabase migration files. Compromised values must be revoked externally and neutralized with new forward migrations.

## Non-negotiable security invariants

The policy approval produced by this SPEC must ratify these invariants without weakening them:

1. Every active durable business record and asset must ultimately belong to exactly one organization.
2. Missing `organization_id` can never mean "visible to every organization."
3. Organization scope must come from a server-validated active membership or a narrowly scoped external capability, never solely from request JSON, local storage, an email domain, a route slug, an agent ID, or frontend state.
4. A record UUID, public label, Drive link, raw Storage path, or organization slug is an identifier, not authorization.
5. `created_by_user_id` and `assigned_to_user_id` are attribution or workflow values, not the SaaS boundary.
6. Normal cross-organization record lookups must return a generic `404` and produce no side effect.
7. Child rows and assets may never be attached to a parent in another organization.
8. The Supabase service-role credential remains server-only. RLS cannot be treated as sufficient because the service role bypasses it.
9. Signed file views require current authorization against the owning organization, record, and capability.
10. Organization scope must be present in caches, idempotency keys, upload sessions, rate limits, audit events, logs, jobs, exports, metrics, and integration deliveries.
11. Membership removal and organization suspension must take effect on the next protected request or within an explicitly approved, short invalidation window.
12. External role links remain limited to one contract and one role and can never establish dashboard membership.
13. Provider destinations and credentials must resolve from the owning organization before any external side effect.
14. A frontend feature flag can hide an incomplete feature but can never authorize it. A disabled feature must also be unreachable through backend and worker paths.
15. Ambiguous legacy ownership must fail closed into quarantine, never into global visibility.

## Required product-policy decisions

The following decisions are deliverables of this SPEC. The table gives the architecture's recommended default. The accountable product and security owners may approve a different choice only if the decision document explains how it preserves every security invariant and identifies all downstream SPEC changes.

No row may remain `TBD` when this SPEC is marked approved or complete.

| ID | Decision | Recommended first-release policy | Downstream owner |
|---|---|---|---|
| POL-01 | Existing data ownership | Assign verified current production users, records, files, and provider resources to Azar; quarantine every ambiguous item | MT-SPEC-10 |
| POL-02 | Organization onboarding | Platform-created organizations with invite-only membership until isolation is proven; no open self-service customer creation | MT-SPEC-02 and MT-SPEC-03 |
| POL-03 | Visibility inside an organization | Active members see organization records according to role; creator and assignee remain filters/attribution. Assigned-only access may be added as an explicit organization policy | MT-SPEC-02, MT-SPEC-05, and MT-SPEC-06 |
| POL-04 | Multiple memberships | Support multiple organization memberships in schema and sessions from the beginning, even if initial users belong only to Azar | MT-SPEC-02 and MT-SPEC-03 |
| POL-05 | Google and Make ownership | Use platform-managed credentials with a distinct private destination per organization for the first release; preserve a path to organization-owned OAuth and webhooks | MT-SPEC-08 |
| POL-06 | Property modification projection | Internal database revisions are canonical. Before edits are enabled, explicitly choose whether each edit appends or updates a Sheet projection and whether it emits a Make event. No unspecified external write is allowed | MT-SPEC-06 and MT-SPEC-08 |
| POL-07 | Basic branding and URLs | Use path-based `/t/:organization_slug` dashboard routing and safe per-organization name/logo/theme values; defer custom domains | MT-SPEC-02, MT-SPEC-03, MT-SPEC-05, and MT-SPEC-09 |
| POL-08 | Plans and billing timing | Include server-side `plan_key` / entitlement structure but defer automated billing until isolation, usage measurement, and lifecycle controls are stable | MT-SPEC-02, MT-SPEC-04, and MT-SPEC-09 |
| POL-09 | Retention and deletion | Approve explicit periods and legal bases per data class before Solar: contract data, DNI, guarantor evidence, property media, audit, unattached upload, provider copy, export, and backup | MT-SPEC-02, MT-SPEC-04, and MT-SPEC-07 |
| POL-10 | Platform support access | No customer-content access by default. Any approved support access requires least privilege, step-up authentication, reason, time limit, customer visibility where appropriate, and immutable audit | MT-SPEC-03 and MT-SPEC-04 |
| POL-11 | Suspension behavior | Block mutations and integration delivery immediately; define owner read/export and reactivation behavior explicitly | MT-SPEC-02, MT-SPEC-03, and MT-SPEC-08 |
| POL-12 | Security incident notification | Name incident commander, technical owner, product owner, legal/privacy contact, notification decision owner, severity thresholds, and response-time targets | MT-SPEC-04 and operations |

### Policy-decision record requirements

The implementation must create an approved decision record under `docs/09-roadmap/decisions/` that:

- records the final value, owner, approval date, and rationale for POL-01 through POL-12;
- states which later SPECs consume each decision;
- records numeric retention periods rather than phrases such as "as needed";
- distinguishes legally required retention from product preference;
- records the jurisdictions and qualified legal/privacy review required for DNI and financial evidence;
- defines who may change a decision and what regression review is required;
- contains no customer PII, raw credentials, webhook URLs, access tokens, or sensitive provider resource names.

## Threat model

### Protected assets

- Supabase Auth accounts, identity metadata, administrator grants, future memberships, and application sessions.
- Contract entries, role submissions, combined payloads, immutable revisions, events, status, and external role-link hashes.
- DNI images, salary receipts, property guarantees, and other identity or financial evidence.
- Property payloads, media, submission outcomes, logs, future revisions, and external identifiers.
- Supabase database, RLS policies, functions, triggers, service-role key, anon key, and Storage buckets.
- Google OAuth refresh tokens, service-account credentials, Drive folders/files, Sheets, and ACLs.
- Make webhook URLs, secrets, scenarios, request history, and downstream connections.
- Server API keys, trusted gateway identity, cookie-signing material, deployment variables, backups, exports, and incident evidence.
- Organization branding, domain configuration, plan/entitlement state, audit history, and usage information.
- Availability and fair access to shared server, provider, storage, and worker capacity.

### Trust boundaries

1. Anonymous browser to frontend.
2. Frontend JavaScript/local storage to the same-origin backend.
3. External contract participant and raw role URL to entry-scoped backend capability.
4. Reverse proxy/gateway to Express, including trusted-header stripping and insertion.
5. Express to Supabase through the service-role client.
6. Express to signed Supabase Storage upload/download operations.
7. Express or database trigger to Google and Make.
8. Application runtime to local filesystem and platform log provider.
9. Engineers/platform operators to deployment configuration, provider consoles, backups, and production data.
10. One organization context to another organization context in database, cache, job, file, export, and provider resources.

### Threat actors

- unauthenticated internet user;
- legitimate external contract-link holder attempting to exceed that link's capability;
- ordinary member attempting an administrator action;
- malicious or careless member attempting to access another organization;
- removed or suspended member with a stale cookie, copied URL, or cached data;
- user who modifies browser local storage, request body, headers, UUIDs, paths, or query strings;
- holder of a leaked global API key, role URL, signed URL, webhook URL, OAuth token, or service credential;
- compromised Google or Make integration;
- platform operator exceeding approved support authority;
- developer or deployment process accidentally mixing production and preview configuration;
- automated attacker abusing registration, upload, link validation, or provider capacity.

### Abuse cases and required treatment

| ID | Abuse case | Immediate treatment in this SPEC | Permanent owner |
|---|---|---|---|
| TM-01 | Attacker self-registers and receives global admin | Close real-data registration and remove automatic grants | MT-SPEC-02/03 |
| TM-02 | Arbitrary Google user signs in and is promoted | Require a pre-reviewed temporary Azar grant; do not grant during handoff | MT-SPEC-02/03 |
| TM-03 | Removed admin reuses a long-lived embedded-admin cookie | Invalidate legacy app sessions after grant review without invalidating contract role links; freeze/review grant changes | MT-SPEC-03 |
| TM-04 | Caller spoofs `X-User-Id` | Reject outside exact local synthetic development; remove hosted-preview opt-in | MT-SPEC-03 |
| TM-05 | Caller submits a property as another agent | Require temporary reviewed authentication and derive attribution server-side | MT-SPEC-06 |
| TM-06 | Public Drive link leaks | Stop new `anyone` permissions; inventory and remediate existing ACLs | MT-SPEC-07/08/10 |
| TM-07 | Committed Make hook is invoked or discovered | Rotate/revoke it, disable the trigger with a forward migration, inspect history | MT-SPEC-08 |
| TM-08 | Complete contract row, PII, or token hash reaches Make | Disable the current trigger; future payloads must be allowlisted | MT-SPEC-08 |
| TM-09 | Global API key exposes all contracts | Inventory, rotate/revoke if unproven, constrain to temporary Azar use, and block second-organization use | MT-SPEC-03 |
| TM-10 | Null-owner record becomes globally visible | Count and classify now; never onboard Solar while null-global behavior is reachable | MT-SPEC-05/10 |
| TM-11 | Service-role code bypasses RLS | Inventory every call/RPC/grant; later require scoped repositories and real-database tests | MT-SPEC-04 |
| TM-12 | Browser cache displays prior organization | Record every cache/draft key; later partition and clear on switch/logout | MT-SPEC-03 |
| TM-13 | Storage path or signed URL is reused across records | Inventory objects/references; later require asset ownership and authorization before signing | MT-SPEC-07 |
| TM-14 | Azar data is sent to Solar's or a global provider destination | Freeze current destinations as Azar-only and prevent Solar onboarding | MT-SPEC-08/10 |
| TM-15 | Local logs, platform logs, backups, or exports disclose PII | Restrict, redact, inventory, encrypt, and define retention/access | MT-SPEC-04 |
| TM-16 | Ambiguous provider timeout duplicates external data | Record current non-idempotent paths and require reconciliation before manual retry | MT-SPEC-08 |
| TM-17 | A frontend flag is bypassed by direct API request | Require backend/worker disablement for any unavailable feature | All implementation SPECs |
| TM-18 | One organization exhausts shared capacity | Record current in-memory/global controls; later implement distributed, organization-scoped quotas and fair scheduling | MT-SPEC-04 |

## Requirements

### 1. Governance and evidence handling

- Assign accountable product, security, data-migration, operations, and provider owners.
- Use one capture timestamp in UTC for each baseline run and record the environment/provider snapshot time where exact atomic capture is impossible.
- Store only a redacted summary and cryptographic evidence references in Git.
- Store detailed row/object/user/resource mappings in an approved encrypted evidence location with least-privilege access.
- Do not copy raw JWTs, API keys, OAuth tokens, service-account JSON, webhook URLs, role tokens, signed URLs, DNI data, financial evidence, or unredacted customer payloads into issues, SPECs, CI logs, or committed audit files.
- Identify a credential by provider, purpose, environment, owner, scope, creation/rotation dates, last-use evidence, and a one-way fingerprint. Never record the raw value.
- Record every inventory query/script version and its checksum so the baseline can be reproduced.
- Record failures and inaccessible resources as unresolved exceptions. An inaccessible inventory source cannot be counted as empty.
- Treat inventory evidence as sensitive security material with an approved retention and destruction policy.

### 2. Required inventory coverage

The inventory must cover every real-data environment and provider account, including production, previews that ever received real data, staging, local operator copies, persistent volumes, platform logs, backups, and retired resources still accessible.

#### Supabase identity and database

- Supabase project reference and region, recorded without secret keys.
- `auth.users` aggregate count and a protected mapping of user ID, normalized email, providers, creation/last-sign-in state, confirmation state, and relevant metadata.
- `public.contract_admin_users` count, source of each grant, last verified business owner, and disposition: approved Azar grant, remove, or unresolved.
- Counts and primary-key manifests for `contract_entries`, `contract_submissions`, and `contract_events`.
- Counts of null/blank `created_by_user_id` and invalid/missing parent relationships.
- Current functions, triggers, extensions, grants, RLS enablement/policies, service-role privileges, and migration history.
- Current `generar_contrato` trigger/function state and any `pg_net` requests or provider-side evidence available.
- Any additional schemas, tables, views, functions, cron jobs, vault values, or webhooks not represented by committed migrations.
- Database size, backup/PITR capability, retention, project-member access, and security settings relevant to recovery.

#### Supabase Storage

- Buckets including `contract-dni`, `contract-evidence`, `property-media`, and any non-default or retired buckets.
- For every object: bucket, path, byte size, content type, creation/update time, ETag/checksum when available, and referenced/unreferenced status.
- Bucket public/private state, object-size/MIME settings, policies, signed-URL practices, and principals capable of object administration.
- A protected mapping from each contract object to entry/role/repeatable item and from each property object to its current submission evidence.
- Orphan, duplicate, malformed, unknown-owner, and missing-object counts.

#### Runtime and deployment

- All deployed frontend/backend environments, domains, Git revisions, runtime versions, and environment scopes.
- Names—not values—of all relevant environment variables from the deployment platform and operator environments.
- Fingerprints and ownership for `SUPABASE_SERVICE_ROLE_KEY`, `CONTRACT_TOKEN_SECRET`, `CONTRACTS_API_KEY`, Google credentials, Make hooks/secrets, and trusted-gateway credentials.
- Current values by classification only for security switches, such as enabled/disabled for insecure identity and registration; do not print secret-bearing values.
- Reverse-proxy topology, `TRUST_PROXY_HOPS`, trusted-header stripping/insertion, CORS origins, cookie scope, and production/preview separation.
- `backend/logs/*.json` count, date range, permissions, durable location, backup status, and record type without reading contents into general-purpose logs.
- Platform log locations and retention, including any Vercel console output containing serialized property submission logs.
- Local or CI copies of `backend/.env`, `frontend/.env.local`, dumps, exports, screenshots, test fixtures, or provider keys that may contain real data.
- Generated/deployed `backend/dist` artifacts where source and deployed behavior may differ.

#### Google

- OAuth client IDs, refresh-token principals, service accounts, delegated subjects, scopes, account owners, and last-use/rotation evidence.
- Property parent Drive folder and every known child property folder/file created by the application.
- ACLs, inherited permissions, link-sharing state, shared-drive context, owners, and external principals for each relevant Drive resource.
- Property spreadsheet ID/range and retained contract spreadsheet ID/tab, recorded in protected evidence rather than committed documentation.
- Sheet owners/editors/viewers, service-account permissions, data ranges, row counts, header checksums, and last-update evidence.
- Any additional Forms, folders, Sheets, scripts, or automation resources referenced by retired configurations.
- Ambiguous or inaccessible resources and any links found in property/audit logs.

#### Make and webhooks

- `MAKE_WEBHOOK_URL` destination fingerprint and owning scenario.
- The committed contract webhook fingerprint, scenario state, request-history availability, downstream modules, data retention, and rotation/revocation evidence.
- Every other webhook or Make scenario connected to the application, Supabase, Google, or provider outputs.
- Scenario owners/editors, connections, data stores, error handlers, queues, replay behavior, and destination systems.
- Provider request history sufficient to determine whether unexpected calls or sensitive complete-row payloads occurred.

#### Application identities and interfaces

- `CONTRACTS_API_KEY` owner, clients, source IPs where available, last use, purpose, and rotation disposition.
- `CONTRACT_ADMIN_USER_IDS` entries and the business justification for each.
- Trusted `X-Authenticated-User-Id` gateway, proxy enforcement, and all consumers.
- `X-User-Id` consumers in frontend, backend, tests, preview deployments, scripts, and external clients.
- External contract role-link behavior and token-secret ownership without collecting raw role links.
- Public and protected route inventory, including every property, contract, audit, upload, signed-view, health, and authentication route.
- Frontend routes, local-storage keys, React Query keys, hard-coded organization branding, and any feature flags affecting reachable behavior.

### 3. Baseline manifest and reconciliation rules

Each source inventory must produce:

- source name and environment;
- capture timestamp in UTC;
- query or API version;
- total count;
- count by relevant status/type;
- ordered identifier manifest or provider-native export;
- SHA-256 checksum of a deterministic canonical representation;
- owner/disposition counts;
- unresolved/error count;
- evidence-location reference;
- reviewer and review timestamp.

Canonicalization must be documented and stable. At minimum:

- database manifests sort by table and primary key;
- Storage manifests sort by bucket and object path;
- Drive manifests sort by resource ID;
- Sheet baselines record row count plus a documented stable checksum strategy that does not expose cells in Git;
- user/grant manifests sort by immutable user ID;
- environment/credential manifests sort by environment and variable name and contain fingerprints only.

The redacted audit report must include a reconciliation table with `observed_count`, `assigned_to_azar`, `quarantined`, `scheduled_for_removal`, and `unresolved`. For each source:

`observed_count = assigned_to_azar + quarantined + scheduled_for_removal + unresolved`

No record or object may be silently omitted because it cannot be parsed, opened, or linked to a parent.

### 4. Existing ownership and quarantine baseline

- Apply POL-01 only after review; do not infer ownership from free-text `company` or `role` metadata alone.
- Approved current users must be mapped to Azar with a proposed future role and evidence source, but this SPEC does not create memberships.
- Current contract rows may be classified as Azar only when the deployment/resource history supports that conclusion.
- Contract child rows inherit the proposed organization only through a verified parent relationship.
- Property logs, media, Drive folders, Sheet rows, and Make deliveries require correlation evidence such as immutable IDs, stored links, timestamps, and checksums.
- An ambiguous item must receive a quarantine identifier, reason, evidence reference, reviewer, and next action.
- Quarantined material must not be made visible through normal user/API paths and must not be deleted merely to make reconciliation totals pass.
- The audit must identify every current null-owner contract and every global compatibility path that could still expose it.

### 5. Backup and rollback evidence

Before any containment migration, credential change, ACL change, grant removal, or session invalidation:

- create an encrypted database backup/export using the provider-supported method;
- record schema/migration state and Supabase project settings needed to interpret the backup;
- export the identity/grant and resource manifests needed to verify rollback;
- export Storage and provider metadata manifests and preserve required business objects according to policy;
- record backup owner, timestamp, encryption method, key custodian, retention, location, size, and SHA-256 checksum;
- verify the backup is readable and that required artifacts are present;
- prohibit backup storage in the Git repository, public Drive links, unencrypted local folders, or general-purpose CI artifacts;
- document that later full restore and organization-level logical restore rehearsals belong to MT-SPEC-04 and MT-SPEC-10.

Backup evidence must not become a second uncontrolled copy of customer data.

### 6. Global-administrator containment

Until MT-SPEC-02 and MT-SPEC-03 replace customer access with memberships:

- Disable open password registration in every real-data environment. `POST /api/auth/register` must fail closed with `403` and a stable `REGISTRATION_CLOSED` error without creating a Supabase user, grant, or cookie.
- Synthetic local development may retain a clearly isolated registration fixture. It must not connect to production Supabase, Google, Make, logs, or backups.
- Stop `loginContractGoogleUser` from creating or upserting an administrator grant. Google handoff may establish a session only for an account already present in the reviewed temporary Azar administrator set.
- Add a forward migration that removes or neutralizes `contract_admin_on_signup` and `grant_contract_admin_on_signup()`. Do not edit the already-applied SPEC-19 migration files.
- Keep `contract_admin_users` temporarily only as a reviewed Azar allowlist until MT-SPEC-02/03 migration.
- Review every existing grant. Remove or quarantine unapproved grants and preserve a redacted audit trail of reviewer, reason, and timestamp.
- Do not authorize from editable `company`, `role`, email domain, or other user metadata.
- Freeze new real-data grants. Any emergency grant before MT-SPEC-02 requires two-person approval, explicit expiry, business reason, and audit evidence.
- Invalidate every legacy application administrator session after the allowlist review so removed grants cannot survive in an embedded `isAdmin` cookie.
- Session invalidation must not invalidate external user/client contract role links. Do not rotate `CONTRACT_TOKEN_SECRET` solely to clear application cookies because the current implementation also uses it for role-token HMAC. Use a session-only cookie version/secret or an equivalent reviewed containment mechanism.
- Until MT-SPEC-03 provides durable revocation, any emergency grant removal after the cutover must also invoke the documented legacy-session invalidation procedure.

### 7. Property identity containment

Until MT-SPEC-06 provides organization-aware property APIs:

- Require the reviewed temporary Azar application session on property presign and submit routes in every real-data environment.
- An unauthenticated request to `POST /properties/media/presign` or `POST /properties/submit` must return `401` before upload issuance, payload processing, filesystem access, or provider side effects.
- Derive the temporary actor ID, display name, and email from the verified server-side session.
- Ignore or reject caller-supplied `agent_user_id`, `agent_name`, and `agent_email` as identity. If retained temporarily in a legacy provider payload, overwrite them on the server with verified values.
- `AgentContext` and `form_site_agent` may not authorize, attribute, presign, submit, or select another actor. The frontend should stop requiring editable agent identity for real-data property submission.
- Direct navigation to `/properties/new` without a valid session must enter the login flow or a clear unauthorized state.
- If authentication cannot be added safely in the containment release, disable the property presign/submit routes and their UI in real-data environments. A frontend-only disablement is insufficient.
- The process-local upload session remains a documented Azar-only limitation until MT-SPEC-06/07; it must never be represented as organization-safe.

### 8. Insecure and compatibility identity containment

- Outside exact `NODE_ENV=development` with synthetic data, reject `X-User-Id` unconditionally.
- Remove the hosted-preview override from backend decision logic and from frontend production behavior.
- Remove `CONTRACT_ALLOW_INSECURE_AGENT_ID` and `VITE_CONTRACT_ALLOW_INSECURE_AGENT_ID` from real deployment scopes and mark them deprecated in examples/docs before deleting them under MT-SPEC-03.
- Add a startup/configuration failure if a non-development deployment attempts to enable either insecure identity option.
- Keep `X-Authenticated-User-Id` only where a documented trusted gateway strips inbound caller values and inserts a verified identity. Direct backend exposure without that gateway must reject the header or the deployment must be blocked.
- Inventory `CONTRACT_ADMIN_USER_IDS` and remove entries without a reviewed temporary Azar grant.
- Inventory `CONTRACTS_API_KEY`. If owner, clients, storage, last use, or scope cannot be proven, revoke it. If temporarily retained, rotate it, keep it server-only, document an expiry/removal owner, and classify every route it can access as Azar-only.
- No compatibility principal may be enabled for Solar or any second organization.

### 9. Fixed Make webhook containment

- Treat the webhook literal committed in `20260806000000_contract_generate_trigger_webhook.sql` as compromised.
- Rotate or revoke it in Make before relying on any source-code change.
- Disable the associated scenario or old hook so calls to the committed value cannot process data.
- Inspect available Make request/scenario history for unexpected callers, full-row contract payloads, token hashes, or other PII; open an incident if exposure cannot be ruled out under the approved thresholds.
- Add a new ordered Supabase migration that drops or disables `trigger_make_condicional` and removes/revokes `enviar_a_make_condicional()`.
- Do not edit the applied migration or restore the fixed endpoint during rollback.
- Until MT-SPEC-08, a `generar_contrato` status change must not send a database-originated webhook. The UI/API must report integration delivery as unavailable or deferred rather than claiming delivery.
- The process-global property `MAKE_WEBHOOK_URL` may remain only as an inventoried Azar-only destination if its ownership and secrecy are proven. Otherwise rotate/revoke it and disable that delivery path.
- Future Make work must use allowlisted versioned payloads and an organization-scoped outbox; it must never post `to_jsonb(NEW)`.

### 10. Drive public-sharing containment

- Remove the `drive.permissions.create` call that creates `{ role: 'reader', type: 'anyone' }` for new property folders.
- New folders must inherit or receive only the approved private Azar ACL during the containment period.
- Validate the configured parent folder/shared-drive permissions before enabling property submission. If private access for the reviewed Azar operators cannot be proven, fail closed before creating a business submission.
- Do not return or describe a Drive URL as authorization. A user without an explicit Google permission may receive an unavailable link; the application must not make it public to compensate.
- Inventory all existing property folders and classify each as private, public-to-anyone, domain-visible, externally shared, inaccessible, orphaned, or unknown.
- For public/external folders, record the owner, affected data class, link creation period, provider access evidence, remediation owner, and due date.
- Remove public permissions after backup/evidence capture and operational review unless a documented legal or recovery reason blocks removal.
- Do not delete Drive content as part of permission remediation.
- A rollback may restore access only to explicitly approved Azar accounts/groups. It must never recreate `anyone` access.

### 11. Global provider and credential containment

- Record the current Drive parent, property Sheet, legacy contract Sheet, property Make scenario, and credentials as temporary Azar-only resources.
- Confirm Google principals have the minimum required permissions and no unrelated Drive/Sheet access. Remove abandoned or unknown principals after evidence capture.
- Rotate any credential that is committed, logged, copied into a frontend variable, shared through an unapproved channel, owned by a departed person, older than approved policy, or impossible to attribute.
- Ensure `SUPABASE_SERVICE_ROLE_KEY`, Google secrets, Make secrets, session secrets, and API keys exist only in server/provider secret stores and approved recovery storage.
- Verify no server secret uses a `VITE_*` name or appears in a client bundle.
- Record a one-way fingerprint before and after rotation so deployment evidence can prove the active value changed without revealing it.
- Do not silently point global variables to Solar resources. Provider separation is implemented only by MT-SPEC-08.
- Freeze creation of any second organization's data until provider routing is organization-aware or the corresponding integration feature is disabled end-to-end.

### 12. Runtime logs and sensitive local artifacts

- Inventory existing ignored `backend/logs/*.json` files by count, date range, size, permissions, record kind, and evidence checksum without committing their contents.
- Restrict real-data log directory and file access to the service/operator roles that require it.
- Stop serializing complete property submission logs to general platform console output in real-data serverless deployments.
- General logs may contain opaque record ID, request ID, organization placeholder (`azar_legacy` until migration), outcome, step name, safe error class, and timing; they must not contain payloads, identity documents, signed URLs, credentials, webhook URLs, or unnecessary PII.
- Locate exports, dumps, screenshots, copied logs, and test fixtures containing real data and place them under approved retention/access or quarantine.
- Do not delete historical artifacts before ownership, retention, legal hold, backup, and migration value are reviewed.
- MT-SPEC-04 later replaces filesystem/console authority with durable organization-scoped audit and observability.

### 13. Detection and incident response

At minimum, the containment release must detect or make reviewable:

- new account or temporary administrator-grant creation;
- failed and successful administrator authentication;
- attempted `X-User-Id` use outside synthetic development;
- property requests without a valid session;
- Drive permission creation/change and discovery of public folders;
- calls to old/new Make destinations where provider logs permit;
- fixed-trigger invocation attempts or migration drift;
- API-key use with request ID and safe source metadata;
- credential rotation and deployment propagation failures;
- inventory mismatches and newly discovered unowned resources.

The incident runbook must define:

1. severity classification;
2. on-call/incident commander and escalation contacts;
3. immediate containment steps per identity, Drive, Make, Storage, database, and credential event;
4. preservation of logs, provider history, checksums, and timestamps;
5. method to determine affected records/people/organizations;
6. legal/privacy notification decision and owner;
7. credential/session/token invalidation boundaries;
8. customer communication approval;
9. recovery and monitored re-enable criteria;
10. post-incident review and required follow-up SPEC changes.

Suspected exposure must not be hidden by deleting provider history or local evidence.

### 14. Release guard

- Add a documented release guard stating that the deployment remains `azar_legacy_single_organization` until MT-SPEC-10 certification.
- Do not create Solar in the production data plane during this SPEC.
- Do not import, submit, or route real Solar data through Azar's database, Storage, Drive, Sheet, Make, logs, backups, or credentials.
- If a demonstration requires Solar, use a fully synthetic isolated environment with distinct provider resources and no route to production data.
- A reachable feature that has not completed its organization-isolation SPEC must be disabled in both frontend and every backend/worker path before a second real organization is allowed.
- Containment success must never be described as multi-tenant completion.

## Affected contracts and files

The implementation is expected to inspect and, where required by containment, change the following areas. The exact code decomposition may vary, but omitting an equivalent boundary requires an explicit rationale in the closure evidence.

### APIs

- `POST /api/auth/register` — closed in real-data environments until invite/organization onboarding exists.
- `POST /api/auth/google/session` — no automatic global grant.
- `GET /api/auth/session` — legacy session behavior remains temporary; any containment versioning/invalidation must be documented.
- `POST /properties/media/presign` — reviewed session required; actor derived by server.
- `POST /properties/submit` — reviewed session required; actor derived by server.
- Contract entry/admin and legacy SPEC-09 routes — `X-User-Id` rejected outside synthetic development; API key/gateway paths inventoried and frozen as Azar-only.
- Contract status change to `generar_contrato` — no fixed database webhook side effect.

No organization-scoped API namespace is introduced by this SPEC; MT-SPEC-03 owns that contract.

### Database and migrations

- Add forward-only migrations after the current latest applied migration.
- Remove/neutralize automatic `contract_admin_users` signup provisioning.
- Remove/neutralize the fixed Make trigger/function.
- Preserve current business data and contract role-token hashes.
- Do not add organization columns or edit existing migration files in this SPEC.
- Reconcile the actual Supabase migration history before applying any new migration.

### Backend

- `backend/src/services/contractPasswordAuth.ts`
- `backend/src/routes/contractPasswordAuth.ts`
- `backend/src/services/contractAuth.ts`
- `backend/src/routes/contractEntries.ts`
- `backend/src/routes/contracts.ts`
- `backend/src/routes/properties.ts`
- `backend/src/services/mediaUploadSessionService.ts`
- `backend/src/services/googleDriveService.ts`
- `backend/src/services/googleSheetsService.ts`
- `backend/src/services/makeWebhookService.ts`
- `backend/src/services/createPropertySubmission.ts`
- `backend/src/services/submissionLogger.ts`
- `backend/src/services/contractAuditLogger.ts`
- `backend/src/index.ts` and configuration validation utilities
- `backend/.env.example`

### Frontend

- `frontend/src/app/contexts/AgentContext.tsx`
- `frontend/src/components/ui/AgentModal.tsx`
- `frontend/src/pages/ActionSelectionPage.tsx`
- `frontend/src/pages/NewPropertyPage.tsx`
- `frontend/src/features/properties/services/payloadMapper.ts`
- `frontend/src/features/properties/services/propertyApi.ts`
- `frontend/src/features/contracts/services/contractIdentity.ts`
- `frontend/.env.example`

### External services and operations

- Supabase Auth, Postgres, Storage, migration history, project access, and backups.
- Vercel or equivalent deployment/environment/log settings.
- Google OAuth/service-account principals, Drive ACLs, Sheets ACLs, and resources.
- Make hooks, scenarios, connections, history, and owners.
- Reverse proxy or gateway trusted-header configuration.
- Encrypted evidence and backup storage.

### Documentation

- `docs/01-overview/project-overview.md`
- `docs/01-overview/architecture.md`
- `docs/02-setup/environment.md`
- `docs/02-setup/external-services.md`
- `docs/03-operation/usage.md` and the new incident/containment runbook
- `docs/05-integrations/api-contracts.md`
- `docs/06-testing/testing-strategy.md`
- `docs/07-development/engineering-standards.md`
- redacted decision and audit records under `docs/09-roadmap/`

## Expected behavior

### Main case

1. Owners approve POL-01 through POL-12.
2. Operators capture backups and the inventory baseline without exposing raw sensitive material.
3. Existing users/resources are classified as Azar, quarantine, remove, or unresolved.
4. Automatic global-admin grants and real-data open registration are disabled.
5. Legacy application sessions are safely invalidated after grant review.
6. Property routes require reviewed temporary authentication and ignore browser identity.
7. Production/preview `X-User-Id` is rejected.
8. The committed Make endpoint is revoked and its trigger is removed with a forward migration.
9. New Drive folders are private and existing public folders have reviewed remediation.
10. Global providers and compatibility credentials are frozen as Azar-only pending later replacement.
11. Reconciliation, monitoring, incident, backup, and rollback evidence is reviewed.
12. MT-SPEC-02 may begin, but Solar remains blocked.

### Edge cases

- An inventory API is unavailable: record the source as unresolved with an owner and retry date; do not report zero resources.
- A row has no owner: quarantine/classify it; do not grant global visibility.
- A Drive folder cannot be opened by the inventory principal: preserve its ID/source evidence and classify it as inaccessible, not absent.
- A public Drive permission is required by an undocumented process: disable or replace that process; an undocumented dependency is not approval for public PII.
- A Google user is legitimate but lacks a reviewed temporary grant: deny login until the grant review is completed.
- A grant must be removed while a legacy session exists: perform the approved app-session invalidation procedure without breaking external contract role links.
- The current API key has unknown clients: revoke it; lack of client knowledge is not a reason to keep global access.
- The fixed Make hook has no provider history: treat exposure as unknown and follow the approved incident threshold.
- A backup cannot be read or lacks required manifests: it does not satisfy the backup gate.
- Provider ACL removal would destroy data: do not delete content; remove public permission and grant only approved private access.
- A current workflow cannot operate privately: disable that workflow in real-data environments until its owning SPEC is complete.

### Required failures

- Closed registration returns `403 REGISTRATION_CLOSED` and creates no account/grant/session.
- Unreviewed Google login returns the existing non-enumerating unauthorized/not-admin response and creates no grant.
- Unauthenticated property presign/submit returns `401` before any side effect.
- Caller-supplied property actor fields cannot change the server-derived actor.
- `X-User-Id` outside exact synthetic development returns `401` even if a former insecure override is supplied.
- Invalid/untrusted `X-Authenticated-User-Id` deployments fail closed.
- A private Drive prerequisite failure prevents new property folder creation.
- A revoked/disabled Make delivery is represented as unavailable/deferred, not success.
- An inventory mismatch or unresolved source prevents completion of the inventory gate.
- Any attempt to onboard real Solar data before MT-SPEC-10 is a release-blocking failure.

## Implementation sequence

The implementation pull request may be split, but production execution must preserve this order:

### Phase 1 — approval and preparation

1. Approve owners, POL-01 through POL-12, evidence location, incident threshold, and change window.
2. Reconcile Supabase migration history without editing applied files.
3. Capture pre-change database backup and all inventory/provider manifests.
4. Verify backup readability and evidence access.
5. Prepare reviewed Azar administrator list and provider access list.

### Phase 2 — external endpoint and permission containment

1. Revoke/rotate the committed Make hook and disable its scenario.
2. Rotate/revoke other unproven credentials and record fingerprints.
3. Verify the Azar Drive parent has private, usable ACLs.
4. Deploy code that no longer creates public Drive permissions.
5. Begin reviewed remediation of existing public Drive folders.

### Phase 3 — identity and application containment

1. Deploy closed real-data registration and Google no-auto-grant behavior.
2. Deploy property-session enforcement and server-derived actor behavior.
3. Deploy unconditional non-development `X-User-Id` rejection.
4. Apply forward migrations removing automatic signup grant and fixed Make trigger.
5. Review/remove grants and invalidate legacy app sessions without invalidating role links.

### Phase 4 — verification and freeze

1. Repeat inventory deltas and reconcile every expected change.
2. Run automated tests and provider-specific manual checks.
3. Confirm no new public Drive folder, auto-admin grant, old Make delivery, unauthenticated property side effect, or non-development `X-User-Id` acceptance.
4. Review monitoring, incident, backup, and rollback evidence.
5. Mark the system as contained Azar-only and hand approved policy/evidence to MT-SPEC-02.

## Migration, compatibility, and rollback

### Forward-only migration rules

- Never edit the applied SPEC-19 or Make-trigger migrations.
- Add ordered migrations that explicitly drop/neutralize the old trigger and signup-grant behavior.
- Migration SQL must be idempotent where practical and must use explicit schema names and safe `search_path` behavior.
- Verify the migration in a disposable database and against a staging project with reconciled history before production.
- Record pre/post definitions and grants for affected functions/triggers.

### Compatibility

- Existing approved Azar administrators retain contract access after reauthentication.
- Existing external contract role links continue to validate; containment must not rotate their HMAC secret accidentally.
- Existing contract data, immutable submission history, private bucket objects, and current status remain intact.
- Existing property provider payloads may retain legacy agent fields temporarily, but values must be server-derived.
- The current fixed contract-to-Make behavior is intentionally unavailable until MT-SPEC-08.
- Open real-data registration is intentionally unavailable until MT-SPEC-02/03.
- The application remains single-organization/Azar-only after this SPEC.

### Rollback principles

- Do not restore a revoked fixed webhook, public `anyone` permission, insecure production identity, or automatic unreviewed administrator grant.
- Roll back application code only to a version that preserves the security containment.
- If private Drive delivery fails, disable the property workflow or grant explicit reviewed Azar access; do not restore public sharing.
- If Make replacement is not ready, keep delivery disabled and preserve business intent for later reconciliation where possible.
- If a migration causes functional failure, use a new corrective migration; do not rewrite deployed migration history.
- If identity verification is uncertain, deny access and use the reviewed recovery procedure.
- If reconciliation fails, stop the rollout and preserve the latest secure state.

## Required tests

Tests must be derived from this SPEC before implementation, follow existing backend/frontend test patterns, and use mocks or isolated provider fixtures by default.

### Unit tests

- Real-data registration policy fails closed and synthetic-development behavior is explicit.
- Google handoff never calls administrator-grant creation.
- Legacy session invalidation/versioning is independent from contract role-token verification.
- `X-User-Id` is rejected for production, preview, test-with-real-provider, missing, or differently cased `NODE_ENV` values.
- Deprecated insecure override values cannot re-enable `X-User-Id`.
- Property actor derivation ignores/rejects request actor fields.
- Credential/inventory redaction never serializes raw secret-bearing fields.
- Drive folder creation does not issue `type: 'anyone'` permissions.
- Disabled Make delivery returns the defined unavailable/deferred result.

### Backend route/integration tests

- `POST /api/auth/register` returns `403` with no Supabase user/grant/cookie side effect in real-data mode.
- Approved password user login succeeds; removed/unapproved user login fails.
- Approved Google user login succeeds without a grant write; unapproved Google user fails without a grant write.
- Old administrator cookies are rejected after containment invalidation.
- External role links continue to work after app-session invalidation.
- Property presign and submission reject missing/invalid sessions before storage, Drive, Sheets, Make, or log writes.
- Authenticated property submission overwrites spoofed `agent_*` values with the verified actor.
- Production/preview `X-User-Id` requests fail even when old flags are supplied.
- Trusted gateway behavior is tested only behind the expected header-sanitizing adapter.
- Contract admin/API-key compatibility remains Azar-only and no test describes it as tenant-safe.

### Migration tests

- A disposable database can apply all migrations in order plus the new containment migrations.
- The signup trigger/function no longer grants administrator access.
- The fixed Make trigger/function cannot issue an HTTP request.
- Contract tables, data, status, role-token hashes, submissions, events, RLS state, and existing functions not owned by this SPEC remain intact.
- Reapplying idempotent containment portions does not recreate public/global behavior.
- No new migration contains a raw Make webhook URL or secret.

### Frontend tests

- Real-data registration UI is absent or explains invite-only/temporarily closed access and cannot submit around the restriction.
- Direct property navigation without a session reaches the unauthorized/login state.
- Property requests no longer use `form_site_agent` as authorization or attribution.
- Production bundles never send `X-User-Id`.
- Existing approved-user contract and external role-form flows do not regress.
- Disabled integration status is not presented as successful delivery.

### Security and regression tests

- Static scan finds no runtime `drive.permissions.create` request with `type: 'anyone'`.
- Static scan finds no active raw Make hook in new code/migrations/configuration.
- Static/client-bundle scan finds no service-role key, API key, webhook, OAuth secret, or session secret.
- API requests that alter route IDs, actor fields, headers, and provider metadata cannot bypass containment.
- Logs from test requests contain no raw credentials, role tokens, signed URLs, webhook URLs, DNI/evidence payloads, or full property payloads.
- Existing private contract Storage restrictions and token-hash behavior remain covered.
- Existing approved Azar contract create/list/detail/edit/archive/link flows remain functional.

### Provider and operational verification

Automated tests must not call real production APIs. A reviewed staging/manual checklist must prove:

- the old Make endpoint is revoked and the scenario cannot process it;
- the database trigger is absent/disabled in the target project;
- a newly created staging Drive folder has no public permission;
- approved Azar Google principals can perform the required private workflow;
- existing public-folder classifications and remediation totals match the audit;
- environment variables are correctly scoped and deprecated insecure values are absent;
- backup evidence is readable and matches recorded checksums;
- inventory totals reconcile.

## Acceptance criteria

This SPEC is complete only when all criteria below have durable evidence:

1. POL-01 through POL-12 are approved with owners, dates, rationales, and no `TBD` values.
2. The normative terminology and all fifteen security invariants are approved.
3. Every real-data environment and external provider account is included in the inventory or recorded as a blocking unresolved exception.
4. Supabase users and temporary administrator grants are reviewed and classified.
5. Contract rows, child rows, functions, triggers, policies, and grants have counts/manifests/checksums.
6. Storage buckets and objects have counts/manifests/checksums plus referenced/orphan/unknown-owner classification.
7. Property logs, contract audit files, platform logs, local copies, exports, and backups are inventoried without committing their contents.
8. Drive folders/files and ACLs are inventoried; every public or external permission has a disposition and owner.
9. Sheets, Make scenarios/hooks, deployment variables, compatibility identities, and credentials are inventoried by protected identifier/fingerprint.
10. Reconciliation arithmetic balances for every source; unresolved items are visible and assigned.
11. A readable encrypted pre-change backup and rollback evidence exist outside Git.
12. Verified existing production material is classified as Azar, quarantine, reviewed removal, or unresolved; nothing defaults to global.
13. Open password registration is disabled in every real-data environment.
14. Password registration can no longer create a global administrator grant in the containment deployment.
15. Google session handoff can no longer create a global administrator grant.
16. Automatic `contract_admin_users` signup provisioning is neutralized by a new forward migration.
17. Temporary Azar administrator grants are reviewed, frozen, and auditable.
18. Legacy administrator sessions issued before the grant review are invalidated without invalidating external contract role links.
19. Real-data property presign and submit routes require reviewed authentication before side effects.
20. Property attribution is server-derived and cannot be changed by submitted `agent_*` fields or `AgentContext`.
21. `X-User-Id` is impossible outside exact isolated synthetic development, regardless of former opt-in flags.
22. Trusted gateway and global API-key paths have reviewed owners, controls, expiry/removal plans, and explicit Azar-only classification, or they are disabled.
23. The committed Make endpoint is revoked/rotated, its scenario/history is reviewed, and the fixed database trigger/function is disabled by a forward migration.
24. No new property Drive folder receives an `anyone` permission.
25. Existing public Drive resources are classified and remediated or have a documented blocking exception; no content is deleted merely to close the finding.
26. Unproven, exposed, abandoned, or overly broad credentials are rotated/revoked and deployment propagation is verified by fingerprint.
27. General runtime/platform logs no longer receive complete property payloads or secret-bearing values.
28. Detection and incident runbooks cover identity, Drive, Make, credentials, data exposure, evidence preservation, and notification ownership.
29. Required automated tests pass and staging/provider verification is signed off.
30. Canonical environment, API, external-service, operation, testing, and engineering documentation reflects the containment behavior.
31. The deployment is explicitly labeled Azar-only and no real Solar data or second-organization resource has been created.
32. Product, security, migration, and operations owners approve the completion evidence.

## Completion gate and handoff

Passing this SPEC means the current system is a contained, inventoried, recoverable Azar-only baseline. It does not mean the system is multi-tenant.

MT-SPEC-02 may begin only when:

- all policy decisions are available to its schema/RBAC design;
- the administrator/user baseline is reviewed;
- ownership and quarantine rules are approved;
- backups and reconciliation evidence are available;
- fixed/public/spoofable paths are contained; and
- no unresolved critical finding permits uncontrolled customer-data access.

Solar remains blocked until MT-SPEC-01 through MT-SPEC-08 and MT-SPEC-10 pass, plus any MT-SPEC-09 module enabled for Solar.

## Required deliverables

Implementation closure must provide:

- this approved SPEC;
- a redacted policy decision record under `docs/09-roadmap/decisions/`;
- a redacted containment/inventory audit under `docs/09-roadmap/audits/`;
- protected machine-readable manifests and detailed ownership mappings outside Git;
- backup and checksum evidence outside Git;
- forward Supabase containment migration(s);
- automated tests derived from this SPEC;
- provider/staging verification checklist and approvals;
- incident/containment runbook under `docs/03-operation/`;
- updates to canonical architecture, environment, API, external-service, testing, and engineering documentation;
- a traceability table mapping every acceptance criterion to code, test, evidence, documentation, and reviewer.

## Verification

The implementation must run the repository's relevant checks:

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

Focused security scans must also verify at least:

```bash
rg -n "type:[[:space:]]*'anyone'|type:[[:space:]]*\"anyone\"" backend/src supabase/migrations
rg -n "CONTRACT_ALLOW_INSECURE_AGENT_ID|VITE_CONTRACT_ALLOW_INSECURE_AGENT_ID|X-User-Id" backend/src frontend/src backend/.env.example frontend/.env.example docs
rg -n "hook\\.[A-Za-z0-9.-]*make\\.com|to_jsonb\\(NEW\\)" supabase/migrations backend/src
rg -n "ensureContractAdminUser|contract_admin_on_signup|grant_contract_admin_on_signup" backend/src supabase/migrations
```

Matches in historical migrations, tests, and documentation are not automatically failures; each must be classified as historical evidence, synthetic test coverage, deprecated compatibility, or reachable runtime behavior. Reachable prohibited behavior fails the gate.

The LLM guide asks for `npm run docs:check`, but this repository currently has no root `package.json` or `docs:check` script. Until one is added, documentation verification consists of Markdown review, link/path validation, required-section checks, `git diff --check`, and the repository's backend/frontend validation commands.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Inventory copies increase sensitive-data exposure | Keep only redacted summaries in Git; encrypt and restrict detailed evidence |
| Disabling registration blocks legitimate onboarding | Use reviewed temporary Azar grants only; implement invitations in MT-SPEC-02 |
| Session invalidation breaks external contract links | Separate application-session invalidation from `CONTRACT_TOKEN_SECRET` |
| Private Drive folders become inaccessible to staff | Verify inherited/explicit private Azar ACLs before release; never fall back to public |
| Revoked Make trigger removes an active business automation | Show delivery as unavailable, preserve intent where possible, and implement the outbox in MT-SPEC-08 |
| Credential rotation causes deployment drift | Record fingerprints, update all scopes atomically, and run post-deploy provider checks |
| Unreachable provider resources are omitted | Classify as unresolved/inaccessible and block completion where material |
| Old migrations retain compromised literals | Revoke externally, add forward migrations, classify historical source; do not rely on source removal |
| Existing local logs contain PII | Restrict and inventory before retention/removal decisions; never paste content into audit docs |
| Teams mistake containment for tenancy | Keep explicit Azar-only release guard and Solar blocker in UI, docs, and release checklist |

## References

### Multi-tenant source documents

- `docs/09-roadmap/specs/research/23-RESEARCH-multi-tenant-saas-architecture.md`
- `docs/09-roadmap/specs/research/24-RESEARCH-multi-tenant-saas-specification-roadmap.md`

### Previous project SPECs used for behavior and format

- `docs/09-roadmap/specs/completed/09-SPEC-contract-generation.md`
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

Status: pending product, security, migration, and operations approval. Author: redacted.
