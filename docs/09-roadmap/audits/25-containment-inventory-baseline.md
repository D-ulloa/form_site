# SPEC-25 redacted containment and inventory baseline

Capture date: 2026-08-18. Status: repository inventory complete; deployed/provider
inventory and production sign-off are unresolved and release-blocking. Detailed
manifests belong in approved encrypted evidence storage, not Git.

## Repository containment evidence

| Boundary | Implemented evidence |
|---|---|
| Registration/admin | real-data `403 REGISTRATION_CLOSED`; login checks an existing grant; forward migration removes signup grant |
| Sessions | independent session secret/version; role-token secret unchanged |
| Property | session checked before parsing/issuance; actor overwritten server-side; frontend sends no actor |
| Compatibility identity | `X-User-Id` exact development only; gateway requires explicit adapter flag |
| Make | forward migration drops fixed trigger/function; historical literal remains evidence and needs external revocation |
| Drive | parent rejects `anyone`/domain ACLs and requires user/group access; new folders receive no permission creation |
| Logs | serverless output is limited to event, Azar placeholder, opaque submission ID, and outcome |
| Release | canonical docs label the system Azar-only and block real Solar data |

## Protected-source reconciliation

For every source, evidence records capture UTC, query/API version, ordered
canonical manifest checksum, status counts, evidence reference, reviewer, and
review UTC. `observed = Azar + quarantine + removal + unresolved`. Inaccessible
sources are unresolved, never zero.

| Source | Observed | Azar | Quarantine | Removal | Unresolved | Gate |
|---|---:|---:|---:|---:|---:|---|
| Supabase Auth/admin grants | — | — | — | — | all | blocking |
| Contract rows/children/functions/grants/RLS | — | — | — | — | all | blocking |
| Storage buckets/objects/references | — | — | — | — | all | blocking |
| Deployments/env names/credential fingerprints | — | — | — | — | all | blocking |
| Runtime logs/local copies/backups/exports | — | — | — | — | all | blocking |
| Google Drive/Sheets/resources/ACLs | — | — | — | — | all | blocking |
| Make hooks/scenarios/history/connections | — | — | — | — | all | blocking |
| Routes/clients/caches/branding/feature flags | — | — | — | — | all | blocking |

Canonicalization: database by table/primary key; Storage by bucket/path; Drive
by resource ID; users/grants by immutable user ID; environment credentials by
environment/variable name with fingerprints only; Sheets by row count and a
protected stable row checksum. Unknown-owner items receive a quarantine ID,
reason, evidence reference, reviewer, owner, and next action.

Production completion also requires readable encrypted backup evidence, Make
revocation/history review, existing Drive ACL remediation, credential review and
rotation evidence, reviewed Azar grants, session-version rollout, staging checks,
balanced counts, and named product/security/migration/operations approvals. No
claim of SPEC completion is made until those artifacts exist outside Git.
