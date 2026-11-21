-- ════════════════════════════════════════════════════════════════════
-- 29-MIGRATSIYA (v23.6): HISOBDAN CHIQARISH va B2B (ko'chirilgan tizimlar o'rtasida ta'minot)
--   A. Hisobdan chiqarish (buzilgan, muddati o'tgan, singan, yo'qolgan tovar):
--      stock_writeoffs hujjati + ombordan FIFO chiqim (stock_ledger 'writeoff') BITTA tranzaksiyada;
--      bekor qilish — aynan o'sha partiyalarga qaytariladi ('writeoff_cancel'). Zarar = tannarx × soni
--      (ilovada «Hisobdan chiqarish zarari» tizim xarajati bo'lib sof foydadan ayiriladi; kassaga tegmaydi).
--   B. B2B: ikki mustaqil nusxa (har biri o'z bazasi) havola+kod orqali ulanadi, IKKALA tomon o'z
--      huquqlarini beradi. Buyurtma → jo'natma (ta'minotchi omboridan FIFO chiqim) → qabul qiluvchi
--      sonini tekshirib tasdiqlaydi → uning omboriga kirim + ta'minotchiga qarz; ta'minotchi tomonida
--      xaridor (mijoz) qarzi — faqat tasdiqlangan son bo'yicha. Kelmay qolgan qism ta'minotchi omboriga
--      qaytariladi ('b2b_restock').
-- Faqat qo'shadi / kengaytiradi; ma'lumot o'chirmaydi; qayta ishga tushirish xavfsiz.
-- Talab: 27 va 28-migratsiyalar. Har doim 28 dan KEYIN.
-- Maxfiy qiymatlar (B2B kalitlari) faqat service_role o'qiydigan jadvalda; brauzerga hech qachon berilmaydi.
-- ════════════════════════════════════════════════════════════════════

-- ── 0. Bog'liqlik ──────────────────────────────────────────────────────
do $$ begin
  if to_regclass('public.stock_ledger') is null or to_regclass('public.ledger_ops') is null
     or not exists (select 1 from pg_proc where proname = '_stock_fifo_out')
     or not exists (select 1 from pg_proc where proname = 'firma_supplier_pay') then
    raise exception '29-migratsiya: avval 27 va 28-migratsiyalarni qo''llang';
  end if;
end $$;

-- ── 1. Amal turlari ────────────────────────────────────────────────────
alter table public.stock_ledger drop constraint if exists stock_ledger_kind_chk;
alter table public.stock_ledger add constraint stock_ledger_kind_chk check (op_kind in ('opening','archive','sale','sale_edit','sale_void','sale_return','kirim','import',
  'opening_stock','edit','delete','arrive','revision','transfer_out','transfer_in','dealer_out','dealer_return',
  'writeoff','writeoff_cancel','b2b_out','b2b_in','b2b_restock'));
alter table public.ledger_ops drop constraint if exists ledger_ops_kind_chk;
alter table public.ledger_ops add constraint ledger_ops_kind_chk check (kind in ('sale','sale_return','sale_void','sale_edit','cust_set','supp_set',
  'batches_create','batch_edit','batch_delete','batch_arrive','revision','stock_out','firma_supp_pay',
  'writeoff','writeoff_cancel','b2b_ship','b2b_receive','b2b_ack','b2b_restock'));
alter table public.supplier_debt_ledger drop constraint if exists supplier_debt_ledger_kind_chk;
alter table public.supplier_debt_ledger add constraint supplier_debt_ledger_kind_chk check (op_kind in ('opening','adjust','sale_direct','consignment','sale_return','kirim','import','batch_edit','payment',
  'writeoff_cancel','b2b_receive','b2b_restock'));
alter table public.customer_debt_ledger drop constraint if exists customer_debt_ledger_kind_chk;
alter table public.customer_debt_ledger add constraint customer_debt_ledger_kind_chk check (op_kind in ('opening','adjust','sale','sale_edit','sale_void','sale_return','payment',
  'b2b_ship'));

-- ── 2. Jadvallar ───────────────────────────────────────────────────────
create table if not exists public.stock_writeoffs (
  id bigint generated always as identity primary key,
  filial text not null,
  local_id text not null,
  doc_no text not null,
  reason text not null,
  note text,
  items jsonb not null default '[]'::jsonb,       -- [{pid, sku, name, qty, cost, allocs:[{batchId, localId, take, cost}]}]
  side jsonb not null default '[]'::jsonb,        -- konsignatsiya qarzi (bekor qilishda teskari)
  bd numeric not null default 0,                  -- filialning Bazaga tovar qarzi ulushi
  units numeric not null default 0,
  total_cost_usd numeric not null default 0,
  status text not null default 'active',
  wo_date date not null default current_date,
  created_at timestamp with time zone not null default now(),
  staff_id bigint, staff_name text,
  cancelled_at timestamp with time zone, cancel_staff text, cancel_note text,
  constraint stock_writeoffs_local_key unique (filial, local_id),
  constraint stock_writeoffs_reason_chk check (reason in ('damaged','expired','broken','lost','other')),
  constraint stock_writeoffs_status_chk check (status in ('active','cancelled')),
  constraint stock_writeoffs_text_len check (length(local_id) <= 64 and length(doc_no) <= 40 and coalesce(length(note),0) <= 500
    and coalesce(length(cancel_note),0) <= 500 and coalesce(length(staff_name),0) <= 200)
);
create index if not exists idx_stock_writeoffs_filial_date on public.stock_writeoffs (filial, wo_date desc);

create table if not exists public.b2b_links (
  id bigint generated always as identity primary key,
  link_uid text not null unique,
  filial text not null default 'baza',
  peer_url text, peer_name text, peer_link_uid text,
  status text not null default 'invited',
  local_approved boolean not null default false,
  peer_approved boolean not null default false,
  perm_catalog boolean not null default true,      -- hamkor BIZNING katalogni ko'ra oladi
  perm_order boolean not null default true,        -- hamkor BIZGA buyurtma bera oladi
  we_supply boolean not null default true,         -- biz unga ta'minotchimiz
  they_supply boolean not null default true,       -- u bizga ta'minotchi
  supplier_local_id bigint,                        -- bizdagi «ta'minotchi» yozuvi (u bizga yetkazsa)
  customer_local_id bigint,                        -- bizdagi «mijoz» yozuvi (biz unga yetkazsak)
  inbound_token_hash text,                         -- hamkor bizga murojaatda ko'rsatadigan kalitning SHA-256 xeshi
  outbound_token text,                             -- biz hamkorga murojaatda ko'rsatadigan kalit (faqat server)
  invite_secret_hash text, invite_expires_at timestamp with time zone,
  note text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  approved_at timestamp with time zone,
  constraint b2b_links_status_chk check (status in ('invited','pending','active','paused','revoked')),
  constraint b2b_links_uid_chk check (link_uid ~ '^[A-Za-z0-9]{20,48}$' and (peer_link_uid is null or peer_link_uid ~ '^[A-Za-z0-9]{20,48}$')),
  constraint b2b_links_url_chk check (peer_url is null or (peer_url ~ '^https://[A-Za-z0-9.-]+(:[0-9]{2,5})?$' and length(peer_url) <= 200)),
  constraint b2b_links_text_len check (coalesce(length(peer_name),0) <= 120 and coalesce(length(note),0) <= 500 and filial ~ '^[a-z0-9_]{1,40}$')
);

create table if not exists public.b2b_orders (
  id bigint generated always as identity primary key,
  link_id bigint not null references public.b2b_links(id),
  filial text not null,
  order_uid text not null,
  direction text not null,                         -- 'out' — biz buyurtma berdik; 'in' — bizga buyurtma
  status text not null default 'draft',
  items jsonb not null default '[]'::jsonb,        -- [{peerPid, pid, sku, name, qty, priceUsd, confQty, confPrice}]
  total_usd numeric not null default 0,
  note text,
  delivered boolean not null default false,        -- hamkorga yetkazildimi (tarmoq)
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  staff_name text,
  constraint b2b_orders_uid_key unique (link_id, order_uid, direction),
  constraint b2b_orders_dir_chk check (direction in ('out','in')),
  constraint b2b_orders_status_chk check (status in ('draft','sent','confirmed','rejected','shipped','closed','cancelled')),
  constraint b2b_orders_text_len check (order_uid ~ '^[A-Za-z0-9_-]{8,64}$' and coalesce(length(note),0) <= 500)
);
create index if not exists idx_b2b_orders_link on public.b2b_orders (link_id, created_at desc);

create table if not exists public.b2b_shipments (
  id bigint generated always as identity primary key,
  link_id bigint not null references public.b2b_links(id),
  filial text not null,
  ship_uid text not null,
  order_uid text,
  direction text not null,                         -- 'out' — biz jo'natdik; 'in' — bizga keldi
  status text not null,                            -- out: sent → acked → (restocked) ; in: awaiting → received | rejected
  items jsonb not null default '[]'::jsonb,
  total_usd numeric not null default 0,
  received_total_usd numeric,
  rate_uzs numeric,
  delivered boolean not null default false,
  note text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  received_at timestamp with time zone,
  staff_name text,
  constraint b2b_shipments_uid_key unique (link_id, ship_uid, direction),
  constraint b2b_shipments_dir_chk check (direction in ('out','in')),
  constraint b2b_shipments_status_chk check (status in ('sent','acked','restocked','awaiting','received','rejected')),
  constraint b2b_shipments_text_len check (ship_uid ~ '^[A-Za-z0-9_-]{8,64}$' and (order_uid is null or order_uid ~ '^[A-Za-z0-9_-]{8,64}$')
    and coalesce(length(note),0) <= 500)
);
create index if not exists idx_b2b_shipments_link on public.b2b_shipments (link_id, created_at desc);

create table if not exists public.b2b_product_map (
  link_id bigint not null references public.b2b_links(id),
  peer_pid bigint not null,
  local_pid bigint not null,
  peer_sku text,
  updated_at timestamp with time zone not null default now(),
  primary key (link_id, peer_pid)
);

-- Hamkordan kelgan xabarlar — takroriy yetkazishni bir marta qo'llash uchun
create table if not exists public.b2b_inbound_log (
  link_id bigint not null references public.b2b_links(id),
  msg_id text not null,
  action text not null,
  result jsonb,
  created_at timestamp with time zone not null default now(),
  primary key (link_id, msg_id),
  constraint b2b_inbound_msg_chk check (msg_id ~ '^[A-Za-z0-9_:-]{8,100}$')
);

alter table public.stock_writeoffs enable row level security;
alter table public.b2b_links enable row level security;
alter table public.b2b_orders enable row level security;
alter table public.b2b_shipments enable row level security;
alter table public.b2b_product_map enable row level security;
alter table public.b2b_inbound_log enable row level security;
revoke all on public.stock_writeoffs, public.b2b_links, public.b2b_orders, public.b2b_shipments, public.b2b_product_map, public.b2b_inbound_log
  from anon, authenticated;
grant select, insert, update on public.stock_writeoffs, public.b2b_links, public.b2b_orders, public.b2b_shipments, public.b2b_product_map, public.b2b_inbound_log
  to service_role;
grant delete on public.b2b_product_map to service_role;

-- ── 3. HISOBDAN CHIQARISH ──────────────────────────────────────────────
-- p_doc: {localId, docNo, reason, note, date, items:[{pid, sku, name, qty}]}
create or replace function public.stock_writeoff_atomic(
  p_filial text, p_op_key text, p_doc jsonb, p_staff_id bigint default null, p_staff_name text default null)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  v_prev jsonb;
  v_key text := 'wo:' || p_op_key;
  v_e jsonb;
  v_n int := 0;
  v_pid bigint;
  v_qty numeric;
  v_fifo jsonb;
  v_side jsonb := '[]'::jsonb;
  v_bd numeric := 0;
  v_items jsonb := '[]'::jsonb;
  v_batches bigint[] := '{}';
  v_supps bigint[];
  v_units numeric := 0;
  v_total numeric := 0;
  v_local text := p_doc->>'localId';
  v_date date;
begin
  v_prev := public._ledger_op_replay(p_filial, p_op_key, 'writeoff');
  if v_prev is not null then return v_prev; end if;
  if coalesce(v_local, '') !~ '^[0-9A-Za-z_.:-]{1,64}$' then raise exception 'LEDGER: hujjat ID noto''g''ri' using errcode = 'P0001'; end if;
  if coalesce(p_doc->>'reason', '') not in ('damaged','expired','broken','lost','other') then
    raise exception 'LEDGER: sabab noto''g''ri' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_doc->'items') <> 'array' or jsonb_array_length(p_doc->'items') < 1 or jsonb_array_length(p_doc->'items') > 200 then
    raise exception 'LEDGER: mahsulotlar ro''yxati noto''g''ri' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.stock_writeoffs where filial = p_filial and local_id = v_local) then
    raise exception 'LEDGER: hujjat ID takrorlandi' using errcode = 'P0001';
  end if;
  v_date := case when coalesce(p_doc->>'date', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (p_doc->>'date')::date else current_date end;
  for v_e in select e from jsonb_array_elements(p_doc->'items') e order by public._fw_num(e->>'pid') loop
    v_n := v_n + 1;
    v_pid := public._fw_num(v_e->>'pid')::bigint;
    v_qty := public._fw_num(v_e->>'qty');
    if v_pid is null or v_pid <= 0 then raise exception 'LEDGER: mahsulot noto''g''ri' using errcode = 'P0001'; end if;
    v_fifo := public._stock_fifo_out(p_filial, v_pid, v_qty, 'writeoff', v_key || ':' || v_n, v_key, 'writeoff', v_local,
                                     'Hisobdan chiqarish: ' || (p_doc->>'reason'), p_staff_id, p_staff_name);
    v_side := v_side || (v_fifo->'side');
    v_bd := v_bd + (v_fifo->>'bd')::numeric;
    v_batches := v_batches || array(select (a->>'batchId')::bigint from jsonb_array_elements(v_fifo->'allocs') a);
    v_units := v_units + v_qty;
    v_total := v_total + (v_fifo->>'cost')::numeric;
    v_items := v_items || jsonb_build_object('pid', v_pid, 'sku', left(v_e->>'sku', 80), 'name', left(v_e->>'name', 300), 'qty', v_qty,
                                             'cost', (v_fifo->>'cost')::numeric, 'allocs', v_fifo->'allocs');
  end loop;
  v_supps := public._fw_apply_side_debts(p_filial, v_side, v_bd, v_key, v_key, 'writeoff', v_local, p_staff_id, p_staff_name);
  insert into public.stock_writeoffs (filial, local_id, doc_no, reason, note, items, side, bd, units, total_cost_usd, wo_date, staff_id, staff_name)
  values (p_filial, v_local, left(coalesce(p_doc->>'docNo', v_local), 40), p_doc->>'reason', left(p_doc->>'note', 500), v_items, v_side, v_bd,
          v_units, round(v_total, 4), v_date, p_staff_id, left(p_staff_name, 200));
  return public._ledger_op_finish(p_filial, p_op_key, 'writeoff',
    jsonb_build_object('ok', true, 'kind', 'writeoff', 'localId', v_local, 'units', v_units, 'totalCostUsd', round(v_total, 4), 'items', v_items),
    '{}', v_supps, v_batches, p_staff_id, p_staff_name);
end;
$$;

-- Bekor qilish: aynan o'sha partiyalarga qaytariladi (FIFO tannarxi saqlanadi), konsignatsiya qarzi va
-- filialning Bazaga qarzi teskari yoziladi. Partiya o'chirilgan bo'lsa — rad (jimgina emas).
create or replace function public.stock_writeoff_cancel(
  p_filial text, p_op_key text, p_local_id text, p_note text default null, p_staff_id bigint default null, p_staff_name text default null)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  v_prev jsonb;
  w public.stock_writeoffs;
  v_key text := 'woc:' || p_op_key;
  v_it jsonb;
  v_a jsonb;
  v_n int := 0;
  v_batches bigint[] := '{}';
  v_supps bigint[] := '{}';
  r record;
begin
  v_prev := public._ledger_op_replay(p_filial, p_op_key, 'writeoff_cancel');
  if v_prev is not null then return v_prev; end if;
  select * into w from public.stock_writeoffs where filial = p_filial and local_id = p_local_id for update;
  if not found then raise exception 'LEDGER: hujjat topilmadi' using errcode = 'P0001'; end if;
  if w.status <> 'active' then raise exception 'LEDGER: hujjat allaqachon bekor qilingan' using errcode = 'P0001'; end if;
  for v_it in select * from jsonb_array_elements(w.items) loop
    for v_a in select * from jsonb_array_elements(coalesce(v_it->'allocs', '[]'::jsonb)) order by public._fw_num(value->>'batchId') loop
      v_n := v_n + 1;
      perform public._stock_move((v_a->>'batchId')::bigint, 0, -public._fw_num(v_a->>'take'), 'writeoff_cancel', v_key || ':' || v_n,
                                 v_key, 'writeoff', w.local_id, 'Hisobdan chiqarish bekor qilindi', p_staff_id, p_staff_name);
      v_batches := v_batches || (v_a->>'batchId')::bigint;
    end loop;
  end loop;
  for r in select (e->>'supp')::bigint as supp, sum(public._fw_num(e->>'usd')) as usd from jsonb_array_elements(w.side) e group by 1 order by 1 loop
    continue when r.usd = 0;
    perform public._supp_debt_move(p_filial, r.supp, -r.usd, 0, 'strict', 'writeoff_cancel', v_key || ':s:' || r.supp, v_key, 'writeoff', w.local_id,
                                   'Hisobdan chiqarish bekor qilindi (konsignatsiya)', p_staff_id, p_staff_name);
    v_supps := v_supps || r.supp;
  end loop;
  if coalesce(w.bd, 0) > 0 then perform public._branch_debt_add(p_filial, -w.bd); end if;
  update public.stock_writeoffs set status = 'cancelled', cancelled_at = now(), cancel_staff = left(p_staff_name, 200), cancel_note = left(p_note, 500)
   where id = w.id;
  return public._ledger_op_finish(p_filial, p_op_key, 'writeoff_cancel',
    jsonb_build_object('ok', true, 'kind', 'writeoff_cancel', 'localId', w.local_id, 'totalCostUsd', w.total_cost_usd),
    '{}', v_supps, v_batches, p_staff_id, p_staff_name);
end;
$$;

-- ── 4. B2B: jo'natish (ta'minotchi tomoni) ─────────────────────────────
-- p_ship: {shipUid, orderUid, note, items:[{pid, sku, name, qty, priceUsd}]}
create or replace function public.b2b_ship_atomic(
  p_filial text, p_op_key text, p_link_id bigint, p_ship jsonb, p_staff_id bigint default null, p_staff_name text default null)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  v_prev jsonb;
  l public.b2b_links;
  v_key text := 'b2s:' || p_op_key;
  v_uid text := p_ship->>'shipUid';
  v_e jsonb;
  v_n int := 0;
  v_pid bigint;
  v_qty numeric;
  v_price numeric;
  v_fifo jsonb;
  v_side jsonb := '[]'::jsonb;
  v_bd numeric := 0;
  v_items jsonb := '[]'::jsonb;
  v_batches bigint[] := '{}';
  v_supps bigint[];
  v_total numeric := 0;
begin
  v_prev := public._ledger_op_replay(p_filial, p_op_key, 'b2b_ship');
  if v_prev is not null then return v_prev; end if;
  select * into l from public.b2b_links where id = p_link_id for update;
  if not found or l.status <> 'active' or not l.local_approved or not l.we_supply then
    raise exception 'LEDGER: B2B ulanish faol emas yoki siz bu hamkorga ta''minotchi emassiz' using errcode = 'P0001';
  end if;
  if l.filial <> p_filial then raise exception 'LEDGER: B2B ulanish boshqa filialga tegishli' using errcode = 'P0001'; end if;
  if coalesce(v_uid, '') !~ '^[A-Za-z0-9_-]{8,64}$' then raise exception 'LEDGER: jo''natma ID noto''g''ri' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_ship->'items') <> 'array' or jsonb_array_length(p_ship->'items') < 1 or jsonb_array_length(p_ship->'items') > 300 then
    raise exception 'LEDGER: mahsulotlar ro''yxati noto''g''ri' using errcode = 'P0001';
  end if;
  for v_e in select e from jsonb_array_elements(p_ship->'items') e order by public._fw_num(e->>'pid') loop
    v_n := v_n + 1;
    v_pid := public._fw_num(v_e->>'pid')::bigint;
    v_qty := public._fw_num(v_e->>'qty');
    v_price := public._fw_num(v_e->>'priceUsd');
    if v_pid is null or v_pid <= 0 then raise exception 'LEDGER: mahsulot noto''g''ri' using errcode = 'P0001'; end if;
    if v_price < 0 or v_price > 10000000 then raise exception 'LEDGER: narx noto''g''ri' using errcode = 'P0001'; end if;
    v_fifo := public._stock_fifo_out(p_filial, v_pid, v_qty, 'b2b_out', v_key || ':' || v_n, v_key, 'b2b_ship', v_uid,
                                     'B2B jo''natma: ' || left(coalesce(l.peer_name, ''), 100), p_staff_id, p_staff_name);
    v_side := v_side || (v_fifo->'side');
    v_bd := v_bd + (v_fifo->>'bd')::numeric;
    v_batches := v_batches || array(select (a->>'batchId')::bigint from jsonb_array_elements(v_fifo->'allocs') a);
    v_total := v_total + v_qty * v_price;
    v_items := v_items || jsonb_build_object('pid', v_pid, 'sku', left(v_e->>'sku', 80), 'name', left(v_e->>'name', 300), 'qty', v_qty,
                                             'priceUsd', v_price, 'cost', (v_fifo->>'cost')::numeric, 'allocs', v_fifo->'allocs', 'side', v_fifo->'side');
  end loop;
  v_supps := public._fw_apply_side_debts(p_filial, v_side, v_bd, v_key, v_key, 'b2b_ship', v_uid, p_staff_id, p_staff_name);
  insert into public.b2b_shipments (link_id, filial, ship_uid, order_uid, direction, status, items, total_usd, note, staff_name)
  values (l.id, p_filial, v_uid, nullif(p_ship->>'orderUid', ''), 'out', 'sent', v_items, round(v_total, 4), left(p_ship->>'note', 500), left(p_staff_name, 200));
  if coalesce(p_ship->>'orderUid', '') <> '' then
    update public.b2b_orders set status = 'shipped', updated_at = now()
     where link_id = l.id and order_uid = p_ship->>'orderUid' and direction = 'in' and status in ('sent','confirmed');
  end if;
  return public._ledger_op_finish(p_filial, p_op_key, 'b2b_ship',
    jsonb_build_object('ok', true, 'kind', 'b2b_ship', 'shipUid', v_uid, 'totalUsd', round(v_total, 4), 'items', v_items),
    '{}', v_supps, v_batches, p_staff_id, p_staff_name);
end;
$$;

-- ── 5. B2B: qabul qilish (xaridor tomoni) — sonini tekshirib tasdiqlaydi ─
-- p_lines: [{idx, localPid, receivedQty, batchLocalId}] — narx jo'natmadagidek (o'zgartirilmaydi)
create or replace function public.b2b_receive_atomic(
  p_filial text, p_op_key text, p_link_id bigint, p_ship_uid text, p_lines jsonb, p_meta jsonb default '{}'::jsonb,
  p_staff_id bigint default null, p_staff_name text default null)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  v_prev jsonb;
  l public.b2b_links;
  sh public.b2b_shipments;
  v_key text := 'b2r:' || p_op_key;
  v_e jsonb;
  v_it jsonb;
  v_idx int;
  v_rq numeric;
  v_pid bigint;
  v_price numeric;
  v_b public.batches;
  v_batches bigint[] := '{}';
  v_total numeric := 0;
  v_out jsonb := '[]'::jsonb;
  v_seen int[] := '{}';
begin
  v_prev := public._ledger_op_replay(p_filial, p_op_key, 'b2b_receive');
  if v_prev is not null then return v_prev; end if;
  select * into l from public.b2b_links where id = p_link_id for update;
  if not found or l.status <> 'active' or not l.local_approved or not l.they_supply or l.supplier_local_id is null then
    raise exception 'LEDGER: B2B ulanish faol emas yoki ta''minotchi yozuvi bog''lanmagan' using errcode = 'P0001';
  end if;
  if l.filial <> p_filial then raise exception 'LEDGER: B2B ulanish boshqa filialga tegishli' using errcode = 'P0001'; end if;
  select * into sh from public.b2b_shipments where link_id = l.id and ship_uid = p_ship_uid and direction = 'in' for update;
  if not found then raise exception 'LEDGER: jo''natma topilmadi' using errcode = 'P0001'; end if;
  if sh.status <> 'awaiting' then raise exception 'LEDGER: jo''natma allaqachon qabul qilingan yoki rad etilgan' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) <> jsonb_array_length(sh.items) then
    raise exception 'LEDGER: har bir qator uchun qabul qilingan son kerak' using errcode = 'P0001';
  end if;
  for v_e in select e from jsonb_array_elements(p_lines) e order by public._fw_num(e->>'idx') loop
    v_idx := public._fw_num(v_e->>'idx')::int;
    if v_idx < 0 or v_idx >= jsonb_array_length(sh.items) or v_idx = any(v_seen) then
      raise exception 'LEDGER: qator raqami noto''g''ri' using errcode = 'P0001';
    end if;
    v_seen := v_seen || v_idx;
    v_it := sh.items->v_idx;
    v_rq := public._fw_num(v_e->>'receivedQty');
    if v_rq < 0 or v_rq > public._fw_num(v_it->>'qty') + 0.000001 then
      raise exception 'LEDGER: qabul qilingan son jo''natilgandan ko''p bo''lishi mumkin emas (%)', left(v_it->>'name', 80) using errcode = 'P0001';
    end if;
    v_price := public._fw_num(v_it->>'priceUsd');
    if v_rq > 0 then
      v_pid := public._fw_num(v_e->>'localPid')::bigint;
      if v_pid is null or v_pid <= 0 then raise exception 'LEDGER: mahsulot moslashtirilmagan (%)', left(v_it->>'name', 80) using errcode = 'P0001'; end if;
      v_b := public._batch_insert(p_filial, v_e->>'batchLocalId', v_pid, v_rq, v_price, 'active',
               jsonb_build_object('origin', left('B2B — ' || coalesce(l.peer_name, 'hamkor'), 300), 'suppId', l.supplier_local_id::text,
                                  'bno', left(p_meta->>'bno', 20), 'date', p_meta->>'date', 'performedBy', p_staff_name),
               'b2b_in', v_key || ':' || v_idx, v_key, 'b2b_receive', p_ship_uid, p_staff_id, p_staff_name);
      v_batches := v_batches || v_b.id;
      v_total := v_total + v_rq * v_price;
      if coalesce(v_it->>'peerPid', '') ~ '^[0-9]{1,18}$' then
        insert into public.b2b_product_map (link_id, peer_pid, local_pid, peer_sku)
        values (l.id, (v_it->>'peerPid')::bigint, v_pid, left(v_it->>'sku', 80))
        on conflict (link_id, peer_pid) do update set local_pid = excluded.local_pid, peer_sku = excluded.peer_sku, updated_at = now();
      end if;
    end if;
    v_out := v_out || (v_it || jsonb_build_object('receivedQty', v_rq, 'localPid', nullif(public._fw_num(v_e->>'localPid'), 0)));
  end loop;
  if v_total > 0 then
    perform public._supp_debt_move(p_filial, l.supplier_local_id, round(v_total, 4), 0, 'strict', 'b2b_receive', v_key || ':debt', v_key,
                                   'b2b_receive', p_ship_uid, left('B2B qabul: ' || coalesce(l.peer_name, ''), 500), p_staff_id, p_staff_name);
  end if;
  update public.b2b_shipments set status = 'received', items = v_out, received_total_usd = round(v_total, 4), received_at = now(), updated_at = now()
   where id = sh.id;
  if sh.order_uid is not null then
    update public.b2b_orders set status = 'closed', updated_at = now() where link_id = l.id and order_uid = sh.order_uid and direction = 'out';
  end if;
  return public._ledger_op_finish(p_filial, p_op_key, 'b2b_receive',
    jsonb_build_object('ok', true, 'kind', 'b2b_receive', 'shipUid', p_ship_uid, 'receivedTotalUsd', round(v_total, 4), 'items', v_out),
    '{}', array[l.supplier_local_id], v_batches, p_staff_id, p_staff_name);
end;
$$;

-- ── 6. B2B: tasdiq (ta'minotchi tomoni) — xaridor qarzi faqat qabul qilingan son bo'yicha ─
-- p_lines: [{idx, receivedQty}]; p_rate — so'm kursi (mijoz qarzi so'mda yuritiladi)
create or replace function public.b2b_ack_apply(
  p_filial text, p_op_key text, p_link_id bigint, p_ship_uid text, p_lines jsonb, p_rate numeric)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  v_prev jsonb;
  l public.b2b_links;
  sh public.b2b_shipments;
  v_key text := 'b2a:' || p_op_key;
  v_e jsonb;
  v_it jsonb;
  v_idx int;
  v_rq numeric;
  v_total numeric := 0;
  v_out jsonb;
  v_debt numeric;
  v_custs bigint[] := '{}';
begin
  v_prev := public._ledger_op_replay(p_filial, p_op_key, 'b2b_ack');
  if v_prev is not null then return v_prev; end if;
  select * into l from public.b2b_links where id = p_link_id for update;
  if not found or l.status = 'revoked' then raise exception 'LEDGER: B2B ulanish topilmadi' using errcode = 'P0001'; end if;
  select * into sh from public.b2b_shipments where link_id = l.id and ship_uid = p_ship_uid and direction = 'out' for update;
  if not found then raise exception 'LEDGER: jo''natma topilmadi' using errcode = 'P0001'; end if;
  if sh.status <> 'sent' then raise exception 'LEDGER: jo''natma allaqachon tasdiqlangan' using errcode = 'P0001'; end if;
  if p_rate is null or p_rate <= 0 or p_rate > 1000000 then raise exception 'LEDGER: kurs noto''g''ri' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) <> jsonb_array_length(sh.items) then
    raise exception 'LEDGER: tasdiq qatorlari noto''g''ri' using errcode = 'P0001';
  end if;
  v_out := sh.items;
  for v_e in select e from jsonb_array_elements(p_lines) e loop
    v_idx := public._fw_num(v_e->>'idx')::int;
    if v_idx < 0 or v_idx >= jsonb_array_length(sh.items) then raise exception 'LEDGER: qator raqami noto''g''ri' using errcode = 'P0001'; end if;
    v_it := sh.items->v_idx;
    v_rq := public._fw_num(v_e->>'receivedQty');
    if v_rq < 0 or v_rq > public._fw_num(v_it->>'qty') + 0.000001 then raise exception 'LEDGER: tasdiqlangan son noto''g''ri' using errcode = 'P0001'; end if;
    v_total := v_total + v_rq * public._fw_num(v_it->>'priceUsd');
    v_out := jsonb_set(v_out, array[v_idx::text], v_it || jsonb_build_object('receivedQty', v_rq));
  end loop;
  if v_total > 0 and l.customer_local_id is not null then
    v_debt := public._cust_debt_move(p_filial, l.customer_local_id, round(v_total * p_rate, 2), 'strict', 'b2b_ship', v_key || ':debt', v_key,
                                     'b2b_ship', p_ship_uid, left('B2B jo''natma: ' || coalesce(l.peer_name, ''), 500), null, 'B2B');
    v_custs := array[l.customer_local_id];
  end if;
  update public.b2b_shipments set status = 'acked', items = v_out, received_total_usd = round(v_total, 4), rate_uzs = p_rate,
         received_at = now(), updated_at = now()
   where id = sh.id;
  return public._ledger_op_finish(p_filial, p_op_key, 'b2b_ack',
    jsonb_build_object('ok', true, 'kind', 'b2b_ack', 'shipUid', p_ship_uid, 'receivedTotalUsd', round(v_total, 4)),
    v_custs, '{}', '{}', null, 'B2B');
end;
$$;

-- ── 7. B2B: kelmay qolgan qismni ta'minotchi omboriga qaytarish ──────────
-- Faqat tasdiqlangan (acked) jo'natma; har qator: (jo'natilgan − qabul qilingan) — FIFO bo'yicha
-- oxirgi olingan partiyalarga qaytariladi; konsignatsiya qarzi mutanosib teskari yoziladi.
create or replace function public.b2b_restock_atomic(
  p_filial text, p_op_key text, p_link_id bigint, p_ship_uid text, p_staff_id bigint default null, p_staff_name text default null)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  v_prev jsonb;
  sh public.b2b_shipments;
  v_key text := 'b2x:' || p_op_key;
  v_it jsonb;
  v_a jsonb;
  v_diff numeric;
  v_take numeric;
  v_n int := 0;
  v_batches bigint[] := '{}';
  v_supps bigint[] := '{}';
  v_units numeric := 0;
  r record;
  v_side jsonb := '[]'::jsonb;
begin
  v_prev := public._ledger_op_replay(p_filial, p_op_key, 'b2b_restock');
  if v_prev is not null then return v_prev; end if;
  select * into sh from public.b2b_shipments where link_id = p_link_id and ship_uid = p_ship_uid and direction = 'out' and filial = p_filial for update;
  if not found then raise exception 'LEDGER: jo''natma topilmadi' using errcode = 'P0001'; end if;
  if sh.status <> 'acked' then raise exception 'LEDGER: faqat tasdiqlangan jo''natmaning farqini qaytarish mumkin' using errcode = 'P0001'; end if;
  for v_it in select * from jsonb_array_elements(sh.items) loop
    v_diff := public._fw_num(v_it->>'qty') - public._fw_num(v_it->>'receivedQty');
    continue when v_diff <= 0.000001;
    v_units := v_units + v_diff;
    -- konsignatsiya qarzi: shu qatordagi ulushga mutanosib
    if jsonb_typeof(v_it->'side') = 'array' and public._fw_num(v_it->>'qty') > 0 then
      select v_side || coalesce(jsonb_agg(jsonb_build_object('supp', e->>'supp', 'usd', public._fw_num(e->>'usd') * v_diff / public._fw_num(v_it->>'qty')))
        , '[]'::jsonb) into v_side from jsonb_array_elements(v_it->'side') e;
    end if;
    for v_a in select t.value from jsonb_array_elements(coalesce(v_it->'allocs', '[]'::jsonb)) with ordinality t(value, o) order by t.o desc loop
      exit when v_diff <= 0.000001;
      v_take := least(public._fw_num(v_a->>'take'), v_diff);
      v_n := v_n + 1;
      perform public._stock_move((v_a->>'batchId')::bigint, 0, -v_take, 'b2b_restock', v_key || ':' || v_n, v_key, 'b2b_ship', sh.ship_uid,
                                 'B2B: kelmay qolgan qism omborga qaytdi', p_staff_id, p_staff_name);
      v_batches := v_batches || (v_a->>'batchId')::bigint;
      v_diff := v_diff - v_take;
    end loop;
  end loop;
  if v_units <= 0 then raise exception 'LEDGER: qaytariladigan farq yo''q' using errcode = 'P0001'; end if;
  for r in select (e->>'supp')::bigint as supp, sum(public._fw_num(e->>'usd')) as usd from jsonb_array_elements(v_side) e group by 1 order by 1 loop
    continue when r.usd = 0;
    perform public._supp_debt_move(p_filial, r.supp, -round(r.usd, 4), 0, 'strict', 'b2b_restock', v_key || ':s:' || r.supp, v_key, 'b2b_ship', sh.ship_uid,
                                   'B2B: qaytgan qism (konsignatsiya)', p_staff_id, p_staff_name);
    v_supps := v_supps || r.supp;
  end loop;
  update public.b2b_shipments set status = 'restocked', updated_at = now() where id = sh.id;
  return public._ledger_op_finish(p_filial, p_op_key, 'b2b_restock',
    jsonb_build_object('ok', true, 'kind', 'b2b_restock', 'shipUid', sh.ship_uid, 'units', v_units),
    '{}', v_supps, v_batches, p_staff_id, p_staff_name);
end;
$$;

-- ── 8. Huquqlar ────────────────────────────────────────────────────────
revoke all on function public.stock_writeoff_atomic(text, text, jsonb, bigint, text) from public, anon, authenticated;
revoke all on function public.stock_writeoff_cancel(text, text, text, text, bigint, text) from public, anon, authenticated;
revoke all on function public.b2b_ship_atomic(text, text, bigint, jsonb, bigint, text) from public, anon, authenticated;
revoke all on function public.b2b_receive_atomic(text, text, bigint, text, jsonb, jsonb, bigint, text) from public, anon, authenticated;
revoke all on function public.b2b_ack_apply(text, text, bigint, text, jsonb, numeric) from public, anon, authenticated;
revoke all on function public.b2b_restock_atomic(text, text, bigint, text, bigint, text) from public, anon, authenticated;
grant execute on function public.stock_writeoff_atomic(text, text, jsonb, bigint, text) to service_role;
grant execute on function public.stock_writeoff_cancel(text, text, text, text, bigint, text) to service_role;
grant execute on function public.b2b_ship_atomic(text, text, bigint, jsonb, bigint, text) to service_role;
grant execute on function public.b2b_receive_atomic(text, text, bigint, text, jsonb, jsonb, bigint, text) to service_role;
grant execute on function public.b2b_ack_apply(text, text, bigint, text, jsonb, numeric) to service_role;
grant execute on function public.b2b_restock_atomic(text, text, bigint, text, bigint, text) to service_role;

-- Ruxsat kalitlari (owner/administrator — barchasi; ombor mudiri — hisobdan chiqarish)
do $$ begin
  if to_regclass('public.permissions') is not null then
    insert into public.permissions (key, module, label) values
      ('ombor.writeoff', 'ombor', 'Tovarni hisobdan chiqarish (buzilgan, muddati o''tgan, singan)'),
      ('b2b.view', 'b2b', 'B2B hamkorlarni, buyurtma va jo''natmalarni ko''rish'),
      ('b2b.order', 'b2b', 'B2B hamkordan buyurtma berish va kelgan tovarni qabul qilish'),
      ('b2b.ship', 'b2b', 'B2B hamkor buyurtmasini tasdiqlash va jo''natish')
    on conflict (key) do nothing;
    if to_regclass('public.role_permissions') is not null and to_regclass('public.roles') is not null then
      insert into public.role_permissions (role_id, permission_id)
        select r.id, p.id from public.roles r join public.permissions p on p.key in ('ombor.writeoff', 'b2b.view', 'b2b.order', 'b2b.ship')
        where r.key in ('owner', 'administrator')
      on conflict do nothing;
      insert into public.role_permissions (role_id, permission_id)
        select r.id, p.id from public.roles r join public.permissions p on p.key = 'ombor.writeoff'
        where r.key = 'warehouse_manager'
      on conflict do nothing;
    end if;
  end if;
end $$;
