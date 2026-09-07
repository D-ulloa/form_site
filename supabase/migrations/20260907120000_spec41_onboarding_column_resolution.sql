-- Resolve collisions between RETURNS TABLE variables and table columns.
-- Keep the original deployed migration intact.
create or replace function public.spec41_claim_self_service_onboarding(
  p_operation_id uuid, p_email_fingerprint text, p_payload_fingerprint text,
  p_display_name text, p_organization_display_name text, p_organization_slug text,
  p_plan_key text, p_locale text, p_time_zone text, p_terms_version text,
  p_auth_method text, p_request_id text
) returns table (
  operation_id uuid, claim_state text, state text, auth_user_id uuid,
  organization_id uuid, organization_slug text, owner_membership_id uuid, failure_code text
) language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare v_operation public.self_service_onboarding_operations%rowtype;
begin
  if p_email_fingerprint !~ '^[0-9a-f]{64}$' or p_payload_fingerprint !~ '^[0-9a-f]{64}$'
    or p_plan_key <> 'standard' or p_auth_method not in ('password', 'google')
    or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'INVALID_ONBOARDING_INPUT';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_email_fingerprint, 41));
  select * into v_operation from public.self_service_onboarding_operations where id = p_operation_id for update;
  if found then
    if v_operation.email_fingerprint <> p_email_fingerprint or v_operation.payload_fingerprint <> p_payload_fingerprint
      or v_operation.auth_method <> p_auth_method then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    update public.self_service_onboarding_operations set last_request_id = p_request_id, updated_at = now(), version = version + 1
      where id = p_operation_id returning * into v_operation;
    insert into public.self_service_onboarding_events (operation_id, request_id, action, outcome)
      values (v_operation.id, p_request_id, 'onboarding.replayed', 'succeeded');
    return query select v_operation.id, 'replayed', v_operation.state, v_operation.auth_user_id,
      v_operation.organization_id, v_operation.organization_slug, v_operation.owner_membership_id, v_operation.failure_code;
    return;
  end if;
  if exists (select 1 from public.self_service_onboarding_operations
    where email_fingerprint = p_email_fingerprint and state in ('started', 'identity_created', 'organization_created', 'failed_recoverable')) then
    raise exception 'ONBOARDING_IN_PROGRESS';
  end if;
  if exists (select 1 from public.organizations where slug = p_organization_slug)
    or exists (select 1 from public.self_service_onboarding_operations where organization_slug = p_organization_slug) then
    raise exception 'SLUG_CONFLICT';
  end if;
  insert into public.self_service_onboarding_operations (
    id, email_fingerprint, payload_fingerprint, display_name, organization_display_name, organization_slug,
    plan_key, locale, time_zone, terms_version, auth_method, organization_id, owner_membership_id,
    created_request_id, last_request_id
  ) values (
    p_operation_id, p_email_fingerprint, p_payload_fingerprint, btrim(p_display_name), btrim(p_organization_display_name),
    p_organization_slug, p_plan_key, p_locale, p_time_zone, p_terms_version, p_auth_method,
    gen_random_uuid(), gen_random_uuid(), p_request_id, p_request_id
  ) returning * into v_operation;
  insert into public.self_service_onboarding_events (operation_id, request_id, action, outcome)
    values (v_operation.id, p_request_id, 'onboarding.claimed', 'succeeded');
  return query select v_operation.id, 'created', v_operation.state, v_operation.auth_user_id,
    v_operation.organization_id, v_operation.organization_slug, v_operation.owner_membership_id, v_operation.failure_code;
end;
$$;

create or replace function public.spec41_mark_self_service_identity(
  p_operation_id uuid, p_user_id uuid, p_email_fingerprint text, p_auth_method text, p_request_id text
) returns table (
  operation_id uuid, claim_state text, state text, auth_user_id uuid,
  organization_id uuid, organization_slug text, owner_membership_id uuid, failure_code text
) language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare v_operation public.self_service_onboarding_operations%rowtype;
begin
  select * into v_operation from public.self_service_onboarding_operations where id = p_operation_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_operation.auth_user_id is not null and v_operation.auth_user_id <> p_user_id then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  if v_operation.email_fingerprint <> p_email_fingerprint or v_operation.auth_method <> p_auth_method then raise exception 'FORBIDDEN'; end if;
  if v_operation.state in ('completed', 'organization_created') then
    return query select v_operation.id, 'replayed', v_operation.state, v_operation.auth_user_id,
      v_operation.organization_id, v_operation.organization_slug, v_operation.owner_membership_id, v_operation.failure_code; return;
  end if;
  update public.self_service_onboarding_operations set auth_user_id = p_user_id, state = 'identity_created',
    failure_code = null, last_request_id = p_request_id, updated_at = now(), version = version + 1
    where id = p_operation_id returning * into v_operation;
  insert into public.self_service_onboarding_events (operation_id, request_id, action, outcome)
    values (v_operation.id, p_request_id, 'onboarding.identity_created', 'succeeded');
  return query select v_operation.id, 'resumed', v_operation.state, v_operation.auth_user_id,
    v_operation.organization_id, v_operation.organization_slug, v_operation.owner_membership_id, v_operation.failure_code;
end;
$$;

create or replace function public.spec41_reject_self_service_onboarding(
  p_operation_id uuid, p_reason_code text, p_request_id text
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare v_operation public.self_service_onboarding_operations%rowtype;
begin
  select * into v_operation from public.self_service_onboarding_operations where id = p_operation_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_operation.auth_user_id is not null then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  if v_operation.state = 'rejected' then return; end if;
  update public.self_service_onboarding_operations set state = 'rejected', failure_code = p_reason_code,
    last_request_id = p_request_id, updated_at = now(), version = version + 1 where id = p_operation_id;
  insert into public.self_service_onboarding_events (operation_id, request_id, action, outcome, reason_code)
    values (p_operation_id, p_request_id, 'onboarding.rejected', 'rejected', p_reason_code);
end;
$$;

create or replace function public.spec41_complete_self_service_onboarding(
  p_operation_id uuid, p_user_id uuid, p_request_id text
) returns table (
  operation_id uuid, claim_state text, state text, auth_user_id uuid,
  organization_id uuid, organization_slug text, owner_membership_id uuid, failure_code text
) language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare v_operation public.self_service_onboarding_operations%rowtype;
begin
  select * into v_operation from public.self_service_onboarding_operations where id = p_operation_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_operation.auth_user_id <> p_user_id then raise exception 'FORBIDDEN'; end if;
  if v_operation.state = 'completed' then
    return query select v_operation.id, 'replayed', v_operation.state, v_operation.auth_user_id,
      v_operation.organization_id, v_operation.organization_slug, v_operation.owner_membership_id, v_operation.failure_code; return;
  end if;
  if v_operation.state not in ('identity_created', 'organization_created', 'failed_recoverable') then
    raise exception 'ONBOARDING_IN_PROGRESS';
  end if;
  begin
    insert into public.user_profiles (user_id, display_name, locale, time_zone)
      values (p_user_id, v_operation.display_name, v_operation.locale, v_operation.time_zone)
      on conflict (user_id) do nothing;
    if not exists (select 1 from public.user_profiles where user_id = p_user_id) then raise exception 'PROFILE_CONFLICT'; end if;
    insert into public.organizations (
      id, slug, display_name, plan_key, locale, time_zone, creation_source, created_by_user_id
    ) values (
      v_operation.organization_id, v_operation.organization_slug, v_operation.organization_display_name,
      v_operation.plan_key, v_operation.locale, v_operation.time_zone, 'self_service', p_user_id
    ) on conflict (id) do nothing;
    if not exists (select 1 from public.organizations where id = v_operation.organization_id
      and slug = v_operation.organization_slug and creation_source = 'self_service') then raise exception 'SLUG_CONFLICT'; end if;
    insert into public.organization_settings (organization_id) values (v_operation.organization_id) on conflict do nothing;
    insert into public.organization_memberships (id, organization_id, user_id, role, status, joined_at)
      values (v_operation.owner_membership_id, v_operation.organization_id, p_user_id, 'owner', 'active', now()) on conflict (id) do nothing;
    if not exists (select 1 from public.organization_memberships where id = v_operation.owner_membership_id
      and organization_id = v_operation.organization_id and user_id = p_user_id and role = 'owner' and status = 'active') then
      raise exception 'OWNER_CONFLICT';
    end if;
    if not exists (select 1 from public.organization_events where organization_id = v_operation.organization_id
      and event_type = 'organization.created' and metadata @> jsonb_build_object('creation_source', 'self_service')) then
      insert into public.organization_events (
        organization_id, event_type, actor_type, actor_user_id, actor_membership_id,
        target_type, target_id, request_id, metadata
      ) values (
        v_operation.organization_id, 'organization.created', 'member', p_user_id, v_operation.owner_membership_id,
        'organization', v_operation.organization_id, p_request_id,
        jsonb_build_object('creation_source', 'self_service', 'plan_key', v_operation.plan_key,
          'terms_version', v_operation.terms_version)
      );
    end if;
  exception when others then
    update public.self_service_onboarding_operations set state = 'failed_recoverable', failure_code =
      case when sqlerrm like '%SLUG_CONFLICT%' then 'SLUG_CONFLICT' else 'BOOTSTRAP_FAILED' end,
      last_request_id = p_request_id, updated_at = now(), version = version + 1 where id = p_operation_id
      returning * into v_operation;
    insert into public.self_service_onboarding_events (operation_id, request_id, action, outcome, reason_code)
      values (p_operation_id, p_request_id, 'onboarding.failed_recoverable', 'failed', 'BOOTSTRAP_FAILED');
    return query select v_operation.id, 'resumed', v_operation.state, v_operation.auth_user_id,
      v_operation.organization_id, v_operation.organization_slug, v_operation.owner_membership_id, v_operation.failure_code;
    return;
  end;
  update public.self_service_onboarding_operations set state = 'completed', failure_code = null,
    completed_at = now(), last_request_id = p_request_id, updated_at = now(), version = version + 1
    where id = p_operation_id returning * into v_operation;
  insert into public.self_service_onboarding_events (operation_id, request_id, action, outcome)
    values (v_operation.id, p_request_id, 'onboarding.organization_created', 'succeeded'),
      (v_operation.id, p_request_id, 'onboarding.completed', 'succeeded');
  return query select v_operation.id, 'resumed', v_operation.state, v_operation.auth_user_id,
    v_operation.organization_id, v_operation.organization_slug, v_operation.owner_membership_id, v_operation.failure_code;
end;
$$;

create or replace function public.spec41_get_self_service_onboarding(
  p_operation_id uuid, p_user_id uuid
) returns table (
  operation_id uuid, claim_state text, state text, auth_user_id uuid,
  organization_id uuid, organization_slug text, owner_membership_id uuid, failure_code text
) language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  return query select o.id, 'replayed', o.state, o.auth_user_id, o.organization_id,
    o.organization_slug, o.owner_membership_id, o.failure_code
    from public.self_service_onboarding_operations o
    where o.id = p_operation_id and o.auth_user_id = p_user_id;
  if not found then raise exception 'NOT_FOUND'; end if;
end;
$$;


