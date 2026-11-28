-- 56-MIGRATSIYA: KONSIGNATSIYA (SOTISH UCHUN OLINGAN TOVAR) - TA'MINOTCHI VALYUTASIDA ANIQ NARX VA QARZ
-- Egasi: "u menga so'mda berdi - men unga so'm qaytarishim kerak". Ta'minotchi so'mda bergan tovar sotilganda qarz
-- AYNAN bergan so'm narxi x sotilgan son bo'yicha yoziladi (kurs o'zgarsa ham). $ da bergan ta'minotchi - $ da (avvalgidek).
--  1) batches.goods_uzs - ta'minotchi bergan so'm narxi (1 dona).
--  2) batch_acc_uzs: belgilashda aniq so'm qiymati qabul qilinadi: [{"id":"<localId>","costUzs":..,"goodsUzs":..}]
--     (eski shakl - ["<localId>"] - avvalgidek). Kurs yangilanganda goods_usd ham so'mdan qayta hisoblanadi.
--  3) _stock_fifo_out: konsignatsiya qismi uchun aniq so'm ('uzs') ham qaytariladi.
--  4) _fw_apply_side_debts: ta'minotchi so'mda bo'lsa va hamma qismlarda aniq so'm bo'lsa - qarz aniq so'mda.
--  5) _supp_debt_move: 'fw.exact_uzs' berilgan bo'lsa - so'mdagi qarz kurs bilan emas, aynan shu summa bilan.
-- Qayta ishga tushirish xavfsiz. Faqat ASCII.

alter table public.batches add column if not exists goods_uzs numeric;

-- 5) _supp_debt_move - aniq so'm
do $m$
declare d text; n text;
begin
  d := pg_get_functiondef('public._supp_debt_move'::regproc);
  if position('fw.exact_uzs' in d) > 0 then raise notice '56: _supp_debt_move - allaqachon'; return; end if;
  n := regexp_replace(d, '(v_d_uzs := round\(p_delta \* v_rate, 0\);)',
    E'\\1\n    -- 56: aniq so''m (konsignatsiya: ta''minotchi bergan so''m narxi)\n    v_g := current_setting(''fw.exact_uzs'', true);\n    if coalesce(v_g, '''') <> '''' then\n      perform set_config(''fw.exact_uzs'', '''', true);\n      if public._fw_num(v_g) > 0 then v_d_uzs := sign(p_delta) * round(public._fw_num(v_g), 0); end if;\n    end if;');
  if n = d then raise exception '56: _supp_debt_move naqshi topilmadi'; end if;
  execute n;
end $m$;

-- 3) _stock_fifo_out - konsignatsiya qismida aniq so'm
do $m$
declare d text; n text;
begin
  d := pg_get_functiondef('public._stock_fifo_out'::regproc);
  if position('goods_uzs' in d) > 0 then raise notice '56: _stock_fifo_out - allaqachon'; return; end if;
  n := regexp_replace(d, 'select id, local_id, qty, sold, cost_usd, goods_usd, consignment, supp_id, from_branch from public\.batches',
    'select id, local_id, qty, sold, cost_usd, goods_usd, goods_uzs, consignment, supp_id, from_branch from public.batches');
  n := regexp_replace(n, $r$jsonb_build_object\('supp', b\.supp_id, 'usd', v_take \* coalesce\(b\.goods_usd, b\.cost_usd\), 'kind', 'consignment'\)$r$,
    $r$(jsonb_build_object('supp', b.supp_id, 'usd', v_take * coalesce(b.goods_usd, b.cost_usd), 'kind', 'consignment') || case when b.goods_uzs is not null then jsonb_build_object('uzs', v_take * b.goods_uzs) else '{}'::jsonb end)$r$);
  if position('goods_uzs, consignment' in n) = 0 or position('''uzs'', v_take * b.goods_uzs' in n) = 0 then
    raise exception '56: _stock_fifo_out naqshi topilmadi';
  end if;
  execute n;
end $m$;

-- 4) _fw_apply_side_debts - so'mdagi ta'minotchiga aniq so'm
create or replace function public._fw_apply_side_debts(p_filial text, p_side jsonb, p_bd numeric, p_op_prefix text,
  p_group_key text default null, p_ref_type text default null, p_ref_id text default null,
  p_staff_id bigint default null, p_staff_name text default null)
 returns bigint[]
 language plpgsql
 set search_path = ''
as $$
declare
  r record;
  v_supps bigint[] := '{}';
  v_cur text;
begin
  for r in
    select (e->>'supp')::bigint as supp, e->>'kind' as kind, sum(public._fw_num(e->>'usd')) as usd,
           sum(public._fw_num(e->>'uzs')) as uzs, bool_and(e ? 'uzs') as all_uzs
      from jsonb_array_elements(coalesce(p_side, '[]'::jsonb)) e
     group by 1, 2 order by 1, 2
  loop
    continue when r.usd = 0;
    -- 56: so'mda bergan ta'minotchi - qarz aynan bergan so'm narxida (kurs bo'yicha emas)
    if r.all_uzs and coalesce(r.uzs, 0) > 0 then
      select currency into v_cur from public.supplier_balances where filial = p_filial and supplier_local_id = r.supp;
      if v_cur = 'UZS' then perform set_config('fw.exact_uzs', r.uzs::text, true); end if;
    end if;
    perform public._supp_debt_move(p_filial, r.supp, r.usd, 0, 'strict', r.kind, p_op_prefix || ':' || r.kind || ':' || r.supp,
      p_group_key, p_ref_type, p_ref_id,
      case r.kind when 'consignment' then 'Konsignatsiya: sotilgan qism' else 'To''g''ridan-to''g''ri savdo (ta''minotchidan)' end,
      p_staff_id, p_staff_name);
    perform set_config('fw.exact_uzs', '', true);
    v_supps := v_supps || r.supp;
  end loop;
  if coalesce(p_bd, 0) > 0 then perform public._branch_debt_add(p_filial, p_bd); end if;
  return v_supps;
end;
$$;
revoke all on function public._fw_apply_side_debts(text, jsonb, numeric, text, text, text, text, bigint, text) from public, anon, authenticated;

-- 2) batch_acc_uzs - aniq so'm qiymatlari bilan belgilash; kurs yangilanganda goods_usd ham
create or replace function public.batch_acc_uzs(p_filial text, p_mark jsonb default '[]'::jsonb, p_reprice boolean default false)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  v_rate numeric;
  v_marked integer := 0;
  v_repriced integer := 0;
  v_bids bigint[] := '{}';
  v_ids bigint[];
begin
  if coalesce(p_filial, '') !~ '^[a-z0-9_]{1,40}$' then raise exception 'LEDGER: filial noto''g''ri' using errcode = 'P0001'; end if;
  select public._fw_num(data->'settings'->>'usdUzs') into v_rate from public.app_data where id = 'main';
  perform set_config('fw.stock_move', '1', true);
  if jsonb_typeof(p_mark) = 'array' and jsonb_array_length(p_mark) > 0 then
    if jsonb_array_length(p_mark) > 500 then raise exception 'LEDGER: juda ko''p partiya' using errcode = 'P0001'; end if;
    -- eski shakl: ["<localId>", ...] - so'm qiymati $ x kirim kursidan (faqat hali belgilanmaganlar)
    with u as (
      update public.batches b
         set cost_uzs = round(b.cost_usd * coalesce(nullif(b.rate_usd_uzs, 0), v_rate), 2)
       where b.filial = p_filial and b.local_id in (select e #>> '{}' from jsonb_array_elements(p_mark) e where jsonb_typeof(e) = 'string')
         and b.cost_uzs is null and coalesce(nullif(b.rate_usd_uzs, 0), v_rate, 0) > 0
      returning b.id)
    select count(*), coalesce(array_agg(id), '{}') into v_marked, v_ids from u;
    v_bids := v_bids || v_ids;
    -- 56: yangi shakl: [{"id":"<localId>","costUzs":..,"goodsUzs":..}] - ta'minotchi bergan ANIQ so'm narxi
    with m as (
      select e->>'id' as lid,
             nullif(greatest(public._fw_num(e->>'costUzs'), 0), 0) as cu,
             nullif(greatest(public._fw_num(e->>'goodsUzs'), 0), 0) as gu
        from jsonb_array_elements(p_mark) e where jsonb_typeof(e) = 'object'
    ), u as (
      update public.batches b
         set cost_uzs = coalesce(m.cu, b.cost_uzs), goods_uzs = coalesce(m.gu, b.goods_uzs),
             cost_usd = case when m.cu is not null and coalesce(v_rate, 0) >= 100 then round(m.cu / v_rate, 6) else b.cost_usd end,
             goods_usd = case when m.gu is not null and coalesce(v_rate, 0) >= 100 then round(m.gu / v_rate, 6) else b.goods_usd end,
             updated_at = now()
        from m
       where b.filial = p_filial and b.local_id = m.lid and (m.cu is not null or m.gu is not null)
         and m.cu is not null and m.cu <= 100000000000 and coalesce(m.gu, 0) <= 100000000000
      returning b.id)
    select coalesce(array_agg(id), '{}') into v_ids from u;
    v_marked := v_marked + coalesce(array_length(v_ids, 1), 0);
    v_bids := v_bids || v_ids;
  end if;
  if p_reprice then
    if coalesce(v_rate, 0) < 100 or v_rate > 1000000 then
      perform set_config('fw.stock_move', '', true);
      raise exception 'LEDGER: bugungi kurs noto''g''ri' using errcode = 'P0001';
    end if;
    with u as (
      update public.batches b
         set cost_usd = round(b.cost_uzs / v_rate, 6),
             goods_usd = case when b.goods_uzs is not null then round(b.goods_uzs / v_rate, 6) else b.goods_usd end,
             updated_at = now()
       where b.filial = p_filial and b.cost_uzs is not null and b.status in ('active', 'transit') and b.qty > b.sold
         and (abs(b.cost_usd - round(b.cost_uzs / v_rate, 6)) > 0.0000005
              or (b.goods_uzs is not null and abs(coalesce(b.goods_usd, 0) - round(b.goods_uzs / v_rate, 6)) > 0.0000005))
      returning b.id)
    select count(*), coalesce(array_agg(id), '{}') into v_repriced, v_ids from u;
    v_bids := v_bids || v_ids;
  end if;
  perform set_config('fw.stock_move', '', true);
  return jsonb_build_object('ok', true, 'marked', v_marked, 'repriced', v_repriced, 'rate', v_rate,
    'authority', public._fw_authority(p_filial, null, null, v_bids));
end;
$$;
revoke all on function public.batch_acc_uzs(text, jsonb, boolean) from public, anon, authenticated;

select '56: tayyor' as natija,
  (select count(*) from information_schema.columns where table_name = 'batches' and column_name = 'goods_uzs') as goods_uzs_ustuni,
  position('fw.exact_uzs' in pg_get_functiondef('public._supp_debt_move'::regproc)) > 0 as qarz_aniq_som,
  position('goods_uzs' in pg_get_functiondef('public._stock_fifo_out'::regproc)) > 0 as fifo_som;
