# Documentation Freshness Audit

Status: 2026-09-01.

## Scope

Reviewed the repository documentation indexes, overview and architecture guides,
setup and external-service instructions, operation and API contracts, testing and
engineering guidance, the property PRD, the frontend README, and the reference
LLM guide against the current source tree, scripts, routes, migrations, and
integration worker.

## Findings and updates

- Repaired stale documentation indexes and broken links to the historical
  Contract Generation specifications.
- Documented the direct-child spec-folder convention and indexed the current
  SPEC-38 arrangement placeholder.
- Corrected the current frontend route map and distinguished tenant-scoped routes
  from legacy compatibility routes.
- Documented the mounted tenant contract API, the commit-then-kick contract Make
  delivery path, its standalone worker command, and its bounded/ambiguous outcome
  semantics.
- Refreshed migration and environment references through the 2026-09-01 shared
  Make-delivery migration, including worker configuration.
- Updated property media, setup, testing, PRD, and frontend guidance to match the
  current Supabase-direct upload default and legacy Drive compatibility path.
- Replaced the boilerplate frontend README and stale reference LLM guide with
  project-specific guidance.

## Open issue

SPEC-38 is used by two unrelated workstreams: the direct-child navigation
arrangement placeholder and the shared contract Make-delivery implementation. The
collision must be resolved by the project owner before either workstream receives
another dependent spec or a final completion status.
