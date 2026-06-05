# Testing Strategy

Status: 2026-06-05.

## Current coverage

This project currently has lightweight validation and helper scripts rather than a fully automated test suite.

### Backend validation and manual tests

- `backend/test_upload_with_file.ts` — helper script to verify file upload behavior with real Drive integration.
- `backend/real_schema_test.ts` — schema validation test helper.
- `backend/test_special_keys.ts` — special-key validation helper.

### Frontend checks

- `npm run lint` in `frontend`.
- `npm run build` in `frontend` to verify Vite and TypeScript output.

## Recommended test expectations

- Unit tests for `frontend/src/features/properties/schemas/propertySchema.ts` and media validation hooks.
- Integration tests for `backend/src/routes/properties.ts` and `backend/src/services/createPropertySubmission.ts`.
- End-to-end tests covering the full property submission path, including Drive/Sheets/Make integration if feasible.
- Release validation checks for `npm run build` and `npm run typecheck`.

## Validation commands

- `cd frontend && npm run lint`
- `cd frontend && npm run build`
- `cd backend && npm run typecheck`
- `cd backend && npm run build`
