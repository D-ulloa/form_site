# SPEC-45 — Verification

Implementation and functional verification were completed locally. Both migrations were subsequently applied to the development Supabase branch, as recorded below. Application deployment, live Google OAuth and hosted Storage verification remain pending.

## Reproducible database fixtures

Use disposable loopback PostgreSQL databases whose names start with `spec45`. `supabase/tests/spec45_setup.sql` creates the prerequisite schemas and migrations. Load `supabase/tests/spec45_browser_fixtures.sql` once afterward. For upgrade testing, pass `-v spec45_before_upgrade=1` to setup, then load the same fixtures before running the upgrade test. A fresh upgrade database is required for each run.

```bash
psql "$SPEC45_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/spec45_setup.sql
psql "$SPEC45_DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/tests/spec45_browser_fixtures.sql
psql "$SPEC45_UPGRADE_DATABASE_URL" -v ON_ERROR_STOP=1 -v spec45_before_upgrade=1 -f supabase/tests/spec45_setup.sql
psql "$SPEC45_UPGRADE_DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/tests/spec45_browser_fixtures.sql
npm --prefix backend test
npm --prefix backend run typecheck
npm --prefix backend run build
npm --prefix frontend test
npm --prefix frontend run lint
npm --prefix frontend run build
git diff --check
```

Set `SPEC45_PSQL` when the PostgreSQL executable is not on PATH. Database tests skip without their database URLs; the default unit suite alone is insufficient evidence. Concurrent tests commit synthetic rows: use fresh seeded databases for a complete repeat.

## Browser fixture

Serve a fresh `spec45` database through loopback PostgREST with a synthetic service-role JWT secret. Start `backend/tests/fixtures/spec45-browser-server.ts` twice using `tsx`: `SPEC45_API_PORT=3002` and `3003`, with the same `SPEC45_POSTGREST_URL` and `SPEC45_TEST_JWT_SECRET`. Start Vite on `127.0.0.1:4173` with `DEV_API_TARGET=http://127.0.0.1:3002`. The fixture has controlled identity-provider and Storage implementations; session security, repositories, RPCs, versioning and assets verification use application code and PostgreSQL.

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npm --prefix frontend run test:e2e -- personal-assignments.spec.ts --workers=1
```

Set `SPEC45_BROWSER_DATABASE_URL` and `SPEC45_PSQL`. Test-only passwords and OAuth tokens are defined in the fixture; never deploy it. The Google case exercises the application's Google session and invitation acceptance through a controlled provider boundary, not Google's hosted consent/callback service.

## Coverage

| Acceptance criteria | Evidence |
| --- | --- |
| 1–2: assigned-only personal reads | SQL role/scope/ID tests; HTTP filter tests; separate personal A/B browsers; cursor audience/membership tests |
| 3–6: assignment, rejection, state invariants | SQL no-op/conflict/transition tests; legacy status adapter; UI assignment/rejection and second-page removal |
| 7: shared automatic updates | Independent browser contexts; second backend process performs reassignment; commit-to-visible timing; offline/focus recovery |
| 8–9: new and historical tenant onboarding | SQL old-adapter rejection, audit rollback and recovery; upgrade of null-contact tenants and pre-upgrade draft; reactivation; browser new/existing/Google-session paths |
| 10: requester privacy | Strict manager/personal/viewer/tenant DTOs; co-tenant SQL reads; absent PII in audit and revision signals; independent A/B phone values |
| 11: current authorization and files | SQL reassignment denial; real verified PNG upload/download; revoked file route; suspension race; aborted stale response regression; stream renewal without idle extension and revocation |
| 12: concurrent writes and atomicity | Two assignments, reassignment/rejection, assignment/suspension, two phone acceptances, injected audit failure, and UI conflict refresh without automatic write retry |
| 13–14: compatibility and UI | Existing suites plus SPEC-45 fixtures; personal navigation restrictions; 1280×800, 390×844 and 320×740 captures and overflow checks |

## Results

Verified locally on 2026-09-12:

- Backend: 356 passed, 0 failed, 16 skipped out of 372 tests. All five SPEC-45 database tests ran against fresh disposable PostgreSQL databases, including upgrade and concurrent transactions. The skips belong to other opt-in database suites whose environment variables were not supplied.
- Frontend: 240 tests passed across 31 files, including conflict recovery for assignment/removal/rejection and stale response cancellation. The affected dashboard and navigation checks were rerun after the React key correction.
- Backend typecheck/build, frontend build/lint, and `git diff --check` passed. Vite reports the existing large-bundle warning.
- Browser: all five SPEC-45 cases passed using real application routes/RPCs and separate browser sessions. Three personal navigation, three tenant navigation, and five arrangements navigation cases passed, for 16 distinct passing cases across the runs. The optional SPEC-40 database-backed onboarding case was skipped; this run does not replace its separate integration evidence.
- The complete assignment flow was rerun with closure and timing assertions: assignment **776 ms**, reassignment through a second backend process **759 ms**, rejection **415 ms**, and closure **483 ms**, each within the 2-second local acceptance threshold. Offline recovery and removal from an already-loaded second page passed.
- Personal/manager captures and overflow checks cover 1280×800, 390×844, and 320×740. Browser console checks passed. The navigation run identified and verified a correction to duplicate React sibling keys in the arrangements page.

The local run logs and six populated dashboard captures are retained under `/tmp/spec45-work/` (`browser-evidence/` for captures); these are disposable workspace artifacts, not committed test dependencies. The source fixtures above reproduce the checks.

The 60-second signed download TTL is verified from the issuing service and exercised with the local Storage fixture. Hosted TTL enforcement, service streaming configuration, production permissions and live OAuth remain deployment checks in the [runbook](../03-operation/spec45-personal-assignments-runbook.md).

## Development migrations — 2026-09-12

The user authorized applying the SPEC-45 migrations to the development Supabase branch. A fresh branch lookup confirmed healthy, persistent, non-default `multi-tenant` (`kcobkbtieyowdmsvtsvv`, parent `kjnwiwvwuavurbgovmlt`), matching the repository link and both applications' local Supabase URLs. Post-application verification completed at `2026-09-13 01:45 UTC` (`2026-09-12` in America/Caracas).

Applied in order using Supabase CLI `2.111.0`:

| Migration | SHA-256 |
| --- | --- |
| `20260912160000_spec45_tenant_contact.sql` | `56d7524047c939ba70f6d711b35d1bfd71d5ec4107a467c427f23a45514ed0bb` |
| `20260912170000_spec45_personal_assignments.sql` | `d31e794a0cfb3bb96a6b8a4c2f90c2b36d4d47e3d4f0e0025f5d7e63e50a6da8` |

An isolated migration directory contained the 42 existing versions and only these two additions. Both the dry run and application selected exactly SPEC-45; the unrelated pending `20260817190000_retire_legacy_contract_webhook.sql` remained excluded. The existing branch credential connected through pooler port 6543 after CLI temporary-login initialization stalled. No project relinking or credential/configuration changes were required.

Read-only verification confirmed:

- All 42 prior migration versions/names remain unchanged, with exactly two added (44 total). The final isolated dry run is up to date.
- All 15 installed/replaced function bodies match the source, including security modes, fixed `pg_catalog` search paths and execution grants. Browser/public execution is denied, and private acceptance/projection helpers and the old compatibility dispatcher remain inaccessible to `service_role`.
- Forced RLS and denied browser table reads remain in place for memberships, invitations, orders and scope revisions. The scope revision table also denies direct service reads/writes.
- The three nullable columns, five validated constraints, three enabled triggers and valid personal assignment index are present. The phone validator accepts the valid synthetic format and rejects a short value.
- Counts remain one membership, one property, zero invitations and zero orders. Membership, invitation and order digests match the preflight snapshot. No tenant/personal membership, contact value, assignment, revision row or fixture function was created.

Sanitized execution logs and catalog snapshots are retained under `/tmp/spec45-development-migration/`. This execution applied database migrations only. Application deployments, rejection rollout flags and hosted application/provider smoke tests were not changed or completed; follow the [runbook](../03-operation/spec45-personal-assignments-runbook.md) for those steps.
