# Project Overview

Status: 2026-08-06.

This repository implements two internal workflows in an admin-style web application:

- Property creation, including media, Google Drive, Google Sheets, and Make integration.
- Two-party Contract Generation with hosted user/client forms and Supabase persistence.

## Purpose

- Provide a compact internal interface for adding new properties.
- Provide a guided, schema-driven contract submission flow.
- Keep submission behavior predictable and auditable.
- Centralize Supabase contract persistence and Google property integrations behind the backend API.

## What this project includes

- `frontend/`: React + TypeScript app with Vite, Tailwind CSS, React Router, React Hook Form, Zod, and TanStack Query.
- `backend/`: Node.js + Express API with TypeScript, Zod validation, Supabase contract persistence, Google property integrations, file upload handling, and submission orchestration.
- `docs/`: Project documentation and setup guidance.
- `references/`: LLM and documentation workflow guidance.
- `scheme.json` and `scheme_reworked.json`: canonical property submission schema sources.
- The backend contract registry: the authoritative field schema and role projections; destinations and credentials remain server-only.

## Key boundaries

- The frontend is responsible for form UI, client-side validation, media selection, and API calls. Contract definitions are fetched from the backend instead of duplicated in the browser bundle.
- The backend is responsible for independent payload validation, Supabase contract persistence, role-token authorization, Google Drive folder creation, property Sheet appends, Make webhook dispatch, and auditability.
- No edit workflow is implemented in v1: submissions create new property assets only.
- Contract access uses stable per-entry administration links plus per-role links whose raw tokens are returned once and stored only as HMAC hashes; main-page Supabase email/password accounts receive administrator access immediately, and authenticated owners may open the user form without a token.

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

1. An authenticated operator selects `Generar contrato`; the opened section remains passive.
2. The operator clicks `Generar nueva entrada para contrato`.
3. `POST /api/contracts/create` creates a Supabase `contract_entries` row and returns user and client URLs.
4. The operator opens the user form and copies the client link.
5. Each hosted role page fetches only its assigned schema sections and submits independently. The client starts with repeatable `Inquilino`/`Garante` records, private front/back DNI slots, and passive supporting-file receivers under each guarantor's `Recibo de sueldo` and `Garantía propietaria` subdivisions.
6. The user schema groups `Contrato` into `Vigencia`, `Canon`, and `Ajuste`; computed dates remain read-only and the backend recalculates them authoritatively.
7. On client `Guardar`, the form locks, selected supporting files receive rate-limited client-authorized private upload URLs, and uploads finish before the role JSON is sent. The backend validates fields, DNI references, the two supporting-file arrays for every guarantor, and each evidence object's actual private Storage MIME/size metadata before calling the atomic Supabase function.
8. Supabase stores one immutable role audit row and updates the entry.
9. When both roles have submitted, the entry becomes `complete` and receives a combined payload.
10. Administrators sign in with Supabase email/password or Google OAuth, then use stable `/contracts/admin/:entryId` links to inspect submissions in schema order, edit submitted role data, update generation status, archive entries, and regenerate role links.
11. The configured Supabase trigger can notify Make when an administrator marks an entry for contract generation.

## Code map

- `frontend/src/pages/`: action selection, property forms/results, hosted contract forms, and contract administration.
- `frontend/src/features/properties/`: property form schema, hooks, services, components, and payload mapper.
- `frontend/src/features/contracts/`: entry creation, role schema types, hosted-form rendering, validation, and contract API calls.
- `frontend/src/components/ui/`: shared UI primitives used across pages.
- `backend/src/routes/properties.ts`: HTTP route handling and multipart parsing.
- `backend/src/routes/contractEntries.ts`: current entry, role-form, submission, and admin endpoints.
- `backend/src/routes/contracts.ts`: legacy SPEC-09 compatibility endpoints.
- `backend/src/config/`: authoritative contract schema registry and role-specific projections.
- `backend/src/services/`: contract entry/token persistence, submission orchestration, validation, Drive/Sheets/Make integration, and log persistence.
- `backend/logs/`: property and legacy SPEC-09 JSON records; current contract records live in Supabase.
