# SPEC-31 private asset operations

Status: additive implementation, 2026-08-19. Production migration and Solar remain gated by SPEC-27, SPEC-32, SPEC-34, and approved POL-09 retention values.

## Safety boundary

`media_assets` is the canonical ownership registry. A bucket, object path, asset UUID, signed URL, legacy browser agent, filename, or provider link never authorizes an operation. Resolve trusted organization/principal context first, select the exact owner and asset by `organization_id`, validate the receiver and current capability, then issue the shortest practical transient capability. All buckets stay private; do not add browser list/read/delete policies.

The organization router is not mounted by this implementation because SPEC-27 still owns trusted request context. The legacy contract/property upload services remain bounded compatibility surfaces until SPEC-34 certifies registration and cutover. Do not restore the process-local property upload session as rollback.

## Upload and verification response

Initialization must validate current organization state, owner visibility, capability, receiver, count, declared MIME/bytes, rate, and reserved quota before calling `spec31_initialize_asset_upload`. Signed upload URLs exist only in the immediate response and memory. Never place them in logs, audits, analytics, query keys, local storage, or domain payloads.

Finalization reads provider metadata for the registered bucket/path and compares exact bytes and allowed provider/detected MIME; checksum is mandatory where the receiver policy requires it. A missing object or mismatch does not attach. Transient provider/detector failure returns the safe unavailable contract and leaves the intent retryable. Mismatch moves through the quarantine/rejection workflow; it is not repaired from client metadata.

For an uncertain finalization response, reload the organization/session from durable state. A consumed session is a safe replay; never create a replacement object until the prior intent is explicitly revoked or reconciled.

## Quarantine and active-content review

Keep unknown, SVG/HTML/script/macro, polyglot, metadata-mismatched, scanner-unavailable (where required), and ambiguous legacy objects inaccessible. Review only safe asset IDs, reason codes, detector versions, and protected evidence. Do not download customer content to an unmanaged workstation or paste provider errors/paths into tickets.

Release from quarantine only after an approved receiver policy permits the detected type, the exact registered object is reverified, and the decision is audited. Branding originals must be decoded/re-encoded into a sanitized derivative; only an approved derivative may back a public projection.

## Cleanup, deletion, and legal hold

POL-09 must supply numeric retention and legal basis before a cleanup worker is enabled. Claim work fairly by organization and asset ID. Immediately before deletion, lock/reload the row and recheck state, version, associations, retention, legal hold, organization lifecycle, and exported-copy coordination. Logical denial precedes physical removal. Delete only the exact registered bucket/path; never delete by client prefix.

A provider not-found result is reconciled only when the registered identity is exact. Write an append-only deletion receipt and idempotent negative usage event. Retry transient failures with bounded backoff; permanent/unknown failures enter visible blocked/dead-letter handling. Legal hold prevents purge but never grants view access.

## Legacy Azar migration

Inventory contract buckets/JSON references, property objects/logs, branding, Drive copies/ACLs, exports, backups, missing objects, duplicates, and orphans. Fingerprint legacy references in protected tooling; do not copy raw paths into general logs. Verified production ownership can map only to Azar. Browser agent/path evidence alone is insufficient, and ambiguity is quarantined—never assigned to Solar.

Copy to the organization-prefixed target, verify exact bytes/type/checksum, create the immutable mapping and association, test authorized delivery, and only then mark the legacy object cleanup-eligible. Retention, holds, restore evidence, application cutover, and SPEC-32 exported-copy receipts must all pass before old-object deletion. The compatibility resolver is Azar-only, read-only, monitored, and time-bounded.

## Reconciliation and recovery

Run protected, read-only checks and retain counts—not paths or filenames:

```sql
select count(*) from media_assets where organization_id is null;
select count(*) from asset_upload_sessions where organization_id is null;
select count(*) from asset_upload_intents where organization_id is null;

select count(*)
from asset_upload_intents i
join media_assets a on a.id = i.asset_id
where i.organization_id is distinct from a.organization_id
   or i.bucket_name is distinct from a.bucket_name
   or i.object_path is distinct from a.object_path;

select count(*)
from property_revision_assets p
join media_assets a on a.id = p.asset_id
where p.organization_id is distinct from a.organization_id;
```

All counts must be zero. Separately reconcile open/expired sessions, verified unattached assets, quarantine age, deletion failures, usage totals, holds, mappings, public bucket/ACL detection, and provider-copy receipts by organization.

After restore, keep issuance and workers paused. Reapply deletion tombstones/holds, validate association scope and object existence/type/checksum, and reconcile missing/mismatched objects before traffic. Restore does not make a deleted asset viewable. Migrations are forward-only; correct defects with a later migration.

## Incident triggers

Disable affected issuance and preserve safe evidence for any cross-organization success, public bucket/ACL, leaked signed URL, path in general telemetry, immutable-history trigger, attached/held cleanup attempt, unexplained usage drift, or Azar artifact visible from Solar. Follow the SPEC-25 containment and SPEC-28 recovery runbooks; keep Solar blocked until the incident and full asset inventory are certified.
