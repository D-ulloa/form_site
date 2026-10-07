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

Authenticated browser pages check `/api/auth/session/status` every five minutes
while visible, when opened, and when the tab becomes visible or focused. This
read-only check does not extend idle expiry or overwrite cookies. A `401` from a
cookie-authenticated organization API triggers an immediate validity check.
Confirmed invalid sessions clear authenticated browser state and redirect to
login with a Spanish explanation and an allowlisted internal return path. Public
contract-token forms and external Storage uploads do not trigger this redirect.
Network errors, `403`, and `503` do not establish expiration or force a logout.
Password and Google login can return to the previous authenticated page;
unfinished property fields and selected files are lost during the redirect and
the login notice explains this. Leaving the property form aborts pending media
preflight and file-upload requests so the abandoned form cannot proceed to a
new submission after login.

Production durations are configured by `APP_SESSION_TTL_SECONDS`,
`APP_REMEMBERED_SESSION_TTL_SECONDS`, and `APP_SESSION_IDLE_TTL_SECONDS`.
The code fallbacks are eight hours absolute for a standard session, thirty days
absolute for a remembered session, and thirty minutes idle for either. The
earliest deadline applies. Authenticated API activity updates idle expiry at
most once every five minutes, bounded by the original absolute deadline;
background validity polling does not count as activity. Revocation or an invalid
cookie takes effect on the next authenticated request or validity check.

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
