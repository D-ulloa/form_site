# SPEC-09 Contract Generation (Google Form → Site → Google Sheet)

**Date:** 2026-07-20
**Priority Order:** 9
**Status:** superseded by SPEC-10

---

## Summary

Add a new UI section (peer to the existing Property Submission flow) named **Contract Generation**. The flow: user clicks the Contract Generation action → UI prompts a Google Form site link to copy → after copying, the UI opens a second in-site form (hosted in the app) whose fields are described by a JSON schema displayed to the user → user fills fields and presses `Send` → backend validates and forwards the submission to a target Google Sheet. This SPEC defines UI behavior, JSON field schema, Google Form/Sheet mapping, security/privacy constraints, failure modes, and acceptance criteria.

> This SPEC is modeled stylistically on `references/documentation-structure-guide.md` but is independent in scope and implementation.

## Context

The product currently supports a `Property Submission` workflow. Customers also need a guided contract-generation workflow that integrates with Google Forms (for initial external intake link) and Google Sheets (as the final data sink). The new flow must be audit-friendly, deterministic, and respect existing privacy and integration configuration patterns described in `docs/02-setup/external-services.md`.

## Objective

Provide a robust, auditable, and minimally-privileged Contract Generation flow that:

- Presents an external Google Form link for users to copy (for record or partner use).
- Displays an in-app JSON-described form whose fields are configurable and visible to the user before they fill.
- Sends validated form responses to a designated Google Sheet on `Send`.
- Records an immutable submission receipt for audit and troubleshooting.

## Scope

Includes:

- UI additions: `Contract Generation` entry in the submissions menu and a two-step modal flow.
- JSON field schema definition format for describing in-site form fields.
- Backend validation and mapping layer that transforms JSON-form submission into a Google Sheets append request.
- Minimal Google API integration surface: `Forms` (only for the public link provided by the admin) and `Sheets` for appending rows.
- Audit logs and submission receipts recorded in the existing `logs/` folder structure.

Excludes:

- Implementing a full Google Forms editor inside the app.
- Storing or managing Google OAuth refresh tokens beyond existing external-service patterns (see `docs/02-setup/external-services.md`).
- Performing complex merges or backfills into historical spreadsheets; only append operations are in scope.

Non-Goals

1. Not a replacement for Property Submission — this is an independent complementary workflow.
2. Not implementing two-way sync between Google Forms and in-app JSON schema.
3. Not providing arbitrary advanced Sheet transforms (no formulas injection, no script execution).

## User Story / UI Flow

1. User navigates to the site section and clicks **Contract Generation**.
2. Modal step A (External Link): shows a short explanation and a single-line `Google Form` public link with a `Copy` button. The link is provided by the product admin (not editable by end-users).
3. When user clicks `Copy`, UI marks the link copied and proceeds to Modal step B (In-Site Form).
4. Modal step B displays:
   - A rendered form built from a JSON field schema (see "Field Schema").
   - A read-only JSON view panel showing the exact field names and constraints.
   - `Send` and `Cancel` buttons.
5. User fills the in-site form and clicks `Send`.
6. Client performs client-side validation, then calls backend `POST /api/contracts/submit` with normalized payload.
7. Backend validates, maps fields to the configured Google Sheet columns, appends a row to the target sheet, and returns a receipt object.
8. UI displays success with the receipt and a per-submission link to the audit JSON stored on the server.

UX Notes

- Step A is informational: the external Google Form link is shown and can be copied; copying does not mean the server will receive data from that form — it is a convenience for the user/partner.
- Step B is the canonical submission path for the app; only Step B causes data to be appended to the configured Google Sheet.
- The JSON field schema must be visible and human-readable; the rendered form should follow accessible markup and be keyboard-navigable.

## Data Model / JSON Field Schema

The in-site form fields are described by a JSON Schema-like structure (a lightweight, constrained subset). Backend configuration will expose this schema per contract-type. The minimal shape is:

```json
{
  "contractType": "string",
  "googleFormLink": "string",
  "sheet": {
    "spreadsheetId": "string",
    "sheetName": "string",
    "columnMap": { "fieldName": "Column Header" }
  },
  "sections": [
    {
      "title": "string",
      "fields": [
        { "name": "string", "label": "string", "type": "string", "required": true }
      ]
    }
  ]
}
```

For this contract flow, the actual site form fields are derived from the provided `inside_form.json` structure and are grouped into four sections:

1. Inquilino
2. Garante
3. Propietario
4. Contrato

The schema example for this flow is:

```json
{
  "contractType": "rent-contract-v1",
  "googleFormLink": "https://forms.gle/<public-link>",
  "sheet": {
    "spreadsheetId": "string",
    "sheetName": "string",
    "columnMap": {
      "tenant_full_name": "Nombre Completo (Apellidos, Nombres)",
      "tenant_dni": "DNI (Separar con puntos)",
      "tenant_phone": "Número de Contacto del inquilino",
      "tenant_nationality": "Nacionalidad",
      "tenant_email": "Correo",
      "tenant_age": "Edad",
      "guarantor_full_name": "Nombre Completo (Apellidos, Nombres)",
      "guarantor_dni": "DNI (Separar con puntos)",
      "guarantor_phone": "Número de Contacto del garante",
      "guarantor_nationality": "Nacionalidad",
      "guarantor_email": "Correo",
      "guarantor_address": "Domicilio Especial En la Ciudad de Córdoba (Dirección, Barrio, Ciudad, Provincia)",
      "guarantor_company": "Empresa",
      "guarantor_cuit": "CUIT Empresa (Separar con guión)",
      "guarantor_position": "Cargo",
      "guarantor_employee_id": "Nº de Legajo",
      "guarantor_company_registration": "Número de Matrícula de la Empresa",
      "property_registration_number": "Número de Matrícula de la propiedad",
      "property_province": "Provincia de la Propiedad",
      "property_address": "Dirección de la propiedad (Dirección, Barrio, Ciudad, Provincia)",
      "witness_full_name": "Nombre Completo (Apellidos, Nombres)",
      "witness_dni": "DNI (Separar con puntos)",
      "witness_nationality": "Nacionalidad",
      "contract_object": "1ra. Objeto",
      "contract_months": "meses",
      "contract_start_date": "Inicio (MM/DD/AAAA)",
      "contract_formatted_start": "Formateada_1",
      "contract_rent_amount": "Monto alquiler",
      "contract_update": "Actualización",
      "contract_formatted_update": "Formateada_2",
      "contract_selection": "Ajuste",
      "submission_date": "Fecha Actual",
      "approve_contract": "Aprobar Contrato"
    }
  },
  "sections": [
    {
      "title": "Inquilino",
      "fields": [
        { "name": "tenant_full_name", "label": "Nombre Completo (Apellidos, Nombres)", "type": "string", "required": true },
        { "name": "tenant_dni", "label": "DNI (Separar con puntos)", "type": "string", "required": true },
        { "name": "tenant_phone", "label": "Número de Contacto del inquilino", "type": "string", "required": true },
        { "name": "tenant_nationality", "label": "Nacionalidad", "type": "string", "required": true },
        { "name": "tenant_email", "label": "Correo", "type": "email", "required": true },
        { "name": "tenant_age", "label": "Edad", "type": "number", "required": true, "min": 0 }
      ]
    },
    {
      "title": "Garante",
      "fields": [
        { "name": "guarantor_full_name", "label": "Nombre Completo (Apellidos, Nombres)", "type": "string", "required": true },
        { "name": "guarantor_dni", "label": "DNI (Separar con puntos)", "type": "string", "required": true },
        { "name": "guarantor_phone", "label": "Número de Contacto del garante", "type": "string", "required": true },
        { "name": "guarantor_nationality", "label": "Nacionalidad", "type": "string", "required": true },
        { "name": "guarantor_email", "label": "Correo", "type": "email", "required": true },
        { "name": "guarantor_address", "label": "Domicilio Especial En la Ciudad de Córdoba (Dirección, Barrio, Ciudad, Provincia)", "type": "string", "required": true },
        { "name": "guarantor_company", "label": "Empresa", "type": "string", "required": false },
        { "name": "guarantor_cuit", "label": "CUIT Empresa (Separar con guión)", "type": "string", "required": false },
        { "name": "guarantor_position", "label": "Cargo", "type": "string", "required": false },
        { "name": "guarantor_employee_id", "label": "Nº de Legajo", "type": "string", "required": false },
        { "name": "guarantor_company_registration", "label": "Número de Matrícula de la Empresa", "type": "string", "required": false },
        { "name": "property_registration_number", "label": "Número de Matrícula de la propiedad", "type": "string", "required": true },
        { "name": "property_province", "label": "Provincia de la Propiedad", "type": "string", "required": true },
        { "name": "property_address", "label": "Dirección de la propiedad (Dirección, Barrio, Ciudad, Provincia)", "type": "string", "required": true }
      ]
    },
    {
      "title": "Propietario",
      "fields": [
        { "name": "witness_full_name", "label": "Nombre Completo (Apellidos, Nombres)", "type": "string", "required": true },
        { "name": "witness_dni", "label": "DNI (Separar con puntos)", "type": "string", "required": true },
        { "name": "witness_nationality", "label": "Nacionalidad", "type": "string", "required": true }
      ]
    },
    {
      "title": "Contrato",
      "fields": [
        { "name": "contract_object", "label": "1ra. Objeto", "type": "string", "required": true },
        { "name": "contract_months", "label": "meses", "type": "number", "required": true, "min": 1 },
        { "name": "contract_start_date", "label": "Inicio (MM/DD/AAAA)", "type": "date", "required": true },
        { "name": "contract_formatted_start", "label": "Formateada_1", "type": "date", "required": true },
        { "name": "contract_rent_amount", "label": "Monto alquiler", "type": "number", "required": true, "min": 0 },
        { "name": "contract_update", "label": "Actualización", "type": "number", "required": false, "min": 0 },
        { "name": "contract_formatted_update", "label": "Formateada_2", "type": "date", "required": false },
        { "name": "contract_selection", "label": "Ajuste", "type": "string", "required": false },
        { "name": "submission_date", "label": "Fecha Actual", "type": "date", "required": true },
        { "name": "approve_contract", "label": "Aprobar Contrato", "type": "string", "required": true }
      ]
    }
  ]
}
```

Field types supported (initial): `string`, `email`, `number`, `date`, `boolean`, `select` (with `options` array). `select` fields map to the Sheet column as their selected value.

Validation rules: `required`, `min`, `max`, `pattern` (regex), `maxLength`, and `options` for `select`.

## API / Backend Contract

Endpoint: `POST /api/contracts/submit`

Request body (client -> server):

```json
{
  "contractType": "contract-v1",
  "schemaId": "string",
  "fields": { "party_name": "ACME Inc.", "party_email": "x@acme.com", "contract_value": 12000, "start_date": "2026-08-01", "notes": "..." },
  "meta": { "userId": "user-123", "origin": "ui" }
}
```

Server responsibilities:

- Authenticate & authorize the request (user session or API key).
- Verify `schemaId` and load schema config.
- Run server-side validation using schema rules.
- Sanitize fields to prevent Sheets injection (see Security).
- Map `fields` to sheet columns using `sheet.columnMap`.
- Append a row via Google Sheets API `spreadsheets.values.append` using the service account configured for the product.
- On success, create an audit JSON blob (submission payload, final mapped row, timestamp, userId, submissionId) and store it under `logs/` with a `SUB-YYYY-MM-DD-<hex>.json` name.
- Return `200 { receipt: { submissionId, timestamp, sheetUrl, appendedRange } }` or an appropriate error code.

Failure modes and responses:

- Validation error: `400` with `errors` list.
- Authentication/Authorization: `401` or `403`.
- Google Sheets append error: `502` or `503` with a retriable flag.
- Mapping error (column missing): `500` with guided admin remediation message.

## Google Integration Details

- Google Form: only public link shown in Step A. The app does not need to programmatically read from that form in this initial SPEC.
- Google Sheets: append-only writes performed by a server-side service account; permissions are restricted to the destination spreadsheet(s). Use existing `external-services` patterns for storing service-account credentials (see `docs/02-setup/external-services.md`).
- Use `spreadsheets.values.append` with `valueInputOption=RAW` and provide the exact column mapping order.

Security & Sanitization

- Treat all user-submitted values as untrusted.
- Sanitize values that look like formulas (e.g., leading `=` or `+`, `-`, `@`) before writing to Sheets to avoid formula injection. Preference: prefix with an apostrophe `'` or use the Sheets API `raw` option and explicitly escape formula-starting characters.
- Do not store raw service-account keys in logs. Only store metadata (spreadsheetId, sheetName).
- Ensure audit logs do not expose admin credentials.
- Enforce principle of least privilege: the Sheets service account must only have `Editor` on the target sheet(s) and nothing else.

Privacy

- If contract fields may contain PII or sensitive data, mark them in the schema with `sensitive: true`. Audit logs must redact sensitive fields unless the request is explicitly flagged by an admin for full retention.
- Record `userId`, `submissionId`, and IP in audit JSON for compliance purposes.

Audit & Observability

- Each successful append must produce an audit file in `logs/` named `SUB-YYYY-MM-DD-<hex>.json` containing: `schemaId`, `contractType`, `fields` (redacted per sensitivity), `mappedRow`, `spreadsheetId`, `sheetName`, `appendedRange`, `submissionId`, `userId`, `timestamp`, and `requestId`.
- Metrics: `contracts.submissions.total`, `contracts.submissions.success`, `contracts.submissions.failure`, `contracts.submissions.latency_ms`.

Acceptance Criteria

1. UI presents the two-step modal (copyable Google Form link; in-site JSON-rendered form).
2. JSON schema can render all supported field types and validation rules.
3. `POST /api/contracts/submit` validates, maps, and appends a row to the configured Google Sheet.
4. An audit JSON file is written to `logs/` for every successful submission.
5. Sensitive fields in logs are redacted by default.
6. Error modes return clear, actionable messages for users and admins.
7. No service-account secrets are written to logs or client responses.

Testing

- Unit tests for schema validation, field mapping, and Sheets request formation.
- Integration test (mocked Google APIs) verifying `spreadsheets.values.append` call parameters and correct error handling.
- End-to-end test with a sandbox spreadsheet (optional manual or CI-provisioned resource) to verify full append path.
- Accessibility tests for the in-site form rendering.

Implementation Phases

Phase 1 — Spec and config only (this document): finalize schema, admin config UI shape, and security review.

Phase 2 — Backend + API: implement `POST /api/contracts/submit`, schema loading, server validation, mapping, Sheets append, and audit logging. Add unit and integration tests.

Phase 3 — Frontend: add `Contract Generation` UI entry, two-step modal, JSON-rendered form, client validation, and submission flow. Wire to the backend endpoint.

Phase 4 — Tests & Docs: full integration tests, docs updates (`docs/02-setup/external-services.md`, `docs/05-integrations/api-contracts.md`), operational runbook, and create a sample `schema` config file under `frontend` or `backend` configuration stores.

Phase 5 — Deploy & Monitor: release to staging, run end-to-end tests, monitor metrics, and perform security/privilege audit.

Risks & Mitigations

- Formula injection risk (high): mitigate by sanitizing values before writing to Sheets.
- Data leakage in audit logs (medium): redact sensitive fields; allow admin opt-in for full retention only under strict controls.
- Mis-mapping columns (medium): validate `columnMap` at config time and fail-fast on deployment when columns mismatch.
- Google API quota/availability (low-medium): implement retries with exponential backoff and surface retriable errors to users.

Open Questions

1. Should the app support multiple `sheetName` targets per `contractType` (e.g., regional sheets)? Recommend yes — configuration should support an array mapping by region.
2. Who administers the Google Form public link? Admin UI required to set the link and spreadsheet IDs.
3. Will we support mapping nested structures (e.g., arrays) to multiple columns? For v1, restrict to flat fields only.

## Next Steps

1. Review this draft with stakeholders and finalize the JSON schema subset and admin configuration shape.
2. Create config storage for `contractType` schemas and admin UI to register `googleFormLink` and `sheet` mapping.
3. Implement Phase 2 and Phase 3 per the implementation plan.

---

**Author:** Drafted by product engineering
**Related docs:** [docs/02-setup/external-services.md](../../../02-setup/external-services.md) — Google integration patterns.
