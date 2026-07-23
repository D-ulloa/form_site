# Documentation Index

Status: 2026-07-21.

This repository uses a structured documentation layout under `docs/`.
The top-level files are intentionally minimized in favor of numbered folders that preserve reading order.

## Docs structure

- `01-overview/`
  - `project-overview.md` — system map, purpose, boundaries, runtime flow.
  - `architecture.md` — stack and module architecture.
- `02-setup/`
  - `installation.md` — install, build, and local startup instructions.
  - `environment.md` — environment variables and configuration.
  - `external-services.md` — Google Drive, Google Forms/Sheets, and Make integration details.
- `03-operation/`
  - `usage.md` — user and API usage patterns.
  - `runtime-files.md` — runtime artifacts, logs, and build outputs.
- `05-integrations/`
  - `api-contracts.md` — property and Contract Generation API request/response contracts and integration boundaries.
- `06-testing/`
  - `testing-strategy.md` — current testing status and recommended validation commands.
- `07-development/`
  - `engineering-standards.md` — coding conventions, project organization, and documentation expectations.
- `09-roadmap/`
  - `README.md` — roadmap folder guidance.
  - `specs/pending/README.md`
  - `specs/completed/README.md`
  - `specs/research/README.md`
  - `audits/README.md`
  - `decisions/README.md`

## Existing project docs

- `docs/prd.md` — original property-workflow product requirements and scope.
- `docs/09-SPEC-contract-generation.md` — Contract Generation workflow, schema, integration, security, and acceptance requirements.

## How to use this folder

1. Start with `docs/README.md` to understand the docs layout.
2. Read `01-overview/project-overview.md` for the system summary.
3. Use the numbered folders to follow the recommended order.
4. Keep `docs/prd.md` as the product scope source document.
