# SPEC-10 Contract Generation — Reworked (In-Site Two-Party Forms → Supabase)

**Date:** 2026-07-24
**Priority:** high
**Status:** implemented

---

## Summary

This document replaces the previous Google Forms-centered flow with an in-site, two-party contract generation flow. Clicking **Generate Contract** creates a new contract entry on the site (no external Google Form link). Each entry exposes two hosted pages: one for the *user* and one for the *client*. The `Inquilino` and `Garantes` sections are moved into the *client* form; `Testigos` and `Contrato` remain on the *user* form. Each entry receives a unique ID and secure per-role tokens so the user and client can fill their pages independently. When either party submits their page, the submission is persisted to Supabase. Both pages remain hosted and accessible until both sides submit; once both submissions exist the server assembles a final combined record and writes audit rows to Supabase (and optionally to logs). This SPEC defines UI behavior, data model, API, security, hosting/lifecycle, and acceptance criteria.

## Motivation / Changes from SPEC-09
- Remove Google Forms site link and copy workflow entirely.
- Make the in-site form the canonical intake for both parties.
- Provide a per-entry lifecycle (create → user/client fill → complete) with unique ID and per-role access tokens.
- Persist every submission to Supabase (primary data sink) instead of sending to Google Sheets.

## Objective

Provide a durable, auditable, and secure two-party contract intake flow that:
- Creates an entry on click of **Generate Contract** and returns managed form URLs.  
- Hosts both `user` and `client` forms inside the app indefinitely until both are submitted.  
- Moves `Inquilino` and `Garantes` to the client form; `Testigos` and `Contrato` remain on the user form.  
- Stores submissions and audit events in Supabase with minimal privileges and hashed access tokens.  

## UI / UX Flow

1. From the app action page the operator clicks **Generate Contract**.
2. Server creates a new `contract_entry` (see Data Model) with a UUID `entryId` and two secure tokens: `userToken`, `clientToken` (only the token's hashed versions are stored).
3. The UI immediately shows an entry card with:
   - `entryId` (shortened display), `createdAt`, and two buttons: `Open user form` and `Copy client link`.
   - `Open user form` opens `/contracts/:entryId/user?token=<userToken>` in a new tab (authenticated users may open without token if logged-in and owner).
   - `Copy client link` copies `/contracts/:entryId/client?token=<clientToken>` for sending to the client.
4. The `user` and `client` pages are fully hosted in the site: `/contracts/:entryId/user` and `/contracts/:entryId/client`. Both pages render only their assigned sections and the same canonical JSON schema view.
5. The client may open their link at any time and submit. The user may also fill and submit independently. Each submission is saved separately.
6. When a role submits the server validates fields; on success it writes an audit row and updates the `contract_entry` record. If both sides have submitted, the server composes a combined payload and writes a `completed` record and final audit entry.

UX details
- The site must clearly show submission status: `waiting for client`, `waiting for user`, `complete`.
- Hosted pages remain accessible until both sides submit. Admins can revoke or archive entries.
- The JSON field schema is visible on each page so users can verify what is requested.

## Section Mapping (per requirement)
- Client form: `Inquilino`, `Garantes` sections (all fields moved here).  
- User form: `Testigos`, `Contrato` sections.  
- Shared system fields: submission metadata (`entryId`, `role`, `submittedAt`) are included in both submissions but are managed server-side.

## Data Model (Supabase/Postgres)

Primary table: `contract_entries`

- `id` UUID PRIMARY KEY (entryId)
- `schema_id` TEXT (which schema config this entry uses)
- `created_by` TEXT (user id who generated the entry)
- `created_at` timestamptz DEFAULT now()
- `user_token_hash` TEXT (secure hash of token for user form)
- `client_token_hash` TEXT (secure hash of token for client form)
- `user_filled` BOOLEAN DEFAULT false
- `client_filled` BOOLEAN DEFAULT false
- `user_submitted_at` timestamptz NULL
- `client_submitted_at` timestamptz NULL
- `user_submission` JSONB NULL
- `client_submission` JSONB NULL
- `combined_submission` JSONB NULL -- populated when both sides submitted
- `status` TEXT CHECK(status IN ('open','complete','archived','generar_contrato')) DEFAULT 'open'
- `archived_at` timestamptz NULL

Audit table: `contract_submissions`

- `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `entry_id` UUID REFERENCES contract_entries(id)
- `role` TEXT CHECK(role IN ('user','client'))
- `submission` JSONB -- the raw submitted payload (redactions applied server-side)
- `submission_meta` JSONB -- { ip, userAgent, receivedAt }
- `submitted_at` timestamptz DEFAULT now()

Optional: `contract_events` stream table for background jobs and notifications (webhooks)

Notes on tokens
- Create unguessable tokens (32+ bytes base64/urlsafe). Store only a fast hash (e.g., HMAC-SHA256 with server key or bcrypt) in `user_token_hash` / `client_token_hash` to validate incoming token params.
- Tokens do not expire by default (forms must remain up indefinitely), but admins can set `archived_at` to close links.

## API / Backend Contract

Authentication
- Operators creating entries must be authenticated. Clients may use token URLs (bearer token in query param or Authorization header). All token use validates against hashed token stored.

Endpoints (examples)

- `POST /api/contracts/create` — Auth required
  - Request: `{ schemaId?: string }` (optional schema override)
  - Response: `{ entryId, userUrl, clientUrl, createdAt }` (URLs contain raw tokens for copying)

- `GET /api/contracts/:entryId/schema` — returns the JSON schema (public if token provided or user auth)

- `GET /contracts/:entryId/user?token=...` — host user form (SSR/SPA route). Server checks token OR authenticated user ownership.

- `GET /contracts/:entryId/client?token=...` — host client form page. Server checks client token.

- `POST /api/contracts/:entryId/submit?role=user|client` — submit form
  - Headers: `Authorization: Bearer <token>` OR query `?token=...` OR standard session cookie for authenticated user
  - Body: `{ fields: { ... } }`
  - Server responsibilities:
    - Validate `entryId` exists and token/ownership is valid for role.
    - Validate `fields` against schema for that role (Zod / ajv / server validation).  
    - Sanitize values (escape/strip any potentially dangerous content; but Supabase handles JSONB safely).  
    - Persist `contract_submissions` row and update `contract_entries` corresponding role fields and timestamps.  
    - If both roles filled after update, compose `combined_submission` and set `status='complete'` and write a combined audit submission.
    - Return `{ submissionId, entryId, status, submittedAt }`.

- `POST /api/contracts/:entryId/archive` — Admin only: mark archived and revoke tokens.

Security & validation
- Enforce HTTPS; tokens only accepted over TLS.
- Rate-limit submission endpoints per IP and per entry.
- Validate and reject fields that violate schema types; return clear `400` with `errors` list.  
- All tokens validated via constant-time comparison of hashed token.

Persistence and observability
- All submissions are inserted into Supabase tables described above.  
- Server also writes an audit event (optionally to `logs/` as JSON) containing redacted fields (PII redaction if needed), `entryId`, `role`, `submissionId`, and `receivedAt`.

## Hosting & Lifecycle

- Both form pages are hosted by the app until the entry is archived. Submitted role data remains editable through the role link and each correction is stored as a new submission-history row; administrator inspection is read-only. The `generar_contrato` status is an administrator-triggered generation state backed by the configured Supabase-to-Make trigger.
- Admin UI: list entries, filter by `status`, manually archive or regenerate tokens, and inspect submissions.
- Long-term retention: by default entries are retained indefinitely; data-retention policies can be implemented with scheduled jobs that archive or purge entries older than a configured TTL.

## Supabase considerations

- Use Supabase Row Level Security (RLS) to restrict direct client writes; all writes should be performed by the server with a service key. If client-side anonymous writes are supported for client submissions, carefully scope RLS policies and require token verification.
- Use Supabase functions/triggers for secondary async work (e.g., notify admin webhook on completed entries).

## Field & Schema Notes

- Reuse the existing `inside_form.json` shape but split into two role-specific schemas. Example mapping:
  - `client_schema.sections` → contains `Inquilino`, `Garantes` fields.
  - `user_schema.sections` → contains `Testigos`, `Contrato` fields.
- Support same validation rules as SPEC-09 (`required`, `min`, `max`, `pattern`, `maxLength`, `options` for `select`).

## Acceptance Criteria

1. The Google Forms link is removed from the Contract Generation flow and UI.  
2. Clicking **Generate Contract** creates a new `contract_entry` with `entryId`, `userUrl`, and `clientUrl`.  
3. Both URLs host forms inside the app: `/contracts/:entryId/user` and `/contracts/:entryId/client`.  
4. `Inquilino` and `Garantes` fields are present only on the client form; `Testigos` and `Contrato` fields are on the user form.  
5. Each submission is validated and stored in Supabase `contract_submissions`.  
6. Entries remain accessible (hosted) until both sides submit; when both are submitted the entry is marked `complete` and a `combined_submission` is stored.  
7. Secure tokens are used for unauthenticated client access; only token hashes are stored.  
8. Admin UI can list, inspect, archive, or regenerate tokens for any entry.  

## Testing & QA

- Unit tests for schema validation for both role schemas.  
- Integration tests for `POST /api/contracts/create` and `POST /api/contracts/:entryId/submit` flows, including token validation.  
- E2E tests: generate entry → open user form → submit → open client form → submit → verify `combined_submission` exists in Supabase.  
- Security tests: token brute-force resistance, rate limiting, RLS policies.  

## Migration & Backwards Compatibility

- Remove UI paths that show or prompt copying Google Form links. Replace UI entry points to call `POST /api/contracts/create`.  
- Existing archives or logs referencing Google Forms are kept for audit but the live workflow no longer shows or generates external links.  

## Deployment Notes

1. Apply `supabase/migrations/20260724000000_contract_entries.sql` to the target Supabase project.
2. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CONTRACT_PUBLIC_BASE_URL`, and a 32+ character `CONTRACT_TOKEN_SECRET`.
3. Configure `CONTRACT_ADMIN_USER_IDS` for gateway-authenticated administrators.
4. Verify HTTPS/proxy settings and add a distributed edge limiter for horizontally scaled production.
5. Run a staging two-party submission and confirm `contract_entries`, `contract_submissions`, `contract_events`, and `combined_submission`.

**Author:** Product / Engineering
