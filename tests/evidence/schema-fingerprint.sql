with
cols as (select n.nspname||'.'||c.relname||'.'||a.attname||':'||format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull||':'||a.attidentity::text||':'||coalesce(pg_get_expr(ad.adbin,ad.adrelid),'') r
  from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
  left join pg_attrdef ad on ad.adrelid=c.oid and ad.adnum=a.attnum where n.nspname='public' and c.relkind='r'),
cons as (select c.relname||'.'||k.conname||':'||regexp_replace(pg_get_constraintdef(k.oid),'\s+',' ','g') r from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'),
idx as (select regexp_replace(indexdef,'\s+',' ','g') r from pg_indexes where schemaname='public'),
fns as (select n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'||':'||p.prosecdef||':'||p.provolatile::text||':'||coalesce(array_to_string(p.proconfig,','),'')||':'||md5(regexp_replace(p.prosrc,'\s+','','g')) r from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')),
trg as (select regexp_replace(pg_get_triggerdef(t.oid),'\s+',' ','g') r from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal),
pol as (select schemaname||'.'||tablename||'.'||policyname||':'||permissive||':'||cmd||':'||roles::text||':'||regexp_replace(coalesce(qual,'')||'|'||coalesce(with_check,''),'\s+','','g') r from pg_policies where schemaname='public' or (schemaname='storage' and policyname like 'product_images%')),
rls as (select relname||':'||relrowsecurity||':'||relforcerowsecurity r from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r'),
fgr as (select n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||'):'||has_function_privilege('anon',p.oid,'execute')||','||has_function_privilege('authenticated',p.oid,'execute')||','||has_function_privilege('service_role',p.oid,'execute') r from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')),
tgr as (select c.relname||':'||concat_ws(',',has_table_privilege('anon',c.oid,'select'),has_table_privilege('anon',c.oid,'insert'),has_table_privilege('anon',c.oid,'update'),has_table_privilege('anon',c.oid,'delete'),has_table_privilege('authenticated',c.oid,'select'),has_table_privilege('authenticated',c.oid,'insert'),has_table_privilege('authenticated',c.oid,'update'),has_table_privilege('authenticated',c.oid,'delete'),has_table_privilege('service_role',c.oid,'select'),has_table_privilege('service_role',c.oid,'insert'),has_table_privilege('service_role',c.oid,'update'),has_table_privilege('service_role',c.oid,'delete')) r from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r'),
seqs as (select sequencename||':'||data_type r from pg_sequences where schemaname='public'),
vws as (select c.relkind::text||':'||c.relname r from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('v','m')),
typs as (select t.typname||':'||t.typtype::text r from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typtype in ('e','d','c') and not exists (select 1 from pg_class c where c.reltype=t.oid)),
priv as (select c.relname||':'||c.relkind::text r from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private')
select k, n, h from (
select 1 o,'jadval_ustunlari' k, count(*) n, md5(string_agg(r,'#' order by r)) h from cols union all
select 2,'cheklovlar', count(*), md5(string_agg(r,'#' order by r)) from cons union all
select 3,'indekslar', count(*), md5(string_agg(r,'#' order by r)) from idx union all
select 4,'funksiyalar(public+private)', count(*), md5(string_agg(r,'#' order by r)) from fns union all
select 5,'triggerlar', count(*), md5(string_agg(r,'#' order by r)) from trg union all
select 6,'siyosatlar(public+storage)', count(*), md5(string_agg(r,'#' order by r)) from pol union all
select 7,'rls', count(*), md5(string_agg(r,'#' order by r)) from rls union all
select 8,'funksiya_ruxsatlari', count(*), md5(string_agg(r,'#' order by r)) from fgr union all
select 9,'jadval_ruxsatlari', count(*), md5(string_agg(r,'#' order by r)) from tgr union all
select 10,'sequence', count(*), md5(string_agg(r,'#' order by r)) from seqs union all
select 11,'view', count(*), md5(string_agg(r,'#' order by r)) from vws union all
select 12,'tiplar', count(*), md5(string_agg(r,'#' order by r)) from typs union all
select 13,'private_jadval', count(*), md5(string_agg(r,'#' order by r)) from priv union all
select 14,'rollar', count(*), md5(string_agg(key,',' order by key)) from roles union all
select 15,'ruxsatlar', count(*), md5(string_agg(key,',' order by key)) from permissions union all
select 18,'event_trigger', count(*), md5(coalesce(string_agg(e.evtname||':'||e.evtevent||':'||e.evtenabled::text||':'||coalesce(e.evttags::text,'')||':'||e.evtfoid::regproc::text, '#' order by e.evtname), '')) from pg_event_trigger e join pg_proc ep on ep.oid = e.evtfoid where ep.pronamespace = 'public'::regnamespace union all
select 17,'sxema_public', 1, md5(nspowner::regrole::text || ':' || coalesce(array_to_string(nspacl, ' '), '-')) from pg_namespace where nspname = 'public' union all
select 16,'rol_ruxsat', count(*), md5(string_agg(r2,',' order by r2)) from (select r.key||'>'||p.key r2 from role_permissions rp join roles r on r.id=rp.role_id join permissions p on p.id=rp.permission_id) z
) q order by o
