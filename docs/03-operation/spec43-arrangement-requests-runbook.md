# SPEC-43 release and recovery

Status: source implemented and locally verified; migration applied to development branch `multi-tenant` on 2026-09-12. Application deployment and hosted smoke checks remain pending. The [test report](../06-testing/spec43-arrangement-requests.md) records development migration evidence separately from local PostgreSQL/HTTP tests and controlled Auth/Storage adapters.

## Preflight

1. Confirm the exact project/branch and currently deployed backend/frontend versions. Prior SPEC-42 evidence identifies development branch `multi-tenant`; that historical evidence is not current authorization or proof of its schema/data today.
2. Compare the destination migration history with the repository. Select only `20260912140000_spec43_arrangement_requests.sql` after confirming required SPEC-26/27/28/29/30/31/39/40/42 migrations are already applied. Do not include unrelated pending migrations or test fixtures.
3. Inventory counts without exporting request text, filenames or identities:

```sql
select status, count(*) from public.arrangement_orders group by status order by status;
select count(*) as total_orders from public.arrangement_orders;
select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id in ('arrangement-media','property-media');
```

Any status outside `open`, `in_progress`, `solved`, `archived` needs an explicit approved mapping. The migration deliberately aborts before changing the schema. Existing rows become `legacy`, preserving null property/author/description/timestamps. No inferential backfill is permitted.

4. Record named product/security approval for the adopted POL-09 baseline and the relevant SPEC-31 content/retention policy. Verify quota settings and Storage on the target. **Do not enable this release's upload routes in a hosted deployment before these gates are closed.** Local tests do not substitute for hosted-provider verification.

## Deploy in order

- Apply the migration transactionally first. It creates the private `arrangement-media` bucket, extends the existing asset platform and installs locked request/cleanup RPCs. Check forced RLS, composite foreign keys and service-only execution after application.
- Deploy backend next. The internal `/arrangements/orders` endpoint keeps the strict SPEC-39 response and UUID cursor for clients without a version header. The new frontend sends `X-Arrangement-Contract: 2`, selecting full request records and the timestamp/ID cursor. Tenant routes always use the new contract. This preserves existing clients during the frontend rollout; no legacy RPC exposes hidden drafts.
- Deploy frontend after the new backend is healthy. The new parser can also read a legacy response during deployment skew; statuses are writable once the new capability registry and API are available.
- Use a synthetic property and tenant to verify description-only and PNG/MP4 submission, shared property history, viewer reads/downloads, cross-property rejection, status/version conflicts, archive and reopen. Record schema hash, backend/frontend deployment identifiers and observed results separately.
- Configure the scoped cleanup worker only after the policy/operational approval. Invoke one bounded batch per organization and repeat on schedule while `has_more` is true:

```bash
ARRANGEMENT_CLEANUP_ENABLED=true npm --prefix backend run worker:arrangement-cleanup -- <organization-uuid>
```

The worker requires the normal backend service credentials in the process environment. It emits organization ID and result counts, never paths, filenames or URLs. It cannot delete associated attachments. Pending reservations are held through cancellation until all objects in that batch are physically removed; verified orphan deletion produces negative usage once. Deletion outcomes append evidence rather than mutating prior receipts. Retention dates and legal holds are checked when claiming deletion work.

## Recovery

Stop the new frontend/backend write release or route new writes to a maintenance response if a hosted smoke check fails. Keep authenticated reads available where safe. Do not revert the applied migration, delete requests, discard associations, or make buckets public. Previously issued download URLs expire within 60 seconds; upload URLs can remain usable for two hours but cannot finalize a revoked/expired session. Preserve the 24-hour orphan cleanup grace and all audit/deletion evidence.

If rolling the frontend back, the compatible backend's unversioned list retains the previous open/in-progress view. Solved/archived records remain durable and become visible again in the version-2 dashboard. Keep the compatible backend until every old client is retired.

## Evidence to fill at deployment

- Development target: healthy, persistent, non-default `multi-tenant` (`kcobkbtieyowdmsvtsvv`, parent `kjnwiwvwuavurbgovmlt`), freshly verified on 2026-09-12. The existing 40 migrations plus only SPEC-43 are applied; the isolated final dry run is up to date.
- Development preflight: zero orders/statuses, zero assets/upload sessions and one arrangement property; no mapping required. Counts were preserved after application.
- Product/security policy sign-off and quota settings: pending.
- Hosted private-bucket/upload/inspection/download checks: pending.
- Applied development migration: `20260912140000_spec43_arrangement_requests.sql`, SHA-256 `ad62b4ed33a93a9ea59890b07c5b2adc5d7e706d71dde37fcd4c88f43f6b67bb`. Forced RLS, effective grants, all eight function bodies/search paths, validated constraints/indexes and private bucket configuration verified. Backend/frontend deployment IDs remain pending.
- Hosted smoke results and cleanup schedule/owner: pending.
