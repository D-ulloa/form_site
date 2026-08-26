# SPEC-36 organization and initial-owner provisioning runbook

Status: repository implementation, disabled by default, 2026-08-25. This runbook does
not authorize an Azar/Solar action or any production customer operation.

## Activation gate

Reconcile the migration ledger and apply SPEC-35 followed by
`20260825160000_spec36_organization_provisioning.sql` in a disposable,
production-shaped project. Confirm the service-role key exists only in the restricted
operations process, the normal web process has no `platform:provision-organization`
route, and `anon`/`authenticated` cannot read the evidence tables or execute any
`spec36_*` function.

Before enabling execution, record named security/operations approval, clear the owner
and slug against SPEC-34 inventory, verify the exact project ref, enroll an active
MFA-required platform operator, and obtain a fresh unrevoked AAL2 session. Run the
same-operation and same-slug concurrency cases plus response-loss reconciliation in the
disposable project. SPEC-34 separately controls all real Azar/Solar work.

## Manifest and preflight

Create the reviewed JSON manifest described by SPEC-36 in restricted storage outside
Git. It must be a regular file readable only by its owner (`chmod 600`), use schema
version 1 and an `orgprov_...` operation ID, and contain no secrets. Record its hash from
the default read-only command:

If the named platform operator will also be the initial owner, the approval must explicitly
cover that exception and the manifest must set
`"operator_owner_identity_equality_approved": true`; otherwise equality fails closed.

```sh
npm --prefix backend run platform:provision-organization -- \
  --manifest /restricted/operations/customer.json
```

Dry-run validates and canonicalizes the manifest, checks the exact production target,
operator/AAL2 session, slug, migration inventory, and exact Auth identity. It performs
no Auth, profile, organization, membership, event, email, or session write. Resolve every
reported blocker and review the printed fingerprint; do not edit the manifest afterward.

## Execute and verify

Open a short approved execution window by setting
`ORGANIZATION_PROVISIONING_ENABLED=true` only in the restricted process, then run:

```sh
npm --prefix backend run platform:provision-organization -- \
  --manifest /restricted/operations/customer.json \
  --execute \
  --expected-fingerprint <64-lowercase-hex-from-dry-run>
```

The command provisions/reconciles the owner through SPEC-35, calls the canonical
organization service and atomic SPEC-26 RPC, verifies organization/settings/active owner
membership/creation event, and returns a redacted receipt. It never returns a password,
activation link, token, session, or service key. Verify the receipt IDs against restricted
database evidence and immediately set `ORGANIZATION_PROVISIONING_ENABLED=false`.

The receipt's handoff state remains `pending` until SPEC-37 delivery runs. A pending or
failed handoff does not justify recreating or deleting the organization. The owner must
activate/authenticate and obtain a fresh server-confirmed organization context before use.

## Status, retry, and incidents

```sh
npm --prefix backend run platform:provision-organization -- \
  --operation-id orgprov_customer_0001 --status
```

- Retry only with the identical operation ID, unchanged manifest, and exact fingerprint.
- `already_applied` is success after replay or response-loss reconciliation; do not run a
  second operation.
- `IDEMPOTENCY_CONFLICT`, `SLUG_CONFLICT`, owner ambiguity/ineligibility, or migration
  conflict requires human review and a recorded disposition.
- `READBACK_FAILED` leaves handoff disabled in `attention_required`. Escalate and inspect
  the reserved IDs and atomic records; never create another organization as a workaround.
- Provider ambiguity follows the SPEC-35 runbook. Reuse the same operation; never use a
  new key to force another Auth creation.
- Handoff failure is resumed through SPEC-37 using the committed receipt; it never rolls
  back membership or customer state.

Logs and tickets use operation ID, request ID, fingerprint, safe outcome, and restricted
evidence references only. Do not paste email, manifests, provider errors, or credentials.

## Disablement and rollback

Disable the command and revoke its deployment/operator access. Preserve operations,
events, the committed organization, and its last owner. Do not roll back the forward
migration, delete a successful organization, reopen self-service registration, write
tables manually, or restore a global customer key/legacy administrator grant.
