# Project Setup and Architecture

This document outlines the current setup and architectural decisions for the internal property creation web application.

## Repository Structure

The project is structured as a monorepo with explicit separation between the frontend and backend to keep the initialization and package management clean and isolated.

- `/frontend`: Contains the React web application.
- `/backend`: Contains the Node.js API services.
- `/docs`: Contains documentation, including the PRD and setup guides.
- `/references`: Contains the LLM workflow guide.

## Frontend Architecture

- **Framework:** React 19 with TypeScript.
- **Build Tool:** Vite 8.
- **Styling:** Tailwind CSS v4 (configured via the `@tailwindcss/vite` plugin and `@import "tailwindcss"` in `src/index.css`).
- **Routing:** React Router v7.
- **Forms & State:** React Hook Form, Zod for validation, and TanStack Query for server state.

### Running the Frontend
```bash
cd frontend
npm install
npm run dev
```

## Backend Architecture

- **Framework:** Node.js with Express v5.
- **Language:** TypeScript (strict mode, ES Modules).
- **Module System:** `"type": "module"` + `module: nodenext` in tsconfig.
- **Key dependencies:** `googleapis`, `multer`, `zod`, `uuid`, `cors`, `dotenv`.
- **Dev runner:** `tsx watch` for zero-compile hot reload.

### Running the Backend (development)
```bash
cd backend
cp .env.example .env        # fill in all values
npm install
npm run dev                 # starts on http://localhost:3001
```

### Other backend scripts
| Script | Purpose |
|---|---|
| `npm run dev` | Hot-reload dev server via `tsx watch` |
| `npm run build` | Compile TypeScript → `dist/` |
| `npm start` | Run compiled output |
| `npm run typecheck` | Type-check without emitting |

### Required environment variables

| Variable | Description |
|---|---|
| `PORT` | HTTP port (default `3001`) |
| `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` | Full service account JSON as a single-line string |
| `GOOGLE_SHEET_ID` | ID of the target Google Sheet |
| `GOOGLE_SHEET_RANGE` | Range for appends (default `Sheet1!A1`) |
| `GOOGLE_DRIVE_PARENT_FOLDER_ID` | Drive folder that will contain all property folders |
| `MAKE_WEBHOOK_URL` | Make (Integromat) webhook URL |

### API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness check |
| `POST` | `/properties/submit` | Submit a new property (multipart/form-data) |

The `POST /properties/submit` endpoint accepts `multipart/form-data` with:
- All property fields as text fields (see `scheme.json` for the full schema).
- Agent fields: `agent_user_id`, `agent_name`, `agent_email`.
- `cover_file_name` — filename of the designated cover image.
- `files[]` — uploaded image/video files (total ≤ 1 GB, whitelisted MIME types only).

### Backend module map

```
backend/src/
  index.ts                          — Express app entry point
  types.ts                          — Shared TypeScript interfaces
  routes/
    properties.ts                   — POST /properties/submit (10-step orchestration)
  services/
    validatePropertyPayload.ts      — Zod schema + validation
    buildFolderName.ts              — Drive folder name generator
    googleDriveService.ts           — Create folder + upload files
    googleSheetsService.ts          — Append sheet row
    makeWebhookService.ts           — POST to Make webhook
    submissionLogger.ts             — Persist submission log to backend/logs/
  mappers/
    sheetRowMapper.ts               — Property → flat Sheets row array
    makePayloadMapper.ts            — Property + meta → Make JSON payload
  utils/
    sanitizeText.ts                 — Text → URL-safe slug
    sizeLimits.ts                   — 1 GB cap constants + MIME whitelist
    retryPolicy.ts                  — Exponential backoff retry wrapper
```

### Submission orchestration (10 steps, in order)

1. Validate payload (Zod) + validate file MIME types and total size.
2. Generate `property_id` (`PROP-YYYY-{uuid_prefix}`) and `submission_id` (`SUB-YYYY-MM-DD-{uuid_prefix}`).
3. Build Drive folder name (`OP-{ciudad}-{tipo}-{dirección}-{YYYYMMDD}-{HHmm}`).
4. Create Drive folder under `GOOGLE_DRIVE_PARENT_FOLDER_ID`.
5. Upload all media files into that folder.
6. Build canonical Make payload.
7. Append row to Google Sheets.
8. Send payload to Make webhook.
9. Persist submission log to `backend/logs/{submission_id}.json`.
10. Return `SubmissionResult` to frontend.

**Failure policy:**
- Drive creation fails → stop, return `failure`.
- File upload fails → stop, return `failure`.
- Sheets fails → skip Make, return `failure`.
- Sheets ok + Make fails → return `partial_failure` (HTTP 207).
- All ok → return `success` (HTTP 200).

## Setup Deviations from Initial PRD

- **Tailwind CSS:** The project uses Tailwind CSS **v4** (Vite plugin, no `tailwind.config.js`).
- **Project Root:** Frontend and backend are cleanly separated into `/frontend` and `/backend` rather than placing the frontend at the repository root.
- **Submission logs:** Stored locally in `backend/logs/` as JSON files (one per submission). A future iteration may replace this with a database.
