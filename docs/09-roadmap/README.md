# Roadmap

Status: 2026-09-11.

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
states and open external gates. The direct-child SPEC-38, SPEC-39, and SPEC-40
folders have local implementation evidence; their hosted rollout states are recorded
in each task. SPEC-38 remains an identifier collision: the arrangement placeholder
and shared contract Make-delivery work use the same number. Keep those historical
records, avoid new SPEC-38 dependencies, and assign the next unambiguous identifier
before expanding either workstream. No staged artifact authorizes production Solar
data or production provider changes.
