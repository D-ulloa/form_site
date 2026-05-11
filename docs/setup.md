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

### Google Cloud setup (one-time)

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create or select a project.
2. Enable **Google Drive API** and **Google Sheets API** for the project.
3. Go to **IAM & Admin → Service Accounts** → Create a service account.
4. Download a JSON key for that service account.
5. Minify the JSON to a single line and paste it into `GOOGLE_SERVICE_ACCOUNT_KEY_JSON`.
6. **Share the target Google Sheet** with the service account email (e.g. `sa-name@project.iam.gserviceaccount.com`) as **Editor**.
7. **Share the parent Drive folder** (`GOOGLE_DRIVE_PARENT_FOLDER_ID`) with the same email as **Editor**.
8. Copy the Sheet ID from its URL: `docs.google.com/spreadsheets/d/{SHEET_ID}/edit`.
9. Copy the Drive folder ID from its URL: `drive.google.com/drive/folders/{FOLDER_ID}`.

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

**Response body (`SubmissionResult`):**
```json
{
  "outcome": "success | failure | partial_failure",
  "property_id": "PROP-2026-A1B2C3D4",
  "submission_id": "SUB-2026-05-11-E5F6G7H8",
  "drive_folder_name": "OP-mar-del-plata-departamento-av-colon-1234-20260511-1430",
  "drive_folder_url": "https://drive.google.com/drive/folders/...",
  "steps": {
    "drive_folder": "ok | failed | skipped",
    "file_upload":  "ok | failed | skipped",
    "sheets":       "ok | failed | skipped",
    "make":         "ok | failed | skipped"
  },
  "error": "Only present on failure or partial_failure"
}
```

HTTP status codes: `200` success · `207` partial_failure · `400` validation error · `500` failure.

### Backend module map

```
backend/src/
  index.ts                              — Express app entry point
  types.ts                              — Shared TypeScript interfaces
  routes/
    properties.ts                       — POST /properties/submit (thin HTTP adapter)
  services/
    createPropertySubmission.ts         — 10-step submission orchestration
    validatePropertyPayload.ts          — Zod schema + validation
    buildFolderName.ts                  — Drive folder name generator
    googleDriveService.ts               — Create folder + upload files
    googleSheetsService.ts              — Append sheet row
    makeWebhookService.ts               — POST to Make webhook
    submissionLogger.ts                 — Persist log to backend/logs/
  mappers/
    sheetRowMapper.ts                   — Property → flat Sheets row array
    makePayloadMapper.ts                — Property + meta → Make JSON payload
  utils/
    googleAuth.ts                       — Shared Google service account auth factory
    sanitizeText.ts                     — Text → URL-safe slug
    sizeLimits.ts                       — 1 GB cap constants + MIME whitelist
    retryPolicy.ts                      — Exponential backoff retry wrapper
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

### Google Sheet column headers

Create these headers in row 1 of your sheet **in this exact order** (59 columns):

| # | Column | # | Column |
|---|---|---|---|
| 1 | property_id | 31 | tipo_contrato |
| 2 | submission_id | 32 | Instalaciones |
| 3 | created_at | 33 | Bauleras |
| 4 | agent_name | 34 | Orientación |
| 5 | agent_email | 35 | Cantidad de plantas |
| 6 | drive_folder_name | 36 | Cobertura de Cochera |
| 7 | drive_folder_url | 37 | Propiedad Ocupada |
| 8 | media_file_count | 38 | Apto para Escritura |
| 9 | make_status | 39 | A estrenar |
| 10 | sheets_status | 40 | Antigüedad en años |
| 11 | tipo_propiedad | 41 | Forma de pago |
| 12 | operación | 42 | Apto crédito |
| 13 | dirección | 43 | Cantidad de pisos |
| 14 | barrio | 44 | Número del departamento |
| 15 | zona | 45 | Departamentos por piso |
| 16 | ciudad | 46 | Número de piso de la unidad |
| 17 | dormitorios | 47 | Orientación_2 |
| 18 | baños | 48 | Tipo de seguridad |
| 19 | precio | 49 | Seguridad |
| 20 | expensas | 50 | Conexión para lavarropas |
| 21 | info_relevante | 51 | Servicios |
| 22 | Medidas | 52 | Comodidades y equipamiento |
| 23 | amoblado | 53 | Espacios comunes |
| 24 | barrio_cerrado | 54 | Otros |
| 25 | cochera | 55 | Seguridad_2 |
| 26 | ascensor | | |
| 27 | patio | | |
| 28 | terraza | | |
| 29 | balcon | | |
| 30 | mascotas | | |

> **Note:** Array fields (Servicios, Comodidades y equipamiento, etc.) are stored as comma-separated strings.

## Setup Deviations from Initial PRD

- **Tailwind CSS:** The project uses Tailwind CSS **v4** (Vite plugin, no `tailwind.config.js`).
- **Project Root:** Frontend and backend are cleanly separated into `/frontend` and `/backend` rather than placing the frontend at the repository root.
- **Submission logs:** Stored locally in `backend/logs/` as JSON files (one per submission). A future iteration may replace this with a database.
