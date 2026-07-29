# SPEC-12 Contract Generation — Frontend Focused

**Date:** 2026-07-29
**Priority:** high
**Status:** implemented

---

## Summary

This document defines the next iteration of the contract generation flow with a frontend focus. It prioritizes cleaning up the UI text so the entire contract workflow uses only Spanish, simplifies the client/user form experience, and reorganizes guarantor fields in the `Garantes` section.

## Motivation

Previous versions displayed English text, included the JSON schema in the visible form UI, and maintained explanatory text that should no longer appear in the product. In addition, the `Garantes` section must be adapted to a clearer presentation with two conditional subsections.

## Objectives

- Remove all English text from the contract generation display.
- Rename the client form section `Testigos` to `Propietario`.
- Change the submit button text in both forms from `Enviar formulario` to `Guardar`.
- Remove the JSON schema from both forms.
- When generating a new contract, remove the texts:
  - `Creamos dos formularios privados y alojados en este sitio`
  - `Los enlaces incluyen credenciales de aceso. Compartí el enlace del cliente solo con la persona correspondiente.`
- In the contract generated section, set the user form button text to `Abrir info del contrato` and the client link copy button text to `Formulario del cliente`.
- In the client form `Garantes` section, group fields into two subsections:
  - `Recibo de sueldo`
  - `Garantía propietaria`
- Ensure each guarantor fills at least one of the two subsections; both may be completed but one must be present.

## Scope

Applies to:

- the contract generation page / contract entry flow
- the `client` role form rendering
- the `user` role form rendering, where applicable
- visible interface texts, buttons, and section headings

It does not modify backend contract data logic except to support the new guarantor subsection validation.

## Requirements

### 1. Spanish-only text

- All labels, titles, actions, messages, and buttons in the contract generation workflow must be displayed in Spanish.
- No English text should appear in the visible UI of this flow.
- Example UI text: `Generar contrato`, `Abrir info del contrato`, `Formulario del cliente`, `Guardar`, `Propietario`, `Recibo de sueldo`, `Garantía propietaria`.

### 2. Client form: rename `Testigos` to `Propietario`

- In the client form, any section currently labeled `Testigos` must be displayed as `Propietario`.
- This is purely a presentation change in the UI. If the section exists in the form schema, its visible heading must be `Propietario`.

### 3. Submit button text

- In both forms (`client` and `user`), the main submit button must read `Guardar`.
- It must not say `Enviar formulario` anywhere in the contract workflow.

### 4. Remove the JSON schema

- The panel or view that displayed the JSON schema in the contract forms must be removed from both routes.
- The UI should present only the form fields and visual structure, not the underlying JSON schema.

### 5. Remove specific contract generation text

- In the section that confirms a contract has been generated, remove the following exact texts:
  - `Creamos dos formularios privados y alojados en este sitio`
  - `Los enlaces incluyen credenciales de aceso. Compartí el enlace del cliente solo con la persona correspondiente.`
- If an equivalent message exists, it must also be removed or replaced with a concise Spanish message that does not mention credentials or technical hosting details.

### 6. Buttons after contract generation

- After generating a contract, the button that opens the user-facing form must say `Abrir info del contrato`.
- The button to copy or open the client link must say `Formulario del cliente`.
- These labels are definitive and must not mix with English variants like `Open user form` or `Copy client link`.

### 7. Guarantor field organization

In the client form, the `Garantes` section must be structured into two clear subsections:

- `Recibo de sueldo`
  - `Empresa`
  - `Cuit Empresa`
  - `Cargo`
  - `N de Legajo`
  - `Numero de contacto de la empresa`

- `Garantía propietaria`
  - `Numero de matricula de la propiedad`
  - `Provincia de la propiedad`
  - `Direccion de la propiedad`
  - `Tipo de propiedad`

### 8. Conditional validation for `Garantes`

- For each guarantor, at least one of the two subsections must contain data.
- It is valid for a guarantor to complete both subsections, but both may not be left empty simultaneously.
- The validation should be implemented in the frontend and backed by domain validation if conditional rules exist, so a guarantor with both subsections empty is not accepted.
- If the UI uses repeatable blocks, each guarantor block should clearly present both subsections and show an error message when neither subsection contains data.

## UI/UX details

### Contract generation

- The generation flow should be more compact, without technical messages about hosting or credentials.
- If a summary of the links is shown, it should emphasize the user actions:
  - `Abrir info del contrato`
  - `Formulario del cliente`
- The design should make it clear that the contract has been created and the next step is completing each form.

### Forms

- The client form must visually group the `Garantes` fields under the headings `Recibo de sueldo` and `Garantía propietaria`.
- The client form must show `Propietario` instead of `Testigos` if that section exists.
- Field labels must remain in Spanish; any existing English labels should be translated.

## Acceptance criteria

1. The contract generation workflow no longer shows English in the displayed UI.
2. The client form displays `Propietario` where `Testigos` previously appeared.
3. Both forms use `Guardar` for the submit button.
4. The JSON schema is no longer visible in either form.
5. The specified private-hosting and credential texts have been removed.
6. The button for the user form reads `Abrir info del contrato`.
7. The client link button reads `Formulario del cliente`.
8. The `Garantes` section displays the subsections `Recibo de sueldo` and `Garantía propietaria`.
9. Each guarantor must complete at least one of the two subsections.

## Notes

- This SPEC is frontend-focused. The described validations should be implemented in the UI and supported by domain validation if available.
- The internal contract data schema need not change except to expose the new guarantor subsection presentation and conditional validation requirements.
- Any help text, placeholder, or error message must follow the same Spanish-only policy.

## Implementation notes

- The hosted user form now exposes `Propietario` and both hosted role forms use `Guardar`.
- The role-form JSON panel and the technical hosting/credential copy in the generation modal were removed.
- Guarantor subsection metadata is exposed only by the SPEC-10/11 client-role schema projection, preserving the retained SPEC-09 Google Sheet schema.
- `Tipo de propiedad` is a client-role field stored inside each `garantes` record.
- Frontend validation reports the error on the corresponding guarantor block, and backend role validation independently requires data in at least one of the two subsections.
- Focused coverage lives in `backend/tests/contract-entries-spec12.test.ts`, `frontend/src/pages/ContractFormPage.test.tsx`, `frontend/src/features/contracts/components/ContractEntryModal.test.tsx`, and `frontend/src/features/contracts/components/ContractRepeatableSection.test.tsx`.
