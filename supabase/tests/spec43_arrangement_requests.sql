\set ON_ERROR_STOP on
begin;
\ir spec43_browser_fixtures.sql
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'Assertion: %',message; end if; end; $$;
create function pg_temp.reject(command text,expected text) returns void language plpgsql as $$ begin
  begin execute command; exception when others then if position(expected in sqlerrm)>0 then return; end if; raise; end;
  raise exception 'Expected rejection: %',expected;
end; $$;
-- Browser roles cannot access tables or RPCs.
select pg_temp.assert(not has_table_privilege('authenticated','public.arrangement_orders','select'),'browser orders denied');
select pg_temp.assert(not has_table_privilege('anon','public.arrangement_order_assets','select'),'browser assets denied');
select pg_temp.assert(not has_function_privilege('authenticated','public.spec43_arrangements(uuid,uuid,text,jsonb,text)','execute'),'browser RPC denied');
set local role service_role;
do $$
declare
 org uuid:='20000000-0000-4000-8000-000000000001'; own uuid:='30000000-0000-4000-8000-000000000001';
 tenant uuid:='30000000-0000-4000-8000-000000000005'; roommate uuid:='30000000-0000-4000-8000-000000000006';
 other uuid:='30000000-0000-4000-8000-000000000007'; viewer uuid:='30000000-0000-4000-8000-000000000009';
 d jsonb; receipt jsonb; result jsonb; sess jsonb; context jsonb; asset jsonb; objects jsonb;
begin
 d:=public.spec43_arrangements(org,tenant,'tenant.draft','{"description":"  Pérdida en cocina  ","idempotency_key":"request-test-1"}','spec43');
 perform pg_temp.assert(d=public.spec43_arrangements(org,tenant,'tenant.draft','{"description":"Pérdida en cocina","idempotency_key":"request-test-1"}','spec43'),'draft idempotency');
 perform pg_temp.reject(format('select public.spec43_arrangements(%L,%L,%L,%L,%L)',org,tenant,'tenant.draft','{"description":"changed","idempotency_key":"request-test-1"}','spec43'),'IDEMPOTENCY_CONFLICT');
 result:=public.spec43_arrangements(org,roommate,'tenant.list','{"limit":25}','spec43');
 perform pg_temp.assert(jsonb_array_length(result->'items')=0,'draft hidden');
 perform pg_temp.reject(format('select public.spec43_arrangements(%L,%L,%L,%L,%L)',org,roommate,'tenant.submit',jsonb_build_object('order_id',d->>'id'),'spec43'),'NOT_FOUND');
 receipt:=public.spec43_arrangements(org,tenant,'tenant.submit',jsonb_build_object('order_id',d->>'id'),'spec43');
 perform pg_temp.assert(receipt->>'status'='open' and receipt->>'description'='Pérdida en cocina','submitted trimmed description and initial status');
 perform pg_temp.assert(receipt=public.spec43_arrangements(org,tenant,'tenant.submit',jsonb_build_object('order_id',d->>'id'),'spec43'),'submit idempotency');
 result:=public.spec43_arrangements(org,roommate,'tenant.list','{"limit":1}','spec43');
 perform pg_temp.assert(result->'items'->0->>'created_by_you'='false' and not(result->'items'->0 ? 'created_by_membership_id'),'roommate history without identity');
 result:=public.spec43_arrangements(org,other,'tenant.list','{"limit":25}','spec43');
 perform pg_temp.assert(jsonb_array_length(result->'items')=0,'different property hidden');
 perform pg_temp.reject(format('select public.spec43_arrangements(%L,%L,%L,%L,%L)',org,viewer,'internal.status',jsonb_build_object('order_id',d->>'id','status','solved','expected_version',2),'spec43'),'FORBIDDEN');
 foreach objects in array array['"in_progress"'::jsonb,'"solved"'::jsonb,'"archived"'::jsonb,'"open"'::jsonb] loop
   receipt:=public.spec43_arrangements(org,own,'internal.status',jsonb_build_object('order_id',d->>'id','status',objects,'expected_version',receipt->'version'),'spec43');
 end loop;
 perform pg_temp.assert(receipt->>'status'='open' and receipt->>'version'='6','all transitions including reopen');
 result:=public.spec43_arrangements(org,own,'internal.status',jsonb_build_object('order_id',d->>'id','status','solved','expected_version',2),'spec43');
 perform pg_temp.assert(result->>'error'='VERSION_CONFLICT' and result->'current'->>'version'='6','conflict has current version');
 result:=public.spec43_arrangements(org,viewer,'internal.list','{"limit":25}','spec43');
 perform pg_temp.assert(jsonb_array_length(result->'items')=2 and result->'items'->1->>'legacy'='true' and result->'items'->1->>'submitted_at' is null,'legacy last, no invented date');
 d:=public.spec43_arrangements(org,tenant,'tenant.draft','{"description":"Foto de prueba","idempotency_key":"request-test-2"}','spec43');
 sess:=public.spec43_arrangements(org,tenant,'tenant.session_initialize',jsonb_build_object('order_id',d->>'id','idempotency_key','upload-test-1','descriptors',jsonb_build_array(jsonb_build_object('receiver_key','arrangement.image','declared_mime','image/png','declared_bytes',68,'original_filename','test.png','checksum_sha256',repeat('a',64)))),'spec43');
 context:=public.spec43_arrangements(org,tenant,'tenant.session_context',jsonb_build_object('order_id',d->>'id','session_id',sess->>'id'),'spec43');
 asset:=context->'assets'->0;
 perform pg_temp.reject(format('select public.spec43_arrangements(%L,%L,%L,%L,%L)',org,tenant,'tenant.submit',jsonb_build_object('order_id',d->>'id'),'spec43'),'UPLOAD_INCOMPLETE');
 objects:=jsonb_build_array(jsonb_build_object('upload_intent_id',context->'intents'->0->>'id','bucket_name',asset->>'bucket_name','object_path',asset->>'object_path','provider_bytes',68,'provider_mime','image/png','detected_mime','image/png','checksum_sha256',repeat('a',64)));
 perform public.spec43_arrangements(org,tenant,'tenant.session_finalize',jsonb_build_object('order_id',d->>'id','session_id',sess->>'id','expected_version',1,'objects',objects),'spec43');
 perform public.spec43_arrangements(org,tenant,'tenant.session_finalize',jsonb_build_object('order_id',d->>'id','session_id',sess->>'id','expected_version',1,'objects',objects),'spec43');
 receipt:=public.spec43_arrangements(org,tenant,'tenant.submit',jsonb_build_object('order_id',d->>'id'),'spec43');
 perform pg_temp.assert(jsonb_array_length(receipt->'assets')=1,'verified asset attached');
 result:=public.spec43_arrangements(org,viewer,'internal.view',jsonb_build_object('order_id',d->>'id','asset_id',asset->>'id'),'spec43');
 perform pg_temp.assert(result->>'state'='attached','viewer download allowed');
 perform pg_temp.reject(format('select public.spec43_arrangements(%L,%L,%L,%L,%L)',org,other,'tenant.view',jsonb_build_object('order_id',d->>'id','asset_id',asset->>'id'),'spec43'),'NOT_FOUND');
 perform pg_temp.reject(format('select public.spec43_arrangements(%L,%L,%L,%L,%L)','20000000-0000-4000-8000-000000000002',tenant,'tenant.list','{"limit":25}','spec43'),'FORBIDDEN');
end; $$;
reset role;
select pg_temp.assert((select count(*)=2 from public.organization_events where event_type='arrangement.order_submitted'),'exactly one event per submit');
select pg_temp.assert((select count(*)=4 from public.organization_events where event_type='arrangement.order_status_changed'),'one event per transition');
select pg_temp.assert((select count(*)=1 and sum(quantity)=68 from public.usage_events where metric_key='storage.bytes'),'no duplicate asset usage');
select pg_temp.assert((select consumed=68 and reserved=0 from public.quota_snapshots where organization_id='20000000-0000-4000-8000-000000000001' and metric_key='storage.bytes'),'reservation finalized exactly once');
select pg_temp.assert((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid in ('public.arrangement_orders'::regclass,'public.arrangement_order_assets'::regclass)),'forced RLS');
-- Expiration/cleanup runs with actual quota accounting and durable receipts.
do $$
declare org uuid:='20000000-0000-4000-8000-000000000001'; tenant uuid:='30000000-0000-4000-8000-000000000005';
 d jsonb; s jsonb; c jsonb; asset uuid; result jsonb; objects jsonb; before_consumed bigint;
begin
 d:=public.spec43_arrangements(org,tenant,'tenant.draft','{"description":"Orphan media","idempotency_key":"cleanup-request"}','spec43');
 s:=public.spec43_arrangements(org,tenant,'tenant.session_initialize',jsonb_build_object('order_id',d->>'id','idempotency_key','cleanup-session','descriptors',jsonb_build_array(jsonb_build_object('receiver_key','arrangement.image','declared_mime','image/png','declared_bytes',68,'original_filename','orphan.png','checksum_sha256',repeat('b',64)))),'spec43');
 c:=public.spec43_arrangements(org,tenant,'tenant.session_context',jsonb_build_object('order_id',d->>'id','session_id',s->>'id'),'spec43'); asset:=(c->'assets'->0->>'id')::uuid;
 objects:=jsonb_build_array(jsonb_build_object('upload_intent_id',c->'intents'->0->>'id','bucket_name',c->'assets'->0->>'bucket_name','object_path',c->'assets'->0->>'object_path','provider_bytes',68,'provider_mime','image/png','detected_mime','image/png','checksum_sha256',repeat('b',64)));
 perform pg_temp.reject(format('select public.spec43_arrangements(%L,%L,%L,%L,%L)',org,tenant,'tenant.session_finalize',jsonb_build_object('order_id',d->>'id','session_id',s->>'id','expected_version',1,'objects',jsonb_set(objects,'{0,detected_mime}','"text/html"')),'spec43'),'UPLOAD_INVALID');
 perform public.spec43_arrangements(org,tenant,'tenant.session_finalize',jsonb_build_object('order_id',d->>'id','session_id',s->>'id','expected_version',1,'objects',objects),'spec43');
 perform public.spec43_arrangements(org,tenant,'tenant.session_revoke',jsonb_build_object('order_id',d->>'id','session_id',s->>'id'),'spec43');
 perform pg_temp.reject(format('select public.spec43_arrangements(%L,%L,%L,%L,%L)',org,tenant,'tenant.submit',jsonb_build_object('order_id',d->>'id'),'spec43'),'UPLOAD_INCOMPLETE');
 perform pg_temp.reject(format('select public.spec43_arrangements(%L,%L,%L,%L,%L)',org,tenant,'tenant.session_context',jsonb_build_object('order_id',d->>'id','session_id',s->>'id'),'spec43'),'NOT_FOUND');
 update public.media_assets set created_at=now()-interval '25 hours',legal_hold_reference='test-hold' where id=asset;
 result:=public.spec43_cleanup_assets(org,'claim',null,null,'spec43');
 perform pg_temp.assert(jsonb_array_length(result)=0,'hold blocks physical cleanup');
 update public.media_assets set legal_hold_reference=null where id=asset;
 result:=public.spec43_cleanup_assets(org,'claim',null,null,'spec43');
 perform pg_temp.assert(jsonb_array_length(result)=1 and result->0->>'id'=asset::text,'only unassociated revoked media claimed');
 perform public.spec43_cleanup_assets(org,'complete',asset,'failed','spec43');
 result:=public.spec43_cleanup_assets(org,'claim',null,null,'spec43');
 perform pg_temp.assert(jsonb_array_length(result)=1,'failed deletion can retry');
 select consumed into before_consumed from public.quota_snapshots where organization_id=org and metric_key='storage.bytes';
 perform public.spec43_cleanup_assets(org,'complete',asset,'not_found_reconciled','spec43');
 perform public.spec43_cleanup_assets(org,'complete',asset,'not_found_reconciled','spec43');
 perform pg_temp.assert((select consumed=before_consumed-68 from public.quota_snapshots where organization_id=org and metric_key='storage.bytes'),'cleanup decrements bytes once');
 perform pg_temp.assert(exists(select from public.asset_deletion_receipts where asset_id=asset and storage_result='not_found_reconciled'),'durable deletion evidence');
 d:=public.spec43_arrangements(org,tenant,'tenant.draft','{"description":"Cancelled draft","idempotency_key":"cancel-request"}','spec43');
 result:=public.spec43_arrangements(org,tenant,'tenant.cancel',jsonb_build_object('order_id',d->>'id'),'spec43');
 perform pg_temp.assert(result->>'submission_state'='expired','cancel expires draft atomically');
 perform pg_temp.reject(format('select public.spec43_arrangements(%L,%L,%L,%L,%L)',org,tenant,'tenant.submit',jsonb_build_object('order_id',d->>'id'),'spec43'),'NOT_FOUND');
 -- An unattached pending batch keeps its reservation until the bytes can no longer arrive.
 d:=public.spec43_arrangements(org,tenant,'tenant.draft','{"description":"Expired draft","idempotency_key":"expired-request"}','spec43');
 s:=public.spec43_arrangements(org,tenant,'tenant.session_initialize',jsonb_build_object('order_id',d->>'id','idempotency_key','expired-session','descriptors',jsonb_build_array(jsonb_build_object('receiver_key','arrangement.image','declared_mime','image/png','declared_bytes',68,'original_filename','pending.png','checksum_sha256',repeat('b',64)))),'spec43');
 c:=public.spec43_arrangements(org,tenant,'tenant.session_context',jsonb_build_object('order_id',d->>'id','session_id',s->>'id'),'spec43'); asset:=(c->'assets'->0->>'id')::uuid;
 update public.arrangement_orders set created_at=now()-interval '25 hours' where id=(d->>'id')::uuid;
 update public.media_assets set created_at=now()-interval '25 hours' where id=asset;
 result:=public.spec43_cleanup_assets(org,'claim',null,null,'spec43');
 perform pg_temp.assert(jsonb_array_length(result)=1,'expired draft cleanup');
 perform public.spec43_cleanup_assets(org,'complete',asset,'deleted','spec43');
 perform pg_temp.assert((select reserved=0 from public.quota_snapshots where organization_id=org and metric_key='storage.bytes'),'expired reservation released');
 perform pg_temp.assert((select count(*)=1 from public.media_assets where state='attached'),'submitted attachment retained');
end; $$;
-- A rejected audit insert must roll back the status/version change too.
create function pg_temp.reject_status_audit() returns trigger language plpgsql as $$ begin if new.event_type='arrangement.order_status_changed' then raise exception 'AUDIT_TEST_FAILURE'; end if; return new; end; $$;
create trigger spec43_test_audit before insert on public.organization_events for each row execute function pg_temp.reject_status_audit();
do $$ declare o public.arrangement_orders; begin
 select * into o from public.arrangement_orders where submission_state='submitted' order by submitted_at limit 1;
 perform pg_temp.reject(format('select public.spec43_arrangements(%L,%L,%L,%L,%L)',o.organization_id,'30000000-0000-4000-8000-000000000008','internal.status',jsonb_build_object('order_id',o.id,'status','solved','expected_version',o.version),'spec43'),'AUDIT_TEST_FAILURE');
 perform pg_temp.assert((select status=o.status and version=o.version from public.arrangement_orders where id=o.id),'audit failure rolls back state');
end; $$;

rollback;
