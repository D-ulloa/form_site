-- Standalone PostgreSQL ONLY: an empty disposable database named spec44*.
-- A real Supabase test instance already has Auth/roles; apply the selected migrations there instead.
\set ON_ERROR_STOP on
do $$ begin
  if current_database() not like 'spec44%' or exists(select from pg_tables where schemaname in ('public','auth')) then
    raise exception 'An empty disposable spec44* database is required';
  end if;
  if not exists(select from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists(select from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end; $$;
create schema auth;
create schema extensions;
create extension pgcrypto with schema extensions;
create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,confirmed_at timestamptz,last_sign_in_at timestamptz);
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
\ir ../migrations/20260724000000_contract_entries.sql
\ir ../migrations/20260811000000_contract_spec22_access_control.sql
\ir ../migrations/20260818120000_spec26_organization_governance.sql
\ir ../migrations/20260818140000_spec27_identity_sessions_authorization.sql
\ir ../migrations/20260818160000_spec28_platform_controls.sql
\ir ../migrations/20260818180000_spec29_multitenant_contract_domain.sql
\ir ../migrations/20260818200000_spec30_multitenant_property_domain.sql
\ir ../migrations/20260819000000_spec31_private_asset_platform.sql
\ir ../migrations/20260825120000_spec35_identity_profile_provisioning.sql
\ir ../migrations/20260825200000_spec37_invitation_delivery_handoff.sql
\ir ../migrations/20260826120000_spec37_manual_invitation_links.sql
\ir ../migrations/20260827130000_spec28_rate_limit_conflict_fix.sql
\ir ../migrations/20260827140000_spec37_manual_invitation_event_fix.sql
\ir ../migrations/20260827150000_spec37_list_projection_ambiguity_fix.sql
\ir ../migrations/20260827160000_spec37_handoff_digest_schema_fix.sql
\ir ../migrations/20260910120000_spec39_arrangement_orders.sql
\ir ../migrations/20260911120000_spec40_inquilino_role.sql
\ir ../migrations/20260912120000_spec42_arrangement_properties.sql
\ir ../migrations/20260912130000_spec42_property_invitation_enforcement.sql
\ir ../migrations/20260912140000_spec43_arrangement_requests.sql
-- The migration control boundary is normally supplied by SPEC-34.
create schema migration_control;
create table migration_control.migration_inventory_items(artifact_type text,ownership_signals jsonb,confidence text,
  quarantine_state text,final_disposition text,proposed_disposition text);
\if :{?spec44_before_upgrade}
-- Dedicated upgrade assertions apply SPEC-44 after seeding previous roles.
\else
\ir ../migrations/20260912150000_spec44_personal_invitations.sql
\endif
