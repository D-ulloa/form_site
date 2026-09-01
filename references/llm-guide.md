# LLM and Contributor Guide

Status: 2026-09-01.

This guide is for engineers and coding agents working on the form-site
repository. It describes the project documentation that exists in this checkout;
do not assume that files from another project or template are present.

## Main rule

For a code or behavior change:

Read context -> confirm scope -> write or update the spec -> write tests -> implement -> update canonical docs -> verify

Documentation-only changes may skip implementation tests, but they must be checked
against the current source tree and pass `git diff --check`.

## Minimum reads

1. [`docs/README.md`](../docs/README.md) for the documentation map.
2. [`docs/01-overview/project-overview.md`](../docs/01-overview/project-overview.md) for purpose, boundaries, and runtime flow.
3. [`docs/01-overview/architecture.md`](../docs/01-overview/architecture.md) for module and activation boundaries.
4. [`docs/02-setup/environment.md`](../docs/02-setup/environment.md) for configuration and migration order.
5. [`docs/06-testing/testing-strategy.md`](../docs/06-testing/testing-strategy.md) for the relevant verification suite.
6. [`docs/07-development/engineering-standards.md`](../docs/07-development/engineering-standards.md) for implementation and documentation rules.

For an operational or API change, also read [`docs/03-operation/usage.md`](../docs/03-operation/usage.md), [`docs/03-operation/spec32-integrations-outbox-runbook.md`](../docs/03-operation/spec32-integrations-outbox-runbook.md), and [`docs/05-integrations/api-contracts.md`](../docs/05-integrations/api-contracts.md).

For a new specification, read [`docs/09-roadmap/specs/README.md`](../docs/09-roadmap/specs/README.md). New specs are direct-child folders under `docs/09-roadmap/specs/` and contain a spec, task file or files, and `IMPLEMENTATION-GUIDE.md`.

## Area reads

| Area | Read first |
| :---- | :---- |
| Property workflow | [`docs/prd.md`](../docs/prd.md), [`docs/03-operation/usage.md`](../docs/03-operation/usage.md) |
| Contract Generation | [`docs/05-integrations/api-contracts.md`](../docs/05-integrations/api-contracts.md), current completed specs under [`docs/09-roadmap/specs/completed/`](../docs/09-roadmap/specs/completed/) |
| Identity and organization context | [`docs/01-overview/architecture.md`](../docs/01-overview/architecture.md), [`docs/03-operation/usage.md`](../docs/03-operation/usage.md) |
| Integrations and workers | [`docs/03-operation/spec32-integrations-outbox-runbook.md`](../docs/03-operation/spec32-integrations-outbox-runbook.md), [`docs/02-setup/external-services.md`](../docs/02-setup/external-services.md) |
| Runtime artifacts | [`docs/03-operation/runtime-files.md`](../docs/03-operation/runtime-files.md) |
| Tests and release gates | [`docs/06-testing/testing-strategy.md`](../docs/06-testing/testing-strategy.md), the relevant roadmap audit |

## Editing checklist

- Inspect `git status --short` and preserve changes that are already present.
- Read the affected code, scripts, routes, migrations, and environment templates before changing claims.
- Keep current behavior, disabled/staged behavior, and historical records clearly separated.
- Do not change a visible API, persisted shape, migration, security boundary, or integration contract without updating its tests and canonical docs.
- Keep secrets, tokens, signed URLs, private paths, provider responses, and customer payloads out of examples and logs.
- Use the organization context supplied by the server; a slug, browser state, creator, or email address is not authorization.
- For contract generation, preserve commit-then-outbox semantics and treat ambiguous provider calls as reconciliation work.
- For documentation, use links that resolve within this repository.

## Verification

There is no root `npm run docs:check` script in this repository. For documentation
changes, inspect changed links and paths, run `git diff --check`, and run the
relevant project verification when behavior claims were changed:

```bash
npm --prefix backend run typecheck
npm --prefix frontend run build
npm --prefix backend test
npm --prefix frontend test
```

Use the smallest relevant commands when a full suite is not needed, and report any
provider/database certification that was not performed. Static tests do not authorize
production migrations, external provider changes, Solar data, or credential use.
