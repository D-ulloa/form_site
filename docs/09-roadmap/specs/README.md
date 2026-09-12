# Specs

Status: 2026-09-11.

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

- [`SPEC-38-gestion-de-arreglos-placeholder-navigation`](SPEC-38-gestion-de-arreglos-placeholder-navigation/) — original arrangement placeholder and navigation task; implemented and verified 2026-09-10, with its route content subsequently superseded by SPEC-39.
- [`SPEC-39-gestion-de-arreglos-dashboard-ordenes-abiertas`](SPEC-39-gestion-de-arreglos-dashboard-ordenes-abiertas/) — scoped open-order dashboard, SQL status filtering, and inert property action; verified locally 2026-09-10, migration applied to Supabase `multi-tenant` 2026-09-11, application deployment pending.
- [`SPEC-40-rol-inquilino-inicio-exclusivo`](SPEC-40-rol-inquilino-inicio-exclusivo/) — invitation-only `inquilino` role and exclusive Inicio route; verified locally and migration applied to Supabase development branch `multi-tenant` 2026-09-11; application deployment pending.
- [`SPEC-41-registro-autoservicio-y-creacion-de-organizacion`](SPEC-41-registro-autoservicio-y-creacion-de-organizacion/) — self-service registration and initial-owner organization bootstrap; pending.

## Identifier note

The direct-child arrangement work uses SPEC-38, while the shared contract
Make-delivery migration, backend worker, and integration tests also use SPEC-38.
Both records are retained under their existing identifiers. Do not create another
SPEC-38 dependency; assign the next unambiguous identifier before expanding either
workstream.
