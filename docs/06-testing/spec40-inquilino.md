# SPEC-40 verification

Verified locally on 2026-09-11. New users join as `inquilino` through an owner/admin
invitation, then use `/login` and the organization selector for subsequent visits.
Their only capability is `inquilino.home.read`; the exclusive home is
`/t/:organizationSlug/inquilino`. Public organization registration still creates
an owner of a new organization and cannot grant an inquilino membership.

## Automated checks

Run from the repository root:

```bash
npm --prefix backend test
npm --prefix backend run typecheck
npm --prefix backend run build
npm --prefix frontend test
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:e2e -- tests/e2e/inquilino-navigation.spec.ts tests/e2e/arrangements-navigation.spec.ts
git diff --check
```

The implementation run passed **320 backend tests**, **180 frontend tests**, both
builds, backend type checking, frontend lint, and `git diff --check`. Vite retains the existing large
main-bundle advisory. The browser command passed **8 tests**; its additional real
database test was explicitly skipped until run with the harness below, where it
passed separately.

Coverage includes the singleton capability, existing-role regression, lifecycle
denial, cross-organization isolation, minimal context projection, role-change
authority/version checks, invalid registration handoffs, and API denial before
product reads or side effects. Frontend cases cover every internal route, stale
session summaries, late responses, auth refresh, suspension/removal, focus and
visibility, logout, and preserving an unfinished form when focus revalidation
confirms unchanged authority.

The member-list service and SQL function now require owner/admin authority,
matching `members.read`. This also closes the previous direct API access for
member/viewer; their capability sets remain unchanged.

## Disposable PostgreSQL setup and SQL assertions

Use an empty disposable database with PostgreSQL 16 and `psql`, never a database
containing customer data. The local run used PostgreSQL **16.15** and PostgREST
**14.18**. The standalone cluster needs these Auth/role stubs before migrations;
a disposable Supabase instance already supplies the roles and Auth schema:

```sql
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema extensions;
create extension pgcrypto with schema extensions;
create table auth.users (
  id uuid primary key,
  email text unique,
  email_confirmed_at timestamptz,
  confirmed_at timestamptz,
  last_sign_in_at timestamptz
);
```

Set `SPEC40_TEST_DATABASE_URL` to that disposable database. Apply these migrations
in order with `psql "$SPEC40_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f <file>`:

1. `supabase/migrations/20260818120000_spec26_organization_governance.sql`
2. `supabase/migrations/20260818140000_spec27_identity_sessions_authorization.sql`
3. `supabase/migrations/20260825120000_spec35_identity_profile_provisioning.sql`
4. `supabase/migrations/20260825200000_spec37_invitation_delivery_handoff.sql`
5. `supabase/migrations/20260826120000_spec37_manual_invitation_links.sql`
6. `supabase/migrations/20260827140000_spec37_manual_invitation_event_fix.sql`
7. `supabase/migrations/20260827150000_spec37_list_projection_ambiguity_fix.sql`
8. `supabase/migrations/20260827160000_spec37_handoff_digest_schema_fix.sql`
9. `supabase/migrations/20260911120000_spec40_inquilino_role.sql`

This selected dependency chain exercises the real governance/session/invitation
schema and effective RPC definitions; it does not certify all historical domain
or provider migrations.

Before loading persistent browser fixtures, run:

```bash
psql "$SPEC40_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/spec40_inquilino_role.sql
```

The SQL assertions passed. They create fixtures inside a transaction and roll
them back. They check role/status constraints, forced RLS, browser denial,
service grants, fixed RPC search paths, owner/admin invitation assignment,
handoff-bound activation, exact-email acceptance, no membership before acceptance,
replay/rotation/revocation/expiry denial, A/B isolation, role/status changes,
last-owner preservation, ownership transfer, version conflicts, and rollback of
the mutation when the audit insert fails.

## Browser through API, repositories, and database

Keep ports **3001**, **4173**, and **55442** available. Set
`SPEC40_TEST_JWT_SECRET` to a test-only string of at least 32 characters, using the
same value for PostgREST and the test API. The connection user must be able to
switch to `service_role`.

Load fixtures once into the fresh disposable database:

```bash
psql "$SPEC40_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/tests/spec40_browser_fixtures.sql
```

In separate terminals:

```bash
PGRST_DB_URI="$SPEC40_TEST_DATABASE_URL" PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon \
PGRST_JWT_SECRET="$SPEC40_TEST_JWT_SECRET" PGRST_SERVER_HOST=127.0.0.1 PGRST_SERVER_PORT=55442 postgrest
```

```bash
SPEC40_POSTGREST_URL=http://127.0.0.1:55442 \
SPEC40_TEST_JWT_SECRET="$SPEC40_TEST_JWT_SECRET" \
backend/node_modules/.bin/tsx backend/tests/fixtures/spec40-browser-server.ts
```

```bash
SPEC40_LIVE_DATABASE=1 npm --prefix frontend run test:e2e -- \
  tests/e2e/inquilino-navigation.spec.ts --grep 'SPEC-40 invitation'
```

Playwright starts or reuses Vite on port 4173. The test signs in as the fixture
owner, creates an `Inquilino` share link through Miembros, registers in a separate
browser context, explicitly accepts, verifies persisted role/capability and
members-list/cross-organization rejection, logs out, signs in normally, selects
the organization, and reaches Inicio. It then suspends the membership through
the owner's versioned API and confirms focus removes Inicio and context returns
404. This full test passed. Use fresh fixtures and restart the API before rerunning
it: the test consumes the invitation and changes membership state.

The harness uses production session storage, membership lookup, services,
repositories, RPCs, request context and CSRF handling. Supabase Auth provisioning,
password verification/activation, and user lookup use controlled adapters with
synthetic identities. The invited Auth row is seeded unactivated; this does not
certify the real Auth Admin API, Google OAuth, email delivery, provider webhooks,
distributed rate limiting, or remote deployment. No external invitation was sent.
The harness binds only to loopback and is never a deployable application entrypoint.

## Visual evidence and delivery

Playwright captures `inquilino-home.png` under each viewport's
`frontend/test-results/` directory. Tests passed at **1280×800**, **390×844**, and
**320×740**, including a long email, visible keyboard focus, reload, direct internal
routes, no product requests, no browser errors, and no horizontal overflow.
An additional agent-browser inspection of the authenticated database-backed home
confirmed desktop/mobile rendering, the single Inicio heading, logout as the only
button, zero links, and no Vite overlay or browser exceptions. Local inspection
captures were `/tmp/spec40-real-home-desktop.png` and
`/tmp/spec40-real-home-mobile.png`.

## Development migration — 2026-09-11

Migration `20260911120000_spec40_inquilino_role.sql` was applied to the persistent
Supabase development branch `multi-tenant` (`kcobkbtieyowdmsvtsvv`, parent
`kjnwiwvwuavurbgovmlt`). The dry run and application selected only SPEC-40, with
no seeds or roles; the unrelated pending migration
`20260817190000_retire_legacy_contract_webhook.sql` was excluded. Read-only SQL
verification confirmed both role constraints include `inquilino`, forced RLS,
browser denial, service execution grants, fixed search paths and the four RPC
bodies. The prior migration ledger was unchanged; only SPEC-40 was added. No
fixtures or invitations were created, and inquilino membership/invitation counts
remained zero. A final dry run of that isolated migration set returned
`upToDate: true`, with no migrations, seeds, or roles pending in that set.
The [task evidence](../09-roadmap/specs/SPEC-40-rol-inquilino-inicio-exclusivo/TASK-40-01-rol-inquilino-y-pagina-inicio.md#aplicación-de-migración-en-desarrollo--2026-09-11)
records the migration hash and checks.

**Application deployment and hosted flow verification remain pending.** Deploy
compatible backend/frontend before assigning the new role; check clients retaining
an older bundle. Once
inquilino memberships exist, retain schema and role recognition during rollback.
Do not convert them to viewer/member as a rollback mechanism. Stop the local test
processes and discard the disposable cluster after verification.
