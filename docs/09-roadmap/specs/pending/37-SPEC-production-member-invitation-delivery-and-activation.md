# SPEC-37 Production readiness — member invitation delivery, activation, and acceptance

**Date:** 2026-08-25
**Priority:** release blocker
**Status:** repository implementation complete but disabled; external certification and production approvals pending
**Roadmap identifier:** PROD-SPEC-03
**Dependencies:** SPEC-26 through SPEC-28, SPEC-32, SPEC-34, and SPEC-35
**Blocks:** production onboarding of admins, members, and viewers by organization owners

---

## Specification identity

**Name:** End-to-end invite-only member onboarding with certified email delivery and authenticated exact-email acceptance.

**Description:** Complete the staged invitation domain by adding production email delivery, identity activation, auth handoff, delivery visibility, resend/revoke operations, and acceptance UX without persisting raw invitation tokens or reopening public registration.

**Why it is necessary:** The owner-facing invitation form and invitation persistence exist, but runtime always uses `DisabledInvitationDeliveryAdapter`. The API currently returns an invitation ID even when delivery fails, the raw token is then unavailable, registration is closed, and an unauthenticated recipient has no complete way to authenticate and return to acceptance. The flow is therefore not deployable for real user onboarding.

## Summary

Owners and permitted admins invite non-owner users from the organization settings route. The backend creates a hashed, expiring organization invitation, prepares/reconciles the Auth identity through SPEC-35, and sends one safe HTTPS onboarding message through a certified email adapter. The recipient authenticates or activates the exact invited email, returns through a short-lived server-owned handoff, reviews safe organization/role information, and accepts. Acceptance atomically creates/reactivates the membership and consumes the invitation.

Owner role remains impossible through invitation. An owner may invite an admin/member/viewer and later use the existing explicit ownership-transfer transaction.

The repository implementation includes Resend as the production-adapter candidate while
keeping the domain contract provider-neutral and disabled. This is not live-provider
approval or configuration. Before enablement, operations must approve and record the
transactional-email provider, sending domain, region/data-processing terms, rate limits,
webhook authenticity mechanism, and incident owner.

## Authority and dependencies

- SPEC-26 owns invitation states, token properties, role hierarchy, exact-email acceptance, membership transaction, resend/revoke, and acceptance route shape.
- SPEC-27 owns authentication, zero-membership sessions, password/Google activation, CSRF/Origin, opaque cookies, auth return safety, and context refresh.
- SPEC-28 owns distributed rate limits, durable audit, correlation, privacy, observability, and fail-closed dependencies.
- SPEC-32 provides provider-adapter, secret, delivery-attempt, ambiguous-result, retry, and reconciliation standards. Invitation email must follow those standards without treating email as an organization-configurable destination in the first release.
- SPEC-34 owns production migration/cutover and real-organization certification.
- SPEC-35 owns Auth identity/profile preparation and ambiguity handling.

## Current repository gap

The gap below describes the pre-implementation baseline. The 2026-08-25 repository
implementation now supplies the adapter, hashed handoff/evidence schema, routes, exact
email acceptance transaction, lists, UI, configuration validation, and automated
contract tests. The real-provider, real-database, concurrency, DNS, end-to-end, and
named approval gates in the completion section remain deliberately open.

- `OrganizationService.inviteMember` creates a 32-byte token, stores only its SHA-256 hash, constructs a fragment URL, and invokes an adapter.
- `backend/src/index.ts` always injects `DisabledInvitationDeliveryAdapter`.
- Delivery exceptions mark `delivery_state=failed`, but the HTTP response still returns only `invitation_id`.
- No production email provider configuration, webhook, retry/reconciliation, template certification, or delivery runbook exists.
- `/invitations/accept` removes the token fragment and can resolve/accept it, but acceptance requires an existing authenticated application session with exact email.
- Public registration is closed and the page has no complete activation/login-return handoff.
- Frontend service functions for member/invitation lists exist, while corresponding complete list UX/runtime behavior must be verified as part of this closure.

## Scope

### Includes

- Production `InvitationDeliveryAdapter` selected by startup-validated server configuration.
- Verified sending identity, templates, provider secret handling, timeouts, and webhook verification.
- SPEC-35 identity preparation for existing and new invitees.
- Auth activation/login handoff that survives external redirects without local storage or raw-token persistence.
- Delivery state/attempt evidence, safe owner-visible status, resend, revoke, and expiration handling.
- Complete invitation/member list endpoints needed by the existing settings UI.
- Invitation acceptance UX, context refresh, audit, metrics, alerts, runbook, tests, and deployment gates.

### Excludes

- Owner invitation, automatic domain enrollment, public signup, bulk CSV import, SCIM, or SSO.
- Marketing email, arbitrary organization-controlled templates, attachments, or customer-supplied sender domains.
- Persisting raw invitation/auth/session/reset tokens for retry.
- Provider credentials in organization settings, frontend variables, logs, or database projections.
- Treating provider “delivered” as proof that the intended human accepted.

## Non-negotiable invariants

1. Only an active member with `members.invite` can create an invitation, and hierarchy limits remain server-authoritative.
2. Invitation roles are exactly `admin`, `member`, or `viewer`; `owner` is rejected at validation, service, database, and UI layers.
3. One invitation is bound to one organization and exact canonical email.
4. The raw invitation token has at least 256 bits of entropy, is stored only as a hash, appears only in the intended fragment/handoff boundary, and never enters logs, analytics, referrers, audit, list responses, or provider metadata fields.
5. Delivery happens only after invitation persistence commits.
6. Delivery failure creates no membership and never changes the invitation into accepted.
7. A failed delivery can be recovered only by authorized resend, which rotates/replaces the token; blind resend of an unavailable raw token is impossible.
8. Acceptance requires an authenticated, eligible, verified Auth identity whose normalized email exactly matches the invitation.
9. Authentication or identity creation alone grants no membership.
10. Acceptance locks invitation/organization and creates/reactivates one unique membership atomically with acceptance/event evidence.
11. Used, expired, revoked, replaced, wrong-email, wrong-organization, or race-losing acceptance creates no access.
12. Auth return state is short-lived, single-purpose, server-bound, and cannot select a different invitation, user, organization, or return URL.
13. Raw tokens are not placed in query strings or persisted browser storage. Safe handoff handles are opaque, hashed server-side, short-lived, single-use, and cookie-bound where applicable.
14. Provider secrets are server-only and loaded from the approved secret manager.
15. Provider webhooks are authenticated before state changes and cannot create membership or mark acceptance.
16. Public resolve/accept errors resist account, organization, and invitation enumeration.
17. Owner-visible delivery status contains safe state and timestamps only, not provider message IDs usable as credentials, full provider errors, or raw recipient addresses beyond authorized policy.
18. Production startup fails closed if invitation routes are enabled without a certified adapter, HTTPS public base URL, exact origins, templates, limits, audit, and alert configuration.

## First-release user journeys

### Existing Auth user

1. Owner opens `/t/:organization_slug/settings/invitations`.
2. Owner submits email and an allowed non-owner role.
3. Backend validates context/capability, calls SPEC-35, persists the invitation, and sends the email.
4. Recipient opens `/invitations/accept#invitation_token=...`; frontend immediately removes the fragment and establishes a short-lived server handoff.
5. If not authenticated, recipient selects password login or Google authentication. The handoff—not the raw token—binds the post-auth return.
6. Backend revalidates the session and exact verified email.
7. Recipient reviews safe organization, masked email, role, and expiry, then explicitly accepts.
8. Membership and acceptance commit atomically; app refreshes session memberships/context and navigates to the canonical tenant route.

### New invite-only Auth user

1. The same authorized invite request calls SPEC-35 and receives `created_activation_required`.
2. The delivery workflow sends an approved activation/onboarding message for the exact email. No operator chooses a password.
3. Recipient completes the approved Supabase password activation or Google identity flow.
4. Backend establishes the opaque application session and resumes the invitation through the short-lived handoff.
5. Recipient explicitly accepts; no membership exists before this step.

Whether provider policy uses one coordinated message or separate activation and organization messages must be fixed during provider approval and covered by end-to-end tests. In either design, every link is single-purpose, exact-origin, short-lived, and redacted; the UI clearly identifies which step remains.

### Initial owner handoff

SPEC-36 may use the same certified activation delivery for an owner identity, but it does not create an owner invitation. The owner membership already exists atomically from organization provisioning. After activation/login, the server discovers the existing owner membership and routes to the organization. Invitation APIs can never mint owner authority.

## Authentication handoff contract

The current in-memory raw token cannot survive a full external OAuth/activation redirect safely. Implementation must add a server-owned handoff with these properties:

- created only after a valid invitation token is presented;
- references invitation UUID internally and stores only a hash of its own random handle;
- expires in at most 15 minutes and no later than the invitation;
- one active handoff per browser/invitation purpose, with bounded replacements;
- held in a host-only, `Secure`, `HttpOnly`, `SameSite` cookie in production;
- bound to exact allowed origin, intended auth purpose, and a browser nonce/CSRF contract;
- contains no role, email, organization authority, or reusable raw invitation token;
- consumed/rotated after auth return and invalidated on acceptance, logout, expiration, revoke, or resend; and
- unable to accept by itself: current authenticated exact-email identity is still mandatory.

The acceptance transaction may resolve the invitation through the validated handoff/invitation ID rather than requiring the discarded raw token, but the database function must receive trusted server evidence, lock the same rows, enforce every SPEC-26 condition, and remain unavailable to browser roles.

## Delivery adapter and provider contract

The adapter receives a minimized immutable message:

- application-generated delivery/attempt ID;
- safe public organization display name;
- validated inviter display name;
- localized non-owner role label;
- masked/support-safe expiry information;
- exact normalized recipient address at the final provider boundary only;
- exact HTTPS acceptance/activation URL; and
- template version and locale.

The provider call uses bounded connect/total timeouts and response size. The adapter maps provider results into `accepted`, `rejected`, or `ambiguous`; it never exposes raw provider bodies/errors to domain code.

Email requirements:

- verified production sending domain with SPF, DKIM, and DMARC policy recorded;
- one allowlisted `From` identity and optional approved support `Reply-To`;
- no attachments, tracking pixels, third-party analytics, or arbitrary HTML;
- escaped plain-text and minimal HTML alternatives;
- no customer-controlled HTML/CSS/URLs;
- template contains organization display name, inviter, role, expiry, security warning, and one primary action;
- no secret in email subject, provider tags, webhook URL, or custom metadata; and
- preview/local environments use a fake/capture adapter and never send to arbitrary real recipients.

Provider configuration uses server-only variables such as an adapter selector, sender, template version, webhook secret, timeout, and provider credential reference. Exact names and selected-provider variables must be added to `.env.example` and `docs/02-setup/environment.md` during implementation. No secret uses a `VITE_*` name.

## Delivery state and API behavior

Invitation list projection must distinguish:

- invitation state: `pending`, `accepted`, `revoked`, `replaced`, or effectively expired;
- delivery state: `pending`, `accepted_by_provider`, `delivered` where authenticated webhook evidence exists, `failed`, `bounced`, or `complained`; and
- safe last-attempt time/count and next allowed action.

Provider delivery state never changes membership state. Webhooks are deduplicated and append evidence; they do not revive/replace invitations.

Target APIs:

```text
GET    /api/organizations/:organization_id/members
POST   /api/organizations/:organization_id/invitations
GET    /api/organizations/:organization_id/invitations
POST   /api/organizations/:organization_id/invitations/:invitation_id/resend
POST   /api/organizations/:organization_id/invitations/:invitation_id/revoke
POST   /api/invitations/resolve
POST   /api/invitations/handoff
POST   /api/invitations/accept
POST   /api/provider-webhooks/invitation-email
```

Creation returns `201` with safe invitation ID/state, delivery outcome, expiry, and permitted next action. A provider failure must be visible as `delivery_state=failed`; it must not be presented to the owner as “invitation sent.” Depending on failure class, the request may return `201` with failed delivery state or a typed `503` while preserving the auditable pending invitation. The contract must be consistent and frontend-tested.

Lists are tenant-scoped, bounded, cursor-paginated, and safe. Webhook routes use provider authentication, size limits, replay/dedupe, no cookies, no customer context, and no provider-controlled organization resolution.

## Abuse controls, privacy, and observability

Apply SPEC-28 distributed policies at minimum to invitation create, resolve, handoff, accept, resend, activation request, and webhook failure/replay. Rate keys use HMACed IP/email/invitation subjects and never raw email/token labels.

Audit safe outcomes for invitation create/resend/revoke/accept, identity preparation, activation handoff, provider acceptance/failure, bounce/complaint, and suspicious mismatch/replay. Raw email is restricted/masked according to actor capability and privacy policy. General telemetry excludes recipient, link, token/hash, provider body, and full message ID.

Minimum alerts cover sustained delivery failures, provider authentication failure, bounce/complaint threshold, webhook replay/signature failure, handoff/accept mismatch spike, invitation abuse-limit spike, audit outage, and queue/attempt backlog if durable delivery work is introduced.

## Failure and recovery behavior

| Condition | Required result |
|---|---|
| Provider unavailable before acceptance evidence | Invitation remains pending with failed/ambiguous delivery; no membership |
| Provider timeout | Reconcile by application attempt key/provider evidence; do not blindly resend same token |
| Bounce/complaint | Record safe terminal delivery evidence; owner may correct via a new invitation subject to policy |
| User closes page before authentication | Handoff expires; original unexpired email link can establish a new bounded handoff |
| OAuth/activation callback missing/invalid state | Clear handoff/session transition and fail safely; no acceptance |
| Wrong authenticated email | Generic wrong-account/invalid state; no membership and no email disclosure |
| Resend races old-link acceptance | Database serialization yields one winning generation/outcome |
| Revoke races acceptance | Exactly one terminal outcome wins |
| Organization suspended/deleting | Delivery/acceptance blocked according to SPEC-26; no membership mutation |
| Audit unavailable | Privileged invite/resend/revoke/accept fails closed per SPEC-28 policy |

## Affected implementation areas

- Forward migrations for handoff and delivery-attempt/webhook evidence as required; never store raw tokens.
- `backend/src/organizations/organizationService.ts` delivery result contract.
- New provider adapter/configuration under the approved integration/platform boundary.
- Identity preparation through SPEC-35.
- Invitation routes, member/invitation list routes, webhook route, mutation security, and typed errors.
- `frontend/src/pages/InvitationAcceptPage.tsx` auth/activation handoff and explicit acceptance.
- Organization governance page data loading, delivery state, resend/revoke, and truthful success/error UX.
- Environment/external-service/API/testing docs and a production invitation runbook.

## Implementation sequence

1. Record provider, sender domain, privacy/DPA/region, template, auth activation design, lifetimes, limits, webhook, and incident ownership decisions.
2. Add forward schema for handoffs and provider-neutral delivery evidence plus restricted grants/RLS.
3. Implement certified adapter, fake/capture adapter, startup validation, template rendering, and webhook verification.
4. Integrate SPEC-35 and change invitation creation to return truthful delivery state.
5. Implement auth handoff and exact-email acceptance for existing/new users.
6. Complete owner-facing invitation/member lists and resend/revoke UI.
7. Add audit, limits, metrics, alerts, and runbook.
8. Certify in disposable/provider sandbox, then production canary with approved test addresses before real customer enablement.

## Required tests

### Unit/contract tests

- Template escaping, locale fallback, allowed fields, and URL/fragment construction.
- Adapter mapping for accepted/rejected/ambiguous/timeout without raw provider leakage.
- Startup rejection for disabled/missing provider, HTTP base URL, unknown template, missing webhook secret, or real sending in preview.
- Handoff entropy/hash/cookie flags/expiry/single use/CSRF/origin.
- Exact-email normalization and wrong-email denial.
- Owner-role rejection at all layers.
- Truthful creation result and UI copy for sent/failed/pending states.

### Real-database/concurrency tests

- Invitation hash only; no raw token/handoff/provider secret columns.
- Browser roles cannot read/write invitation, handoff, attempt, or webhook evidence directly.
- Concurrent accept, resend, revoke, expiry, and organization suspension races.
- One membership per organization/user and atomic event/acceptance.
- Handoff invalidation after acceptance/resend/revoke/logout/expiry.
- Tenant-scoped bounded lists and foreign-ID generic `404`.

### Provider and end-to-end tests

- Certified sandbox sends both existing-user and new-user flows.
- Password activation and Google auth return to the same pending invitation safely.
- Existing zero-membership user accepts and receives only the invited organization/role.
- New user gets profile from SPEC-35 and no membership before explicit acceptance.
- Delivery failure/resend rotates token and old link fails.
- Bounce/complaint/authenticated webhook and duplicate webhook behavior.
- Owner invites admin/member/viewer; admin cannot invite admin; no one invites owner.
- Ownership transfer works only after separate explicit owner transaction.
- Azar invitation/session/handoff cannot access or accept Solar invitation and reverse.
- Frontend never stores invitation/auth tokens in local/session storage, query keys, analytics, or rendered DOM.

### Security tests

- Account/organization/invitation enumeration, token guessing/replay, open redirect, callback-state tampering, CSRF, Origin/CORS, cookie fixation, and cross-browser handoff theft.
- Provider webhook forgery, replay, oversized payload, wrong event type, and message-ID collision.
- Email header/HTML/URL injection through organization/inviter/profile values.
- Secrets/PII canaries across logs, audits, errors, provider metadata, traces, and frontend bundles.
- Distributed limit works across two backend instances.

## Acceptance criteria

1. Production no longer injects `DisabledInvitationDeliveryAdapter` when invitation routes are enabled.
2. Startup fails closed unless a certified provider, HTTPS base URL, exact origins, templates, secrets, limits, audit, and alerts are configured.
3. Owner/admin hierarchy and non-owner role rules are enforced in UI, service, and database.
4. SPEC-35 safely handles existing/new Auth identity and profile preparation.
5. Existing and new invitees can authenticate/activate and return without raw-token persistence.
6. Exact verified email remains mandatory at acceptance.
7. Acceptance is atomic, single-use, race-safe, and context-refreshing.
8. Delivery failure is represented truthfully and creates no membership.
9. Resend rotates the token; revoke/expiry/used/replaced links cannot grant access.
10. Provider webhook evidence is authenticated/deduplicated and never grants membership.
11. Member/invitation lists are mounted, scoped, bounded, and consumed by the settings UI.
12. Owner sees safe delivery/expiry status and can resend/revoke permitted invitations.
13. Raw tokens, links, provider secrets/bodies, and unnecessary PII are absent from persistence, telemetry, and frontend storage.
14. Distributed abuse controls, required audit, metrics, alerts, and incident runbook are active.
15. Real-provider sandbox, real-database concurrency, existing/new-user, password/Google, and Azar/Solar isolation tests pass.
16. Initial owner activation reuses delivery infrastructure but never creates owner through invitation.
17. Public registration remains closed.
18. Production enablement has named security, operations, and product approval evidence.

## Rollout, rollback, and completion gate

Rollout stages are: fake adapter in tests, capture adapter in local/preview, provider sandbox, production sending-domain verification, approved canary recipients, one approved organization, then general invite enablement. Provider/template/configuration fingerprints and test evidence are recorded at every production stage.

Rollback disables new invite creation and delivery while preserving resolve/accept for already-sent valid invitations only if security policy and provider state permit; otherwise revoke outstanding invitations explicitly. It never reopens public registration, exposes raw tokens, creates memberships manually, or falls back to the disabled adapter while reporting success.

SPEC-37 is complete only when the selected provider and operational configuration are approved; the adapter, identity activation, auth handoff, lists/UI, delivery evidence, webhooks, limits, audit, alerts, runbook, and required real-provider/database/security tests are implemented and production-certified.

## References

- `docs/09-roadmap/specs/pending/26-SPEC-multi-tenant-organizations-memberships-onboarding-and-lifecycle.md`
- `docs/09-roadmap/specs/pending/27-SPEC-multi-tenant-identity-sessions-authorization-apis-and-frontend-context.md`
- `docs/09-roadmap/specs/pending/28-SPEC-multi-tenant-database-enforcement-audit-abuse-observability-and-recovery.md`
- `docs/09-roadmap/specs/pending/32-SPEC-multi-tenant-integrations-secrets-outbox-google-and-make.md`
- `docs/09-roadmap/specs/pending/34-SPEC-multi-tenant-azar-migration-cutover-certification-and-solar-rollout.md`
- `docs/09-roadmap/specs/pending/35-SPEC-production-auth-user-and-profile-provisioning.md`
- `docs/03-operation/spec26-organization-governance-runbook.md`
- `docs/03-operation/spec27-identity-session-and-context-runbook.md`
- `docs/02-setup/environment.md`
- `docs/02-setup/external-services.md`
- `docs/05-integrations/api-contracts.md`
- `docs/06-testing/testing-strategy.md`
- `docs/07-development/engineering-standards.md`
