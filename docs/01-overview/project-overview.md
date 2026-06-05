# Project Overview

Status: 2026-06-05.

This repository implements an internal property creation workflow for an admin-style web application.
The main user journey is: select the new property action, fill a property form, upload media, and submit.
Successful submissions create a folder in Google Drive, append a row in Google Sheets, and send a payload to Make.

## Purpose

- Provide a compact internal interface for adding new properties.
- Keep submission behavior predictable and auditable.
- Centralize Google Drive / Sheets / Make integration behind a backend API.

## What this project includes

- `frontend/`: React + TypeScript app with Vite, Tailwind CSS, React Router, React Hook Form, Zod, and TanStack Query.
- `backend/`: Node.js + Express API with TypeScript, Zod validation, Google Drive/Sheets integration, file upload handling, and submission orchestration.
- `docs/`: Project documentation and setup guidance.
- `references/`: LLM and documentation workflow guidance.
- `scheme.json` and `scheme_reworked.json`: canonical submission schema sources.

## Key boundaries

- The frontend is responsible for the form UI, client-side validation, media selection, and sending multipart form data.
- The backend is responsible for payload validation, Google Drive folder creation, file uploads, Google Sheets appends, Make webhook dispatch, and persistence of submission logs.
- No edit workflow is implemented in v1: submissions create new property assets only.

## Core user flow

1. User opens `/` and selects `Agregar nueva propiedad`.
2. User fills the form on `/properties/new`.
3. User optionally uploads images/videos and selects a cover image.
4. The frontend sends `multipart/form-data` to `POST /properties/submit`.
5. The backend validates data and files.
6. The backend creates or uploads assets to Google Drive.
7. The backend appends the property row in Google Sheets.
8. The backend sends the webhook payload to Make.
9. The user sees a result page at `/properties/success/:submissionId`.

## Code map

- `frontend/src/pages/`: action selection, new property form, submission result.
- `frontend/src/features/properties/`: property form schema, hooks, services, components, and payload mapper.
- `frontend/src/components/ui/`: shared UI primitives used across pages.
- `backend/src/routes/properties.ts`: HTTP route handling and multipart parsing.
- `backend/src/services/`: submission orchestration, validation, Drive/Sheets/Make integration, log persistence.
- `backend/logs/`: persisted JSON submission logs for audit and review.
