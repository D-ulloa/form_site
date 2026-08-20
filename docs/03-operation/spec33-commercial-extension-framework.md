# SPEC-33 commercial extension framework runbook

Status: framework installed; every optional module is `not_configured` and unavailable.

## Safety baseline

The five closed module keys are `billing`, `custom_domains`, `enterprise_sso`,
`dedicated_isolation`, and `analytics`. An absent organization assignment and every
state except `enabled` deny the module. Core authentication, organization lifecycle,
membership, capability, resource scope, and RLS checks run before this gate. Plan,
payment, hostname, SSO assertion, deployment placement, or analytics state never grants
authority.

The repository implementation creates no prices, tax rules, provider accounts, customer
domains, identity providers, dedicated environments, or analytics data. No module route,
callback, worker, or navigation entry is mounted by this framework.

## Certification and enablement

Do not advance a module until its independently approved addendum supplies the migration,
code, tests, documentation, operations evidence, and named reviewer. Advance the global
definition through `not_configured -> design_approved -> implemented -> certified`, then
advance the exact organization assignment through the same sequence. Only an assignment
already in `certified` may become `enabled`, and only when the global definition remains
certified.

Normal browser roles have no table or transition authority. A future approved control-plane
adapter must use optimistic versions, an exact organization UUID and module key, a bounded
request ID, append-only state evidence, and the SPEC-28 audit/support boundary. Never edit
rollout state from a customer request or provider webhook.

## Disablement and incident response

To disable an active module, move only the affected organization from `enabled` back to
`certified`; this removes availability without claiming that certification evidence was
destroyed. Disable the module's routes, UI, callbacks, jobs, cached projections, and provider
delivery claims together. Preserve audit, legal-hold, deletion, and reconciliation duties.

Treat any cross-organization success, uncertified enablement, missing evidence, or module
state granting core authority as a containment incident. Disable the exact organization/module,
invalidate module caches and ephemeral links, pause its workers/callbacks, preserve redacted
evidence, inspect Azar/Solar direct-ID and switched-context access, and follow the SPEC-28
incident/recovery runbook. A provider outage or payment failure must never trigger an auth
fallback.

## Backup, restore, and deletion

Back up module definitions, organization assignments, and immutable state events with the
organization data. After restore, leave every optional module unavailable until definition,
assignment, evidence, secrets/providers, caches, jobs, tombstones, and source ownership are
reconciled. Organization deletion must include enabled-module data classes in its approved
deletion/legal-hold plan; restoring a backup must not resurrect retired assignments or deleted
derived data.

## Verification

Run backend migration/domain tests and frontend extension-state tests. Certification for an
actual module additionally requires its vendor sandbox/fakes, real PostgreSQL RLS checks,
Azar/Solar direct-ID and context-switch attacks, disable/restore/deletion exercises, and
SPEC-34 rollout inventory. Automated tests must not use production credentials or customer data.
