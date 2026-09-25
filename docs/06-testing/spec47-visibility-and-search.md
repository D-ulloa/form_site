# SPEC-47 — Verification

Implementation and local functional verification were completed on 2026-09-24. No database migration was added, no authorization rule was changed, and no hosted deployment or smoke test is claimed by this document. Application deployment remains pending.

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
git diff --check
```

The three non-navigation e2e files require a live loopback API/database fixture (SPEC-39/44/45 style). Without that environment Playwright skips them; they are not replaced by unit tests.

## What changed

| Area | Change |
| --- | --- |
| Shared normalize | `backend/src/arrangements/searchText.ts`, `frontend/src/features/arrangements/utils/searchText.ts` — NFKC + trim + lower + strip combining marks; max 100 chars; empty after trim = no filter. |
| Property list | Optional `search` on contract-3 properties list; server-side scan-loop over existing `spec42_list_arrangement_properties`; cursor binding version bumped and includes search. |
| Order list | Optional `search` on `listAssigned` for manager/viewer; matches name, description, property name; AND with `status`; scan-loop over `internal.list`; cursor scope version bumped and includes search. |
| UI | `Buscar propiedades` / `Buscar órdenes` (300ms debounce, Enter and Limpiar flush) gated to owner/admin/member; distinct empty states; search in TanStack Query keys. |
| Redaction | Property/order/membership IDs removed from cards, panels, assignment/reject dialogs, tenant receipt, invitation accept; HTML ids use `useId`. |

Backend rejects `search` on non-`properties` collections (`FORBIDDEN`) and on personal/tenant audiences (`INVALID_REQUEST` 400). Viewer may send `search` server-side but the UI does not render a bar. Clients without `search` keep the previous list contract.

## Coverage of acceptance criteria

| Acceptance | Evidence |
| --- | --- |
| 1–3: IDs hidden across roles | Integration assertions invert prior ID fixtures (ArrangementRequestCard, properties section, governance, invitation accept); e2e updates in arrangements-navigation, arrangements-database, arrangement-property-invitations, personal-assignments. |
| 4: property search by name | Backend scan-loop + Unicode fold tests; component debounce/Enter/Limpiar tests; distinct empty-state strings. |
| 5: order search name/description/property | Backend match + status AND + pagination tests; dashboard search tests. |
| 6: search+status, cursor reset | Cursor fingerprint includes search (versions 2 / 3–4); integration tests assert query keys and latest request params. |
| 7: scope A/B | Existing org-scoped fixtures unchanged; search never leaves organization scope (no client-side cross-org filter). |
| 8: viewer has no bar | Component tests assert absence of search controls for viewer. |
| 9: Limpiar restores list | Integration tests clear search and assert full list + params without `search`. |
| 10–11: repeated names, a11y, responsive | Labels, aria-labels on Limpiar (unique per list), keyboard flush via Enter; navigation e2e still covers 1280×800 / 390×844 / 320×740. |
| 12: tests check rendered IDs | Inverted fixtures and DOM assertions in integration suites. |
| 13: no migration / no authz change | No files under `supabase/migrations`; capability sets and RLS unchanged; prior SPEC suites included in the run below. |

## Results

Verified locally on 2026-09-24:

- Backend: **355 passed, 0 failed, 22 skipped** (skips are other opt-in DB suites without URLs). Typecheck and build passed.
- Frontend: **250 tests passed across 33 files**. Lint and build passed (existing Vite large-bundle warning only).
- E2E: **5 passed, 12 skipped** — all runnable navigation cases passed at 1280×800, 390×844 and 320×740; database/tenant/personal e2e need the live fixture environment and were not run here.
- `git diff --check` clean.

## Limitations

- Hosted deployment, production smoke tests, and two-organization live isolation were not exercised in this run.
- Full multi-role browser matrix for search (owner/admin/member/viewer/inquilino/personal) is covered at integration/unit level; dedicated SPEC-47 e2e for search was not added beyond redaction updates in existing specs.
- Activation/recovery still follows IMPLEMENTATION-GUIDE §6: ship tolerant backend first, then enable the bars; rollback may drop search but must keep ID redaction.
