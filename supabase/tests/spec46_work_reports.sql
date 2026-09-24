\set ON_ERROR_STOP on
begin;
\ir spec46_browser_fixtures.sql
do $$ begin if current_database() not like 'spec46%' then raise exception 'Disposable spec46 database required'; end if; end; $$;
create function pg_temp.check(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'Assertion failed: %',label; end if; end; $$;
create function pg_temp.fails(statement text,expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then
    if position(expected in SQLERRM)>0 then return; end if; raise;
  end;
  raise exception 'Expected error: %',expected;
end; $$;
set local role service_role;
do $$ declare org uuid:='20000000-0000-4000-8000-000000000001'; owner uuid:='30000000-0000-4000-8000-000000000001';
  tenant uuid:='30000000-0000-4000-8000-000000000010'; person uuid:='30000000-0000-4000-8000-000000000009';
  second_person uuid:='30000000-0000-4000-8000-000000000013'; other_org_person uuid:='30000000-0000-4000-8000-000000000014';
  viewer uuid:='30000000-0000-4000-8000-000000000008'; co_tenant uuid:='30000000-0000-4000-8000-000000000015';
  row jsonb; order_id uuid; ver integer; rver integer; before_revision jsonb; after_revision jsonb; property uuid;
begin
  -- Fixture: submitted order assigned to personal.
  row:=public.spec43_arrangements(org,tenant,'tenant.draft','{"description":"Reparación SPEC46","idempotency_key":"spec46-sql-draft"}','spec46-sql'); order_id:=(row->>'id')::uuid;
  row:=public.spec43_arrangements(org,tenant,'tenant.submit',jsonb_build_object('order_id',order_id),'spec46-sql'); ver:=(row->>'version')::integer;
  row:=public.spec45_arrangements(org,owner,'internal.assign',jsonb_build_object('order_id',order_id,'expected_version',ver,'assigned_personal_membership_id',person),'spec46-assign');
  ver:=(row->>'version')::integer;
  perform pg_temp.check(row->>'status'='in_progress','assigned in progress');
  -- Save draft: order state unchanged, report draft invisible to tenant/viewer.
  before_revision:=public.spec45_arrangements(org,owner,'internal.changes','{}','test');
  row:=public.spec46_arrangements(org,person,'personal.report.save',jsonb_build_object('order_id',order_id,'expected_version',ver,'body','Cambio de grifería'),'spec46-save');
  perform pg_temp.check(row->'work_report'->>'status'='draft' and row->'work_report'->>'body'='Cambio de grifería','draft saved');
  perform pg_temp.check((row->>'version')::integer=ver,'draft save does not bump order version');
  rver:=(row->'work_report'->>'version')::integer;
  row:=public.spec46_arrangements(org,person,'personal.report.save',jsonb_build_object('order_id',order_id,'expected_version',ver,'body','Cambio de grifería'),'spec46-save');
  perform pg_temp.check((row->'work_report'->>'version')::integer=rver,'identical draft is a no-op');
  row:=public.spec45_arrangements(org,tenant,'tenant.detail',jsonb_build_object('order_id',order_id),'test');
  perform pg_temp.check(row->'work_report' is null or row->'work_report'='null'::jsonb,'tenant never sees draft');
  row:=public.spec45_arrangements(org,viewer,'internal.detail',jsonb_build_object('order_id',order_id),'test');
  perform pg_temp.check(row->'work_report' is null or row->'work_report'='null'::jsonb,'viewer never sees draft');
  row:=public.spec45_arrangements(org,owner,'internal.detail',jsonb_build_object('order_id',order_id),'test');
  perform pg_temp.check(row->'work_report'->>'status'='draft' and row->'work_report'->'created_by'->>'id'=person::text,'manager sees draft with author');
  -- Version conflict and invalid text.
  row:=public.spec46_arrangements(org,person,'personal.report.save',jsonb_build_object('order_id',order_id,'expected_version',ver-1,'body','x'),'spec46-save');
  perform pg_temp.check(row->>'error'='VERSION_CONFLICT' and not (row->'current' ? 'body'),'safe order version conflict');
  perform pg_temp.fails(format('select public.spec46_arrangements(%L,%L,%L,%L,%L)',org,person,'personal.report.save',
    jsonb_build_object('order_id',order_id,'expected_version',ver,'body','   '),'test'),'INVALID_REQUEST');
  perform pg_temp.fails(format('select public.spec46_arrangements(%L,%L,%L,%L,%L)',org,person,'personal.report.save',
    jsonb_build_object('order_id',order_id,'expected_version',ver,'body',repeat('a',10001)),'test'),'INVALID_REQUEST');
  -- Only the assigned personal can save; other personal cannot.
  perform pg_temp.fails(format('select public.spec46_arrangements(%L,%L,%L,%L,%L)',org,second_person,'personal.report.save',
    jsonb_build_object('order_id',order_id,'expected_version',ver,'body','intruso'),'test'),'NOT_FOUND');
  perform pg_temp.fails(format('select public.spec46_arrangements(%L,%L,%L,%L,%L)',org,other_org_person,'personal.report.save',
    jsonb_build_object('order_id',order_id,'expected_version',ver,'body','intruso'),'test'),'FORBIDDEN');
  -- Submit requires report_version and an active tenant on the property.
  perform pg_temp.fails(format('select public.spec46_arrangements(%L,%L,%L,%L,%L)',org,person,'personal.report.submit',
    jsonb_build_object('order_id',order_id,'expected_version',ver),'test'),'INVALID_REQUEST');
  row:=public.spec46_arrangements(org,person,'personal.report.submit',
    jsonb_build_object('order_id',order_id,'expected_version',ver,'report_version',rver),'spec46-submit');
  perform pg_temp.check(row->'work_report'->>'status'='submitted' and row->>'status'='solved','submit marks solved+submitted');
  ver:=(row->>'version')::integer; rver:=(row->'work_report'->>'version')::integer;
  perform pg_temp.check(row->'assignee'='null'::jsonb or not (row ? 'assignee'),'submit clears assignment on personal projection');
  after_revision:=public.spec45_arrangements(org,owner,'internal.changes','{}','test');
  perform pg_temp.check(before_revision<>after_revision,'submit bumps internal revision');
  row:=public.spec45_arrangements(org,person,'personal.list','{"limit":25}','test');
  perform pg_temp.check(jsonb_array_length(row->'items')=0,'submitted order leaves personal list');
  perform pg_temp.fails(format('select public.spec46_arrangements(%L,%L,%L,%L,%L)',org,person,'personal.report.save',
    jsonb_build_object('order_id',order_id,'expected_version',ver,'body','post-submit edit'),'test'),'NOT_FOUND');
  -- Generic status cannot archive/reopen/reject a submitted report; legacy solved without report still can.
  perform pg_temp.fails(format('select public.spec45_arrangements(%L,%L,%L,%L,%L)',org,owner,'internal.status',
    jsonb_build_object('order_id',order_id,'expected_version',ver,'status','archived'),'test'),'INVALID_TRANSITION');
  perform pg_temp.fails(format('select public.spec45_arrangements(%L,%L,%L,%L,%L)',org,owner,'internal.status',
    jsonb_build_object('order_id',order_id,'expected_version',ver,'status','open'),'test'),'INVALID_TRANSITION');
  perform pg_temp.fails(format('select public.spec45_arrangements(%L,%L,%L,%L,%L)',org,owner,'internal.status',
    jsonb_build_object('order_id',order_id,'expected_version',ver,'status','in_progress'),'test'),'INVALID_TRANSITION');
  perform pg_temp.fails(format('select public.spec45_arrangements(%L,%L,%L,%L,%L)',org,owner,'internal.reject',
    jsonb_build_object('order_id',order_id,'expected_version',ver),'test'),'INVALID_TRANSITION');
  perform pg_temp.fails(format('select public.spec43_arrangements(%L,%L,%L,%L,%L)',org,owner,'internal.status',
    jsonb_build_object('order_id',order_id,'expected_version',ver,'status','archived'),'test'),'INVALID_TRANSITION');
  -- Tenant projections show the submitted report; wrong-property/co-tenant still only their property.
  row:=public.spec45_arrangements(org,tenant,'tenant.detail',jsonb_build_object('order_id',order_id),'test');
  perform pg_temp.check(row->'work_report'->>'status'='submitted' and row->'work_report'->>'body'='Cambio de grifería','tenant sees submitted report');
  row:=public.spec45_arrangements(org,co_tenant,'tenant.detail',jsonb_build_object('order_id',order_id),'test');
  perform pg_temp.check(row->'work_report'->>'status'='submitted','co-tenant of same property sees submitted report');
  row:=public.spec45_arrangements(org,viewer,'internal.detail',jsonb_build_object('order_id',order_id),'test');
  perform pg_temp.check(row->'work_report'->>'status'='submitted' and row->'work_report'->>'body'='Cambio de grifería','viewer reads submitted report');
  -- Personal and internal cannot accept.
  perform pg_temp.fails(format('select public.spec46_arrangements(%L,%L,%L,%L,%L)',org,person,'inquilino.accept',
    jsonb_build_object('order_id',order_id,'expected_version',ver),'test'),'FORBIDDEN');
  perform pg_temp.fails(format('select public.spec46_arrangements(%L,%L,%L,%L,%L)',org,owner,'inquilino.accept',
    jsonb_build_object('order_id',order_id,'expected_version',ver),'test'),'FORBIDDEN');
  -- Acceptance is atomic and idempotent.
  before_revision:=public.spec45_arrangements(org,owner,'internal.changes','{}','test');
  row:=public.spec46_arrangements(org,tenant,'inquilino.accept',jsonb_build_object('order_id',order_id,'expected_version',ver),'spec46-accept');
  perform pg_temp.check(row->>'status'='archived' and row->'work_report'->>'status'='accepted','accept archives order and report');
  perform pg_temp.check(row->'work_report'->>'accepted_at' is not null,'accept stores accepted_at');
  ver:=(row->>'version')::integer;
  after_revision:=public.spec45_arrangements(org,owner,'internal.changes','{}','test');
  perform pg_temp.check(before_revision<>after_revision,'accept bumps internal revision');
  row:=public.spec46_arrangements(org,tenant,'inquilino.accept',jsonb_build_object('order_id',order_id,'expected_version',ver-1),'spec46-accept-replay');
  perform pg_temp.check(row->>'status'='archived' and row->'work_report'->>'status'='accepted','double accept is idempotent');
  perform pg_temp.check((select count(*)=1 from public.organization_events where organization_id=org and event_type='arrangement.work_report_accepted'
    and target_id=(row->>'id')::uuid),'exactly one acceptance event');
  perform pg_temp.fails(format('select public.spec45_arrangements(%L,%L,%L,%L,%L)',org,owner,'internal.status',
    jsonb_build_object('order_id',order_id,'expected_version',ver,'status','open'),'test'),'INVALID_TRANSITION');
  -- Tenant faltante blocks submit and keeps draft.
  row:=public.spec43_arrangements(org,tenant,'tenant.draft','{"description":"Sin inquilino","idempotency_key":"spec46-no-tenant"}','spec46-sql'); order_id:=(row->>'id')::uuid;
  row:=public.spec43_arrangements(org,tenant,'tenant.submit',jsonb_build_object('order_id',order_id),'spec46-sql'); ver:=(row->>'version')::integer;
  row:=public.spec45_arrangements(org,owner,'internal.assign',jsonb_build_object('order_id',order_id,'expected_version',ver,'assigned_personal_membership_id',person),'spec46-assign');
  ver:=(row->>'version')::integer;
  row:=public.spec46_arrangements(org,person,'personal.report.save',jsonb_build_object('order_id',order_id,'expected_version',ver,'body','Borrador retenido'),'spec46-save');
  rver:=(row->'work_report'->>'version')::integer;
  select o.arrangement_property_id into property from public.arrangement_orders o where o.id=order_id;
  update public.organization_memberships set status='suspended',suspended_at=now(),suspended_by_user_id='10000000-0000-4000-8000-000000000001',suspension_reason_code='test' where organization_id=org and role='inquilino' and arrangement_property_id=property;
  perform pg_temp.fails(format('select public.spec46_arrangements(%L,%L,%L,%L,%L)',org,person,'personal.report.submit',
    jsonb_build_object('order_id',order_id,'expected_version',ver,'report_version',rver),'test'),'TENANT_REQUIRED');
  row:=public.spec45_arrangements(org,owner,'internal.detail',jsonb_build_object('order_id',order_id),'test');
  perform pg_temp.check(row->>'status'='in_progress' and row->'work_report'->>'status'='draft','failed submit keeps draft and order');
  update public.organization_memberships set status='active',suspended_at=null,suspended_by_user_id=null,suspension_reason_code=null where organization_id=org and role='inquilino' and arrangement_property_id=property;
  -- Legacy order without property cannot enter the flow.
  perform pg_temp.fails(format('select public.spec46_arrangements(%L,%L,%L,%L,%L)',org,person,'personal.report.save',
    jsonb_build_object('order_id','50000000-0000-4000-8000-000000000001','expected_version',1,'body','legacy'),'test'),'NOT_FOUND');
  -- Grants and privacy.
  perform pg_temp.check(not has_table_privilege('authenticated','public.arrangement_work_reports','SELECT'),'reports private');
  perform pg_temp.check(not has_table_privilege('service_role','public.arrangement_work_reports','SELECT'),'reports RPC-only');
  perform pg_temp.check(not has_function_privilege('authenticated','public.spec46_arrangements(uuid,uuid,text,jsonb,text)','EXECUTE'),'spec46 RPC private');
  perform pg_temp.check(not has_function_privilege('service_role','public.spec46_require_actor(uuid,uuid,text)','EXECUTE'),'require_actor private');
  perform pg_temp.check(not exists(select 1 from public.organization_events where metadata::text like '%Cambio de grifería%'),'report body absent from audit');
end; $$;
reset role;
-- Failure after writing the report must roll back report, order, and revision together.
create function pg_temp.fail_audit() returns trigger language plpgsql as $$ begin if NEW.request_id='spec46-fail-audit' then raise exception 'AUDIT_FAILED'; end if; return NEW; end; $$;
create trigger fail_spec46_audit before insert on public.organization_events for each row execute function pg_temp.fail_audit();
do $$ declare org uuid:='20000000-0000-4000-8000-000000000001'; person uuid:='30000000-0000-4000-8000-000000000009';
  owner uuid:='30000000-0000-4000-8000-000000000001';
  o public.arrangement_orders; r public.arrangement_work_reports; before_revision jsonb;
begin
  select * into o from public.arrangement_orders where idempotency_key='spec46-no-tenant';
  select * into r from public.arrangement_work_reports where order_id=o.id;
  before_revision:=public.spec45_arrangements(org,owner,'internal.changes','{}','test');
  perform pg_temp.fails(format('select public.spec46_arrangements(%L,%L,%L,%L,%L)',org,person,'personal.report.submit',
    jsonb_build_object('order_id',o.id,'expected_version',o.version,'report_version',r.version),'spec46-fail-audit'),'AUDIT_FAILED');
  perform pg_temp.check((select version=o.version and status=o.status from public.arrangement_orders where id=o.id),'audit failure rolls back order');
  perform pg_temp.check((select version=r.version and status='draft' from public.arrangement_work_reports where id=r.id),'audit failure rolls back report');
end; $$;
select 'SPEC-46 SQL assertions passed';
rollback;
