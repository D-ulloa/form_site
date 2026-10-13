# Implementation guide — SPEC-42

Apply `20261013024127_property_submission_recovery_drafts.sql` before releasing the frontend and backend changes. The frontend waits for a saved draft before it starts an upload or submit attempt. If the migration or draft API is unavailable, the page reports the save failure and holds the form in place.

The backend serves draft operations from the application session and marks a draft successful after the existing property submission returns `outcome: success`. Failure records are retained for analysis. The list queries only open drafts for the current user and organization.

Review successful, failed, partial, and ambiguous submit outcomes separately. A partial outcome can already have written to a provider; reviewing the recorded submission ID and step results is necessary before a manual retry.

To revert the application change, disable the new frontend/API integration while retaining the migration and its saved recovery data. A later data-retention decision should govern removal of old drafts and failure records.
