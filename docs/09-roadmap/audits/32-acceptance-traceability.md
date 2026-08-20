# SPEC-32 acceptance traceability

Status: additive repository implementation evidence, 2026-08-19. SPEC-27's repository context gate is satisfied; final completion remains gated by SPEC-34, policy approvals, real-database/provider certification, production inventory, and cross-functional approval.

| Scope | Implementation evidence | Automated evidence |
|---|---|---|
| Tenant persistence | `20260819200000_spec32_multitenant_integration_outbox.sql` adds seven organization-owned relations, composite FKs, tenant-leading indexes, forced RLS, restricted grants, and safe projection | `spec32-migration-contract.test.ts` |
| Secret boundary | Versioned opaque references plus AES-256-GCM helper with organization/integration/type/version AAD and memory cleanup; no plaintext SQL field | `spec32-integrations.test.ts` |
| Registry and projections | Closed provider/purpose pairs, strict destination schemas, masked response projection | backend and frontend SPEC-32 unit tests |
| Outbox and fanout | Immutable, bounded event payloads; idempotent enqueue and deterministic active-integration fanout | migration contract tests |
| Worker safety | Fair organization scheduling, atomic `skip locked` claims, random leases, token/version transitions, bounded retry and unknown-to-reconciliation behavior | migration and domain unit tests |
| Provider isolation | Exact organization/integration/provider/purpose, Drive parent/private ACL, Sheet receipt and stable marker guards | provider guard unit tests |
| Webhook security | Exact-body HMAC, payload bound, HTTPS/443, private/reserved IPv4/IPv6 and mixed-DNS denial; redirect/connect-time enforcement remains adapter certification | webhook unit tests |
| Browser safety | Organization/epoch-first keys, stale-response rejection, safe projection canaries, write-only secret clearing | `integrationState.test.ts` |
| Operations | Runbook covers configuration, health, claims, ambiguity, dead letters, rotation, disconnect, deletion, restore, incidents, and cutover boundary | documentation review |

## Acceptance groups and remaining gates

- Criteria 2–7, 12–19, 25: implemented persistence/domain boundary and static tests. Real Postgres RLS, concurrency, crash, lease-expiry, and fairness certification remains required.
- Criteria 8–11, 20–23: registries, guards, signing, SSRF primitives, and fake tests are present. Organization-separated staging Drive/Sheets/Make resources, live ACL/schema/receipt checks, approved egress/rebinding control, and credential-store certification remain required.
- Criteria 24 and 35: safe frontend state contracts exist; mounted settings/delivery UI waits for SPEC-27 trusted request context.
- Criteria 26–28: resource/receipt relations and operations contract exist; numeric retention, live cleanup, metrics/alerts, secret-manager recovery, and full restore exercise remain outstanding.
- Criteria 29–34, 37, 39: legacy direct calls/global variables/fixed-trigger history are contained, not cut over by this additive work. SPEC-34 owns inventory, trigger/direct-call retirement, Azar migration, staging attack certification, and any Solar enablement.
- Criteria 1, 36, 38, 40: prerequisites, canonical documentation, this evidence map, and implementation are present; named policy and cross-functional approvals are not.

This implementation creates no provider resource, stores no real credential, calls no provider in automated tests, changes no production ACL/trigger, and authorizes no second organization. The pending SPEC remains pending until every external gate is evidenced.
