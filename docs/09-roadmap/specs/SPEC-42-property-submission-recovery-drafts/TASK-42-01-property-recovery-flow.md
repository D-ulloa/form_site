# TASK-42-01 — Implement property submission recovery

## Deliverables

1. Add the standalone forward migration for recovery drafts and append-only failures.
2. Expose authenticated, organization-scoped draft APIs with bounded input and safe error responses.
3. Add debounced form autosave, a pre-submit save, and failure recording to the new-property page.
4. Show open drafts above the form with restore and discard actions.
5. Preserve result details for failed and partial submissions; close drafts only after confirmed success.
6. Document media reattachment and ambiguous retry behavior.

## Review checks

- Inspect the database grants, RLS, organization/user predicates, and the atomic failure RPC.
- Verify the form still submits with the Drive, no-media JSON, and presigned media paths.
- Verify draft handling across validation, upload, HTTP 500, HTTP 207, success, refresh, and organization switches.
- Check that transient upload URLs, CSRF/session tokens, file bytes, and actor authority are absent from drafts.
