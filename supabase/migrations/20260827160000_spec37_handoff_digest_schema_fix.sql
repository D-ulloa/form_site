-- pgcrypto is installed in the extensions schema in hosted Supabase projects.
create or replace function public.spec37_create_invitation_handoff(
  p_raw_invitation_token text, p_handle_hash text, p_browser_binding_hash text,
  p_origin_hash text, p_expires_at timestamptz
) returns void language plpgsql security definer set search_path = pg_catalog as $$
declare v_invitation public.organization_invitations%rowtype;
begin
  select * into v_invitation from public.organization_invitations i
    where i.token_hash = encode(extensions.digest(p_raw_invitation_token, 'sha256'), 'hex') for update;
  if not found or v_invitation.status <> 'pending' or v_invitation.expires_at <= now()
    or not exists (select 1 from public.organizations o where o.id = v_invitation.organization_id and o.status = 'active')
    or p_expires_at > least(now() + interval '15 minutes', v_invitation.expires_at)
    then raise exception 'INVITATION_INVALID'; end if;
  update public.invitation_auth_handoffs set invalidated_at = now()
    where invitation_id = v_invitation.id and browser_binding_hash = p_browser_binding_hash
      and consumed_at is null and invalidated_at is null;
  insert into public.invitation_auth_handoffs (organization_id, invitation_id, handle_hash,
    browser_binding_hash, origin_hash, purpose, expires_at)
  values (v_invitation.organization_id, v_invitation.id, p_handle_hash, p_browser_binding_hash,
    p_origin_hash, 'invitation_acceptance', p_expires_at);
end;
$$;
