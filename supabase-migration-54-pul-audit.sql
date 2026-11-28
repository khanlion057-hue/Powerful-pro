-- ============================================================================================================
-- 54-MIGRATSIYA (v25.6.10): PUL AUDITI TUZATISHLARI. Faqat ASCII belgilar (SQL Editor kodlashi buzmasin).
-- Takror ishga tushirish xavfsiz. 51 qo'llangan bo'lishi kerak.
--  1) Qarzga sotilgan va keyin to'langan savdo qaytarilsa/o'chirilsa - pul yo'qolmaydi: to'langan qism mijoz HAQIGA.
--  2) Mijoz haqidan to'langan savdo qaytarilsa - summa haqqa qaytadi.
--  3) Konsignatsiya partiyasini tahrirlash ta'minotchi qarzini ikki marta yozmaydi.
--  4) Sotilgan partiyani o'chirish serverda ham rad etiladi.
--  5) $5 dan arzon mahsulot: chegirma chegarasi sentlarda (sotuvchi ro'yxat narxida sota oladi).
--  6) Savdo narxi tahririda foyda qayta hisoblanadi; tahrirda kurs - savdo kunidagi.
--  7) 51 SQL Editor'da noto'g'ri kodlash bilan joylangan ((Qaytarish + buzilgan tire belgisi)) - o'chirish/qaytarish funksiyalari toza matn bilan.
-- ============================================================================================================
begin;
create or replace function public._fw_debt_back(
  p_filial text, p_cust bigint, p_uzs numeric, p_kind text, p_key text, p_ref_id text, p_note text,
  p_staff_id bigint default null, p_staff_name text default null)
 returns numeric
 language plpgsql
 set search_path = ''
as $$
declare
  v_bal numeric;
  v_dec numeric;
  v_cr numeric;
begin
  if p_cust is null or coalesce(p_uzs, 0) <= 0 then return 0; end if;
  select debt into v_bal from public.customer_balances where filial = p_filial and customer_local_id = p_cust for update;
  v_dec := least(round(p_uzs, 2), greatest(coalesce(v_bal, 0), 0));
  if v_dec > 0 then
    perform public._cust_debt_move(p_filial, p_cust, -v_dec, 'clamp', p_kind, p_key, p_key, 'sale', p_ref_id, p_note, p_staff_id, p_staff_name);
  end if;
  v_cr := round(p_uzs - v_dec, 2);
  if v_cr >= 1 then
    perform public._cust_credit_move(p_filial, p_cust, v_cr, 'refund', p_key || ':dcr', 'sale', p_ref_id,
                                     left(p_note || ' (qarz oldin to''langan - haqqa)', 500), p_staff_id, p_staff_name);
  else
    v_cr := 0;
  end if;
  return v_cr;
end;
$$;
revoke all on function public._fw_debt_back(text, bigint, numeric, text, text, text, text, bigint, text) from public, anon, authenticated;

create or replace function public.sale_void_atomic(
  p_filial text, p_op_key text, p_sale_local_id text, p_batch_ids jsonb, p_meta jsonb,
  p_staff_id bigint default null, p_staff_name text default null)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  v_r jsonb;
  s public.sales;
  v_item jsonb;
  v_o bigint;
  v_qty numeric;
  v_b public.batches;
  v_rate numeric;
  v_cur text;
  v_ops jsonb := '[]'::jsonb;
  v_row jsonb;
  v_cash jsonb := null;
  v_custs bigint[] := '{}';
  v_batches bigint[] := '{}';
  v_restocked jsonb := '[]'::jsonb;
  v_key text;
begin
  v_r := public._ledger_op_replay(p_filial, p_op_key, 'sale_void');
  if v_r is not null then return v_r; end if;
  v_key := 'void:' || p_op_key;
  select * into s from public.sales where filial = p_filial and local_id = p_sale_local_id for update;
  if not found then raise exception 'LEDGER: savdo serverda topilmadi - sahifani yangilang' using errcode = 'P0001'; end if;
  if s.voided_at is not null then raise exception 'LEDGER: savdo allaqachon o''chirilgan' using errcode = 'P0001'; end if;

  for v_item, v_o in select e, o from jsonb_array_elements(s.items) with ordinality as t(e, o) order by o loop
    v_qty := public._fw_num(v_item->>'qty');
    continue when v_qty <= 0;
    -- 51: ta'minotchidan to'g'ridan-to'g'ri sotilgan qator - omborga QAYTMAYDI (tovar bizda bo'lmagan), ta'minotchi qarzi kamayadi
    if coalesce(v_item->>'direct_supply', 'false') = 'true' then
      if coalesce(v_item->>'supp_id', '') ~ '^[0-9]{1,18}$' then
        perform public._supp_debt_move(p_filial, (v_item->>'supp_id')::bigint, -(v_qty * public._fw_num(v_item->>'cost_usd')), 0, 'clamp', 'sale_return',
          v_key || ':ds:' || v_o, v_key, 'sale', s.inv, 'Savdo o''chirildi (ta''minotchidan)', p_staff_id, p_staff_name);
      end if;
      continue;
    end if;
    v_b := public._batch_insert(p_filial, p_batch_ids->>(v_o - 1)::int, public._fw_num(v_item->>'pid')::bigint, v_qty,
             public._fw_num(v_item->>'cost_usd'), 'active',
             coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('origin', left('O''chirilgan savdo - ' || s.inv, 300)),
             'sale_void', v_key || ':' || v_o, v_key, 'sale', s.inv, p_staff_id, p_staff_name);
    v_batches := v_batches || v_b.id;
    v_restocked := v_restocked || jsonb_build_object('localId', v_b.local_id, 'pid', v_b.pid, 'qty', v_b.qty);
  end loop;

  if s.cust_id is not null and coalesce(s.debt_usd, 0) > 0 then
    v_rate := coalesce(nullif(s.rate_usd_uzs, 0), public._fw_rate());   -- 51: savdo kunidagi kurs
    -- 54: qarz allaqachon to'langan bo'lsa - to'langan qismi mijoz haqiga (avval yo'qolardi)
    perform public._fw_debt_back(p_filial, s.cust_id, round(s.debt_usd * v_rate, 2), 'sale_void', v_key, s.inv, 'Savdo o''chirildi: ' || s.inv, p_staff_id, p_staff_name);
    v_custs := v_custs || s.cust_id;
  end if;

  if s.box_id is not null and coalesce(s.paid_usd, 0) > 0 then
    select currency into v_cur from public.cashbox_balances where filial = p_filial and box_local_id = s.box_id;
    if v_cur is not null then
      v_ops := v_ops || jsonb_build_object('box', s.box_id, 'currency', v_cur, 'dir', 'out',
        'amount', case when v_cur = 'USD' then round(s.paid_usd, 2) else round(s.paid_usd * coalesce(nullif(s.rate_usd_uzs, 0), public._fw_rate()), 2) end,
        'note', left('Savdo o''chirildi - ' || s.inv, 500), 'ref_type', 'sale', 'ref_id', s.inv);
    end if;
  end if;
  if s.pay_type = 'mixed' and jsonb_typeof(s.mixed_rows) = 'array' then
    for v_row in select * from jsonb_array_elements(s.mixed_rows) loop
      continue when coalesce(v_row->>'boxId', '') !~ '^[0-9]{1,9}$' or public._fw_num(v_row->>'amount') <= 0;
      select currency into v_cur from public.cashbox_balances where filial = p_filial and box_local_id = (v_row->>'boxId')::int;
      continue when v_cur is null;
      v_ops := v_ops || jsonb_build_object('box', (v_row->>'boxId')::int, 'currency', v_cur, 'dir', 'out', 'amount', round(public._fw_num(v_row->>'amount'), 2),
        'note', left('Savdo o''chirildi (aralash) - ' || s.inv, 500), 'ref_type', 'sale', 'ref_id', s.inv);
    end loop;
  end if;
  v_ops := (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(v_ops) e where public._fw_num(e->>'amount') > 0);
  if jsonb_array_length(v_ops) > 0 then
    v_cash := public.cashbox_apply_ops(p_filial, v_key, 'sale_fix', v_ops, p_staff_id, p_staff_name);
  end if;

  update public.sales set status = 'voided', voided_at = now() where id = s.id returning * into s;

  return public._ledger_op_finish(p_filial, p_op_key, 'sale_void', jsonb_build_object(
    'ok', true, 'saleLocalId', s.local_id, 'inv', s.inv, 'restocked', v_restocked,
    'sale', public._fw_sale_json(s), 'balances', coalesce(v_cash->'balances', '{}'::jsonb)),
    v_custs, '{}', v_batches, p_staff_id, p_staff_name);
end;
$$;

create or replace function public.sale_return_atomic(
  p_filial text, p_op_key text, p_sale_local_id text, p_pid bigint, p_qty numeric, p_batch_local_id text, p_meta jsonb,
  p_staff_id bigint default null, p_staff_name text default null)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  v_r jsonb;
  s public.sales;
  v_item jsonb;
  v_idx bigint;
  v_iqty numeric;
  v_sell numeric;
  v_cost numeric;
  v_direct boolean;
  v_supp bigint;
  v_gross numeric;
  v_ratio numeric;
  v_rev numeric;
  v_profit numeric;
  v_debt_part numeric;
  v_cash_part numeric;
  v_rate numeric;
  v_box int;
  v_cur text;
  v_amt numeric := 0;
  v_cash jsonb := null;
  v_b public.batches;
  v_custs bigint[] := '{}';
  v_supps bigint[] := '{}';
  v_batches bigint[] := '{}';
  v_key text;
begin
  v_r := public._ledger_op_replay(p_filial, p_op_key, 'sale_return');
  if v_r is not null then return v_r; end if;
  v_key := 'ret:' || p_op_key;

  select * into s from public.sales where filial = p_filial and local_id = p_sale_local_id for update;
  if not found then
    raise exception 'LEDGER: savdo serverda topilmadi - sahifani yangilang' using errcode = 'P0001';
  end if;
  if s.voided_at is not null then raise exception 'LEDGER: savdo o''chirilgan' using errcode = 'P0001'; end if;
  select e, o into v_item, v_idx from jsonb_array_elements(s.items) with ordinality as t(e, o)
   where public._fw_num(e->>'pid') = p_pid order by o limit 1;
  if v_item is null then raise exception 'LEDGER: savdoda bu mahsulot yo''q' using errcode = 'P0001'; end if;
  v_iqty := public._fw_num(v_item->>'qty');
  if p_qty is null or p_qty <= 0 or p_qty > v_iqty + 0.000001 then
    raise exception 'LEDGER: qaytarish miqdori noto''g''ri (savdoda qolgan: %)', v_iqty using errcode = 'P0001';
  end if;
  v_sell := public._fw_num(v_item->>'sell_usd');
  v_cost := public._fw_num(v_item->>'cost_usd');
  v_direct := coalesce(v_item->>'direct_supply', 'false') = 'true';
  v_supp := case when coalesce(v_item->>'supp_id', '') ~ '^[0-9]{1,18}$' then (v_item->>'supp_id')::bigint end;

  v_gross := p_qty * v_sell;
  v_ratio := case when s.subtotal_usd > 0 then least(1, greatest(0, coalesce(s.total_usd, 0) / s.subtotal_usd)) else 1 end;
  v_rev := v_gross * v_ratio;
  v_profit := v_rev - p_qty * v_cost;
  v_debt_part := least(v_rev, greatest(0, coalesce(s.debt_usd, 0)));
  v_cash_part := least(greatest(0, v_rev - v_debt_part), greatest(0, coalesce(s.paid_usd, 0)));

  if v_direct then
    if v_supp is not null then
      perform public._supp_debt_move(p_filial, v_supp, -(p_qty * v_cost), 0, 'clamp', 'sale_return', v_key, v_key, 'sale', s.inv,
                                     'Qaytarish: ' || s.inv, p_staff_id, p_staff_name);
      v_supps := v_supps || v_supp;
    end if;
  else
    v_b := public._batch_insert(p_filial, p_batch_local_id, p_pid, p_qty, v_cost, 'active',
             coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('origin', left('Qaytarish - ' || s.inv || ' (' || coalesce(s.cust_name, 'Anonim') || ')', 300)),
             'sale_return', v_key, v_key, 'sale', s.inv, p_staff_id, p_staff_name);
    v_batches := v_batches || v_b.id;
  end if;

  if v_debt_part > 0 and s.cust_id is not null then
    v_rate := coalesce(nullif(s.rate_usd_uzs, 0), public._fw_rate());   -- 51: savdo kunidagi kurs
    perform public._fw_debt_back(p_filial, s.cust_id, round(v_debt_part * v_rate, 2), 'sale_return', v_key, s.inv, 'Qaytarish: ' || s.inv, p_staff_id, p_staff_name);
    v_custs := v_custs || s.cust_id;
  end if;

  v_box := coalesce(s.box_id, case when jsonb_typeof(s.mixed_rows) = 'array' and coalesce(s.mixed_rows->0->>'boxId', '') ~ '^[0-9]{1,9}$'
                                   then (s.mixed_rows->0->>'boxId')::int end);
  -- 54: kassasiz to'langan (mijoz haqidan) qism - haqqa qaytadi (avval yo'qolardi)
  if v_box is null and v_cash_part > 0.000001 and s.cust_id is not null then
    perform public._cust_credit_move(p_filial, s.cust_id, round(v_cash_part * coalesce(nullif(s.rate_usd_uzs, 0), public._fw_rate()), 2), 'refund',
                                     v_key || ':cr', 'sale', s.inv, 'Qaytarish: ' || s.inv || ' - haqqa', p_staff_id, p_staff_name);
  end if;
  if v_box is not null and v_cash_part > 0.000001 then
    select currency into v_cur from public.cashbox_balances where filial = p_filial and box_local_id = v_box;
    if v_cur is null then raise exception 'CASHBOX: qaytarish kassasi topilmadi (kassa %)', v_box using errcode = 'P0001'; end if;
    v_amt := case when v_cur = 'USD' then round(v_cash_part, 2) else round(v_cash_part * coalesce(nullif(s.rate_usd_uzs, 0), public._fw_rate()), 2) end;
    if v_amt > 0 then
      v_cash := public.cashbox_apply_ops(p_filial, v_key, 'sale_fix', jsonb_build_array(jsonb_build_object('box', v_box, 'currency', v_cur,
                  'dir', 'out', 'amount', v_amt, 'note', left('Qaytarish: ' || s.inv || ' - ' || p_qty || ' dona', 500), 'ref_type', 'sale', 'ref_id', s.inv)),
                  p_staff_id, p_staff_name);
    end if;
  end if;

  update public.sales
     set items = jsonb_set(items, array[(v_idx - 1)::text], v_item || jsonb_build_object('qty', v_iqty - p_qty, 'line_usd', (v_iqty - p_qty) * v_sell)),
         subtotal_usd = greatest(0, subtotal_usd - v_gross),
         total_usd = greatest(0, total_usd - v_rev),
         paid_usd = greatest(0, paid_usd - v_cash_part),
         debt_usd = case when v_debt_part > 0 then greatest(0, debt_usd - v_debt_part) else debt_usd end
   where id = s.id
   returning * into s;

  return public._ledger_op_finish(p_filial, p_op_key, 'sale_return', jsonb_build_object(
    'ok', true, 'saleLocalId', s.local_id, 'inv', s.inv, 'pid', p_pid, 'qty', p_qty, 'wasDirectSupply', v_direct,
    'returnGross', v_gross, 'returnRevenue', v_rev, 'returnProfit', v_profit, 'debtPart', v_debt_part, 'cashPart', v_cash_part,
    'refundBox', v_box, 'refundAmount', v_amt, 'batchLocalId', case when v_b.id is not null then v_b.local_id end,
    'sale', public._fw_sale_json(s), 'balances', coalesce(v_cash->'balances', '{}'::jsonb)),
    v_custs, v_supps, v_batches, p_staff_id, p_staff_name);
end;
$$;

-- Kichik tuzatishlar mavjud funksiyalar matniga aniq almashtirish bilan kiritiladi (butun funksiyani qayta yozmasdan).
-- Har almashtirish tekshiriladi: naqsh topilmasa va tuzatish hali yo'q bo'lsa - xato (hech narsa o'zgarmaydi).
create or replace function public._fw54_patch(p_fn regprocedure, p_pat text, p_rep text, p_done text, p_flags text default '')
 returns void
 language plpgsql
 set search_path = ''
as $$
declare
  d text;
  n text;
begin
  d := pg_get_functiondef(p_fn);
  if position(p_done in d) > 0 then return; end if;   -- allaqachon tuzatilgan (qayta ishga tushirish xavfsiz)
  n := regexp_replace(d, p_pat, p_rep, p_flags);
  if n = d then raise exception '54: % ichida kutilgan matn topilmadi: %', p_fn, left(p_pat, 80); end if;
  execute n;
end;
$$;

-- 1) Konsignatsiya partiyasini tahrirlash ta'minotchi qarzini darhol yozmaydi (qarz sotilganda yoziladi - avval ikki marta yozilardi)
select public._fw54_patch('public.stock_debt_op(text, text, text, jsonb, bigint, text)'::regprocedure,
  'if r\.supp_id is not null then(\s+v_side := v_side \|\| jsonb_build_object\(''supp'', r\.supp_id, ''usd'', r\.nq \* r\.nc)',
  'if r.supp_id is not null and not coalesce(r.consignment, false) then\1',
  'r.supp_id is not null and not coalesce(r.consignment, false)');

-- 2) Sotilgan partiyani o'chirish - server ham rad etadi (avval faqat ilova tekshirardi)
select public._fw54_patch('public.stock_debt_op(text, text, text, jsonb, bigint, text)'::regprocedure,
  'if p_kind = ''batch_delete'' then(\s+)v_b := public\._stock_move\(r\.id, 0, 0, ''delete''',
  'if p_kind = ''batch_delete'' then\1if r.sold > 0.000001 then raise exception ''LEDGER: bu partiyadan % dona sotilgan - avval o''''sha savdolarni o''''chiring'', r.sold using errcode = ''P0001''; end if;\1v_b := public._stock_move(r.id, 0, 0, ''delete''',
  'dona sotilgan - avval');

-- 3) Arzon mahsulot ($5 dan past) chegirma chegarasi - sent bilan (ilovadagi fwRetailRound bilan bir xil); avval butun $ ga
--    yaxlitlanib, sotuvchi ro'yxat narxida ham sota olmasdi
select public._fw54_patch('public.sale_checkout_v37(text, text, jsonb, jsonb, bigint, text, text, boolean, jsonb, numeric, text)'::regprocedure,
  'v_base := round\(v_cost \* \(1 \+ v_pct / 100\)\);',
  'v_base := case when v_cost * (1 + v_pct / 100) >= 5 then round(v_cost * (1 + v_pct / 100)) else round(v_cost * (1 + v_pct / 100), 2) end;',
  'else round(v_cost * (1 + v_pct / 100), 2) end');

-- 4) Savdo narxini tahrirlash: foyda qayta hisoblanadi (avval eski foyda qolardi)
select public._fw54_patch('public.sale_edit_atomic(text, text, text, text, jsonb, bigint, text)'::regprocedure,
  '(''line_usd'', v_qty \* v_sell\)\);\s+v_subtotal := v_subtotal \+ v_qty \* v_sell;)',
  '\1 v_cost := v_cost + v_qty * public._fw_num(v_it->>''cost_usd''); /* 54:price-cost */',
  '54:price-cost');
select public._fw54_patch('public.sale_edit_atomic(text, text, text, text, jsonb, bigint, text)'::regprocedure,
  '(paid_usd = case when pay_type = ''debt'' then paid_usd else greatest\(0, paid_usd \+ v_delta\) end,)',
  '\1 profit_usd = v_total - v_cost,',
  'greatest(0, paid_usd + v_delta) end, profit_usd = v_total - v_cost');

-- 5) Savdoni tahrirlash - kassa va qarz savdo kunidagi kurs bilan (51 o'chirish/qaytarishda tuzatgan edi, tahrirda qolgan edi)
select public._fw54_patch('public.sale_edit_atomic(text, text, text, text, jsonb, bigint, text)'::regprocedure,
  'public\._fw_rate\(\)',
  'coalesce(nullif(s.rate_usd_uzs, 0), public._fw_rate())',
  'coalesce(nullif(s.rate_usd_uzs, 0), public._fw_rate())', 'g');

drop function public._fw54_patch(regprocedure, text, text, text, text);
commit;
