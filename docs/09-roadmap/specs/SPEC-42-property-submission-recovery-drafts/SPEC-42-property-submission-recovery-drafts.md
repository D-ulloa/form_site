# SPEC-42 — Property submission recovery drafts

**Status:** repository implementation
**Scope:** the existing organization-scoped new-property form and submission flow

## Goal

An agent can leave and reopen an unfinished property form. Any validation, media, upload, or submission failure preserves the entered fields and a useful diagnostic. A compact list at the top of the new-property page shows only drafts without a confirmed successful submission.

## Requirements

1. Begin a draft on the first user edit and save changes after a short idle interval. Save the latest snapshot before any presign, upload, or final submit request.
2. Store raw, incomplete form inputs so validation failures can be restored. Derive actor identity from the current session; never persist browser-provided actor fields as draft authority.
3. Scope reads and writes to the authenticated user and organization. Require `properties.write` for draft operations, CSRF protection for mutations, and a revocable application session.
4. Record every returned failure with phase, safe code/message, timestamp, optional HTTP status, provider step results, and property/submission identifiers. Keep failure history separate from the latest error shown in the list.
5. Treat `failure` and `partial_failure` as unfinished. A successful result closes the draft, excluding it from the list. Partial or ambiguous submission results require an explicit warning before resubmission because provider side effects may already exist.
6. Show the draft list only when there are open drafts. Opening a draft restores form fields; replacing a dirty form requires confirmation. A user can discard an open draft.
7. Store a media manifest with file names, types, sizes, and cover choice. File bytes and temporary upload credentials are not stored. Reopening a draft requests the original files again and prevents submission until they are reattached.
8. Surface draft-save failures clearly and stop final submission when the pre-submit snapshot cannot be saved.

## Data and API

The forward migration `20261013024127_property_submission_recovery_drafts.sql` creates standalone `property_submission_recovery_drafts` and `property_submission_recovery_failures` tables. Browser database roles have no direct access; the backend uses its service role with explicit organization and user predicates. An invoker RPC records a form snapshot and one failure event atomically.

The API is mounted at `/api/organizations/:organization/properties/recovery-drafts` with list, create, detail, update, failure, and discard actions. The current property submit request carries a recovery draft ID. The backend marks that draft successful only when the submission outcome is `success`.

## Limits and recovery

The form snapshot is capped at 200 KB at the API and 256 KB in the database. Media manifests and error records have separate limits. A browser without a working draft connection retains current page state and displays a save error; it cannot guarantee recovery after closing the page. An uploaded file may need a new presign/upload session after restoration. The submission service's existing external side effects are not made idempotent by this draft feature.

## Acceptance

- Drafts survive navigation and refresh under the same authorized user and organization.
- Invalid fields, rejected media, presign failures, upload failures, network/HTTP failures, and `partial_failure` all preserve values and diagnostics.
- A confirmed success removes the draft from the list; a failed or partial result keeps it.
- A restored draft cannot silently omit previously selected media.
- Cross-organization and cross-user draft reads and writes are rejected.
