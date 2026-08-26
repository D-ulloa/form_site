# SPEC-35 identity and profile provisioning runbook

Status: repository implementation, disabled by default, 2026-08-25. This runbook
does not authorize production users, memberships, organizations, roles, or legacy grants.

## Activation gate

Reconcile the Supabase migration ledger and apply
`20260825120000_spec35_identity_profile_provisioning.sql` first to a disposable,
production-shaped project. Keep `IDENTITY_PROVISIONING_ENABLED=false` while reviewing
the SPEC-34 identity inventory. Every matching `auth_user`, `identity`, or `user_profile`
item must be verified or explicitly quarantined; the service fails closed on quarantined
email fingerprints.

Configure the documented neutral profile defaults, an independent email-fingerprint
pepper, and an activation redirect on an exact allowed origin. Verify the service-role
key exists only in the backend secret boundary. Confirm public `/api/auth/register`
still returns `REGISTRATION_CLOSED`, browser roles cannot insert `user_profiles`, and
the new evidence tables have forced RLS and no `anon`/`authenticated` grants.

Before enabling, certify zero/one/multiple-user resolution, concurrent same-email
requests, provider timeout reconciliation, Auth-create/profile-write recovery,
password activation, and Google login in the disposable project. Query memberships,
organizations, `platform_operators`, and `contract_admin_users` before and after each
identity-only test; every count must remain unchanged.

## Restricted operator command

Use an active, MFA-required `platform_operators` UUID and a fresh, reviewed AAL2
step-up reference. Run only from the restricted backend environment:

```sh
npm --prefix backend run spec35:provision-identity -- \
  --email synthetic-canary@example.invalid \
  --purpose initial_owner \
  --request-id request-spec35-canary-001 \
  --idempotency-key provision-spec35-canary-001 \
  --operator-user-id 00000000-0000-4000-8000-000000000000 \
  --step-up-reference 00000000-0000-4000-8000-000000000001
```

The step-up reference is the UUID of the operator's current, unexpired, unrevoked
AAL2 application session; an arbitrary assertion is rejected. Optional flags are
`--display-name`, `--locale`, and `--time-zone`. Never pass a
password, user UUID to provision, role, organization, verification state, provider
metadata, activation link, token, or secret. Reuse the exact idempotency key and exact
payload after a retryable failure. A changed payload requires a new reviewed operation;
blind retries with a new key are forbidden.

The result is internal evidence, not a public account-discovery response. A successful
identity/profile result still grants no customer access. SPEC-36 or SPEC-37 must perform
its own authorized membership transaction. Activation delivery belongs to SPEC-37.

## Failure and recovery

- `IDENTITY_PROVIDER_UNAVAILABLE`: stop new attempts, retain the same idempotency key,
  restore provider health, and resume. The service resolves the exact canonical email
  before creating anything after an ambiguous response.
- `blocked_ambiguous`: disable provisioning for that email, compare restricted Auth and
  SPEC-34 evidence, and obtain a reviewed disposition. Never merge or auto-link users.
- `blocked_ineligible`: do not alter bans, deletion state, or email through this flow.
- `PROFILE_CONFLICT`: stop and review the Auth UUID, operation evidence, and profile row.
  Repair only through a reviewed forward operation; never overwrite chosen preferences.
- Auth user with no profile after interruption: retry the identical operation. The
  create-if-absent transaction repairs the missing profile and preserves an existing one.
- `AUDIT_UNAVAILABLE`: provisioning is failed closed. Restore database/audit availability
  before retrying the exact operation.

General incident logs contain only request ID and safe outcome class. Do not paste email,
provider errors, links, tokens, credentials, or service keys into tickets or telemetry.
Use restricted email fingerprints when correlating evidence.

## Disablement and rollback

Set `IDENTITY_PROVISIONING_ENABLED=false` and restart the backend. Do not delete Auth
users or profiles, reopen registration, roll back the forward migration, or restore
global administrator grants. Revoke an operator by changing its `platform_operators`
status through the separately reviewed operator-management process. Incomplete operations
remain resumable and evidence remains append-only.

Production enablement requires named security/operations approval, disposable-project
evidence, the completed SPEC-34 inventory, alert/dashboard ownership, and an immutable
deployment record. Static tests are not production certification.
