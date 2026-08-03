# SPEC-18 Contract Generation — Frontend-only form copy, dropdown values, upload guidance, and editable feedback

**Date:** 2026-08-03  
**Priority:** high  
**Status:** draft

---

## Summary

This specification defines the next frontend-focused contract generation iteration for the user and client forms. It covers three requested UI refinements: the user-form adjustment dropdown must expose `IPC` and `ICL` rather than `IPL`, the client-form guarantor upload helper text must present a simplified accepted-format message of `PDF, JPG, PNG`, and the post-submission feedback screen must offer an edit action so the submitter can correct and resend data if needed.

## Motivation

The current contract-generation workflow still needs clearer frontend guidance around form choices and upload expectations, and the post-submission feedback experience should support corrections without forcing the user to start over. This spec addresses those gaps as presentation and interaction improvements only, without changing backend behavior.

## Objectives

- Update the user form’s `Contrato` / `Ajuste` area so the adjustment dropdown presents `IPC` and `ICL` and no longer exposes `IPL`.
- Update the client form’s `Garantías` subsection so the upload helper text for `Recibo de sueldo` and `Garantía propietaria` visibly communicates accepted formats as `PDF`, `JPG`, and `PNG` only.
- Add an edit action to the feedback screen after submitting either the user form or the client form so the submitter can reopen the form, correct issues, and resend the data.
- Keep the scope strictly frontend-focused for these changes and avoid backend validation or persistence changes.

## Scope

Includes:

- frontend form copy and dropdown options for the user and client contract forms
- upload helper text and visible format guidance in the client form `Garantías` subsection
- post-submission feedback-screen affordances for edit-and-resend recovery

Excludes:

- backend validation, schema changes, storage logic, or persistence behavior
- unrelated contract-generation workflow changes
- changes to upload processing beyond the visible frontend guidance requested here

## Requirements

### 1. Adjustment dropdown values on the user form

- In the user form, within the `Contrato` / `Ajuste` area, the adjustment dropdown must present the valid options `IPC` and `ICL`.
- The option `IPL` must not appear in the user-facing dropdown.
- This is a presentation and form-option change only; no backend mapping or business-logic change is required by this SPEC.

### 2. Frontend-only upload guidance for guarantor uploads

- On the client form, under the `Garantías` subsection, the upload controls for `Recibo de sueldo` and `Garantía propietaria` must show accepted formats in the frontend copy as `PDF`, `JPG`, and `PNG`.
- The visible helper text should not enumerate a broader historical list of extensions; it must use the simplified frontend-facing copy `PDF, JPG, PNG`.
- This change is limited to what the user sees in the UI. No backend validation or storage behavior changes are part of this redaction.

### 3. Edit-and-resend affordance on the feedback screen

- After submitting either the client form or the user form, the feedback screen must present an `Editar` action.
- This action must allow the submitter to reopen the corresponding form in an editable state so they can correct any data issues and submit again.
- The behavior should be framed as a recovery path for submission errors or corrections, not as a new final-state workflow.
- This requirement is intended to cover the post-submission experience that has not been implemented in the recent contract-generation specs.

### 4. Frontend-only scope and safety

- The scope of this SPEC is frontend copy, labels, helper text, and interaction affordances only.
- Any backend validation, persistence, or upload-processing changes should remain out of scope and are not part of this redaction.

## Acceptance criteria

1. The user-form adjustment dropdown includes `IPC` and `ICL` and does not expose `IPL`.
2. The client-form `Garantías` upload helper text for `Recibo de sueldo` and `Garantía propietaria` displays `PDF, JPG, PNG` as the frontend-visible accepted formats.
3. The submission feedback screen for both user and client workflows offers an edit action that returns the user to the form for correction and resubmission.
4. The changes remain frontend-only, with no backend validation or schema behavior change required by this SPEC.

## Notes

- This document is a redaction-only specification and does not implement or deploy any changes.
- The intent is to improve clarity and recovery in the UI while preserving existing backend behavior unless a future spec separately requests it.
- If future implementation work is staged, frontend copy should be updated first and backend validation changes should remain separate.
