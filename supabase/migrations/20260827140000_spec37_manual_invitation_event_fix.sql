-- SPEC-37 follow-up: admit manual-link lifecycle events and ensure account
-- activation is audited as a pre-membership system action.

alter table public.organization_events
  drop constraint organization_events_event_type_check;
alter table public.organization_events
  add constraint organization_events_event_type_check check (event_type in (
    'organization.created', 'organization.settings_updated', 'organization.suspended',
    'organization.reactivated', 'organization.deletion_requested', 'organization.deletion_cancelled',
    'organization.deletion_blocked', 'organization.deleted', 'organization.export_requested',
    'member.invited', 'member.invitation_resent', 'member.invitation_revoked',
    'member.invitation_accepted', 'member.invitation_link_issued',
    'member.invitation_account_activated', 'member.role_changed', 'member.suspended',
    'member.reactivated', 'member.removed', 'member.left', 'ownership.transferred'
  ));

create or replace function public.spec37_complete_invitation_registration(
  p_handle_hash text, p_browser_binding_hash text, p_origin_hash text,
  p_user_id uuid, p_display_name text, p_request_id text
) returns void language plpgsql security definer set search_path = pg_catalog as $$
declare v_handoff public.invitation_auth_handoffs%rowtype;
declare v_invitation public.organization_invitations%rowtype;
begin
  if char_length(btrim(p_display_name)) not between 2 and 120 then raise exception 'INVITATION_INVALID'; end if;
  select * into v_handoff from public.invitation_auth_handoffs
    where handle_hash = p_handle_hash for update;
  if not found or v_handoff.browser_binding_hash <> p_browser_binding_hash
    or v_handoff.origin_hash <> p_origin_hash or v_handoff.consumed_at is not null
    or v_handoff.invalidated_at is not null or v_handoff.expires_at <= now()
    then raise exception 'INVITATION_INVALID'; end if;
  select * into v_invitation from public.organization_invitations
    where id = v_handoff.invitation_id and organization_id = v_handoff.organization_id for update;
  if not found or v_invitation.status <> 'pending' or v_invitation.expires_at <= now()
    or not v_invitation.registration_permitted or v_invitation.invited_auth_user_id <> p_user_id
    then raise exception 'INVITATION_INVALID'; end if;
  update public.user_profiles set display_name = btrim(p_display_name), updated_at = now(), version = version + 1
    where user_id = p_user_id;
  if not found then raise exception 'INVITATION_INVALID'; end if;
  update public.organization_invitations set registration_permitted = false, version = version + 1
    where id = v_invitation.id;
  insert into public.organization_events (organization_id, event_type, actor_type, actor_user_id,
    target_type, target_id, request_id, metadata)
  values (v_invitation.organization_id, 'member.invitation_account_activated', 'system', p_user_id,
    'invitation', v_invitation.id, p_request_id, jsonb_build_object('auth_method', 'password'));
end;
$$;

