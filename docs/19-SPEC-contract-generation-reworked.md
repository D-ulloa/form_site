# SPEC-19 Contract Generation — Supabase email/password login, immediate admin access, and simplified entry page actions

**Date:** 2026-08-03  
**Priority:** high  
**Status:** implemented

---

## Summary

This specification defines the next contract-generation authentication and main entry point experience. It replaces the existing `agente` identification and Google OAuth login workflow with a Supabase-based email/password authentication flow. The main page will present `Registrarse` and `Iniciar sesión` actions, each opening a dedicated section for that purpose. Any user who registers from the main page is granted administrator access immediately.

## Motivation

The previous admin/authentication workflow relied on an agent identification step and Google OAuth login, which added operational complexity and a split-auth experience. This spec streamlines the admin experience by using Supabase email/password authentication, removing the special `agente` configuration flow and Google account dependency entirely. It also simplifies the entry page UI with clear registration and login actions.

## Objectives

- Remove the `agente` identification flow from the contract-generation entry path.
- Remove Google OAuth sign-in from the main entry and admin authentication workflow.
- Use Supabase email/password authentication for all sign-in and registration flows.
- Offer two main page actions: `Registrarse` and `Iniciar sesión`.
- Each button opens a dedicated input section for the corresponding action.
- Automatically grant administrator access to any user who registers on the main page.

## Scope

Includes:

- Specification of main page actions and flow labels.
- Specification of authentication mechanism migration from agent identification / Google OAuth to Supabase email/password.
- Specification of the immediate admin-grant behavior for newly registered main-page users.

Excludes:

- Implementation details of Supabase integration, database schema migration, or backend session management.
- Security hardening beyond the explicit admin access grant rule described here.
- Changes to unrelated contract-generation screens or flows that do not involve entry-page authentication.

## Requirements

### 1. Remove `agente` identification

- The `Configurar agente` flow and any visible or hidden agent identifier fields must be removed from the main page and contract generation entry experience.
- There must no longer be any user-facing step that asks for or displays an `agente` ID during authentication or access provisioning.
- All references in copy, buttons, warnings, or helper text related to `agente` setup must be replaced with registration or login language.

### 2. Remove Google OAuth login

- The Google OAuth sign-in flow must be removed from the main page and from any admin authentication path.
- There must no longer be an `Iniciar sesión con Google` button or equivalent Google-specific login affordance.
- Any copy or UI formerly describing Google login must be replaced by the new Supabase email/password login flow.

### 3. Use Supabase email/password authentication

- The main page must provide a Supabase-based authentication flow using email and password.
- Users must be able to register a new account using email and password and then sign in with those credentials.
- The UI design should clearly separate registration and login into two dedicated sections.

### 4. Present `Registrarse` and `Iniciar sesión` actions on the main page

- The main entry page must present two primary actions: `Registrarse` and `Iniciar sesión`.
- Each action opens a focused section or panel for that action only.
- The registration section should collect at least email and password fields, with appropriate labels.
- The login section should collect email and password fields, with appropriate labels.
- The sections should be clearly labeled so users understand whether they are creating a new account or signing in to an existing account.

### 5. Immediate administrator access for new registrations

- Any user who completes registration from the main page must receive administrator access immediately after account creation.
- There must be no separate approval step, external allowlist, or manual admin activation required for accounts created from the main page.
- The spec defines this behavior as automatic admin assignment for main-page registrations.

### 6. Section-based UI flow

- Clicking `Registrarse` must open the registration section and hide or collapse the login section when appropriate.
- Clicking `Iniciar sesión` must open the login section and hide or collapse the registration section when appropriate.
- The UI should keep focus on the current action and avoid presenting both sections at the same time unless the design intentionally chooses a tabbed or panel layout that makes both options clear.

## Acceptance criteria

1. The main page no longer references `Configurar agente` or agent identification anywhere in the authentication flow.
2. Google OAuth login is removed from the entry/main page and admin authentication workflow.
3. The main page shows `Registrarse` and `Iniciar sesión` buttons as the primary authentication entry points.
4. `Registrarse` and `Iniciar sesión` each open their own dedicated section on the page.
5. Newly registered users from the main page are granted administrator access immediately without additional approval.
6. The spec remains a redaction-only document and does not implement backend or frontend changes.

## Implementation notes

- `/register` and `/login` provide the dedicated email/password sections.
- The authentication screens follow the existing dark indigo/cyan site palette
  and intentionally display no product name.
- Supabase Auth creates and confirms main-page accounts through the backend.
- A Supabase signup trigger records the administrator grant in
  `public.contract_admin_users`; the resulting HttpOnly session can use the
  contract creation and administration routes immediately.
- The active authentication routes no longer mount the previous Google OAuth
  flow or accept an agent identifier for contract administration.

## Notes

- This document is a requirements redaction only. It intentionally does not include technical implementation details or code-level changes.
- The focus is on simplifying the authentication experience and removing the previous agent/Google OAuth complexity in favor of Supabase email/password login.
- The automatic admin grant behavior is specific to registrations performed from the main page and should be treated as the default admin onboarding rule for this workflow.
