# Documentation Structure Template

Status: template.

This file is a project-agnostic template for creating and maintaining a `docs/` structure. Adapt the names, sections, examples, and validation commands to the target project before treating it as canonical documentation.

## Purpose

Use this structure when a project needs documentation that is:

- organized by reader intent and implementation area;
- traceable from planning to implementation, tests, audits, and closure;
- friendly to both humans and AI coding agents;
- validated by an offline script or documented review checklist;
- kept in sync with code, runtime behavior, setup, and release decisions.

Do not copy project-specific names, roadmap IDs, feature names, provider names, specs, audits, or file paths from another repository. Replace them with the target project's actual architecture and workflow.

## Adaptation Checklist

Before creating this structure in a new project:

- Identify the project's main runtime, product, library, or service boundary.
- Identify the canonical setup flow and supported environments.
- Identify public contracts: APIs, CLI commands, environment variables, persisted files, schemas, tools, routes, and UI surfaces.
- Identify the development workflow: spec-first, test-first, issue-first, RFC-first, or another explicit process.
- Identify validation commands for docs, tests, type checks, builds, and release checks.
- Decide which sections are required now and which should stay omitted until they are real.
- Remove any template section that would become empty or misleading.

## Top-Level Layout

Use numbered folders to create a stable reading order:

```text
docs/
  01-overview/          System map, architecture, boundaries, runtime or product flow.
  02-setup/             Installation, configuration, secrets, external dependencies.
  03-operation/         How to run, operate, monitor, recover, and inspect the system.
  04-domain/            Domain model, core concepts, memory/context/model behavior, or equivalent project-specific domain.
  05-integrations/      APIs, tools, external services, providers, plugins, contracts.
  06-testing/           Test strategy, coverage, commands, fixtures, release checks.
  07-development/       Engineering workflow, standards, traceability, contribution rules.
  08-product/           UI, product API, UX surfaces, data, security, release notes if applicable.
  09-roadmap/           Specs, RFCs, decisions, audits, research, planned and completed work.
```

Rename folders only when the target project has a better domain term. Keep the numeric prefix if agents need predictable ordering.

## Canonical Reading Order

For a new contributor or AI coding agent:

1. Read `01-overview/project-overview.md`.
2. Read the architecture and boundary docs in `01-overview/`.
3. Read setup docs in `02-setup/`.
4. Read operation docs in `03-operation/`.
5. Read domain and integration docs in `04-domain/` and `05-integrations/`.
6. Read testing docs in `06-testing/`.
7. Read development workflow docs in `07-development/`.
8. Read product/UI docs in `08-product/` only when the task touches the product surface.
9. Read the relevant spec, RFC, audit, decision record, or research file in `09-roadmap/` before implementing scoped work.

## Suggested Files

### `01-overview/`

| File | Purpose |
|---|---|
| `project-overview.md` | First-read system map: purpose, capabilities, code map, canonical docs, and evolution principles. |
| `architecture.md` | Architecture summary: stack, modules, ownership, dependency rules, main contracts, and boundaries. |
| `runtime-flow.md` | Runtime, request, job, CLI, service, or user flow from entrypoint to completion. |
| `product-architecture.md` | Product boundary, implemented surfaces, user-facing capabilities, and links to product docs. Use only when the project has a product layer. |
| `design-system.md` | Shared design tokens, components, visual rules, and UI quality gates. Use only when the project has a UI. |
| `design-system-workflow.md` | Rules for changing or extending the design system. Use only when the project has a maintained design system. |
| `scaffolding.md` | Generated or manually maintained repository structure map. If generated, document the regeneration command and do not hand-edit it. |

### `02-setup/`

| File | Purpose |
|---|---|
| `installation.md` | Requirements, install commands, local startup, build steps, and baseline verification. |
| `environment.md` | Configuration layers, environment variables, local overrides, config files, and diagnostics. |
| `local-secrets-template.md` | Local secrets template with safe placeholder values and platform-specific examples. |
| `external-services.md` | Databases, providers, queues, storage, third-party APIs, or local emulators required by the project. |

### `03-operation/`

| File | Purpose |
|---|---|
| `usage.md` | How to use the main CLI, app, service, scripts, or workflows. |
| `runtime-files.md` | Runtime directories, persisted files, caches, logs, generated output, and cleanup rules. |
| `persisted-contracts.md` | Stable persisted payloads, schemas, filenames, migrations, and compatibility rules. |
| `monitoring-and-recovery.md` | Logs, metrics, health checks, recovery steps, retries, failure modes, and operational runbooks. |

### `04-domain/`

| File | Purpose |
|---|---|
| `domain-model.md` | Core concepts, entities, relationships, lifecycle states, and business rules. |
| `state-and-context.md` | State management, context assembly, session state, cache behavior, or equivalent domain mechanics. |
| `data-lifecycle.md` | Creation, update, retention, deletion, archival, import/export, and privacy boundaries. |
| `glossary.md` | Canonical terminology. Include forbidden or legacy terms when naming consistency matters. |

### `05-integrations/`

| File | Purpose |
|---|---|
| `api-contracts.md` | Public/internal APIs, route contracts, request/response shapes, error formats, and versioning. |
| `tool-contracts.md` | Tool names, arguments, outputs, error shape, side-effect policy, and batching rules. Use only when the project exposes tools to agents or automation. |
| `external-providers.md` | Provider configuration, credentials, retries, rate limits, capability differences, and fallbacks. |
| `template-variables.md` | Template placeholder names, expansion rules, defaults, and examples. Use only when templates exist. |
| `webhooks-and-events.md` | Event names, payloads, ordering, delivery guarantees, retries, and idempotency. |

### `06-testing/`

| File | Purpose |
|---|---|
| `testing-strategy.md` | Test types, commands, ownership, fixtures, test data, isolation rules, and when to run each suite. |
| `testing-coverage.md` | Current coverage map by module, behavior, risk area, or contract. |
| `testing-roadmap.md` | Known gaps and planned improvements for unit, integration, e2e, performance, security, smoke, and release tests. |
| `release-validation.md` | Release checklist, build validation, migration validation, manual QA, and rollback checks. |

### `07-development/`

| File | Purpose |
|---|---|
| `agent-guide.md` | Required reading and behavior rules for AI coding agents before changing the project. |
| `engineering-standards.md` | Engineering principles, naming rules, quality bar, refactor policy, comments, and git/change rules. |
| `sdd-workflow.md` | Spec-driven development workflow and minimum spec template. Use if the project requires specs before implementation. |
| `tdd-workflow.md` | Test-driven development workflow and test selection guidance. |
| `traceability.md` | How specs, tasks, issues, PRs, tests, docs, and closure evidence connect. |
| `documentation-structure-guide.md` | This template or its adapted project-specific version. |
| `migration-status.md` | Migration state, completed work, active transition areas, and retirement criteria. Use only during migrations. |
| `module-boundaries.md` | Dependency and ownership rules for modules/packages/services. |

### `08-product/`

Use this folder only when the project has a product, UI, web app, mobile app, admin console, dashboard, or product API.

| File | Purpose |
|---|---|
| `README.md` | Product docs index, read order, local quick start, roadmap evidence, and product boundaries. |
| `product-architecture.md` | Product architecture, user roles, surfaces, navigation, data flow, and backend boundaries. |
| `frontend-handoff.md` | Practical implementation handoff for frontend engineers or UI agents. |
| `product-api.md` | Product API/BFF routes, contracts, authentication, authorization, and persistence rules. |
| `data-and-persistence.md` | Product data model, local/remote persistence, migrations, and storage boundaries. |
| `security-and-privacy.md` | Product security, privacy, authorization, sensitive data, and redaction rules. |
| `ui-surfaces.md` | UI route/screen map and expected behavior for each surface. |
| `local-user-guide.md` | Manual local usage flow for validating the product. |
| `testing-and-release-hardening.md` | Product-specific test and release readiness checklist. |
| `accepted-risks.md` | Known accepted risks, owner, reason, expiration/review date, and mitigation. |

### `09-roadmap/`

Use this folder for durable planning and evidence, not temporary notes.

```text
09-roadmap/
  specs/
    pending/
    completed/
    research/
  audits/
  decisions/
```

| Path | Purpose |
|---|---|
| `specs/pending/` | Approved or proposed work not yet completed. |
| `specs/completed/` | Completed specs with closure evidence. Keep them as history. |
| `specs/research/` | Research documents used as input for future specs or architecture decisions. |
| `audits/` | Readiness, security, release, architecture, integration, or quality audits. |
| `decisions/` | Architecture decision records or other durable decisions. |

## Naming Conventions

Use names that are stable and easy for agents to infer:

- canonical docs: `NN-area/kebab-case-name.md`;
- pending specs: `09-roadmap/specs/pending/NN-SPEC-short-slug.md`;
- completed specs: `09-roadmap/specs/completed/NN-SPEC-short-slug.md`;
- research docs: `09-roadmap/specs/research/NN-RESEARCH-short-slug.md`;
- audits: `09-roadmap/audits/YYYY-MM-DD-short-slug-audit.md`;
- decisions: `09-roadmap/decisions/YYYY-MM-DD-short-slug.md`.

If the project already has a standard naming convention, document that convention here and use it consistently.

## File Templates

### Canonical Doc Template

```markdown
# Document Title

Status: YYYY-MM-DD.

One short paragraph stating this document's authority and scope.

## Purpose

What this doc explains and when to read it.

## Scope

- Includes:
- Does not include:

## Contract

Stable behavior, names, file paths, commands, payloads, or boundaries.

## Maintenance

When this file must be updated and which verification command applies.
```

### Spec Template

```markdown
# SPEC-short-slug

**Date:** YYYY-MM-DD

## Context

Problem, debt, opportunity, or decision motivating the work.

## Objective

Expected result in one concrete sentence.

## Scope

- Includes:
- Does not include:

## Affected contracts

- APIs:
- CLI:
- Tools:
- Persisted files:
- Environment variables:
- UI:
- Documentation:

## Expected behavior

- Main case:
- Edge cases:
- Expected errors:

## Required tests

- Unit:
- Integration:
- E2E:
- Regression:
- Security/performance/migration/observability if applicable:

## Acceptance criteria

- Criterion 1:
- Criterion 2:
- Criterion 3:

## Verification

Commands or manual checks required before closure.
```

### Audit Template

```markdown
# Audit Title

**Date:** YYYY-MM-DD

## Scope

What was inspected and what was intentionally excluded.

## Files inspected

- `path/to/file`

## Findings

| Severity | Finding | Evidence | Recommendation |
|---|---|---|---|
| High/Medium/Low |  |  |  |

## Open questions

- Question:

## Verdict

GO, NO-GO, or GO WITH RISKS, with rationale.
```

### Decision Template

```markdown
# Decision Title

**Date:** YYYY-MM-DD

## Status

Proposed, accepted, superseded, or rejected.

## Context

What forced the decision.

## Decision

The chosen direction.

## Consequences

Benefits, tradeoffs, migration work, and follow-up checks.
```

## Maintenance Rules

- Update docs in the same change as behavior, setup, contract, runtime file, tool, provider, integration, persistence, security, or UI changes.
- Keep generated docs generated. Document the generator and regeneration command.
- Keep completed specs as traceability evidence instead of deleting them.
- Keep roadmap files scoped: specs define intended behavior, research informs decisions, audits record findings, decisions record choices.
- Use one terminology source of truth, usually `04-domain/glossary.md` or `07-development/engineering-standards.md`.
- If a docs validation script exists, update its expected file list when adding, removing, or renaming canonical docs.
- Run the project's docs validation command after changing docs topology, links, specs, audits, or canonical docs.

## Validation Checklist For Agents

Before creating or modifying this documentation structure:

- Inspect the current repository tree and existing docs.
- Identify whether the change adds a canonical doc, spec, research doc, audit, or decision.
- Read the project's agent guide, engineering standards, and traceability rules if they exist.
- Preserve generated files by regenerating them instead of hand-editing them.
- Update docs validation configuration when adding/removing canonical docs.
- Run docs validation.
- If repository structure changed, regenerate the scaffolding/tree document and run docs validation again.

## Minimal Version

For a small project, start with this reduced set:

```text
docs/
  01-overview/
    project-overview.md
    architecture.md
  02-setup/
    installation.md
    environment.md
  03-operation/
    usage.md
  06-testing/
    testing-strategy.md
  07-development/
    agent-guide.md
    engineering-standards.md
    documentation-structure-guide.md
  09-roadmap/
    specs/
      pending/
      completed/
```

Add the other folders only when the project has real content for them.
