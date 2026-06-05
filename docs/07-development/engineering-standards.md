# Engineering Standards

Status: 2026-06-05.

## Project conventions

- Use TypeScript with strict typing in both `frontend` and `backend`.
- Keep frontend pages and feature modules separate: pages under `frontend/src/pages`, feature logic under `frontend/src/features`.
- Keep UI primitives in `frontend/src/components/ui`.
- Keep backend HTTP adapters thin and business logic in `backend/src/services`.
- Keep mapping logic in `backend/src/mappers`.
- Keep shared utilities in `backend/src/utils`.

## Frontend standards

- Use React Hook Form for form state and Zod for schema validation.
- Use `useCreatePropertySubmission` for submission side effects.
- Maintain explicit route structure: `/`, `/properties/new`, `/properties/success/:submissionId`.
- Persist agent metadata in localStorage via `AgentContext`.

## Backend standards

- Validate all incoming payloads before side effects.
- Use explicit step results for Drive, upload, Sheets, and Make.
- Return clear outcomes: `success`, `partial_failure`, or `failure`.
- Persist submission logs under `backend/logs/` for auditability.
- Use environment variables only for secrets and external service configuration.

## Documentation expectations

- Keep `docs/prd.md` as the source of product scope decisions.
- Use the numbered `docs/` structure for new canonical docs.
- Add implementation notes to the appropriate numbered folder rather than to root-level `docs/` files.
