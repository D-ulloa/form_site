# SPEC-27 acceptance traceability

Status: repository implementation evidence, 2026-08-19. Policy sign-off,
disposable real-database concurrency/RLS proof, deployment configuration, and
SPEC-34 legacy cutover certification remain open.

| Acceptance group | Repository evidence | Remaining gate |
|---|---|---|
| Identity-only login and opaque sessions (1–10) | SPEC-27 migration; `identity/sessionSecurity.ts`, `sessionService.ts`, Supabase provider and repository; auth router tests | Real Auth/database expiry, rotation, concurrency, cleanup, MFA and device-limit certification |
| CSRF, Origin and CORS (11–12) | exact-origin startup/configuration, session-bound double-submit hash, canonical router enforcement and tests | Production proxy/origin/callback review |
| Context, capabilities and API conventions (13–18) | current membership/organization lookup, generic cross-tenant denial, mounted governance router, safe status envelopes | Real RLS, pagination/load and route-matrix adversarial proof |
| Principal separation and API keys (19–24) | independent external-link domain, hashed tenant API keys, one-time raw issuance, `aal2` gate, support schema disabled by startup guard | Live key rotation/IP tests; support remains unapproved/off; SPEC-34 removes compatibility principals |
| Frontend tenant isolation (25–32) | authentication provider, server-confirmed organization boundary, `/t/:slug` routing, UUID/epoch keys, cancellation, stale-response checks, BroadcastChannel logout and tests | Browser/axe/multi-tab and production-shaped Azar/Solar test |
| Telemetry/failure/domain handoff (33–35) | no-store safe envelopes, fail-closed repository errors, typed context and tenant-first downstream repositories | Alert sink evidence and final contract/property compatibility cutover under SPEC-34 |
| Documentation and closure (36–37) | environment/API/architecture/testing/runbook/traceability updates | Named approval, real-database evidence, old-session rejection and immutable SPEC-34 certificate |

No migration was applied and no organization, membership, API key, support
grant, or production session was created by the repository implementation.
