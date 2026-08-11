# SPEC-14 Contract Generation — Client file uploads for `Recibo de sueldo` and `Garantía propietaria`

**Date:** 2026-07-29
**Priority:** high
**Status:** implemented

---

## Summary

This document defines the client-side supporting-file requirements for contract generation forms. Every repeatable `Garante` block has two dedicated receivers under the existing subdivisions `Recibo de sueldo` and `Garantía propietaria`. Clients can select PDFs or the configured image types. Each receiver accepts up to two files, and every guarantor must provide at least one file across that guarantor's two receivers. All existing scalar-field validation and behavior for the subdivisions remains unchanged.

## Motivation

Some contract workflows require supporting evidence such as paystubs (`Recibo de sueldo`) and proof of property ownership (`Garantía propietaria`). Adding structured file receivers improves data completeness and admin inspection while keeping the existing subdivision validation logic intact.

## Objectives

- Add a file receiver under `Recibo de sueldo` in every guarantor block that accepts up to two files.
- Add a file receiver under `Garantía propietaria` in every guarantor block that accepts up to two files.
- Preserve the existing scalar subdivision validation and add independent file type, size, count, and per-guarantor evidence rules.
- Enforce that each guarantor provides at least one file across their two receivers.
- Make uploaded files available for admin inspection and for inclusion in any contract-generation media payloads.

## Scope

This spec applies to:
- frontend client form rendering for the `Recibo de sueldo` and `Garantía propietaria` subdivisions inside repeatable guarantor records
- client-side validation and UX for file selection and preview
- the payload shape sent to the backend for submission
- admin inspection UI for viewing uploaded files alongside the corresponding submission

The implemented flow uses a separate private Supabase Storage bucket, client-token-authorized upload preflight, stable private references in stored JSON, and short-lived administrator view URLs.

## Requirements

### 1. UI placement and labeling

- Under the `Recibo de sueldo` subdivision in every guarantor block, present a file receiver titled `Subir recibo de sueldo`.
- Under the `Garantía propietaria` subdivision in every guarantor block, present a file receiver titled `Subir garantía propietaria`.
- Each receiver displays `Hasta 2 archivos — PDF, JPG, PNG, GIF, WEBP`; its file-picker allowlist additionally includes BMP and TIFF.
- Provide a compact preview list with file name, size, and a thumbnail for image types. For PDFs, show a PDF icon and filename.

### 2. Allowed formats and counts

- Acceptable MIME types: `application/pdf`, `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/bmp`, `image/tiff`.
- Each receiver accepts up to 2 files. The UI must prevent selecting more than 2 files per receiver.
- For every guarantor, the form must validate that at least one file is present across that guarantor's two receivers.

### 3. Validation rules

- Reuse the same scalar validation currently applied to the `Recibo de sueldo` and `Garantía propietaria` subdivisions.
- Each file is limited to 10 MB by default. The backend limit is configurable and must stay aligned with the private bucket object limit.
- In addition to reused validation, explicitly enforce "max 2 files per receiver" and "at least one file across both receivers for every guarantor".
- Validation messaging must be consistent with existing subdivision messages; provide localized messages for:
  - invalid file type
  - file too large
  - maximum files exceeded
  - at least one file required across both receivers

### 4. UX behavior

- Selecting files shows immediate client-side validation feedback; invalid files are rejected with a clear inline message.
- Users may remove selected files before submission; the UI updates counts and validation state accordingly.
- Drag-and-drop support is optional but recommended where other file receivers in the application support it.
- The file receivers must not auto-upload files on selection. After the user explicitly selects `Guardar`, the frontend requests upload URLs, uploads the selected files, and submits only the resulting stable references.

### 5. Submission payload shape

- Every object in `fields.garantes` may include `recibo_sueldo_files` and `garantia_propietaria_files`.
- Each property is an array with at most two stable references in this shape:

```json
{
  "filename": "recibo-julio.pdf",
  "mimeType": "application/pdf",
  "size": 245760,
  "storagePath": "contracts/.../recibo-julio.pdf",
  "storageBucket": "private-bucket"
}
```

- Signed upload URLs and signed view URLs are transient capabilities and must not be persisted in `contract_entries`, `contract_submissions`, or `combined_submission`.

### 6. Admin inspection and contract generation

- The admin inspection UI must display uploaded files under the corresponding guarantor and subdivision (`Recibo de sueldo` or `Garantía propietaria`).
- Display thumbnails/previews for images and filename + link for PDFs. Links must open the original file via the storage mechanism (signed URL, proxy endpoint, etc.).
- Contract generation flows that include media payloads must be able to reference the files from the submission payload.

## Acceptance criteria

1. Every guarantor block renders two file receivers under `Recibo de sueldo` and `Garantía propietaria` with clear labels.
2. Each receiver accepts only PDFs and the listed image types.
3. Each receiver prohibits selecting more than 2 files.
4. The form validates that every guarantor has at least one file across their two receivers before allowing submission.
5. Client-side validation messages match the style and localization of existing subdivision validations.
6. The submission payload contains stable references for each uploaded file and the associated metadata.
7. The admin inspection UI displays uploaded files grouped by subdivision with preview thumbnails or PDF links.

## Testing

- Unit tests for the file receiver component verifying:
  - accepted MIME types
  - enforcement of max 2 files per receiver
  - removal of files updates validation state
- Integration test for the client form verifying:
  - submission is blocked when any guarantor has no file across both receivers
  - submission succeeds when every guarantor has at least one file in either receiver
  - selecting files does not start an upload before `Guardar`
  - payload contains file metadata and storage references
- Backend tests for presign authorization and rate limiting, MIME and size validation, per-receiver counts, per-guarantor minimums, entry-scoped private references, and stored-object metadata verification.
- Admin UI tests verifying uploaded images and PDFs are grouped, displayed, and linked correctly in the inspection view.

## Implementation notes

- Supporting receivers are schema metadata on the two `Garantes` subsections, so the same definitions drive rendering, normalization, backend validation, and administrator inspection.
- Stored arrays are named `recibo_sueldo_files` and `garantia_propietaria_files` inside each `garantes` record.
- Supporting-file references use `{ filename, mimeType, size, storagePath, storageBucket }`; upload URLs are removed before role submission.
- The receivers remain passive on selection. The explicit `Guardar` action calls `POST /api/contracts/:entryId/evidence-uploads/presign`, performs the direct private-bucket uploads, and then sends the JSON role submission.
- The editable form is locked during that save sequence. Once an upload succeeds, its `File` value is promoted to the stable reference in form state, so a retriable final-submit failure does not upload the object again. An ambiguous final response triggers a schema refresh so the UI can detect an already-committed submission while preserving the correction path.
- The `contract-evidence` bucket is private and separate from the DNI SPEC-11 bucket. Its MIME allowlist is exactly `application/pdf`, `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/bmp`, and `image/tiff`.
- `CONTRACT_EVIDENCE_STORAGE_BUCKET` changes the evidence bucket and `CONTRACT_EVIDENCE_MAX_FILE_BYTES` changes the per-file limit; their defaults are `contract-evidence` and `10485760` bytes (10 MB).
- The backend independently caps each receiver at two files, requires at least one supporting file per guarantor, rejects duplicate object paths, and validates the bucket plus entry/role/guarantor/field/filename-scoped path before persistence.
- Immediately before persistence, the backend reads each private Storage object's metadata with bounded concurrency and requires an exact byte-size and MIME match. Missing or mismatched objects produce field validation errors; a Storage verification outage produces a retriable `503`.
- Evidence preflight uses the existing per-window limiter in an independent `evidence` namespace. With the default settings, the eleventh request for the same IP and entry within 15 minutes returns `429`; each request contains at most 20 descriptors and at most two for one receiver.
- Existing SPEC-12 validation remains independent: each guarantor must still complete scalar data in at least one of the two subdivisions.
- Administrator inspection validates stored private references, creates short-lived signed view URLs, and returns the media within the matching subsection without exposing storage buckets or paths.
- Ensure accessibility: each receiver must have an accessible label, focus state, and keyboard operability for file selection/removal.
- Focused backend coverage lives in `backend/tests/integration/contract-entries-spec14.test.ts`; frontend coverage lives in the contract file-receiver, repeatable-section, hosted-form, and inspection tests.

## Notes

- Supabase JSONB submission columns already support the new arrays; no `contract_entries` or `contract_submissions` column migration is required.
- Direct uploads can leave an unreferenced object if storage succeeds but the final role submission fails. Stored contract data remains authoritative, and only references accepted by role validation are exposed through administrator inspection.

## Deployment

- Apply `supabase/migrations/20260729000000_contract_spec14.sql` after the SPEC-10 and SPEC-11 migrations.
- Keep the configured per-file backend limit aligned with the bucket object limit and MIME allowlist.
- Run both backend and frontend suites before enabling the supporting-file flow.
