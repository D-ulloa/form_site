# SPEC-21 Administrar Contratos — Main navigation and user-form link updates

**Date:** 2026-08-10  
**Priority:** medium  
**Status:** implemented

---

## Summary

This specification defines three small but visible navigation changes to the public-facing site that improve direct access to the `Administrar contratos` interface:

- Remove the current third action labeled `Editar propiedad` from the main entry page entirely.
- Add a new third action on the main entry page (replacing the removed slot) that navigates directly to the `Administrar contratos` section of the application. Existing other links to `Administrar contratos` must remain unchanged.
- On the user form header, add a `Contratos` header action next to the existing `Inicio` link that navigates directly to the `Administrar contratos` interface.

This document intentionally defines UI and navigation requirements only; it does not specify implementation details or make code changes.

## Motivation

Users commonly need fast access to the `Administrar contratos` interface. The current `Editar propiedad` action on the main page is unused and provides no value; replacing it with a clear, direct navigation target reduces friction and surface area for confusion. Adding a `Contratos` header link on the user form provides consistent, discoverable navigation to contract administration from within user workflows.

## Objectives

- Remove an obsolete and unused action from the main entry page.
- Provide a clear, primary navigation shortcut to `Administrar contratos` from the main page.
- Add an always-visible `Contratos` link in the user form header beside `Inicio`.
- Preserve all existing routes and links to `Administrar contratos` in the app; this change is additive (adds one more main-page access) and corrective (removes an unused action).

## Scope

Includes:

- Specification of main page action labels, order, and target for the new button.
- Specification of the header link on the user form and its target.
- Acceptance criteria describing visible UI and navigation behavior.

Excludes:

- Any backend, database, routing, or authentication changes beyond navigation targets.
- Styling refinements beyond brief label and order guidance.
- Accessibility and localized copy beyond a single-language label example (Spanish) — implementers should localize as appropriate.

## Requirements

### 1. Remove `Editar propiedad` action from the main page

- The third action currently labeled `Editar propiedad` on the main entry page must be removed completely from the DOM and UI.
- Any hidden helper text, aria-labels, or programmatic hooks exposed solely for `Editar propiedad` must be removed or repurposed.
- No other main-page actions should change their label or position other than the reflow that results from removing this item.

### 2. Add a new third main-page action targeting `Administrar contratos`

- A new third action must appear in the same slot previously occupied by `Editar propiedad` (i.e., the main page should maintain three primary actions in the same order where applicable).
- Label: `Administrar contratos` (Spanish); implementers should wire the label into the localization system used by the site.
- Target: the new action navigates the user directly to the `Administrar contratos` interface. Navigation behavior should match other main-page actions (e.g., same page transition pattern or route navigation method used elsewhere).
- The new action is an additional direct access point; it must not remove or change any of the existing alternate access points to `Administrar contratos` elsewhere in the application.

### 3. Add `Contratos` header link on the user form

- In the header area of the user form (the header that contains `Inicio`), add a sibling action labeled `Contratos` placed immediately after `Inicio`.
- Label: `Contratos` (Spanish); localize via the existing localization framework.
- Target: clicking `Contratos` navigates directly to the `Administrar contratos` interface, using the same route or UI entry used by the new main-page action.
- The link should be keyboard-focusable and carry an accessible name consistent with the label.

## Acceptance criteria

1. The main entry page no longer shows any `Editar propiedad` action or related UI elements.
2. The main entry page presents three primary actions where the third action is `Administrar contratos` and its behavior navigates to the contract administration UI.
3. Existing accesses to `Administrar contratos` in other parts of the app remain present and function as before.
4. The user form header contains a `Contratos` link immediately adjacent to `Inicio` that navigates to the `Administrar contratos` interface.
5. Navigation for the new main action and header link uses the same route target as other `Administrar contratos` entry points to avoid duplication of admin views.

## Implementation notes (non-normative)

- The site uses a consistent route or anchor for `Administrar contratos`; implementers should use the canonical route to avoid diverging navigation targets.
- If the main page action set is generated from a configuration or data structure, remove the `Editar propiedad` entry from that source and add a new `Administrar contratos` entry with the canonical target.
- Ensure the new header link reuses existing UI components for header actions to maintain consistent styling and keyboard behavior.
- No backend changes are required; this is a navigation and UI spec only.

## References

Used completed specs and historical guidance for tone and structure:

- docs/09-roadmap/specs/completed/19-SPEC-contract-generation-reworked.md
- docs/09-roadmap/specs/completed/20-SPEC-contract-generation-reworked.md
- docs/09-roadmap/specs/completed/09-SPEC-contract-generation.md


---

Status: pending review. Author: redacted.
