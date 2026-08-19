# SPEC-30 property-domain operations

Status: additive implementation; production enablement remains gated by SPEC-27, SPEC-31, SPEC-32, and the SPEC-34 migration certificate.

## Safety boundaries

Every draft, property, revision, run, step, event, asset association, and provider intent is selected by immutable `organization_id`. Slugs, property codes, addresses, creator IDs, assignees, legacy `agent_*` fields, storage paths, and provider identifiers never establish ownership. Service-role repositories include an organization predicate and reject a returned row from another organization.

Do not mount the organization property router or enable Solar until SPEC-27 supplies trusted request contexts, SPEC-31 supplies verified private assets, SPEC-32 supplies organization integration configuration and workers, and SPEC-34 certifies legacy ownership/quarantine.

## Draft and conflict response

Create the durable draft before upload preflight. Draft creation and autosave call the scoped Spec 30 RPCs with active membership evidence, request ID, bounded payload, and expected version. A `VERSION_CONFLICT` or `DRAFT_STATE_CONFLICT` is not an overwrite instruction: preserve the browser's unsaved payload, refetch the scoped draft/property, and require explicit reapplication.

Finalization locks the draft and property, validates expected versions and edit base, appends one immutable revision, advances the current pointer, finalizes the draft, and writes run/step/intent/event/audit/usage records in one transaction. Provider work starts only after commit. Never update or delete `property_revisions`, `property_revision_assets`, or `property_events`; `IMMUTABLE_PROPERTY_HISTORY` is an incident signal.

## Failed and uncertain run response

Inspect the durable run and safe step projections by organization/run ID. Never use a local log, console output, browser navigation state, raw provider response, or address/timestamp as processing authority.

- `failed`: retry only steps marked retriable.
- `partially_failed`: retain confirmed receipts and retry only failed/blocked steps.
- `blocked`: resolve suspension, configuration, legal hold, or reconciliation gates before retry.
- uncertain external outcome: reconcile the stable folder, range, or delivery reference before scheduling another effect.

`spec30_retry_property_run` fixes the same revision and creates a linked manual-retry run. Same key/fingerprint returns the existing run; a changed fingerprint returns `IDEMPOTENCY_CONFLICT`. Confirmed successful steps are never copied into the retry queue.

## Provider projection rules

Drive, Sheets, and Make destinations come only from the organization integration configuration supplied by SPEC-32. Drive artifacts remain private and stable IDs are authoritative. Sheets appends one versioned row per revision using property/revision IDs and formula-safe values. Make receives an allowlisted `property.created` or `property.revised` event. Spec 30 intents store stable identifiers and schema metadata, not credentials, webhook URLs, raw responses, private paths, signed URLs, or complete customer payloads.

## Orphaned drafts and assets

An expired or abandoned draft remains organization-owned. Pause its uploads, enumerate attachments through the SPEC-31 registry, and apply the approved retention policy. Never reassign an asset to another draft or organization. Cleanup records safe counts and asset IDs in protected recovery evidence; it does not log property data or storage paths.

## Reconciliation checks

Run these against a protected read-only connection and retain only counts/checksums:

```sql
select count(*) from properties where organization_id is null;
select count(*) from property_drafts where organization_id is null;
select count(*) from property_revisions where organization_id is null;

select count(*)
from property_revisions r
join properties p on p.id = r.property_id
where r.organization_id is distinct from p.organization_id;

select count(*)
from property_submission_runs r
join properties p on p.id = r.property_id
where r.organization_id is distinct from p.organization_id;

select count(*)
from properties p
join property_revisions r on r.id = p.current_revision_id
where p.organization_id is distinct from r.organization_id
   or p.id is distinct from r.property_id;
```

All counts must be zero. Separately reconcile revision sequences, one-cover cardinality, current/open pointers, retry ancestry, step/intents, audit/usage evidence, and provider receipts for Azar and Solar.

## Recovery and rollback

The migration is forward-only; correct it with a later migration. Restore the aggregate, revisions, events, runs, steps, intents, audit, usage, assets, and integration receipts to a consistent boundary. Keep workers paused until checksums and uncertain external effects reconcile. If tenant ownership cannot be proven, disable affected routes, quarantine the records, and keep Solar blocked.
