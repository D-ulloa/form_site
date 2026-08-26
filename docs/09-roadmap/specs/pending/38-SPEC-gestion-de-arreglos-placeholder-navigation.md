# SPEC-38 Gestión de arreglos — main navigation and placeholder page

**Date:** 2026-08-26  
**Priority:** medium  
**Status:** pending  

---

## Summary

This specification defines the addition of a fourth primary action to the authenticated organization home page:

- Add a button labeled `Gestión de arreglos` to the main action-selection page.
- Navigate the user to a new organization-scoped placeholder page when the button is selected.
- Keep the placeholder page intentionally blank for now, while preserving the site's existing visual language and color palette.
- Add an `Inicio` action in the placeholder page header that returns the user to the organization home page.

This is a frontend navigation and page-shell change only. It does not implement arrangement-management functionality and does not require backend, database, or external-service changes.

## Motivation

The application needs a visible entry point for future arrangement-management functionality. Providing the navigation entry and a consistent placeholder page establishes the route and user flow now, without prematurely defining the domain behavior that will be added later.

## Objectives

- Add a clearly labeled `Gestión de arreglos` action to the main authenticated organization page.
- Establish a stable, organization-scoped route for the future arrangements area.
- Provide a visually consistent blank page as the initial destination.
- Give users a clear `Inicio` action to return to the organization home page.
- Preserve all existing main-page actions and their current behavior.

## Scope

Includes:

- The new main-page action, its label, placement, and navigation behavior.
- The new organization-scoped placeholder route and page.
- Header navigation from the placeholder page back to the organization home page.
- Reuse of the existing authentication, organization, layout, typography, and color conventions.
- Frontend route and navigation tests appropriate to the existing test structure.

Excludes:

- Arrangement, repair, maintenance, work-order, or property-service functionality.
- Forms, tables, filters, status indicators, or arrangement-related data.
- Backend endpoints, database tables, migrations, storage, integrations, or permissions beyond the existing page-access boundary.
- Changes to the labels, order, styling, or destinations of the three existing main actions.

## Requirements

### 1. Add the `Gestión de arreglos` main-page action

- The authenticated organization home page must display a fourth primary action labeled exactly `Gestión de arreglos`.
- The new action must appear after the existing three actions, preserving their current order:
  1. `Agregar nueva propiedad`
  2. `Generar contrato`
  3. `Administrar contratos`
  4. `Gestión de arreglos`
- It must use the same primary-action/card interaction pattern as the existing actions, including keyboard accessibility and a clearly visible hover/focus state.
- Selecting the action must navigate to the new organization-scoped placeholder page.
- The existing three actions must continue to navigate and behave exactly as they do before this change.

### 2. Add the organization-scoped placeholder route

- The placeholder page must be available at:

  ```text
  /t/:organizationSlug/arrangements
  ```

- The route must remain inside the existing organization route boundary so the selected organization is taken from the validated route context.
- The page must use the same authentication and organization-access behavior as the other organization-scoped pages.
- Direct navigation to the route must not bypass the existing session or organization checks.
- No arrangement data or arrangement-management controls should be loaded or displayed in this initial version.

### 3. Render the blank placeholder page

- The page must contain the existing site-level visual shell, including the established background, surfaces, typography, spacing, and responsive behavior.
- The color palette must remain consistent with the current site, including the existing dark base, translucent surfaces, borders, and accent treatment.
- The content area must remain intentionally blank apart from the shared page shell and required header navigation.
- Do not add temporary product copy, mock records, fake controls, or unrequested explanatory content.
- The page must render correctly on supported desktop and mobile viewport sizes.

### 4. Add the `Inicio` header action

- The placeholder page header must include a visible action labeled exactly `Inicio`.
- Selecting `Inicio` must return the user to the organization-scoped main page:

  ```text
  /t/:organizationSlug
  ```

- The organization slug must be preserved when navigating back so the user returns to the same organization context.
- The action must be keyboard-focusable and have an accessible name matching its visible label.
- The action must follow the site's existing header-link or header-button styling conventions.

## Navigation behavior

```text
Organization home
        │
        └── Gestión de arreglos
                │
                ▼
        Arrangements placeholder
                │
                └── Inicio ──► Organization home
```

The browser back action should continue to work according to the application's existing router behavior. This specification does not require a new navigation history policy.

## Acceptance criteria

1. The authenticated organization home page displays all four primary actions with the exact labels and order defined above.
2. Clicking `Gestión de arreglos` navigates to `/t/:organizationSlug/arrangements` for the active organization.
3. The three existing actions retain their current labels, positions, destinations, and behavior.
4. The arrangements route is protected by the existing authentication and organization route boundary.
5. The destination page is intentionally blank apart from the shared site shell and header navigation.
6. The destination page uses the site's current color palette and remains visually consistent with the main page on supported viewport sizes.
7. The destination header contains an accessible `Inicio` action.
8. Clicking `Inicio` navigates to `/t/:organizationSlug` and preserves the active organization context.
9. No backend, database, storage, integration, or arrangement-domain behavior is introduced by this scope.

## Implementation notes (non-normative)

- The new action should reuse the existing main-page action-card structure and interaction conventions.
- The route should be added alongside the existing organization-scoped routes and should render through the same organization context boundary.
- The placeholder header may reuse the existing top-bar treatment used by the application. The exact icon and internal component structure are implementation choices as long as the required label, destination, accessibility, and visual consistency are preserved.
- A stable frontend test identifier may be added for the new action if that matches the project's existing testing conventions; the identifier is not part of the user-facing contract.
- Future arrangement functionality should be specified separately and must not be inferred from this placeholder route.

## References

- `docs/09-roadmap/specs/completed/21-SPEC-administrar-contratos-navigation.md` — prior main-navigation specification and acceptance-criteria style.
- `docs/09-roadmap/specs/completed/22-SPEC-contract-management-ui-and-access-control.md` — prior navigation and UI-behavior specification style.
- `docs/07-development/engineering-standards.md` — frontend route and documentation conventions.
- `frontend/src/pages/ActionSelectionPage.tsx` — current organization home actions and visual conventions.
- `frontend/src/App.tsx` — current route topology and organization route boundary.

---

Status: pending review. Author: redacted.
