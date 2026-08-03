# SPEC-15 Contract Generation — UI polish and downloadable attachments

**Date:** 2026-07-31  
**Priority:** high  
**Status:** draft

---

## Summary

This specification defines a frontend polish pass across the contract generation workflow and contract forms. It standardizes Spanish UI text, improves the generated-link presentation, removes initial connection-status signal clutter, refines the contract popup layout, cleans form header chrome, groups client guarantees, and makes submitted attachments downloadable.

## Motivation

The current contract workflow has UI inconsistencies and clutter that reduce clarity for end users. This SPEC focuses on visible experience improvements only: text normalization, stronger visual separation between generated-user and generated-client routes, simplified form headers, clearer popup buttons, and practical attachment access after submission.

## Objectives

- Replace every visible `Quitar` label with `Eliminar` in the frontend contract workflow.
- After generating a new contract, split the generated-links container into two distinct boxes: one for the user form, one for the client form.
- On the main page initial view, remove all service availability indicators:
  - `Google Drive`
  - `Google sheets`
  - `Make`
  - `Dos formularios`
  - `Datos protegidos`
- In the contract popup:
  - make the generate-contract button larger and centered
  - label that button `Generar nuevo contrato de alquiler`
  - make the `Administrar contratos` button wider and centered
  - keep the popup close action available only in the bottom-right corner
- Remove the top-page div that displays contract ID and status from both the user form and the client form.
- In the client form, combine `Recibos de sueldo` and `Garantía propietarias` into a single major subsection called `Garantías`.
- After final submission in both user and client forms, render attached files as clickable downloadable links, not just plain names.

## Scope

Includes:

- frontend UI text and layout updates in the contract generation workflow
- the contract generation results page after links are created
- the contract popup modal/panel
- contract form pages for both `user` and `client` roles
- attachment presentation after successful submission

Excludes:

- backend contract generation logic beyond supporting downloadable attachment references
- changing submission validation semantics except where needed to support attachments
- new service integration behavior; the removed lights are purely interface elements

## Requirements

### 1. Text normalization

- Any frontend button, label, or action text currently showing `Quitar` must instead show `Eliminar`.
- This applies across the contract generation page, popup, user form, and client form.

### 2. Generated contract links layout

- Once a new contract is generated and both links exist, the UI must present them in two visually separated containers:
  - one box for the user form link
  - one box for the client form link
- Each box must have a clear heading and spacing so they read as separate sections.
- The styling should increase contrast between the two boxes and avoid a single merged link block.

### 3. Main page initial view

- When the main page first opens, do not display any status lights or availability indicators related to external services.
- Remove or hide the following labels/icons from initial load:
  - `Google Drive`
  - `Google sheets`
  - `Make`
  - `Dos formularios`
  - `Datos protegidos`
- If service connection state remains needed elsewhere, it should be moved to a less prominent diagnostics or settings area, not the main landing experience.

### 4. Contract popup layout

- The popup shown when clicking the contract section must have:
  - a prominent, centered primary action button
  - the primary action text exactly `Generar nuevo contrato de alquiler`
  - a wider, centered secondary action button for `Administrar contratos`
  - the close control only in the bottom-right corner
- The generate button must be visually larger than other popup actions and clearly positioned in the popup center area.

### 5. Form header cleanup

- Remove the top-of-page div that displays the contract ID and status from both the user and client forms.
- The forms should start directly with the content sections and field groups, without that contract metadata panel.

### 6. Client form guarantee grouping

- In the client form, present `Recibos de sueldo` and `Garantía propietarias` inside a single parent subsection titled `Garantías`.
- This `Garantías` section should clearly contain both subdivisions and behave as one higher-level grouping.
- The subsection headings should remain visible and semantically grouped within `Garantías`.

### 7. Downloadable attachments

- After successful submission in both user and client forms, any attached files must be displayed as clickable download links.
- The UI should show file name, type, and a direct download affordance.
- Attached files must be reachable and downloadable from the submission review state, not only rendered as static text labels.
- If the form currently shows files as plain names, update that view to include actual download links or buttons.

## Acceptance criteria

1. The frontend no longer shows `Quitar`; it shows `Eliminar` everywhere in the contract workflow.
2. Generated contract links appear in two separate contrast boxes: user form and client form.
3. The main landing page no longer shows service availability lights for `Google Drive`, `Google sheets`, `Make`, `Dos formularios`, or `Datos protegidos`.
4. The contract popup primary button is larger, centered, and labeled `Generar nuevo contrato de alquiler`.
5. The `Administrar contratos` button in the popup is wider and centered.
6. The popup close action remains bottom-right.
7. The top contract ID/status div is removed from both forms.
8. The client form groups `Recibos de sueldo` and `Garantía propietarias` into a single `Garantías` subsection.
9. Submitted attachments in both user and client forms are rendered as downloadable links.

## Notes

- This SPEC is a frontend refinement and does not require backend feature implementation beyond supporting the downloadability of attachments.
- The visual separation of generated links should help users distinguish the two roles and reduce confusion.
- Any existing text or headings that imply service availability should be hidden from the main page landing experience.
