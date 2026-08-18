# SPEC-25 acceptance traceability

Status: 2026-08-18 repository implementation review. `External` items block
production completion and require protected evidence plus named reviewers.

| AC | Status | Code, test, documentation, or required evidence |
|---:|---|---|
| 1 | External | policy baseline records all POL values; named product/security approval required |
| 2 | External | SPEC-25 invariants retained unchanged; named approval required |
| 3 | External | protected environment/provider manifests and reviewer |
| 4 | External | protected Auth/grant classification and reviewer |
| 5 | External | protected database manifests/checksums |
| 6 | External | protected Storage manifests/checksums/classification |
| 7 | External | protected runtime/local/export/backup inventory |
| 8 | Partial | new-folder ACL containment in `googleDriveService`; existing ACL inventory/remediation external |
| 9 | External | protected Sheets/Make/env/credential inventory |
| 10 | External | balanced protected reconciliation tables |
| 11 | External | readable encrypted backup/checksum evidence |
| 12 | External | protected Azar/quarantine/removal classification |
| 13 | Implemented | auth router `REGISTRATION_CLOSED`; backend route test |
| 14 | Implemented | registration service has no grant write; forward migration; auth tests |
| 15 | Implemented | Google handoff only reads reviewed grant; no-write test |
| 16 | Implemented | `20260818000000_spec25_containment.sql`; migration marker test |
| 17 | External | temporary grant review/freeze/audit evidence |
| 18 | Partial | independent session secret/version and invalidation test; production version bump evidence external |
| 19 | Implemented | property session check precedes parsing/issuance; route test |
| 20 | Implemented | server actor overwrite; frontend omits actor; attribution test |
| 21 | Implemented | exact-development auth and deprecated-flag/startup tests |
| 22 | Partial | explicit trusted-gateway flag and Azar-only docs; owner/expiry evidence external |
| 23 | Partial | forward migration and deferred response implemented; Make revocation/history review external |
| 24 | Implemented | no Drive permission creation; ACL prerequisite and static test |
| 25 | External | existing Drive resource classification/remediation |
| 26 | External | credential fingerprints, rotations, and propagation checks |
| 27 | Implemented | Vercel logger emits only safe identifiers/outcome |
| 28 | Implemented | containment/incident runbook; named protected contacts external |
| 29 | Partial | repository suites pass; staging/provider sign-off external |
| 30 | Implemented | canonical architecture, environment, services, operation, API, testing, and engineering docs updated |
| 31 | Partial | Azar-only release guard documented; deployed environment verification external |
| 32 | External | named product/security/migration/operations approval |

Automated reviewer evidence is the passing backend/frontend test, typecheck,
lint, build, focused scan, and `git diff --check` output from the implementation
change. External rows must link to protected evidence rather than copying secrets
or customer data into Git.
