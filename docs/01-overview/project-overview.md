# Project Overview

Status: 2026-09-01.

SPEC-25 still contains production in the Azar-only boundary: no real Solar or
second-organization data may enter the data plane, providers, logs, exports, or
backups. Tenant-scoped routes and schema now exist in the repository, but no
second production organization is authorized.

This repository implements two internal workflows in an admin-style web application:

- Property creation, including media, Google Drive, Google Sheets, and Make integration.
- Two-party Contract Generation with hosted user/client forms and Supabase persistence.

## Purpose

- Provide a compact internal interface for adding new properties.
- Provide a guided, schema-driven contract submission flow.
- Keep submission behavior predictable and auditable.
- Centralize Supabase contract persistence and Google property integrations behind the backend API.

## What this project includes

- `frontend/`: React + TypeScript app with Vite, Tailwind CSS, React Router, React Hook Form, Zod, and TanStack Query.
- `backend/`: Node.js + Express API with TypeScript, Zod validation, Supabase contract persistence, identity/organization boundaries, Google property integrations, contract delivery workers, file upload handling, and submission orchestration.
- `docs/`: Project documentation and setup guidance.
- `references/`: LLM and documentation workflow guidance.
- `scheme.json` and `scheme_reworked.json`: canonical property submission schema sources.
- The backend contract registry: the authoritative field schema and role projections; destinations and credentials remain server-only.

## Key boundaries

- The frontend is responsible for form UI, client-side validation, media selection, and API calls. Contract definitions are fetched from the backend instead of duplicated in the browser bundle.
- The backend is responsible for independent payload validation, Supabase contract persistence, role-token authorization, Google Drive folder creation, property Sheet appends, Make webhook dispatch, and auditability.
- No edit workflow is implemented in v1: submissions create new property assets only.
- Contract access uses stable per-entry administration links plus per-role links whose raw tokens are returned once and stored only as HMAC hashes. Main-page access requires a pre-reviewed Azar grant; registration and login no longer create grants.

## Property flow

1. User opens `/` and selects `Agregar nueva propiedad`.
2. The selected organization context opens `/t/:organizationSlug/properties/new`.
3. User optionally uploads images/videos and selects a cover image.
4. The frontend uses the organization-namespaced compatibility route
   `POST /api/organizations/:organization/properties/legacy/submit` and sends
   `multipart/form-data` for the current property flow.
5. The backend validates the signed session, data, and files.
6. The configured upload strategy stores media in private Supabase Storage by
   default; legacy Drive upload remains available as a compatibility mode, and a
   Drive folder is still created for the property.
7. The backend appends the property row in Google Sheets.
8. The backend sends the property payload to Make synchronously and records the
   individual integration outcomes.
9. The user sees `/t/:organizationSlug/properties/success/:submissionId`.

## Contract flow

1. An authenticated operator selects `Generar contrato`; the opened section remains passive.
2. The operator clicks `Generar nueva entrada para contrato`.
3. `POST /api/organizations/:organization/contracts/create` creates a
   Supabase `contract_entries` row in the resolved organization scope and returns
   user and client URLs. The legacy `/api/contracts/create` route remains for
   compatibility.
4. The operator opens the user form and copies the client link.
5. Each hosted role page fetches only its assigned schema sections and submits independently. The client starts with repeatable `Inquilino`/`Garante` records, private front/back DNI slots, and passive supporting-file receivers under each guarantor's `Recibo de sueldo` and `Garantía propietaria` subdivisions.
6. The user schema groups `Contrato` into `Vigencia`, `Canon`, and `Ajuste`; computed dates remain read-only and the backend recalculates them authoritatively.
7. On client `Guardar`, the form locks, selected supporting files receive rate-limited client-authorized private upload URLs, and uploads finish before the role JSON is sent. The backend validates fields, DNI references, the two supporting-file arrays for every guarantor, and each evidence object's actual private Storage MIME/size metadata before calling the atomic Supabase function.
8. Supabase stores one immutable role audit row and updates the entry.
9. When both roles have submitted, the entry becomes `complete` and receives a combined payload.
10. Administrators sign in with Supabase email/password or Google OAuth, then use
    the tenant admin routes under `/t/:organizationSlug/contracts/admin` to inspect
    submissions, edit role data, update generation status, archive entries, and
    regenerate role links. The legacy `/contracts/admin/:entryId` route remains
    available as a compatibility surface.
11. Marking an entry for contract generation commits the status and an
    organization-scoped outbox event. The mounted route makes one bounded worker
    pass; a durable scheduler can run `npm --prefix backend run worker:contract-make`.
    A dispatch result does not prove that the downstream Make scenario completed.

## Code map

- `frontend/src/pages/`: action selection, property forms/results, hosted contract forms, and contract administration.
- `frontend/src/features/properties/`: property form schema, hooks, services, components, and payload mapper.
- `frontend/src/features/contracts/`: entry creation, role schema types, hosted-form rendering, validation, and contract API calls.
- `frontend/src/components/ui/`: shared UI primitives used across pages.
- `backend/src/routes/properties.ts`: HTTP route handling and multipart parsing.
- `backend/src/routes/contractEntries.ts`: current entry, role-form, submission, and admin endpoints.
- `backend/src/routes/contracts.ts`: legacy SPEC-09 compatibility endpoints.
- `backend/src/config/`: authoritative contract schema registry and role-specific projections.
- `backend/src/services/`: contract entry/token persistence, submission orchestration, validation, Drive/Sheets/Make integration, and log persistence.
- `backend/src/integrations/`: organization-scoped contract Make payload loading, SSRF-safe dispatch, outbox claiming, and the standalone worker.
- `backend/src/identity/` and `backend/src/organizations/`: session, context, governance, and provisioning boundaries.
- `backend/logs/`: property and legacy SPEC-09 JSON records; current contract records live in Supabase.
- `backend/src/migration/`: SPEC-34 manifest validation, quarantine-first inventory decisions, release certification, and Solar rollout gates.
- `frontend/src/features/migration/`: safe certification-bound Solar feature state; it contains no provider or migration evidence.
- `migration_control` Supabase schema: restricted migration runs, inventory, mappings, validation, certifications, and rollout events.
