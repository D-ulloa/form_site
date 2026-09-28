# SPEC-47 — Verification

Implementation and local functional verification were completed on 2026-09-24; the unit/API and frontend suites were rerun on 2026-09-25. No database migration, capability change, or RLS change was made. Search is explicitly unavailable to viewers at the API boundary (property search returns `FORBIDDEN`; order search returns `INVALID_REQUEST`), while their existing unfiltered read access remains. No hosted deployment or smoke test is claimed; application deployment remains pending.

## Reproducible commands

```bash
npm --prefix backend test
npm --prefix backend run typecheck
npm --prefix backend run build
npm --prefix frontend test
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:e2e -- \
  tests/e2e/arrangements-navigation.spec.ts \
  tests/e2e/arrangements-database.spec.ts \
  tests/e2e/inquilino-arrangements.spec.ts \
  tests/e2e/personal-assignments.spec.ts
npm --prefix frontend run test:e2e -- tests/e2e/arrangements-navigation.spec.ts
npm --prefix frontend run test:e2e
git diff --check
```

The three non-navigation e2e files require a live loopback API/database fixture (SPEC-39/44/45 style). Without that environment Playwright skips them; they are not replaced by unit tests.

## What changed

| Area | Change |
| --- | --- |
| Shared normalize | `backend/src/arrangements/searchText.ts`, `frontend/src/features/arrangements/utils/searchText.ts` — NFKC + trim + lower + strip combining marks; max 100 chars; empty after trim = no filter. |
| Property list | Optional `search` on contract-3 properties list; server-side scan over existing `spec42_list_arrangement_properties`; search cursor binding includes the normalized query, while the exact legacy no-search cursor binding remains accepted. Viewer search is rejected (`FORBIDDEN`). |
| Order list | Optional `search` for owner/admin/member; matches name, description, property name and combines with `status`; search cursor scope includes the query, while legacy no-search cursors remain compatible. Viewer search is rejected (`INVALID_REQUEST`); unfiltered viewer listing remains. |
| UI | `Buscar propiedades` / `Buscar órdenes` (300ms debounce, Enter and Limpiar flush) gated to owner/admin/member; distinct empty states; search in TanStack Query keys. Inputs expose the 100-character limit and feedback; an overlong draft does not replace the last valid committed filter. |
| Redaction | Property/order/membership IDs removed from cards, panels, assignment/reject dialogs, tenant receipt, invitation accept; HTML ids use `useId`. |

For property search, the server scans at most 50 source pages of 100 rows each per request. Order search uses the same 50 × 100 scan budget. If a sparse search cannot establish a complete page within that budget, the service fails closed rather than claiming the results are complete: properties return `DEPENDENCY_NOT_READY`, orders `DEPENDENCY_UNAVAILABLE`. This known large-list limitation is intentionally deferred. Backend also rejects `search` on non-`properties` collections (`FORBIDDEN`) and on personal/tenant audiences (`INVALID_REQUEST` 400). Clients without `search` keep the previous list contract.

## Coverage of acceptance criteria

| Acceptance | Evidence |
| --- | --- |
| 1–3: IDs hidden across roles | Integration assertions invert prior ID fixtures (ArrangementRequestCard, properties section, governance, invitation accept); e2e updates in arrangements-navigation, arrangements-database, arrangement-property-invitations, personal-assignments. |
| 4: property search by name | Backend scan-loop + Unicode fold tests; component debounce/Enter/Limpiar tests; distinct empty-state strings. |
| 5: order search name/description/property | Backend match + status AND + pagination tests; dashboard search tests. |
| 6: search+status, cursor reset | Cursor fingerprint includes search; legacy no-search cursors remain compatible for property, order, request-list and assignee reads. On `INVALID_CURSOR`, each list hook performs at most one automatic reset/restart for that query key. |
| 7: scope A/B | Existing org-scoped fixtures unchanged; search never leaves organization scope (no client-side cross-org filter). |
| 8: viewer has no search | Component tests assert absence of controls; service tests assert viewer search is rejected before persistence (property `FORBIDDEN`, orders `INVALID_REQUEST`) while unfiltered reads remain available. |
| 9: Limpiar restores list | Integration tests clear search and assert full list + params without `search`. |
| 10–11: repeated names, a11y, responsive | Labels, aria-labels on Limpiar (unique per list), keyboard flush via Enter; navigation e2e checks both search controls and a minimum 160px width at 1280×800 / 390×844 / 320×740. It does not perform a database-backed search-result flow. |
| 12: tests check rendered IDs | Inverted fixtures and DOM assertions in integration suites. |
| 13: no migration / no capability or RLS change | No files under `supabase/migrations`; capability sets and RLS unchanged; viewer search is denied by query validation as required by the SPEC. |

## Results

Fresh unit/API and frontend test results on 2026-09-25:

- Backend `npm test`: **357 passed, 0 failed, 22 skipped** (379 total; skipped tests require opt-in database URLs).
- Frontend `npm test -- --reporter=dot`: **253 passed across 33 files**.
- Typecheck/build and lint/build passed in the 2026-09-24 verification run; they were not rerun on 2026-09-25.
- The selected four-file E2E command passed **5 tests and skipped 12** on 2026-09-24; the runnable navigation cases (including all three viewports) passed, while the database/tenant/personal cases needed live fixtures. A 2026-09-25 rerun of `arrangements-navigation.spec.ts` could not launch Chromium because the Playwright browser executable is not installed in this environment; no browser assertions ran.
- The broader Playwright run on 2026-09-24 reported **14 passed, 18 skipped, 8 failed**: three SPEC-42 property-invitation layout/EventSource failures, four Google OAuth callback/redirect failures, and one property-submission entry timeout. These are not evidence of a green full browser suite; they are not search-specific assertions.
- `git diff --check` was clean after this documentation update.

## Limitations

- Hosted deployment, production smoke tests, and two-organization live isolation were not exercised in this run.
- Full multi-role browser matrix for search (owner/admin/member/viewer/inquilino/personal) is covered at integration/unit level; browser checks cover bar visibility/layout, not an end-to-end search-result flow.
- Each search request scans at most 5,000 source records. Sparse property searches can return `DEPENDENCY_NOT_READY`; sparse order searches can return `DEPENDENCY_UNAVAILABLE` at this boundary. Fixing this larger-list limitation is deliberately outside the current scope.
- Activation/recovery still follows IMPLEMENTATION-GUIDE §6: ship tolerant backend first, then enable the bars; rollback may drop search but must keep ID redaction.
