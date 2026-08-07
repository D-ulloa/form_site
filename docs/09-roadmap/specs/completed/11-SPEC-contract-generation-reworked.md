# SPEC-11 Contract Generation — Reworked

**Date:** 2026-07-27
**Priority:** high
**Status:** implemented

---

## Summary

This spec extends `docs/10-SPEC-contract-generation-reworked.md` with the next contract-generation iteration for the client-side intake form. It defines enhancements to the `Inquilino` and `Garantes` sections, adds DNI front/back file support for each tenant and guarantor, removes the `Aprobar Contrato` field from both backend and frontend, and codifies computed `Formateada_1` and `Formateada_2` field behavior.

## Motivation

The current contract-generation workflow uses a single client-side `Inquilino` and `Garante` section and includes a manually editable approval field that does not belong in the contract intake flow. This iteration makes the client form capable of capturing multiple tenants and multiple guarantors, improves user clarity in the `Ajuste` selection, and enforces computed contract dates consistently.

## Objectives

- Allow the client form to capture multiple `Inquilino` entries and multiple `Garantes` entries.
- Keep one default `Inquilino` and one default `Garante` visible initially.
- Provide a clear add control for new tenant and guarantor rows.
- Allow each `Inquilino` and each `Garante` entry to upload up to two DNI files: one front file and one back file.
- Remove the `Aprobar Contrato` field entirely from both frontend forms and backend validation.
- Convert `Ajuste` into a dropdown with exactly two options: `IPC` and `ICL`.
- Keep `Formateada_1` and `Formateada_2` visible in the `Contrato` section but prevent manual editing.
- Compute `Formateada_1` and `Formateada_2` from `Inicio` and `Actualización` instead of accepting user-entered dates.

## Scope

This spec applies to:

- `client` role form schema and rendering
- contract generation backend schema and validation
- submission validation for the `client` and `user` contract flows
- UI behavior for repeated entry sections and read-only computed dates

It does not change the role split between `client` and `user` forms; `Testigos` and the remainder of `Contrato` remain on the user form as defined in the existing 10-SPEC reworked implementation.

## Client Form Requirements

### Multi-entry `Inquilinos` section

- The `Inquilino` section becomes repeatable, representing one or more tenant records.
- The client form must render a single `Inquilino` block by default.
- A clearly visible button labeled `Agregar Inquilino` must allow adding additional tenant blocks.
- Each tenant block contains the same fields as the current `Inquilino` schema.
- All tenant blocks are required to include at least one entry.
- Each added tenant block must be removable individually, unless it is the last remaining block.

### Multi-entry `Garantes` section

- The `Garantes` section becomes repeatable, representing one or more guarantor records.
- The client form must render a single `Garante` block by default.
- A clearly visible button labeled `Agregar Garante` must allow adding additional guarantor blocks.
- Each guarantor block contains the same fields as the current `Garante` schema.
- All guarantor blocks are required to include at least one entry.
- Each added guarantor block must be removable individually, unless it is the last remaining block.

### Field-level behavior

- `Aprobar Contrato`
  - Remove this field from all UI forms.
  - Remove it from backend schema definitions and submission validation.
  - Existing stored values may remain for audit/history, but the field must not be accepted from new submissions.

- `Ajuste`
  - Render as a dropdown/select input with the options `IPC` and `ICL`.
  - Validate backend submissions to accept only `IPC`, `ICL`, or an absent value if the field is optional.
  - Do not allow free-text input for this field.

- `DNI uploads`
  - Each `Inquilino` and each `Garante` entry supports one `Frente DNI` file and one `Dorso DNI` file.
  - Current entries require both sides before submission.
  - The backend enforces the maximum count of two files per tenant/guarantor entry and accepts PDF plus the configured image MIME types; SPEC-17 defines the required-pair policy.
  - If the UI uses a file-list or summary view, it must clearly show both image slots and their upload status.

- `Formateada_1` and `Formateada_2`
  - Keep these fields visible in the contract form UI with their labels unchanged.
  - Display them as readonly values; users must not be able to manually type or choose these dates.
  - Compute values from the contract date fields rather than accepting raw user input.

### Computed date rules

- `Formateada_1` is derived from `Inicio` (`contract_start_date`).
- Calculation rule:
  - Take the month and year of `Inicio`.
  - Subtract one month.
  - Set the day to the last calendar day of that previous month.
- Example:
  - If `Inicio` is `2026-08-15`, `Formateada_1` is `2026-07-31`.
  - If `Inicio` is `2026-03-01`, `Formateada_1` is `2026-02-29` (or `2026-02-28` depending on leap year).

- `Formateada_2` is derived from `Formateada_1` and `Actualización` (`contract_update`).
- Calculation rule:
  - Add `Actualización` months to `Formateada_1`.
  - If `Actualización` is `0`, `Formateada_2` equals `Formateada_1`.
  - If `Actualización` is absent or `null`, `Formateada_2` may remain blank when no update interval is available.
- Example:
  - If `Formateada_1` is `2026-07-31` and `Actualización` is `6`, `Formateada_2` is `2027-01-31`.

### Backend enforcement

- The backend must not trust submitted `contract_formatted_start` or `contract_formatted_update` values.
- On submission, the server should recalculate both values from `contract_start_date` and `contract_update`.
- If incoming values are present, they should be ignored or used only for validation against the computed result.
- If the computed result differs from the submitted value, the backend should either:
  - overwrite the submitted value with the computed date before storage, or
  - reject the submission with a validation error explaining that the field is system-calculated.

## Schema / Data model considerations

This iteration requires a schema extension for repeatable sections.

### Recommended shape for repeated client entries

A contract submission payload for the client role should represent repeated blocks as arrays:

- `inquilinos`: array of tenant objects
- `garantes`: array of guarantor objects

Each object in `inquilinos` and `garantes` contains the same fields currently defined under `Inquilino` and `Garante` respectively.

Example payload fragment:

```json
{
  "inquilinos": [
    {
      "tenant_full_name": "Garcia, Juan",
      "tenant_dni": "12.345.678",
      "tenant_phone": "351-1234567",
      "tenant_nationality": "Argentina",
      "tenant_email": "juan@example.com",
      "tenant_age": 34,
      "tenant_dni_front_image": "https://.../front.jpg",
      "tenant_dni_back_image": "https://.../back.jpg"
    }
  ],
  "garantes": [
    {
      "guarantor_full_name": "Perez, Maria",
      "guarantor_dni": "23.456.789",
      "guarantor_phone": "351-7654321",
      "guarantor_nationality": "Argentina",
      "guarantor_email": "maria@example.com",
      "guarantor_address": "Córdoba, ...",
      "guarantor_dni_front_image": "https://.../front.jpg",
      "guarantor_dni_back_image": "https://.../back.jpg"
    }
  ]
}
```

### Backend field mapping

- Existing flat contract field names may need to migrate or be wrapped into the new array structure.
- If the contract system continues to use flat names for storage, the spec must define a deterministic index-based naming scheme such as `tenant_1_full_name`, `tenant_2_full_name`, `guarantor_1_full_name`, `guarantor_2_full_name`, etc.
- The preferred approach is a first-class repeatable section model, since it keeps the schema scalable and avoids index-based field explosion.

## UI requirements

- Render repeating sections in the client form with visually grouped fieldsets.
- The first `Inquilino` and first `Garante` blocks are always present.
- Use a button with a strong call-to-action label (`Agregar Inquilino` / `Agregar Garante`) adjacent to each section heading.
- Each repeatable block should show a remove action when more than one block exists.
- Each tenant and guarantor block must include file upload controls for DNI files:
  - one upload control labeled `Frente DNI`
  - one upload control labeled `Dorso DNI`
  - enforce a maximum of two files per block.
- `Ajuste` must render as an explicit select/dropdown control with `IPC` and `ICL`.
- Read-only `Formateada_1` and `Formateada_2` values should be displayed in the contract form section using disabled or non-editable UI controls.
- Submitted role data remains available for correction through the same role link; administrator inspection remains read-only.

## Acceptance criteria

1. The client form supports multiple `Inquilino` blocks and multiple `Garante` blocks.
2. Each repeatable section begins with one default block.
3. There is a visible `Agregar Inquilino` button and a visible `Agregar Garante` button.
4. Each `Inquilino` and each `Garante` block can upload exactly two DNI files: one front file and one back file.
5. The `Aprobar Contrato` field is absent from frontend forms and backend schema validation.
6. `Ajuste` is a dropdown with only `IPC` and `ICL` values.
7. `Formateada_1` and `Formateada_2` are visible but user-editable only by the system.
8. `Formateada_1` is computed as the last day of the month preceding `Inicio`.
9. `Formateada_2` is computed as `Formateada_1` plus `Actualización` months.
10. The backend enforces computed values for `Formateada_1` and `Formateada_2` during submission.

## Testing

- Unit test repeated section rendering and add/remove behavior for the client form.
- UI test validating that `Ajuste` only accepts `IPC` or `ICL`.
- UI test validating DNI upload controls for each tenant and guarantor block, with a maximum of two files.
- Backend test rejecting submissions that include `approve_contract`.
- Backend test validating that DNI uploads are accepted only as the front/back pair and capped at two per block.
- Backend test recalculating `Formateada_1` and `Formateada_2` from `contract_start_date` and `contract_update`.
- End-to-end test for one tenant and one guarantor submission plus an additional tenant or guarantor block.

## Implementation notes

- Repeatable client values are persisted as first-class `inquilinos` and `garantes` JSON arrays in the existing Supabase JSONB submission columns.
- The role schema exposes repeatable-section and DNI-slot metadata only on the current client flow; retained SPEC-09 endpoints remain flat compatibility APIs.
- DNI files upload directly to the private `contract-dni` Supabase bucket through signed URLs issued only after client-token authorization. Stored submissions retain private object metadata rather than expiring signed URLs.
- A repeated record must provide the complete front/back pair for current entries. A lone front or back file, a third file field, an unsupported MIME type, an oversized file, or a reference outside the current contract entry is rejected.
- `CONTRACT_DNI_STORAGE_BUCKET` changes the private bucket name and `CONTRACT_DNI_MAX_IMAGE_BYTES` changes the backend object limit; the current bucket policy accepts PDF as well as the configured image types; defaults are `contract-dni` and 10 MB.
- `contract_formatted_start` and `contract_formatted_update` remain in the user role schema as read-only computed fields. The browser previews them, but the backend ignores incoming values and stores its own UTC calendar calculation.
- `supabase/migrations/20260727000000_contract_spec11.sql` provisions the default private bucket. Apply it after the SPEC-10 table/RPC migration.
- Focused coverage lives in `backend/tests/integration/contract-entries-spec11.test.ts` and `frontend/tests/unit/ContractRepeatableSection.test.tsx`.

## Notes

- This spec is built on top of `docs/10-SPEC-contract-generation-reworked.md` and is intended as a client-side enhancement layer.
- The change should preserve the existing two-party workflow while making the client intake form more flexible and better aligned with real rental contract scenarios.
