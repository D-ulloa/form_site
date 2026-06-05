# Runtime Files

Status: 2026-06-05.

## Persisted runtime artifacts

- `backend/logs/` — JSON files generated for each submission. These logs contain submission IDs, outcome, step results, and optional error details.

## Build output

- `frontend/dist/` — built frontend output produced by `npm run build`.
- `backend/dist/` — compiled backend output produced by `npm run build`.

## Configuration and schema files

- `backend/.env` — local backend environment values (not committed).
- `backend/.env.example` — template environment values.
- `scheme.json` and `scheme_reworked.json` — canonical property schema references used by validation and integration logic.

## Temporary or generated files

- `node_modules/` — dependency installation directories.
- `frontend/dist/` and `backend/dist/` should be treated as build artifacts.

## Notes

- The backend uses `backend/logs/` as a lightweight audit trail; these files are not a primary data store.
- The frontend persists agent metadata in localStorage via `AgentContext`.
