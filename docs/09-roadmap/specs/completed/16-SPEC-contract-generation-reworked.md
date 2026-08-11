# SPEC-16 Contract Generation — Form polish, editable feedback, and contract identification

**Date:** 2026-07-31  
**Priority:** high  
**Status:** implemented

---

## Summary

This specification defines the next contract generation iteration focused on interaction polish, Spanish-only button text, editable submitted data, stronger admin contract entry identity, and clean generated client page chrome.

## Motivation

The current workflow still exposes inconsistent UI language, limits review-time editing after form submit, and lacks a clear human identifier for contract entries in administration. SPEC-16 ensures the forms behave like editable submissions, administrators can update both user and client data, and contract entries are identified by a contract-specific `Direccion` field rather than an internal ID.

## Objectives

- Add hover affordances to all file- and DNI-upload buttons in the contract generation forms.
- Ensure any remaining English text in those upload controls and labels is translated to Spanish.
- Enable every `Garante` on the client form to submit both `Frontal` and `Dorso` DNI files, consistent with `Inquilino` behavior.
- Rename the user form date label from `Fecha actual` to `Fecha de contrato`.
- After submitting the user or client form, allow the submitted data to remain editable from the feedback page.
- Allow administrators to edit both user and client form data in the `Administrar contratos` section.
- Remove the main page link from the generated client form page header.
- Submit a new contract-level field called `Direccion` and use it as the display identifier for an entry in the administration section instead of the internal ID.

## Scope

Includes:

- frontend form UI behavior for contract generation `user` and `client` pages
- submitted feedback pages after user/client form submission
- `Administrar contratos` administration view and edit flow
- generated client page header chrome and navigation behavior
- contract metadata and display identity for persisted contract entries

Excludes:

- backend schema changes outside adding the new `Direccion` contract identifier field
- unrelated contract generation workflows or legacy pages
- changes to contract persistence semantics not required for editability or identifier display

## Requirements

### 1. Upload button hover polish and Spanish translation

- All buttons used to upload files and DNI files in the contract generation workflow must show a hover effect.
- The hover effect must be visible on both the user form and the client form.
- Any upload-related text, labels, or button copy currently in English in these areas must be translated into Spanish.
- The hover state should reinforce an interactive action, for example by changing background color, border, or shadow.

### 2. Client form DNI upload parity for Garantes

- Every `Garante` block in the client form must support submitting two DNI files: `Frontal` and `Dorso`.
- This behavior must match the existing `Inquilino` DNI upload pattern.
- Each `Garante` entry must be able to attach both files independently, and both are required where the workflow expects both sides of DNI.

### 3. User form date label update

- Replace the user form date label text `Fecha actual` with `Fecha de contrato`.
- This label change must appear on the user form page and on any feedback or review page that reuses the same label.

### 4. Editable feedback page after submission

- After submitting either the user form or the client form, the feedback page shown to the submitter must allow editing of the submitted data.
- Editable fields must reflect the most recent submitted values and permit safe corrections without losing existing attachment references.
- The feedback page should provide a clear edit affordance or return the user to the corresponding form in an editable state.

### 5. Admin editing in Administrar contratos

- Both the submitted user form data and the submitted client form data must be editable by administrators in the `Administrar contratos` section.
- Admins should be able to open a contract entry and revise the fields from both forms, including uploaded DNI attachments if the interface already supports attachment editing.
- The edit experience should preserve the contract entry relationship and not require generating a new entry to make updates.

### 6. Client form generated page header cleanup

- The generated client form page must not include a link to the main page in its header.
- The header should remain minimal and focused on the client form content and navigation relevant to the client workflow only.
- Any persistent global link to the main page must be removed from the generated client route.

### 7. Contract identifier field `Direccion`

- When creating a new contract entry, the submission payload must include a new field named `Direccion`.
- `Direccion` will serve as the contract entry identifier shown in `Administrar contratos` instead of the internal contract ID.
- The administration list, detail view, and any contract-selection UI should display `Direccion` prominently as the entry label.
- The contract entry must continue to retain its internal ID for backend linkage, but the user-facing admin listing must prioritize `Direccion` for identification.

## Acceptance criteria

1. Upload buttons for files and DNI show a hover effect in both contract generation forms.
2. All upload-related text in the contract forms is Spanish-only.
3. Each `Garante` in the client form can submit both `Frontal` and `Dorso` DNI files.
4. The user form label reads `Fecha de contrato` instead of `Fecha actual`.
5. The feedback page after submitting either form allows the submitted data to be edited.
6. Administrators can edit both user and client submission data in `Administrar contratos`.
7. The generated client form page no longer contains a link to the main page in the header.
8. New contract entries submit a `Direccion` field and the admin view uses `Direccion` as the contract identifier.

## Notes

- The editable feedback page behavior should feel like a review-and-correct step, not a final locked confirmation page.
- `Direccion` is a human-facing contract identifier, so it should be validated and displayed consistently in admin listings.
- Removing the main-page link from the client page header should avoid exposing the larger site navigation from the client-facing entry route.
