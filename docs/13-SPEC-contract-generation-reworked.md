# SPEC-13 Contract Generation — Subdivisions, Manual Entry Creation, and Admin Inspection

**Date:** 2026-07-29
**Priority:** high
**Status:** implemented

---

## Summary

This document defines the next contract generation iteration for the frontend and admin experience. It introduces explicit subdivisions inside the `Contrato` section of the user form, requires a dedicated button to generate a new contract entry, and extends the contract administration UI so operators can inspect every entry and its media contents.

The new requirements are:
- In the user-side `Contrato` section, group fields into `Vigencia`, `Canon`, and `Ajuste` subsections.
- The contract generation section must not auto-create a new contract entry; instead it must create an entry only when the user clicks the button labeled `Generar nueva entrada para contrato`.
- The administration contract inspection workflow must load contract entries from the database and display submitted data in the exact order the forms were submitted, including associated media. It must show full contract info only when both the user and client forms have been submitted, partial info when only one form is submitted, and no contract fields when neither form has been submitted.

## Motivation

Current contract generation behavior mixes field presentation and entry lifecycle. The `Contrato` section on the user form is flat, the contract generation section may produce a new entry automatically, and the admin interface does not clearly surface the submitted contents or media for a selected entry.

This iteration improves clarity, avoids accidental entry creation, and makes administration inspection deterministic and complete.

## Objectives

- Reorganize the user form `Contrato` section with explicit visual subdivisions.
- Require a dedicated manual action to create a contract entry.
- Make the admin contract entry inspector query the database and display the entry contents from the stored submissions.
- Preserve partial submission handling: user-only, client-only, and no-submission states are all supported and displayed clearly.

## Scope

This spec applies to:
- frontend user form rendering for the `Contrato` section
- contract generation page workflow and button actions
- contract administration entry inspection UI
- backend/data retrieval behavior for admin inspection

This spec does not modify the fields themselves beyond grouping and display behavior.

## Requirements

### 1. User form `Contrato` subdivisions

In the user form, the `Contrato` section must be subdivided as follows:

- `Vigencia`
  - `meses`
  - `inicio`
  - `Formateada_1`

- `Canon`
  - `monto alquiler`
  - `Actualizacion`
  - `Formateada_2`

- `Ajuste`
  - `Ajuste`
  - `fecha actual`

Each subdivision must be visually grouped under a heading matching the name above.

#### Detailed behavior

- `Formateada_1` must be grouped inside `Vigencia` and displayed with the other duration fields.
- `Formateada_2` must be grouped inside `Canon` and displayed with the rent-related fields.
- `Ajuste` and `fecha actual` must be grouped inside the `Ajuste` subdivision.
- The UI should render these field groups consistently across desktop and mobile views.

### 2. Contract generation section behavior

The contract generation section of the page must not automatically generate a new contract entry when the section renders or when the page loads.

Instead, it must:
- present a clear action button labeled `Generar nueva entrada para contrato`
- create the new contract entry only when that button is clicked
- not generate any contract entry on page load, section expansion, or other passive interaction

#### UX details

- The action button should appear in the contract generation section's primary controls.
- If the page currently shows a contract generation panel or card, it must remain passive until the button is clicked.
- After the button is clicked, the UI may display the created entry and associated links or next steps.

### 3. Admin contract inspection behavior

Add a new contract inspection capability in the administration section where an operator can select an entry and load its database-backed details.

The inspection view must:
- query the database for the selected entry and its associated submission payloads
- display all fields in the order they were submitted in the forms
- display associated media alongside field values
- show combined information only if both the user and client forms have been submitted
- show partial information if only one of the two forms has been submitted
- show no contract-form values if neither form has been submitted

#### Display ordering

The inspection UI must preserve submission order as follows:
- if both forms have been submitted, display user form fields followed by client form fields in the same sequence they were displayed in the forms
- if only one form has been submitted, display only that form's fields in their original ordering
- if neither form has been submitted, show a message such as `No hay datos de formulario enviados` and omit contract fields

#### Media handling

- Any media associated with the entry must be displayed directly in the inspection UI or via clearly labeled links.
- Media should be grouped with the fields that reference it, if possible, or with a dedicated `Medios asociados` subsection.
- If the database stores secure file references or signed URLs, the admin view may display preview thumbnails plus a link to view the original media.

#### Partial submission behavior

- If only the user form exists, the inspector shows only user fields and their media.
- If only the client form exists, the inspector shows only client fields and their media.
- If both exist, the inspector shows both sets of fields.
- If neither exists, the inspector must not fabricate fields; instead it must show `No hay datos de formulario enviados` or equivalent.

### 4. Data retrieval contract

The admin inspection view must rely on database-backed retrieval rather than inferred or cached UI state.

Recommended behavior:
- fetch from the stable contract entry record and the associated submission rows
- if the contract entry has a combined final payload, it may use that for display when both forms are complete
- if only role-specific submissions exist, use the stored submission payload for the corresponding role

Backend response shape for inspection may be one of:
- `{ entryId, userSubmission?: {...}, clientSubmission?: {...}, combinedSubmission?: {...}, media: [...] }`
- or a normalized inspection model that preserves submission order and associates media references with field groups

### 5. UX clarity and organization

The admin inspection output must be organized and readable.
- display section headings and field labels clearly
- preserve the same section structure as the forms where possible
- show submission timestamps for user and client submissions
- use a `Contract details` heading and group by form role or form section
- keep field order aligned with the original form definitions

## Acceptance criteria

1. The user form `Contrato` section is rendered with subdivisions `Vigencia`, `Canon`, and `Ajuste`.
2. `meses`, `inicio`, and `Formateada_1` are grouped under `Vigencia`.
3. `monto alquiler`, `Actualizacion`, and `Formateada_2` are grouped under `Canon`.
4. `Ajuste` and `fecha actual` are grouped under `Ajuste`.
5. The contract generation section does not create an entry automatically; a contract entry is created only when `Generar nueva entrada para contrato` is clicked.
6. The admin contract inspection function fetches entry data from the database and displays it in submission order.
7. When both forms are submitted, the inspection view shows all available fields and media.
8. When only one form is submitted, the inspection view shows only that form's submitted fields and media.
9. When neither form is submitted, the inspection view shows no contract fields and displays a clear empty-state message.
10. Associated media is displayed or linked from the admin inspection view.

## Notes

- This spec is a frontend/admin enhancement layer built on top of the existing contract generation flow.
- It does not require adding new fields beyond the specified subdivisions.
- Admin inspection must be implemented with explicit database reads, not inferred from client-side entry list state.

## Testing

- UI test verifying the `Contrato` section renders the three required subdivisions.
- UI test verifying the `Generar nueva entrada para contrato` button creates a new entry while page load does not.
- Admin test verifying the inspection view fetches and displays user-only, client-only, and both-submission cases.
- Admin test verifying the empty-state message appears when no submissions exist.
- Inspection test verifying media references are shown with their associated fields.
- Regression test ensuring the contract generation section no longer auto-creates entries.

## Implementation notes

- `contract_object` remains visible as the ungrouped field at the start of `Contrato`; the three new subdivisions contain only the fields listed in this spec.
- Opening the contract modal is passive. It exposes `Administrar contratos` without creating an entry, while a guarded `Generar nueva entrada para contrato` action remains the only initial UI trigger for entry creation.
- Administrator detail reads the selected entry and its immutable `contract_submissions` rows from Supabase, then reconstructs user-first form order from the backend-authoritative role schemas.
- Entry listing reads Supabase in batches so older entries are not hidden by a fixed result cap.
- Valid private DNI references receive administrator-only, short-lived signed view URLs. The normalized inspection model omits storage paths and bucket details.
- The visible admin heading is `Detalles del contrato` to preserve SPEC-12's Spanish-only requirement.
- Focused coverage lives in `backend/tests/contract-entries-spec13.test.ts`, `frontend/src/pages/ContractFormPage.test.tsx`, `frontend/src/features/contracts/components/ContractEntryModal.test.tsx`, and `frontend/src/features/contracts/components/ContractInspectionDetails.test.tsx`.
