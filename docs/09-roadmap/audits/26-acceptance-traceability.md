# SPEC-26 acceptance traceability

Status: implementation evidence recorded 2026-08-18; approval and disposable
database certification remain open.

| Acceptance criteria | Implementation evidence | Automated evidence | Status |
|---|---|---|---|
| 1–2 policy, terminology, invariants | SPEC-25 decision record; SPEC-26 | Review/sign-off | Pending named approval |
| 3–11 governance schema, constraints, RLS | SPEC-26 migration | Migration contract test | Static pass; real DB pending |
| 12–14 capabilities and visibility | capability/settings services | Governance unit test | Pass |
| 15–16 atomic/platform-only creation | creation RPC and service | Migration contract test | Static pass; real DB pending |
| 17–18 invitation lifecycle/no owner invite | invitation schema/RPC, tokens, disabled delivery | Unit/migration tests | Mounted behind SPEC-27; real delivery provider certification pending |
| 19–22 hierarchy, owner, membership history | constraints/trigger and membership service | State/last-owner unit tests | Concurrency certification pending |
| 23–25 lifecycle/export/deletion/hold | lifecycle tables/service/runbook | Receipt fail-closed contract | Safely staged |
| 26–28 branding, plan, naming | validation/settings services and types | Validation unit tests | Pass |
| 29–30 API context/isolation | protected routes mounted behind current membership/capability and CSRF/Origin checks | SPEC-27 route/context tests | Real database/browser isolation pending |
| 31 frontend governance states | organization components/pages, fragment flow | Build/lint | Browser/axe tests pending |
| 32 test suites | backend/frontend suites | Verification handoff | Real DB pending |
| 33–35 docs, traceability, no production seed | canonical docs; this matrix; empty migration | Diff/static review | Implemented |
| 36 multidisciplinary approval | protected approval record | N/A | Pending |

The SPEC remains in `specs/pending/` until every pending item is resolved.
Repository implementation does not authorize Solar or weaken the SPEC-25
Azar-only boundary.
