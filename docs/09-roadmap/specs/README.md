# Specs

Status: 2026-09-22.

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
- [`SPEC-42-propiedades-e-invitaciones-de-inquilinos-en-arreglos`](SPEC-42-propiedades-e-invitaciones-de-inquilinos-en-arreglos/) — lightweight properties created from the arrangements dashboard, property-bound inquilino invitations and atomic association on acceptance; verified locally and both migrations applied to Supabase development branch `multi-tenant` 2026-09-12; application deployment pending.

- [`SPEC-43-solicitudes-de-arreglo-para-inquilinos`](SPEC-43-solicitudes-de-arreglo-para-inquilinos/) — local implementation and verification of tenant repair requests, private media, shared property history and status management; hosted rollout and SPEC-31/POL-09 gates pending.
- [`SPEC-44-rol-personal-inicio-exclusivo`](SPEC-44-rol-personal-inicio-exclusivo/) — implemented and verified locally: scoped personal invitations, atomic membership profiles and exclusive Inicio. SQL/upgrade/concurrency, regression suites and six browser cases passed. Migration applied to development `multi-tenant`; personal invitations enabled in the local backend environment. Application deployment/hosted smoke tests pending ([evidence](../../06-testing/spec44-personal-invitations.md), 2026-09-12).
- [`SPEC-45-dashboard-personal-asignacion-y-rechazo-de-arreglos`](SPEC-45-dashboard-personal-asignacion-y-rechazo-de-arreglos/) — implemented and verified locally: assigned-only personal dashboard, internal assignment/rejection, shared automatic updates and first-time inquilino phone capture. SQL/upgrade/concurrency, regression and browser checks passed. Both migrations applied and verified on development `multi-tenant`; application deployment, rejection activation and hosted smoke tests pending ([evidence](../../06-testing/spec45-personal-assignments.md), [runbook](../../03-operation/spec45-personal-assignments-runbook.md), 2026-09-12).
- [`SPEC-46-reporte-de-trabajo-y-aceptacion-de-arreglos`](SPEC-46-reporte-de-trabajo-y-aceptacion-de-arreglos/) — pending: personal work reports, shared `Pendiente de aceptación` state, and atomic tenant acceptance that finalizes and archives the order (2026-09-22).
- [`SPEC-47-visibilidad-de-identificadores-y-busqueda-en-arreglos`](SPEC-47-visibilidad-de-identificadores-y-busqueda-en-arreglos/) — pending: hide arrangement property/member/order identifiers across all role dashboards and add property/order search for owner, admin and member (2026-09-22).

## Identifier note

The direct-child arrangement work uses SPEC-38, while the shared contract
Make-delivery migration, backend worker, and integration tests also use SPEC-38.
Both records are retained under their existing identifiers. Do not create another
SPEC-38 dependency; assign the next unambiguous identifier before expanding either
workstream.
