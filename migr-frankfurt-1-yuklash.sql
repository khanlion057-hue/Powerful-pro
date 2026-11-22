-- POWERFUL PRO -> FRANKFURT: 1-QADAM (sinov yuklash)
-- FAQAT YANGI loyihada ishga tushiring: Powerful-pro-eu (marqgbbwqpqohtzjkyyy)
-- Supabase -> Powerful-pro-eu -> SQL Editor -> shu matnni joylang -> Run
-- Eski (Sidney) bazaga hech narsa qilmaydi. Yangi bazadagi jadvallarni tozalab,
-- eski bazadan olingan nusxani yuklaydi. Natijada har jadvaldagi qatorlar soni chiqadi.

create or replace function public.fw_migr_load(p_file text) returns jsonb language plpgsql as $f$
declare d jsonb; t record; cols text; n bigint; k int; res jsonb := '{}'; s record;
begin
  if current_setting('request.jwt.claims', true) is not null and current_setting('request.jwt.claims', true) <> '' then
    raise exception 'faqat SQL Editor dan';
  end if;
  perform set_config('http.timeout_msec', '60000', true);
  d := public.fw_migr_get(p_file)::jsonb;
  if d is null or not (d ? 'app_data') then raise exception 'fayl notogri'; end if;
  -- yuklash vaqtida jadvallarning o'z triggerlari (o'zgarmaslik/qo'riqchi) o'chiriladi; oxirida qayta yoqiladi
  for t in select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' loop
    execute format('alter table public.%I disable trigger user', t.relname);
  end loop;
  execute (select 'truncate ' || string_agg(format('public.%I', relname), ', ') || ' restart identity cascade'
             from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r');
  -- bog'lanish tartibida: avval boshqa jadvalga tayanmaydiganlar, keyin ularga bog'langanlar
  create temp table _done (oid oid primary key) on commit drop;
  loop
    k := 0;
    for t in select c.oid, c.relname from pg_class c
             where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
               and c.oid not in (select oid from _done)
               and not exists (select 1 from pg_constraint f where f.conrelid = c.oid and f.contype = 'f'
                               and f.confrelid <> c.oid and f.confrelid not in (select oid from _done)
                               and f.confrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace))
             order by c.relname loop
      if d ? t.relname then
        select string_agg(quote_ident(attname), ',' order by attnum) into cols
          from pg_attribute where attrelid = t.oid and attnum > 0 and not attisdropped and attgenerated = '';
        execute format('insert into public.%I (%s) overriding system value select %s from jsonb_populate_recordset(null::public.%I, $1)',
                       t.relname, cols, cols, t.relname) using d -> t.relname;
        get diagnostics n = row_count; res := res || jsonb_build_object(t.relname, n);
      end if;
      insert into _done values (t.oid); k := k + 1;
    end loop;
    exit when k = 0;
  end loop;
  if exists (select 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.oid not in (select oid from _done)) then
    raise exception 'aylana bog''lanish: %', (select string_agg(relname, ',') from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.oid not in (select oid from _done));
  end if;
  for t in select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' loop
    execute format('alter table public.%I enable trigger user', t.relname);
  end loop;
  select string_agg(quote_ident(attname), ',' order by attnum) into cols
    from pg_attribute where attrelid = 'auth.users'::regclass and attnum > 0 and not attisdropped and attgenerated = '';
  execute format('insert into auth.users (%s) select %s from jsonb_populate_recordset(null::auth.users, $1) on conflict (id) do nothing',
                 cols, cols) using d -> '__auth_users';
  get diagnostics n = row_count; res := res || jsonb_build_object('__auth_users', n);
  select string_agg(quote_ident(attname), ',' order by attnum) into cols
    from pg_attribute where attrelid = 'auth.identities'::regclass and attnum > 0 and not attisdropped and attgenerated = '';
  execute format('insert into auth.identities (%s) select %s from jsonb_populate_recordset(null::auth.identities, $1) on conflict do nothing',
                 cols, cols) using d -> '__auth_identities';
  get diagnostics n = row_count; res := res || jsonb_build_object('__auth_identities', n);
  for s in select seq.relname sq, tab.relname tb, a.attname col
           from pg_depend dp join pg_class seq on seq.oid = dp.objid and seq.relkind = 'S'
           join pg_class tab on tab.oid = dp.refobjid
           join pg_attribute a on a.attrelid = tab.oid and a.attnum = dp.refobjsubid
           where seq.relnamespace = 'public'::regnamespace loop
    execute format('select setval(%L, greatest(coalesce((select max(%I) from public.%I), 0), 1), (select count(*) > 0 from public.%I))',
                   'public.' || s.sq, s.col, s.tb, s.tb);
  end loop;
  return res;
end $f$;
revoke all on function public.fw_migr_load(text) from public, anon, authenticated;

select public.fw_migr_load('data1.json') as natija;
