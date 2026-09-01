# Documentation Index

Status: 2026-09-01.

This repository uses a structured documentation layout under `docs/`.
The top-level files are intentionally minimized in favor of numbered folders that preserve reading order.

## Docs structure

- `01-overview/`
  - `project-overview.md` — system map, purpose, boundaries, runtime flow.
  - `architecture.md` — stack and module architecture.
- `02-setup/`
  - `installation.md` — install, build, and local startup instructions.
  - `environment.md` — environment variables and configuration.
  - `external-services.md` — Supabase, Google Drive/Sheets, legacy Google Forms, and Make integration details.
- `03-operation/`
  - `usage.md` — user and API usage patterns.
  - `runtime-files.md` — runtime artifacts, logs, and build outputs.
  - `spec28-platform-controls-recovery-and-incidents.md` — staged deployment, recovery, alerts, and six incident playbooks.
  - `spec31-private-assets-runbook.md` — private asset operation and recovery boundary.
  - `spec32-integrations-outbox-runbook.md` — organization-scoped provider/outbox operation.
  - `spec33-commercial-extension-framework.md` — fail-closed optional-module operation.
  - `spec34-migration-cutover-and-solar-runbook.md` — migration evidence, certification, containment, and Solar gates.
- `05-integrations/`
  - `api-contracts.md` — property and Contract Generation API request/response contracts and integration boundaries.
- `06-testing/`
  - `testing-strategy.md` — current testing status and recommended validation commands.
- `07-development/`
  - `engineering-standards.md` — coding conventions, project organization, and documentation expectations.
- `09-roadmap/`
  - `README.md` — roadmap folder guidance.
  - `specs/README.md` — current spec-folder convention and index.
  - `specs/pending/README.md` — legacy pending-spec index.
  - `specs/completed/README.md`
  - `specs/research/README.md`
  - `audits/README.md`
  - `decisions/README.md`

The roadmap includes staged repository implementations for SPEC-25 through SPEC-37,
plus the current SPEC-38 shared Make-delivery migration and a separate direct-child
SPEC-38 arrangement placeholder. Their status records distinguish mounted behavior
from disabled/staged code, external approvals, real-database/provider/recovery
evidence, and the block on Solar real data.


## Existing project docs

- `docs/prd.md` — original property-workflow product requirements and scope.
- `docs/09-roadmap/specs/completed/10-SPEC-contract-generation-reworked.md` — implemented Supabase-backed foundation for the two-party Contract Generation workflow.
- `docs/09-roadmap/specs/completed/11-SPEC-contract-generation-reworked.md` — implemented repeatable Inquilino/Garantes client entries, private DNI pairs, computed date fields, and the IPC/ICL Ajuste dropdown.
- `docs/09-roadmap/specs/completed/12-SPEC-contract-generation-frontend-focused-en.md` — implemented Spanish-only contract UI, Propietario presentation, compact actions, and conditional guarantor groups.
- `docs/09-roadmap/specs/completed/13-SPEC-contract-generation-reworked.md` — manual entry creation, Contrato subdivisions, and ordered database-backed administrator inspection with media.
- `docs/09-roadmap/specs/completed/14-SPEC-contract-generation-reworked.md` — implemented per-guarantor salary-receipt/property-guarantee supporting files with passive selection, private storage, and subsection-grouped administrator views.
- `docs/09-roadmap/specs/completed/15-SPEC-contract-generation-reworked.md` — implemented contract UI polish, separated generated-link cards, guarantee grouping, and downloadable attachments.
- `docs/09-roadmap/specs/completed/16-SPEC-contract-generation-reworked.md` — implemented editable feedback/admin submissions, `Direccion`, DNI parity, and generated-client header cleanup.
- `docs/09-roadmap/specs/completed/17-SPEC-contract-generation-reworked.md` — implemented stable links, Argentinian placeholders, hybrid administrator authentication, and required DNI uploads.
- `docs/09-roadmap/specs/completed/18-SPEC-contract-generation-reworked.md` — implemented IPC/ICL copy, simplified upload guidance, and editable feedback.
- `docs/09-roadmap/specs/completed/19-SPEC-contract-generation-reworked.md` — implemented Supabase email/password authentication and immediate admin onboarding while retaining Google OAuth as an alternate login.
- `docs/09-roadmap/specs/research/09-SPEC-contract-generation.md` — superseded Google Forms/Sheets workflow retained for history.
- [`docs/09-roadmap/specs/SPEC-38-gestion-de-arreglos-placeholder-navigation`](09-roadmap/specs/SPEC-38-gestion-de-arreglos-placeholder-navigation/) — current direct-child spec folder example; its arrangement is pending review.
- `docs/03-operation/spec32-integrations-outbox-runbook.md` — current organization-scoped outbox and contract Make-delivery operation.

## How to use this folder

1. Start with `docs/README.md` to understand the docs layout.
2. Read `01-overview/project-overview.md` for the system summary.
3. Use the numbered folders to follow the recommended order.
4. Use `docs/prd.md` as the property-workflow scope source; the current Contract Generation scope is defined by SPEC-10 through SPEC-19 and the canonical operation/API docs.
