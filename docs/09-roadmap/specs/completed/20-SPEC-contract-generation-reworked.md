# SPEC-20 Contract Generation — Client form layout, majority checkbox, autofocus for repeated blocks, upload status feedback, and date formatting fixes

**Date:** 2026-08-07  
**Priority:** high  
**Status:** implemented

---

## Summary

This specification defines the next client-form refinement for the contract-generation workflow. It addresses a set of UI and data-handling issues in the client form, including the placement of guarantor DNI upload controls, the replacement of the inquilino age field with an explicit majority-status checkbox, automatic focus and scrolling for newly added inquilino or garante blocks, accurate upload-state feedback for file controls, and correct year handling for the formatted date fields.

## Motivation

The current client form presents several interaction and data-flow problems that make the contract-generation experience less reliable and less intuitive. Guarantor DNI upload controls are grouped in a way that does not visually belong to each guarantor entry, the inquilino age field does not reflect the requested majority logic, newly added repeated blocks do not receive immediate attention, upload controls do not accurately reflect attachment state, and the formatted date fields do not fully account for future years.

## Objectives

- Place the DNI upload control directly beneath each guarantor's personal-information block in the client form.
- Replace the inquilino age field with a checkbox labeled "Soy mayor de edad" and ensure the backend handles the new majority-status data.
- Automatically focus and scroll to newly added inquilino or garante blocks when they are created.
- Ensure the client-form upload UI clearly reflects whether a file has been uploaded or not.
- Correct the formatting logic for `formateada_1` and `formateada_2` so the year is included accurately, including future-year cases.

## Scope

Includes:

- Client-form layout and repeated-block behavior in the contract-generation workflow.
- Frontend and backend handling of the inquilino majority-status field.
- Client-form upload status feedback and repeated-block focus behavior.
- Date-formatting logic for `formateada_1` and `formateada_2`.

Excludes:

- Unrelated contract-generation features outside the client form.
- Changes to the user form or admin interfaces unless they are required to support the new client-form data contract.

## Requirements

### 1. Guarantor DNI upload placement

- In the client form, within the `Garantes` section, each guarantor entry must render its DNI upload control immediately below that guarantor's personal-information fields.
- The DNI upload area must remain visually associated with the specific guarantor block instead of appearing under the shared section container or in a less local position.
- The layout must preserve the current repeatable structure while making each guarantor's upload control appear directly alongside that guarantor's data entry area.

### 2. Inquilino majority checkbox

- The current age field for the `Inquilino` block must be removed and replaced with a checkbox labeled `Soy mayor de edad`.
- The checkbox must represent a clear affirmative confirmation of the client's majority status.
- The frontend must submit the new majority-status field using the appropriate contract payload structure.
- The backend must accept, validate, and persist the new majority-status value in the submission data.
- Any legacy field names, validation rules, or downstream mappings tied to the prior age field must be updated to support the checkbox-based representation.

### 3. Focus management for newly added inquilino or garante blocks

- When a user adds a new `Inquilino` or `Garante` entry, the page must automatically focus the newly created block.
- The view must scroll so the new block is visible and its first relevant input is immediately available for editing.
- The behavior must apply to each new repeated block and should not require the user to manually locate the new entry.
- The focus target should be the first meaningful input within the newly added block, such as the first name or primary field.

### 4. Upload status feedback

- The client-form upload controls must display accurate state information for whether a file has been uploaded or selected.
- The UI must not continue to show a stale "no file uploaded" state once an actual file has been attached.
- The visible upload state must update immediately after file selection or upload completion and remain accurate while the form is being edited.
- The same behavior must apply consistently to all relevant file-upload inputs in the client form.

### 5. Date formatting for `formateada_1` and `formateada_2`

- The values of `formateada_1` and `formateada_2` must be derived from the `Inicio` and `actualizacion` fields respectively.
- The day and month calculations must continue to work as intended.
- The year component must also be included in the formatted output.
- If the computed formatted date falls in a future year, the output must display that future year correctly.
- The formatting logic must not ignore the year when the date is in or beyond the next year.

## Acceptance criteria

1. Each `Garante` block displays its DNI upload control directly beneath that guarantor's personal-information fields.
2. The `Inquilino` age input is replaced by a checkbox labeled `Soy mayor de edad`, and the resulting value is transmitted and stored through the backend.
3. Adding a new `Inquilino` or `Garante` automatically scrolls the view and focuses the new block's first input.
4. The client-form file upload UI shows an accurate uploaded/not-uploaded state after a file is attached.
5. The `formateada_1` and `formateada_2` fields include the correct year, including future-year cases.

## Implementation notes

- This change applies to the client-side contract-generation form and the backend payload validation and storage path that handles the affected fields.
- The repeated-block UI should preserve the existing card or container structure while improving layout association and focus behavior.
- The new majority-status field should be represented in the submission contract in a way that is compatible with current backend expectations or explicitly migrated where required.
- The date-formatting logic should use the full date components, including year, when deriving `formateada_1` and `formateada_2`.
- This specification is intended as a development specification only and does not define the implementation approach beyond the required behavior.
