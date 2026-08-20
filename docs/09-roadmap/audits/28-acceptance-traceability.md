# SPEC-28 acceptance traceability

Status: repository evidence recorded 2026-08-18. SPEC-27 repository activation is complete;
disposable real-database certification, provider configuration, restore drills,
alert exports, and multidisciplinary approval remain open.

| Acceptance criteria | Implementation evidence | Automated/operational evidence | Status |
|---|---|---|---|
| 1–2 prerequisites and invariants | SPEC-25/26 docs; SPEC-27 implementation; SPEC-28 | Review/sign-off | Named approvals and production evidence pending |
| 3–5 ownership, composite constraints, indexes/plans | SPEC-28 migration shared patterns | Migration contract test | Static pass; representative real plans pending |
| 6–7 scoped repositories/RPCs/returned scope | `platform/scope.ts`, platform repository | Platform-control unit tests | Shared layer pass; domain adoption pending |
| 8–10 safe functions, RLS, service-role containment | migration; service-role factory; architecture standard | Migration/architecture tests | Static pass; real DB and legacy constructor retirement pending |
| 11 append-only audit | migration; `platform/audit.ts`; redaction | Migration/unit canary tests | Pass for shared layer; retention approval pending |
| 12–14 transaction/audit failure semantics | usage/audit RPC/service contracts | Rollback/fail-closed unit/static tests | Domain atomic adoption and real DB proof pending |
| 15 telemetry privacy | `platform/redaction.ts`; standards | Seeded canary unit test | Pass for new platform layer |
| 16 request correlation | request-ID middleware installed before parser | Unit/static installation checks | Pass; async domain propagation pending |
| 17–19 distributed limiting/policies/failure | limiter table/RPC, policy registry, service | Two-client/fail-closed tests | Organization RPC pass statically; real concurrency and platform-login store pending |
| 20–21 usage and quota | usage table/RPC, snapshots/reservations, registry/service | Idempotency/quota tests | Shared contract pass; reservation RPC/domain metrics pending |
| 22 fair shared capacity | jobs table/RPC and job utilities | Fairness/backoff/dead-letter tests | Static/unit pass; provider/worker adoption pending |
| 23–24 logs, metrics, alerts | redacting logger; runbook label/alert contract | Canary test; configuration checklist | Sink/dashboard/alert exports and owners pending |
| 25 pagination | signed cursor codec and page bounds; API standard | Cursor/filter/tamper tests | Shared contract pass; domain list adoption pending |
| 26 pools/timeouts/performance | engineering/runbook gates | Planned disposable load/query-plan evidence | Pending environment thresholds and proof |
| 27–31 PITR, backup, restore, tombstones, reconciliation | tombstone/recovery tables, manifest/reconciliation utilities, runbook | Manifest/reconciliation tests | Code/contract pass; provider PITR and drills pending |
| 32 six incident runbooks | consolidated SPEC-28 operations runbook | Tabletop evidence location defined | Exercises/owners pending |
| 33–34 disposable security tests/no production calls | backend static/unit suites; testing standard | Backend suite uses fakes/files only | Real DB harness pending; no external calls in suite |
| 35–36 compatibility/second-organization block | architecture and containment docs | Existing regression suite | Pass; Solar remains blocked |
| 37 canonical docs | architecture, environment, API, testing, engineering, runtime, runbook | Path/Markdown/diff review | Implemented |
| 38 traceability | this matrix | Review | Implemented; external evidence links pending |
| 39 verification | repository commands | Test/build/lint/diff outputs | See implementation handoff |
| 40 approvals | protected release record | N/A | Pending all named disciplines |

## Legacy inventory disposition

Existing service-role constructors, process-local submission/upload maps,
filesystem audit/property logs, console metrics, direct providers, global API
keys/admin lists, identity headers, and the historical fixed-webhook migrations
are classified compatibility surfaces. SPEC-28 does not silently rewrite their
domain behavior: SPEC-27 and SPEC-29 through SPEC-34 must migrate or remove them
before Solar. The active fixed webhook trigger remains disabled by the SPEC-25
forward migration.

The SPEC remains in `specs/pending/` until every pending item above is resolved.
Repository implementation does not authorize production activation.
