-- ============================================================================================================
-- 55-MIGRATSIYA (v25.6.10): ochiq qolgan pul xatolari. Faqat ASCII. Takror ishga tushirish xavfsiz. 54 qo'llangan bo'lishi kerak.
--  1) Kirim o'chirilganda ta'minotchi qarzi kamayadi (avval qarz qolib ketardi).
--  2) Aralash to'lovli savdo qaytarilsa - pul har kassaga o'z ulushida qaytadi (avval hammasi birinchi kassadan).
-- ============================================================================================================
begin;
-- 55: kirim (partiya) o'chirilganda - shu kirim ta'minotchiga yozgan qarz partiya ulushida qaytariladi.
-- Ulush: partiya qiymati / shu kirimdagi barcha partiyalar qiymati. Naqd to'langan qism (given) qaytarilmaydi - u kassadan chiqqan.
create or replace function public._fw_kirim_supp_back(p_filial text, p_batch_id bigint, p_supp bigint, p_key text,
  p_staff_id bigint default null, p_staff_name text default null)
 returns numeric
 language plpgsql
 set search_path = ''
as $$
declare
  v_g text;
  v_d numeric;
  v_mine numeric;
  v_all numeric;
  v_back numeric;
begin
  select group_key into v_g from public.stock_ledger where filial = p_filial and batch_id = p_batch_id and op_kind in ('kirim','import')
   order by id limit 1;
  if v_g is null then return 0; end if;
  select coalesce(sum(delta), 0) into v_d from public.supplier_debt_ledger
   where filial = p_filial and supplier_local_id = p_supp and group_key = v_g and op_kind in ('kirim','import');
  if v_d <= 0 then return 0; end if;
  select coalesce(sum(case when batch_id = p_batch_id then qty_after * coalesce(cost_usd, 0) else 0 end), 0),
         coalesce(sum(qty_after * coalesce(cost_usd, 0)), 0)
    into v_mine, v_all
    from (select distinct on (batch_id) batch_id, qty_after, cost_usd from public.stock_ledger
           where filial = p_filial and group_key = v_g and op_kind in ('kirim','import') order by batch_id, id) t;
  if v_all <= 0 then return 0; end if;
  v_back := round(v_d * v_mine / v_all, 4);
  if v_back <= 0 then return 0; end if;
  perform public._supp_debt_move(p_filial, p_supp, -v_back, 0, 'clamp', 'adjust', p_key, p_key, 'batch', null,
                                 'Kirim o''chirildi - qarz qaytdi', p_staff_id, p_staff_name);
  return v_back;
end;
$$;
revoke all on function public._fw_kirim_supp_back(text, bigint, bigint, text, bigint, text) from public, anon, authenticated;

create or replace function public._fw55_patch(p_fn regprocedure, p_pat text, p_rep text, p_done text, p_flags text default '')
 returns void
 language plpgsql
 set search_path = ''
as $$
declare
  d text;
  n text;
begin
  d := pg_get_functiondef(p_fn);
  if position(p_done in d) > 0 then return; end if;
  n := regexp_replace(d, p_pat, p_rep, p_flags);
  if n = d then raise exception '55: % ichida kutilgan matn topilmadi: %', p_fn, left(p_pat, 80); end if;
  execute n;
end;
$$;

select public._fw55_patch('public.stock_debt_op(text, text, text, jsonb, bigint, text)'::regprocedure,
  '(r\.sold using errcode = ''P0001''; end if;)',
  '\1 if r.supp_id is not null and not coalesce(r.consignment, false) then perform public._fw_kirim_supp_back(p_filial, r.id, r.supp_id, v_key || '':sb:'' || r.id, p_staff_id, p_staff_name); v_supps := v_supps || r.supp_id; end if; /* 55:kirim-supp */',
  '55:kirim-supp');

drop function public._fw55_patch(regprocedure, text, text, text, text);

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
  v_rows jsonb;
  v_tot numeric;
  v_ops jsonb;
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
  -- 55: aralash to'lov - pul har kassaga o'z ulushida qaytadi (avval hammasi birinchi kassadan)
  if s.pay_type = 'mixed' and jsonb_typeof(s.mixed_rows) = 'array' and jsonb_array_length(s.mixed_rows) > 1 and v_cash_part > 0.000001 then
    v_rate := coalesce(nullif(s.rate_usd_uzs, 0), public._fw_rate());
    select coalesce(jsonb_agg(x), '[]'::jsonb), coalesce(sum((x->>'usd')::numeric), 0) into v_rows, v_tot
      from (select jsonb_build_object('box', (r->>'boxId')::int, 'cur', cb.currency,
                   'usd', case when cb.currency = 'USD' then public._fw_num(r->>'amount') else public._fw_num(r->>'amount') / nullif(v_rate, 0) end) x
              from jsonb_array_elements(s.mixed_rows) r
              join public.cashbox_balances cb on cb.filial = p_filial and cb.box_local_id = (r->>'boxId')::int
             where coalesce(r->>'boxId', '') ~ '^[0-9]{1,9}$' and public._fw_num(r->>'amount') > 0) t;
    if v_tot > 0 then
      select coalesce(jsonb_agg(jsonb_build_object('box', (x->>'box')::int, 'currency', x->>'cur', 'dir', 'out',
               'amount', case when x->>'cur' = 'USD' then round(v_cash_part * (x->>'usd')::numeric / v_tot, 2)
                              else round(v_cash_part * (x->>'usd')::numeric / v_tot * v_rate, 2) end,
               'note', left('Qaytarish (aralash): ' || s.inv || ' - ' || p_qty || ' dona', 500), 'ref_type', 'sale', 'ref_id', s.inv)), '[]'::jsonb)
        into v_ops from jsonb_array_elements(v_rows) x;
      v_ops := (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(v_ops) e where public._fw_num(e->>'amount') > 0);
      if jsonb_array_length(v_ops) > 0 then
        v_cash := public.cashbox_apply_ops(p_filial, v_key, 'sale_fix', v_ops, p_staff_id, p_staff_name);
        v_amt := (select sum(public._fw_num(e->>'amount')) from jsonb_array_elements(v_ops) e);
      end if;
      v_box := null;   -- quyidagi bitta kassali yo'l ishlamaydi
    end if;
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
commit;
