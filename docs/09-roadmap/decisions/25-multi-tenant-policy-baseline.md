# SPEC-25 multi-tenant policy baseline

Decision date: 2026-08-18. Status: adopted as the implementation baseline;
production approval still requires named product and security sign-off.

| ID | Adopted value | Accountable owner | Consumers |
|---|---|---|---|
| POL-01 | Verified legacy material is Azar-owned; ambiguity is quarantined | migration | MT-10 |
| POL-02 | Platform-created organizations and invite-only membership | product | MT-02/03 |
| POL-03 | Role-based organization visibility; creator/assignee are attribution/filter fields | product/security | MT-02/05/06 |
| POL-04 | Multiple memberships supported from the initial schema | product | MT-02/03 |
| POL-05 | Platform-managed credentials with one private destination per organization | security/operations | MT-08 |
| POL-06 | Database revisions are canonical; each external edit requires an explicit append/update/event choice | product | MT-06/08 |
| POL-07 | Path routing under `/t/:organization_slug`; safe organization branding; custom domains deferred | product | MT-02/03/05/09 |
| POL-08 | Server-side plan/entitlement structure; automated billing deferred | product | MT-02/04/09 |
| POL-09 | Numeric retention schedule below, subject to legal validation before Solar | data/privacy | MT-02/04/07 |
| POL-10 | No support content access by default; exceptions are stepped-up, least-privilege, reasoned, time-limited, and audited | security | MT-03/04 |
| POL-11 | Suspension immediately blocks mutations/delivery; owner read/export and reactivation require an approved rule | product/security | MT-02/03/08 |
| POL-12 | Incident roles and SEV targets follow the SPEC-25 runbook | security/operations | MT-04/operations |

Initial maximum retention after relationship/record closure: contract data 10
years; DNI and guarantor evidence 10 years; property media 2 years; security and
audit evidence 7 years; unattached uploads 24 hours; temporary exports 7 days;
provider copies follow the source class; rolling backups 35 days. Legal hold
overrides deletion. These are product limits, not legal advice. Qualified privacy
counsel must validate all SaaS, agency, data-subject, and provider jurisdictions
before Solar and distinguish statutory retention from product preference in the
protected approval record.

Only accountable product and security owners may change this record. Changes
require regression review of the downstream SPECs, all fifteen isolation
invariants, retention/deletion behavior, and migration evidence. This record
contains no customer identifiers or provider resource names.
