# SPEC-17 Contract Generation — Stable admin links, Argentinian placeholders, hybrid admin authentication, and DNI required uploads

**Date:** 2026-08-03  
**Priority:** high  
**Status:** implemented

---

## Summary

This specification defines UI and admin-facing contract generation requirements to ensure stable administration links, Argentinian-oriented placeholder content in user and client contract forms, hybrid email/password and Google OAuth administrator access on the main page, and mandatory DNI uploads where DNI capture is enabled.

## Motivation

Current behavior creates per-generation or inconsistent links from the `Administrar contratos` list for existing contract entries, relies on a manual ID-setting workflow for admin access, does not provide locale-appropriate form placeholders, and allows submissions when DNI fields are present but not completed. SPEC-17 prescribes consistent, deterministic admin links for contract entries, clearly useful placeholders for Argentinian users, the hybrid administrator authentication flow, and required DNI attachments where enabled.

## Objectives

- Ensure links to existing contract entries from `Administrar contratos` are stable and deterministic (not regenerated or varied each time).
- Replace visible alphanumeric generated contract codes with the new user-facing `Direccion` identifier and hide any generated code from contract generation screens, admin lists, and forms where `Direccion` is present.
- Add clear placeholders to all contract generation form fields (user and client) using common Argentinian examples and identifier formats.
- Replace the manual admin ID assignment flow with Supabase account authentication on the main page, using email/password as the primary path and Google OAuth as an alternate administrator login.
- Enforce that DNI uploads (when the DNI upload feature is habilitado) are required before submitting contract forms.

## Scope

Includes:

- Authoritative description of link behavior and patterns used in administration UI.
- Placeholder values and guidance for user-facing `user` and `client` contract forms.
- The hybrid administrator authentication behavior on the main page, with email/password as the primary path and Google OAuth as an alternate.
- Validation requirements making DNI uploads required where those fields are enabled.

Excludes:

- Infrastructure provisioning for OAuth client credentials — deployment still supplies the Google OAuth client and administrator allowlist.

## Requirements

### 1. Stable, consistent admin links for contract entries

- Links originating from `Administrar contratos` that navigate to an existing contract entry must be stable and deterministic across time and page renders.
- A stable link is defined as a persistent, non-changing path for an entry that resolves to the same contract detail view for the lifetime of the entry. Examples of acceptable forms (implementation left to engineering) include:
  - `/administrar/contratos/{contractId}` — using the internal contract ID (stable by design), or
  - `/administrar/contratos/{direccion-slug}` — using a normalized, validated `Direccion` slug derived from the contract's `Direccion` field (slug generation must be deterministic and collision-handled).
- If `Direccion` is present for a contract entry, the user-facing administration experience must hide any generated alphanumeric contract code and instead display `Direccion` as the identifier.
- Unacceptable behavior: generating a new, unique per-render link (for example, including ephemeral tokens, timestamps, or random IDs) that changes the URL for the same contract entry across renders.
- The administration list, any shareable admin links, the edit action, and the contract generation result screens must reference the same stable URL for a contract entry.

### 2. Placeholders for Argentinian standards in form fields

- All contract generation forms (`user`, `client`, and related sub-forms such as `Garante`) must include contextual placeholder text for data entry fields. Placeholders should be in Spanish and reflect Argentinian naming, address, and identifier formats.
- Examples (placeholder recommendations only; engineering may adapt formatting):
  - `Nombre` (first name): "Juan"  
  - `Apellido` (last name): "Pérez"  
  - `Nombre completo` / `Titular`: "Juan Pérez"  
  - `Documento (DNI)` (number input): "12345678" or formatted "12.345.678"  
  - `CUIT/CUIL` (tax/person identifier): "20-12345678-9"  
  - `Domicilio` / `Dirección`: "Av. Santa Fe 1234, CABA"  
  - `Localidad`: "CABA" or "Rosario"  
  - `Provincia`: "Ciudad Autónoma de Buenos Aires" or "Buenos Aires"  
  - `Código Postal`: "C1000"  
  - `Teléfono`: "+54 9 11 1234-5678"  
  - `Email`: "juan.perez@ejemplo.com"  
  - `Fecha` fields: use `DD/MM/YYYY` example in placeholder, e.g. "31/12/2026"  
- For DNI upload controls, include helper placeholder copy near the upload input (small helper text) with example and requirement notes, e.g. "Subir DNI — Frontal (ej. 12345678)" and "Subir DNI — Dorso".
- All placeholders should be clearly visible but not used as values on submit. They are purely to guide the user during entry.

### 3. Hybrid administrator authentication on the main page

- The main entry point provides email/password registration and login, plus an alternate Google OAuth action for administrators.
- Both methods establish the same signed HTTP-only application session and administrator boundary.
- Google OAuth remains optional when email/password authentication is used.
- The manual `agente` identification flow is not part of contract administration; compatibility agent headers remain outside the current authentication UI.

### 4. DNI uploads required where enabled

- Wherever a contract form presents DNI upload controls (for `Inquilino`, `Garante`, or any other role), uploading the configured DNI files becomes a required step for form submission when that upload feature is habilitado.
- Required behavior details:
  - If DNI upload is enabled for a role, both `Frontal` and `Dorso` files must be provided for that role before the form can be successfully submitted, unless a specific exception is documented and approved.
  - The UI must surface a clear validation error when a required DNI side is missing, e.g. "Se requiere la imagen frontal del DNI" / "Se requiere la imagen del dorso del DNI".
  - File acceptance guidance: accept PDF plus the configured JPEG, PNG, WEBP, GIF, HEIC, and HEIF MIME types; display maximum allowed file size in the placeholder or helper text (implementation may choose the specific size limit).
  - If the DNI upload control appears but is explicitly marked as `opcional` in a given workflow, the field may remain optional — but the enabling configuration must be explicit and documented. By default, visible DNI upload controls are required.

## Acceptance criteria

1. Links from `Administrar contratos` to any existing contract entry use a persistent, deterministic URL that does not change across renders for the same entry.
2. Form fields across `user`, `client`, and related forms include Spanish placeholders consistent with Argentinian naming, address, and identifier examples as described in this SPEC.
3. The main page presents email/password registration and login actions plus an alternate Google OAuth action; either successful method establishes the administrator session.

4. When DNI upload controls are habilitado for a role, both `Frontal` and `Dorso` uploads are required and the form cannot be submitted until both are provided; clear Spanish validation messages are presented when missing.
5. When a contract includes the new `Direccion` field, any generated alphanumeric contract code must be hidden from first-generation screens, `Administrar contratos` pages, and contract form pages that surface contract metadata.

## Implementation notes

- Administration uses the deterministic `/contracts/admin/:entryId` route. The UUID remains a backend linkage value and route component, while `Direccion` is the only user-facing contract identifier in the generation modal, administration list/detail, and form chrome.
- The main page exposes `Continuar con Google` as an alternate login alongside email/password. Supabase Auth performs the Google OAuth flow in the browser; the callback exchanges the verified Supabase session for the same signed HTTP-only application cookie. Google access tokens are not stored in the application cookie.
- Contract field definitions now carry Spanish Argentinian placeholders, including DNI, CUIT/CUIL, address, province, phone, email, and date examples. Placeholders are presentation-only.
- Visible DNI receivers are required for migrated entries: both `Frente DNI` and `Dorso DNI` must be present before submission. The private DNI bucket accepts PDF as well as the existing image formats, and `CONTRACT_DNI_UPLOADS_REQUIRED=true` enables the policy during staged local rollouts.
- `supabase/migrations/20260803000000_contract_spec17.sql` updates the private DNI bucket allowlist for PDF uploads.

## Notes

- This document records implemented behavior; it does not itself change code or deploy configuration. Deployment still owns OAuth client setup, redirect URIs, administrator grants, and privacy handling for DNI uploads.
- For stable admin links, prefer server-side canonical URLs where possible; if slugs are used, ensure deterministic slug generation and an administrative UI for conflict resolution.
- Placeholders are examples meant to improve form completion rates and reduce invalid entries; they are not substitutes for validation.
- DNI upload files are highly sensitive; ensure privacy, secure storage, and retention policies are part of the implementation plan (out of scope for this SPEC redaction).
