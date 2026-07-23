# Project Overview

Status: 2026-07-21.

This repository implements two internal workflows in an admin-style web application:

- Property creation, including media, Google Drive, Google Sheets, and Make integration.
- Contract generation intake, driven by a public JSON field schema and appended to a dedicated Google Sheet.

## Purpose

- Provide a compact internal interface for adding new properties.
- Provide a guided, schema-driven contract submission flow.
- Keep submission behavior predictable and auditable.
- Centralize Google Drive / Sheets / Make integration behind a backend API.

## What this project includes

- `frontend/`: React + TypeScript app with Vite, Tailwind CSS, React Router, React Hook Form, Zod, and TanStack Query.
- `backend/`: Node.js + Express API with TypeScript, Zod validation, Google Drive/Sheets integration, file upload handling, contract configuration, and submission orchestration.
- `docs/`: Project documentation and setup guidance.
- `references/`: LLM and documentation workflow guidance.
- `scheme.json` and `scheme_reworked.json`: canonical property submission schema sources.
- The backend contract registry: the authoritative contract schema and server-only Sheet mapping; the public API exposes only its client-safe projection.

## Key boundaries

- The frontend is responsible for form UI, client-side validation, media selection, and API calls. Contract definitions are fetched from the backend instead of duplicated in the browser bundle.
- The backend is responsible for independent payload validation, server-only contract configuration, Google Drive folder creation, file uploads, Google Sheets appends, Make webhook dispatch, and persistence of submission and audit logs.
- No edit workflow is implemented in v1: submissions create new property assets only.
- The Google Form link in the contract flow is informational. Copying it does not submit data; only the in-app form writes to Sheets.

## Property flow

1. User opens `/` and selects `Agregar nueva propiedad`.
2. User fills the form on `/properties/new`.
3. User optionally uploads images/videos and selects a cover image.
4. The frontend sends `multipart/form-data` to `POST /properties/submit`.
5. The backend validates data and files.
6. The backend creates or uploads assets to Google Drive.
7. The backend appends the property row in Google Sheets.
8. The backend sends the webhook payload to Make.
9. The user sees a result page at `/properties/success/:submissionId`.

## Contract flow

1. User opens `/` and selects `Contract Generation`.
2. The frontend loads the public `rent-contract-v1` schema.
3. Modal step A presents the administrator-configured Google Form link.
4. A successful copy advances to modal step B.
5. The frontend renders the in-app form and a read-only JSON schema view.
6. The user submits the normalized fields to `POST /api/contracts/submit`.
7. The backend authenticates the request, reloads the authoritative schema, validates and sanitizes the fields, and reads the Sheet header row.
8. The backend verifies every header in schema order, including repeated labels, then appends one `RAW` row.
9. The backend writes a redacted audit record and returns a receipt with the submission ID and append metadata.

## Code map

- `frontend/src/pages/`: action selection, new property form, submission result.
- `frontend/src/features/properties/`: property form schema, hooks, services, components, and payload mapper.
- `frontend/src/features/contracts/`: public schema types, modal/form rendering, client validation, and contract API calls.
- `frontend/src/components/ui/`: shared UI primitives used across pages.
- `backend/src/routes/properties.ts`: HTTP route handling and multipart parsing.
- `backend/src/routes/contracts.ts`: public schema, authenticated submission, and authenticated audit endpoints.
- `backend/src/config/`: authoritative contract schema registry and server-only destination mapping.
- `backend/src/services/`: submission orchestration, validation, Drive/Sheets/Make integration, log persistence.
- `backend/logs/`: local JSON submission and contract audit records.
