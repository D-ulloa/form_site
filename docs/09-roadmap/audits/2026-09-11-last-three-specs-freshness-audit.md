# Documentation freshness audit — SPEC-38, SPEC-39, and SPEC-40

Status: reviewed 2026-09-11; updated after the SPEC-40 development migration the same day.

## Scope

Checked the three latest direct-child implementation folders, their task evidence
and implementation guides, roadmap indexes, operation and API contracts, setup and
testing docs, current routes/capability code, migrations, and focused test files.

## Current state

- SPEC-38 is implemented and its original placeholder was subsequently replaced by
  SPEC-39's persisted open-order dashboard. Its task now records that historical
  evolution.
- SPEC-39 is implemented locally; migration `20260910120000_spec39_arrangement_orders.sql`
  is recorded as applied to the `multi-tenant` Supabase branch, while application
  deployment remains pending.
- SPEC-40 is implemented and locally verified. Migration
  `20260911120000_spec40_inquilino_role.sql` was applied to Supabase development
  branch `multi-tenant` (`kcobkbtieyowdmsvtsvv`) on 2026-09-11. Live SQL checks
  confirmed the role constraints, forced RLS, RPC definitions and permissions,
  and that only SPEC-40 was added to the migration ledger. Compatible application
  deployment remains pending; see the [migration evidence](../specs/SPEC-40-rol-inquilino-inicio-exclusivo/TASK-40-01-rol-inquilino-y-pagina-inicio.md#aplicación-de-migración-en-desarrollo--2026-09-11).
- The direct-child SPEC-38 identifier still collides with the shared Make-delivery
  implementation. Existing records are retained; no new SPEC-38 dependency should
  be created.

## Drift corrected in this review

Roadmap indexes now include SPEC-40 and use the current date/status language. The
usage guide describes the dashboard and exclusive inquilino Inicio. The SPEC-39
guide no longer calls SPEC-40 pending, describes the five-role capability split,
and points to the real disposable database procedure. SPEC-40's guide no longer
instructs readers to leave the completed work pending. API, environment, operation,
and testing docs now describe `home_destination`, invitation-only registration,
normal login, lifecycle revalidation, and the current evidence counts. SPEC-38's
task records that SPEC-39 superseded its placeholder content.

## Remaining update plan

1. Keep the historical SPEC-38 collision visible and assign the next unambiguous
   identifier before expanding either workstream; do not rename applied migrations
   or rewrite the old audit.
2. The SPEC-40 development migration and ledger verification are complete. Deploy
   the compatible SPEC-39/SPEC-40 backend and frontend artifacts before assigning
   the new role, then verify the live context, invitation, selector, dashboard
   exclusion, and suspension revalidation flows. Handle the unrelated pending
   `20260817190000_retire_legacy_contract_webhook.sql` migration separately.
3. Complete the separate SPEC-37 provider, delivery, security, and approval gates
   before enabling production inquilino invitations. Complete SPEC-41's own
   onboarding gates independently; its public registration must remain owner-only.
4. After deployment, update the three task evidence sections, the roadmap indexes,
   and `docs/06-testing/spec39-arrangements.md`/`spec40-inquilino.md` with the
   exact environment, revision, migration, and hosted verification evidence.

The local evidence does not authorize a production migration, invitation delivery,
or application deployment.
