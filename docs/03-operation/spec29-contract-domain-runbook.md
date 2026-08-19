# SPEC-29 contract-domain operations

Status: additive implementation; production enablement remains gated by SPEC-27, SPEC-31, SPEC-32, and the SPEC-34 migration certificate.

## Safety boundaries

Every member operation must receive a verified organization request context. The immutable organization UUID—not a slug, creator, assignee, token, or route string—is passed to every repository call. Service-role queries retain an explicit `organization_id` predicate and verify returned rows.

External access uses `contract_access_links`. Deliver a raw 256-bit token once in a URL fragment, exchange it for a short-lived HttpOnly capability session, and immediately remove it from browser history. Store only a peppered hash, prefix, and non-secret fingerprint. Never place raw tokens in logs, audit metadata, analytics, query strings, drafts, local storage, or support tickets.

Do not enable the new organization contract routes until:

- SPEC-27 supplies canonical member/link contexts and context epochs;
- SPEC-31 supplies verified private assets and signing;
- SPEC-32 supplies the organization integration outbox worker; and
- SPEC-34 reports zero unowned or mismatched legacy rows.

## Link response

On suspected disclosure, use a version-checked role-link rotation. Rotation has no overlap: the predecessor and its capability sessions are invalidated in the same transaction. If the replacement secret is lost, rotate again; a raw secret is never redisplayed. Revoke both role links when an entry is quarantined or its legal authority expires.

Invalid, expired, revoked, replaced, wrong-role, and foreign-entry credentials receive the same public not-found response. Investigate abnormal failure rates using bounded organization/action/outcome metrics; do not add a token, address, email, storage path, or entry UUID as a metric label.

## Revision and conflict response

An accepted initial submission or correction calls `spec29_append_contract_revision` with organization, entry, role, `expected_version`, request ID, idempotency key, and typed actor evidence. The transaction locks the scoped aggregate, appends a numbered immutable revision, advances the current pointer and projection, increments the version, and writes event/audit/usage evidence.

A `VERSION_CONFLICT` is not retried as an overwrite. Preserve the operator's unsaved fields, refetch the latest entry/history, display the competing revision, and require an explicit reviewed correction.

Never update or delete `contract_submissions`, `contract_events`, or published template versions. A database `IMMUTABLE_CONTRACT_HISTORY` error is an incident signal, not a reason to disable the trigger.

## Reconciliation queries

Run these against a protected read-only connection and retain only counts/checksums in evidence:

```sql
select count(*) from contract_entries where organization_id is null;
select count(*) from contract_submissions where organization_id is null;
select count(*) from contract_events where organization_id is null;

select count(*)
from contract_submissions s
join contract_entries e on e.id = s.entry_id
where s.organization_id is distinct from e.organization_id;

select count(*)
from contract_access_links l
join contract_entries e on e.id = l.entry_id
where l.organization_id is distinct from e.organization_id;
```

All counts must be zero before SPEC-34 validates the final non-null constraints. Also reconcile revision sequences, current pointers, template fingerprints, active-link cardinality, asset associations, and generation intents separately for Azar and Solar.

## Recovery

Restore entries, revisions, links, sessions, associations, templates, events, and generation intents to one consistent recovery boundary. Keep integration delivery paused until current revision fingerprints and provider receipts reconcile. A restored raw link cannot be reconstructed from its hash; rotate affected links after recovery according to incident policy. Never replay a generation effect merely because an entry has `generar_contrato` status.
