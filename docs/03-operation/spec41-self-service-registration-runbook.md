# SPEC-41 self-service registration runbook

Status: implementation available; keep `SELF_SERVICE_REGISTRATION_ENABLED=false` until a disposable, production-shaped project has certified the migration and Auth configuration.

## Enablement gate

Apply `20260904120000_spec41_self_service_registration.sql` after the existing SPEC-26 through SPEC-37 migrations. Confirm `anon` and `authenticated` have no table or function grants on `self_service_onboarding_*`; only the backend service role may call the RPCs. Configure a separate 32+ byte `SELF_SERVICE_ONBOARDING_EMAIL_PEPPER`, `PLATFORM_RATE_LIMIT_PEPPER`, safe default locale/time zone, and terms version.

In Supabase Auth, disable **Confirm email** for this approved onboarding flow. The server creates password identities with `email_confirm: true`; do not add a verification gate or CAPTCHA. Test password and Google sign-up with synthetic addresses only before production canary.

## Safe recovery

An operation records no password, raw email, token, or secret. If the browser loses a response after Auth creation, the customer can sign in normally; support should correlate only the operation UUID, request ID, and restricted email fingerprint. A retry with the identical operation is idempotent. Do not delete the Auth user, profile, organization, or membership to recover a partial onboarding operation.

`failed_recoverable` means an authenticated continuation may safely re-read and complete its bound operation. `rejected` means an existing identity was detected; disclose only the generic login guidance. A disabled feature flag stops new claims but leaves login, invitation acceptance, and `platform:provision-organization` unaffected.

## Rollback and incident handling

Turn `SELF_SERVICE_REGISTRATION_ENABLED=false` to stop new public starts. Preserve operation and organization evidence, investigate with sanitized correlation IDs, and repair only through forward migrations or the service recovery path. Never expose service keys/RPCs to the browser, manually insert memberships, reopen legacy global-admin registration, or delete a partially provisioned identity as a rollback shortcut.
