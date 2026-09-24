# SPEC-46 — Verification

Reproducible database fixtures and SQL assertions for work reports, personal submission and tenant acceptance.

## Reproducible database fixtures

Use a disposable loopback PostgreSQL database whose name starts with `spec46`. `supabase/tests/spec46_setup.sql` creates the prerequisite schemas and migrations. Load fixtures once via the assertion file (or `supabase/tests/spec46_browser_fixtures.sql` for browser runs).

```bash
psql "$SPEC46_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/spec46_setup.sql
psql "$SPEC46_DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/tests/spec46_browser_fixtures.sql
psql "$SPEC46_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/spec46_work_reports.sql
SPEC46_DATABASE_URL="$SPEC46_DATABASE_URL" npm --prefix backend test
```

Set `SPEC46_PSQL` when `psql` is not on PATH. Database tests skip without `SPEC46_DATABASE_URL`.

## Coverage

| Area | Evidence |
| --- | --- |
| Draft save/no-op and version conflicts | SQL assertions on `personal.report.save` |
| Draft privacy (tenant/viewer) and manager visibility | Projection role checks |
| Invalid body text and unassigned personal denial | `INVALID_REQUEST` / `NOT_FOUND` / `FORBIDDEN` |
| Submit marks solved+submitted and leaves personal list | SQL |
| Generic status/reject/archive blocked for submitted/accepted reports | `INVALID_TRANSITION` via spec43 and spec45 |
| Tenant/co-tenant/viewer see submitted report | Projection assertions |
| Acceptance idempotent, single event, archive order | SQL |
| Missing active tenant blocks submit with `TENANT_REQUIRED` | SQL |
| Legacy order without property outside flow | SQL |
| Grants/privacy and audit body absence | SQL |
| Audit failure rolls back report, order, revision | Injected trigger |

## Results

Verified locally on 2026-09-23 against a disposable PostgreSQL database:

- `supabase/tests/spec46_setup.sql` + `supabase/tests/spec46_work_reports.sql` passed (`SPEC-46 SQL assertions passed`).
- Backend unit/integration suite passing with updated capability registry and work_report projections.
