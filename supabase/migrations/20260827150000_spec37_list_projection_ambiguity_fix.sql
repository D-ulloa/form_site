-- Qualify membership columns that collide with RETURNS TABLE output variables.
create or replace function public.spec37_list_members(p_organization_id uuid, p_actor_membership_id uuid,
  p_after_id uuid, p_limit integer)
returns table (user_id uuid, display_name text, email_masked text, role text, status text,
  joined_at timestamptz, version integer, cursor_id uuid) language plpgsql security definer set search_path = pg_catalog as $$
begin
  if p_limit not between 1 and 100 or not exists (
    select 1
    from public.organization_memberships actor_membership
    where actor_membership.id = p_actor_membership_id
      and actor_membership.organization_id = p_organization_id
      and actor_membership.status = 'active'
  ) then raise exception 'FORBIDDEN'; end if;
  return query select m.user_id, p.display_name, left(u.email,1) || '***@' || split_part(u.email,'@',2),
    m.role, m.status, m.joined_at, m.version, m.id from public.organization_memberships m
    join public.user_profiles p on p.user_id = m.user_id join auth.users u on u.id = m.user_id
    where m.organization_id = p_organization_id and (p_after_id is null or m.id > p_after_id)
    order by m.id limit p_limit;
end;
$$;

create or replace function public.spec37_list_invitations(p_organization_id uuid, p_actor_membership_id uuid,
  p_after_id uuid, p_limit integer)
returns table (invitation_id uuid, email_masked text, intended_role text, status text,
  expires_at timestamptz, delivery_state text, delivery_method text, link_issued_at timestamptz,
  last_attempt_at timestamptz, attempt_count integer, next_action text, version integer, cursor_id uuid)
language plpgsql security definer set search_path = pg_catalog as $$
begin
  if p_limit not between 1 and 100 or not exists (
    select 1
    from public.organization_memberships actor_membership
    where actor_membership.id = p_actor_membership_id
      and actor_membership.organization_id = p_organization_id
      and actor_membership.status = 'active'
      and actor_membership.role in ('owner','admin')
  ) then raise exception 'FORBIDDEN'; end if;
  return query select i.id, left(i.email_normalized,1) || '***@' || split_part(i.email_normalized,'@',2),
    i.intended_role, case when i.status = 'pending' and i.expires_at <= now() then 'expired' else i.status end,
    i.expires_at, i.delivery_state, i.delivery_method, i.link_issued_at, i.last_sent_at, i.send_count,
    case when i.status = 'pending' and i.expires_at > now() then
      case when i.delivery_method = 'share_link' then 'rotate_or_revoke' else 'resend_or_revoke' end
      else 'none' end, i.version, i.id
    from public.organization_invitations i where i.organization_id = p_organization_id
      and (p_after_id is null or i.id > p_after_id) order by i.id limit p_limit;
end;
$$;
