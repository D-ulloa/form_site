# SPEC-27 identity, session, and organization-context runbook

Status: repository implementation, 2026-08-19. Production migration, legacy
principal invalidation, Azar membership backfill, and Solar remain SPEC-34 gates.

## Activation prerequisites

Reconcile the Supabase migration ledger, apply SPEC-25/26 in an isolated project,
then apply `20260818140000_spec27_identity_sessions_authorization.sql`. Configure
independent session, CSRF, and API-key peppers, explicit lifetimes, exact origins,
proxy hops, and HTTPS callbacks. Keep support disabled. Do not seed an
organization, membership, operator, support grant, or API key as part of schema
activation.

Verify forced RLS and browser-role revocation on every identity table. Exercise
password and Google handoff with zero, one, and multiple memberships. The login
must create only a hashed `app_sessions` record; it must not create a membership
or write `contract_admin_users`.

## Session operations

Treat missing, malformed, expired, idle-expired, revoked, or replaced cookies as
`401` and clear them. Rotation atomically revokes the predecessor before issuing
the successor cookies. Logout and revoke-others require exact Origin and CSRF.
Role, membership, organization, or Auth-user changes are effective on the next
request because authority is never stored in the cookie.

If token replay, unexplained session growth, cross-organization success, origin
drift, or CSRF bypass is observed, disable protected traffic, revoke affected
sessions/peppers, retain redacted event evidence, and follow the SPEC-25 and
SPEC-28 incident procedures. Never log cookies, CSRF values, Authorization,
token hashes, email addresses, or customer payloads.

## Organization context and switching

Every protected route resolves one route organization, reloads the active
membership and organization, evaluates the named capability, and passes the
immutable UUID to the repository. Unknown or foreign identifiers return generic
`404`. The frontend cancels requests, advances its epoch, clears visible tenant
state, validates the destination, and renders only after confirmation.

Legacy global business routes remain Azar-only compatibility surfaces until
SPEC-34. They must never be treated as proof that Solar is enabled. Production
cutover invalidates old signed cookies, removes global keys/headers/admin
authority, and verifies compatibility telemetry reaches zero.

## API keys and support

API-key issuance is `aal2`, capability, organization, scope, expiry, and CSRF
protected. Show the raw key once; retain only its keyed hash and prefix. Rotation
or revocation never converts it to a browser session. Support remains disabled;
the deny-by-default schema is not authorization to activate support.

## Recovery

After restore, keep customer traffic and workers paused. Reapply revocation
evidence, verify session/key hashes and expiry state, reconcile memberships and
organization state, rotate peppers if compromise is possible, and invalidate
sessions that cannot be proven current. Use a forward corrective migration for
schema defects; never restore global authorization as rollback.
