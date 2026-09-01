# Roadmap

Status: 2026-09-01.

This folder is reserved for durable plans, specifications, audits, and decisions.

## Expected structure

- `specs/` — current direct-child spec folders plus legacy status/history indexes.
- `specs/pending/` — legacy pending-spec documents.
- `specs/completed/` — legacy completed-spec documents.
- `specs/research/` — historical research and superseded proposals.
- `audits/` — acceptance, traceability, and documentation audits.
- `decisions/` — durable architecture and product decisions.

New specs must be created directly under `specs/` in a folder named for the spec.
Each folder contains the specification, one or more task files, and an
`IMPLEMENTATION-GUIDE.md`. Do not place new specs in `pending/` or `completed/`;
those folders remain for historical material and legacy indexes.

SPEC-25 through SPEC-37 have repository implementations with different activation
states and open external gates. SPEC-38 is currently ambiguous: the direct-child
arrangement placeholder uses that number, while the latest migration, backend worker,
and integration tests use SPEC-38 for shared contract Make delivery. Resolve that
identifier collision before assigning a final status or starting another SPEC-38.
No staged artifact authorizes production Solar data or production provider changes.
