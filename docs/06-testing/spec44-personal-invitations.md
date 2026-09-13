# SPEC-44 verification

Implemented and verified locally on 2026-09-12 with Node 22.20, PostgreSQL 16.15, PostgREST 16.3 and Chromium. The browser harness uses production session, authorization, provisioning, invitation, rate-limit and persistence services with real SQL RPCs. Only the Auth provider boundary is controlled: synthetic accounts/passwords replace hosted Auth calls. The migration was subsequently applied to the development Supabase branch as recorded below. Application deployment and external invitation delivery were not performed.

## Results

| Check | Result |
| --- | --- |
| Backend full suite | 342 passed, 0 failed, 16 database-dependent cases skipped in that invocation |
| Frontend unit/integration | 232 passed across 30 files |
| Final focused backend/frontend checks | 5 backend and 43 frontend cases passed, including the closed issuance gate, continued recovery and stale identity responses |
| Real PostgreSQL assertions | Passed: authorization, scoped identity provisioning, profile constraints, acceptance rollback, isolation, recovery, rotation/revocation, suspension and grants |
| Concurrent PostgreSQL connections | 3 passed: duplicate issuance, duplicate acceptance, revocation versus acceptance |
| Upgrade from the prior schema | 1 passed: existing membership rows preserved, new fields null, property guard and private-function grants intact |
| Existing SPEC-40/42/43 SQL regressions | All three scripts passed against the SPEC-44 schema |
| Browser | 6 passed: new and existing accounts, member/owner issuance, admin rotation/revocation, persisted profile after login, suspension and exclusive navigation at 1280×800, 390×844 and 320×740 |
| Static/build checks | Backend typecheck/build, frontend lint/build and `git diff --check` passed; existing Vite main-bundle size advisory remains |
| Visual checks | Login, invitation dialog and narrow personal Inicio inspected; no browser errors or Vite overlay |

The five SPEC-44 database-dependent tests skipped in the ordinary backend run were executed separately and passed. The other eleven skipped cases belong to existing environment-gated suites; they are not counted as passed. Existing role/invitation/request compatibility was also verified through the three SQL regression scripts above. Browser screenshots are generated in `frontend/test-results/` and contain synthetic data only.

## Acceptance coverage

| SPEC criteria | Evidence |
| --- | --- |
| 1–3: role and invitation authority | Capability registry version 7; personal has only `personal.home.read`; member has scoped invitation authority without `members.invite`; service, HTTP and SQL deny other roles, forged fields and general governance access. |
| 4–5: onboarding and membership profile | New and existing accounts accept after entering all three fields; SQL verifies Unicode/text validation, rollback on audit failure, old-adapter rejection, separate A/B profiles and unchanged global identity. Concurrent acceptance cannot edit an already committed profile. |
| 6–8: exclusive Inicio and redirects | Confirmed role/capability/destination required before mounting screens. Network assertions reject product requests; Inicio contains only its heading within the shared session/logout shell. |
| 9: lifecycle and isolation | Foreign organizations, removed/suspended memberships, inactive organizations, stale responses and account/context changes fail closed; accepted-handoff recovery does not reactivate a later suspension. |
| 10: compatibility | Full ordinary suites plus real SPEC-40/42/43 SQL regressions; additive upgrade preserves prior memberships and property guards. |
| 11–12: presentation and scope | Keyboard/focus, no overflow or console errors at three viewports; no personal property assignment, requests or profile editing surface. |

## Reproduce

Run ordinary checks from the repository root:

```bash
npm --prefix backend test
npm --prefix backend run typecheck
npm --prefix backend run build
npm --prefix frontend test
npm --prefix frontend run lint
npm --prefix frontend run build
git diff --check
```

Use empty, disposable UTF-8 PostgreSQL databases on loopback named `spec44*`. The standalone setup creates minimal Auth, Storage and migration-inventory boundaries and applies the actual application dependency migrations. It refuses an existing public/Auth schema or another database name. A native Supabase test instance must use its existing provider schemas instead of this standalone setup. `SPEC44_PSQL` optionally specifies the psql executable for the Node tests.

```bash
psql "$SPEC44_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/spec44_setup.sql
(cd backend && npx tsx --test tests/integration/spec44-database.test.ts)
psql "$SPEC44_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/spec40_inquilino_role.sql
psql "$SPEC44_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/spec42_property_invitations.sql
psql "$SPEC44_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/spec43_arrangement_requests.sql
```

Export the named database variables before invoking Node. Those assertions roll back their fixtures. Concurrency tests use a separate database with persisted fixtures:

```bash
psql "$SPEC44_CONCURRENCY_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/spec44_setup.sql
psql "$SPEC44_CONCURRENCY_DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/tests/spec44_browser_fixtures.sql
(cd backend && npx tsx --test tests/integration/spec44-database-concurrency.test.ts)
```

The upgrade test requires another empty database with SPEC-44 initially omitted. It seeds historical memberships, applies the new migration, and compares the result:

```bash
psql "$SPEC44_UPGRADE_DATABASE_URL" -v ON_ERROR_STOP=1 -v spec44_before_upgrade=1 -f supabase/tests/spec44_setup.sql
(cd backend && npx tsx --test tests/integration/spec44-migration-upgrade.test.ts)
```

For the browser, prepare a separate fresh database and start PostgREST on loopback with a synthetic JWT secret of at least 32 characters:

```bash
psql "$SPEC44_BROWSER_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/spec44_setup.sql
psql "$SPEC44_BROWSER_DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/tests/spec44_browser_fixtures.sql
PGRST_DB_URI="$SPEC44_BROWSER_DATABASE_URL" PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon \
  PGRST_JWT_SECRET="$SPEC44_TEST_JWT_SECRET" PGRST_SERVER_HOST=127.0.0.1 PGRST_SERVER_PORT=55444 postgrest
```

In separate terminals, start the API and frontend, then run the tests:

```bash
(cd backend && npx tsx tests/fixtures/spec44-browser-server.ts)
DEV_API_TARGET=http://127.0.0.1:3002 VITE_SUPABASE_URL=https://pkce-test.supabase.co \
  VITE_SUPABASE_ANON_KEY=public-test-key npm --prefix frontend run dev -- --host 127.0.0.1 --port 4173
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npm --prefix frontend run test:e2e -- \
  personal-invitations.spec.ts personal-navigation.spec.ts --workers=1
```

Export `SPEC44_TEST_JWT_SECRET` for both the API and PostgREST and `SPEC44_BROWSER_DATABASE_URL` for Playwright. `SPEC44_POSTGREST_URL` optionally overrides the default `http://127.0.0.1:55444`. Fixture users such as `member@example.test`, `owner@example.test` and `personal@example.test` use `spec44-test-password`. The fixture-only Auth RPC lives in the test SQL, never the production migration. Reset the browser database and restart the API before repeating the existing-account onboarding case: those tests persist acceptance/suspension and the provider's password registry lives in memory.

## Rollout and recovery

1. Inspect the target migration history and confirm SPEC-42/43 dependencies. Apply only `20260912150000_spec44_personal_invitations.sql`. This is complete for development `multi-tenant` as recorded below; other targets still require their own inventory.
2. Deploy the compatible backend and frontend with `PERSONAL_INVITATIONS_ENABLED=false` (the default). Backend acceptance now uses the new RPC for all roles, so the schema must precede the backend. Check ordinary invitations and inquilino/property/request flows before opening issuance.
3. Retain the existing provisioning and invitation-delivery configuration. Enable `PERSONAL_INVITATIONS_ENABLED=true` only after hosted new/existing-account smoke tests are ready to run. The effective context omits the scoped invitation capability while the gate is closed.
4. If issuance must stop, close that gate while retaining this compatible backend/schema. Acceptance of existing invitations, personal access and authorized link rotation/revocation remain supported. Do not downgrade to a backend that rejects persisted `personal` roles or delete profile columns to roll back.

Development migration is complete. Application deployment, hosted Auth/Google and configured email-provider smoke tests remain pending. Local browser evidence covers password registration/login with the controlled provider; it does not certify those external integrations.


## Development migration and configuration — 2026-09-12

The user authorized applying the migration to the development Supabase branch and enabling personal invitations. A fresh Supabase branch lookup confirmed persistent, non-default `multi-tenant` (`kcobkbtieyowdmsvtsvv`, parent `kjnwiwvwuavurbgovmlt`), matching the linked project and both applications' local database configuration.

Applied `20260912150000_spec44_personal_invitations.sql`, SHA-256 `738fb4ac5f9c7f10d57a70a0792940e28d7b289302ea0a3d90c3a4f22012bd62`, using Supabase CLI 2.111.0. The isolated migration directory contained the 41 existing migrations and exactly SPEC-44. Dry-run and application selected only this migration; the unrelated pending `20260817190000_retire_legacy_contract_webhook.sql` remained excluded. Existing branch credentials connected through pooler port 6543 after temporary-login initialization stalled. Repository connection metadata was preserved.

Read-only post-application verification confirmed:

- The prior 41 migration versions/names are unchanged, with only SPEC-44 added (42 total). The final isolated dry run reports the database up to date.
- All 15 installed/replaced function bodies match the source migration, with the expected security modes, fixed `pg_catalog` search paths and public/browser/service execution grants. Private acceptance/provisioning helpers remain inaccessible to `service_role`.
- Forced RLS is enabled on memberships, invitations and personal invitation operations. Browser table access remains denied; the new operation table has no direct service read/write grants.
- The three nullable text profile columns and all ten relevant validated constraints exist, including required complete profiles for personal, no personal property association, and operation scope/idempotency constraints. The existing SPEC-42 property guard remains installed.
- Counts remain one membership, one property, zero invitations and zero orders. Membership and invitation digests match the preflight snapshot. No personal memberships, profile values, operations, test fixtures or fixture Auth RPC were created.

Set `PERSONAL_INVITATIONS_ENABLED=true` in the ignored local `backend/.env`, which points to this development branch. Existing `IDENTITY_PROVISIONING_ENABLED=true`, `INVITATION_ROUTES_ENABLED=true` and `INVITATION_DELIVERY_METHOD=share_link` were preserved. Loading that environment through the backend's configuration validators passed. No development backend process was running; the setting takes effect on its next start. Code defaults and `.env.example` remain disabled for other environments.

This execution changed the development database and local backend configuration. Vercel environment variables and application deployments were not changed. Hosted application/provider smoke tests remain pending.
