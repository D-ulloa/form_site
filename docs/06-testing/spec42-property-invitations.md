# SPEC-42 verification

Verified locally on 2026-09-12 with PostgreSQL 16.15, PostgREST 14.18 and Chromium. The full browser flow used the production organization/session services, repositories, RPCs, CSRF checks and distributed rate-limit storage. Auth provisioning/password activation use controlled synthetic adapters. No real invitations were sent. Both migrations were subsequently applied to the Supabase development branch as recorded below; application deployment and real Auth/Google provider certification remain pending.

## Results

| Check | Result |
| --- | --- |
| Backend suite | 330 passed; 6 database races skipped without the dedicated environment, then passed separately |
| Frontend unit/integration | 188 passed |
| Backend typecheck/build; frontend lint/build | Passed; existing Vite main-bundle size advisory remains |
| SQL: SPEC-42, upgrade, SPEC-39 and updated SPEC-40 | Passed against real PostgreSQL |
| Separate concurrent database connections | 6 passed: duplicate property creation, competing assignments, competing invitations, accept/revoke, identical issue/accept, and actor suspension |
| Browser SPEC-42 | 4 passed: 3 supported viewports plus the complete persisted incorporation flow |
| Browser SPEC-39/40/42 regression | 11 passed, 2 explicitly environment-gated database cases skipped in that invocation; SPEC-42's database case passed separately |
| agent-browser | Dashboard and creation dialog loaded without runtime errors; corrected initial field focus |

The completed browser case creates a property, associates a genuine pre-cutover unassigned membership, invites/registers a new account, accepts an existing account, checks three memberships on one property, logs in again, and incorporates the same existing identity into organization B with a different property. It reads the persisted associations directly from PostgreSQL and confirms the Auth row count is unchanged. Member/viewer render ID/name without people requests; inquilino receives only Inicio and is denied arrangements APIs.

Screenshots are generated in `frontend/test-results/` for 1280×800, 390×844 and 320×740 (`create-property.png`, `property-panel.png`) and for persisted members (`persisted-inquilinos.png`). Keyboard Enter/Space/Escape, initial/restored focus, no page/dialog horizontal overflow and browser exceptions are checked. Test screenshots contain only synthetic fixture data.

## Acceptance coverage

| SPEC criteria | Evidence |
| --- | --- |
| 1–4: creation, persistence, idempotency, existing orders | Service/HTTP tests, SQL creation/audit rollback, concurrent creation, UI forms, responsive navigation and database browser flow |
| 5–7: bound invitations, multiple people, new/existing accounts | Common issuance tests, real acceptance RPCs, browser registration and existing-account login, unchanged Auth row count |
| 8–11: authority, atomic rollback, token lifecycle, retries/races | Strict HTTP inputs; SQL email/FK/legacy checks, injected audit failure, rotation/revoke/expiry, consumed-handoff recovery and multi-connection races |
| 12–14: legacy association and alternate paths | Pre-enforcement fixtures, upgrade test, association version/FK rules, old creation/acceptance signatures, role/ownership guards |
| 15–17: limited readers, exclusive Inicio, stale context | Backend capabilities, UI query absence, late-response abort test, updated SPEC-40 SQL/navigation and suspension race |
| 18: full integration and regression | PostgreSQL/PostgREST browser flow, organization A/B identity associations, backend/frontend suites and SPEC-39/40 SQL |

## Automated commands

From the repository root:

```bash
npm --prefix backend test
npm --prefix backend run typecheck
npm --prefix backend run build
npm --prefix frontend test
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:e2e -- tests/e2e/arrangement-property-invitations.spec.ts tests/e2e/arrangements-navigation.spec.ts tests/e2e/inquilino-navigation.spec.ts
git diff --check
```

Database-dependent tests are explicitly skipped without their environment variables. Do not count a skipped test as persistence evidence. The independent default browser regressions mock HTTP responses; the database case below does not.

## Disposable PostgreSQL setup

Use an isolated PostgreSQL cluster and empty UTF-8 databases named `spec42*`. Never use customer data. `psql`, PostgreSQL 16 and PostgREST 14 are prerequisites. A Supabase test instance already supplies Auth/roles: use its native objects and apply only the dependency migrations listed in `supabase/tests/spec42_setup.sql`; do not create standalone Auth stubs there.

For standalone PostgreSQL, set `SPEC42_TEST_DATABASE_URL` to an empty disposable database. The setup refuses nonempty databases and names without the `spec42` prefix. It installs selected organization/session/limiter/identity/invitation dependencies and both SPEC-42 migrations, excluding unrelated integration migrations.

```bash
psql "$SPEC42_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/spec42_setup.sql
psql "$SPEC42_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/spec42_property_invitations.sql
psql "$SPEC42_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/spec39_arrangement_orders.sql
psql "$SPEC42_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/spec40_inquilino_role.sql
```

These assertions roll their fixtures back. Both documented setup modes were verified on fresh databases, including the core SQL suite and legacy upgrade assertions. SPEC-40 now creates property-bound invitations and retains associations in its internal-role regression fixtures. It still exercises last-owner protection, role/status mutations, ownership transfer and audit-failure rollback.

For the browser/upgrade tests, use a second empty database and set `SPEC42_TEST_DATABASE_URL` to it:

```bash
psql "$SPEC42_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -v spec42_with_fixtures=1 -f supabase/tests/spec42_setup.sql
psql "$SPEC42_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/spec42_upgrade.sql
```

`spec42_browser_fixtures.sql` runs between foundation and enforcement, so historical null references really predate the guards. It seeds only synthetic users/organizations/orders. The upgrade test proves old tokens/handoffs cannot resolve, register or accept, that revocation remains possible, that a propertyless suspended member cannot reactivate, and that a prior active member can be explicitly associated.

The fresh local fixture inventory contains one active legacy membership and one
pending propertyless inquilino invitation in organization A; organization B has
neither. The development branch inventory is recorded separately below. Run the
scoped count queries in the release runbook against each target before its cutover.

## Browser through API and database

Keep ports 3002, 4173 and 55444 available. This run used PostgreSQL on 55443. Set `SPEC42_TEST_JWT_SECRET` to a disposable secret of at least 32 characters; use the same value for PostgREST and the API. The connection user must be able to switch to the test service role.

In separate terminals:

```bash
PGRST_DB_URI="$SPEC42_TEST_DATABASE_URL" PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon \
PGRST_JWT_SECRET="$SPEC42_TEST_JWT_SECRET" PGRST_SERVER_HOST=127.0.0.1 PGRST_SERVER_PORT=55444 postgrest
```

```bash
SPEC42_POSTGREST_URL=http://127.0.0.1:55444 SPEC42_TEST_JWT_SECRET="$SPEC42_TEST_JWT_SECRET" \
backend/node_modules/.bin/tsx backend/tests/fixtures/spec42-browser-server.ts
```

```bash
SPEC42_LIVE_DATABASE=1 SPEC42_TEST_DATABASE_URL="$SPEC42_TEST_DATABASE_URL" \
DEV_API_TARGET=http://127.0.0.1:3002 npm --prefix frontend run test:e2e -- \
  tests/e2e/arrangement-property-invitations.spec.ts --workers=1
```

Playwright starts Vite if needed; an already running Vite must also use `DEV_API_TARGET=http://127.0.0.1:3002`. This preserves the ordinary default API target at port 3001. `SPEC42_PSQL` can select a local `psql` binary. The harness binds only to loopback and must never be deployed. Use a fresh fixture database and restart the API before repeating a consuming browser case.

The SPEC-40 browser harness now delegates to this current harness (accepting the old SPEC40 PostgREST/JWT variables). Its database regression also creates the property before inviting. Run that case on its own fresh fixture database with `SPEC40_LIVE_DATABASE=1`; it consumes the same synthetic identity.

## Concurrent connections

Create a third empty database and set `SPEC42_CONCURRENCY_DATABASE_URL` to it. The race suite persists state in its disposable fixtures, so use a fresh database each run.

```bash
psql "$SPEC42_CONCURRENCY_DATABASE_URL" -v ON_ERROR_STOP=1 -v spec42_with_fixtures=1 -f supabase/tests/spec42_setup.sql
SPEC42_CONCURRENCY_DATABASE_URL="$SPEC42_CONCURRENCY_DATABASE_URL" \
backend/node_modules/.bin/tsx --test backend/tests/integration/spec42-database-concurrency.test.ts
```

Each race uses separate `psql` processes and overlapping transactions; these are not sequential retry assertions or textual migration checks. The tests verify final database state and audit counts. Acceptance-failure injection is covered separately by the SQL suite.

## Limits and deployment

### Development migration — 2026-09-12

The user authorized application of the two new migrations to the development
Supabase branch. The branch API confirmed persistent, non-default `multi-tenant`
(`kcobkbtieyowdmsvtsvv`, parent `kjnwiwvwuavurbgovmlt`) was healthy and matched the
repository's linked project. Only this development branch was changed.

| Applied migration | SHA-256 of the source file |
| --- | --- |
| `20260912120000_spec42_arrangement_properties.sql` | `c9d8be0f8fdc9ea766c55cc9ba28caf3829894c4b3a96a263ac46e9f8dc49211` |
| `20260912130000_spec42_property_invitation_enforcement.sql` | `b6a55b085865f15c410c12b03da76f84fc28067b0e3eddf845f185276b5deab5` |

An isolated migration directory contained the 38 versions already applied plus
exactly these two files. The unrelated pending
`20260817190000_retire_legacy_contract_webhook.sql` was excluded. Supabase CLI
2.111.0 dry-run and application selected only SPEC-42, with empty seed and custom
role sets. The application used the branch pooler on port 6543 after port 5432
timed out; repository connection metadata was preserved.

Before application, read-only inventory found zero inquilino memberships, zero
pending inquilino invitations and zero handoffs, so there were no legacy rows to
associate or invitations to replace. The effective definitions of 13 existing
invitation/governance RPCs were inventoried. No fixtures or invitations were created.

Read-only verification after application confirmed:

- The previous 38 migration versions were unchanged, with only the two expected
  SPEC-42 versions/names added.
- Both new tables have forced RLS and deny direct reads to anon, authenticated
  and service roles; access remains through authorized RPCs.
- Membership/invitation property UUID columns, validated composite organization
  foreign keys, non-null handoff token versions and both enabled guards exist.
- All 13 SPEC-42 functions have fixed search paths and deny browser execution;
  service execution is granted only to the seven public entry points, with six
  helpers private. Existing acceptance, resolution, registration, rotation,
  membership and ownership functions enforce the new property requirement.
- Properties, operation records, inquilino memberships and pending inquilino
  invitations remained at zero.

The final dry run of the same isolated migration set returned `upToDate: true`
with no migrations, seeds or custom roles pending. **Backend/frontend deployment
and hosted application smoke checks remain pending.** This migration evidence
does not represent a deployed or provider-certified application flow.

These tests do not certify real Supabase Auth Admin calls, Google OAuth or a hosted deployment. The full default suites retain coverage for other-role invitations and SPEC-41 onboarding. No new code invokes the full SPEC-30 property workflow or external integrations.

Stop only the test processes created for verification and discard the disposable cluster afterward. Builds may regenerate tracked `backend/dist` outputs; the implementation change is maintained in source. See the [release and recovery runbook](../03-operation/spec42-property-invitations-runbook.md) for target inventory, explicit legacy replacement, release order and preservation of associations during recovery.
