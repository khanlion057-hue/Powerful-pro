-- 51: HISOBCHI TOPGAN XATOLAR (v25.6.9). Takror ishga tushirish xavfsiz. Faqat qo'shadi/yangilaydi — ma'lumot o'chirmaydi.
--  1) Konsignatsiya: ta'minotchi qarzi sotilganda TOVAR narxidan (goods_usd) — yo'lkira, bank haqi, bojxona emas. Eski partiyalarda goods_usd yo'q — avvalgidek (cost_usd).
--  2) Savdoni o'chirish: ta'minotchidan to'g'ridan-to'g'ri sotilgan qator omborga qaytmaydi, ta'minotchi qarzi kamayadi (qaytarishdagi kabi).
--  3) O'chirish/qaytarish: so'mdagi qarz va kassa — SAVDO KUNIDAGI kurs bilan (sales.rate_usd_uzs; eski savdolarda yo'q — bugungi kurs, avvalgidek).

alter table public.batches add column if not exists goods_usd numeric;
alter table public.sales add column if not exists rate_usd_uzs numeric;

-- yangi savdoga o'sha paytdagi kurs avtomatik yoziladi
create or replace function public._sales_rate_default()
 returns trigger language plpgsql set search_path = '' as $f$
begin
  if new.rate_usd_uzs is null then
    begin new.rate_usd_uzs := public._fw_rate(); exception when others then new.rate_usd_uzs := null; end;
  end if;
  return new;
end $f$;
drop trigger if exists sales_rate_default on public.sales;
create trigger sales_rate_default before insert on public.sales for each row execute function public._sales_rate_default();

create or replace function public._batch_insert(
  p_filial text, p_local_id text, p_pid bigint, p_qty numeric, p_cost numeric, p_status text, p_meta jsonb,
  p_kind text, p_op_key text, p_group_key text default null, p_ref_type text default null, p_ref_id text default null,
  p_staff_id bigint default null, p_staff_name text default null)
 returns public.batches
 language plpgsql
 set search_path = ''
as $$
declare
  b public.batches;
  m jsonb := coalesce(p_meta, '{}'::jsonb);
  v_date date;
begin
  if coalesce(p_filial, '') = '' or coalesce(p_local_id, '') !~ '^[0-9A-Za-z_.:-]{1,64}$' then
    raise exception 'LEDGER: partiya ID noto''g''ri' using errcode = 'P0001';
  end if;
  if p_pid is null or p_pid <= 0 then raise exception 'LEDGER: mahsulot noto''g''ri' using errcode = 'P0001'; end if;
  if p_qty is null or p_qty = 'NaN'::numeric or p_qty <= 0 or p_qty > 10000000 then
    raise exception 'LEDGER: miqdor musbat bo''lishi kerak' using errcode = 'P0001';
  end if;
  if p_cost is null or p_cost = 'NaN'::numeric or p_cost < 0 or p_cost > 10000000 then
    raise exception 'LEDGER: tannarx noto''g''ri' using errcode = 'P0001';
  end if;
  if coalesce(p_status, 'active') not in ('active','transit') then
    raise exception 'LEDGER: partiya holati noto''g''ri' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.batches where filial = p_filial and local_id = p_local_id) then
    raise exception 'LEDGER: partiya ID takrorlandi (%)', p_local_id using errcode = 'P0001';
  end if;
  v_date := case when coalesce(m->>'date', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (m->>'date')::date else current_date end;
  perform set_config('fw.stock_move', '1', true);
  insert into public.batches (local_id, filial, pid, bno, origin, cur, qty, sold, cost_usd, bank_fee_usd, supp_id, consignment,
                              rate_usd_uzs, rate_usd_cny, batch_date, status, performed_by, from_branch, kirim_ref, fk_ref, arrived_at, goods_usd)
  values (p_local_id, p_filial, p_pid, left(m->>'bno', 20), left(m->>'origin', 300),
          case when m->>'cur' in ('USD','UZS','CNY','KRW') then m->>'cur' else 'USD' end,
          p_qty, 0, p_cost, greatest(public._fw_num(m->>'bankFeeUsd'), 0),
          case when coalesce(m->>'suppId', '') ~ '^[0-9]{1,18}$' then (m->>'suppId')::bigint end,
          coalesce((m->>'consignment')::boolean, false),
          nullif(public._fw_num(m->>'rateUsdUzs'), 0), nullif(public._fw_num(m->>'rateUsdCny'), 0),
          v_date, coalesce(p_status, 'active'), left(m->>'performedBy', 200),
          case when m->>'fromBranch' ~ '^[a-z0-9_]{1,40}$' then m->>'fromBranch' end,
          left(m->>'kirimRef', 64), left(m->>'fkRef', 64),
          case when coalesce(p_status, 'active') = 'active' then v_date end,
          nullif(greatest(public._fw_num(m->>'goodsUsd'), 0), 0))
  returning * into b;
  insert into public.stock_ledger (filial, batch_id, batch_local_id, pid, d_qty, d_sold, qty_after, sold_after, cost_usd, status_after,
                                   op_kind, op_key, group_key, ref_type, ref_id, note, staff_id, staff_name)
  values (b.filial, b.id, b.local_id, b.pid, b.qty, 0, b.qty, 0, b.cost_usd, b.status,
          p_kind, p_op_key, p_group_key, left(p_ref_type, 40), left(p_ref_id, 100), left(m->>'origin', 500), p_staff_id, left(p_staff_name, 200));
  perform set_config('fw.stock_move', '', true);
  return b;
end;
$$;

create or replace function public._stock_fifo_out(
  p_filial text, p_pid bigint, p_qty numeric, p_kind text, p_op_prefix text,
  p_group_key text default null, p_ref_type text default null, p_ref_id text default null, p_note text default null,
  p_staff_id bigint default null, p_staff_name text default null)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  b record;
  v_rem numeric := p_qty;
  v_take numeric;
  v_cost numeric := 0;
  v_first numeric := null;
  v_bd numeric := 0;
  v_allocs jsonb := '[]'::jsonb;
  v_side jsonb := '[]'::jsonb;
begin
  if p_qty is null or p_qty = 'NaN'::numeric or p_qty <= 0 or p_qty > 10000000 then
    raise exception 'LEDGER: miqdor musbat bo''lishi kerak' using errcode = 'P0001';
  end if;
  -- Avval shu mahsulotning barcha faol partiyalari tartib bilan qulflanadi
  perform 1 from public.batches where filial = p_filial and pid = p_pid and status = 'active'
    order by batch_date asc nulls last, id asc for update;
  for b in
    select id, local_id, qty, sold, cost_usd, goods_usd, consignment, supp_id, from_branch from public.batches
     where filial = p_filial and pid = p_pid and status = 'active' and qty > sold
     order by batch_date asc nulls last, id asc
  loop
    exit when v_rem <= 0.000001;
    v_take := least(b.qty - b.sold, v_rem);
    perform public._stock_move(b.id, 0, v_take, p_kind, p_op_prefix || ':' || b.id, p_group_key, p_ref_type, p_ref_id, p_note, p_staff_id, p_staff_name);
    if v_first is null then v_first := b.cost_usd; end if;
    v_cost := v_cost + v_take * b.cost_usd;
    if b.consignment and b.supp_id is not null then
      v_side := v_side || jsonb_build_object('supp', b.supp_id, 'usd', v_take * coalesce(b.goods_usd, b.cost_usd), 'kind', 'consignment');   -- 51: ta'minotchiga faqat tovar narxi (yo'lkira/bojxona emas)
    end if;
    if b.from_branch = 'baza' and p_filial <> 'baza' then v_bd := v_bd + v_take * b.cost_usd; end if;
    v_allocs := v_allocs || jsonb_build_object('batchId', b.id, 'localId', b.local_id, 'take', v_take, 'cost', b.cost_usd);
    v_rem := v_rem - v_take;
  end loop;
  if v_rem > 0.000001 then
    raise exception 'Omborda yetarli qoldiq yo''q: pid=%, yetishmayotgan miqdor=%', p_pid, v_rem using errcode = 'P0001';
  end if;
  return jsonb_build_object('cost', v_cost, 'firstCost', coalesce(v_first, 0), 'allocs', v_allocs, 'side', v_side, 'bd', v_bd);
end;
$$;

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
  if not found then raise exception 'LEDGER: savdo serverda topilmadi — sahifani yangilang' using errcode = 'P0001'; end if;
  if s.voided_at is not null then raise exception 'LEDGER: savdo allaqachon o''chirilgan' using errcode = 'P0001'; end if;

  for v_item, v_o in select e, o from jsonb_array_elements(s.items) with ordinality as t(e, o) order by o loop
    v_qty := public._fw_num(v_item->>'qty');
    continue when v_qty <= 0;
    -- 51: ta'minotchidan to'g'ridan-to'g'ri sotilgan qator — omborga QAYTMAYDI (tovar bizda bo'lmagan), ta'minotchi qarzi kamayadi
    if coalesce(v_item->>'direct_supply', 'false') = 'true' then
      if coalesce(v_item->>'supp_id', '') ~ '^[0-9]{1,18}$' then
        perform public._supp_debt_move(p_filial, (v_item->>'supp_id')::bigint, -(v_qty * public._fw_num(v_item->>'cost_usd')), 0, 'clamp', 'sale_return',
          v_key || ':ds:' || v_o, v_key, 'sale', s.inv, 'Savdo o''chirildi (taʼminotchidan)', p_staff_id, p_staff_name);
      end if;
      continue;
    end if;
    v_b := public._batch_insert(p_filial, p_batch_ids->>(v_o - 1)::int, public._fw_num(v_item->>'pid')::bigint, v_qty,
             public._fw_num(v_item->>'cost_usd'), 'active',
             coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('origin', left('O''chirilgan savdo — ' || s.inv, 300)),
             'sale_void', v_key || ':' || v_o, v_key, 'sale', s.inv, p_staff_id, p_staff_name);
    v_batches := v_batches || v_b.id;
    v_restocked := v_restocked || jsonb_build_object('localId', v_b.local_id, 'pid', v_b.pid, 'qty', v_b.qty);
  end loop;

  if s.cust_id is not null and coalesce(s.debt_usd, 0) > 0 then
    v_rate := coalesce(nullif(s.rate_usd_uzs, 0), public._fw_rate());   -- 51: savdo kunidagi kurs
    perform public._cust_debt_move(p_filial, s.cust_id, -round(s.debt_usd * v_rate, 2), 'clamp', 'sale_void', v_key, v_key, 'sale', s.inv,
                                   'Savdo o''chirildi: ' || s.inv, p_staff_id, p_staff_name);
    v_custs := v_custs || s.cust_id;
  end if;

  if s.box_id is not null and coalesce(s.paid_usd, 0) > 0 then
    select currency into v_cur from public.cashbox_balances where filial = p_filial and box_local_id = s.box_id;
    if v_cur is not null then
      v_ops := v_ops || jsonb_build_object('box', s.box_id, 'currency', v_cur, 'dir', 'out',
        'amount', case when v_cur = 'USD' then round(s.paid_usd, 2) else round(s.paid_usd * coalesce(nullif(s.rate_usd_uzs, 0), public._fw_rate()), 2) end,
        'note', left('Savdo o''chirildi — ' || s.inv, 500), 'ref_type', 'sale', 'ref_id', s.inv);
    end if;
  end if;
  if s.pay_type = 'mixed' and jsonb_typeof(s.mixed_rows) = 'array' then
    for v_row in select * from jsonb_array_elements(s.mixed_rows) loop
      continue when coalesce(v_row->>'boxId', '') !~ '^[0-9]{1,9}$' or public._fw_num(v_row->>'amount') <= 0;
      select currency into v_cur from public.cashbox_balances where filial = p_filial and box_local_id = (v_row->>'boxId')::int;
      continue when v_cur is null;
      v_ops := v_ops || jsonb_build_object('box', (v_row->>'boxId')::int, 'currency', v_cur, 'dir', 'out', 'amount', round(public._fw_num(v_row->>'amount'), 2),
        'note', left('Savdo o''chirildi (aralash) — ' || s.inv, 500), 'ref_type', 'sale', 'ref_id', s.inv);
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
    raise exception 'LEDGER: savdo serverda topilmadi — sahifani yangilang' using errcode = 'P0001';
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
             coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('origin', left('Qaytarish — ' || s.inv || ' (' || coalesce(s.cust_name, 'Anonim') || ')', 300)),
             'sale_return', v_key, v_key, 'sale', s.inv, p_staff_id, p_staff_name);
    v_batches := v_batches || v_b.id;
  end if;

  if v_debt_part > 0 and s.cust_id is not null then
    v_rate := coalesce(nullif(s.rate_usd_uzs, 0), public._fw_rate());   -- 51: savdo kunidagi kurs
    perform public._cust_debt_move(p_filial, s.cust_id, -round(v_debt_part * v_rate, 2), 'clamp', 'sale_return', v_key, v_key, 'sale', s.inv,
                                   'Qaytarish: ' || s.inv, p_staff_id, p_staff_name);
    v_custs := v_custs || s.cust_id;
  end if;

  v_box := coalesce(s.box_id, case when jsonb_typeof(s.mixed_rows) = 'array' and coalesce(s.mixed_rows->0->>'boxId', '') ~ '^[0-9]{1,9}$'
                                   then (s.mixed_rows->0->>'boxId')::int end);
  if v_box is not null and v_cash_part > 0.000001 then
    select currency into v_cur from public.cashbox_balances where filial = p_filial and box_local_id = v_box;
    if v_cur is null then raise exception 'CASHBOX: qaytarish kassasi topilmadi (kassa %)', v_box using errcode = 'P0001'; end if;
    v_amt := case when v_cur = 'USD' then round(v_cash_part, 2) else round(v_cash_part * coalesce(nullif(s.rate_usd_uzs, 0), public._fw_rate()), 2) end;
    if v_amt > 0 then
      v_cash := public.cashbox_apply_ops(p_filial, v_key, 'sale_fix', jsonb_build_array(jsonb_build_object('box', v_box, 'currency', v_cur,
                  'dir', 'out', 'amount', v_amt, 'note', left('Qaytarish: ' || s.inv || ' — ' || p_qty || ' dona', 500), 'ref_type', 'sale', 'ref_id', s.inv)),
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
