# Specs

Status: 2026-09-01.

## Current convention

New specifications live directly under `docs/09-roadmap/specs/`, one folder per
specification. Each folder contains:

- `SPEC-<number>-<name>.md` — the durable requirements and scope.
- `TASK-<number>-<name>.md` — one or more implementation tasks.
- `IMPLEMENTATION-GUIDE.md` — sequencing, validation, and handoff guidance.

Keep these files together and do not place new folder-style specs in `pending/`
or `completed/`. Those directories retain the older status-based documents and
historical records. Research remains in `research/` unless it is promoted into a
new direct-child spec folder.

## Current direct-child specs

- [`SPEC-38-gestion-de-arreglos-placeholder-navigation`](SPEC-38-gestion-de-arreglos-placeholder-navigation/) — arrangement placeholder and navigation task; pending review.

## Identifier note

The direct-child arrangement placeholder currently uses SPEC-38, while the latest
shared contract Make-delivery migration, backend worker, and integration tests also
use SPEC-38. This collision is documented but not silently resolved here; assign a
new unambiguous number before expanding either line of work or marking it complete.
