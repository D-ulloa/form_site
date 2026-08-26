# Roadmap

Status: 2026-08-25.

This folder is reserved for durable plans, specifications, audits, and decisions.

## Expected structure

- `specs/pending/`
- `specs/completed/`
- `specs/research/`
- `audits/`
- `decisions/`

Add files here when work is formally scoped or reviewed.

Repository artifacts are staged for SPEC-25 through
SPEC-34, but their documents remain in `specs/pending/` until prerequisites,
named approvals, real-database/provider/concurrency gates, and required
operational/recovery evidence are recorded. SPEC-34's control plane is not a
production certification; no staged implementation authorizes Solar real data.

SPEC-35 through SPEC-37 now have disabled repository implementations for Auth/profile,
restricted organization/initial-owner provisioning, and invitation delivery/activation.
Their real-provider/database, inventory, mail-domain, concurrency, security, and approval
gates remain open.
None of these artifacts authorize production changes.
