# September 8 production release

The multi-tenant release enables self-service registration: a new account creates
its organization and owner membership. Existing contracts and Storage files remain
untouched and are not assigned to new organizations by registration.

The operator explicitly selected `NODE_ENV=development` for this release after
reviewing the development authentication, cookie, CORS, and startup-validation risks.
Vercel Production remains the deployment target. This is a temporary runtime choice.

Production variables are imported from the local backend environment only when the
key is absent from Production. Public origins and callbacks use the production URL;
database passwords and local Vercel tokens are excluded. Existing variable values
are preserved. `SELF_SERVICE_REGISTRATION_ENABLED=true` and manual invitation links
are enabled. Supabase Auth auto-confirms password registrations for this flow.

The migration `20260817190000_retire_legacy_contract_webhook.sql` must run before
SPEC-25. Production had an additional manually installed trigger referencing the
function that SPEC-25 removes. Retiring both old triggers prevents duplicate effects.
The eight historical migrations absent from the ledger were verified against the
actual production schema before reconciling their history.

Contract delivery now waits for an HTTP acknowledgement. A 2xx confirms transport
acceptance, not completion of document generation. Timeouts and uncertain responses
remain unknown and need provider reconciliation before retrying.

The authenticated endpoint `/_/backend/api/cron/contract-make` uses `CRON_SECRET`.
Vercel Hobby permits a daily fallback schedule (08:00 UTC); status changes still
attempt immediate delivery. Production batches use `CONTRACT_MAKE_WORKER_LIMIT=3`.
Do not call the endpoint without accounting for pending customer deliveries.

The legacy property flow still uses global Drive/Sheets/Make destinations. Production
allows it only for UUIDs explicitly listed in `LEGACY_PROPERTY_ORGANIZATION_IDS`.
Empty means unavailable for every organization. Configure and verify the intended
destinations before adding an organization; full tenant property integration is
separate work. Email invitation delivery is not enabled.

Release verification covers repository tests, a rollback-only real PostgreSQL
migration/onboarding/isolation/outbox rehearsal, and deployment smoke checks.
Database rollback requires a compatible application/database pair. Managed backups
and restricted pre-release row/schema snapshots are retained outside the repository.
