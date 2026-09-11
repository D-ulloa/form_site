# Environment

Status: 2026-09-01.

## Backend environment variables

The backend loads environment variables from `.env` using `dotenv` in `backend/src/index.ts`.

Required / recommended values:

- `NODE_ENV` — backend runtime mode. The `X-User-Id` development authentication path is enabled when this value is exactly `development`; `npm run dev` sets it explicitly.
- `PORT` — HTTP port for the backend (default `3001`).
- `TRUST_PROXY_HOPS` — number of trusted reverse-proxy hops used by Express for HTTPS detection and `req.ip` audits (default `0`, disabled). Only a nonnegative safe integer is accepted; invalid values become `0`. Hosted Vercel (`VERCEL=1`, `NODE_ENV=production`, including Preview) enforces a minimum of `1` because its ingress terminates TLS; otherwise secure contract requests incorrectly return `426 HTTPS_REQUIRED`.
- `GOOGLE_CLIENT_ID` — OAuth client ID for Google API user authentication.
- `GOOGLE_CLIENT_SECRET` — OAuth client secret for Google API user authentication.
- `GOOGLE_REFRESH_TOKEN` — OAuth refresh token for the Google account used to upload files and access Sheets.
- `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` — Minified service-account JSON. It is a fallback for the property workflow and mandatory for Contract Generation Sheet reads/writes.
- `GOOGLE_SUBJECT_EMAIL` — Delegated user email for service account domain-wide delegation.
- `GOOGLE_SHEET_ID` — Target Google Sheet ID.
- `GOOGLE_SHEET_RANGE` — Sheet range for appends (for example `Sheet1!A1`).
- `GOOGLE_DRIVE_PARENT_FOLDER_ID` — Parent Drive folder ID where property folders are created.
- `MAKE_WEBHOOK_URL` — URL for the Make webhook that receives the submission payload.

Contract Generation values:

- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` — server-only Supabase credentials used for contract rows and property media.
- `CONTRACT_PUBLIC_BASE_URL` — frontend origin used in generated user and client links. Keep this set to the production origin (for example `https://app.example.com`) in Production; Vercel Preview deployments use the automatic `VERCEL_URL` for the current deployment, and local development can use `http://localhost:5173`.
- `CONTRACT_TOKEN_SECRET` — at least 32 random characters used to HMAC external contract role tokens.
- `CONTRACT_SESSION_SECRET` — at least 32 random characters used only for application-session cookies. A rollout fallback to `CONTRACT_TOKEN_SECRET` exists; configure the independent value before sign-off.
- `CONTRACT_SESSION_VERSION` — application-session invalidation marker (default `spec25-containment-v1`). Increment after grant removal to reject old admin cookies without breaking role links.
- `CONTRACT_ALLOW_SYNTHETIC_REGISTRATION` — local fixture only; accepted only with exact `NODE_ENV=development` and does not grant admin.
- `CONTRACTS_API_KEY` — optional server-to-server bearer credential; never expose it through `VITE_*`.
- `CONTRACT_TRUSTED_GATEWAY_ENABLED` — enable only behind a reviewed gateway that strips inbound identity headers and inserts verified identity.
- `CONTRACT_ADMIN_USER_IDS` — comma-separated user IDs allowed to use the admin API and UI.
- `CONTRACT_SUBMISSION_RATE_LIMIT` — allowed attempts per IP/entry and limiter namespace (default `10`). Role submits and SPEC-14 evidence preflights use independent counters.
- `CONTRACT_SUBMISSION_RATE_WINDOW_MS` — window shared by those independent counters (default `900000`).
- `CONTRACT_DNI_STORAGE_BUCKET` — private Supabase Storage bucket for SPEC-11 DNI files (default `contract-dni`).
- `CONTRACT_DNI_MAX_IMAGE_BYTES` — maximum size of one DNI image (default `10485760`, 10 MB). Keep this aligned with the bucket object limit.
- `CONTRACT_DNI_UPLOADS_REQUIRED` — set to `true` to require both Frontal and Dorso DNI uploads for every visible DNI receiver; production environments enforce this policy regardless of the variable.
- `CONTRACT_EVIDENCE_STORAGE_BUCKET` — separate private Supabase Storage bucket for SPEC-14 guarantor evidence (default `contract-evidence`).
- `CONTRACT_EVIDENCE_MAX_FILE_BYTES` — maximum size of one salary-receipt or property-guarantee file (default `10485760`, 10 MB). Keep this aligned with the evidence bucket object limit.
- `CONTRACT_MAKE_WORKER_LIMIT` — optional bounded contract Make-worker batch size; values from 1 through 50 are accepted and the default is `10`.
- `CONTRACT_MAKE_WORKER_ID` — optional standalone worker identity override; otherwise the command derives one from its process ID.

Staged SPEC-28 platform values (required before activating multi-tenant paths):

- `PLATFORM_RATE_LIMIT_PEPPER` — secret-manager value of at least 32 bytes used only to HMAC limiter subjects; version and rotate it independently from session/link secrets.
- `PLATFORM_CURSOR_SECRET` — secret-manager value of at least 32 bytes used only for opaque pagination cursor signatures.
- `PLATFORM_AUDIT_REQUIRED` — must remain `true` for privileged/support/security-sensitive mutations; no production emergency mode is currently approved.
- `PLATFORM_RESTORE_MODE` — absent/`false` in normal service. An isolated restore process sets it while traffic and workers remain disabled; it must never be a public feature flag.

Do not place any of these values in `VITE_*`, logs, audit metadata, database
dumps, export manifests, or repository files. Current platform constructors
accept injected secrets/adapters. SPEC-27 activates the identity/context boundary;
domain/provider activation and compatibility removal remain SPEC-34 gates.

SPEC-39 arrangement reads use `PLATFORM_CURSOR_SECRET`, `PLATFORM_RATE_LIMIT_PEPPER`,
the existing Supabase service credentials, and the SPEC-28 organization limiter RPC.
Configure both secrets before enabling the dashboard endpoint; absent configuration
fails closed with HTTP 503. Apply `20260910120000_spec39_arrangement_orders.sql`
before deploying the API, then deploy the frontend. No new external provider or
browser secret is required. Disposable test setup is documented in
[`spec39-arrangements.md`](../06-testing/spec39-arrangements.md).

SPEC-27 identity values (mandatory in production):

- `APP_SESSION_PEPPER` — independent secret-manager value used to HMAC opaque application-session tokens before lookup/storage.
- `APP_CSRF_PEPPER` — independent value used to HMAC the session-bound CSRF token.
- `APP_API_KEY_PEPPER` — independent value used for organization API-key hashes.
- `APP_ALLOWED_ORIGINS` — comma-separated exact scheme/host/port origins; credentialed CORS and mutations reject every other origin.
- `APP_PASSWORD_RESET_REDIRECT_URL` — reset callback on one of the exact allowed origins.
- `APP_SESSION_TTL_SECONDS` — standard absolute lifetime; set explicitly in production.
- `APP_REMEMBERED_SESSION_TTL_SECONDS` — approved remembered-session absolute lifetime.
- `APP_SESSION_IDLE_TTL_SECONDS` — inactivity lifetime, bounded by the absolute expiry.
- `APP_MAX_ACTIVE_SESSIONS` — approved per-user active-session limit from 1 through 100; the create RPC enforces it under a user-scoped advisory lock.
- `SUPPORT_ACCESS_ENABLED` — must remain `false`; production startup rejects `true` until separate approval and runtime implementation exist.

SPEC-35 provisioning values (mandatory in production, even while disabled):

- `IDENTITY_PROVISIONING_ENABLED` — explicit `true` or `false`; deploy `false` and enable only after the SPEC-34 inventory and disposable-project gates pass.
- `IDENTITY_PROVISIONING_DEFAULT_DISPLAY_NAME` — neutral localized placeholder, initially `Usuario invitado`; never derive it from an email address.
- `IDENTITY_PROVISIONING_DEFAULT_LOCALE` — validated default, initially `es`.
- `IDENTITY_PROVISIONING_DEFAULT_TIME_ZONE` — validated IANA zone, initially `America/Caracas`.
- `IDENTITY_PROVISIONING_EMAIL_PEPPER` — independent secret-manager value of at least 32 bytes used to HMAC canonical emails in restricted evidence.
- `APP_AUTH_ACTIVATION_REDIRECT_URL` — activation callback whose origin exactly matches `APP_ALLOWED_ORIGINS`.

SPEC-41 self-service registration values:

- `SELF_SERVICE_REGISTRATION_ENABLED` — explicit kill switch for new public registrations. Deploy `false`; it does not affect login, invitations, or the restricted organization command.
- `SELF_SERVICE_ONBOARDING_EMAIL_PEPPER` — independent 32+ byte HMAC secret for pending-registration email fingerprints. `IDENTITY_PROVISIONING_EMAIL_PEPPER` is accepted temporarily only when this value is absent.
- `SELF_SERVICE_ONBOARDING_DEFAULT_LOCALE`, `SELF_SERVICE_ONBOARDING_DEFAULT_TIME_ZONE`, and `SELF_SERVICE_TERMS_VERSION` — server-owned defaults; the browser cannot select plan, locale, timezone, role, source, or organization ID.

Disable Supabase Auth's **Confirm email** requirement for this approved flow. Password identities are created only by the backend service-role adapter with `email_confirm: true`; no verification screen may block the initial organization session. Google remains an alternative registration method and is bound to a pre-OAuth onboarding intent whose email must match the returned Google identity.

The operator command is server-only and accepts no password, UUID selection, role,
membership, verification state, provider metadata, token, or action link. Invoke it
with `npm --prefix backend run spec35:provision-identity --` and the reviewed flags
documented in the SPEC-35 runbook. Never place these values in `VITE_*`.

Apply these migrations in order before enabling the complete flow.

The currently linked Supabase project has already received these migrations manually. Consolidating their files does not re-run or alter them. Before using `supabase db push` against that project, reconcile the Supabase CLI migration history (for example with `supabase migration repair`) so already-applied migrations are not attempted again.


1. `supabase/migrations/20260724000000_contract_entries.sql`
2. `supabase/migrations/20260727000000_contract_spec11.sql`
3. `supabase/migrations/20260729000000_contract_spec14.sql`
4. `supabase/migrations/20260731000000_contract_spec16.sql`
5. `supabase/migrations/20260803000000_contract_spec17.sql`
6. `supabase/migrations/20260803010000_contract_spec19.sql`
7. `supabase/migrations/20260804000000_contract_add_generar_contrato_status.sql`
8. `supabase/migrations/20260804010000_contract_spec19_admin_repair.sql`
9. `supabase/migrations/20260805000000_contract_add_generation_trigger.sql`
10. `supabase/migrations/20260806000000_contract_generate_trigger_webhook.sql`
11. `supabase/migrations/20260811000000_contract_spec22_access_control.sql`
12. `supabase/migrations/20260818000000_spec25_containment.sql`
13. `supabase/migrations/20260818120000_spec26_organization_governance.sql`
14. `supabase/migrations/20260818140000_spec27_identity_sessions_authorization.sql`
15. `supabase/migrations/20260818160000_spec28_platform_controls.sql`
16. `supabase/migrations/20260818180000_spec29_multitenant_contract_domain.sql`
17. `supabase/migrations/20260818200000_spec30_multitenant_property_domain.sql`
18. `supabase/migrations/20260819000000_spec31_private_asset_platform.sql`
19. `supabase/migrations/20260819200000_spec32_multitenant_integration_outbox.sql`
20. `supabase/migrations/20260819300000_spec33_commercial_extension_framework.sql`
21. `supabase/migrations/20260819400000_spec34_migration_certification_control_plane.sql`
22. `supabase/migrations/20260820120000_spec29_tenant_contract_http_cutover.sql`
23. `supabase/migrations/20260820123000_spec29_contract_created_actor_uuid.sql`
24. `supabase/migrations/20260825120000_spec35_identity_profile_provisioning.sql`
25. `supabase/migrations/20260825160000_spec36_organization_provisioning.sql`
26. `supabase/migrations/20260825200000_spec37_invitation_delivery_handoff.sql`
27. `supabase/migrations/20260826120000_spec37_manual_invitation_links.sql`
28. `supabase/migrations/20260827130000_spec28_rate_limit_conflict_fix.sql`
29. `supabase/migrations/20260827140000_spec37_manual_invitation_event_fix.sql`
30. `supabase/migrations/20260827150000_spec37_list_projection_ambiguity_fix.sql`
31. `supabase/migrations/20260827160000_spec37_handoff_digest_schema_fix.sql`
32. `supabase/migrations/20260901000000_spec38_shared_make_contract_delivery.sql`

Migrations 14 and 15 create no organizations or business rows. They add identity and
shared backend-only control tables/functions with forced RLS and revoked browser
grants. Migrations 24 through 31 include the SPEC-35/36/37 releases and post-SPEC-37
corrective migrations; migration 32 adds the current shared contract Make-delivery
trigger/materialization and scoped payload/claim functions. Apply and certify the complete chain in a disposable project;
do not enable a second production organization based on static migration tests.

The initial contract migrations establish the private buckets, role submissions,
computed fields, administrator access, and lifecycle status. The historical fixed
Supabase-to-Make trigger is removed by SPEC-25. The current migration
`20260901000000_spec38_shared_make_contract_delivery.sql` instead materializes
organization-scoped `contract.generation.requested` deliveries from the outbox and
provides the scoped payload/claim functions used by the backend worker. Browsers
never write database tables directly and receive Storage access only through
server-issued signed URLs after role authorization.

If either storage bucket setting changes from its default, provision an equivalent private bucket with the matching size and MIME restrictions. The migrations create only `contract-dni` and `contract-evidence`.

`CONTRACT_GOOGLE_FORM_LINK`, `CONTRACT_GOOGLE_SHEET_ID`, `CONTRACT_GOOGLE_SHEET_NAME`, and `CONTRACT_AUDIT_LOGS_DIR` support only the retained SPEC-09 compatibility endpoints. The live SPEC-10 through SPEC-19 UI does not use them.

## Contract request identity

Entry creation and administrator routes accept these authentication modes:

- `Authorization: Bearer <CONTRACTS_API_KEY>` when `CONTRACTS_API_KEY` is configured.
- `X-Authenticated-User-Id: <verified-user-id>` from a trusted upstream gateway.
- The signed, versioned administrator session cookie from `/api/auth/login` or the reviewed Google handoff.
- `X-User-Id: <local-user-id>` when `NODE_ENV=development` exactly.

Authentication precedence is trusted `X-Authenticated-User-Id`, then explicit `Authorization`, then the signed Supabase application session (email/password or Google OAuth), then `X-User-Id`. Hosted client forms and their DNI/evidence upload-preflight endpoints require the client token. Hosted user forms accept their user token or the authenticated owner. API-key callers and accounts recorded in `contract_admin_users` are administrators; other user-scoped compatibility principals must be listed in `CONTRACT_ADMIN_USER_IDS`.

Clients may send `X-Request-Id` for correlation. The backend generates one when omitted or invalid and returns the selected value as a response header. In production, the reverse proxy must strip inbound `X-Authenticated-User-Id` and add a value derived from its authenticated session.

No hosted opt-in exists for the agent-ID header. Deprecated insecure flags cause non-development startup validation to fail when set to `true`.

For Vercel, scope `CONTRACT_PUBLIC_BASE_URL` to Production only. `VERCEL_ENV=preview` and `VERCEL_URL` are supplied automatically by Vercel; the backend uses them to generate links back to the same preview deployment. Do not copy the production URL into the Preview scope.

### Preview and Development configuration

The `multi-tenant` Preview branch uses Supabase development project
`kcobkbtieyowdmsvtsvv`. Its Vercel environment variables are branch overrides,
so existing variables shared with Production retain their values and scopes.
Other Preview branches do not inherit these overrides. Vercel Development uses
the same Supabase development project with localhost origins.

The stable Preview origin is
`https://form-site-git-multi-tenant-candel343s-projects.vercel.app`.
`APP_ALLOWED_ORIGINS` and `INVITATION_PUBLIC_BASE_URL` use that origin;
`APP_PASSWORD_RESET_REDIRECT_URL` and `APP_AUTH_ACTIVATION_REDIRECT_URL` append
`/auth/reset` and `/auth/callback`, respectively. On Vercel Preview only, the
backend also accepts the exact system-provided `VERCEL_URL` and
`VERCEL_BRANCH_URL` origins, allowing generated deployment links to work without
an application-wide wildcard. Production and local origin allowlists are unchanged.
Reads without an `Origin` header receive no CORS headers and can reach their
normal authorization checks; mutations still require an approved origin.

`vercel.json` uses explicit service rewrites, routing `/_/backend/(.*)` to
Express before the Vite catch-all, with an SPA fallback for frontend routes.
The catch-all uses `/(.*)` so the generated route matches `/` and paths ending
in `/`; the previous `/:path*` pattern missed those requests.
The backend runs `npm run typecheck` and uses `src/index.ts` as its entrypoint.
Its `outputDirectory` is `.` so Vercel bundles the source instead of flattening
the local `dist` output away from its package metadata and dependencies.
`.vercelignore` excludes local environment
files, Supabase link metadata, and generated audit records from CLI uploads.

Hosted Preview uses `NODE_ENV=production` for startup validation and secure
cookies; this does not select a production deployment or database. Identity
provisioning, self-service registration, and manual invitation links are enabled
for development testing. Synthetic identity, trusted gateway, support access,
organization provisioning commands, and restore mode remain disabled.

The Supabase development branch permits the project's Preview Auth redirects
and `http://localhost:5173/**` / `http://127.0.0.1:5173/**`. Its email confirmation
requirement is disabled for the documented backend-owned registration flow.
Production Supabase configuration is managed separately.

Do not overwrite local environment files when reviewing hosted settings. Pull
into a private temporary directory and remove the files afterward. Vercel
sensitive values are redacted in pulls; an empty pulled value does not prove
that the deployed secret is missing.

Set `TRUST_PROXY_HOPS` to the exact number of known reverse-proxy hops between the client and Express. Outside hosted Vercel, leaving it at `0` ignores forwarded addresses for `req.ip`; hosted Vercel enforces a minimum of `1` for its TLS-terminating ingress. Setting it too high can let an untrusted caller influence the IP stored in contract audits.

## Frontend environment configuration

The frontend uses Vite and sets the API prefix in `frontend/src/features/properties/services/propertyApi.ts`:

- development: no prefix.
- production: `/_/backend`.

No contract secret is configured in the frontend. The frontend sends same-origin credentials to the application authentication API; email/password and Google OAuth both resolve to the same HttpOnly session cookie. Property, contract creation, and administration use that session; property requests omit browser agent identity.

Google OAuth, which supports both normal login and the pre-intent SPEC-41 registration flow, requires these public Vite variables in
`frontend/.env.local` (or the frontend deployment environment):

- `VITE_SUPABASE_URL` — the linked Supabase project URL.
- `VITE_SUPABASE_ANON_KEY` — the project's public anon/publishable key. Never use
  `SUPABASE_SERVICE_ROLE_KEY` in a `VITE_*` variable.

The Google button uses Supabase Auth's PKCE flow and returns to
`/auth/callback`; the callback exchanges the Supabase session for the existing
HttpOnly application cookie. Only the PKCE verifier is persisted in same-tab
`sessionStorage`; temporary Supabase access/refresh tokens stay in memory.
The flow checks storage before redirecting and explicitly waits for SDK
initialization before generating the verifier. Old Supabase sessions in
`localStorage` are not loaded by this temporary client. Keep the Google flow
in the same browser tab and on the same origin (scheme, hostname, and port).
Callbacks started before this storage change may need a fresh Google attempt.
Reviewed password login uses the backend Supabase
service client directly. Self-service password registration remains server-only and is controlled by `SELF_SERVICE_REGISTRATION_ENABLED`. Configure Google in Supabase Auth before using it:

1. Enable Google under Authentication → Providers and enter the Google OAuth
   client ID and secret.
2. In Google Cloud, add
   `https://<project-ref>.supabase.co/auth/v1/callback` as an authorized redirect
   URI for that OAuth client.
3. Add the app callback URL to Supabase Auth's allowed redirect URLs, for
   example `http://localhost:5173/auth/callback` and
   `https://<production-host>/auth/callback`.

Check each production alias and Preview origin that users actually visit.
The complete redirect must retain `self_service_operation` for registration
and `return_to` for invitations. Do not redirect a callback to a different
hostname after OAuth starts; the verifier belongs to the initiating origin.

The callback exchanges each code once and removes it from browser history,
including on exchange failure. If Google authentication succeeds but the
application handoff fails, **Reintentar** reuses the temporary in-memory token
and checks for an already-established application cookie first. A full reload
can recover from that cookie; without it, **Continuar con Google** starts a
fresh flow while preserving the registration operation. Never retry a consumed
authorization code or delete a partially provisioned account to recover.

`VITE_ALLOW_SYNTHETIC_REGISTRATION` is legacy-only and no longer controls the product registration path. Do not set it in a real-data build.

## Example

Copy `.env.example` to `.env` in `/backend` and fill in all required values before starting the backend.

Keep `backend/.env` local. It is ignored by Git, and secret values must not be written to logs, responses, public schemas, or frontend environment files.

## Private asset configuration

SPEC-31 reuses server-only `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`CONTRACT_DNI_STORAGE_BUCKET`, `CONTRACT_DNI_MAX_IMAGE_BYTES`,
`CONTRACT_EVIDENCE_STORAGE_BUCKET`, and
`CONTRACT_EVIDENCE_MAX_FILE_BYTES`. The shared adapter creates its privileged
client only through the platform service-role factory. Never expose these as
`VITE_*` values.

Receiver policy owns file limits and allowed types. Do not add an environment
override that broadens active content, makes a bucket public, supplies a path,
or invents retention. POL-09 numeric retention/grace values and any scanner or
detector configuration must be approved, typed, startup-validated, and
documented before cleanup/scanning workers are enabled.

## Integration and worker configuration

The general SPEC-32 path does not add an environment variable for customer routing.
Destination folder/spreadsheet/endpoint IDs and credential references belong to the
owning `organization_integrations` record. Legacy `GOOGLE_*`, `CONTRACT_GOOGLE_*`,
and property-flow `MAKE_WEBHOOK_URL` values remain contained Azar-only compatibility
inputs and must never resolve a second organization. The mounted tenant contract
worker uses the active organization integration plus `CONTRACT_MAKE_WORKER_LIMIT`;
`CONTRACT_MAKE_WORKER_ID` is only a standalone worker identity override.

Production secret material belongs in an approved external secret manager. If
the envelope option is approved, its 32-byte key-encryption key is supplied by
an external KMS/runtime secret boundary, startup-validated, never stored beside
ciphertext or in general backups, and never exposed through `VITE_*`. Worker
identity, schedule, lease duration, concurrency, retry thresholds, egress proxy,
DNS/connect-time validation, timeout, and response-size settings must be typed,
bounded, and deployment-reviewed before enabling claims. Restored deployments
start with integration workers paused until reconciliation.

## Migration and certification configuration

SPEC-34 adds no customer routing or secret environment variable. Migration manifests
are restricted files outside the repository and deployment environment; validate them
with `npm --prefix backend run spec34:validate-manifest -- /restricted/path/manifest.json`.
They contain fixed organization IDs/slugs and sanitized references, never secret values,
tokens, credentials, raw provider URLs, customer payloads, or private object paths.

Do not introduce `VITE_*` rollout overrides. The browser feature manifest is a safe
server projection bound to organization, context epoch, and immutable certification.
Absent, stale, `disabled`, or malformed state denies the feature.

## Restricted organization provisioning

SPEC-36 runs only as the separate operations command documented in
`docs/03-operation/spec36-organization-provisioning-runbook.md`; it is not mounted in
the web server. Set `PLATFORM_PROVISIONING_ENVIRONMENT=production`, the exact Supabase
project ref in `PLATFORM_PROVISIONING_PROJECT_REF`, a reviewed short-lived deployment
identity label, an exact `PLATFORM_PROVISIONING_APPROVAL_REFERENCE` matching the manifest,
and the UUID of the named operator's fresh AAL2 session. Keep
`ORGANIZATION_PROVISIONING_ENABLED=false` except for an approved execution window.

Production manifests are owner-readable restricted files outside Git and the deployment
environment. The dry-run is the default and remains available while execution is disabled.
Never put a password, activation link, token, service key, provider metadata, or customer
payload in a manifest or command argument.

## Invitation delivery and activation

SPEC-37 is disabled by default. `INVITATION_ROUTES_ENABLED=true` requires an exact
HTTPS `INVITATION_PUBLIC_BASE_URL` present in `APP_ALLOWED_ORIGINS`,
`PLATFORM_AUDIT_REQUIRED=true`, `PLATFORM_RATE_LIMIT_PEPPER`, and a named
`INVITATION_ALERT_OWNER`. Local development may use an HTTP loopback origin only.

`INVITATION_DELIVERY_METHOD=share_link` returns the invitation URL once to the
authorized inviter and does not require an email adapter. The URL is never persisted,
listed, logged, or recoverable; rotation replaces the invitation generation and
invalidates the old URL and handoffs. `INVITATION_EMAIL_ADAPTER=disabled` is expected
in this mode.

For `INVITATION_DELIVERY_METHOD=email`, use `INVITATION_EMAIL_ADAPTER=capture` only
in isolated non-production environments. Email delivery also requires template `v1`
and the independent 32-byte-or-longer `INVITATION_PROVIDER_REFERENCE_PEPPER`.
Production requires `resend`, `RESEND_API_KEY`, an allowlisted CR/LF-free
`INVITATION_EMAIL_FROM`, `RESEND_WEBHOOK_SECRET`, and an integer
`INVITATION_EMAIL_TIMEOUT_MS` from 500 through 30000. Preview and non-production
startup reject the real adapter. These variables are server-only; none may use a
`VITE_*` prefix. Follow the SPEC-37 runbook before changing the disabled flag.
