# SPEC-33 / MT-SPEC-09 Multi-tenant SaaS — commercial and enterprise extensions

**Date:** 2026-08-18
**Priority:** high, optional modules after core isolation
**Status:** pending prerequisite specifications and module-specific approval
**Roadmap identifier:** MT-SPEC-09
**Dependencies:** Core organization and operational contracts from MT-SPEC-02 through MT-SPEC-08
**Blocks:** only the MT-SPEC-09 modules explicitly selected for Solar or another production organization

---

## Specification identity

**Name:** Plans and billing, advanced branding/custom domains, enterprise SSO, physical isolation tiers, and tenant-safe analytics.

**Description:** Define the optional commercial and enterprise capabilities anticipated by the architecture without coupling them to the core Azar/Solar isolation release.

**Why it is necessary:** These capabilities are not required to prove a two-organization boundary, but they are part of the complete SaaS scope. Designing them as explicit modules prevents later billing, domains, identity providers, deployments, or reporting from bypassing the organization model.

## Summary

This specification defines five independently deliverable modules:

1. plans, entitlements, subscriptions, billing, invoices, taxes, trials, grace periods, and metered usage;
2. advanced branding and verified custom domains;
3. enterprise SAML/OIDC single sign-on;
4. dedicated database/project/deployment isolation tiers; and
5. organization-safe dashboards, exports, analytics, and platform aggregation.

Every module remains disabled by default. Enabling one requires its own approved decisions, organization-owned schema, server authorization, audit, privacy/retention, migration, operational runbook, backup/recovery behavior, and Azar/Solar negative tests.

Commercial state may restrict functionality but can never grant organization membership, role capabilities, support authority, or cross-organization visibility. A custom host is a routing hint, an SSO assertion is an identity signal, a payment webhook is a commercial signal, and a warehouse row is a derived projection. None replaces the canonical organization/membership boundary.

This document defines implementation contracts. It does not select vendors, set prices or taxes, process payments, configure domains/IdPs, provision dedicated environments, build dashboards, create production resources, or enable a module for Azar/Solar.

## Authority and relationship to other specifications

This is the ninth formal implementation SPEC derived from:

- `docs/09-roadmap/specs/research/23-RESEARCH-multi-tenant-saas-architecture.md`;
- `docs/09-roadmap/specs/research/24-RESEARCH-multi-tenant-saas-specification-roadmap.md`;
- `docs/09-roadmap/specs/pending/25-SPEC-multi-tenant-policy-threat-model-containment-and-inventory.md`;
- `docs/09-roadmap/specs/pending/26-SPEC-multi-tenant-organizations-memberships-onboarding-and-lifecycle.md`;
- `docs/09-roadmap/specs/pending/28-SPEC-multi-tenant-database-enforcement-audit-abuse-observability-and-recovery.md`;
- `docs/09-roadmap/specs/pending/30-SPEC-multi-tenant-properties-submissions-modifications-and-management.md`;
- `docs/09-roadmap/specs/pending/31-SPEC-multi-tenant-private-assets-uploads-retention-and-storage-migration.md`; and
- `docs/09-roadmap/specs/pending/32-SPEC-multi-tenant-integrations-secrets-outbox-google-and-make.md`.

MT-SPEC-03 and MT-SPEC-05 are not currently present as project documents. No authenticated commercial/enterprise module can complete without MT-SPEC-03; analytics/entitlements must also remain compatible with all domain contracts, including MT-SPEC-05.

SPEC-26 establishes `plan_key` as server-owned descriptive metadata that cannot authorize. SPEC-28 establishes idempotent usage, quotas, audit, observability, recovery, and organization-scoped data rules. SPEC-32 establishes secrets, webhooks, outbox, workers, and provider reconciliation. This SPEC consumes those contracts and does not duplicate/weaken them.

## Context

The repository currently contains no payment provider, subscription ledger, custom-domain router/certificate system, SAML/OIDC organization provider, dedicated-environment orchestrator, or tenant analytics warehouse. `plan_key` and usage/quota concepts exist only in the multi-tenant specifications.

This is intentional: core isolation must not depend on payment, domains, SSO, or analytics. However, adding these later without explicit boundaries could introduce powerful bypasses:

- paid plans could accidentally grant authorization;
- billing customer IDs could be attached to a person instead of an organization;
- custom hosts/cookies/callbacks could select the wrong organization;
- email domains or SSO role claims could create membership automatically;
- dedicated deployments could drift through manual forks;
- analytics pipelines could mix organizations or expose detailed customer data; and
- webhook retries could double-charge or duplicate subscription state.

## Motivation

Optional enterprise features affect identity, money, routing, infrastructure, and data aggregation. Each is a separate security boundary. Defining them before implementation preserves the same organization invariants across shared and dedicated tiers while allowing the core Azar/Solar release to proceed with every optional module off.

## Objective

Define modular commercial and enterprise extensions whose state is always attached to an organization; whose effects are server-authorized, auditable, idempotent, recoverable, and tenant-isolated; and whose absence, failure, disablement, or payment status can never weaken authentication, membership, RLS, data ownership, private assets, provider routing, or support boundaries.

## Terminology

- **Module:** Independently enabled MT-SPEC-09 capability with its own completion evidence.
- **Plan:** Versioned product offering composed of entitlements/limits, not permissions.
- **Entitlement:** Server-evaluated commercial availability/limit that can restrict an authorized operation but cannot grant capability.
- **Subscription:** Organization-commercial relationship and provider state.
- **Trial/grace:** Time-bounded commercial state with explicitly approved behavior.
- **Billing provider:** External payment/invoice system; its webhook is untrusted until verified.
- **Custom domain:** Verified customer-controlled hostname mapped to one organization.
- **SSO provider:** Organization-configured SAML or OIDC identity provider.
- **JIT provisioning:** Creation/linking of an application relationship during SSO login; disabled unless explicitly approved.
- **Break-glass owner:** Reviewed recovery path independent of a failing organization IdP.
- **Isolation tier:** Shared or dedicated infrastructure placement without changing organization identity.
- **Dedicated environment:** Automatically managed database/project/deployment/storage/integration/operations boundary for one organization.
- **Analytics projection:** Derived organization-scoped data used for dashboards/reports; not canonical business state.
- **Platform aggregation:** Restricted cross-organization statistics for the operator, never exposed as customer-to-customer data.

New visible/persisted contracts use `snake_case`; environment variables use `UPPER_SNAKE_CASE`. Internal TypeScript follows repository conventions.

## Scope

### Includes

- Versioned plan/entitlement catalog and organization subscriptions.
- Trials, grace, past-due/cancelled/suspended commercial states.
- Billing customer/subscription/invoice/tax identifiers and provider webhook processing.
- Hosted owner-only billing portal.
- Idempotent metered-usage export from SPEC-28.
- Advanced safe branding and verified custom domains.
- DNS challenge, certificates, host routing, callbacks, cookies, CORS, phishing/takeover protections, and fallback.
- SAML/OIDC configuration, domains, identity linking, provisioning mode, role mapping, enforcement, recovery, and rotation.
- Shared/dedicated isolation criteria, automated provisioning, migration, monitoring, backup, support, and transfer.
- Organization dashboards, materialized views, analytics exports, time zones, limits, privacy/redaction, warehouse pipeline, and platform aggregation.
- Independent module flags/gates and launch selection.

### Excludes

- Core multi-tenant isolation owned by MT-SPEC-01 through MT-SPEC-08.
- Vendor selection, commercial prices, discounts, currencies, tax advice, invoice templates, or jurisdictional decisions without product/finance/legal approval.
- Storing card/bank data in this application; use provider-hosted PCI-scoped interfaces.
- Custom roles, domain-based membership, or SSO claims that bypass SPEC-26.
- Manual customer-specific repository forks.
- An unrestricted query builder/warehouse data browser.
- Enabling any unfinished module merely because another MT-SPEC-09 module is ready.

## Dependency and module gate

The core SaaS release may ship with all MT-SPEC-09 modules disabled. Each module has a separate status:

- `not_configured`;
- `design_approved`;
- `implemented`;
- `certified`;
- `enabled`; or
- `retired`.

Only `certified` may transition to `enabled`, and only for explicitly selected organizations/cohorts. A module must be disabled in backend routes/jobs and UI when incomplete—not merely hidden.

Common prerequisites:

- MT-SPEC-02 through MT-SPEC-08 completion for the affected boundary;
- product/security/data/backend/frontend/operations/privacy/legal approval;
- vendor/jurisdiction decisions where applicable;
- migration, backup/restore, support, incident, and disable/rollback plans;
- real-database and Azar/Solar negative tests; and
- MT-SPEC-10 inclusion for any module enabled during Solar rollout.

## Non-negotiable extension invariants

1. Every commercial/enterprise customer record belongs to one non-null `organization_id`.
2. Core isolation never depends on an MT-SPEC-09 module being enabled or healthy.
3. Module state may restrict but never grant membership, role, capability, support, or record visibility.
4. Unknown/disabled/unavailable entitlement denies the optional feature without broadening any core access.
5. Billing customer/subscription identifiers belong to the organization, not an individual user.
6. Billing provider events are authenticated, idempotent, ordered/reconciled, and never trusted from browser state.
7. Payment failure cannot weaken authorization or expose another organization.
8. Card/bank secrets never pass through or persist in application systems unless separately certified; hosted provider flow is default.
9. Invoice/tax behavior cannot launch without approved jurisdictions/legal/accounting ownership.
10. Usage retries/reconciliation never double bill.
11. A hostname is only a routing hint; normal session/membership/capability/resource authorization still applies.
12. One hostname maps to at most one active organization and is verified before activation.
13. DNS/certificate failure cannot route a host to another organization.
14. Cookies/CORS/callbacks are exact-host/origin scoped and do not create cross-domain session confusion.
15. Default platform-domain access/recovery remains available according to approved policy.
16. SSO authentication alone never creates organization authority.
17. Email/domain matching alone never creates membership.
18. Every SSO identity resolves an explicit active membership before dashboard access.
19. JIT provisioning is disabled unless separately approved and still creates policy-governed membership.
20. SSO role claims cannot grant owner/platform/support authority automatically.
21. IdP enforcement cannot remove all approved break-glass recovery.
22. Dedicated placement preserves the same organization UUID, audit identity, semantics, and visible contracts.
23. Dedicated deployments are generated from the same versioned code/migrations, never manual forks.
24. Shared-to-dedicated transfer is checksummed, reversible by phase, audited, and prevents dual-write ambiguity.
25. Dedicated status does not grant platform/support access or weaken customer controls.
26. Every analytics fact/aggregate/export retains organization identity through all pipeline stages.
27. Customer analytics queries begin with organization scope and cannot aggregate another organization's detail.
28. Platform aggregation is separately authorized and never exposed to customer roles.
29. Analytics/metric labels and exports minimize/redact PII and respect retention/deletion/legal hold.
30. Materialized/cached analytics cannot survive organization switch/logout under another context.
31. Module provider secrets/webhooks/jobs follow SPEC-28/32 controls.
32. Cross-organization identifiers return generic failure and create no commercial/domain/identity/analytics side effect.
33. Every enabled module has tested disablement, migration, backup/restore, incident, and data-deletion behavior.
34. Solar cannot use a module unless that exact module is certified for Solar; unfinished modules remain disabled in UI and backend.

## Module A — plans, entitlements, subscriptions, and billing

### Data model

#### `plans` and `plan_versions`

- Stable plan key/name and lifecycle (`draft`, `active`, `retired`).
- Immutable published versions with effective time, currency/price references, included limits/features, and policy version.
- Public display projection separated from internal/provider configuration.
- Historical subscriptions retain their fixed plan version until explicit transition.

#### `entitlement_definitions` and `plan_entitlements`

- Closed entitlement key registry with type (`boolean`, `integer_limit`, `quantity`, `enum`) and enforcement owner.
- Plan-version value, safe minimum/maximum/default validation.
- No entitlement key maps directly to authorization capability.
- Overrides, if offered, are organization-owned, time-bounded, reasoned, approved, and audited—not arbitrary browser flags.

#### `organization_subscriptions`

- `organization_id`, fixed plan/version, provider/customer/subscription references.
- State in `trialing`, `active`, `grace`, `past_due`, `suspended`, `cancelled`, `expired`.
- trial/grace/current-period/cancel timestamps, version, safe provider sync state.
- one effective subscription per organization/product scope unless explicitly modeled.

#### Billing support tables

- idempotent `billing_webhook_events` with provider event ID/hash, signature verification state, occurrence/receipt/processing state;
- `billing_invoices` safe projection/provider reference/status/amount/currency/tax summary, no payment credentials;
- `billing_usage_exports` linking immutable SPEC-28 usage events/aggregates to provider meter batches and reconciliation receipts;
- `billing_portal_sessions` transient issuance audit only; raw hosted URL/token is not persisted/logged; and
- append-only subscription/billing events plus generalized audit.

### Entitlement resolution

Effective optional feature availability is the intersection of:

1. authenticated active organization membership and named capability;
2. active organization lifecycle state;
3. module certified/enabled state;
4. subscription/plan entitlement and quota; and
5. resource/domain policy.

Entitlement is checked after authorization. It can return `FEATURE_NOT_ENABLED`/quota errors, never turn a viewer into a writer or member into an admin.

### Trials, grace, failed payment, and cancellation

- Numeric durations/allowed operations require explicit product/finance/legal approval; this draft chooses none.
- Payment/provider failure never changes ownership or creates access.
- Commercial restriction uses an explicit subscription/module state, not ad hoc role/session edits.
- POL-11/SPEC-26 define whether owners retain read/export/reactivation/billing access during suspension.
- Essential security, data export/deletion/privacy, and account recovery behavior is explicitly reviewed before restriction.
- Cancellation/end-of-term retains/deletes billing/domain data according to approved legal/accounting policy.
- Reactivation requires confirmed provider/reconciliation state and does not restore removed memberships or revoked sessions.

### Webhooks and idempotency

- Process through SPEC-32 secure webhook/outbox contracts.
- Verify signature, timestamp/replay tolerance, provider account/environment, and event ID before mutation.
- Persist receipt idempotently before processing.
- Handle out-of-order/duplicate events by fetching/reconciling authoritative provider state where supported.
- Never accept organization/customer/subscription mapping from an unverified payload alone.
- A webhook cannot directly grant role/capability.

### Metered usage

- Source only from immutable/idempotent SPEC-28 usage events and approved corrections.
- Aggregate by organization, metric, provider billing period, and schema version.
- Stable batch/idempotency key prevents duplicate provider reporting.
- Retry/reconciliation records provider receipt and does not create new usage.
- Billing totals reconcile against internal immutable source before invoice finalization/dispute support.

### Billing portal and invoices

- Owner-only `billing.manage` portal issuance; `billing.read` for approved invoice/subscription views.
- Hosted provider portal is preferred; exact return URL is allowlisted.
- Portal session URLs/tokens are memory-only, short-lived, `no-store`, and never logged.
- Invoice download uses provider-authorized or application-proxied short-lived delivery.
- Tax identity/address/invoice retention/access require jurisdiction-specific privacy/legal approval.

## Module B — advanced branding and custom domains

### Advanced branding

- Extend SPEC-26/31 safe name/logo/theme with allowlisted typography/layout/email/document variables.
- No arbitrary HTML, CSS, JavaScript, tracking pixels, executable SVG, external asset URL, or unsafe font import.
- Branding versions are reviewable, previewable, optimistic-concurrency protected, and auditable.
- Public projection contains only approved values/assets and falls back safely.

### `organization_domains`

- organization, normalized ASCII hostname, display Unicode form where safe, domain type/purpose;
- state in `pending_verification`, `verified`, `provisioning`, `active`, `degraded`, `revoked`, `expired`;
- DNS challenge type/token hash/reference/expiry;
- certificate provider/reference/state/expiry/renewal evidence;
- callback/origin/cookie policy version, actor/timestamps/version.

Hostname is globally unique while pending/active and remains reserved through revocation grace/tombstone policy to prevent takeover.

### Ownership verification and activation

- Owner with approved domain capability initiates; platform system generates high-entropy DNS challenge.
- Verify authoritative DNS response and anti-rebinding/public-suffix/hostname policy.
- Recheck ownership before certificate issuance/activation and periodically afterward.
- Certificate provisioning/renewal is automated and monitored.
- Activation is atomic only after DNS, certificate, routing, origin/callback, and organization-state checks pass.
- Removal/reassignment requires confirmation, grace/tombstone, cache/routing invalidation, certificate revocation where applicable, and audit.

### Routing, cookies, CORS, and callbacks

- Host lookup resolves organization ID, then ordinary MT-SPEC-03 membership/capability or external-link authorization runs.
- Unknown/invalid host fails safely; it never falls back to another customer's branding/data.
- Auth cookies are host-only or use a reviewed cross-host handoff; never broad customer-controlled parent domains.
- CSRF/Origin/CORS exact allowlists are generated from active verified domains and invalidated on change.
- OAuth/SAML callbacks use exact registered URLs/state/nonce and safe default-domain broker where needed.
- Custom host never selects a record without organization/resource authorization.
- Default `/t/:organization_slug` platform-domain route remains a safe fallback/recovery according to policy.
- Prevent lookalike/phishing abuse through reserved-name policy, verification, branding attribution, abuse reporting, and rapid disablement.

## Module C — enterprise SAML/OIDC SSO

### `organization_identity_providers`

- organization, protocol (`saml`, `oidc`), state, issuer/entity ID, metadata/discovery endpoints, client/certificate references, allowed callback IDs;
- verified domains as hints/policy inputs, never membership proof;
- provisioning mode (`invitation_only` initially; optional approved `jit`);
- enforcement mode, claim mapping version, health state, secret/certificate versions, timestamps/version.

Secrets/private keys follow SPEC-32. IdP metadata/certificates are validated, pinned/versioned, rotated, and never accepted through unsafe URLs without SSRF controls.

### Authentication and identity linking

- Begin from explicit organization route/domain and server-created state/nonce/PKCE/request record.
- Validate issuer, audience, signature/algorithm, state, nonce, time, response destination, and replay.
- Normalize stable external subject and link to one Auth user through an organization-scoped identity link.
- Email alone cannot silently merge accounts; verified linking/recovery policy is required.
- Successful identity still requires an active membership in the exact organization.
- One Auth user may have separate memberships/SSO links for Azar and Solar without context leakage.

### Provisioning and roles

Baseline is invitation-only: SSO user must already have/accept approved membership. JIT remains disabled until separately approved.

If JIT is enabled:

- closed policy maps an allowed IdP group/claim to non-owner membership role;
- target organization/provider is exact;
- owner/platform roles cannot be asserted;
- deprovisioning/SCIM or login-time policy is explicit;
- every creation/change is audited and last-owner protections remain; and
- email-domain match alone never provisions.

### Enforcement, recovery, and rotation

- SSO enforcement may apply to selected organization members except approved break-glass owner/platform recovery.
- Enabling enforcement requires tested IdP, at least one working recovery path, explicit owner confirmation, and audit.
- IdP outage cannot grant password fallback to unauthorized users.
- Break-glass use requires step-up, reason, time limit, notification, and immutable audit.
- Metadata/cert/client-secret rotation supports overlap/versioning and rollback without accepting weak algorithms.
- Disablement removes SSO login path but does not delete Auth user/history or silently activate another membership.

## Module D — dedicated isolation tiers

### Eligibility and states

Criteria require documented regulatory/contractual/risk/scale justification and operations/security approval. Cost or plan alone does not change authorization.

`organization_isolation_assignments` records organization, tier (`shared`, approved dedicated tiers), state (`requested`, `provisioning`, `validating`, `active`, `degraded`, `migrating`, `retiring`, `failed`), environment/resource manifest, version, owners, timestamps, and audit references.

### Automated provisioning

Automation provisions from the same versioned application release:

- database/project/schema migrations and constrained roles/RLS;
- Auth/session routing/invalidation;
- private Storage and asset policy;
- organization integrations/secrets/resources;
- networking/DNS/TLS/callbacks;
- logs/metrics/alerts/audit;
- backups/PITR/restore tests;
- support/break-glass controls; and
- capacity/cost/health inventory.

No manual repository fork, copied long-lived secret, undocumented environment variable, or one-off schema drift is allowed.

### Routing and semantics

- A platform control-plane mapping resolves organization to deployment after authentication/routing hint.
- Dedicated host does not authorize membership/resource access.
- Public API, error, audit, revision, asset, integration, export, deletion, and support semantics remain compatible.
- Migrations are fleet-managed, observable, staged, and rollback-aware.

### Shared-to-dedicated transfer

- Inventory/freeze or approved change-capture plan.
- Export one organization plus allowed global dependencies with manifest/checksums/schema versions.
- Provision/restore/validate in isolated environment.
- Validate counts, constraints, audit/history, assets, integrations, secrets, sessions/revocations, holds/tombstones, outbox reconciliation, and performance.
- Atomic routing cutover with old-side write denial and session/context refresh.
- Bounded rollback window with one authoritative writer; never uncontrolled dual write.
- Delete/retain source copy under approved retention/legal hold with receipts.

Dedicated-to-shared or dedicated-to-dedicated transfer follows the same evidence and never weakens policy.

## Module E — tenant-safe analytics and reporting

### Data model and pipeline

- Every fact/dimension/materialized row containing customer data has non-null organization ID.
- Stable event/source ID and schema version make ingestion idempotent.
- Pipeline stages preserve organization, source record/revision, event time, ingestion time, and data classification.
- Cross-organization references/joins are prohibited in customer projections and tested.
- Late/replayed/corrected events update projections idempotently without rewriting canonical domain history.

### Organization dashboards

- Server derives organization from trusted context.
- Require named capability such as `analytics.read`; new capability additions require SPEC-26 registry update.
- Query only allowlisted metrics/dimensions and organization-leading materialized views.
- Time-zone presentation uses organization setting while UTC remains canonical.
- Bounded date range, grouping, filters, rows, runtime, concurrency, pagination, and export size.
- Small-cohort/sensitive metrics use suppression/aggregation/redaction policy.
- Dashboard cache keys include organization, capability/policy, filters, time zone, schema version.

### Exports

- Asynchronous organization-scoped job with idempotency, quota, audit, private SPEC-31 asset, short-lived authorized download, expiry/cleanup.
- Manifest records organization, query/report version, filters/time range, row count, checksum, exclusions, creator, expiration.
- CSV/spreadsheet exports prevent formula injection.
- Export authorization is rechecked at download.

### Platform aggregation

- Separate platform analytics authority and store/projection; no customer role can invoke it.
- Prefer aggregate/minimized metrics; detailed customer content requires separate approved purpose/access.
- Never expose organization ranking/detail to another organization unless explicitly consented/product-approved and privacy-safe.
- Access/reports are audited, bounded, and subject to POL-10 support separation.

### Warehouse/privacy lifecycle

- Data minimization/pseudonymization before export where feasible.
- No raw tokens, secrets, signed URLs, private paths, identity-document content, or unrestricted payload blobs.
- Retention/deletion/legal hold propagate from source classification.
- Organization deletion creates warehouse deletion/anonymization receipt and restore tombstone.
- Backups/restore preserve isolation and do not resurrect deleted analytics.

## Common API contracts

Representative module routes:

```text
GET    /api/organizations/:organization_id/entitlements
GET    /api/organizations/:organization_id/billing/subscription
POST   /api/organizations/:organization_id/billing/portal-sessions
GET    /api/organizations/:organization_id/billing/invoices

GET    /api/organizations/:organization_id/domains
POST   /api/organizations/:organization_id/domains
POST   /api/organizations/:organization_id/domains/:domain_id/verify
DELETE /api/organizations/:organization_id/domains/:domain_id

GET    /api/organizations/:organization_id/identity-providers
POST   /api/organizations/:organization_id/identity-providers
POST   /api/organizations/:organization_id/identity-providers/:provider_id/test
POST   /api/organizations/:organization_id/identity-providers/:provider_id/enforce

GET    /api/organizations/:organization_id/analytics/reports/:report_key
POST   /api/organizations/:organization_id/analytics/exports
```

Dedicated-isolation control-plane APIs are platform-only and separate from customer routes.

Rules:

- Every route fails `404` generically for cross-organization IDs.
- Disabled/uncertified module returns stable `404` or `409 MODULE_NOT_AVAILABLE` according to disclosure policy; it is not partially functional.
- New JSON remains snake_case, bounded, typed, and `no-store` where sensitive.
- Optimistic versions/idempotency are required for mutations/jobs.
- Provider errors/secrets/internal deployment IDs are never exposed.

## Frontend requirements

- Each module is route- and capability-gated after server context; frontend flags are not authorization.
- Disabled modules are absent and direct navigation fails safely.
- Billing is owner-only for management and shows safe subscription/invoice state.
- Domain setup provides exact DNS instructions, verification/certificate states, default-domain fallback, and takeover warnings.
- SSO setup is owner-only, write-only for secrets, includes test-before-enforce and break-glass confirmation.
- Analytics uses accessible tables/charts, textual equivalents, bounded filters, timezone disclosure, empty/loading/error/export states.
- Dedicated tier shows safe request/provisioning/support status without infrastructure secrets.
- All query/mutation/export keys include immutable organization ID; switch/logout cancels/removes/partitions state.
- Portal/session/download/verification secrets never enter persistent browser storage, analytics, URLs beyond required provider flows, or crash logs.

## Audit, privacy, observability, and recovery

All modules consume SPEC-28/32:

- atomic domain/audit/outbox/usage where applicable;
- distributed rate limits and idempotency;
- secrets, webhook verification, workers, reconciliation, and dead letters;
- structured redacted logs, bounded metrics, alerts, and incident runbooks;
- retention/legal hold/deletion/export/backup/restore; and
- support separation/step-up/reason/time limit.

Module alerts include payment webhook/signature/reconciliation failure, entitlement drift, certificate expiry/domain takeover, SSO signature/metadata/outage/break-glass use, dedicated fleet drift/backup/health, analytics isolation/export/deletion failures, and cross-organization access success.

## Expected behavior

### Commercial case

1. Azar owner uses provider-hosted checkout/portal.
2. Verified idempotent webhook maps provider customer/subscription to Azar.
3. Server resolves approved plan entitlements after normal authorization.
4. Usage is reported once from immutable events.
5. Past-due behavior restricts only approved optional actions and never broadens access.

### Custom domain case

1. Azar owner requests a hostname and receives DNS challenge.
2. Ownership/certificate/routing/origin checks pass.
3. Host maps to Azar, then ordinary membership/resource checks run.
4. A Solar session/resource UUID cannot be accessed through Azar host.
5. Domain degradation falls back safely without mapping to Solar.

### SSO case

1. User starts through explicit Azar provider.
2. Assertion validates and links stable subject.
3. Active Azar membership resolves role/capabilities.
4. Same user's Solar access requires separate membership/context/provider relationship.
5. Email domain/IdP role claim alone grants nothing.

### Dedicated case

1. Approved organization moves through automated provision/validate/cutover.
2. Organization UUID and contracts remain stable.
3. Only one environment accepts writes after cutover.
4. Isolation, backup, provider, asset, audit, and support tests pass.

### Analytics case

1. Azar member with analytics capability requests approved report.
2. Server queries Azar-scoped projection with bounds/timezone.
3. Export becomes private expiring asset.
4. Solar cannot infer/query/download Azar facts or cached results.

### Required failures

- Entitlement/plan/payment state granting permission.
- Billing IDs attached only to a person.
- Unverified/duplicate billing webhook mutation.
- Card/secret persistence in application.
- Unverified host activation or host-only authorization.
- Cross-domain cookie/CORS/callback confusion.
- SSO/email domain/JIT bypassing membership.
- IdP claim granting owner/platform/support.
- SSO enforcement without recovery.
- Manual dedicated code/schema fork or dual authoritative writer.
- Analytics row/cache/export without organization scope.
- Customer access to platform aggregation.
- Enabling an uncertified module for Solar.

## Affected contracts and files

### Database/backend

- Add only module-specific forward migrations when that module is approved.
- Add module repositories/services/routes/provider adapters/workers under existing modular-monolith boundaries.
- Update capability registry only through explicit SPEC/migration.
- Reuse shared organization scope, audit, usage, asset, integration, outbox, and secret services.

Expected new domains may include `billing`, `domains`, `sso`, `isolation`, and `analytics`; they must not be mixed into contract/property services.

### Frontend

- Independent organization-scoped settings/features for billing, domains, SSO, isolation status, and analytics.
- Route/module registry with server-confirmed availability/capabilities.
- No provider/secret/deployment details in client configuration.

### Documentation/operations

- Per-enabled-module architecture, API, environment, provider, security, privacy/retention, testing, deployment, backup/restore, incident, support, and migration documentation.
- Product pricing/tax/legal/SSO/domain/SLA decisions recorded outside code and linked in completion evidence.

## Implementation sequence

### Phase 1 — select launch modules

- Product explicitly selects which modules, if any, are required for Azar/Solar launch.
- All unselected modules remain disabled and do not block core isolation.

### Phase 2 — module design approval

- Complete vendor/jurisdiction/policy/data model/API/security/privacy/operations decisions for one module.
- Add acceptance traceability and threat model before implementation.

### Phase 3 — additive implementation

- Write tests, forward migrations, services/routes/UI/provider integrations, docs, observability, backup/restore, disable/rollback path.
- Reuse core controls rather than parallel auth/audit/secret/job systems.

### Phase 4 — certification

- Real-database and Azar/Solar adversarial tests.
- Provider sandbox/staging, recovery, incident, accessibility, performance, privacy/legal, and operations review.
- Mark module `certified` only with complete evidence.

### Phase 5 — controlled enablement

- Feature cohort/organization enablement with monitoring and rollback thresholds.
- MT-SPEC-10 includes the exact module if enabled for Solar.

## Migration, compatibility, and rollback

- All schema changes are additive/forward-only.
- Existing `plan_key` maps to a reviewed plan/version only when billing module is enabled; it remains non-authoritative before that.
- Existing users/domains/emails do not become SSO memberships by inference.
- Existing hostnames/default routes remain until verified custom-domain cutover.
- Dedicated transfer uses manifests/checksums and one-writer cutover; rollback never permits global visibility/dual uncontrolled writes.
- Analytics backfill derives organization only from verified canonical ownership; ambiguity quarantines/excludes.
- Module disablement stops routes/jobs/UI safely while preserving required records/audit/export/deletion obligations.
- Payment/provider outage rollback never bypasses membership or returns to client-trusted commercial state.

## Required tests

### Common module tests

- Non-null/composite organization scope, RLS/service-role, generic cross-org `404`.
- Capability plus entitlement ordering and fail-closed unknown states.
- Audit/usage/idempotency/rate/outbox/secret/redaction.
- Organization switch/logout cache cleanup.
- Disable/rollback, backup/restore, deletion/hold, incident/alerts.
- No real provider/customer data in automated tests.

### Billing tests

- Plan/version/entitlement validation and historical stability.
- Subscription state/concurrency and owner-only management.
- Webhook signature/replay/duplicate/out-of-order/reconciliation.
- Meter aggregation/batch idempotency/no retry double count.
- Portal URL secrecy and invoice access.
- Failed-payment behavior never grants/broadens authorization.

### Domain tests

- DNS ownership/reverification/expiry/revocation/takeover.
- Host uniqueness/routing and cross-org UUID attacks.
- Certificate issuance/renewal/failure/default fallback.
- Exact cookies/Origin/CORS/callback behavior across platform/Azar/Solar hosts.
- Branding sanitization and asset isolation.

### SSO tests

- SAML/OIDC issuer/audience/signature/algorithm/state/nonce/time/destination/replay.
- Stable subject linking, email collision/recovery, multi-membership context.
- Invitation-only and approved JIT mapping with owner/platform denial.
- IdP enforcement/outage/break-glass/rotation/deprovisioning.
- SSRF/secret protections for metadata/discovery.

### Dedicated-tier tests

- Reproducible provisioning/migrations/config/secrets/Storage/integrations/monitoring/backups.
- Shared-to-dedicated export/checksum/restore/cutover/sessions/outbox/provider reconciliation.
- One-writer and rollback behavior.
- Fleet drift, upgrade, disaster recovery, support boundary, deletion.

### Analytics tests

- Organization preservation through ingestion/materialization/cache/export/warehouse.
- Cross-org joins/filters/direct IDs/report/export denial.
- Idempotent replay/correction/late events.
- Time zones/bounds/query limits/formula-safe export/access recheck.
- PII minimization, retention/deletion/hold/restore and platform aggregation separation.

## Acceptance criteria

This SPEC is complete as a framework when:

1. Core MT-SPEC-02 through MT-SPEC-08 contracts required by enabled modules are approved.
2. All thirty-four extension invariants are approved and traceable.
3. Module registry/state prevents any uncertified backend/UI/job enablement.
4. Each enabled module has independent data model, authorization, audit, migration, operations, recovery, and negative tests.
5. Commercial/entitlement state restricts but never grants authorization.
6. Billing customer/subscription/invoice references are organization-owned.
7. Plan versions/entitlements are immutable/versioned and `plan_key` remains server-owned.
8. Billing webhook processing is verified, replay-safe, idempotent, ordered/reconciled, and audited.
9. Metered usage is sourced/reported idempotently without double-counting retries.
10. Hosted owner-only billing portal/invoice access exposes no payment secret.
11. Trial/grace/past-due/cancel/tax/invoice behavior has approved product/finance/legal policy before enablement.
12. Payment failure never weakens membership/capability/isolation.
13. Advanced branding accepts only safe allowlisted values/assets.
14. Custom domains require verified ownership, automated certificate, unique mapping, safe removal/tombstone.
15. Host remains routing hint followed by ordinary authorization.
16. Cookie/CORS/callback/default-domain/phishing protections pass Azar/Solar host tests.
17. SAML/OIDC configuration/secrets/metadata/certificates are organization-scoped and safely rotated.
18. SSO validates protocol security and resolves active membership.
19. Email/domain/IdP claim alone never grants membership or owner/platform role.
20. Invitation-only baseline or separately approved JIT/deprovisioning/role mapping is implemented/tested.
21. SSO enforcement retains approved tested break-glass recovery.
22. Dedicated eligibility/provisioning is approved, automated, versioned, and fork-free.
23. Dedicated environments preserve organization identity/contracts/security/operations.
24. Shared/dedicated transfer proves manifests/checksums/one-writer/cutover/rollback/recovery.
25. Analytics retains non-null organization through every stage and customer query.
26. Organization dashboards/reports/exports are bounded, scoped, redacted, timezone-aware, and capability-checked.
27. Platform aggregation is separately authorized and cannot be invoked/viewed by customer roles.
28. Analytics caches/exports are organization-keyed and cleared/reauthorized correctly.
29. Retention/deletion/legal hold/restore propagate to billing/domain/SSO/dedicated/analytics data.
30. Secrets/providers/webhooks/jobs consume SPEC-28/32 controls.
31. Every enabled module has safe telemetry, alerts, runbooks, support, backup/restore, incident, and disable/rollback evidence.
32. Real-database and Azar/Solar direct-ID/cross-context/adversarial tests pass for every enabled module.
33. Automated tests use provider sandboxes/fakes and no production credentials/customer data.
34. Frontend module routes/state are server-confirmed, accessible, organization-keyed, and switch/logout safe.
35. Canonical architecture/API/environment/testing/engineering/privacy/operations/support/module docs are updated.
36. A traceability matrix links each enabled module criterion to migration, code, tests, docs, evidence, and reviewer.
37. MT-SPEC-10 lists every module selected for Solar and blocks unfinished modules in backend/UI.
38. Unselected modules remain disabled and do not block core Azar/Solar isolation release.
39. This SPEC itself creates no prices, tax rules, customer domains, IdPs, dedicated environments, billing accounts, or analytics data.
40. Product, finance, security, data, backend, frontend, operations, integration, privacy/legal, and support owners approve each enabled module.

## Completion gate and handoff

SPEC-33 framework approval does not mean all five modules are implemented. Each offered module passes independently only when its complete acceptance subset and common gates are satisfied.

MT-SPEC-10 must:

- enumerate modules enabled for Azar and planned for Solar;
- include only certified modules in migration/canary tests;
- disable every unfinished module in UI, API, workers, callbacks, and routing;
- include module data/providers/resources in inventory, backup/restore, incident, and rollback evidence; and
- verify no module bypasses core organization isolation.

## Required deliverables

- Approved SPEC-33 / MT-SPEC-09 framework.
- Module registry/state and certification evidence template.
- For each enabled module: approved addendum/decision record, migrations, services/routes/UI/provider integration, tests, runbooks, and traceability.
- Plan/entitlement/subscription/billing contracts if billing enabled.
- Branding/domain/DNS/certificate/routing/cookie/CORS/callback contracts if domains enabled.
- SAML/OIDC/linking/provisioning/enforcement/recovery contracts if SSO enabled.
- Automated isolation provisioning/transfer/fleet operations if dedicated tier enabled.
- Scoped pipeline/materialization/report/export/warehouse lifecycle if analytics enabled.
- MT-SPEC-10 enabled-module inventory and certification handoff.

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

Focused checks depend on enabled modules and classify all matches:

```bash
rg -n "plan_key|entitlement|subscription|billing|invoice|usage_events" backend/src frontend/src supabase/migrations
rg -n "custom_domain|hostname|certificate|Origin|CORS|cookie|callback" backend/src frontend/src supabase/migrations
rg -n "SAML|OIDC|identity_provider|issuer|audience|JIT|break_glass" backend/src frontend/src supabase/migrations
rg -n "dedicated|isolation_tier|deployment|warehouse|analytics|materialized" backend/src frontend/src supabase/migrations
rg -n "organization_id|queryKey|localStorage" backend/src frontend/src supabase/migrations
```

No root `package.json` or `docs:check` script currently exists. Until added, documentation verification uses required-section/reference review, Markdown checks, `git diff --check`, and the relevant backend/frontend/module commands.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Plan flag becomes permission | Authorize first; entitlement only restricts; canonical registry/tests |
| Duplicate/out-of-order webhook corrupts billing | Signature, idempotent receipt, state reconciliation, audit |
| Payment failure locks out required data rights | Explicit legal/product state matrix and owner read/export/delete/recovery review |
| Custom domain maps wrong organization | DNS verification, unique/tombstoned host mapping, atomic route activation, normal authorization |
| Cookie/callback leaks across hosts | Host-only/exact-origin/callback contracts and cross-host tests |
| Email/SSO claim creates membership | Invitation-only baseline; explicit active membership resolution; owner/platform claim denial |
| SSO outage locks every owner out | Tested controlled break-glass path with step-up/audit/notification |
| Dedicated customer drifts from main product | Automated same-code/migration fleet; no forks; drift monitoring |
| Transfer has two writers | Freeze/change-capture plan and atomic route cutover with one authority |
| Warehouse mixes organizations | Non-null organization through pipeline, scoped materializations, adversarial joins/exports |
| Analytics leaks small/sensitive cohorts | Approved aggregation/suppression/redaction and bounded access |
| Optional module delays core isolation | Independent module states; unselected modules disabled and non-blocking |
| Solar receives unfinished feature | MT-SPEC-10 exact enabled-module certification and backend/UI disablement |

## References

### Multi-tenant source documents

- `docs/09-roadmap/specs/research/23-RESEARCH-multi-tenant-saas-architecture.md`
- `docs/09-roadmap/specs/research/24-RESEARCH-multi-tenant-saas-specification-roadmap.md`
- `docs/09-roadmap/specs/pending/25-SPEC-multi-tenant-policy-threat-model-containment-and-inventory.md`
- `docs/09-roadmap/specs/pending/26-SPEC-multi-tenant-organizations-memberships-onboarding-and-lifecycle.md`
- `docs/09-roadmap/specs/pending/28-SPEC-multi-tenant-database-enforcement-audit-abuse-observability-and-recovery.md`
- `docs/09-roadmap/specs/pending/30-SPEC-multi-tenant-properties-submissions-modifications-and-management.md`
- `docs/09-roadmap/specs/pending/31-SPEC-multi-tenant-private-assets-uploads-retention-and-storage-migration.md`
- `docs/09-roadmap/specs/pending/32-SPEC-multi-tenant-integrations-secrets-outbox-google-and-make.md`

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

Status: pending prerequisite specifications and separate product, finance, security, data, backend, frontend, operations, integration, privacy/legal, and support approval for each enabled module. Author: redacted.
