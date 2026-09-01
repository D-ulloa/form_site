# SPEC-22 Contract management — form scrolling, contract list cleanup, and per-user contract access

**Date:** 2026-08-11  
**Priority:** high  
**Status:** implemented; historical record. Current tenant ownership and route behavior are documented in `docs/01-overview/architecture.md` and `docs/03-operation/usage.md`.

---

## Summary

This specification defines a set of contract-management and client-form improvements covering three areas:

- When adding a new guarantor block in the client form, the interface should scroll to the personal-data fields of that new guarantor rather than jumping too far down the page.
- In the `Administrar contratos` section, the alphanumeric contract identifier shown beneath the contract address and status must be removed from the frontend for all contracts.
- In the same `Administrar contratos` section, when a user selects a contract to view its details, the relevant information panel should be scrolled into view first so the user can see the full content without needing to scroll all the way to the bottom.
- The application must use each logged-in user’s unique database ID to restrict contract visibility so that each user can access only the contracts they created, plus any contracts they create from that point forward. Contracts that already existed before this change must remain visible to every user.

This document describes the required behavior only and does not implement any code changes.

## Motivation

The current experience presents several usability and access-control issues. Adding a guarantor causes the page to scroll too far away from the newly added block, making form completion cumbersome. The contract list shows an internal-looking ID in the frontend that is not needed in the UI. Contract detail views require excessive manual scrolling to reach the relevant content. Finally, contract access is not yet constrained by the authenticated user identity, which creates a data-visibility issue for contract administration.

## Objectives

- Improve the client-form experience when adding guarantor blocks by ensuring the view lands near the relevant new fields.
- Remove the visible alphanumeric contract ID from the frontend contract list UI.
- Improve the `Administrar contratos` detail-view experience by auto-scrolling the relevant content area into view when a contract is selected.
- Enforce per-user contract visibility using the signed-in user’s unique database ID, while preserving access to pre-existing contracts already in the database for all users.

## Scope

Includes:

- Client-form scrolling behavior for newly added guarantor blocks.
- Frontend UI cleanup for contract list entries in `Administrar contratos`.
- Contract detail-panel auto-scroll behavior in `Administrar contratos`.
- Backend/frontend access-control logic based on each authenticated user’s unique database ID and the historical exception for pre-existing contracts.

Excludes:

- Unrelated contract-generation features outside the described UI and access-control scope.
- Changes to non-contract data or unrelated admin workflows.
- Implementation-specific database schema design beyond the required access rule and historical compatibility behavior.

## Requirements

### 1. Guarantor block scroll behavior in the client form

- When a user adds a new `Garante` block in the client form, the page must scroll so that the new guarantor’s personal-data fields are visible and positioned near the top of the viewport.
- The scroll target must be the newly created guarantor block’s personal-data section, not a distant part of the page.
- The behavior must avoid overshooting the relevant content and should place the user directly in the newly added guarantor’s entry area.
- The focus should remain on the newly created block in a way that makes immediate editing possible without requiring manual repositioning.

### 2. Remove contract ID from the `Administrar contratos` list UI

- In the `Administrar contratos` section, the alphanumeric identifier displayed beneath the contract address and status must be removed from the frontend for every contract entry.
- The contract list must continue to show the relevant address/status information without the extra identifier.
- The change must apply consistently across all contract cards or rows presented in the section.

### 3. Auto-scroll the selected contract details into view

- When a user selects a contract in `Administrar contratos`, the interface must scroll so the selected contract’s information is immediately visible without requiring the user to manually scroll to the bottom of the page.
- The scroll target should be the selected contract details panel or the first relevant content region within that panel.
- The behavior should occur as part of the contract-selection flow and should ensure the user can review the selected contract details without unnecessary navigation.

### 4. Restrict contract access by the logged-in user’s unique database ID

- The application must use the authenticated user’s unique database ID as the basis for contract access control.
- After this change, each user should be able to access only:
  - contracts they created, and
  - contracts they create from this point forward.
- Contracts that already existed in the database before this change must remain accessible to every user, because those records predate the new access-control rule.
- The access rule must be enforced consistently in the frontend and backend logic that determines which contracts are visible to the current user.
- The system must not expose contracts to users solely because they are present in the database if they are not owned by that user and were created after the access-control rule became active.

## Acceptance criteria

1. Adding a new guarantor in the client form scrolls the page to that guarantor’s personal-data fields instead of jumping too far down the page.
2. The alphanumeric contract identifier is no longer shown in the `Administrar contratos` contract list UI.
3. Selecting a contract in `Administrar contratos` shows the relevant details without requiring the user to scroll all the way to the bottom of the page.
4. Contract visibility is restricted to the current user’s own created contracts and future created contracts, while pre-existing contracts remain accessible to all users.
5. The access-control behavior is consistent across the contract-management experience and does not regress the visibility of legacy contracts.

## Implementation notes

- The scroll behavior for the guarantor block should target the newly created block’s personal-data section directly rather than the page bottom.
- The contract ID removal is a frontend UI change only; the underlying record can keep its identifier internally if needed.
- The contract selection auto-scroll should place the selected detail panel near the top of the visible area so the user sees the relevant content immediately.
- The access-control change should be implemented using the authenticated user’s unique database identifier and should preserve legacy visibility for pre-existing records.
- This specification is intentionally limited to the described behavior; it does not prescribe a particular code structure or database migration pattern.

---

Historical record retained for traceability; its pre-tenant visibility assumptions do not define current organization authorization.
