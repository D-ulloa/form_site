# SPEC-43 verification

Local implementation verified on 2026-09-12 using Node 22.20, PostgreSQL 16.15, PostgREST 16.3 and Chromium. The browser uses the production session service, organization context, authorization, distributed rate limiter, request/asset services and SQL RPCs. Auth password verification and Storage are controlled local adapters. Uploads transfer actual synthetic PNG/MP4 bytes over HTTP; the production content detector checks their signatures and SHA-256. No real tenant files, messages, invitations or hosted resources were created.

**The development database migration was applied on 2026-09-12. Application deployment, hosted Storage flow verification and production policy approval remain pending.** This document does not close those SPEC-31/POL-09 gates or declare SPEC-43 rolled out.

## Results

| Check | Evidence |
| --- | --- |
| Backend full suite with SPEC-43 concurrency enabled | 341 passed; 6 existing SPEC-42 races and the separate upgrade test were skipped in that invocation |
| Final focused HTTP checks | 3 passed, including aggregate 1 GiB rejection and safe provider errors |
| Migration upgrade test | 1 passed separately: unknown historical state aborts the transaction; explicit synthetic mapping permits upgrade; legacy dates/property/author remain null |
| Frontend unit/integration | 195 passed across 28 files |
| Backend typecheck/build; frontend lint/build | Passed; Vite's existing main-bundle size advisory remains |
| SQL setup and assertions | Passed on fresh disposable databases, including the complete asset-platform migrations and real service/browser grants |
| Separate PostgreSQL connections | 4 passed: duplicate draft/submit, competing status versions, governance suspension versus submit, and cancel versus submit |
| Browser navigation/regression | 8 passed; the existing SPEC-40 invitation database case remained explicitly environment-gated |
| SPEC-43 browser flow | 6 passed: PNG and MP4 upload, shared history, status/archive/reopen, viewer download at 1280×800, 390×844 and 320×740; upload retry, cancellation/focus restoration, text-only lost-response recovery, and cancellation of a started upload |
| agent-browser | Login and tenant page render without errors or Vite overlay; screenshots inspected |

The final browser run and its generated screenshots live in `frontend/test-results/`. Tests check page overflow at each viewport and initial/restored keyboard focus. All screenshot data is synthetic. Browser contexts explicitly log out so repeated runs do not exhaust the application's existing active-session limit.

## Coverage

- Capability registry version 6, active organization/membership checks, tenant property requirement, viewer reads and member status writes. Public context includes nullable property identity, which participates in authority/epoch invalidation.
- New drafts remain hidden. Description-only submission, idempotent draft/submit, shared property history without requester identities, stable signed cursors, fixed status filters, legacy projection, stale-version refresh and all four status transitions.
- HTTP CSRF, strict bodies, forged property/actor/status rejection, rate limits and private response headers. SQL repeats actor/organization/property authorization under organization-first locks.
- Exact receiver allowlist and 30 images/10 videos/40 total/1 GiB limits; image 10 MiB and video 100 MiB caps; checksum and detected MIME verification. Optional media never uses legacy multipart ingestion.
- `POST /arrangements/inquilino/order-drafts/:id/cancel` atomically expires a private draft and revokes its batch, or returns the receipt if submission already committed. This closes the cancellation/submission race without deleting submitted requests.
- One active upload batch per draft. Revoking a batch leaves a durable requirement for a replacement verified batch, preventing an in-flight submit from silently dropping selected files. Editing/restarting in the UI creates a new hidden draft.
- Explicit request–asset composite foreign keys; submitted/attached relational checks before a 60-second download URL. IDs and browser-provided paths never authorize access.
- Atomic audit insertion/version changes, no duplicate events or storage usage, and rollback if audit insertion fails.
- Cleanup respects holds and retention dates, excludes every associated asset, expires drafts after 24 hours, retries provider failures, writes append-only deletion outcomes, and reconciles quota exactly once. Reserved bytes remain reserved after cancellation until cleanup because a previously issued provider upload URL cannot be revoked.

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

Database-dependent tests are skipped unless their dedicated variables are provided. Prepare an empty, disposable UTF-8 PostgreSQL database named `spec43*`. `spec43_setup.sql` refuses another database name or an existing public/Auth schema. Standalone fixtures provide only the Auth/Storage schema boundary; all organization, session, quota, order, asset and owner-association tables/RPCs come from the actual migrations. The required SPEC-29/30 dependencies are applied as well, without invoking their workflows. A native Supabase test instance should use its own Auth/Storage objects instead of this standalone setup.

```bash
psql "$SPEC43_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/spec43_setup.sql
psql "$SPEC43_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/spec43_arrangement_requests.sql
```

The assertions roll back their synthetic fixtures. For the browser and concurrent-connection tests, then persist the fixture set:

```bash
psql "$SPEC43_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/tests/spec43_browser_fixtures.sql
SPEC43_CONCURRENCY_DATABASE_URL="$SPEC43_TEST_DATABASE_URL" npm --prefix backend test
```

Concurrency tests accept only a loopback `spec43*` database. `SPEC43_PSQL` optionally supplies the `psql` binary path. Run them separately from browser tests since they deliberately suspend/reactivate a fixture membership.

For the upgrade test, use another empty database and leave SPEC-43 unapplied:

```bash
psql "$SPEC43_UPGRADE_DATABASE_URL" -v ON_ERROR_STOP=1 -v spec43_before_upgrade=1 -f supabase/tests/spec43_setup.sql
cd backend
SPEC43_UPGRADE_DATABASE_URL="$SPEC43_UPGRADE_DATABASE_URL" npx tsx --test tests/integration/spec43-migration-upgrade.test.ts
```

The upgrade test's `custom_test_state → archived` mapping applies only to its synthetic fixture; it is not a production mapping policy.

Start these in separate terminals, with one disposable JWT secret of at least 32 characters shared by PostgREST and the API:

```bash
PGRST_DB_URI="$SPEC43_TEST_DATABASE_URL" PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon \
PGRST_JWT_SECRET="$SPEC43_TEST_JWT_SECRET" PGRST_SERVER_HOST=127.0.0.1 PGRST_SERVER_PORT=55444 postgrest
```

```bash
cd backend
SPEC43_TEST_JWT_SECRET="$SPEC43_TEST_JWT_SECRET" npx tsx tests/fixtures/spec43-browser-server.ts
```

```bash
DEV_API_TARGET=http://127.0.0.1:3002 VITE_SUPABASE_URL=https://pkce-test.supabase.co \
VITE_SUPABASE_ANON_KEY=public-test-key npm --prefix frontend run dev -- --host 127.0.0.1 --port 4173
```

```bash
SPEC43_DATABASE_E2E=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npm --prefix frontend run test:e2e -- \
  tests/e2e/inquilino-arrangements.spec.ts tests/e2e/arrangements-navigation.spec.ts tests/e2e/inquilino-navigation.spec.ts --workers=1
```

Only synthetic fixture accounts use `spec43-test-password`. No test password is accepted by the production identity provider. The local Storage adapter uses memory and disposable signed URLs; restarting it requires a fresh browser database because persisted attachment records outlive that memory.

## Limits and rollout

The adopted [policy baseline](../09-roadmap/decisions/25-multi-tenant-policy-baseline.md) supplies the 24-hour unattached-upload retention used here. It still requires named product/security production sign-off. Submitted attachments are preserved, including after archive; archive is reversible and is not relationship closure.

[Supabase signed upload URLs](https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl) last two hours. The application upload session lasts 55 minutes; SQL rejects late finalization, and cleanup waits at least 24 hours. Issuance records track the provider expiry separately. Downloads last 60 seconds and request attachment disposition. A previously issued download remains usable until expiry even if membership is subsequently revoked.

[File-type](https://github.com/sindresorhus/file-type) provides signature detection, not malware scanning or proof that an entire media file is harmless. No scanning certification is claimed. Before hosted activation, verify private bucket configuration, the signed upload/overwrite behavior, CORS, actual object inspection/download and content-disposition behavior against the selected Supabase environment, plus the applicable content policy and quota configuration.

See the [release/recovery runbook](../03-operation/spec43-arrangement-requests-runbook.md). The final source migration was tested locally and applied to the development branch as recorded below. Refresh inventory and migration history before any subsequent target application. Tracked `backend/dist` build artifacts are restored after verification; source files are the reviewable implementation.

Final local migration SHA-256: `ad62b4ed33a93a9ea59890b07c5b2adc5d7e706d71dde37fcd4c88f43f6b67bb`.

## Development migration — 2026-09-12

The user authorized the corresponding migration on the development Supabase branch. A fresh branch API lookup confirmed healthy, persistent, non-default `multi-tenant` (`kcobkbtieyowdmsvtsvv`, parent `kjnwiwvwuavurbgovmlt`), matching the repository's linked project.

Applied `20260912140000_spec43_arrangement_requests.sql` with SHA-256 `ad62b4ed33a93a9ea59890b07c5b2adc5d7e706d71dde37fcd4c88f43f6b67bb`. Supabase CLI 2.111.0 used an isolated migration directory containing the 40 already-applied migrations and exactly this new file. The unrelated pending `20260817190000_retire_legacy_contract_webhook.sql` was excluded. Dry-run and application selected only SPEC-43, with no seeds or custom roles. The application used the branch database connection through pooler port 6543 after temporary-login connections stalled; repository connection metadata was preserved.

Read-only preflight found zero orders, zero assets, zero upload sessions and one arrangement property. No historical status mapping or backfill was needed. No fixtures or tenant files were created.

Post-application checks passed:

- Migration history contains the previous 40 versions/names unchanged plus only SPEC-43.
- Both order tables have forced RLS. Browser roles have no direct table privileges; service access is limited to the existing order SELECT grant, with no direct association-table access.
- All eight installed/replaced function bodies match the source migration. Each has the expected security mode and fixed `pg_catalog` search path. Browser/public execution is denied; the two SPEC-43 helpers remain private, and the request/cleanup entry points are service-only.
- The 12 new order columns and defaults, five new indexes, validated constraints and composite organization foreign keys exist. Asset categories/paths, upload owner types and audit event types include the SPEC-43 extensions.
- `arrangement-media` is private, capped at 104,857,600 bytes per file, with the exact JPEG/PNG/WebP/MP4/WebM/QuickTime MIME allowlist. The existing `property-media` bucket settings are unchanged.
- Order, property, asset and upload-session counts are unchanged; there are zero order–asset associations.

The final dry run returned `upToDate: true`, with no migrations, seeds or roles pending in this isolated set. **Backend/frontend deployment, real hosted upload/download checks, policy sign-off and cleanup activation remain pending.** The database checks do not certify those application/provider flows.
