# Architecture

Status: 2026-06-05.

## Stack

- Frontend: React 19, TypeScript, Vite 8, Tailwind CSS v4, React Router v7.
- Backend: Node.js, Express v5, TypeScript strict mode, ES Modules.
- Integrations: Google Drive API, Google Sheets API, Make webhook.

## Frontend architecture

The frontend lives under `frontend/` and is organized into:

- `src/pages/`: top-level route pages.
- `src/features/properties/`: property form sections, validation, submit hooks, payload mapping, and media handling.
- `src/app/contexts/`: global agent context persisted to localStorage.
- `src/components/ui/`: reusable UI elements such as buttons, alerts, and modals.

Important frontend flows:

- `ActionSelectionPage`: entry point that launches property creation.
- `NewPropertyPage`: composes section components and orchestrates form submission.
- `SubmissionSuccessPage`: shows submission status and integration results.

## Backend architecture

The backend lives under `backend/` and is structured into:

- `src/index.ts`: Express app entrypoint.
- `src/routes/`: route adapters for HTTP endpoints.
- `src/services/`: domain orchestration and integration adapters.
- `src/mappers/`: mapping logic for Google Sheets and Make payloads.
- `src/utils/`: shared utilities for auth, retry policy, sanitization, and size limits.

Key backend responsibilities:

- Validate incoming property payloads.
- Create a Google Drive folder and upload media.
- Append a canonical row into Google Sheets.
- Send a properly formatted payload to the Make webhook.
- Persist submission logs under `backend/logs/`.

## Deployment shape

- Local frontend dev: `cd frontend && npm run dev`.
- Local backend dev: `cd backend && npm run dev`.
- The backend may run behind a prefix such as `/_/backend` in production; the frontend API client supports that prefix.

## Runtime boundary

- Frontend UI is stateless beyond local agent persistence.
- Backend persists no application database; it writes submission logs to disk and delegates state to Google Drive/Sheets/Make.
- The canonical schema for submission validation is expressed in `frontend/src/features/properties/schemas/propertySchema.ts` and validated in `backend/src/services/validatePropertyPayload.ts`.
