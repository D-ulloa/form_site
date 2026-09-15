# SPEC-45 — Personal assignments and tenant contact

Status: implemented and verified locally; both migrations applied and verified on development `multi-tenant` (`kcobkbtieyowdmsvtsvv`) on 2026-09-12. Application deployment, rejection activation and hosted smoke tests remain pending. See the [development migration evidence](../06-testing/spec45-personal-assignments.md#development-migrations--2026-09-12).

## Deployment order

1. Confirm the destination and migration history. Apply `20260912160000_spec45_tenant_contact.sql`, then `20260912170000_spec45_personal_assignments.sql`, after SPEC-44. This step is complete for development `multi-tenant`; other destinations require their own inventory. Both migrations are additive; do not edit applied migrations. Coordinate the invitation-write cutover with the compatible backend: old adapters reject first-time tenant acceptance without a phone and leave the invitation usable.
2. Deploy the backend with `ARRANGEMENT_REJECTION_ENABLED=false` and `ARRANGEMENT_REQUIRE_CURRENT_CLIENT=false`. Deploy the frontend with contract-3 readers, tenant acceptance context/form, and personal dashboard. The capability registry is version 8. No additional provider credentials are required.
3. Verify onboarding, assignment, and private file access on the destination. The authenticated `/changes` endpoint streams for 20 seconds, checks committed revisions every 500 ms, and renews. Confirm that the deployed Node function duration exceeds 20 seconds and the service rewrite delivers streamed responses without buffering. Local checks do not establish the hosted configuration.
4. Enable both `ARRANGEMENT_REJECTION_ENABLED=true` and `ARRANGEMENT_REQUIRE_CURRENT_CLIENT=true`. Rejection capability is exposed only while enabled. Full-order readers and status writers using old contracts receive HTTP 426 `CLIENT_UPDATE_REQUIRED`; they must refresh. The original unversioned SPEC-39 open-order projection stays unchanged.
5. Verify manager, tenant, and two personal sessions simultaneously. Assign, reassign, remove assignment, reject, reopen, and close; measure commit-to-visible latency. Verify reconnect and membership suspension. Record migration/application identifiers and hosted results separately.

## Persistence and access

- Tenant contact and `inquilino_first_joined_at` are private membership fields. The migration preserves prior onboarding evidence from membership role, accepted invitations, and audited role history. Existing null contact remains null on reactivation and never blocks draft/submit. There is no contact editing flow.
- First-time acceptance writes phone, membership/property, invitation/handoff consumption and audit together. New token/handoff adapters accept `inquilino_profile`; SPEC-26/37/42/44 adapters still enforce the same requirement. Lost-response recovery reads the committed membership without replacing contact.
- One personal membership can be assigned to a submitted order. Assignment sets `in_progress`; removal sets `open`; closing/rejecting/reopening clears assignment. All mutations require `expected_version`. A stale version never triggers an automatic overwrite retry.
- Suspension or role changes revoke new personal reads. The stored assignment remains visible to managers as unavailable until explicitly reassigned/removed. Reactivating the same personal membership restores only still-current assignments.
- Manager and personal projections expose requester contact. Viewer/tenant projections do not. New cursors bind audience, organization, membership, property, filter, limit, and ordering. A cursor does not bypass current SQL authorization.
- `arrangement_scope_revisions` stores private counters for organization, property, and personal scopes. Triggers update counters in the same transaction as the order; streams transmit only revision numbers and lifecycle signals. There is no process-local delivery dependency or browser table subscription.
- The old status RPC delegates to the new state machine, preserving its earlier response shape. The old dispatcher implementation and projection/guard helpers are not executable by the service/browser roles.

## Sessions, files and recovery

Each stream revalidates the current session and membership; periodic checks do not extend idle session lifetime. Clients reconnect with backoff, recover on focus, and cancel requests before clearing order caches. An invalidation resets pagination to the first page so previously loaded revoked rows cannot remain. Routine stream renewal preserves the loaded list when its revision is unchanged.

File access checks the exact verified order–asset association. Issued download links retain SPEC-43's 60-second lifetime; already delivered links are not retroactively revoked. Do not change private buckets, upload verification/limits, retention or cleanup as part of this rollout. Existing SPEC-31/POL-09 hosted Storage gates remain applicable.

To stop new rejection writes, set `ARRANGEMENT_REJECTION_ENABLED=false` while **keeping `ARRANGEMENT_REQUIRE_CURRENT_CLIENT=true`**. Retain the compatible five-state backend/frontend. Preserve contacts, assignments, orders and audit; do not drop columns or map rejected records to another state. If the wider release must be paused, disable new writes at the application boundary while retaining compatible authorized reads.

Record aggregate counts only for inventory (legacy orders, states, missing contact, unavailable assignees). Never copy phone numbers, emails, signed URLs, tokens or storage paths into operational logs.
