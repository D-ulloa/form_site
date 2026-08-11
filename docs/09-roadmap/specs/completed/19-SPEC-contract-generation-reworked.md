# SPEC-19 Contract Generation — Supabase email/password login, Google OAuth compatibility, and simplified entry page actions

**Date:** 2026-08-03  
**Priority:** high  
**Status:** implemented

---

## Summary

This specification defines the current contract-generation authentication and main entry point experience. It removes the `agente` identification flow from the main entry, adds Supabase email/password authentication, and retains Google OAuth as an alternate administrator login. The main page presents `Registrarse` and `Iniciar sesión` actions, each opening a dedicated section. Any user who registers from the main page is granted administrator access immediately.

## Motivation

The previous workflow relied on an agent identification step and did not provide a dedicated password-authentication path. This iteration removes the special `agente` configuration flow, adds email/password registration and login, preserves the existing Google OAuth path, and simplifies the entry page UI with clear registration and login actions.

## Objectives

- Remove the `agente` identification flow from the contract-generation entry path.
- Retain Google OAuth sign-in as an alternate administrator authentication method alongside email/password.
- Use Supabase email/password authentication for all sign-in and registration flows.
- Offer two main page actions: `Registrarse` and `Iniciar sesión`.
- Each button opens a dedicated input section for the corresponding action.
- Automatically grant administrator access to any user who registers on the main page.

## Scope

Includes:

- Specification of main page actions and flow labels.
- Specification of the authentication flow combining Supabase email/password with the existing Supabase Google OAuth handoff.
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

### 2. Retain Google OAuth login

- The existing Google OAuth sign-in flow remains available from the dedicated authentication screen as an alternate administrator login.
- The Google OAuth callback exchanges the Supabase session for the same signed HTTP-only application cookie used by password authentication.
- Google OAuth configuration remains optional when email/password authentication is used.

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
2. Google OAuth remains available as an alternate administrator login and shares the application session boundary with email/password authentication.
3. The main page shows `Registrarse` and `Iniciar sesión` buttons as the primary authentication entry points.
4. `Registrarse` and `Iniciar sesión` each open their own dedicated section on the page.
5. Newly registered users from the main page are granted administrator access immediately without additional approval.
6. The documented authentication flow is implemented by the current frontend, backend, and Supabase migration state described in the implementation notes.

## Implementation notes

- `/register` and `/login` provide the dedicated email/password sections.
- The authentication screens follow the existing dark indigo/cyan site palette
  and intentionally display no product name.
- Supabase Auth creates and confirms main-page accounts through the backend.
- A Supabase signup trigger records the administrator grant in
  `public.contract_admin_users`; the resulting HttpOnly session can use the
  contract creation and administration routes immediately.
- The active authentication routes mount both password and Google OAuth session handoffs and do not accept a property agent identifier for contract administration.

## Notes

- This document records the implemented requirements and behavior; the implementation notes identify the current route, session, and migration boundaries.
- The focus is on simplifying the authentication experience by removing agent setup from the main entry and making Supabase email/password the primary explicit flow while retaining Google OAuth compatibility.
- The automatic admin grant behavior is specific to registrations performed from the main page and should be treated as the default admin onboarding rule for this workflow.
