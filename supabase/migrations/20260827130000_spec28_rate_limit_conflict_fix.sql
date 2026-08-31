-- SPEC-28 follow-up: disambiguate PL/pgSQL output parameter policy_key from
-- the rate-limit bucket columns used by ON CONFLICT.

create or replace function public.spec28_consume_organization_rate_limit(
  p_organization_id uuid, p_policy_key text, p_subject_hash bytea,
  p_window_seconds integer, p_limit integer, p_cost integer, p_now timestamptz
) returns table (allowed boolean, remaining integer, retry_after_seconds integer, policy_key text)
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_window_start timestamptz;
  v_consumed integer;
begin
  if p_organization_id is null or p_window_seconds not between 1 and 86400
    or p_limit < 1 or p_cost < 1 or p_cost > p_limit or octet_length(p_subject_hash) <> 32 then
    raise exception 'INVALID_RATE_LIMIT_INPUT';
  end if;
  perform 1 from public.organizations where id = p_organization_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  v_window_start := to_timestamp(
    floor(extract(epoch from p_now) / p_window_seconds) * p_window_seconds
  );
  insert into public.organization_rate_limit_buckets (
    organization_id, policy_key, subject_hash, window_started_at,
    window_seconds, consumed, expires_at
  ) values (
    p_organization_id, p_policy_key, p_subject_hash, v_window_start,
    p_window_seconds, p_cost, v_window_start + make_interval(secs => p_window_seconds)
  ) on conflict on constraint organization_rate_limit_buckets_pkey
  do update set consumed = public.organization_rate_limit_buckets.consumed + excluded.consumed,
    updated_at = p_now
  where public.organization_rate_limit_buckets.consumed + excluded.consumed <= p_limit
  returning consumed into v_consumed;
  if v_consumed is null then
    select b.consumed into v_consumed from public.organization_rate_limit_buckets b
    where b.organization_id = p_organization_id and b.policy_key = p_policy_key
      and b.subject_hash = p_subject_hash and b.window_started_at = v_window_start;
    return query select false, greatest(0, p_limit - v_consumed),
      greatest(1, ceil(extract(epoch from (v_window_start + make_interval(secs => p_window_seconds) - p_now)))::integer),
      p_policy_key;
  else
    return query select true, greatest(0, p_limit - v_consumed), 0, p_policy_key;
  end if;
end;
$$;

create or replace function public.spec28_consume_platform_rate_limit(
  p_policy_key text, p_subject_hash bytea, p_window_seconds integer,
  p_limit integer, p_cost integer, p_now timestamptz
) returns table (allowed boolean, remaining integer, retry_after_seconds integer, policy_key text)
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_window_start timestamptz;
  v_consumed integer;
begin
  if p_window_seconds not between 1 and 86400 or p_limit < 1 or p_cost < 1
    or p_cost > p_limit or octet_length(p_subject_hash) <> 32 then
    raise exception 'INVALID_RATE_LIMIT_INPUT';
  end if;
  v_window_start := to_timestamp(
    floor(extract(epoch from p_now) / p_window_seconds) * p_window_seconds
  );
  insert into public.platform_rate_limit_buckets (
    policy_key, subject_hash, window_started_at, window_seconds, consumed, expires_at
  ) values (
    p_policy_key, p_subject_hash, v_window_start, p_window_seconds, p_cost,
    v_window_start + make_interval(secs => p_window_seconds)
  ) on conflict on constraint platform_rate_limit_buckets_pkey
  do update set consumed = public.platform_rate_limit_buckets.consumed + excluded.consumed,
    updated_at = p_now
  where public.platform_rate_limit_buckets.consumed + excluded.consumed <= p_limit
  returning consumed into v_consumed;
  if v_consumed is null then
    select b.consumed into v_consumed from public.platform_rate_limit_buckets b
    where b.policy_key = p_policy_key and b.subject_hash = p_subject_hash
      and b.window_started_at = v_window_start;
    return query select false, greatest(0, p_limit - v_consumed),
      greatest(1, ceil(extract(epoch from (v_window_start + make_interval(secs => p_window_seconds) - p_now)))::integer),
      p_policy_key;
  else
    return query select true, greatest(0, p_limit - v_consumed), 0, p_policy_key;
  end if;
end;
$$;

