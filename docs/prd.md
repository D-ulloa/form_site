Status: 2026-09-01.

This is the original property-workflow PRD and remains canonical for the create-only
property slice. The current implementation still creates a Drive folder and attempts
Google Sheets and Make compatibility delivery, but media storage is configurable:
private Supabase Storage is the default and legacy Drive upload is an explicit fallback.
The internal admin workflow should favor compact screens, clear labels, visible
submission states, and predictable navigation.

## Document scope

This file is the original property-workflow PRD and remains canonical for the property submission slice. The current Contract Generation workflow is documented by SPEC-10 through SPEC-19 and the numbered operation/API documents; those documents reflect the implemented contract behavior.

## Locked scope

The initial product is a React-based internal web application with an action-selection landing page and the original property action, **Agregar nueva propiedad**. Contract Generation is an additional implemented workflow documented separately in SPEC-10 through SPEC-19. The interface should stay compact, label-first, and operationally clear, which matches recommended web app patterns for admin tools and data-entry flows. [perplexity](https://www.perplexity.ai/search/cc32b125-dc4a-422b-98d2-9009e48c9d21)

Locked product rules:
- Sheets update: the backend attempts the configured property append after validation and Drive setup.
- Make webhook: the backend attempts the configured property compatibility dispatch after Sheets; the response reports its outcome.
- Property lifecycle in MVP: create only, no edit mode.
- Upload limit: each file is constrained by server policy; the current multipart deployment cap is approximately 3.8 MB, while the historical business cap is 1 GB.
- Media count: at most 20 files in the current backend configuration, subject to the payload cap.
- Media strategy: client-direct private Supabase Storage by default; legacy Drive upload only when explicitly configured.
- Folder naming convention: `OP-{localidad}-{tipo_de_inmueble}-{calle_sanitizada}-{YYYYMMDD-HHmm}`.

Notes: the implementation lowercases and strips accents/special chars (spaces → hyphens) when sanitizing `calle`. The timestamp format is `YYYYMMDD-HHmm` (date + hour and minute).

Recommended example:
- `OP-mar-del-plata-casa-av-colon-1234-20260510-2128`

## User flow

The app should use a simple route structure so the workflow is always obvious: landing page, new-property form, and result state. In a web app, the main action should be explicit, the URL should reflect the current view, and loading/error states should be shown clearly instead of hidden behind ambiguous UI. [perplexity](https://www.perplexity.ai/search/cc32b125-dc4a-422b-98d2-9009e48c9d21)

### Current flow
1. User opens `/` or the tenant entry point `/t/:organizationSlug`.
2. User selects `Agregar nueva propiedad`.
3. User completes the form on the tenant route `.../properties/new`.
4. The browser uploads selected media directly to private Supabase Storage by default, or uses the explicit legacy Drive mode.
5. The backend validates the signed session, form data, and media references.
6. The backend creates the property Drive folder and records the configured media strategy.
7. The backend appends the row in Google Sheets.
8. The backend attempts the property Make compatibility webhook.
9. The app shows separate Drive, upload, Sheets, and Make outcomes on the tenant result route.

### Required screens

| Route | Screen | Purpose |
|---|---|---|
| `/` or `/t/:organizationSlug` | Action selection | Choose the property or Contract Generation workflow |
| `/t/:organizationSlug/properties/new` | New property form | Main tenant-scoped data-entry screen |
| `/t/:organizationSlug/properties/success/:submissionId` | Result screen | Show separate integration outcomes and the Drive folder projection |
| Modal/inline state | Error and retry | Show validation, upload, Sheets, or Make errors without losing form data |

## Data structure

The form should be divided into sections instead of one long stack of inputs, since progressive disclosure and explicit grouping make web app forms easier to scan and safer to use. Clear labels should always take priority over icon-based or overly condensed UI. [perplexity](https://www.perplexity.ai/search/cc32b125-dc4a-422b-98d2-9009e48c9d21)

### Form sections

| Section | Fields |
|---|---|
| General | `Tipo de Inmueble`, `Operación`, `Dormitorios`, `Ambientes`, `Precio`, `Expensas`, `Moneda`, `Apto crédito`, `Escritura`, `Unidad en Pozo`, `Cartel`, `Propietario`, `Asesor comercial`, `Productor`, `Sucursal` |
| Ubicación | `Pais`, `Provincia`, `Localidad`, `Barrio`, `Calle`, `Número`, `Piso | Mza | Denominacion`, `Depto | Lote |`, `Referencia` |
| Detalles básicos | `Baños`, `Plantas`, `Antiguedad`, `Estado general`, `Apto para`, `Estilo`, `Orientacion` |
| Superficies y descripciones | `Sup Terreno | Hectáreas`, `Sup Terraza`, `Sup Balcon`, `Otras superficies`, `Metros cubiertos`, `Sup de Jardin`, `Mts de Frente`, `Mts de Fondo`, `Llaves`, `Descrp. de dormitorio 1`, `Descrp. de dormitorio 2`, `Descrp. de dormitorio 3`, `Descrp. de dormitorio 4`, `Descrp. de dormitorio 5` |
| Amenities / servicios | `Garage`, `Living Comedor`, `Cocina Comedor`, `Comedor diario`, `Ante Cocina`, `Dependencias`, `Patio`, `Pileta`, `Hogar`, `Area de parrilla`, `Quincho`, `Suite Principal`, `Vestidor`, `Sala estar`, `Estudio`, `Escritorio`, `Lavadero`, `Hall acceso`, `Hall distrib.`, `Gas Natural`, `Gas en tubos`, `Cloacas`, `Sotano`, `Bodega`, `Despensa`, `Play room`, `Bar`, `Jardín inv.`, `Cámara Sept.`, `Galería`, `Altillo`, `Terraza`, `Aire A.Central`, `Aire A. Ind.`, `Calefactores`, `Calef. central`, `Tiro balanc.`, `Calefón`, `Estractor`, `Termotanque`, `Alarma`, `Agua cte.`, `Toillette`, `Hidromasaje`, `Jacuzzi`, `Balcon` |
| Observaciones | `Observaciones`, `Notas Privadas`, `Titulo`, `Detalle` |
| Media | Images, videos, cover image selection, upload ordering, preview |

### Sheet row contract

The Google Sheet row should map 1:1 to the current schema in `scheme_reworked.json`, plus a small set of system columns needed for auditability and integration reliability.

Recommended extra system columns:
- `property_id`
- `submission_id`
- `created_at`
- `created_by`
- `drive_folder_name`
- `drive_folder_url`
- `media_file_count`
- `make_status`
- `sheets_status`

### JSON payload contract

Alongside the exact business fields, the webhook payload should include integration metadata so Make can branch safely.

```json
{
  "property_id": "PROP-2026-000001",
  "submission_id": "SUB-2026-05-10-000001",
  "created_at": "2026-05-10T21:28:00-04:00",
  "created_by": {
    "user_id": "agent-001",
    "name": "Nombre del agente",
    "email": "agente@agencia.com"
  },
  "google_drive": {
    "folder_name": "OP-mar-del-plata-casa-av-colon-1234-20260510-2128",
    "folder_url": "https://drive.google.com/...",
    "parent_folder_id": "..."
  },
  "media": {
    "total_size_bytes": 0,
    "cover_file_name": "frente.jpg",
    "files": [
      {
        "name": "frente.jpg",
        "mime_type": "image/jpeg",
        "size_bytes": 2450000,
        "url": "https://drive.google.com/..."
      }
    ]
  },
  "property": {
    "Tipo de Inmueble": "",
    "Operación": "",
    "Dormitorios": 0,
    "Ambientes": 0,
    "Precio": 0.0,
    "Expensas": 0.0,
    "Moneda": "",
    "Apto crédito": false,
    "Escritura": false,
    "Unidad en Pozo": false,
    "Cartel": false,
    "Propietario": "",
    "Asesor comercial": "",
    "Productor": "",
    "Sucursal": "",
    "Pais": "Argentina",
    "Provincia": "",
    "Localidad": "",
    "Barrio": "",
    "Calle": "",
    "Número": "",
    "Piso | Mza | Denominacion": "",
    "Depto | Lote |": "",
    "Referencia": "",
    "Baños": 0,
    "Plantas": 0,
    "Antiguedad": 0,
    "Estado general": "",
    "Apto para": "",
    "Estilo": "",
    "Orientacion": "",
    "Sup Terreno | Hectáreas": "",
    "Sup Terraza": "",
    "Sup Balcon": "",
    "Otras superficies": "",
    "Metros cubiertos": "",
    "Sup de Jardin": "",
    "Mts de Frente": "",
    "Mts de Fondo": "",
    "Llaves": "",
    "Descrp. de dormitorio 1": "",
    "Garage": false,
    "Living Comedor": false,
    "Cocina Comedor": false,
    "Comedor diario": false,
    "Ante Cocina": false,
    "Dependencias": false,
    "Patio": false,
    "Pileta": false,
    "Balcon": false,
    "Observaciones": "",
    "Notas Privadas": "",
    "Titulo": "",
    "Detalle": ""
    // ... plus all remaining fields from scheme_reworked.json
  }
}
```

## React structure

For a functioning version, the frontend should separate routes, form logic, validation, uploads, and submission orchestration into distinct modules rather than building everything into one page component. Web app guidance also favors explicit state handling, compact type hierarchy, and visible feedback for loading, stale, success, and error conditions. [perplexity](https://www.perplexity.ai/search/cc32b125-dc4a-422b-98d2-9009e48c9d21)

### Recommended stack
- React + TypeScript
- Vite
- React Router
- React Hook Form
- Zod
- TanStack Query
- Tailwind CSS
- Axios or `fetch` wrapper
- Backend API in Node/Express, NestJS, or serverless functions

### Frontend modules
```text
src/
  app/
    contexts/
      AgentContext.tsx
    providers/
      QueryProvider.tsx
    App.tsx
  pages/
    ActionSelectionPage.tsx
    NewPropertyPage.tsx
    SubmissionSuccessPage.tsx
  features/properties/
    components/
      BasicInfoSection.tsx
      LocationSection.tsx
      DistributionSection.tsx
      FeaturesSection.tsx
      AdditionalDetailsSection.tsx
      MultiSelectArraysSection.tsx
      MediaUploadSection.tsx
    hooks/
      usePropertyForm.ts
      useMediaValidation.ts
      useCreatePropertySubmission.ts
    schemas/
      propertySchema.ts
    services/
      propertyApi.ts
      payloadMapper.ts
    utils/
      uploadLimits.ts
  components/ui/
    Button.tsx
    Input.tsx
    Select.tsx
    Checkbox.tsx
    MultiSelectChips.tsx
    FileDropzone.tsx
    AlertInline.tsx
    AgentModal.tsx
```

Notes / actual implementation details:
- The real frontend composes the form in `NewPropertyPage.tsx` from section components (`BasicInfoSection`, `LocationSection`, `DistributionSection`, `FeaturesSection`, `AdditionalDetailsSection`, `MediaUploadSection`) rather than relying on a single `PropertyFormLayout` or `ReviewSubmitPanel` component.
- There is no dedicated `mediaSchema.ts` file; media validation and limits are implemented in `useMediaValidation.ts` and `features/properties/utils/uploadLimits.ts` (frontend cap: `MAX_SUBMISSION_PAYLOAD_BYTES = 3_800_000`).
- Key hooks and services: `usePropertyForm.ts`, `useMediaValidation.ts`, `useCreatePropertySubmission.ts`, `payloadMapper.ts`, and `propertyApi.ts`.

### Backend modules
```text
backend/
  src/
    routes/
      properties.ts
    services/
      validatePropertyPayload.ts
      buildFolderName.ts
      googleDriveService.ts
      googleSheetsService.ts
      makeWebhookService.ts
      submissionLogger.ts
  mappers/
    sheetRowMapper.ts
    makePayloadMapper.ts
  utils/
    sanitizeText.ts
    sizeLimits.ts
    retryPolicy.ts
```

## Functional behavior

A good admin web app should surface every important system state, especially during long-running operations like file uploads and multi-step submissions. Errors should appear inline and contextually, while confirmations can use lighter notification patterns. [perplexity](https://www.perplexity.ai/search/cc32b125-dc4a-422b-98d2-9009e48c9d21)

### Required validation
- Required text fields cannot be empty.
- Numeric fields must reject invalid numbers.
- Boolean fields default to `false`.
- Array fields default to `[]`.
- Current property requests are capped at approximately 3.8 MB for the multipart deployment path; the historical business cap is 1 GB and the backend also enforces a maximum of 20 media files.
- Allowed media types must be whitelisted.
- Dangerous filename characters must be sanitized.
- Folder name generation must be deterministic.

### Media requirements
- Multiple image upload.
- Multiple video upload.
- Drag-and-drop and file picker.
- Preview thumbnails for images.
- File list for videos.
- Reordering support.
- Cover image selection.
- Per-file progress.
- Total progress.
- Remove-before-submit action.

**Architecture (overview)**

```mermaid
flowchart LR
  A[Browser / Frontend (Vite + React)] -->|POST multipart| B[Backend API (Express)]
  B --> C[Google Drive]
  B --> D[Google Sheets]
  B --> E[Make webhook]
  B --> F[Submission log (JSON files / DB)]
  subgraph Frontend
    A --> G[/properties/new UI/Sections/MediaUpload/Validation/React Hook Form/ Zod/Query/axios/]
  end
  subgraph Integrations
    C & D & E
  end
```

**Wireframe — `/properties/new` (compact admin layout)**

- Header: back button, page title (`Nueva propiedad`), agent button (opens AgentModal).
- Form body (max width ~800px) split into vertical stacked sections with sticky submit bar at bottom:
  - Basic info: `Tipo de Inmueble`, `Operación`, `Precio`, `Moneda`, `Dormitorios`, `Ambientes`, `Titulo`.
  - Location: `Pais`, `Provincia`, `Localidad`, `Barrio`, `Calle`, `Número`, `Piso | Mza | Denominacion`, `Depto | Lote |`, `Referencia`.
  - Details: `Baños`, `Plantas`, `Antiguedad`, `Estado general`, `Apto para`, `Estilo`, `Orientacion`.
  - Surfaces & descriptions: `Metros cubiertos`, `Sup Terreno`, `Sup Terraza`, `Descrp. de dormitorio 1..5`, `Llaves`.
  - Features (checkbox grid): `Garage`, `Pileta`, `Quincho`, `Suite Principal`, `Aire A.Central`, etc.
  - Contract & commercial: `Tipo de contrato`, `Propietario`, `Asesor comercial`, `Productor`, `Sucursal`.
  - Observaciones: `Observaciones`, `Notas Privadas`, `Detalle`.
  - MediaUploadSection: dropzone, file list, reorder controls, cover selector, per-file progress.

Sticky submit bar (bottom): file count / total size, `Enviar propiedad` button (disabled when uploading or size invalid).

**Field-by-field mapping (scheme_reworked.json → form field / where in UI)**

- General
  - `Tipo de Inmueble` → Basic info (`BasicInfoSection`) — required.
  - `Operación` → Basic info — required.
  - `Dormitorios`, `Ambientes`, `Precio`, `Expensas`, `Moneda` → Basic info.
  - `Apto crédito`, `Escritura`, `Unidad en Pozo`, `Cartel` → Basic info (checkboxes).
  - `Propietario`, `Asesor comercial`, `Productor`, `Sucursal` → Contract & commercial section.
  - `Tipo de contrato` → Contract & commercial section (dropdown). **Present in `scheme_reworked.json`, frontend (`propertySchema`) and backend (`validatePropertyPayload`).**

- Ubicación
  - `Pais`, `Provincia`, `Localidad`, `Barrio`, `Calle`, `Número`, `Piso | Mza | Denominacion`, `Depto | Lote |`, `Referencia` → LocationSection.

- Detalles básicos
  - `Baños`, `Plantas`, `Antiguedad`, `Estado general`, `Apto para`, `Estilo`, `Orientacion` → Details section.

- Superficies y descripciones
  - `Sup Terreno | Hectáreas`, `Sup Terraza`, `Sup Balcon`, `Otras superficies`, `Metros cubiertos`, `Sup de Jardin`, `Mts de Frente`, `Mts de Fondo`, `Llaves`, `Descrp. de dormitorio 1..5` → Surfaces & descriptions.

- Amenities / servicios (checkboxes)
  - `Garage`, `Living Comedor`, `Cocina Comedor`, `Comedor diario`, `Ante Cocina`, `Dependencias`, `Patio`, `Pileta`, `Hogar`, `Area de parrilla`, `Quincho`, `Suite Principal`, `Vestidor`, `Sala estar`, `Estudio`, `Escritorio`, `Lavadero`, `Hall acceso`, `Hall distrib.`, `Gas Natural`, `Gas en tubos`, `Cloacas`, `Sotano`, `Bodega`, `Despensa`, `Play room`, `Bar`, `Jardín inv.`, `Cámara Sept.`, `Galería`, `Altillo`, `Terraza`, `Aire A.Central`, `Aire A. Ind.`, `Calefactores`, `Calef. central`, `Tiro balanc.`, `Calefón`, `Estractor`, `Termotanque`, `Alarma`, `Agua cte.`, `Toillette`, `Hidromasaje`, `Jacuzzi`, `Balcon` → FeaturesSection (checkbox grid).

- Observaciones
  - `Observaciones`, `Notas Privadas`, `Titulo`, `Detalle` → Observations section (textareas / title input). `Titulo` required by schema.

- Media
  - Files uploaded via `MediaUploadSection` map to `media.files` in Make payload and `cover_file_name` is included in the form fields.

Notes:
- The canonical Make payload and sheet row are assembled server-side (see
`backend/src/mappers/makePayloadMapper.ts` and `backend/src/mappers/sheetRowMapper.ts`).
The tenant frontend uses the organization-namespaced compatibility endpoints. With
the default upload strategy, media is uploaded to private Supabase Storage before
submit and the backend validates stable references; the legacy Drive mode sends
files through the multipart compatibility path.
- `Tipo de contrato` is available across frontend and backend schemas and will be sent in the Make payload and appended to Sheets.

### Submission orchestration
The current flow is:
1. Authenticate the application session and validate the property payload.
2. For the default Supabase strategy, verify the client-authorized media references; for legacy Drive mode, parse and validate multipart files.
3. Generate `property_id`, `submission_id`, and the deterministic Drive folder name.
4. Create the private Drive folder and record the selected media strategy.
5. Build the canonical property payload.
6. Append the property row to Google Sheets.
7. Attempt the property Make compatibility webhook.
8. Persist the redacted submission log.
9. Return separate step outcomes to the frontend.

### Failure policy
- If Drive folder creation fails, stop the process.
- If file upload fails, stop the process and mark submission failed.
- If Sheets fails, do not send to Make.
- If Sheets succeeds but Make fails, mark submission as `partial_failure`.
- Result screen must show exact step outcome: Drive, Upload, Sheets, Make.

Note: `SubmissionSuccessPage` expects the `SubmissionResult` object to be passed via navigation state after a successful submission. If the page is loaded directly (no state), it shows a minimal view with only the submission ID.

### MVP acceptance criteria
- User can reach the add-property flow from the landing page.
- User can submit all required property data.
- User can upload media within the current per-file, 20-file, and approximately 3.8 MB multipart limits.
- App creates one private Drive folder per property.
- App stores media in the configured private Supabase Storage strategy or explicit legacy Drive strategy and returns the strategy/outcome.
- App appends a correctly mapped row in Google Sheets when configured.
- App attempts the property Make compatibility payload and reports success, failure, or partial failure.
- App returns a visible success, failure, or partial-failure state.
- App does not include edit functionality in v1.

Future property changes should update the tenant route/API documentation and the upload strategy together; use `docs/03-operation/usage.md` and `docs/05-integrations/api-contracts.md` as the current behavior references.