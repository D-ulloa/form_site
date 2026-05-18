Perfect — with those decisions locked, the MVP can now be defined as a single-purpose internal React web app for **creating new properties only**, where every successful submission always creates the property assets in Drive and always triggers both Google Sheets and Make. Because this is an internal admin-style workflow, the product should favor compact screens, clear labels, visible submission states, and predictable navigation over a marketing-style site. [perplexity](https://www.perplexity.ai/search/cc32b125-dc4a-422b-98d2-9009e48c9d21)

## Locked scope

The initial product is a React-based internal web application with an action-selection landing page and one enabled action: **Agregar nueva propiedad**. The interface should stay compact, label-first, and operationally clear, which matches recommended web app patterns for admin tools and data-entry flows. [perplexity](https://www.perplexity.ai/search/cc32b125-dc4a-422b-98d2-9009e48c9d21)

Locked product rules:
- Sheets update: always runs.
- Make webhook: always runs.
- Property lifecycle in MVP: create only, no edit mode.
- Upload limit: hard cap of 1 GB total per submission.
- Media count: no fixed file-count limit as long as the submission remains under the total cap.
- Folder naming convention: `OP-{localidad}-{tipo_de_inmueble}-{calle_sanitizada}-{timestamp}`.

Recommended example:
- `OP-mar-del-plata-casa-av-colon-1234-20260510-2128`

## User flow

The app should use a simple route structure so the workflow is always obvious: landing page, new-property form, and result state. In a web app, the main action should be explicit, the URL should reflect the current view, and loading/error states should be shown clearly instead of hidden behind ambiguous UI. [perplexity](https://www.perplexity.ai/search/cc32b125-dc4a-422b-98d2-9009e48c9d21)

### MVP flow
1. User lands on `/`.
2. User selects `Agregar nueva propiedad`.
3. User completes the property form on `/properties/new`.
4. User uploads images/videos.
5. User submits the form.
6. Backend validates data and files.
7. Backend creates the Google Drive folder.
8. Backend uploads all files to that folder.
9. Backend appends the row in Google Sheets.
10. Backend sends the JSON payload to Make.
11. App shows success or failure on `/properties/success/:submissionId` or inline error state.

### Required screens

| Route | Screen | Purpose |
|---|---|---|
| `/` | Action selection | Show one active option: Agregar nueva propiedad |
| `/properties/new` | New property form | Main data-entry screen |
| `/properties/success/:submissionId` | Result screen | Show submission outcome, Drive folder link, and processing status |
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
    router/
    providers/
  pages/
    ActionSelectionPage.tsx
    NewPropertyPage.tsx
    SubmissionSuccessPage.tsx
  features/properties/
    components/
      PropertyFormLayout.tsx
      BasicInfoSection.tsx
      LocationSection.tsx
      DistributionSection.tsx
      FeaturesSection.tsx
      MultiSelectArraysSection.tsx
      MediaUploadSection.tsx
      ReviewSubmitPanel.tsx
    hooks/
      usePropertyForm.ts
      useMediaValidation.ts
      useCreatePropertySubmission.ts
    schemas/
      propertySchema.ts
      mediaSchema.ts
    services/
      propertyApi.ts
      payloadMapper.ts
  components/ui/
    Button.tsx
    Input.tsx
    Select.tsx
    Checkbox.tsx
    MultiSelectChips.tsx
    FileDropzone.tsx
    UploadProgressList.tsx
    AlertInline.tsx
    StepHeader.tsx
```

### Backend modules
```text
backend/
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
- Total upload size must not exceed 1 GB.
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

### Submission orchestration
The backend flow should run in this exact order:
1. Validate payload.
2. Generate `property_id` and `submission_id`.
3. Generate Drive folder name.
4. Create Drive folder.
5. Upload media files.
6. Build canonical property payload.
7. Append row to Google Sheets.
8. Send payload to Make.
9. Persist submission log.
10. Return final result to frontend.

### Failure policy
- If Drive folder creation fails, stop the process.
- If file upload fails, stop the process and mark submission failed.
- If Sheets fails, do not send to Make.
- If Sheets succeeds but Make fails, mark submission as `partial_failure`.
- Result screen must show exact step outcome: Drive, Upload, Sheets, Make.

### MVP acceptance criteria
- User can reach the add-property flow from the landing page.
- User can submit all required property data.
- User can upload media up to 1 GB total.
- App creates one Drive folder per property.
- App stores all uploaded files in that folder.
- App appends a correctly mapped row in Google Sheets.
- App sends the payload to Make every time.
- App returns a visible success, failure, or partial-failure state.
- App does not include edit functionality in v1.

The next strongest deliverable would be a field-by-field wireframe and component map for `/properties/new`.