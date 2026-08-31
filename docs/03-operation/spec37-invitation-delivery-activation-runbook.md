# SPEC-37 invitation delivery and activation runbook

Status: repository implementation available but disabled; production certification pending.

## Manual-link mode

`INVITATION_DELIVERY_METHOD=share_link` replaces provider delivery with a one-time
administrator copy action. Only the token hash and issuance timestamp persist. The
creation or rotation response is `no-store`; list endpoints never return the URL.
Rotation invalidates the prior invitation generation and active handoffs. Share links
only through a private channel with the intended recipient and revoke immediately after
suspected disclosure.

An unactivated identity created specifically for the invitation may set a password from
the cookie-bound handoff. Confirmed or previously used identities cannot be overwritten
and must log in with their existing password or Google account. Acceptance still checks
the exact authenticated email and applies only the role stored by the inviter.

## Enablement gate

Keep `INVITATION_ROUTES_ENABLED=false` until migrations 1–24 apply cleanly to an empty
and production-shaped disposable database. Record named security, operations, and
product approvals; Resend account/region and privacy terms; sending domain and one From
identity; SPF, DKIM, and DMARC evidence; provider/webhook limits; template `v1` review;
alert owner; approved canary addresses; and rollback owner. Never record a credential,
raw email, token/link, provider body, or full message ID in the evidence bundle.

Run backend tests/typecheck/build and frontend lint/tests/build. In the disposable
database prove browser-role denial, forced RLS, hash-only rows, exact-email acceptance,
and concurrent accept/resend/revoke/expiry/suspension outcomes. In the provider sandbox
prove accepted, rejected, timeout/ambiguity, duplicate delivery, signed duplicate
webhooks, bounce, complaint, password activation, Google return, existing/new identity,
and Azar/Solar isolation. Confirm no membership exists before explicit acceptance.

## Staged rollout

Use capture only with synthetic addresses outside production. Production startup must
use the secret-managed Resend credential/webhook secret and a verified HTTPS origin.
Enable first for approved canary recipients, then one approved organization. Watch
delivery failures, webhook authentication/replay, bounce/complaint thresholds, handoff
mismatch/replay, abuse limits, audit health, and delivery-attempt backlog before broader
enablement. Provider acceptance means queued by the provider, not delivered or accepted
by a person.

## Incident and recovery

For elevated delivery failure, forgery, leak suspicion, or audit/limiter outage, disable
new invitation routes and sending. Preserve evidence and correlation IDs. Rotate the
affected provider/webhook or hashing secret through the secret manager; changing the
provider-reference pepper makes old webhook correlation unavailable and therefore needs
a reviewed reconciliation window. Revoke or resend outstanding invitations explicitly;
resend rotates the token and invalidates handoffs. Never recover by exposing a token,
manually adding a membership, reopening registration, or reporting a disabled adapter
as success.

Already-sent invitation acceptance may remain enabled only after security confirms the
database, session, audit, and exact-email boundaries are healthy. Otherwise revoke the
affected invitations. Re-enable by the same canary sequence and attach sanitized
provider reconciliation, database race, and alert-clear evidence to the incident.
