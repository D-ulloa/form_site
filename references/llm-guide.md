# Llm Guide

Status: 2026-05-04.

This guide defines what an AI llm, engineer, or programmer must review before touching code in OPEV-H.

## Main Rule

Do not modify runtime, tests, or contracts without following this flow:

Read context \-\> Write spec \-\> Write tests \-\> Implement \-\> Refactor \-\> Update docs \-\> Verify

## Minimum Read Before Coding

For any code change:

1. Read [project-overview.md](http://../01-overview/project-overview.md) to understand the system map.  
2. Read [architecture.md](http://../01-overview/architecture.md) to preserve the modular monolith.  
3. Read [engineering-standards.md](http://./engineering-standards.md) for quality criteria.  
4. Read [sdd-workflow.md](http://./sdd-workflow.md) to prepare the specification.  
5. Read [tdd-workflow.md](http://./tdd-workflow.md) to turn the spec into tests.  
6. Read [testing-strategy.md](http://../06-testing/testing-strategy.md) to choose the correct suite.  
7. Read [spec-traceability.md](http://./spec-traceability.md) to link specs, tests, docs and closure evidence.  
8. Review [technical-audit-register.md](http://../08-roadmap/technical-audit-register.md) if the task comes from technical debt, compliance, testing, or refactor work.  
9. Review [backlog.md](http://../08-roadmap/backlog.md) if the task is functional or product/runtime work.

## Area Reads

| If you will touch | Read first |
| :---- | :---- |
| CLI/runtime loop | [runtime-flow.md](http://../01-overview/runtime-flow.md), [cli-usage.md](http://../03-operation/cli-usage.md) |
| Tools | [tool-calling-contract.md](http://../05-tools/tool-calling-contract.md), [tools-reference.md](http://../05-tools/tools-reference.md) |
| Filesystem | [filesystem-tools.md](http://../05-tools/filesystem-tools.md), [runtime-files.md](http://../03-operation/runtime-files.md) |
| Web search | [web-search.md](http://../05-tools/web-search.md), [providers.md](http://../02-setup/providers.md) |
| Llms | [system-llms.md](http://../04-llms-and-memory/system-llms.md) |
| Memory | [memory-system.md](http://../04-llms-and-memory/memory-system.md), [compaction.md](http://../04-llms-and-memory/compaction.md) |
| Runtime persistence | [runtime-files.md](http://../03-operation/runtime-files.md), [usage-summary.md](http://../03-operation/usage-summary.md) |
| Setup/providers | [installation.md](http://../02-setup/installation.md), [environment.md](http://../02-setup/environment.md), [providers.md](http://../02-setup/providers.md) |
| Testing | [testing-strategy.md](http://../06-testing/testing-strategy.md), [testing-coverage.md](http://../06-testing/testing-coverage.md), [testing-roadmap.md](http://../06-testing/testing-roadmap.md) |

## Checklist Before Editing

- Understand whether the task is a feature, bugfix, refactor, docs, or audit task.  
- Review the working tree with `git status --short`.  
- Identify changes from others and do not revert them.  
- Read the real code in the affected modules.  
- Write or confirm a spec with scope and acceptance criteria.  
- Define required tests before implementing.  
- Identify whether the change touches a visible contract. Visible contracts must use `snake_case` or `UPPER_SNAKE_CASE`; internal TypeScript implementation may keep normal camelCase/PascalCase naming.

## Checklist During Implementation

- Keep changes scoped to the spec objective.  
- Prefer existing repo patterns.  
- Do not move responsibilities between modules without justifying it in the spec.  
- Do not modify visible contracts without contract tests and docs.  
- Do not introduce camelCase names in tool names, tool arguments, public JSON, persisted JSON, runtime artifacts, environment variables, or public documentation examples.  
- Do not use real APIs in tests by default.  
- Do not write to real `llm_context/`, `llm_history/`, `memory/`, `usage/`, or `.fs_undo/` paths from tests.

## Closing Checklist

- The spec is satisfied.  
- Tests derived from the spec pass.  
- [spec-traceability.md](http://./spec-traceability.md) has a row for completed audit/backlog work.  
- `npm run docs:check` passes when documentation, roadmap, audit, or scaffolding files changed.  
- `npm run typecheck` or the relevant verification was executed when applicable.  
- `git diff --check` reports no errors.  
- Canonical documentation was updated if behavior, contracts, setup, or architecture changed.  
- The backlog or audit register was updated if task status changed.

## Ambiguity

If the task does not have enough detail to write a reasonable spec, stop and ask for precision. Do not fill contract, security, persistence, or architecture decisions with silent assumptions.  
