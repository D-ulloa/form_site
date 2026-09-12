# SPEC-39 verification

Verified locally on 2026-09-10. The dashboard reads persisted orders through the
organization API, the production repository, PostgREST, and PostgreSQL. Authentication
and rate-limit storage use controlled test adapters in the browser harness; the
production session service and capability checks execute normally. This is local
implementation evidence, not a production migration or hosted Supabase certification.

After SPEC-40, the current regression suite still exercises this dashboard for the
four internal roles (`owner`, `admin`, `member`, `viewer`) and explicitly keeps
`inquilino` outside `arrangements.read`. The central organization boundary redirects
an inquilino before the dashboard mounts; the API remains independently protected.

Current regression update, 2026-09-12: SPEC-42 replaces the inert property action
with a creation dialog for owner/admin and hides it for member/viewer. Order
filtering/navigation remain covered. The historical SPEC-39 browser harness
supplies an empty controlled property collection while retaining real persisted
orders. See [SPEC-42 verification](spec42-property-invitations.md) for the current
property flow and test results; the inert-button evidence below is historical.

## Automated checks

Run from the repository root:

```bash
npm --prefix backend test
npm --prefix backend run typecheck
npm --prefix backend run build
npm --prefix frontend test
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:e2e -- tests/e2e/arrangements-navigation.spec.ts
```

The implementation run passed 313 backend tests and 147 frontend tests. Both builds,
backend type checking, frontend lint, and `git diff --check` passed. Vite still reports
the existing large main-bundle advisory. The five navigation/browser tests cover
1280×800, 390×844, and 320×740, native keyboard filtering, visible focus, direct
navigation, reload, `Inicio`, and zero requests/navigation on click, Enter, or Space
on `Generar propiedad`.

## Real database assertions

Use a disposable PostgreSQL/Supabase database, never a production database. The
SQL test inserts scoped fixtures in a transaction and rolls them back. It requires
the organization schema from SPEC-26 and the new SPEC-39 migration:

```bash
psql "$SPEC39_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/spec39_arrangement_orders.sql
```

The test checks four persisted columns, FK/blank-value constraints, forced RLS,
browser table/RPC denial, read-only service grants, organizations A/B, excluded
closed/unknown statuses, empty filters, complete status options outside the first
page, and bounded non-overlapping UUID pagination.

For a standalone empty PostgreSQL cluster, this is the minimum setup used locally
(roles are cluster-wide, so use a separate cluster). A disposable Supabase instance
already supplies these roles and Auth objects; do not recreate them there.

```sql
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key);
```

Apply `supabase/migrations/20260818120000_spec26_organization_governance.sql`, then
`supabase/migrations/20260910120000_spec39_arrangement_orders.sql` with
`psql -v ON_ERROR_STOP=1 -f <file>`. This standalone setup validates the real
organization schema and the new migration, with only Auth's referenced user table
stubbed; it does not apply unrelated historical integrations or providers.

## Browser through the real repository and database

The local run used PostgreSQL 16.15 and PostgREST 14.18. Prerequisites are the
disposable database above, `psql`, and a local PostgREST executable. Keep ports
3001, 4173, and 55440 free. Set `SPEC39_TEST_DATABASE_URL` to the disposable cluster
connection URI and `SPEC39_TEST_JWT_SECRET` to a test-only string of at least 32
characters. Use the same secret for both PostgREST and the test server.

Load the browser fixtures once in the fresh disposable database. They include
organizations with initial owners, 27 open orders for A (one `in_progress` outside
the first page), a closed order for A, and an order visible only to B:

```bash
psql "$SPEC39_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/spec39_browser_fixtures.sql
```

In separate terminals, start PostgREST and the test API:

```bash
PGRST_DB_URI="$SPEC39_TEST_DATABASE_URL" PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon \
PGRST_JWT_SECRET="$SPEC39_TEST_JWT_SECRET" PGRST_SERVER_HOST=127.0.0.1 PGRST_SERVER_PORT=55440 postgrest
```

```bash
SPEC39_POSTGREST_URL=http://127.0.0.1:55440 \
SPEC39_TEST_JWT_SECRET="$SPEC39_TEST_JWT_SECRET" \
backend/node_modules/.bin/tsx backend/tests/fixtures/spec39-browser-server.ts
```

The PostgREST connection user must be able to switch to the test `service_role`.
The harness uses a signed temporary service JWT and maps Supabase's `/rest/v1`
prefix to standalone PostgREST. It binds only to loopback. The test-only
`/api/test-session` route creates a fixture session; it is not mounted by
`backend/src/index.ts` and must never be deployed as the application entrypoint.

```bash
SPEC39_LIVE_DATABASE=1 npm --prefix frontend run test:e2e -- \
  tests/e2e/arrangements-navigation.spec.ts tests/e2e/arrangements-database.spec.ts
```

Playwright starts Vite on port 4173, or reuses it if already running. All six tests
passed in the implementation run. The database test loads 25 then 27 persisted
orders, filters to the persisted `in_progress` UUID, excludes closed/foreign rows,
checks the inert action, and receives HTTP 404 when the A-only session requests B.
Without `SPEC39_LIVE_DATABASE=1`, this one database browser test is explicitly
skipped; mocked browser tests alone do not replace it.

Playwright writes viewport screenshots under `frontend/test-results/`. A separate
agent-browser check confirmed desktop and 320px mobile rendering, no browser
exceptions or Vite error overlay, and no horizontal overflow. Stop the local test
processes and discard the disposable cluster after verification.

## Deployment prerequisites

Apply the SPEC-39 migration before deploying the backend, then deploy the frontend.
The read endpoint requires the existing session configuration, Supabase service
credentials, `PLATFORM_CURSOR_SECRET`, `PLATFORM_RATE_LIMIT_PEPPER`, and the SPEC-28
distributed limiter function. Missing dependencies return safe errors, never fake
orders. The migration creates no production data; a fresh organization is empty.
`open`/`in_progress` are the documented provisional availability rule. No write API
or order lifecycle is part of this release. Hosted activation remains a separate
deployment step; rollback retains the additive table and any data.

On 2026-09-11, Supabase CLI applied only migration `20260910120000` to the verified
`multi-tenant` branch `kcobkbtieyowdmsvtsvv`. Remote history, columns, forced RLS,
browser denial, read-only service grants, and an empty orders table were checked.
The unrelated unapplied legacy webhook retirement migration remained untouched.
An isolated dry run after the push reported no pending migrations in the selected
set. See the [task evidence](../09-roadmap/specs/SPEC-39-gestion-de-arreglos-dashboard-ordenes-abiertas/TASK-39-01-dashboard-de-ordenes-abiertas.md).
Application deployment is still pending.
