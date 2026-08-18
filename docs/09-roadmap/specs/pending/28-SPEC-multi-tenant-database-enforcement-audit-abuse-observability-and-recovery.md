# SPEC-28 / MT-SPEC-04 Multi-tenant SaaS foundation — database enforcement, audit, abuse controls, observability, and recovery

**Date:** 2026-08-18
**Priority:** critical
**Status:** pending prerequisite specifications and approval
**Roadmap identifier:** MT-SPEC-04
**Dependencies:** SPEC-25 / MT-SPEC-01, SPEC-26 / MT-SPEC-02, and MT-SPEC-03
**Blocks:** MT-SPEC-05 through MT-SPEC-10 and the onboarding of any second real organization

---

## Specification identity

**Name:** Shared-schema data enforcement, RLS/service-role safety, audit, distributed controls, monitoring, backups, and disaster recovery.

**Description:** Define the cross-cutting technical controls that every organization-owned domain must follow in the database and production environment.

**Why it is necessary:** Application-level filters are insufficient for contracts, identity documents, and financial evidence. The backend service role bypasses RLS, current rate limits and upload sessions are process-local, local logs are not durable, and isolation failures must be detectable and recoverable.

## Summary

This specification establishes one mandatory platform standard for every organization-owned record and operation. It defines:

- non-null organization ownership and composite database integrity;
- organization-scoped repository and database-function contracts;
- deny-by-default Row Level Security and explicit service-role safeguards;
- append-only, redacted, organization-scoped audit events;
- distributed rate limiting, idempotent usage accounting, quotas, and fair shared-capacity controls;
- request correlation, structured logs, metrics, alerts, and security signals;
- pagination, connection, query-plan, and organization-leading performance requirements;
- point-in-time recovery, logical organization export/restore, full restore, tombstones, and external-side-effect reconciliation;
- incident playbooks for isolation, credentials, providers, migrations, and recovery; and
- a disposable real-database test harness that proves the controls against Azar/Solar adversarial fixtures.

The controls are reusable infrastructure. Later domain specifications must consume them rather than creating weaker contract-, property-, file-, or integration-specific alternatives.

This document defines implementation contracts. It does not migrate production data, enable Solar, expose support access, change contract/property behavior, or execute a production restore.

## Authority and relationship to other specifications

This is the fourth formal implementation SPEC derived from:

- `docs/09-roadmap/specs/research/23-RESEARCH-multi-tenant-saas-architecture.md`;
- `docs/09-roadmap/specs/research/24-RESEARCH-multi-tenant-saas-specification-roadmap.md`;
- `docs/09-roadmap/specs/pending/25-SPEC-multi-tenant-policy-threat-model-containment-and-inventory.md`; and
- `docs/09-roadmap/specs/pending/26-SPEC-multi-tenant-organizations-memberships-onboarding-and-lifecycle.md`.

MT-SPEC-03 is not currently present as a project document. SPEC-28 may be reviewed, but implementation cannot be completed until MT-SPEC-03 defines the authenticated `OrganizationRequestContext`, machine principals, platform/support principals, session revocation, and request middleware boundary consumed here.

SPEC-25 policy decisions are authoritative. In particular:

- POL-01 controls assignment versus quarantine of existing data;
- POL-03 controls visibility within an organization without weakening organization isolation;
- POL-08 permits usage/entitlement structure without making billing an isolation dependency;
- POL-09 supplies approved retention periods and legal bases;
- POL-10 keeps support access separate and denied by default;
- POL-11 requires suspension to block mutations and external delivery; and
- POL-12 supplies incident ownership, severity, notification, and response targets.

If an approved policy differs from a baseline in this draft, this SPEC must be revised explicitly before implementation.

Earlier project SPECs remain behavior references, not tenancy authority:

- SPEC-09 establishes request correlation, redaction, metrics, provider error handling, and audit concepts that must move from local files into durable organization scope.
- SPEC-10 through SPEC-18 establish durable contract entries, submissions, events, private buckets, validation, and correction history that later domain migrations must preserve.
- SPEC-19 establishes the current Supabase Auth/application-cookie boundary, but its global administrator grant and self-contained authority are superseded by MT-SPEC-02/03.
- SPEC-22's `created_by_user_id` remains attribution and an optional within-organization filter; it cannot replace `organization_id`.
- No existing null-owner/global-visibility compatibility behavior may survive the production multi-tenant cutover.

## Context

The repository uses server-side Supabase clients configured with `SUPABASE_SERVICE_ROLE_KEY` in contract repositories, storage services, evidence services, and authentication services. That role bypasses RLS. Current contract migrations enable RLS on selected tables, but service-role operations still depend on application correctness and several database functions accept only a record UUID.

Cross-cutting state is fragmented:

- contract submission rate limits use an in-process `Map`;
- property media upload sessions use an in-process `Map`;
- property submission outcomes are written to a local file or console;
- retained SPEC-09 audits are filesystem JSON;
- metrics are emitted to console;
- property Drive/Sheets/Make calls execute directly in a request;
- a database trigger contains a fixed Make endpoint and posts a broad row payload;
- there is no durable cross-domain audit schema, usage ledger, fair job claim, backup validation evidence, or restore-side-effect reconciliation; and
- repository interfaces do not yet enforce organization scope in their types.

These mechanisms work only for a single process and a single trusted customer boundary. Multiple instances, retries, restores, malicious UUIDs, or a second organization can bypass or desynchronize them.

## Motivation

Multi-tenant isolation must remain true when a route is wrong, an instance restarts, two requests race, a service-role query bypasses RLS, a backup is restored, or a provider times out after accepting a side effect. Organization scope therefore has to be encoded in database keys, repository signatures, database policies, durable operational records, tests, and recovery procedures—not merely in React routes or Express filters.

This SPEC makes failures observable and recoverable without logging the private customer data the controls are intended to protect.

## Objective

Implement a reusable, deny-by-default platform layer in which every active organization-owned row has explicit ownership, every relationship is database-constrained to that ownership, every privileged operation is scoped and attributable, abuse controls work across instances, operational signals are safely correlated, and database/provider recovery cannot expose one organization or replay completed external work.

## Terminology

- **Organization-owned row:** A durable business, asset, audit, job, delivery, usage, configuration, or integration row with one non-null `organization_id`.
- **Composite organization reference:** A foreign key from `(parent_id, organization_id)` to the parent `(id, organization_id)`.
- **Organization-leading index:** An index whose first selective partitioning column is `organization_id` for organization-scoped access.
- **RLS:** PostgreSQL Row Level Security, used as defense in depth for browser/user-JWT access and database policy enforcement.
- **Service role:** The Supabase backend credential that bypasses RLS and therefore requires explicit application/database scoping.
- **Scoped repository:** A persistence interface whose organization-owned operations require `organization_id` and never accept an optional scope.
- **Scoped RPC:** A database function that takes and validates organization/actor context and cannot operate on a UUID alone.
- **Audit event:** An append-only, redacted record of a security-, governance-, or business-significant attempt/outcome.
- **Operational log:** A short-retention diagnostic event; it is not the audit source of truth.
- **Usage event:** An idempotent append-only measurement used for limits, reporting, and future billing.
- **Rate-limit subject:** The organization, user, API key, external token fingerprint, IP, record/draft, or action dimension being limited.
- **Outbox intent:** A durable declaration that an external side effect must be delivered after the business transaction commits.
- **Reconciliation:** Comparison of database intent/history with external state before retrying or resuming work.
- **PITR:** Database point-in-time recovery.
- **RPO/RTO:** Approved maximum data-loss interval and recovery-time objective.
- **Tombstone:** Minimal durable deletion evidence reapplied after restore so deleted data is not re-exposed.

New visible and persisted contracts use `snake_case`; environment variables use `UPPER_SNAKE_CASE`. Internal TypeScript identifiers may follow repository conventions.

## Scope

### Includes

- Shared database conventions for every current and future organization-owned table.
- Non-null `organization_id` after a domain's migration completion gate.
- Composite identity, foreign-key, uniqueness, and organization-leading index patterns.
- RLS policy templates and a real-database policy test harness.
- Service-role client containment and scoped repository/RPC assertions.
- Actor/request propagation into writes, audit, jobs, usage, and deliveries.
- Append-only `audit_events` with redaction and restricted access.
- Distributed rate-limit storage and atomic consumption.
- Idempotent `usage_events`, quota snapshots, and enforcement semantics.
- Fair scheduling and bounded organization/provider concurrency contracts.
- Structured logging, metrics, alerting, trace correlation, and safe labels.
- Cursor pagination and query-plan/performance gates.
- PITR, configuration backup, logical organization export/restore, full restore, restore drills, tombstones, and provider reconciliation.
- Incident playbooks and evidence requirements.
- Additive migrations, compatibility gates, rollback constraints, and closure traceability.

### Excludes

- The organization/membership schema and lifecycle behavior owned by SPEC-26.
- Session creation, organization switching, machine-key issuance, or support-authentication UI owned by MT-SPEC-03.
- Contract-specific schema and behavior owned by MT-SPEC-05.
- Property-specific persistence and behavior owned by MT-SPEC-06.
- Asset upload/download/retention implementation owned by MT-SPEC-07.
- Provider credentials, outbox workers, provider delivery semantics, and integration routing owned by MT-SPEC-08.
- Subscription invoicing/payment processing owned by MT-SPEC-09.
- Production Azar backfill, quarantine adjudication, cutover, or Solar onboarding owned by MT-SPEC-10.
- A general-purpose analytics warehouse, SIEM vendor selection, or database-per-organization architecture.
- Logging customer content for debugging.

## Dependency and readiness gate

Implementation begins only when:

1. SPEC-25 policy decisions required by this document are approved.
2. SPEC-26 organization IDs, membership states, organization states, role/capability keys, and governance contracts are stable.
3. MT-SPEC-03 defines trusted request/session/principal context and immediate revocation semantics.
4. Operations approves production RPO, RTO, backup retention, restore owners, and evidence storage.
5. Privacy/legal approves audit/log/usage/backup retention by data class under POL-09.
6. Security approves service-role import boundaries, support audit requirements, rate-limit fail behavior, and alert destinations.

An unresolved dependency must leave the affected path disabled or staged; it must not be filled with an engineer-selected security default.

## Non-negotiable platform invariants

1. Every active organization-owned row has exactly one non-null `organization_id` after its domain migration gate.
2. Null organization ownership never means shared, legacy, public, or visible to all organizations.
3. Ambiguous legacy ownership is quarantined, not guessed or exposed.
4. Every organization-owned repository method requires organization scope in its type signature.
5. No authenticated business repository exposes unscoped `find_by_id`, `list_all`, `update_by_id`, `delete_by_id`, or equivalent methods.
6. Every read, write, lock, delete, join, RPC, job claim, and signed-resource issuance matches the record ID and organization ID.
7. Every child-to-parent organization relationship is enforced with a composite foreign key wherever PostgreSQL can express it.
8. Creator, assignee, email, slug, path, API key, token, or route values never replace organization ownership.
9. Cross-organization identifiers return generic not-found behavior and cause no domain, audit-content, provider, cache, or timing-dependent disclosure beyond approved security telemetry.
10. RLS is enabled and forced where compatible on organization-owned tables; policies deny by default.
11. RLS is defense in depth and is never cited as protection for a service-role query.
12. Service-role code must satisfy the same explicit organization predicates and composite constraints as any other principal.
13. Database functions fail closed on missing, null, mismatched, inactive, or unauthorized organization/actor context.
14. `security_definer` is exceptional, reviewed, search-path-safe, schema-qualified, and inaccessible to `public`/`anon` unless explicitly justified.
15. A successful privileged mutation and its success audit/outbox/usage intents commit atomically where required.
16. Failed or denied privileged attempts cannot partially mutate business state.
17. Audit rows are append-only and cannot be updated or deleted by ordinary application principals.
18. General audit/log/metric payloads never contain raw credentials, raw link/invitation/session tokens, signed URLs, private storage paths, identity-document content, or unnecessary PII.
19. Every request crossing a protected boundary has one validated/bounded request ID used consistently across safe telemetry.
20. Rate limits and quotas are atomic and shared across all application instances.
21. Rate-limit, quota, cache, idempotency, worker, and delivery keys include organization scope whenever an organization principal exists.
22. Idempotent replays return the original safe result or current operation state and do not duplicate usage or provider intent.
23. One organization cannot monopolize shared workers, provider concurrency, database connections, or retry capacity.
24. Metrics never use email, address, person name, raw UUID with uncontrolled cardinality, token, file path, or customer content as labels.
25. Local files and console output are never the authoritative production audit, job, usage, delivery, or business store.
26. Restore never resumes external side effects until completed/uncertain intents have been reconciled.
27. Restore reapplies deletion tombstones, legal holds, revoked credentials, and disabled organization/session state before customer traffic.
28. Backup or export artifacts are encrypted, access-controlled, inventoried, expiring, and never placed in public storage.
29. Pagination is bounded and deterministic; organization lists are filtered in SQL rather than after global fetch.
30. No second production organization is enabled until every domain proves these invariants with Azar/Solar negative tests.

## Shared database ownership standard

### Required columns

Every organization-owned table defines:

- `organization_id uuid not null` referencing `organizations(id)`;
- a stable primary identifier;
- `created_at timestamptz not null` in UTC;
- actor attribution appropriate to the record;
- `updated_at` and positive integer `version` for mutable aggregates; and
- retention/deletion state where required by the approved data-class policy.

Active records must not use sentinel organization UUIDs. Globally defined registries/templates must live in explicitly global tables and may be enabled through organization-scoped association rows; they must not use null organization ownership to mix global and customer data.

### Composite parent identity

An organization-owned parent with UUID `id` must expose a unique key on `(id, organization_id)`, even when `id` is already globally unique. Each organization-owned child repeats `organization_id` and references the pair:

```sql
unique (id, organization_id)
foreign key (parent_id, organization_id)
  references parent_table (id, organization_id)
```

This rejects a Solar child pointing to an Azar parent even when application code is wrong. Multi-parent association tables must enforce organization consistency for every organization-owned parent.

### Unique constraints

- Human-facing codes unique per organization use `unique (organization_id, normalized_code)`.
- Provider identifiers are unique within the owning integration/configuration boundary, not assumed globally unique.
- Idempotency keys are unique within organization, action, and principal/route scope.
- Append-only sequence/revision numbers are unique within organization and aggregate.
- Partial unique indexes enforce one live invitation, active key prefix, current version, or pending operation as defined by the consuming SPEC.

### Organization-leading indexes

Index shapes are derived from real query paths and begin with `organization_id` for organization-scoped queries. Required families include:

- `(organization_id, status, created_at desc, id desc)`;
- `(organization_id, created_by_user_id, created_at desc, id desc)` where creator filtering exists;
- `(organization_id, assigned_to_user_id, status, updated_at desc, id desc)` where assignment exists;
- `(organization_id, aggregate_id, revision_number desc)` for history;
- `(organization_id, job_state, available_at, id)` for work claims;
- `(organization_id, occurred_at desc, id desc)` for audit/event timelines; and
- `(organization_id, human_code)` for exact lookup.

Indexes must not duplicate without measured value. Migration evidence includes `EXPLAIN (ANALYZE, BUFFERS)` from representative safe fixtures and confirms no global scan precedes organization filtering.

### Actor and request attribution

Durable privileged writes carry or link to:

- `actor_type` from a closed allowlist;
- nullable typed `actor_user_id`, `membership_id`, `api_key_id`, `external_capability_id`, or `support_session_id` as applicable;
- `request_id`;
- source operation/action key; and
- UTC occurrence time.

The server derives these values from MT-SPEC-03 context. Caller JSON cannot select actor identity or organization ownership.

## Row Level Security standard

### Policy model

- Enable RLS on every organization-owned application table as soon as the table is introduced.
- Use explicit `select`, `insert`, `update`, and `delete` policies rather than broad `for all` policies where semantics differ.
- Require both organization membership and the necessary named capability for browser/user-JWT access.
- Apply `with check` as well as `using` so an update cannot move a row to another organization.
- Prefer no direct browser mutation for privileged governance, audit, usage, integration, secret, job, or lifecycle tables.
- Force RLS for non-superuser table owners where operationally compatible and document unavoidable exceptions.
- Revoked/suspended membership and suspended/deleted organization state deny according to SPEC-26/MT-SPEC-03.

RLS helper functions must not trust mutable `user_metadata`. They resolve verified Auth identity and durable active membership. Helpers use stable SQL, schema qualification, safe `search_path`, and tests for missing/invalid context.

### Table access classes

| Class | Browser/user-JWT access | Backend service access |
|---|---|---|
| Customer business rows | Capability-scoped read/write where approved | Explicit organization predicate required |
| Membership/settings | SPEC-26 capability matrix | Explicit organization predicate and actor |
| Audit/usage/security events | No direct mutation; restricted projections only | Append through reviewed service/RPC |
| Jobs/outbox/deliveries | None | Organization-scoped workers only |
| Integration secrets | None | Secret broker/provider adapter only |
| Public branding | Safe read projection only | Scoped write and projection generation |
| Quarantine/migration evidence | None | Explicit migration/operator workflow only |

### RLS verification

For every organization-owned table, tests prove:

- Azar can perform each allowed operation on Azar fixtures;
- the same principal cannot read or mutate Solar fixtures by UUID, join, filter, RPC, or association;
- unauthenticated, removed, suspended, wrong-capability, and missing-context principals fail;
- `with check` prevents organization reassignment;
- relationship constraints reject mixed-organization parents/children; and
- policy behavior remains correct after role, membership, organization-state, and session changes.

## Service-role containment

The backend service role bypasses RLS. Its use is allowed only behind a small server-only client factory and reviewed persistence adapters.

Required controls:

- The credential never appears in frontend code, browser configuration, logs, errors, audits, test snapshots, or generated documentation.
- Feature/route modules do not construct arbitrary service-role clients.
- Service-role repositories accept an `OrganizationScope` value created by trusted middleware/domain code.
- Organization scope is mandatory and non-optional for organization-owned operations.
- Queries match `.eq('organization_id', scope.organization_id)` before execution and use composite identifiers/RPC arguments for mutations.
- Returned rows are asserted to match the requested organization; mismatch is a security failure, not filtered silently.
- Multi-row results are bounded and all rows are asserted in tests.
- Cross-organization batch work uses an explicit platform/system job type, processes one organization partition at a time, and records authority/reason.
- Static checks/lint or architectural tests prohibit service-role imports outside allowlisted modules.
- Logs include safe request/operation correlation, never the credential or raw provider response.

The long-term option of user-JWT/least-privileged database access may reduce exposure, but it does not delay these service-role safeguards.

## Scoped repository contract

All organization-owned repository methods follow an equivalent semantic shape:

```text
list(scope, query)
find_by_id(scope, record_id)
insert(scope, actor, input)
update(scope, actor, record_id, expected_version, patch)
delete_or_archive(scope, actor, record_id, expected_version)
lock_by_id(scope, record_id)
```

Rules:

- `scope.organization_id` is required and is not taken from `input`.
- Public payloads containing `organization_id` for an ordinary organization route are rejected as unknown/forbidden ownership input unless the contract specifically requires a platform selector.
- `find_by_id` returns not-found for a mismatched organization.
- Lists filter/search/sort/page in SQL and never load a global collection for JavaScript filtering.
- Updates/deletes include organization, ID, and expected version in the mutation predicate.
- Joins carry organization equality explicitly even when UUIDs are globally unique.
- Raw database clients do not cross service/repository boundaries.
- Repository fakes used in unit tests enforce the same scope rather than hiding missing predicates.

## Scoped database functions and triggers

- Prefer `security invoker` functions.
- A `security definer` function requires security review and a documented reason.
- Set an empty or fixed safe `search_path` and schema-qualify every object.
- Revoke execute from `public`, `anon`, and `authenticated` by default; grant only to the exact backend role when justified.
- Accept explicit `organization_id`, actor context, request ID, expected version, and idempotency key as applicable.
- Validate parent/child organization equality inside the function in addition to constraints.
- Lock the minimal rows required and use deterministic lock order.
- Return only safe typed projections and never tokens, hashes, secrets, or private paths.
- Trigger functions may enqueue a redacted organization-owned outbox intent; they must not call a fixed external webhook or send an entire row.
- No database trigger may make an unreconciled external side effect inside the business transaction.

## Durable audit model

### `audit_events`

Required fields:

| Field | Requirement |
|---|---|
| `id` | UUID or monotonic sortable identifier; immutable |
| `organization_id` | Non-null for customer activity; truly platform-only activity uses a separate restricted `platform_audit_events` store and never a null customer-audit owner |
| `occurred_at` | Server/database UTC timestamp |
| `request_id` | Bounded correlation ID |
| `actor_type` | Closed allowlist such as `member`, `organization_api_key`, `external_contract_link`, `platform_support`, `system_worker`, `migration` |
| Actor reference | Typed nullable reference consistent with `actor_type` |
| `action` | Stable namespaced action key |
| `target_type` / `target_id` | Safe target classification/identifier |
| `outcome` | `succeeded`, `denied`, or `failed` |
| `source` | Route/job/worker/system classification, not customer content |
| `changed_fields` | Allowlisted field names only; no before/after secret values |
| `reason_code` | Safe machine code where applicable |
| `support_reason` | Required restricted reference for approved support activity; no free-form customer content in general projection |
| `metadata` | Size-bounded, schema-validated, redacted JSON |
| `integrity_version` | Audit schema/integrity strategy version |

Append-only enforcement includes revoked update/delete grants, RLS, reviewed append RPC/service, and tests. Retention/purge is a separate privileged policy-governed operation that writes a purge receipt and never grants ordinary edit access.

### Audit transaction semantics

- Successful domain mutation, domain event, audit event, usage intent, and outbox intent commit atomically when they describe one operation.
- A domain rollback cannot leave a success audit.
- Authorization denials and pre-transaction failures use a separate restricted security-audit append path because the failed business transaction cannot contain them.
- If required audit persistence is unavailable, privileged/high-risk mutation fails closed with `503 AUDIT_UNAVAILABLE` unless an explicitly approved emergency mode exists.
- Low-risk reads follow the approved availability policy but emit operational failure signals; security-sensitive reads and support access fail closed.
- Replays use the same idempotency record and do not create duplicate success audit/usage/outbox rows.

### Redaction and privacy

General audit/log records may contain stable organization ID, request ID, actor/target IDs, action, outcome, safe error code, and allowlisted changed field names.

They must not contain:

- passwords, access/refresh/session tokens, API keys, invitation/role-link raw tokens or hashes;
- Authorization/Cookie headers, signed upload/view URLs, provider credentials, or decrypted secrets;
- raw storage paths in general logs;
- DNI/identity-document contents, guarantor evidence, complete contract/property payloads;
- complete email lists, addresses, phone numbers, names, or free-form customer content;
- raw provider error bodies; or
- database rows serialized for convenience.

Restricted evidence needed for legal/security investigation uses a separate access class, encryption, retention, and access audit. It is not copied into general telemetry.

## Request correlation and error contract

- Accept `X-Request-Id` only when it matches the bounded approved syntax/length; otherwise generate a new cryptographically unpredictable ID.
- Return the effective request ID as `X-Request-Id` on API responses.
- Propagate it through domain events, audit, usage, outbox, worker attempts, and safe provider metadata where supported.
- Do not use sequential IDs that disclose traffic volume.
- Standardize `401` for missing/invalid identity, `403` for capability denial, generic `404` for cross-organization/missing resources, `409` for version/idempotency conflicts, `423` for organization lifecycle locks, `429` with `Retry-After` for rate limits, and `503` for unavailable required infrastructure.
- Public error bodies use stable `UPPER_SNAKE_CASE` codes and never contain raw database/provider errors.

## Distributed rate limiting

### Required architecture

Replace process-local maps with an atomic shared implementation. The first production implementation may use PostgreSQL through a restricted atomic function or a reviewed Redis-compatible store. The selected provider must pass identical contract tests and be recorded before completion.

The limiter receives:

- action key;
- organization ID when known;
- principal type and stable hashed/fingerprinted principal ID;
- optional external-token fingerprint;
- optional record/draft/entry ID;
- normalized client IP according to trusted-proxy configuration;
- cost;
- policy version; and
- current server time.

The result returns `allowed`, remaining safe count where disclosure is acceptable, reset/retry time, and policy key. Consumption is atomic across instances.

### Covered actions

Policies must exist for:

- password login, Google handoff, password recovery, email change, and MFA challenge;
- invitation create/resend/resolve/accept;
- external contract-link validation and submissions;
- upload presign/finalize and signed-view issuance;
- contract/property creation, submissions, token regeneration, corrections, and retries;
- provider connection tests;
- API-key use/rotation failures;
- exports, deletion requests, support activation, and other privileged operations.

### Key composition and privacy

- Use layered limits: global safety, organization, principal, action, and IP/target as appropriate.
- Hash or HMAC sensitive subjects with a rotatable limiter-specific secret; do not persist raw email/token/IP where unnecessary.
- Organization suspension/revocation is authorization, not rate limiting, and is checked independently.
- Expired buckets are cleaned durably without allowing an attacker to force unbounded storage.
- Rate-limit telemetry uses action/policy/outcome, not raw subject labels.

### Failure behavior

- Security-sensitive token validation, login abuse, presigning, manual retry, and support activation fail closed when the distributed limiter is unavailable.
- Any explicitly fail-open low-risk read requires security approval, a local emergency ceiling, prominent alert, and no privilege expansion.
- `429` includes bounded `Retry-After`; it does not reveal whether a target account, invitation, organization, or record exists.

## Usage accounting and quotas

### `usage_events`

Each immutable event includes organization, stable idempotency key, metric key, quantity, unit, source aggregate/operation, occurred time, actor class, request ID, and schema version. A unique constraint prevents double counting the same logical operation.

Initial metric families include:

- active/member seats;
- contracts/properties created or active;
- verified storage bytes and upload count/size;
- external links/invitations issued;
- provider deliveries/attempts;
- exports and high-cost processing operations.

### Enforcement

- Capability grants never come from quota/plan values.
- Quotas may restrict an otherwise authorized operation.
- Reservation and finalization are atomic/idempotent for operations whose cost is known only after completion.
- Failed/reversed operations follow metric-specific compensation rules; history is appended, not edited.
- Near-limit/exceeded results are safe typed errors and auditable.
- Aggregated quota snapshots are rebuildable from immutable usage plus approved corrections.
- Automated invoicing is outside this SPEC.

## Fair scheduling and bounded shared capacity

Workers and provider delivery systems implemented by later SPECs must consume these rules:

- queue rows carry non-null organization ID, action/provider class, availability, attempts, priority band, and idempotency key;
- claims are atomic with `for update skip locked` or an equivalent reviewed primitive;
- concurrency is bounded globally, per provider/configuration, and per organization;
- scheduling rotates fairly among ready organizations within priority bands;
- retries use capped exponential backoff with jitter and do not occupy active slots while waiting;
- poison work moves to a durable dead-letter/reconciliation state after policy limits;
- one organization's outage/retry storm cannot starve another;
- organization suspension blocks new claims/delivery and transitions pending work according to POL-11/MT-SPEC-08; and
- restored jobs remain paused until reconciliation.

## Structured logs, metrics, and alerts

### Structured logs

Production logs are structured objects with a versioned schema. Allowed common fields include timestamp, severity, service, environment, request ID, organization ID where authorized, actor class, route/action, safe status/error code, duration, attempt, and deployment version.

- Redaction occurs before the logger sink.
- Error objects are mapped to safe codes; raw provider response bodies are excluded.
- Log ingestion failure does not cause secrets/content to fall back to console serialization.
- Access to logs is least-privileged and audited by the selected platform.
- Retention follows approved data classes.

### Metrics

Required metric families include:

- authorization denials by action/reason class;
- cross-organization not-found/security test signals without customer-content labels;
- session revocations and invalid session use;
- invitation/link validation abuse;
- upload presign/finalize/verification failure;
- queue depth/oldest age, worker claims, retries, dead letters;
- provider latency, success, safe failure class, circuit state;
- rate-limit decisions and limiter health;
- quota consumption/denial;
- database pool saturation, query latency, lock waits, deadlocks, storage growth;
- backup age, restore drill result, tombstone replay result; and
- audit append failure.

Label sets are bounded. Organization-level dashboards use access-controlled attributes or logs/traces, not uncontrolled organization-ID metric labels when cardinality would be unsafe.

### Minimum alerts

Alert when:

- any suspected cross-organization access succeeds;
- authorization denials or token failures spike above approved thresholds;
- required audit/rate-limit infrastructure is unavailable;
- queue age/dead letters/retries exceed policy;
- one organization consumes disproportionate shared capacity;
- provider routing/configuration mismatch occurs;
- backup/PITR coverage is stale or a restore drill fails;
- deletion tombstones or legal holds fail to reapply;
- database pools, storage, locks, or latency approach capacity; or
- secrets/credentials may have been exposed.

Every alert has severity, owner, acknowledgement/escalation route, linked runbook, and safe evidence requirements from POL-12.

## Pagination and performance

- Organization list endpoints use opaque cursor pagination with stable total ordering such as `(created_at, id)`.
- Page size has a safe default and hard maximum; caller-supplied unbounded limits are rejected.
- Cursor payloads are signed/validated or opaque server-issued values and include filter/sort version where required.
- Search/filter/sort executes in SQL under organization scope.
- Counts use bounded/approved strategies; expensive global exact counts are not returned by default.
- Database connections use one reviewed pool per process with environment-specific limits and timeouts.
- Transactions are short; no provider call occurs while holding database locks.
- Statement/lock/idle-transaction timeouts are configured for application roles.
- Migration/performance evidence includes representative organization sizes, pagination boundaries, hot indexes, concurrent mutation, and query plans.
- Performance optimizations may not remove organization predicates or composite validation.

## Backup and recovery

### Recovery policy record

Before production enablement, operations must record approved:

- RPO and RTO by critical service/data class;
- PITR availability and retention;
- full backup schedule/retention/location/encryption;
- secret/configuration backup ownership and restore process;
- restore environment isolation;
- drill cadence and owners;
- logical organization export/restore limitations; and
- evidence retention and sign-off.

No numeric objective is silently chosen by this SPEC.

### Database PITR and full restore

- Enable provider-supported PITR and verify coverage automatically.
- Encrypt backup data in transit and at rest with access separate from ordinary application operators.
- Keep application secrets out of database dumps and backup manifests; back them up through the approved secret manager.
- Restore only into an isolated environment until validation completes.
- Validate schema migration version, constraints, RLS, grants, row counts/checksums, organization ownership, audit continuity, legal holds, deletion tombstones, session/key revocations, and outbox state.
- Reapply migrations only through the reviewed forward migration path.
- Do not open customer traffic until the recovery checklist and security approval pass.

### Logical organization export and restore

Logical export uses a manifest containing organization ID, export ID, schema version, time boundary, included/excluded data classes, per-file/table counts, checksums, encryption metadata reference, and expiration. It includes only the requested organization and explicitly approved global dependencies.

Restore:

- validates manifest/signature/checksums and target authorization;
- prevents collision or accidental merge with another organization;
- preserves immutable IDs/history where safe or records deterministic remapping;
- rebinds no provider credentials or destinations automatically;
- registers assets/provider references as unavailable pending validation;
- writes restore audit/evidence; and
- passes Azar/Solar isolation tests before activation.

This is not a customer-facing import feature unless a later product SPEC approves it.

### Deletion tombstones and legal holds

- A durable restricted tombstone identifies finalized deletions and data classes that must not be resurrected.
- Restore applies tombstones and active legal holds before session/API/worker traffic.
- Deleted organization slugs/IDs remain reserved according to SPEC-26.
- Backup retention expiry does not bypass legal hold.
- Purge from backups follows provider capability and approved policy, with evidence rather than false immediate-deletion claims.

### External side-effect reconciliation

After restore, every outbox/delivery/job with `processing`, `sent`, `unknown`, or retryable state is paused. Reconciliation uses stable external identifiers and idempotency keys to determine whether Drive, Sheets, Make, email, or other providers already committed the action.

- Never replay merely because the restored database predates a completion acknowledgement.
- `unknown` requires provider lookup/manual adjudication according to the integration contract.
- Completed provider work receives a recovered receipt without re-execution.
- Missing work may be resumed only through the normal idempotent worker.
- Irreconcilable work moves to a visible blocked/dead-letter state.
- All decisions are audited without raw provider payloads/secrets.

## Incident response and runbooks

Required runbooks:

1. **Suspected cross-organization exposure:** contain sessions/keys/routes/workers, preserve restricted evidence, identify affected organization/data classes/time, test the suspected path, apply POL-12 notification decision, remediate, and verify no broader leak.
2. **Credential compromise:** revoke/rotate the exact credential, revoke dependent sessions/jobs, inspect scoped audit, prevent fallback to old credentials, and validate provider access.
3. **Provider misrouting:** pause organization/provider deliveries, block unsafe retries, inventory sent objects/rows/webhooks, revoke public access, reconcile/delete where permitted, and notify under policy.
4. **Failed migration:** stop writes/cutover, preserve evidence, use reviewed forward repair or restore decision, rerun constraint/RLS tests, and never expose null/quarantined ownership.
5. **Database/data recovery:** isolate restore, validate integrity/RLS/tombstones/holds/revocations, reconcile external effects, run adversarial tests, approve reopen, and monitor.
6. **Audit/rate-limit outage:** fail required operations closed, activate approved degraded behavior only if documented, alert owners, reconcile missed safe telemetry, and close with evidence.

Each runbook names incident commander, technical owner, product owner, privacy/legal contact, notification decision owner, severity/response targets, communication channel, evidence location, recovery authority, and post-incident review requirements.

## Affected contracts and files

Implementation may refine filenames but must preserve these boundaries.

### Database and migrations

- Add forward-only migrations for `audit_events`, `usage_events`, distributed limiter state if PostgreSQL is selected, required recovery/tombstone evidence, and reusable scoped helper functions.
- Add composite keys/FKs, organization-leading indexes, RLS/grants, actor/request fields, and constraints to domain tables only with their owning SPEC/migration.
- Remove fixed external-call triggers only through the MT-SPEC-08/10 cutover plan; disable unsafe execution before Solar.
- Add a disposable real-database migration/RLS/constraint test harness.

### Backend

Expected responsibilities include:

- restricted Supabase/service-role client factories;
- organization-scoped repository base types/utilities;
- scoped RPC adapters and returned-row assertions;
- request-ID middleware and safe typed error mapping;
- audit, usage, quota, and distributed rate-limit services;
- structured redacting logger and metrics interfaces;
- fair job-claim primitives shared with MT-SPEC-08;
- recovery/export manifest validation and reconciliation interfaces; and
- architectural tests preventing forbidden imports/unscoped methods.

Expected areas include `backend/src`, `backend/tests`, `supabase/migrations`, and environment validation. Runtime/domain route changes remain owned by their domain SPECs.

### Frontend and public API

- Frontend code consumes stable safe error codes, `Retry-After`, request IDs, quota status, and durable operation states; it never receives service credentials, private audit metadata, raw limiter subjects, or storage paths.
- Organization IDs remain in scoped query keys as required by MT-SPEC-03.
- New public JSON/query/cursor contracts use `snake_case`.
- Canonical API documentation defines pagination envelopes, safe error envelopes, correlation headers, and asynchronous operation states.

### Operations and documentation

- Update architecture, environment, API, engineering, testing, security/privacy, retention, operations, observability, backup/restore, and incident documentation.
- Add production/staging configuration matrices without secret values.
- Add dashboards, alert ownership, restore drill templates, runbooks, and completion evidence locations.

## Expected behavior

### Main case

1. An MT-SPEC-03 request resolves an active Azar organization context and request ID.
2. The route checks capability before invoking a scoped service.
3. The repository receives Azar scope as a required typed argument.
4. SQL matches organization and record; composite constraints/RLS provide defense in depth.
5. A sensitive mutation checks the shared distributed limiter, expected version, and quota reservation.
6. Business change, domain event, audit event, usage event, and outbox intent commit atomically.
7. Structured logs/metrics record only safe correlation/outcome metadata.
8. A worker later claims Azar work fairly, without allowing Azar to starve Solar.
9. Provider outcome is persisted durably and correlated to the request/intent.
10. A retry returns/reconciles the existing operation and does not duplicate usage or delivery.

### Edge cases

- A valid Azar member supplies a Solar UUID: repository returns generic not-found, performs no side effect, and emits only approved security telemetry.
- A service-role query accidentally omits scope: type/architectural test prevents the call; database composite mutation constraints reject mixed relationships.
- A caller includes `organization_id` in ordinary JSON: validation rejects caller-owned tenancy input.
- Membership is revoked between UI load and mutation: request context revalidation denies the mutation.
- Two instances consume the same last rate-limit unit: atomic shared storage permits only one.
- An idempotent operation is retried with the same key and same fingerprint: return existing result/state.
- Same key arrives with a different fingerprint: `409 IDEMPOTENCY_CONFLICT`.
- Audit storage is unavailable during ownership transfer/support access: operation fails closed.
- Metrics/log sink fails: no raw data falls back to unsafe console output; health alert fires.
- One organization creates a retry storm: per-organization/provider caps preserve other organizations' capacity.
- Cursor is malformed or belongs to incompatible filters: safe `400 INVALID_CURSOR`.
- Database is restored to a point before provider acknowledgement: delivery stays paused until reconciliation.
- Restored data includes a deleted organization: tombstone reapplies before traffic.
- Legal hold conflicts with retention purge: hold wins and action is audited.

### Required failures

- Null organization ownership cannot become active production data.
- Cross-organization composite association cannot commit.
- Direct browser mutation of audit, usage, limiter, job, secret, or recovery tables fails.
- Unscoped service-role repository/RPC use fails tests and review gates.
- `security_definer` with mutable/default search path or public execute grant fails migration review.
- Global list fetch followed by JavaScript organization filtering fails review/tests.
- Raw secrets/tokens/signed URLs/customer payloads in general telemetry fail redaction tests.
- Process-local production limiter/session/job authority fails architecture tests.
- Unbounded pagination or uncontrolled metric labels fail contract review.
- Restore cannot open traffic with unresolved tombstone, RLS, grant, session/key, or outbox validation.
- Completed/uncertain external work cannot replay without reconciliation.

## Implementation sequence

### Phase 1 — approve contracts and threat controls

- Complete SPEC-25, SPEC-26, and MT-SPEC-03 dependencies.
- Approve service-role boundary, actor types, audit schema, retention, limiter backend/failure policy, usage metrics, RPO/RTO, alerts, and incident owners.
- Inventory every current service-role constructor, repository/RPC, local map/file logger, metric emitter, direct provider call, and database trigger.

### Phase 2 — additive shared schema and harness

- Add shared audit/usage/limiter/recovery schema and deny-by-default grants/RLS.
- Add scoped helper/RPC patterns and disposable database harness.
- Add Azar/Solar fixtures, composite-FK policy tests, and service-role negative tests.
- Do not make existing data globally visible through nullable compatibility.

### Phase 3 — backend platform services

- Add restricted client factories, typed scopes, returned-row assertions, request correlation, safe errors, audit/usage/rate-limit services, logger/metrics adapters, and architectural tests.
- Add durable job claim/fairness primitives co-designed with MT-SPEC-08.
- Stage behind configuration with fail-closed behavior where dependencies are incomplete.

### Phase 4 — domain adoption

- MT-SPEC-05 through MT-SPEC-08 add organization ownership and consume shared controls table by table/action by action.
- Replace local rate limit/upload session/log authority only when durable equivalents and migration tests pass.
- Preserve existing behavior through explicit Azar-only compatibility until MT-SPEC-10 cutover.

### Phase 5 — observability and recovery proof

- Configure dashboards/alerts and validate redaction/cardinality.
- Enable/verify PITR and backup monitoring.
- Perform isolated full restore and logical organization restore exercises.
- Reconcile synthetic external intents and prove tombstone/legal-hold behavior.
- Exercise all incident runbooks in staging/tabletop review.

### Phase 6 — closure

- Produce acceptance traceability, test evidence, query plans, recovery reports, alert screenshots/exports, and approvals.
- Keep Solar blocked until downstream domain SPECs and MT-SPEC-10 pass.

## Migration, compatibility, and rollback

### Additive migration

1. Add shared tables/functions/grants without routing production traffic through them.
2. Add nullable organization columns only during a bounded migration phase owned by each domain SPEC.
3. Inventory and assign verified Azar data; quarantine ambiguous records under MT-SPEC-10.
4. Add composite keys/FKs/indexes and validate them.
5. Make `organization_id` non-null for active rows.
6. enable/verify RLS and scoped repositories in shadow/dual-read tests.
7. Switch writes to atomic domain/audit/usage/outbox behavior.
8. Remove global/null compatibility only after evidence passes.

### Compatibility

- Existing SPEC-09 filesystem audits/local property logs remain historical compatibility artifacts only; no new multi-tenant authority may depend on them.
- Existing `contract_events`/`contract_submissions` remain domain history and link to generalized audit where required; they are not replaced by deleting history.
- `created_by_user_id` remains attribution.
- Existing global API keys, admin grants, insecure headers, fixed webhooks, and local maps are retired/bound by MT-SPEC-03/08/10 before Solar.
- During containment, production remains Azar-only.

### Rollback

- Migrations are forward-only; rollback uses reviewed corrective migrations or isolated restore, never destructive ad hoc reversal.
- Do not drop organization columns, composite constraints, audit rows, or tombstones to restore old behavior.
- Application rollback is allowed only to a version compatible with the new schema and containment rules.
- If scoped access cannot be proven, disable affected mutations/worker delivery and keep the second organization blocked.
- Any restore follows the recovery/reconciliation gate in this SPEC.

## Required tests

### Unit and contract tests

- Typed scope cannot be omitted from organization repository methods.
- Scope comes from trusted context, not request payload.
- Request-ID validation/generation/propagation.
- Safe error mapping and generic cross-organization not-found.
- Audit schema validation, action allowlist, size bounds, actor consistency, and redaction.
- No secret/token/path/content serialization in logs/audits/metrics.
- Rate-limit key composition, hashing, windows/cost, retry timing, and fail behavior.
- Usage idempotency, reservation/finalization/compensation, and quota decisions.
- Cursor encoding/validation/filter binding and stable ordering.
- Fair scheduling/backoff/dead-letter state transitions.
- Recovery manifest/checksum/tombstone/outbox reconciliation decisions.

### Real-database migration and security tests

- Clean migration and upgrade from representative current schema.
- Non-null ownership and quarantine gates.
- Composite unique/FK rejection for every relationship pattern.
- RLS allowed/denied operations for anonymous, active, removed, suspended, wrong-role, Azar, and Solar principals.
- `with check` organization-reassignment denial.
- Service-role explicit scoping and returned-row assertion.
- Scoped RPC missing/mismatched context denial.
- Function search path, ownership, volatility, and grants inspection.
- Append-only audit/usage enforcement.
- Atomic business/audit/usage/outbox commit and rollback.
- Concurrent optimistic updates, rate consumption, quota reservation, and job claims.
- Index/query-plan assertions on representative volume.
- Migration rerun/idempotency where required and no weakened grants.

### Backend integration tests

- Every protected test request receives request correlation.
- Cross-organization UUID operations return generic `404` with no side effect.
- Rate limits work across two independent application/limiter clients.
- `429` and safe `Retry-After` semantics do not enumerate targets.
- Required audit/limiter outage fails sensitive operations closed.
- Replayed idempotency keys do not duplicate domain/audit/usage/outbox state.
- Structured logs contain safe context and omit seeded secret/PII canaries.
- Service-role import/module allowlist test passes.
- List APIs enforce maximum page and stable cursor behavior.
- Mock provider/job tests use no real API and prove organization fairness/reconciliation.

### Recovery and operational tests

- Automated backup-age/PITR coverage check.
- Isolated full restore with schema, RLS, grants, checksums, row counts, audit continuity, holds, tombstones, revocations, and outbox validation.
- Logical Azar export cannot contain Solar fixture IDs/content and vice versa.
- Logical restore collision/remapping/activation checks.
- Restored completed/unknown outbox work cannot execute before reconciliation.
- Secret/config backup contains references/encrypted material only as approved, never plaintext in test output.
- Alert delivery and runbook/tabletop evidence for each required incident.

### Performance tests

- Bounded cursor pagination at empty, first, middle, last, concurrent-insert, and invalid-cursor boundaries.
- Organization-leading query plans avoid global scans for representative filters.
- Connection pool/timeout behavior under concurrent Azar/Solar traffic.
- Fair job claims under noisy-neighbor workload.
- Rate-limit store and audit append latency/failure behavior at expected peaks.

Automated tests use disposable local/staging resources and mock external providers. They never call production APIs, write production logs/audits, or restore over a live environment.

## Acceptance criteria

This SPEC is complete only when:

1. SPEC-25 policies, SPEC-26 organization contracts, and MT-SPEC-03 trusted context are approved and implemented sufficiently for these controls.
2. All thirty platform invariants are approved and traceable.
3. Every organization-owned table pattern requires non-null `organization_id` after bounded migration.
4. Composite parent keys and child foreign keys reject cross-organization relationships.
5. Organization-leading indexes and representative query plans are reviewed.
6. Repository interfaces require non-optional organization scope and expose no authenticated unscoped record/list mutation.
7. Every query/RPC/lock/mutation matches organization plus record and asserts returned scope.
8. Scoped database functions have safe search paths, schema qualification, restricted grants, actor/request context, and fail-closed tests.
9. RLS is deny-by-default on every applicable organization-owned table and passes Azar/Solar adversarial tests.
10. Service-role bypass is documented and its client construction/imports are contained to reviewed modules.
11. `audit_events` is append-only, organization-scoped, actor/request-attributed, schema-validated, and redacted.
12. Successful sensitive mutations atomically persist required domain, audit, usage, and outbox records.
13. Denied/failed privileged operations create safe durable security evidence without partial domain mutation.
14. Audit unavailability follows approved fail-closed behavior.
15. Raw secrets, tokens/hashes, signed URLs, paths, identity documents, customer payloads, and unnecessary PII are absent from general audit/log/metric outputs.
16. Every protected request has a bounded effective request ID propagated through asynchronous work.
17. Process-local production rate limits are replaced with an atomic distributed implementation.
18. Login, invitation, link, upload, submission, token, connection-test, retry, export, and support actions have reviewed layered rate policies.
19. Limiter failure behavior and non-enumerating `429`/`Retry-After` responses pass.
20. `usage_events` is append-only/idempotent and covers required seat/business/storage/link/delivery metrics.
21. Quotas restrict but never grant authorization; reservation/replay/compensation tests pass.
22. Shared worker/provider capacity has global/provider/organization bounds and fair claims.
23. Structured redacted logs replace console/local-file authority for new production operations.
24. Required metrics use bounded safe labels and all minimum alerts have owners/runbooks.
25. Organization list endpoints use bounded cursor pagination and SQL filtering.
26. Database pools/timeouts/lock behavior and representative query plans meet approved performance thresholds.
27. PITR and encrypted backup coverage match approved RPO/RTO/retention policy.
28. Secret-safe configuration backup and restore ownership are documented/tested.
29. Full restore succeeds in isolation and validates schema, RLS, grants, ownership, audit, holds, tombstones, revocations, and jobs before traffic.
30. Logical organization export/restore proves Azar/Solar separation, integrity, and safe activation.
31. Restored external work cannot replay before stable-identifier reconciliation.
32. Cross-organization, credential, provider-routing, migration, recovery, and infrastructure-outage runbooks are approved/exercised.
33. Real disposable-database tests cover RLS, service-role scope, constraints, concurrency, distributed limits, quota, and job claims.
34. No production test calls real external APIs or writes authoritative production state.
35. Existing contract/property behavior remains contained and later domain SPEC ownership is preserved.
36. Null/global compatibility, global API/admin paths, fixed webhooks, and local authority are blocked from any second organization.
37. Canonical architecture, environment, API, testing, engineering, privacy/retention, observability, backup/restore, and incident docs are updated.
38. A traceability matrix links every criterion to migration, code, tests, docs, operational evidence, and reviewer.
39. `git diff --check`, backend/frontend verification, migration tests, security tests, and documentation checks pass.
40. Security, data, backend, operations/SRE, privacy/legal, and product owners approve completion.

## Completion gate and handoff

Passing SPEC-28 means reusable database/operational controls exist and are proven. It does not mean every business domain is migrated.

MT-SPEC-05 through MT-SPEC-08 may complete only when they:

- use the scoped repository/RPC patterns;
- add non-null organization ownership and composite constraints;
- apply/test RLS and service-role assertions;
- write required audit/usage/outbox evidence atomically;
- use distributed abuse controls and bounded pagination;
- emit safe correlated telemetry;
- define restore/reconciliation behavior for their records/provider effects; and
- pass Azar/Solar negative tests.

Solar remains blocked until these controls are consumed by all live domains and MT-SPEC-10 completes cutover.

## Required deliverables

- Approved SPEC-28 / MT-SPEC-04.
- Shared ownership/index/constraint/RLS/RPC engineering standard.
- Forward migrations for shared cross-cutting tables/functions/grants.
- Restricted service-role client boundary and architectural enforcement tests.
- Typed organization-scoped repository contracts.
- Append-only audit service/schema/action registry/redaction policy.
- Distributed limiter provider and policy registry.
- Idempotent usage/quota ledger and metric registry.
- Fair job-claim/concurrency contract for MT-SPEC-08.
- Structured logging/metrics adapters, dashboards, alerts, and owners.
- Disposable real-database security/concurrency/performance harness.
- PITR/backup policy, backup monitoring, full and logical restore procedures.
- Tombstone/legal-hold/revocation/outbox validation and reconciliation tooling/contracts.
- Six required incident runbooks and exercise evidence.
- Canonical documentation updates and acceptance traceability.

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

Focused checks must also classify every match rather than blindly accepting/rejecting it:

```bash
rg -n "SUPABASE_SERVICE_ROLE_KEY|createClient" backend/src
rg -n "new Map|console\\.|logs/|writeFile" backend/src
rg -n "security definer|search_path|grant execute|enable row level security|create policy" supabase/migrations
rg -n "organization_id|created_by_user_id|assigned_to_user_id" backend/src supabase/migrations
rg -n "CONTRACTS_API_KEY|CONTRACT_ADMIN_USER_IDS|X-Authenticated-User-Id|X-User-Id" backend/src frontend/src
rg -n "token|signed.*url|storage.*path|authorization|cookie" backend/src
```

Expected historical/contained matches require documented disposition. No root `package.json` or `docs:check` script currently exists, so until one is added, documentation verification consists of required-section review, reference/path validation, Markdown checks, `git diff --check`, and the backend/frontend commands above.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| RLS creates false confidence while service role bypasses it | Mandatory scoped repositories/RPCs, returned-row assertions, import boundaries, and service-role negative tests |
| Developer forgets organization filter | Non-optional typed scope, composite constraints, architectural tests, SQL/RPC review |
| Composite schema becomes inconsistent | Reusable migration patterns and real-database relationship tests |
| Audit leaks sensitive customer content | Allowlisted schemas/fields, size bounds, pre-sink redaction, canary tests, restricted evidence class |
| Audit outage blocks important work | Approved per-action availability policy, monitoring, fail-closed high-risk operations |
| Distributed limiter becomes availability bottleneck | Atomic reviewed backend, health/latency alerts, explicit fail policy, local emergency ceiling only when approved |
| High-cardinality rate/metrics data grows without bound | HMAC subjects, expiry cleanup, bounded labels, retention and capacity monitoring |
| Usage replay double-counts | Unique logical idempotency keys and append-only compensations |
| Noisy organization starves others | Per-organization/provider concurrency and fair scheduling |
| Query indexes increase write cost | Evidence-based index set and representative plan/write tests |
| Backup exists but cannot restore | Scheduled isolated restore drills with closure evidence |
| Restore replays provider side effects | Paused jobs and stable-ID/idempotency reconciliation before workers/traffic |
| Restore resurrects deleted/revoked access | Tombstone, hold, organization/session/key validation before activation |
| Local compatibility remains authoritative | Explicit containment and domain-by-domain retirement gate before Solar |
| Incident response is improvised | Named owners, severity/notification decisions, exercised runbooks |

## References

### Multi-tenant source documents

- `docs/09-roadmap/specs/research/23-RESEARCH-multi-tenant-saas-architecture.md`
- `docs/09-roadmap/specs/research/24-RESEARCH-multi-tenant-saas-specification-roadmap.md`
- `docs/09-roadmap/specs/pending/25-SPEC-multi-tenant-policy-threat-model-containment-and-inventory.md`
- `docs/09-roadmap/specs/pending/26-SPEC-multi-tenant-organizations-memberships-onboarding-and-lifecycle.md`

### Previous project SPECs used for behavior and format

- `docs/09-roadmap/specs/completed/09-SPEC-contract-generation.md`
- `docs/09-roadmap/specs/completed/10-SPEC-contract-generation-reworked.md`
- `docs/09-roadmap/specs/completed/13-SPEC-contract-generation-reworked.md`
- `docs/09-roadmap/specs/completed/14-SPEC-contract-generation-reworked.md`
- `docs/09-roadmap/specs/completed/16-SPEC-contract-generation-reworked.md`
- `docs/09-roadmap/specs/completed/17-SPEC-contract-generation-reworked.md`
- `docs/09-roadmap/specs/completed/19-SPEC-contract-generation-reworked.md`
- `docs/09-roadmap/specs/pending/22-SPEC-contract-management-ui-and-access-control.md`

### Repository guidance and canonical documentation

- `references/llm-guide.md`
- `references/documentation-structure-guide.md`
- `docs/01-overview/project-overview.md`
- `docs/01-overview/architecture.md`
- `docs/02-setup/environment.md`
- `docs/03-operation/runtime-files.md`
- `docs/05-integrations/api-contracts.md`
- `docs/06-testing/testing-strategy.md`
- `docs/07-development/engineering-standards.md`

---

Status: pending prerequisite specifications plus security, data, backend, operations/SRE, privacy/legal, and product approval. Author: redacted.
