# SPEC-33 acceptance traceability

Status: additive framework evidence, 2026-08-19. All five optional modules remain
`not_configured`. No module is selected, certified, or enabled, so module-specific acceptance
criteria remain future addendum and SPEC-34 gates.

| Scope | Implementation evidence | Automated evidence |
|---|---|---|
| Closed module registry | `20260819300000_spec33_commercial_extension_framework.sql` defines only the five SPEC-33 keys and seeds all as `not_configured` | `spec33-migration-contract.test.ts` |
| Certification gate | Definition and organization state machines require versioned progression, evidence fields, and certified definition before organization certification/enablement | migration and backend domain tests |
| Organization isolation | Non-null organization ownership, uniqueness, tenant-leading indexes, forced RLS, restricted grants, generic cross-organization gate failure | migration and `spec33-extension-framework.test.ts` |
| Authorization ordering | Trusted organization/core authorization precede module, entitlement, and quota checks; commercial state only narrows access | backend domain tests |
| Browser safety | Closed response parser, secret/evidence canaries, organization/epoch query keys, stale response rejection, server-enabled route check | `extensionState.test.ts` |
| Operations | Runbook covers enablement boundary, disablement, incident, backup/restore, deletion, and future certification | documentation review |

## Criteria disposition

- Criteria 2–5, 12, 30, 33–34, 36, 38–39: framework invariants, fail-closed state,
  scope/order helpers, safe client state, and automated no-production-data evidence are present.
- Criteria 6–11: billing is unselected and off. No plan, entitlement, subscription, invoice,
  tax, portal, webhook, usage-export, price, or provider record is created.
- Criteria 13–16: advanced branding/custom domains are unselected and off. Existing safe basic
  branding remains governed by SPEC-26/31; no hostname/certificate/router state is created.
- Criteria 17–21: enterprise SSO is unselected and off. No IdP, SAML/OIDC callback, JIT,
  enforcement, or identity-link state is created.
- Criteria 22–24: dedicated isolation is unselected and off. No environment or transfer is provisioned.
- Criteria 25–28: analytics is unselected and off. No fact, report, cache, export, aggregate, or warehouse data is created.
- Criteria 1, 29, 31–32, 35, 37, 40: prior-spec approvals, per-module retention/operations,
  real-database/adversarial certification, canonical review, SPEC-34 inventory, and named
  cross-functional approvals remain external gates.

This framework does not mark SPEC-33's vendor modules complete and does not authorize Solar.
