-- ════════════════════════════════════════════════════════════════════
-- 35-MIGRATSIYA (v24.5; v23.10.2 dagi 31-migratsiyadan ko'chirildi): DILLER OMBORI VA DILLER SAVDOSI —
--                      SERVERDA, BITTA TRANZAKSIYADA («diller ombori atomik»)
-- Muammo: dillerga jo'natish, buyurtmani tasdiqlash, dillerdan qaytarish va admin yozadigan diller savdosi
-- brauzer boshqaradigan bir nechta alohida so'rov edi: firma omboridan chiqarish → diller qoldig'ini o'qish →
-- yangi qoldiqni MUTLAQ qiymat sifatida yozish → harakat → total_shipped / qarz MUTLAQ qiymat.
--   • o'rtadagi xatoda tovar firma omboridan chiqib, diller omboriga tushmay qolardi;
--   • ikki xodim bir vaqtda — ikkalasi bir xil eski qoldiqni o'qib, biri yo'qolardi (lost update);
--   • diller savdosida (Promise.all) qoldiq yozuvi va savdo tekshiruvi tartibi tasodifiy edi.
-- Yechim: uchta funksiya — har biri BITTA tranzaksiyada, diller qatori qulflanadi, qoldiq/qarz SERVERDA
-- hisoblanadi (brauzer faqat amalni so'raydi), takroriy so'rov (bir xil kalit) ikki marta yozilmaydi (ledger_ops).
--   dealer_ship_atomic        — firma omboridan FIFO (stock_debt_op) + diller ombori + harakat + total_shipped
--                               (+ ixtiyoriy: buyurtmani 'pending' → 'approved' — ikki marta tasdiqlab bo'lmaydi)
--   dealer_return_atomic      — diller omboridan ayirish (qoldiqdan oshmaydi) + harakat; sotiladigan holat
--                               (Yangi / Yaxshi) — firma omboriga yangi partiya (stock_debt_op batches_create)
--   dealer_sale_record_atomic — ADMIN diller savdosini yozadi: qoldiq tekshiruvi, dealer_sales (source = null —
--                               oddiy savdo), qarz = (Σ miqdor×narx) × (1 − komissiya%), total_sold, ballar
-- v24.5 bilan moslik:
--   • record_dealer_sale (diller portali, 31-migratsiyadagi optom narxdan −10% chegarasi) — O'ZGARTIRILMAYDI.
--   • Diller reviziyasi (32: dealer_revision_decide) o'zgarmaydi; bu funksiyalar ham dealers → dealer_stock tartibida
--     qulflaydi. Reviziyadan keyin jo'natish/qaytarish/savdo bo'lsa — reviziya tasdig'i REV_STALE bilan rad etiladi
--     (32 dagi qoida: qoldiq o'zgargan — qayta reviziya kerak).
--   • ledger_ops amal turlari — 33-migratsiyadagi TO'LIQ ro'yxat (27, 28, 29, 33) + 3 ta diller amali.
--     34 ledger_ops turlarini o'zgartirmaydi (faqat cashbox_ledger) — bu migratsiya kassa turlariga tegmaydi.
-- Faqat qo'shadi; ma'lumot o'chirmaydi; qayta ishga tushirish xavfsiz. Talab: 27 (stock_debt_op, ledger_ops) va 34.
-- Funksiyalar faqat service_role (Netlify `dealer-ops`) uchun — brauzer rollari chaqira olmaydi.
-- Qo'shimcha (7-bo'lim): 10 ta eski funksiyaga qat'iy search_path (Supabase xavfsizlik ogohlantirishi).
-- DIQQAT: 27, 28, 29 yoki 33 qayta qo'llansa — ledger_ops amal turlari qaytadi; oxirida 35 ni ham qayta qo'llang
-- (diller amallari yozilgan bazada ular qayta qo'llanmaydi — CHECK xatosi bilan to'xtaydi, hech narsa o'zgarmaydi).
-- ════════════════════════════════════════════════════════════════════

-- ── 0. Bog'liqlik ──────────────────────────────────────────────────────
do $$ begin
  if to_regclass('public.ledger_ops') is null or not exists (select 1 from pg_proc where proname = 'stock_debt_op') then
    raise exception '35-migratsiya: avval 27-migratsiyani qo''llang';
  end if;
  if to_regclass('public.customer_credit_balances') is null or not exists (select 1 from pg_proc where proname = 'sale_checkout_v34')
     or not exists (select 1 from pg_proc where proname = 'supplier_advance_apply') then
    raise exception '35-migratsiya: avval 33 va 34-migratsiyalarni qo''llang';
  end if;
end $$;

-- ── 1. Amal turlari (33-migratsiyadagi to'liq ro'yxat + diller amallari) ──
alter table public.ledger_ops drop constraint if exists ledger_ops_kind_chk;
alter table public.ledger_ops add constraint ledger_ops_kind_chk check (kind in ('sale','sale_return','sale_void','sale_edit','cust_set','supp_set',
  'batches_create','batch_edit','batch_delete','batch_arrive','revision','stock_out','firma_supp_pay',
  'writeoff','writeoff_cancel','b2b_ship','b2b_receive','b2b_ack','b2b_restock','supp_advance','supp_advance_apply',
  'dealer_ship','dealer_return','dealer_sale'));

-- ── 2. Yordamchi: diller holati (javob uchun) va ichki amal partiyalari ─
create or replace function public._dealer_json(d public.dealers)
 returns jsonb
 language sql
 stable
 set search_path = ''
as $$
  select jsonb_build_object('id', d.id, 'debt', d.debt_usd, 'totalShipped', d.total_shipped_usd, 'totalSold', d.total_sold_usd,
                            'totalPaid', d.total_paid_usd, 'points', d.points);
$$;

create or replace function public._ledger_op_batch_ids(p_filial text, p_op_key text)
 returns bigint[]
 language sql
 stable
 set search_path = ''
as $$
  select coalesce(array(select jsonb_array_elements_text(coalesce(result->'_ids'->'b', '[]'::jsonb))::bigint
                          from public.ledger_ops where filial = p_filial and op_key = p_op_key), '{}');
$$;

create or replace function public._dealer_lock(p_filial text, p_dealer_id bigint)
 returns public.dealers
 language plpgsql
 set search_path = ''
as $$
declare d public.dealers;
begin
  select * into d from public.dealers where id = p_dealer_id for update;
  if not found or coalesce(d.filial, 'baza') <> p_filial then
    raise exception 'LEDGER: diller topilmadi' using errcode = 'P0001';
  end if;
  if d.active is false then raise exception 'LEDGER: diller faol emas' using errcode = 'P0001'; end if;
  return d;
end;
$$;

-- ── 3. Dillerga jo'natish (va buyurtmani tasdiqlash) ──────────────────
-- p_items: [{pid, qty, sku, name}] — sku/name faqat yozuv uchun; tannarx FIFO bo'yicha SERVERDA
create or replace function public.dealer_ship_atomic(
  p_filial text, p_op_key text, p_dealer_id bigint, p_items jsonb, p_order_id bigint,
  p_staff_id bigint default null, p_staff_name text default null)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  v_r jsonb;
  d public.dealers;
  v_out jsonb;
  x jsonb;
  v_lbl jsonb;
  v_pid bigint;
  v_qty numeric;
  v_cost numeric;
  v_total numeric := 0;
  v_ds public.dealer_stock;
  v_items jsonb := '[]'::jsonb;
  v_order public.dealer_orders;
  v_pids bigint[];
begin
  v_r := public._ledger_op_replay(p_filial, p_op_key, 'dealer_ship');
  if v_r is not null then return v_r; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 500 then
    raise exception 'LEDGER: mahsulotlar ro''yxati noto''g''ri' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) e
              where coalesce(e->>'pid', '') !~ '^[0-9]{1,18}$' or public._fw_num(e->>'qty') <= 0 or public._fw_num(e->>'qty') > 1000000) then
    raise exception 'LEDGER: mahsulot qatori noto''g''ri' using errcode = 'P0001';
  end if;
  if (select count(distinct e->>'pid') from jsonb_array_elements(p_items) e) <> jsonb_array_length(p_items) then
    raise exception 'LEDGER: bir mahsulot ikki marta yozilgan' using errcode = 'P0001';
  end if;
  d := public._dealer_lock(p_filial, p_dealer_id);

  if p_order_id is not null then
    select * into v_order from public.dealer_orders where id = p_order_id for update;
    if not found or v_order.dealer_id <> p_dealer_id then raise exception 'LEDGER: buyurtma topilmadi' using errcode = 'P0001'; end if;
    if v_order.status <> 'pending' then
      raise exception 'LEDGER: buyurtma allaqachon ko''rib chiqilgan (%)', v_order.status using errcode = 'P0001';
    end if;
    v_pids := array(select public._fw_num(i->>'pid')::bigint from jsonb_array_elements(case when jsonb_typeof(v_order.items) = 'array' then v_order.items else '[]'::jsonb end) i);
    if exists (select 1 from jsonb_array_elements(p_items) e where (e->>'pid')::bigint <> all(v_pids)) then
      raise exception 'LEDGER: buyurtmada yo''q mahsulot' using errcode = 'P0001';
    end if;
    update public.dealer_orders set status = 'approved', resolved_at = now(),
           items = (select jsonb_agg(jsonb_build_object('pid', (e->>'pid')::bigint, 'sku', left(e->>'sku', 80), 'name', left(e->>'name', 200),
                                                        'qty', public._fw_num(e->>'qty'))) from jsonb_array_elements(p_items) e)
     where id = p_order_id;
  end if;

  -- Firma ombori: FIFO, yetmasa — butun amal rad etiladi (diller ombori ham, buyurtma ham o'zgarmaydi)
  v_out := public.stock_debt_op(p_filial, p_op_key || ':out', 'stock_out',
             jsonb_build_object('reason', 'dealer', 'dealerId', p_dealer_id::text,
               'items', (select jsonb_agg(jsonb_build_object('pid', (e->>'pid')::bigint, 'qty', public._fw_num(e->>'qty'))) from jsonb_array_elements(p_items) e)),
             p_staff_id, p_staff_name);

  for x in select * from jsonb_array_elements(v_out->'items') loop
    v_pid := (x->>'pid')::bigint;
    v_qty := (x->>'qty')::numeric;
    v_cost := (x->>'cost')::numeric;                      -- shu miqdorning haqiqiy FIFO tannarxi (jami)
    select e into v_lbl from jsonb_array_elements(p_items) e where (e->>'pid')::bigint = v_pid limit 1;
    insert into public.dealer_stock (dealer_id, pid, sku, name, qty, avg_cost_usd, updated_at)
    values (p_dealer_id, v_pid, left(v_lbl->>'sku', 80), left(v_lbl->>'name', 300), v_qty, round(v_cost / v_qty, 6), now())
    on conflict (dealer_id, pid) do update set
      avg_cost_usd = case when public.dealer_stock.qty + excluded.qty > 0
                          then round((public.dealer_stock.qty * public.dealer_stock.avg_cost_usd + v_cost) / (public.dealer_stock.qty + excluded.qty), 6)
                          else excluded.avg_cost_usd end,
      qty = public.dealer_stock.qty + excluded.qty,
      sku = coalesce(excluded.sku, public.dealer_stock.sku), name = coalesce(excluded.name, public.dealer_stock.name), updated_at = now()
    returning * into v_ds;
    insert into public.dealer_stock_moves (dealer_id, type, pid, sku, name, qty, cost_usd, reason)
    values (p_dealer_id, 'send', v_pid, left(v_lbl->>'sku', 80), left(v_lbl->>'name', 300), v_qty, round(v_cost / v_qty, 6),
            case when p_order_id is not null then 'Buyurtma #' || p_order_id end);
    v_total := v_total + v_cost;
    v_items := v_items || jsonb_build_object('pid', v_pid, 'qty', v_qty, 'costUsd', round(v_cost / v_qty, 6), 'firstCost', (x->>'firstCost')::numeric,
                                             'dealerQty', v_ds.qty, 'dealerAvgCostUsd', v_ds.avg_cost_usd);
  end loop;
  update public.dealers set total_shipped_usd = round(total_shipped_usd + v_total, 4) where id = p_dealer_id returning * into d;

  return public._ledger_op_finish(p_filial, p_op_key, 'dealer_ship',
    jsonb_build_object('ok', true, 'kind', 'dealer_ship', 'items', v_items, 'totalCostUsd', round(v_total, 4),
                       'orderId', p_order_id, 'dealer', public._dealer_json(d)),
    '{}', '{}', public._ledger_op_batch_ids(p_filial, p_op_key || ':out'), p_staff_id, p_staff_name);
end;
$$;

-- ── 4. Dillerdan qaytarish ─────────────────────────────────────────────
-- p_items: [{pid, qty, condition, reason, localId, bno, sku, name}] — localId: sotiladigan holatdagi
-- qaytgan tovar uchun firma omboridagi yangi partiya ID'si (brauzer barqaror kalit beradi)
create or replace function public.dealer_return_atomic(
  p_filial text, p_op_key text, p_dealer_id bigint, p_items jsonb,
  p_staff_id bigint default null, p_staff_name text default null)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  v_r jsonb;
  d public.dealers;
  e jsonb;
  v_pid bigint;
  v_qty numeric;
  v_ds public.dealer_stock;
  v_sellable boolean;
  v_batches jsonb := '[]'::jsonb;
  v_items jsonb := '[]'::jsonb;
  v_bids bigint[] := '{}';
  v_total numeric := 0;
begin
  v_r := public._ledger_op_replay(p_filial, p_op_key, 'dealer_return');
  if v_r is not null then return v_r; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 500 then
    raise exception 'LEDGER: mahsulotlar ro''yxati noto''g''ri' using errcode = 'P0001';
  end if;
  d := public._dealer_lock(p_filial, p_dealer_id);
  for e in select * from jsonb_array_elements(p_items) order by public._fw_num(value->>'pid') loop
    if coalesce(e->>'pid', '') !~ '^[0-9]{1,18}$' or public._fw_num(e->>'qty') <= 0 or public._fw_num(e->>'qty') > 1000000 then
      raise exception 'LEDGER: mahsulot qatori noto''g''ri' using errcode = 'P0001';
    end if;
    v_pid := (e->>'pid')::bigint;
    v_qty := public._fw_num(e->>'qty');
    select * into v_ds from public.dealer_stock where dealer_id = p_dealer_id and pid = v_pid for update;
    if not found or v_ds.qty < v_qty then
      raise exception 'LEDGER: dillerda yetarli qoldiq yo''q (pid=%, bor: %, so''ralgan: %)', v_pid, coalesce(v_ds.qty, 0), v_qty using errcode = 'P0001';
    end if;
    update public.dealer_stock set qty = qty - v_qty, updated_at = now() where id = v_ds.id returning * into v_ds;
    insert into public.dealer_stock_moves (dealer_id, type, pid, sku, name, qty, cost_usd, reason, condition)
    values (p_dealer_id, 'return', v_pid, coalesce(v_ds.sku, left(e->>'sku', 80)), coalesce(v_ds.name, left(e->>'name', 300)), v_qty, v_ds.avg_cost_usd,
            left(e->>'reason', 300), left(e->>'condition', 40));
    v_sellable := coalesce(e->>'condition', '') in ('Yangi', 'Yaxshi');
    if v_sellable then
      if coalesce(e->>'localId', '') !~ '^[0-9A-Za-z_.:-]{1,64}$' then
        raise exception 'LEDGER: qaytgan partiya ID noto''g''ri' using errcode = 'P0001';
      end if;
      v_batches := v_batches || jsonb_build_object('localId', e->>'localId', 'pid', v_pid, 'qty', v_qty, 'costUsd', v_ds.avg_cost_usd,
                     'meta', jsonb_build_object('bno', left(e->>'bno', 20), 'origin', 'Dillerdan qaytdi (' || left(e->>'condition', 40) || ')', 'date', current_date::text));
    end if;
    v_total := v_total + v_qty * v_ds.avg_cost_usd;
    v_items := v_items || jsonb_build_object('pid', v_pid, 'qty', v_qty, 'costUsd', v_ds.avg_cost_usd, 'sellable', v_sellable,
                                             'dealerQty', v_ds.qty, 'dealerAvgCostUsd', v_ds.avg_cost_usd);
  end loop;
  if jsonb_array_length(v_batches) > 0 then
    perform public.stock_debt_op(p_filial, p_op_key || ':in', 'batches_create',
              jsonb_build_object('reason', 'dealer_return', 'batches', v_batches), p_staff_id, p_staff_name);
    v_bids := public._ledger_op_batch_ids(p_filial, p_op_key || ':in');
  end if;
  return public._ledger_op_finish(p_filial, p_op_key, 'dealer_return',
    jsonb_build_object('ok', true, 'kind', 'dealer_return', 'items', v_items, 'totalCostUsd', round(v_total, 4), 'dealer', public._dealer_json(d)),
    '{}', '{}', v_bids, p_staff_id, p_staff_name);
end;
$$;

-- ── 5. Admin diller savdosini yozadi ───────────────────────────────────
-- p_items: [{pid, qty, priceUsd, sku, name}], p_pct — diller xizmat haqi % (0–100, xodim belgilaydi)
-- Qarz = Σ(miqdor×narx) × (1 − p_pct/100); ballar — mahsulot pointPct (app_data) va Sozlamalar
-- (pointUsdValue, pointRoundStep) bo'yicha — brauzerdagi calcDealerPoints bilan bir xil formula.
-- v24.5: dealer_sales.source (32) yozilmaydi — null = oddiy savdo (reviziya yozuvlari 'revision_*' bilan ajralib turadi).
-- Bu yo'l faqat xodim («dillerlar.manage») uchun; dillerning o'zi sotishi record_dealer_sale (−10% chegarasi) orqali qoladi.
create or replace function public.dealer_sale_record_atomic(
  p_filial text, p_op_key text, p_dealer_id bigint, p_items jsonb, p_pct numeric,
  p_staff_id bigint default null, p_staff_name text default null)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  v_r jsonb;
  d public.dealers;
  e jsonb;
  v_pid bigint;
  v_qty numeric;
  v_price numeric;
  v_ds public.dealer_stock;
  v_main jsonb;
  v_usd_val numeric;
  v_step numeric;
  v_ppct numeric;
  v_line numeric;
  v_total numeric := 0;
  v_profit numeric := 0;
  v_points numeric := 0;
  v_owed numeric;
  v_items jsonb := '[]'::jsonb;
begin
  v_r := public._ledger_op_replay(p_filial, p_op_key, 'dealer_sale');
  if v_r is not null then return v_r; end if;
  if p_pct is null or p_pct = 'NaN'::numeric or p_pct < 0 or p_pct > 100 then
    raise exception 'LEDGER: xizmat haqi foizi noto''g''ri' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 500 then
    raise exception 'LEDGER: mahsulotlar ro''yxati noto''g''ri' using errcode = 'P0001';
  end if;
  d := public._dealer_lock(p_filial, p_dealer_id);
  select data into v_main from public.app_data where id = 'main';
  v_usd_val := coalesce(public._fw_num(v_main->'settings'->>'pointUsdValue'), 0);
  if v_main->'settings'->>'pointUsdValue' is null then v_usd_val := 2; end if;
  v_step := coalesce(nullif(public._fw_num(v_main->'settings'->>'pointRoundStep'), 0), 1);
  for e in select * from jsonb_array_elements(p_items) order by public._fw_num(value->>'pid') loop
    v_qty := public._fw_num(e->>'qty');
    v_price := public._fw_num(e->>'priceUsd');
    if coalesce(e->>'pid', '') !~ '^[0-9]{1,18}$' or v_qty <= 0 or v_qty > 1000000 or v_price <= 0 or v_price > 1000000000 then
      raise exception 'LEDGER: mahsulot qatori noto''g''ri' using errcode = 'P0001';
    end if;
    v_pid := (e->>'pid')::bigint;
    select * into v_ds from public.dealer_stock where dealer_id = p_dealer_id and pid = v_pid for update;
    if not found or v_ds.qty < v_qty then
      raise exception 'LEDGER: dillerda yetarli qoldiq yo''q (pid=%, bor: %, so''ralgan: %)', v_pid, coalesce(v_ds.qty, 0), v_qty using errcode = 'P0001';
    end if;
    update public.dealer_stock set qty = qty - v_qty, updated_at = now() where id = v_ds.id returning * into v_ds;
    v_line := v_qty * v_price;
    insert into public.dealer_sales (dealer_id, pid, sku, name, qty, sell_usd, total_usd, sale_date)
    values (p_dealer_id, v_pid, coalesce(v_ds.sku, left(e->>'sku', 80)), coalesce(v_ds.name, left(e->>'name', 300)), v_qty, v_price, round(v_line, 2), current_date);
    select public._fw_num(p->>'pointPct') into v_ppct from jsonb_array_elements(coalesce(v_main->'products', '[]'::jsonb)) p
     where p->>'id' = v_pid::text limit 1;
    if coalesce(v_ppct, 0) > 0 and v_usd_val > 0 then
      v_points := v_points + round(((v_line * v_ppct / 100) / v_usd_val) / v_step) * v_step;
    end if;
    v_total := v_total + v_line;
    v_profit := v_profit + (v_price - v_ds.avg_cost_usd) * v_qty;
    v_items := v_items || jsonb_build_object('pid', v_pid, 'qty', v_qty, 'priceUsd', v_price, 'costUsd', v_ds.avg_cost_usd, 'dealerQty', v_ds.qty);
  end loop;
  v_owed := round(v_total - v_total * p_pct / 100, 4);
  update public.dealers set debt_usd = round(debt_usd + v_owed, 4), total_sold_usd = round(total_sold_usd + v_owed, 4), points = points + v_points
   where id = p_dealer_id returning * into d;
  return public._ledger_op_finish(p_filial, p_op_key, 'dealer_sale',
    jsonb_build_object('ok', true, 'kind', 'dealer_sale', 'items', v_items, 'saleTotalUsd', round(v_total, 4), 'commissionPct', p_pct,
                       'owedUsd', v_owed, 'profitUsd', round(v_profit - v_total * p_pct / 100, 4), 'points', v_points, 'dealer', public._dealer_json(d)),
    '{}', '{}', '{}', p_staff_id, p_staff_name);
end;
$$;

-- Server funksiyasi uchun belgi: 35 qo'llanganmi (eski mutlaq qiymat yozish yo'llari shunda yopiladi)
create or replace function public.dealer_atomic_available()
 returns boolean
 language sql
 stable
 set search_path = ''
as $$ select true $$;

-- ── 7. Xavfsizlik: eski funksiyalarga qat'iy search_path (Supabase advisor 0011 — function_search_path_mutable) ──
-- Funksiya tanalarida jadval nomlari sxemasiz yozilgan, shuning uchun '' emas — `public, pg_temp`
-- (pg_temp oxirida — vaqtinchalik sxema orqali nom almashtirib bo'lmaydi). Funksiya bo'lmasa — o'tkazib yuboriladi.
do $$
declare f text;
begin
  foreach f in array array[
    'public.login_check_lock(text)', 'public.login_record_failure(text)', 'public.login_record_success(text)',
    'public.dealer_sale_atomic(bigint,jsonb,date)', 'public.sale_checkout_atomic(text,jsonb,numeric,numeric,bigint,bigint,numeric,text)',
    'public.partner_archive_atomic(bigint)', 'public.partner_ledger_add_atomic(bigint,text,numeric,text,text,text,text)',
    'public.partner_upsert_atomic(bigint,text,boolean,numeric,text,text,numeric,text,numeric)',
    'public.partner_monthly_calc_atomic(text,date,date,numeric,numeric)', 'public.partner_undo_period_atomic(text,boolean)'] loop
    if to_regprocedure(f) is not null then
      execute format('alter function %s set search_path = public, pg_temp', f);
    end if;
  end loop;
end $$;

-- ── 6. Huquqlar: faqat server (service_role) ───────────────────────────
revoke all on function public._dealer_json(public.dealers) from public, anon, authenticated;
revoke all on function public._ledger_op_batch_ids(text, text) from public, anon, authenticated;
revoke all on function public._dealer_lock(text, bigint) from public, anon, authenticated;
revoke all on function public.dealer_ship_atomic(text, text, bigint, jsonb, bigint, bigint, text) from public, anon, authenticated;
revoke all on function public.dealer_return_atomic(text, text, bigint, jsonb, bigint, text) from public, anon, authenticated;
revoke all on function public.dealer_sale_record_atomic(text, text, bigint, jsonb, numeric, bigint, text) from public, anon, authenticated;
revoke all on function public.dealer_atomic_available() from public, anon, authenticated;
grant execute on function public.dealer_ship_atomic(text, text, bigint, jsonb, bigint, bigint, text) to service_role;
grant execute on function public.dealer_return_atomic(text, text, bigint, jsonb, bigint, text) to service_role;
grant execute on function public.dealer_sale_record_atomic(text, text, bigint, jsonb, numeric, bigint, text) to service_role;
grant execute on function public.dealer_atomic_available() to service_role;
