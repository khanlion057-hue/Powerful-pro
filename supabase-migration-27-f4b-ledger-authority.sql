-- ════════════════════════════════════════════════════════════════════
-- Migratsiya 27 (v23.2, 2026-10-02) — F4b: MIJOZ QARZI, TA'MINOTCHI QARZI VA
-- OMBOR QOLDIG'I (sold/qty) — SERVER HAQIQIY MANBA.
-- 24 va 25-migratsiyalardan KEYIN qo'llanadi (26 ga bog'liq emas).
-- Takroriy ishga tushirish xavfsiz. Mavjud ma'lumot o'chirilmaydi.
--
-- MUAMMO (F4b, final gate dalili — tests/evidence/f4b-gap-evidence.js):
--  • mijoz va ta'minotchi qarzi, partiya qoldig'i (sold/qty) BRAUZERDA hisoblanib,
--    JSON (app_data_branches) sifatida saqlanardi; server to'lov chegarasini shu
--    eskirgan JSON'dan tekshirardi → ikki qurilmadan qarzdan ortiq to'lov o'tardi;
--  • brauzerning eski nusxasi SQL partiya qoldig'ini qayta yozardi → ortiqcha sotuv.
--
-- YECHIM (F4 — kassa — bilan bir xil yondashuv; yangi parallel buxgalteriya yo'q):
--  1) customer_balances (so'm) va supplier_balances ($) — HAQIQIY qoldiq. Yozish faqat
--     _cust_debt_move / _supp_debt_move orqali (trigger boshqa yozishni rad etadi),
--     har bir o'zgarish o'zgarmas jurnalga (customer_debt_ledger / supplier_debt_ledger).
--  2) batches — qty/sold/status/tannarx faqat _stock_move / _batch_insert orqali
--     (trigger), har bir harakat stock_ledger'da; FIFO serverda, qator qulfi bilan.
--  3) sales — savdo hujjati serverda (local_id bilan); qaytarish, tahrir va o'chirish
--     SERVERDAGI savdo yozuvidan hisoblanadi (brauzer yuborgan summa emas).
--  4) Murakkab amallar (savdo, qaytarish, kirim, reviziya, ko'chirish...) — BITTA
--     tranzaksiyada: kassa + qarz + ombor; ledger_ops orqali idempotent (takror → replay).
--  5) cash_payment_atomic — mijoz/ta'minotchi qarzi qatori QULFLANADI va qarzdan ortiq
--     to'lov bazada rad etiladi (kassa harakati ham bekor bo'ladi).
--  6) Filialning Bazaga tovar qarzi (app_data.branchDebt) — sotuvda serverda oshadi.
--  7) Boshlang'ich qiymatlar hozirgi JSON'dan BIR MARTA ko'chiriladi ('opening' yozuvi).
--
-- Kirish: faqat server (service_role). Brauzer (anon/authenticated) — yo'q.
-- ════════════════════════════════════════════════════════════════════

-- ── 0. Bog'liqlik ──────────────────────────────────────────────────────
do $$ begin
  if to_regclass('public.cashbox_ledger') is null or not exists (select 1 from pg_proc where proname = 'cash_payment_atomic') then
    raise exception '27-migratsiya: avval 24 va 25-migratsiyalarni qo''llang';
  end if;
end $$;

-- ── 1. Ustunlar (faqat qo'shiladi) ─────────────────────────────────────
alter table public.customer_balances add column if not exists currency text not null default 'UZS';
alter table public.supplier_balances add column if not exists currency text not null default 'USD';
alter table public.supplier_balances add column if not exists total_paid numeric not null default 0;

alter table public.batches add column if not exists from_branch text;
alter table public.batches add column if not exists kirim_ref text;
alter table public.batches add column if not exists fk_ref text;
alter table public.batches add column if not exists arrived_at date;
alter table public.batches add column if not exists deleted_at timestamp with time zone;
alter table public.batches add column if not exists edited_at timestamp with time zone;

alter table public.sales add column if not exists local_id text;
alter table public.sales add column if not exists pay_type text;
alter table public.sales add column if not exists box_id integer;
alter table public.sales add column if not exists mixed_rows jsonb;
alter table public.sales add column if not exists cust_name text;
alter table public.sales add column if not exists disc_usd numeric;
alter table public.sales add column if not exists sale_date date;
alter table public.sales add column if not exists status text not null default 'done';
alter table public.sales add column if not exists voided_at timestamp with time zone;
alter table public.sales add column if not exists edited_at timestamp with time zone;
alter table public.sales add column if not exists staff_id bigint;
alter table public.sales add column if not exists staff_name text;
alter table public.sales add column if not exists is_transfer boolean not null default false;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'customer_balances_currency_chk' and conrelid = 'public.customer_balances'::regclass) then
    alter table public.customer_balances add constraint customer_balances_currency_chk check (currency = 'UZS');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'supplier_balances_currency_chk' and conrelid = 'public.supplier_balances'::regclass) then
    alter table public.supplier_balances add constraint supplier_balances_currency_chk check (currency = 'USD');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_status_chk' and conrelid = 'public.sales'::regclass) then
    alter table public.sales add constraint sales_status_chk check (status in ('done','voided'));
  end if;
end $$;

create unique index if not exists sales_filial_local_id_uq on public.sales (filial, local_id) where local_id is not null;
create index if not exists idx_batches_fifo on public.batches (filial, pid, status, batch_date, id);

-- ── 2. Jurnallar (o'zgarmas) va amallar ro'yxati ──────────────────────
create table if not exists public.customer_debt_ledger (
  id bigint generated always as identity primary key,
  created_at timestamp with time zone not null default now(),
  filial text not null,
  customer_local_id bigint not null,
  delta numeric(20,2) not null,
  balance_after numeric(20,2) not null,
  op_kind text not null,
  op_key text not null,
  group_key text,
  ref_type text,
  ref_id text,
  note text,
  staff_id bigint,
  staff_name text,
  constraint customer_debt_ledger_op_key_key unique (filial, op_key),
  constraint customer_debt_ledger_kind_chk check (op_kind in ('opening','adjust','sale','sale_edit','sale_void','sale_return','payment')),
  constraint customer_debt_ledger_delta_chk check (delta <> 0 or op_kind = 'opening'),
  constraint customer_debt_ledger_text_len check (length(op_key) <= 160 and coalesce(length(note),0) <= 500
    and coalesce(length(staff_name),0) <= 200 and coalesce(length(ref_id),0) <= 100)
);
create index if not exists idx_cust_debt_ledger_party on public.customer_debt_ledger (filial, customer_local_id, id desc);

create table if not exists public.supplier_debt_ledger (
  id bigint generated always as identity primary key,
  created_at timestamp with time zone not null default now(),
  filial text not null,
  supplier_local_id bigint not null,
  delta numeric(20,4) not null,
  paid_delta numeric(20,4) not null default 0,
  balance_after numeric(20,4) not null,
  op_kind text not null,
  op_key text not null,
  group_key text,
  ref_type text,
  ref_id text,
  note text,
  staff_id bigint,
  staff_name text,
  constraint supplier_debt_ledger_op_key_key unique (filial, op_key),
  constraint supplier_debt_ledger_kind_chk check (op_kind in ('opening','adjust','sale_direct','consignment','sale_return','kirim','import','batch_edit','payment')),
  constraint supplier_debt_ledger_delta_chk check (delta <> 0 or paid_delta <> 0 or op_kind = 'opening'),
  constraint supplier_debt_ledger_text_len check (length(op_key) <= 160 and coalesce(length(note),0) <= 500
    and coalesce(length(staff_name),0) <= 200 and coalesce(length(ref_id),0) <= 100)
);
create index if not exists idx_supp_debt_ledger_party on public.supplier_debt_ledger (filial, supplier_local_id, id desc);

create table if not exists public.stock_ledger (
  id bigint generated always as identity primary key,
  created_at timestamp with time zone not null default now(),
  filial text not null,
  batch_id bigint not null references public.batches(id) on delete restrict,
  batch_local_id text not null,
  pid bigint not null,
  d_qty numeric not null default 0,
  d_sold numeric not null default 0,
  qty_after numeric not null,
  sold_after numeric not null,
  cost_usd numeric,
  status_after text,
  op_kind text not null,
  op_key text not null,
  group_key text,
  ref_type text,
  ref_id text,
  note text,
  staff_id bigint,
  staff_name text,
  constraint stock_ledger_op_key_key unique (filial, op_key),
  constraint stock_ledger_kind_chk check (op_kind in ('opening','archive','sale','sale_edit','sale_void','sale_return','kirim','import',
    'opening_stock','edit','delete','arrive','revision','transfer_out','transfer_in','dealer_out','dealer_return')),
  constraint stock_ledger_text_len check (length(op_key) <= 200 and coalesce(length(note),0) <= 500
    and coalesce(length(staff_name),0) <= 200 and coalesce(length(ref_id),0) <= 100)
);
create index if not exists idx_stock_ledger_batch on public.stock_ledger (batch_id, id desc);
create index if not exists idx_stock_ledger_ref on public.stock_ledger (filial, ref_type, ref_id) where ref_id is not null;

create table if not exists public.ledger_ops (
  id bigint generated always as identity primary key,
  created_at timestamp with time zone not null default now(),
  filial text not null,
  op_key text not null,
  kind text not null,
  result jsonb not null,
  staff_id bigint,
  staff_name text,
  constraint ledger_ops_op_key_key unique (filial, op_key),
  constraint ledger_ops_kind_chk check (kind in ('sale','sale_return','sale_void','sale_edit','cust_set','supp_set',
    'batches_create','batch_edit','batch_delete','batch_arrive','revision','stock_out')),
  constraint ledger_ops_text_len check (length(op_key) <= 140 and coalesce(length(staff_name),0) <= 200)
);

create or replace trigger customer_debt_ledger_immutable before update or delete on public.customer_debt_ledger
  for each row execute function public._ledger_immutable();
create or replace trigger supplier_debt_ledger_immutable before update or delete on public.supplier_debt_ledger
  for each row execute function public._ledger_immutable();
create or replace trigger stock_ledger_immutable before update or delete on public.stock_ledger
  for each row execute function public._ledger_immutable();
create or replace trigger ledger_ops_immutable before update or delete on public.ledger_ops
  for each row execute function public._ledger_immutable();

alter table public.customer_debt_ledger enable row level security;
alter table public.supplier_debt_ledger enable row level security;
alter table public.stock_ledger enable row level security;
alter table public.ledger_ops enable row level security;
revoke all on public.customer_debt_ledger, public.supplier_debt_ledger, public.stock_ledger, public.ledger_ops from anon, authenticated;
grant select, insert on public.customer_debt_ledger, public.supplier_debt_ledger, public.stock_ledger, public.ledger_ops to service_role;
grant usage on sequence public.customer_debt_ledger_id_seq, public.supplier_debt_ledger_id_seq, public.stock_ledger_id_seq, public.ledger_ops_id_seq to service_role;
-- Qoldiq jadvallari ham brauzerga yopiq (ikkinchi himoya qatlami; RLS allaqachon yoqilgan)
revoke all on public.customer_balances, public.supplier_balances, public.batches, public.sales from anon, authenticated;

-- ── 3. Qoldiqlarni faqat jurnal orqali o'zgartirish (triggerlar) ──────
create or replace function public._debt_balances_guard()
 returns trigger
 language plpgsql
 set search_path = ''
as $$
begin
  if coalesce(current_setting('fw.debt_move', true), '') = '1' then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' and coalesce(new.debt, 0) = 0 then
    return new;                                   -- bo'sh (0) qator — xavfsiz
  end if;
  if tg_op = 'UPDATE' and new.debt is not distinct from old.debt
     and (tg_table_name <> 'supplier_balances' or (to_jsonb(new)->'total_paid') is not distinct from (to_jsonb(old)->'total_paid')) then
    return new;                                   -- qarz o'zgarmagan
  end if;
  raise exception 'LEDGER: qarz faqat qarz jurnali orqali o''zgaradi' using errcode = 'P0001';
end;
$$;
create or replace trigger customer_balances_guard before insert or update or delete on public.customer_balances
  for each row execute function public._debt_balances_guard();
create or replace trigger supplier_balances_guard before insert or update or delete on public.supplier_balances
  for each row execute function public._debt_balances_guard();

create or replace function public._batches_guard()
 returns trigger
 language plpgsql
 set search_path = ''
as $$
begin
  if coalesce(current_setting('fw.stock_move', true), '') = '1' then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception 'LEDGER: partiyani o''chirib bo''lmaydi (holati "deleted" bo''ladi)' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then
    if coalesce(new.qty, 0) = 0 and coalesce(new.sold, 0) = 0 then return new; end if;
    raise exception 'LEDGER: ombor qoldig''i faqat ombor jurnali (stock_ledger) orqali o''zgaradi' using errcode = 'P0001';
  end if;
  if new.qty is not distinct from old.qty and new.sold is not distinct from old.sold
     and new.status is not distinct from old.status and new.cost_usd is not distinct from old.cost_usd
     and new.supp_id is not distinct from old.supp_id and new.consignment is not distinct from old.consignment
     and new.from_branch is not distinct from old.from_branch and new.filial is not distinct from old.filial
     and new.pid is not distinct from old.pid and new.local_id is not distinct from old.local_id then
    return new;                                   -- faqat izoh/meta o'zgargan
  end if;
  raise exception 'LEDGER: ombor qoldig''i faqat ombor jurnali (stock_ledger) orqali o''zgaradi' using errcode = 'P0001';
end;
$$;
create or replace trigger batches_guard before insert or update or delete on public.batches
  for each row execute function public._batches_guard();

-- ── 4. Yordamchi funksiyalar ───────────────────────────────────────────
create or replace function public._fw_num(p text)
 returns numeric
 language sql
 immutable
 set search_path = ''
as $$
  select case when p ~ '^\s*-?[0-9]{1,18}(\.[0-9]{1,40})?([eE][-+]?[0-9]{1,2})?\s*$' then trim(p)::numeric else 0 end;
$$;

create or replace function public._fw_rate()
 returns numeric
 language plpgsql
 stable
 set search_path = ''
as $$
declare v numeric;
begin
  select nullif(public._fw_num(data->'settings'->>'usdUzs'), 0) into v from public.app_data where id = 'main';
  if v is null or v <= 0 then
    raise exception 'LEDGER: USD/UZS kursi sozlanmagan' using errcode = 'P0001';
  end if;
  return v;
end;
$$;

-- Mijoz qarzi (so'm). p_mode: 'strict' — kamayish qarzdan (1 so'm chegarasi bilan) oshsa rad;
-- 'clamp' — 0 dan pastga tushmaydi (teskari amallar, avvalgi qoida: Math.max(0, ...));
-- 'set' — qo'lda belgilangan qiymat (boshlang'ich / tahrir; faqat ruxsatli xodim).
create or replace function public._cust_debt_move(
  p_filial text, p_cust bigint, p_delta numeric, p_mode text, p_kind text, p_op_key text,
  p_group_key text default null, p_ref_type text default null, p_ref_id text default null, p_note text default null,
  p_staff_id bigint default null, p_staff_name text default null)
 returns numeric
 language plpgsql
 set search_path = ''
as $$
declare
  v_bal numeric;
  v_new numeric;
begin
  if coalesce(p_filial, '') = '' or p_cust is null or p_cust <= 0 then
    raise exception 'LEDGER: mijoz noto''g''ri' using errcode = 'P0001';
  end if;
  if p_delta is null or p_delta = 'NaN'::numeric or abs(p_delta) > 1000000000000000 then
    raise exception 'LEDGER: qarz summasi noto''g''ri' using errcode = 'P0001';
  end if;
  perform set_config('fw.debt_move', '1', true);
  insert into public.customer_balances (filial, customer_local_id, debt, currency) values (p_filial, p_cust, 0, 'UZS')
    on conflict (filial, customer_local_id) do nothing;
  select debt into v_bal from public.customer_balances where filial = p_filial and customer_local_id = p_cust for update;
  v_bal := coalesce(v_bal, 0);
  if p_mode = 'set' then
    v_new := round(p_delta, 2);
    if v_new < 0 then raise exception 'LEDGER: qarz manfiy bo''lishi mumkin emas' using errcode = 'P0001'; end if;
  elsif p_mode = 'strict' then
    v_new := round(v_bal + p_delta, 2);
    if v_new < -1 then
      raise exception 'LEDGER: to''lov (% so''m) mijoz qarzidan (% so''m) oshib ketdi', round(-p_delta), round(v_bal) using errcode = 'P0001';
    end if;
    v_new := greatest(v_new, 0);
  elsif p_mode = 'clamp' then
    v_new := greatest(round(v_bal + p_delta, 2), 0);
  else
    raise exception 'LEDGER: noma''lum rejim' using errcode = 'P0001';
  end if;
  update public.customer_balances set debt = v_new, updated_at = now() where filial = p_filial and customer_local_id = p_cust;
  if v_new <> v_bal or p_kind = 'opening' then
    insert into public.customer_debt_ledger (filial, customer_local_id, delta, balance_after, op_kind, op_key, group_key, ref_type, ref_id, note, staff_id, staff_name)
    values (p_filial, p_cust, v_new - v_bal, v_new, p_kind, p_op_key, p_group_key, left(p_ref_type, 40), left(p_ref_id, 100), left(p_note, 500), p_staff_id, left(p_staff_name, 200));
  end if;
  perform set_config('fw.debt_move', '', true);
  return v_new;
end;
$$;

-- Ta'minotchi qarzi ($). Rejimlar — yuqoridagi kabi (chegara 0.01 $). p_paid_delta — jami to'langan.
create or replace function public._supp_debt_move(
  p_filial text, p_supp bigint, p_delta numeric, p_paid_delta numeric, p_mode text, p_kind text, p_op_key text,
  p_group_key text default null, p_ref_type text default null, p_ref_id text default null, p_note text default null,
  p_staff_id bigint default null, p_staff_name text default null)
 returns numeric
 language plpgsql
 set search_path = ''
as $$
declare
  v_bal numeric;
  v_new numeric;
  v_paid numeric := round(coalesce(p_paid_delta, 0), 4);
begin
  if coalesce(p_filial, '') = '' or p_supp is null or p_supp <= 0 then
    raise exception 'LEDGER: ta''minotchi noto''g''ri' using errcode = 'P0001';
  end if;
  if p_delta is null or p_delta = 'NaN'::numeric or abs(p_delta) > 1000000000000 or v_paid < 0 then
    raise exception 'LEDGER: qarz summasi noto''g''ri' using errcode = 'P0001';
  end if;
  perform set_config('fw.debt_move', '1', true);
  insert into public.supplier_balances (filial, supplier_local_id, debt, currency) values (p_filial, p_supp, 0, 'USD')
    on conflict (filial, supplier_local_id) do nothing;
  select debt into v_bal from public.supplier_balances where filial = p_filial and supplier_local_id = p_supp for update;
  v_bal := coalesce(v_bal, 0);
  if p_mode = 'set' then
    v_new := round(p_delta, 4);
    if v_new < 0 then raise exception 'LEDGER: qarz manfiy bo''lishi mumkin emas' using errcode = 'P0001'; end if;
  elsif p_mode = 'strict' then
    v_new := round(v_bal + p_delta, 4);
    if v_new < -0.01 then
      raise exception 'LEDGER: to''lov (% $) ta''minotchi qarzidan (% $) oshib ketdi', round(-p_delta, 2), round(v_bal, 2) using errcode = 'P0001';
    end if;
    v_new := greatest(v_new, 0);
  elsif p_mode = 'clamp' then
    v_new := greatest(round(v_bal + p_delta, 4), 0);
  else
    raise exception 'LEDGER: noma''lum rejim' using errcode = 'P0001';
  end if;
  update public.supplier_balances set debt = v_new, total_paid = total_paid + v_paid, updated_at = now()
   where filial = p_filial and supplier_local_id = p_supp;
  if v_new <> v_bal or v_paid <> 0 or p_kind = 'opening' then
    insert into public.supplier_debt_ledger (filial, supplier_local_id, delta, paid_delta, balance_after, op_kind, op_key, group_key, ref_type, ref_id, note, staff_id, staff_name)
    values (p_filial, p_supp, v_new - v_bal, v_paid, v_new, p_kind, p_op_key, p_group_key, left(p_ref_type, 40), left(p_ref_id, 100), left(p_note, 500), p_staff_id, left(p_staff_name, 200));
  end if;
  perform set_config('fw.debt_move', '', true);
  return v_new;
end;
$$;

-- Partiya harakati: d_qty / d_sold; sold ≤ qty, manfiy bo'lmaydi; holat (active/empty) avtomatik.
create or replace function public._stock_move(
  p_batch_id bigint, p_d_qty numeric, p_d_sold numeric, p_kind text, p_op_key text,
  p_group_key text default null, p_ref_type text default null, p_ref_id text default null, p_note text default null,
  p_staff_id bigint default null, p_staff_name text default null, p_new_status text default null, p_new_cost numeric default null)
 returns public.batches
 language plpgsql
 set search_path = ''
as $$
declare
  b public.batches;
  v_qty numeric;
  v_sold numeric;
  v_status text;
begin
  select * into b from public.batches where id = p_batch_id for update;
  if not found then raise exception 'LEDGER: partiya topilmadi' using errcode = 'P0001'; end if;
  if b.status = 'deleted' then raise exception 'LEDGER: partiya o''chirilgan (%)', b.local_id using errcode = 'P0001'; end if;
  v_qty := b.qty + coalesce(p_d_qty, 0);
  v_sold := b.sold + coalesce(p_d_sold, 0);
  if v_qty < -0.000001 or v_sold < -0.000001 or v_qty > 100000000 then
    raise exception 'LEDGER: partiya miqdori noto''g''ri (%)', b.local_id using errcode = 'P0001';
  end if;
  if v_sold > v_qty + 0.000001 then
    raise exception 'LEDGER: omborda yetarli qoldiq yo''q (partiya %: bor %, kerak %)', b.local_id, b.qty - b.sold, coalesce(p_d_sold, 0) - coalesce(p_d_qty, 0) using errcode = 'P0001';
  end if;
  if p_new_cost is not null and (p_new_cost < 0 or p_new_cost > 10000000) then
    raise exception 'LEDGER: tannarx noto''g''ri' using errcode = 'P0001';
  end if;
  v_status := coalesce(p_new_status, b.status);
  if v_status is null or v_status in ('active','empty') then
    v_status := case when v_qty - v_sold <= 0.000001 then 'empty' else 'active' end;
  end if;
  perform set_config('fw.stock_move', '1', true);
  update public.batches
     set qty = v_qty, sold = v_sold, status = v_status, cost_usd = coalesce(p_new_cost, cost_usd), updated_at = now(),
         edited_at = case when p_kind in ('edit','arrive') then now() else edited_at end,
         arrived_at = case when p_kind = 'arrive' then current_date else arrived_at end,
         deleted_at = case when v_status = 'deleted' then now() else deleted_at end
   where id = b.id
   returning * into b;
  insert into public.stock_ledger (filial, batch_id, batch_local_id, pid, d_qty, d_sold, qty_after, sold_after, cost_usd, status_after,
                                   op_kind, op_key, group_key, ref_type, ref_id, note, staff_id, staff_name)
  values (b.filial, b.id, b.local_id, b.pid, coalesce(p_d_qty, 0), coalesce(p_d_sold, 0), b.qty, b.sold, b.cost_usd, b.status,
          p_kind, p_op_key, p_group_key, left(p_ref_type, 40), left(p_ref_id, 100), left(p_note, 500), p_staff_id, left(p_staff_name, 200));
  perform set_config('fw.stock_move', '', true);
  return b;
end;
$$;

-- Yangi partiya (kirim, qaytarish, boshlang'ich qoldiq, ko'chirish). p_meta — izoh maydonlari.
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
                              rate_usd_uzs, rate_usd_cny, batch_date, status, performed_by, from_branch, kirim_ref, fk_ref, arrived_at)
  values (p_local_id, p_filial, p_pid, left(m->>'bno', 20), left(m->>'origin', 300),
          case when m->>'cur' in ('USD','UZS','CNY','KRW') then m->>'cur' else 'USD' end,
          p_qty, 0, p_cost, greatest(public._fw_num(m->>'bankFeeUsd'), 0),
          case when coalesce(m->>'suppId', '') ~ '^[0-9]{1,18}$' then (m->>'suppId')::bigint end,
          coalesce((m->>'consignment')::boolean, false),
          nullif(public._fw_num(m->>'rateUsdUzs'), 0), nullif(public._fw_num(m->>'rateUsdCny'), 0),
          v_date, coalesce(p_status, 'active'), left(m->>'performedBy', 200),
          case when m->>'fromBranch' ~ '^[a-z0-9_]{1,40}$' then m->>'fromBranch' end,
          left(m->>'kirimRef', 64), left(m->>'fkRef', 64),
          case when coalesce(p_status, 'active') = 'active' then v_date end)
  returning * into b;
  insert into public.stock_ledger (filial, batch_id, batch_local_id, pid, d_qty, d_sold, qty_after, sold_after, cost_usd, status_after,
                                   op_kind, op_key, group_key, ref_type, ref_id, note, staff_id, staff_name)
  values (b.filial, b.id, b.local_id, b.pid, b.qty, 0, b.qty, 0, b.cost_usd, b.status,
          p_kind, p_op_key, p_group_key, left(p_ref_type, 40), left(p_ref_id, 100), left(m->>'origin', 500), p_staff_id, left(p_staff_name, 200));
  perform set_config('fw.stock_move', '', true);
  return b;
end;
$$;

-- Filialning Bazaga tovar qarzi (app_data.branchDebt, $) — faqat server oshiradi
create or replace function public._branch_debt_add(p_filial text, p_usd numeric)
 returns numeric
 language plpgsql
 set search_path = ''
as $$
declare v numeric;
begin
  if p_usd is null or p_usd = 0 or p_filial = 'baza' then return null; end if;
  update public.app_data
     set data = jsonb_set(data, '{branchDebt}', coalesce(data->'branchDebt', '{}'::jsonb)
                || jsonb_build_object(p_filial, round(public._fw_num(data->'branchDebt'->>p_filial) + p_usd, 4))),
         updated_at = now()
   where id = 'main'
   returning public._fw_num(data->'branchDebt'->>p_filial) into v;
  return v;
end;
$$;

-- FIFO bo'yicha ombordan chiqarish (eng eski partiyadan), qator qulfi bilan.
-- Ta'minotchi qarzi (konsignatsiya) va filialning Bazaga qarzi bu yerda YOZILMAYDI — ular "side"
-- sifatida qaytariladi va chaqiruvchi BARCHA ombor qulflaridan KEYIN qo'llaydi (_fw_apply_side_debts):
-- qulflash tartibi doim bir xil — partiyalar → ta'minotchilar → app_data → mijoz → kassa (deadlock yo'q).
-- Natija: {cost, firstCost, allocs:[{batchId, localId, take, cost}], side:[{supp, usd, kind}], bd}
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
    select id, local_id, qty, sold, cost_usd, consignment, supp_id, from_branch from public.batches
     where filial = p_filial and pid = p_pid and status = 'active' and qty > sold
     order by batch_date asc nulls last, id asc
  loop
    exit when v_rem <= 0.000001;
    v_take := least(b.qty - b.sold, v_rem);
    perform public._stock_move(b.id, 0, v_take, p_kind, p_op_prefix || ':' || b.id, p_group_key, p_ref_type, p_ref_id, p_note, p_staff_id, p_staff_name);
    if v_first is null then v_first := b.cost_usd; end if;
    v_cost := v_cost + v_take * b.cost_usd;
    if b.consignment and b.supp_id is not null then
      v_side := v_side || jsonb_build_object('supp', b.supp_id, 'usd', v_take * b.cost_usd, 'kind', 'consignment');
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

-- Ombor qulflaridan keyin: ta'minotchi qarzlari (id tartibida) va filialning Bazaga qarzi
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
begin
  for r in
    select (e->>'supp')::bigint as supp, e->>'kind' as kind, sum(public._fw_num(e->>'usd')) as usd
      from jsonb_array_elements(coalesce(p_side, '[]'::jsonb)) e
     group by 1, 2 order by 1, 2
  loop
    continue when r.usd = 0;
    perform public._supp_debt_move(p_filial, r.supp, r.usd, 0, 'strict', r.kind, p_op_prefix || ':' || r.kind || ':' || r.supp,
      p_group_key, p_ref_type, p_ref_id,
      case r.kind when 'consignment' then 'Konsignatsiya: sotilgan qism' else 'To''g''ridan-to''g''ri savdo (ta''minotchidan)' end,
      p_staff_id, p_staff_name);
    v_supps := v_supps || r.supp;
  end loop;
  if coalesce(p_bd, 0) > 0 then perform public._branch_debt_add(p_filial, p_bd); end if;
  return v_supps;
end;
$$;

-- Javob uchun: berilgan mijoz/ta'minotchi/partiyalarning HAQIQIY qiymatlari
create or replace function public._fw_authority(p_filial text, p_cust bigint[], p_supp bigint[], p_batches bigint[])
 returns jsonb
 language sql
 stable
 set search_path = ''
as $$
  select jsonb_build_object(
    'filial', p_filial,
    'customers', coalesce((select jsonb_object_agg(customer_local_id::text, debt) from public.customer_balances
                            where filial = p_filial and customer_local_id = any(coalesce(p_cust, '{}'))), '{}'::jsonb),
    'suppliers', coalesce((select jsonb_object_agg(supplier_local_id::text, jsonb_build_object('debt', debt, 'paid', total_paid)) from public.supplier_balances
                            where filial = p_filial and supplier_local_id = any(coalesce(p_supp, '{}'))), '{}'::jsonb),
    'batches', coalesce((select jsonb_agg(jsonb_build_object('filial', filial, 'localId', local_id, 'qty', qty, 'sold', sold, 'status', status, 'costUsd', cost_usd) order by id)
                          from public.batches where id = any(coalesce(p_batches, '{}'))), '[]'::jsonb),
    'branchDebt', coalesce((select data->'branchDebt' from public.app_data where id = 'main'), '{}'::jsonb));
$$;

-- Savdo yozuvi — javob uchun (brauzer formatida)
create or replace function public._fw_sale_json(s public.sales)
 returns jsonb
 language sql
 stable
 set search_path = ''
as $$
  select jsonb_build_object(
    'localId', s.local_id, 'inv', s.inv, 'custId', s.cust_id,
    'subtotalUsd', s.subtotal_usd, 'disc', s.disc_pct, 'discUsd', s.disc_usd, 'totalUsd', s.total_usd,
    'paidUsd', s.paid_usd, 'debtUsd', s.debt_usd, 'profitUsd', s.profit_usd, 'status', s.status,
    'edited', s.edited_at is not null, 'voided', s.voided_at is not null,
    'items', coalesce((select jsonb_agg(jsonb_build_object('pid', public._fw_num(i->>'pid')::bigint, 'qty', public._fw_num(i->>'qty'),
              'sellUsd', public._fw_num(i->>'sell_usd'), 'costUsd', public._fw_num(i->>'cost_usd'),
              'lineUsd', public._fw_num(i->>'qty') * public._fw_num(i->>'sell_usd')) order by o)
              from jsonb_array_elements(s.items) with ordinality as t(i, o)), '[]'::jsonb));
$$;

-- Murakkab amal: takrorni tekshirish (replay) — natija saqlangan bo'lsa, haqiqiy qiymatlar yangilab qaytariladi
create or replace function public._ledger_op_replay(p_filial text, p_op_key text, p_kind text)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  r public.ledger_ops;
  ids jsonb;
begin
  if coalesce(p_op_key, '') !~ '^[A-Za-z0-9:_.-]{3,140}$' then
    raise exception 'LEDGER: amal kaliti noto''g''ri' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('fw_lop:' || p_filial || ':' || p_op_key));
  select * into r from public.ledger_ops where filial = p_filial and op_key = p_op_key;
  if not found then return null; end if;
  if r.kind <> p_kind then
    raise exception 'LEDGER: amal kaliti boshqa amal uchun ishlatilgan' using errcode = 'P0001';
  end if;
  ids := coalesce(r.result->'_ids', '{}'::jsonb);
  return (r.result - '_ids') || jsonb_build_object('replay', true, 'authority', public._fw_authority(p_filial,
    array(select jsonb_array_elements_text(coalesce(ids->'c', '[]'::jsonb))::bigint),
    array(select jsonb_array_elements_text(coalesce(ids->'s', '[]'::jsonb))::bigint),
    array(select jsonb_array_elements_text(coalesce(ids->'b', '[]'::jsonb))::bigint)));
end;
$$;

create or replace function public._ledger_op_finish(p_filial text, p_op_key text, p_kind text, p_result jsonb,
  p_cust bigint[], p_supp bigint[], p_batches bigint[], p_staff_id bigint, p_staff_name text)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  v_auth jsonb := public._fw_authority(p_filial, p_cust, p_supp, p_batches);
begin
  insert into public.ledger_ops (filial, op_key, kind, result, staff_id, staff_name)
  values (p_filial, p_op_key, p_kind, p_result || jsonb_build_object('_ids', jsonb_build_object(
            'c', to_jsonb(coalesce(p_cust, '{}')), 's', to_jsonb(coalesce(p_supp, '{}')), 'b', to_jsonb(coalesce(p_batches, '{}')))),
          p_staff_id, left(p_staff_name, 200));
  return p_result || jsonb_build_object('replay', false, 'authority', v_auth);
end;
$$;
-- ── 5. Savdo (checkout) — ombor + qarz + kassa BITTA tranzaksiyada ─────
-- p_sale: {localId, inv, custId, custName, items:[{pid,sku,name,qty,sellUsd,costUsd,directSupply,suppId}],
--          discPct, paidUsd, payType, boxId, saleDate, isTransfer}
-- Qarz, tannarx, foyda va kassaga tushum SERVERDA hisoblanadi; brauzer yuborgan qarz/qoldiq ishlatilmaydi.
create or replace function public.sale_checkout_atomic_v3(
  p_filial text, p_op_key text, p_sale jsonb, p_box_payments jsonb,
  p_staff_id bigint default null, p_staff_name text default null)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  v_r jsonb;
  v_item jsonb;
  v_bp jsonb;
  v_items jsonb := '[]'::jsonb;
  v_subtotal numeric := 0;
  v_total numeric;
  v_cost numeric := 0;
  v_profit numeric;
  v_debt numeric;
  v_change numeric;
  v_paid numeric;
  v_disc numeric;
  v_qty numeric;
  v_sell numeric;
  v_icost numeric;
  v_pid bigint;
  v_supp bigint;
  v_cust bigint;
  v_sale public.sales;
  v_fifo jsonb;
  v_side jsonb := '[]'::jsonb;
  v_bd numeric := 0;
  v_custs bigint[] := '{}';
  v_supps bigint[] := '{}';
  v_batches bigint[] := '{}';
  v_rate numeric;
  v_box int;
  v_amt numeric;
  v_cur text;
  v_box_usd numeric := 0;
  v_idx int := 0;
  v_n int := 0;
  v_boxes integer[] := '{}';
  v_mixed jsonb := null;
  v_first_box int := null;
  v_local text := p_sale->>'localId';
  v_inv text := p_sale->>'inv';
  v_pay text := left(p_sale->>'payType', 20);
begin
  v_r := public._ledger_op_replay(p_filial, p_op_key, 'sale');
  if v_r is not null then return v_r; end if;

  if coalesce(p_filial, '') = '' then raise exception 'LEDGER: filial majburiy' using errcode = 'P0001'; end if;
  if coalesce(v_local, '') !~ '^[0-9A-Za-z_.:-]{1,64}$' then raise exception 'LEDGER: savdo ID noto''g''ri' using errcode = 'P0001'; end if;
  if coalesce(v_inv, '') = '' or length(v_inv) > 40 then raise exception 'LEDGER: chek raqami noto''g''ri' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_sale->'items') <> 'array' or jsonb_array_length(p_sale->'items') < 1 or jsonb_array_length(p_sale->'items') > 500 then
    raise exception 'LEDGER: savat bo''sh yoki juda katta' using errcode = 'P0001';
  end if;
  v_disc := public._fw_num(p_sale->>'discPct');
  v_paid := public._fw_num(p_sale->>'paidUsd');
  if v_disc < 0 or v_disc > 100 or v_paid < 0 or v_paid > 1000000000 then
    raise exception 'LEDGER: chegirma yoki to''lov noto''g''ri' using errcode = 'P0001';
  end if;
  v_cust := case when coalesce(p_sale->>'custId', '') ~ '^[0-9]{1,18}$' and (p_sale->>'custId')::numeric > 0 then (p_sale->>'custId')::bigint end;
  if exists (select 1 from public.sales where filial = p_filial and local_id = v_local) then
    raise exception 'LEDGER: savdo ID takrorlandi' using errcode = 'P0001';
  end if;

  for v_item in select * from jsonb_array_elements(p_sale->'items') loop
    v_qty := public._fw_num(v_item->>'qty'); v_sell := public._fw_num(v_item->>'sellUsd'); v_icost := public._fw_num(v_item->>'costUsd');
    if coalesce(v_item->>'pid', '') !~ '^[0-9]{1,18}$' or v_qty <= 0 or v_qty > 1000000 or v_sell < 0 or v_sell > 1000000000 or v_icost < 0 or v_icost > 1000000000 then
      raise exception 'LEDGER: savatdagi qator noto''g''ri (pid=%)', v_item->>'pid' using errcode = 'P0001';
    end if;
    v_subtotal := v_subtotal + v_qty * v_sell;
    v_items := v_items || jsonb_build_object('pid', (v_item->>'pid')::bigint, 'sku', left(v_item->>'sku', 80), 'name', left(v_item->>'name', 300),
      'qty', v_qty, 'sell_usd', v_sell, 'cost_usd', v_icost, 'line_usd', v_qty * v_sell,
      'direct_supply', coalesce(v_item->>'directSupply', 'false') = 'true',
      'supp_id', case when coalesce(v_item->>'suppId', '') ~ '^[0-9]{1,18}$' then (v_item->>'suppId')::bigint end);
  end loop;
  v_total := v_subtotal * (1 - v_disc / 100);

  -- Kassaga tushum (aralash to'lov): qaysi kassalarga — bazadagi haqiqiy tushum asosida (void uchun)
  if p_box_payments is not null and jsonb_typeof(p_box_payments) = 'array' then
    if jsonb_array_length(p_box_payments) > 10 then raise exception 'LEDGER: kassa to''lovlari juda ko''p' using errcode = 'P0001'; end if;
    select jsonb_agg(jsonb_build_object('boxId', (e->>'box_id')::int, 'amount', public._fw_num(e->>'amount_native')))
      into v_mixed from jsonb_array_elements(p_box_payments) e
     where coalesce(e->>'box_id', '') ~ '^[0-9]{1,9}$' and public._fw_num(e->>'amount_native') > 0;
    v_first_box := (v_mixed->0->>'boxId')::int;
  end if;

  insert into public.sales (filial, inv, cust_id, subtotal_usd, disc_pct, total_usd, cost_usd, profit_usd, paid_usd, debt_usd, items,
                            local_id, pay_type, box_id, mixed_rows, cust_name, disc_usd, sale_date, status, staff_id, staff_name, is_transfer)
  values (p_filial, v_inv, v_cust, v_subtotal, v_disc, v_total, 0, 0, least(v_paid, v_total), 0, v_items,
          v_local, v_pay,
          case when v_pay = 'mixed' then null
               else coalesce(v_first_box, case when coalesce(p_sale->>'boxId', '') ~ '^[0-9]{1,9}$' then (p_sale->>'boxId')::int end) end,
          case when v_pay = 'mixed' then v_mixed end,
          left(p_sale->>'custName', 200), v_subtotal - v_total,
          case when coalesce(p_sale->>'saleDate', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (p_sale->>'saleDate')::date else current_date end,
          'done', p_staff_id, left(p_staff_name, 200), coalesce(p_sale->>'isTransfer', 'false') = 'true')
  returning * into v_sale;

  -- Ombor (FIFO) — mahsulot ID tartibida qulflanadi (parallel savdolarda deadlock bo'lmasligi uchun)
  for v_item in select e from jsonb_array_elements(v_items) e order by (e->>'pid')::bigint loop
    v_n := v_n + 1;
    v_pid := (v_item->>'pid')::bigint; v_qty := (v_item->>'qty')::numeric;
    if (v_item->>'direct_supply')::boolean then
      v_cost := v_cost + v_qty * (v_item->>'cost_usd')::numeric;
      if v_item->>'supp_id' is not null then
        v_side := v_side || jsonb_build_object('supp', (v_item->>'supp_id')::bigint, 'usd', v_qty * (v_item->>'cost_usd')::numeric, 'kind', 'sale_direct');
      end if;
    else
      v_fifo := public._stock_fifo_out(p_filial, v_pid, v_qty, 'sale', 'sale:' || v_sale.id || ':' || v_n, 'sale:' || v_sale.id,
                                       'sale', v_inv, 'Savdo ' || v_inv, p_staff_id, p_staff_name);
      v_cost := v_cost + (v_fifo->>'cost')::numeric;
      v_side := v_side || (v_fifo->'side');
      v_bd := v_bd + (v_fifo->>'bd')::numeric;
      v_batches := v_batches || array(select (a->>'batchId')::bigint from jsonb_array_elements(v_fifo->'allocs') a);
    end if;
  end loop;
  v_supps := public._fw_apply_side_debts(p_filial, v_side, v_bd, 'sale:' || v_sale.id, 'sale:' || v_sale.id, 'sale', v_inv, p_staff_id, p_staff_name);

  v_profit := v_total - v_cost;
  v_debt := greatest(0, v_total - v_paid);
  v_change := greatest(0, v_paid - v_total);

  -- Mijoz qarzi (so'm) — serverdagi kurs bo'yicha
  if v_cust is not null and v_debt > 0 then
    v_rate := public._fw_rate();
    perform public._cust_debt_move(p_filial, v_cust, round(v_debt * v_rate, 2), 'strict', 'sale', 'sale:' || v_sale.id, 'sale:' || v_sale.id,
                                   'sale', v_inv, 'Savdo ' || v_inv, p_staff_id, p_staff_name);
    v_custs := v_custs || v_cust;
  end if;

  -- Kassaga tushum — kassa jurnali orqali; savdo summasidan (2% / 1$ chegarasi bilan) oshmaydi
  if p_box_payments is not null and jsonb_typeof(p_box_payments) = 'array' then
    for v_bp in select * from jsonb_array_elements(p_box_payments) loop
      v_idx := v_idx + 1;
      continue when coalesce(v_bp->>'box_id', '') !~ '^[0-9]{1,9}$';
      v_box := (v_bp->>'box_id')::int;
      v_amt := public._fw_num(v_bp->>'amount_native');
      continue when v_amt <= 0;
      select currency into v_cur from public.cashbox_balances where filial = p_filial and box_local_id = v_box;
      v_cur := coalesce(v_cur, case when v_bp->>'currency' in ('USD','UZS') then v_bp->>'currency' end);
      if v_cur is null then
        raise exception 'CASHBOX: kassa valyutasi noma''lum (kassa %)', v_box using errcode = 'P0001';
      end if;
      if v_cur = 'USD' then
        v_box_usd := v_box_usd + v_amt;
      else
        v_rate := coalesce(v_rate, public._fw_rate());
        v_box_usd := v_box_usd + v_amt / v_rate;
      end if;
      perform public._cb_move(p_filial, v_box, v_cur, 'in', v_amt, 'sale', 'sale:' || v_sale.id || ':' || v_idx, 'sale:' || v_sale.id,
                              left(v_bp->>'box_name', 200), 'sale', v_inv, 'Savdo ' || v_inv, p_staff_id, p_staff_name);
      v_boxes := v_boxes || v_box;
    end loop;
    if v_box_usd > v_total + greatest(1, v_total * 0.02) then
      raise exception 'CASHBOX: kassaga tushum (% $) savdo summasidan (% $) oshib ketdi — qaytimni ayiring', round(v_box_usd, 2), round(v_total, 2) using errcode = 'P0001';
    end if;
  end if;

  update public.sales set cost_usd = v_cost, profit_usd = v_profit, debt_usd = v_debt where id = v_sale.id returning * into v_sale;

  return public._ledger_op_finish(p_filial, p_op_key, 'sale', jsonb_build_object(
    'ok', true, 'saleId', v_sale.id, 'localId', v_local, 'inv', v_inv,
    'subtotalUsd', v_subtotal, 'totalUsd', v_total, 'costUsd', v_cost,
    'profitUsd', v_profit, 'debtUsd', v_debt, 'changeUsd', v_change,
    'sale', public._fw_sale_json(v_sale),
    'balances', public._cb_balances_map(p_filial, v_boxes)),
    v_custs, v_supps, v_batches, p_staff_id, p_staff_name);
end;
$$;

-- Eski chaqiruv (v2) — endi v3 orqali (kod yangilanmagan bo'lsa ham ombor/qarz serverda to'g'ri)
CREATE OR REPLACE FUNCTION public.sale_checkout_atomic_v2(p_filial text, p_items jsonb, p_disc_pct numeric, p_paid_usd numeric, p_cust_id bigint, p_box_payments jsonb, p_inv text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare
  v_key text := 'v2:' || replace(gen_random_uuid()::text, '-', '');
begin
  return public.sale_checkout_atomic_v3(p_filial, v_key, jsonb_build_object(
    'localId', v_key, 'inv', p_inv, 'custId', p_cust_id, 'discPct', coalesce(p_disc_pct, 0), 'paidUsd', p_paid_usd,
    'payType', case when jsonb_typeof(p_box_payments) = 'array' and jsonb_array_length(p_box_payments) > 1 then 'mixed' end,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('pid', e->'pid', 'sku', e->'sku', 'name', e->'name', 'qty', e->'qty',
               'sellUsd', e->'sell_usd', 'costUsd', e->'cost_usd', 'directSupply', e->'direct_supply', 'suppId', e->'supp_id')), '[]'::jsonb)
               from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e)),
    p_box_payments, null, null);
end;
$function$;

-- ── 6. Qaytarish — SERVERDAGI savdo yozuvidan hisoblanadi ───────────────
-- Avvalgi biznes qoidasi saqlangan: qaytarish summasi savdodagi skidka bilan; avval mijozning shu savdo
-- bo'yicha qarzi kamayadi, faqat qolgani naqd qaytariladi; ombordan sotilgan tovar tannarxi bilan YANGI
-- partiya bo'lib qaytadi; ta'minotchidan to'g'ridan-to'g'ri sotilgan bo'lsa — ta'minotchi qarzi kamayadi.
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
    v_rate := public._fw_rate();
    perform public._cust_debt_move(p_filial, s.cust_id, -round(v_debt_part * v_rate, 2), 'clamp', 'sale_return', v_key, v_key, 'sale', s.inv,
                                   'Qaytarish: ' || s.inv, p_staff_id, p_staff_name);
    v_custs := v_custs || s.cust_id;
  end if;

  v_box := coalesce(s.box_id, case when jsonb_typeof(s.mixed_rows) = 'array' and coalesce(s.mixed_rows->0->>'boxId', '') ~ '^[0-9]{1,9}$'
                                   then (s.mixed_rows->0->>'boxId')::int end);
  if v_box is not null and v_cash_part > 0.000001 then
    select currency into v_cur from public.cashbox_balances where filial = p_filial and box_local_id = v_box;
    if v_cur is null then raise exception 'CASHBOX: qaytarish kassasi topilmadi (kassa %)', v_box using errcode = 'P0001'; end if;
    v_amt := case when v_cur = 'USD' then round(v_cash_part, 2) else round(v_cash_part * public._fw_rate(), 2) end;
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

-- ── 7. Savdoni o'chirish (void) — ombor, kassa, mijoz qarzi teskari ────
-- Avvalgi qoida: savdodagi har bir mahsulot (asl tannarxda) YANGI partiya bo'lib omborga qaytadi,
-- to'langan summa kassadan (aralash to'lovda — har bir kassadan) qaytariladi, mijoz qarzi kamayadi.
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
    v_b := public._batch_insert(p_filial, p_batch_ids->>(v_o - 1)::int, public._fw_num(v_item->>'pid')::bigint, v_qty,
             public._fw_num(v_item->>'cost_usd'), 'active',
             coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('origin', left('O''chirilgan savdo — ' || s.inv, 300)),
             'sale_void', v_key || ':' || v_o, v_key, 'sale', s.inv, p_staff_id, p_staff_name);
    v_batches := v_batches || v_b.id;
    v_restocked := v_restocked || jsonb_build_object('localId', v_b.local_id, 'pid', v_b.pid, 'qty', v_b.qty);
  end loop;

  if s.cust_id is not null and coalesce(s.debt_usd, 0) > 0 then
    v_rate := public._fw_rate();
    perform public._cust_debt_move(p_filial, s.cust_id, -round(s.debt_usd * v_rate, 2), 'clamp', 'sale_void', v_key, v_key, 'sale', s.inv,
                                   'Savdo o''chirildi: ' || s.inv, p_staff_id, p_staff_name);
    v_custs := v_custs || s.cust_id;
  end if;

  if s.box_id is not null and coalesce(s.paid_usd, 0) > 0 then
    select currency into v_cur from public.cashbox_balances where filial = p_filial and box_local_id = s.box_id;
    if v_cur is not null then
      v_ops := v_ops || jsonb_build_object('box', s.box_id, 'currency', v_cur, 'dir', 'out',
        'amount', case when v_cur = 'USD' then round(s.paid_usd, 2) else round(s.paid_usd * public._fw_rate(), 2) end,
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

-- ── 8. Savdoni tahrirlash — uch rejim (avvalgi uchta UI oqimiga mos) ───
-- 'replace' (admin, "Savdoni tahrirlash"): eski mahsulotlar YANGI partiya bo'lib qaytadi, yangilari FIFO'dan;
--            to'lov turi "qarz" bo'lsa hammasi qarz, aks holda hammasi to'langan; kassa: eski to'lov chiqim, yangisi kirim.
-- 'delta'   (admin, "Yopilgan savdo"): faqat farq (ko'p — FIFO, kam — yangi partiya); to'langan summa o'zgarmaydi,
--            qarz = max(0, yangi jami − to'langan).
-- 'price'   (sotuvchi): faqat narx; farq qarzga (qarz savdosi) yoki kassaga (naqd/karta).
create or replace function public.sale_edit_atomic(
  p_filial text, p_op_key text, p_sale_local_id text, p_mode text, p_payload jsonb,
  p_staff_id bigint default null, p_staff_name text default null)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  v_r jsonb;
  s public.sales;
  v_old jsonb;
  v_new jsonb := '[]'::jsonb;
  v_e jsonb;
  v_it jsonb;
  v_o bigint;
  v_i int;
  v_n int := 0;
  v_qty numeric;
  v_nq numeric;
  v_sell numeric;
  v_subtotal numeric := 0;
  v_total numeric;
  v_cost numeric := 0;
  v_disc numeric;
  v_disc_usd numeric;
  v_paid numeric;
  v_debt numeric;
  v_delta numeric;
  v_rate numeric;
  v_cur text;
  v_amt numeric;
  v_fifo jsonb;
  v_side jsonb := '[]'::jsonb;
  v_bd numeric := 0;
  v_ops jsonb := '[]'::jsonb;
  v_cash jsonb := null;
  v_b public.batches;
  v_seen int[] := '{}';
  v_out jsonb := '[]'::jsonb;        -- FIFO kerak bo'lgan qatorlar: [{pid, qty}]
  v_custs bigint[] := '{}';
  v_supps bigint[] := '{}';
  v_batches bigint[] := '{}';
  v_key text;
begin
  v_r := public._ledger_op_replay(p_filial, p_op_key, 'sale_edit');
  if v_r is not null then return v_r; end if;
  v_key := 'sedit:' || p_op_key;
  if p_mode is null or p_mode not in ('replace','delta','price') then
    raise exception 'LEDGER: tahrir rejimi noto''g''ri' using errcode = 'P0001';
  end if;
  select * into s from public.sales where filial = p_filial and local_id = p_sale_local_id for update;
  if not found then raise exception 'LEDGER: savdo serverda topilmadi — sahifani yangilang' using errcode = 'P0001'; end if;
  if s.voided_at is not null then raise exception 'LEDGER: savdo o''chirilgan' using errcode = 'P0001'; end if;
  v_old := s.items;

  if p_mode = 'replace' then
    if jsonb_typeof(p_payload->'items') <> 'array' then raise exception 'LEDGER: mahsulotlar ro''yxati yo''q' using errcode = 'P0001'; end if;
    for v_e in select * from jsonb_array_elements(p_payload->'items') loop
      v_i := public._fw_num(v_e->>'idx')::int;
      if v_i < 0 or v_i >= jsonb_array_length(v_old) or v_i = any(v_seen) then
        raise exception 'LEDGER: tahrirdagi qator noto''g''ri' using errcode = 'P0001';
      end if;
      v_seen := v_seen || v_i;
      v_qty := public._fw_num(v_e->>'qty'); v_sell := public._fw_num(v_e->>'sellUsd');
      continue when v_qty <= 0;
      if v_qty > 1000000 or v_sell < 0 or v_sell > 1000000000 then raise exception 'LEDGER: miqdor yoki narx noto''g''ri' using errcode = 'P0001'; end if;
      v_it := (v_old->v_i) || jsonb_build_object('qty', v_qty, 'sell_usd', v_sell, 'line_usd', v_qty * v_sell);
      v_new := v_new || v_it;
      v_subtotal := v_subtotal + v_qty * v_sell;
      v_cost := v_cost + v_qty * public._fw_num(v_it->>'cost_usd');
      v_out := v_out || jsonb_build_object('pid', public._fw_num(v_it->>'pid')::bigint, 'qty', v_qty);
    end loop;
    if jsonb_array_length(v_new) = 0 then raise exception 'LEDGER: kamida bitta mahsulot qolishi kerak' using errcode = 'P0001'; end if;
    v_total := v_subtotal;
    v_paid := case when s.pay_type = 'debt' then 0 else v_total end;
    v_debt := case when s.pay_type = 'debt' then v_total else 0 end;
    -- eski mahsulotlar omborga (yangi partiya sifatida)
    for v_it, v_o in select e, o from jsonb_array_elements(v_old) with ordinality as t(e, o) order by o loop
      v_qty := public._fw_num(v_it->>'qty');
      continue when v_qty <= 0;
      v_b := public._batch_insert(p_filial, p_payload->'restockIds'->>(v_o - 1)::int, public._fw_num(v_it->>'pid')::bigint, v_qty,
               public._fw_num(v_it->>'cost_usd'), 'active',
               coalesce(p_payload->'meta', '{}'::jsonb) || jsonb_build_object('origin', left('Tahrirlash — ' || s.inv, 300)),
               'sale_edit', v_key || ':r:' || v_o, v_key, 'sale', s.inv, p_staff_id, p_staff_name);
      v_batches := v_batches || v_b.id;
    end loop;
  elsif p_mode = 'delta' then
    v_disc := public._fw_num(p_payload->>'discPct');
    if v_disc < 0 or v_disc > 100 then raise exception 'LEDGER: chegirma noto''g''ri' using errcode = 'P0001'; end if;
    for v_it, v_o in select e, o from jsonb_array_elements(v_old) with ordinality as t(e, o) order by o loop
      v_e := (select e2 from jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb)) e2 where public._fw_num(e2->>'idx') = v_o - 1 limit 1);
      v_qty := public._fw_num(v_it->>'qty');
      v_nq := case when v_e is not null and v_e ? 'qty' and v_e->>'qty' is not null then public._fw_num(v_e->>'qty') else v_qty end;
      v_sell := case when v_e is not null and v_e ? 'sellUsd' and v_e->>'sellUsd' is not null then public._fw_num(v_e->>'sellUsd') else public._fw_num(v_it->>'sell_usd') end;
      if v_nq < 0 or v_nq > 1000000 or v_sell < 0 or v_sell > 1000000000 then raise exception 'LEDGER: miqdor yoki narx noto''g''ri' using errcode = 'P0001'; end if;
      if v_nq > v_qty then
        v_out := v_out || jsonb_build_object('pid', public._fw_num(v_it->>'pid')::bigint, 'qty', v_nq - v_qty);
      elsif v_nq < v_qty then
        v_b := public._batch_insert(p_filial, p_payload->'restockIds'->>(v_o - 1)::int, public._fw_num(v_it->>'pid')::bigint, v_qty - v_nq,
                 public._fw_num(v_it->>'cost_usd'), 'active',
                 coalesce(p_payload->'meta', '{}'::jsonb) || jsonb_build_object('origin', 'Savdo tahrirlandi (qaytdi)'),
                 'sale_edit', v_key || ':r:' || v_o, v_key, 'sale', s.inv, p_staff_id, p_staff_name);
        v_batches := v_batches || v_b.id;
      end if;
      v_it := v_it || jsonb_build_object('qty', v_nq, 'sell_usd', v_sell, 'line_usd', v_nq * v_sell);
      v_new := v_new || v_it;
      v_subtotal := v_subtotal + v_nq * v_sell;
      v_cost := v_cost + v_nq * public._fw_num(v_it->>'cost_usd');
    end loop;
    v_disc_usd := v_subtotal * v_disc / 100;
    v_total := v_subtotal - v_disc_usd;
    v_paid := coalesce(s.paid_usd, 0);
    v_debt := greatest(0, v_total - v_paid);
  else
    if jsonb_typeof(p_payload->'prices') <> 'array' or jsonb_array_length(p_payload->'prices') <> jsonb_array_length(v_old) then
      raise exception 'LEDGER: narxlar ro''yxati noto''g''ri' using errcode = 'P0001';
    end if;
    for v_it, v_o in select e, o from jsonb_array_elements(v_old) with ordinality as t(e, o) order by o loop
      v_sell := public._fw_num(p_payload->'prices'->>(v_o - 1)::int);
      if v_sell < 0 or v_sell > 1000000000 then raise exception 'LEDGER: narx noto''g''ri' using errcode = 'P0001'; end if;
      v_qty := public._fw_num(v_it->>'qty');
      v_new := v_new || (v_it || jsonb_build_object('sell_usd', v_sell, 'line_usd', v_qty * v_sell));
      v_subtotal := v_subtotal + v_qty * v_sell;
    end loop;
    v_disc_usd := v_subtotal * coalesce(s.disc_pct, 0) / 100;
    v_total := v_subtotal - v_disc_usd;
    v_delta := v_total - coalesce(s.total_usd, 0);
  end if;

  -- Ombordan chiqarish (FIFO) — mahsulot ID tartibida
  for v_e in select e from jsonb_array_elements(v_out) e order by (e->>'pid')::bigint loop
    v_n := v_n + 1;
    v_fifo := public._stock_fifo_out(p_filial, (v_e->>'pid')::bigint, (v_e->>'qty')::numeric, 'sale_edit', v_key || ':f:' || v_n, v_key,
                                     'sale', s.inv, 'Savdo tahrirlandi: ' || s.inv, p_staff_id, p_staff_name);
    v_side := v_side || (v_fifo->'side');
    v_bd := v_bd + (v_fifo->>'bd')::numeric;
    v_batches := v_batches || array(select (a->>'batchId')::bigint from jsonb_array_elements(v_fifo->'allocs') a);
  end loop;
  v_supps := public._fw_apply_side_debts(p_filial, v_side, v_bd, v_key, v_key, 'sale', s.inv, p_staff_id, p_staff_name);

  -- Mijoz qarzi
  if s.cust_id is not null then
    if p_mode = 'replace' then
      if coalesce(s.debt_usd, 0) > 0 or v_debt > 0 then v_rate := public._fw_rate(); end if;
      if coalesce(s.debt_usd, 0) > 0 then
        perform public._cust_debt_move(p_filial, s.cust_id, -round(s.debt_usd * v_rate, 2), 'clamp', 'sale_edit', v_key || ':o', v_key, 'sale', s.inv,
                                       'Tahrirlash (eski): ' || s.inv, p_staff_id, p_staff_name);
        v_custs := v_custs || s.cust_id;
      end if;
      if v_debt > 0 then
        perform public._cust_debt_move(p_filial, s.cust_id, round(v_debt * v_rate, 2), 'strict', 'sale_edit', v_key || ':n', v_key, 'sale', s.inv,
                                       'Tahrirlash (yangi): ' || s.inv, p_staff_id, p_staff_name);
        v_custs := v_custs || s.cust_id;
      end if;
    elsif p_mode = 'delta' then
      v_rate := public._fw_rate();
      if round(v_debt * v_rate, 2) - round(coalesce(s.debt_usd, 0) * v_rate, 2) <> 0 then
        perform public._cust_debt_move(p_filial, s.cust_id, round(v_debt * v_rate, 2) - round(coalesce(s.debt_usd, 0) * v_rate, 2), 'clamp', 'sale_edit',
                                       v_key, v_key, 'sale', s.inv, 'Savdo tahrirlandi: ' || s.inv, p_staff_id, p_staff_name);
        v_custs := v_custs || s.cust_id;
      end if;
    elsif s.pay_type = 'debt' and v_delta <> 0 then
      v_rate := public._fw_rate();
      perform public._cust_debt_move(p_filial, s.cust_id, round(v_delta * v_rate, 2), 'clamp', 'sale_edit', v_key, v_key, 'sale', s.inv,
                                     'Savdo tahrirlandi: ' || s.inv, p_staff_id, p_staff_name);
      v_custs := v_custs || s.cust_id;
    end if;
  end if;

  -- Kassa
  if s.box_id is not null and p_mode in ('replace','price') then
    select currency into v_cur from public.cashbox_balances where filial = p_filial and box_local_id = s.box_id;
    if v_cur is not null then
      if p_mode = 'replace' then
        if coalesce(s.paid_usd, 0) > 0 then
          v_ops := v_ops || jsonb_build_object('box', s.box_id, 'currency', v_cur, 'dir', 'out',
            'amount', case when v_cur = 'USD' then round(s.paid_usd, 2) else round(s.paid_usd * public._fw_rate(), 2) end,
            'note', left('Tahrirlash (eski) — ' || s.inv, 500), 'ref_type', 'sale', 'ref_id', s.inv);
        end if;
        if v_paid > 0 then
          v_ops := v_ops || jsonb_build_object('box', s.box_id, 'currency', v_cur, 'dir', 'in',
            'amount', case when v_cur = 'USD' then round(v_paid, 2) else round(v_paid * public._fw_rate(), 2) end,
            'note', left('Tahrirlash (yangi) — ' || s.inv, 500), 'ref_type', 'sale', 'ref_id', s.inv);
        end if;
      elsif s.pay_type is distinct from 'debt' then
        v_amt := case when v_cur = 'USD' then v_delta else v_delta * public._fw_rate() end;
        if abs(v_amt) >= 0.005 then
          v_ops := v_ops || jsonb_build_object('box', s.box_id, 'currency', v_cur, 'dir', case when v_amt >= 0 then 'in' else 'out' end,
            'amount', round(abs(v_amt), 2), 'note', left('Savdo tahrirlandi: ' || s.inv, 500), 'ref_type', 'sale', 'ref_id', s.inv);
        end if;
      end if;
      v_ops := (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(v_ops) e where public._fw_num(e->>'amount') > 0);
      if jsonb_array_length(v_ops) > 0 then
        v_cash := public.cashbox_apply_ops(p_filial, v_key, 'sale_fix', v_ops, p_staff_id, p_staff_name);
      end if;
    end if;
  end if;

  if p_mode = 'replace' then
    update public.sales set items = v_new, subtotal_usd = v_total, total_usd = v_total, paid_usd = v_paid, debt_usd = v_debt,
           profit_usd = v_total - v_cost, edited_at = now()
     where id = s.id returning * into s;
  elsif p_mode = 'delta' then
    update public.sales set items = v_new, subtotal_usd = v_subtotal, disc_pct = v_disc, disc_usd = v_disc_usd, total_usd = v_total,
           debt_usd = v_debt, profit_usd = v_total - v_cost, edited_at = now()
     where id = s.id returning * into s;
  else
    update public.sales set items = v_new, subtotal_usd = v_subtotal, disc_usd = v_disc_usd, total_usd = v_total,
           debt_usd = case when pay_type = 'debt' then greatest(0, debt_usd + v_delta) else debt_usd end,
           paid_usd = case when pay_type = 'debt' then paid_usd else greatest(0, paid_usd + v_delta) end,
           edited_at = now()
     where id = s.id returning * into s;
  end if;

  return public._ledger_op_finish(p_filial, p_op_key, 'sale_edit', jsonb_build_object(
    'ok', true, 'mode', p_mode, 'saleLocalId', s.local_id, 'inv', s.inv,
    'restocked', coalesce((select jsonb_agg(jsonb_build_object('localId', b.local_id, 'pid', b.pid, 'qty', b.qty, 'costUsd', b.cost_usd) order by b.id)
                           from public.batches b where b.id = any(v_batches) and b.local_id = any(array(select jsonb_array_elements_text(coalesce(
                             case when jsonb_typeof(p_payload->'restockIds') = 'array' then p_payload->'restockIds' else '[]'::jsonb end, '[]'::jsonb))))), '[]'::jsonb),
    'sale', public._fw_sale_json(s), 'balances', coalesce(v_cash->'balances', '{}'::jsonb)),
    v_custs, v_supps, v_batches, p_staff_id, p_staff_name);
end;
$$;

-- ── 9. To'lov + kassa — qarz qatori QULFLANADI, qarzdan ortiq to'lov bazada rad etiladi ──
-- Yangi nom (_v2): 24/25-migratsiya qayta ishga tushirilsa ham (eski funksiyalarni qayta yaratadi)
-- yangi kod ishlatadigan funksiya o'zgarmaydi. Eski nom (cash_payment_atomic) — shu funksiyaga yo'naltiriladi
-- (eski kod bilan ham qarz bazada tekshiriladi). Ikki qurilmadan bir vaqtda 2×400 000 (qarz 600 000):
-- ikkinchisi qulfda kutadi, keyin HAQIQIY qoldiq (200 000) bo'yicha rad etiladi va uning kassa harakati ham bekor bo'ladi.
create or replace function public.cash_payment_atomic_v2(
  p_filial text, p_group_key text, p_kind text, p_ops jsonb, p_record_type text, p_record jsonb,
  p_staff_id bigint default null, p_staff_name text default null)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  v_res jsonb;
  v_amt numeric;
  v_debt numeric;
  v_dealer record;
  v_party bigint;
  v_extra jsonb := '{}'::jsonb;
begin
  if p_record_type is null or p_record_type not in ('customer_debt_payment','supplier_payment','dealer_payment','home_withdrawal') then
    raise exception 'CASHBOX: to''lov turi noto''g''ri' using errcode = 'P0001';
  end if;
  if p_record is null or jsonb_typeof(p_record) <> 'object' then
    raise exception 'CASHBOX: to''lov ma''lumoti yo''q' using errcode = 'P0001';
  end if;

  -- Qulflash tartibi: qarz qatori → kassa (sotuv/qaytarish bilan bir xil)
  if p_record_type = 'dealer_payment' then
    v_amt := round((p_record->>'amount_usd')::numeric, 2);
    select id, debt_usd, total_paid_usd, filial into v_dealer from public.dealers where id = (p_record->>'dealer_id')::bigint for update;
    if not found then raise exception 'CASHBOX: diller topilmadi' using errcode = 'P0001'; end if;
    if coalesce(v_dealer.filial, 'baza') <> p_filial then raise exception 'CASHBOX: diller boshqa filialga tegishli' using errcode = 'P0001'; end if;
  elsif p_record_type = 'customer_debt_payment' then
    v_party := case when coalesce(p_record->>'customer_local_id', '') ~ '^[0-9]{1,18}$' then (p_record->>'customer_local_id')::bigint end;
    v_amt := round(public._fw_num(p_record->>'amount_uzs'), 2);
    if v_party is null or v_amt <= 0 then raise exception 'CASHBOX: mijoz yoki summa noto''g''ri' using errcode = 'P0001'; end if;
    perform set_config('fw.debt_move', '1', true);
    insert into public.customer_balances (filial, customer_local_id, debt, currency) values (p_filial, v_party, 0, 'UZS')
      on conflict (filial, customer_local_id) do nothing;
    perform set_config('fw.debt_move', '', true);
    perform 1 from public.customer_balances where filial = p_filial and customer_local_id = v_party for update;
  elsif p_record_type = 'supplier_payment' then
    v_party := case when coalesce(p_record->>'supplier_local_id', '') ~ '^[0-9]{1,18}$' then (p_record->>'supplier_local_id')::bigint end;
    v_amt := round(public._fw_num(p_record->>'amount_usd'), 4);
    if v_party is null or v_amt <= 0 then raise exception 'CASHBOX: ta''minotchi yoki summa noto''g''ri' using errcode = 'P0001'; end if;
    perform set_config('fw.debt_move', '1', true);
    insert into public.supplier_balances (filial, supplier_local_id, debt, currency) values (p_filial, v_party, 0, 'USD')
      on conflict (filial, supplier_local_id) do nothing;
    perform set_config('fw.debt_move', '', true);
    perform 1 from public.supplier_balances where filial = p_filial and supplier_local_id = v_party for update;
  end if;

  v_res := public.cashbox_apply_ops(p_filial, p_group_key, p_kind, p_ops, p_staff_id, p_staff_name);
  if coalesce((v_res->>'replay')::boolean, false) then
    if p_record_type = 'dealer_payment' then
      v_extra := jsonb_build_object('dealerDebtUsd', v_dealer.debt_usd, 'dealerTotalPaidUsd', v_dealer.total_paid_usd);
    elsif p_record_type = 'customer_debt_payment' then
      v_extra := jsonb_build_object('customerDebt', (select debt from public.customer_balances where filial = p_filial and customer_local_id = v_party));
    elsif p_record_type = 'supplier_payment' then
      v_extra := (select jsonb_build_object('supplierDebt', debt, 'supplierPaid', total_paid) from public.supplier_balances where filial = p_filial and supplier_local_id = v_party);
    end if;
    return v_res || coalesce(v_extra, '{}'::jsonb);   -- yozuv birinchi chaqiruvda (shu tranzaksiyada) qo'shilgan
  end if;

  if p_record_type = 'customer_debt_payment' then
    v_debt := public._cust_debt_move(p_filial, v_party, -v_amt, 'strict', 'payment', 'pay:' || p_group_key, p_group_key,
                                     'customer_debt_payment', null, left(p_record->>'customer_name', 200), p_staff_id, p_staff_name);
    insert into public.customer_debt_payments (filial, customer_local_id, customer_name, amount_uzs, box_local_id, staff_id, staff_name, idem_key)
    values (p_filial, v_party, left(p_record->>'customer_name', 200), v_amt, (p_record->>'box_local_id')::integer, p_staff_id, left(p_staff_name, 200), p_group_key);
    v_extra := jsonb_build_object('customerDebt', v_debt);
  elsif p_record_type = 'supplier_payment' then
    v_debt := public._supp_debt_move(p_filial, v_party, -v_amt, v_amt, 'strict', 'payment', 'pay:' || p_group_key, p_group_key,
                                     'supplier_payment', null, left(p_record->>'supplier_name', 200), p_staff_id, p_staff_name);
    insert into public.supplier_payments (filial, supplier_local_id, supplier_name, amount_usd, box_local_id, staff_id, staff_name, idem_key)
    values (p_filial, v_party, left(p_record->>'supplier_name', 200), v_amt, (p_record->>'box_local_id')::integer, p_staff_id, left(p_staff_name, 200), p_group_key);
    v_extra := (select jsonb_build_object('supplierDebt', debt, 'supplierPaid', total_paid) from public.supplier_balances where filial = p_filial and supplier_local_id = v_party);
  elsif p_record_type = 'home_withdrawal' then
    insert into public.home_withdrawals (filial, entries, note, staff_id, staff_name, idem_key)
    values (p_filial, coalesce(p_record->'entries', '[]'::jsonb), left(p_record->>'note', 500), p_staff_id, left(p_staff_name, 200), p_group_key);
  else
    v_debt := coalesce(v_dealer.debt_usd, 0);
    if v_amt is null or v_amt <= 0 or v_amt > v_debt + 0.01 then
      raise exception 'CASHBOX: to''lov (% $) diller qarzidan (% $) oshib ketdi', v_amt, v_debt using errcode = 'P0001';
    end if;
    insert into public.dealer_payments (dealer_id, amount_usd, note, idem_key)
    values (v_dealer.id, v_amt, left(p_record->>'note', 300), p_group_key);
    update public.dealers set debt_usd = greatest(round(debt_usd - v_amt, 2), 0), total_paid_usd = coalesce(total_paid_usd, 0) + v_amt
     where id = v_dealer.id
     returning debt_usd, total_paid_usd into v_dealer.debt_usd, v_dealer.total_paid_usd;
    v_extra := jsonb_build_object('dealerDebtUsd', v_dealer.debt_usd, 'dealerTotalPaidUsd', v_dealer.total_paid_usd);
  end if;
  return v_res || coalesce(v_extra, '{}'::jsonb);
end;
$$;

create or replace function public.cash_payment_atomic(
  p_filial text, p_group_key text, p_kind text, p_ops jsonb, p_record_type text, p_record jsonb,
  p_staff_id bigint default null, p_staff_name text default null)
 returns jsonb
 language sql
 set search_path = ''
as $$
  select public.cash_payment_atomic_v2(p_filial, p_group_key, p_kind, p_ops, p_record_type, p_record, p_staff_id, p_staff_name);
$$;

-- ── 10. Ombor va qarz amallari (savdodan tashqari) — bitta tranzaksiyada, idempotent ──
-- p_kind:
--   cust_set       {customerId, debt, reason:'opening'|'adjust', name}       — qo'lda qarz (boshlang'ich / tahrir)
--   supp_set       {supplierId, debt, reason, name}
--   batches_create {reason:'kirim'|'import'|'opening'|'dealer_return', batches:[{localId,pid,qty,costUsd,status,meta}],
--                   supplier:{id, consignment, goodsUsd, givenUsd}, kirimRef, fkRef}
--   batch_edit     {edits:[{localId, qty, costUsd}]}  — ta'minotchi qarzi farqi SERVERDA (yangi − eski qiymat)
--   batch_delete   {localIds:[...]}                     — holati 'deleted' (tarix saqlanadi)
--   batch_arrive   {localIds:[...], costAdds:{localId: $/dona}} — yo'ldagi partiya omborga keldi
--   revision       {facts:[{pid, fact}], apply, surplusIds:{pid: localId}, meta} — tizim qoldig'i SERVERDA
--   stock_out      {reason:'transfer'|'dealer', items:[{pid, qty}], target, targetBatches:[{pid, localId, costUsd, bno}],
--                   transferSale:{localId, inv, custName, items:[{pid, sku, name, qty, sellUsd}]}}
create or replace function public.stock_debt_op(
  p_filial text, p_op_key text, p_kind text, p_payload jsonb,
  p_staff_id bigint default null, p_staff_name text default null)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  v_r jsonb;
  p jsonb := coalesce(p_payload, '{}'::jsonb);
  v_key text := 'op:' || p_op_key;
  v_id bigint;
  v_val numeric;
  v_e jsonb;
  v_b public.batches;
  v_n int := 0;
  v_custs bigint[] := '{}';
  v_supps bigint[] := '{}';
  v_batches bigint[] := '{}';
  v_res jsonb := '{}'::jsonb;
  v_reason text;
  v_kind text;
  v_value numeric := 0;
  v_goods numeric;
  v_given numeric;
  v_paid_rec numeric;
  v_rate numeric;
  v_ref text;
  v_fkref text;
  v_status text;
  v_consign boolean;
  v_supp bigint;
  v_side jsonb := '[]'::jsonb;
  v_bd numeric := 0;
  v_fifo jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_items jsonb := '[]'::jsonb;
  v_sys numeric;
  v_cost numeric;
  v_fact numeric;
  v_diff numeric;
  v_target text;
  v_tsale jsonb;
  v_ttotal numeric := 0;
  v_tcost numeric := 0;
  r record;
begin
  v_r := public._ledger_op_replay(p_filial, p_op_key, p_kind);
  if v_r is not null then return v_r; end if;
  if coalesce(p_filial, '') = '' then raise exception 'LEDGER: filial majburiy' using errcode = 'P0001'; end if;

  if p_kind = 'cust_set' or p_kind = 'supp_set' then
    v_id := case when coalesce(p->>(case when p_kind = 'cust_set' then 'customerId' else 'supplierId' end), '') ~ '^[0-9]{1,18}$'
                 then (p->>(case when p_kind = 'cust_set' then 'customerId' else 'supplierId' end))::bigint end;
    v_val := public._fw_num(p->>'debt');
    if v_id is null or v_id <= 0 or v_val < 0 or v_val > 1000000000000 then
      raise exception 'LEDGER: qarz qiymati noto''g''ri' using errcode = 'P0001';
    end if;
    v_kind := case when p->>'reason' = 'opening' then 'opening' else 'adjust' end;
    if p_kind = 'cust_set' then
      v_val := public._cust_debt_move(p_filial, v_id, v_val, 'set', v_kind, v_key, v_key, 'customer', v_id::text,
                                      left('Qo''lda: ' || coalesce(p->>'name', ''), 500), p_staff_id, p_staff_name);
      v_custs := array[v_id];
    else
      v_val := public._supp_debt_move(p_filial, v_id, v_val, 0, 'set', v_kind, v_key, v_key, 'supplier', v_id::text,
                                      left('Qo''lda: ' || coalesce(p->>'name', ''), 500), p_staff_id, p_staff_name);
      v_supps := array[v_id];
    end if;
    v_res := jsonb_build_object('debt', v_val);

  elsif p_kind = 'batches_create' then
    v_reason := p->>'reason';
    if v_reason is null or v_reason not in ('kirim','import','opening','dealer_return') then
      raise exception 'LEDGER: kirim turi noto''g''ri' using errcode = 'P0001';
    end if;
    if jsonb_typeof(p->'batches') <> 'array' or jsonb_array_length(p->'batches') < 1 or jsonb_array_length(p->'batches') > 500 then
      raise exception 'LEDGER: partiyalar ro''yxati noto''g''ri' using errcode = 'P0001';
    end if;
    v_ref := left(p->>'kirimRef', 64);
    v_fkref := left(p->>'fkRef', 64);
    v_supp := case when coalesce(p->'supplier'->>'id', '') ~ '^[0-9]{1,18}$' then (p->'supplier'->>'id')::bigint end;
    v_consign := v_supp is not null and coalesce(p->'supplier'->>'consignment', 'false') = 'true';
    v_kind := case v_reason when 'opening' then 'opening_stock' else v_reason end;
    for v_e in select * from jsonb_array_elements(p->'batches') loop
      v_n := v_n + 1;
      v_status := case when v_reason = 'kirim' and v_e->>'status' = 'transit' then 'transit' else 'active' end;
      v_b := public._batch_insert(p_filial, v_e->>'localId', public._fw_num(v_e->>'pid')::bigint, public._fw_num(v_e->>'qty'),
               public._fw_num(v_e->>'costUsd'), v_status,
               coalesce(v_e->'meta', '{}'::jsonb) || jsonb_build_object('kirimRef', v_ref, 'fkRef', v_fkref,
                 'suppId', case when v_reason in ('kirim','import') then v_supp end, 'consignment', v_consign and v_reason in ('kirim','import'),
                 'fromBranch', null),
               v_kind, v_key || ':' || v_n, v_key, v_reason, coalesce(v_ref, p_op_key), p_staff_id, p_staff_name);
      v_batches := v_batches || v_b.id;
      v_value := v_value + v_b.qty * v_b.cost_usd;
    end loop;
    if v_reason in ('kirim','import') and v_supp is not null and not v_consign then
      v_goods := public._fw_num(p->'supplier'->>'goodsUsd');
      v_given := case when v_reason = 'kirim' then public._fw_num(p->'supplier'->>'givenUsd') else 0 end;
      if v_goods < 0 or v_given < 0 then raise exception 'LEDGER: kirim summasi noto''g''ri' using errcode = 'P0001'; end if;
      if v_goods > v_value + greatest(0.01, v_value * 0.001) then
        raise exception 'LEDGER: tovar qiymati (% $) partiyalar qiymatidan (% $) oshib ketdi', round(v_goods, 2), round(v_value, 2) using errcode = 'P0001';
      end if;
      if v_given > 0 then
        -- "To'langan" summa — kassa / Firma kassa jurnalidagi HAQIQIY to'lovdan oshmasin
        if exists (select 1 from public.batches b where b.filial = p_filial and b.kirim_ref = v_ref and b.id <> all(v_batches)) then
          raise exception 'LEDGER: bu to''lov boshqa kirimga bog''langan' using errcode = 'P0001';
        end if;
        v_rate := nullif(public._fw_num((select data->'settings'->>'usdUzs' from public.app_data where id = 'main')), 0);
        select coalesce(sum(case when l.currency = 'USD' then l.amount when v_rate is not null then l.amount / v_rate else 0 end), 0) into v_paid_rec
          from public.cashbox_ledger l where l.filial = p_filial and l.ref_type = 'kirim' and l.ref_id = v_ref and l.direction = 'out';
        v_paid_rec := v_paid_rec + coalesce((select sum(case when f.currency = 'USD' then f.amount when v_rate is not null then f.amount / v_rate else 0 end)
          from public.firma_kassa_ledger f where f.op_type = 'kirim_payment' and f.ref_id = v_fkref and v_fkref is not null and f.reversed_by is null), 0);
        if v_given > v_paid_rec + 0.01 then
          raise exception 'LEDGER: to''langan summa (% $) kassa yozuvlaridan (% $) oshib ketdi', round(v_given, 2), round(v_paid_rec, 2) using errcode = 'P0001';
        end if;
      end if;
      perform public._supp_debt_move(p_filial, v_supp, v_goods - v_given, v_given, case when v_reason = 'kirim' then 'clamp' else 'strict' end,
                                     v_reason, v_key || ':s', v_key, v_reason, coalesce(v_ref, p_op_key), 'Kirim', p_staff_id, p_staff_name);
      v_supps := array[v_supp];
    end if;
    v_res := jsonb_build_object('created', (select jsonb_agg(jsonb_build_object('localId', local_id, 'pid', pid, 'qty', qty, 'costUsd', cost_usd, 'status', status) order by id)
                                            from public.batches where id = any(v_batches)));

  elsif p_kind = 'batch_edit' then
    if jsonb_typeof(p->'edits') <> 'array' or jsonb_array_length(p->'edits') < 1 or jsonb_array_length(p->'edits') > 500 then
      raise exception 'LEDGER: tahrir ro''yxati noto''g''ri' using errcode = 'P0001';
    end if;
    perform 1 from public.batches where filial = p_filial and local_id in (select e->>'localId' from jsonb_array_elements(p->'edits') e)
      order by id for update;
    for r in select b.*, public._fw_num(e->>'qty') as nq, public._fw_num(e->>'costUsd') as nc
               from jsonb_array_elements(p->'edits') e join public.batches b on b.filial = p_filial and b.local_id = e->>'localId'
              order by b.id loop
      if r.status = 'deleted' then raise exception 'LEDGER: partiya o''chirilgan' using errcode = 'P0001'; end if;
      if r.nq < r.sold - 0.000001 then
        raise exception 'LEDGER: miqdor sotilgandan (%) kam bo''la olmaydi', r.sold using errcode = 'P0001';
      end if;
      if r.nc < 0 or r.nc > 10000000 or r.nq > 10000000 then raise exception 'LEDGER: miqdor yoki tannarx noto''g''ri' using errcode = 'P0001'; end if;
      continue when r.nq = r.qty and r.nc = r.cost_usd;
      v_n := v_n + 1;
      if r.supp_id is not null then
        v_side := v_side || jsonb_build_object('supp', r.supp_id, 'usd', r.nq * r.nc - r.qty * r.cost_usd);
      end if;
      v_b := public._stock_move(r.id, r.nq - r.qty, 0, 'edit', v_key || ':' || r.id, v_key, 'batch', r.local_id, 'Partiya tahrirlandi',
                                p_staff_id, p_staff_name, null, r.nc);
      v_batches := v_batches || r.id;
    end loop;
    if jsonb_array_length((select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(p->'edits') e)) <>
       (select count(*) from jsonb_array_elements(p->'edits') e join public.batches b on b.filial = p_filial and b.local_id = e->>'localId') then
      raise exception 'LEDGER: partiya topilmadi' using errcode = 'P0001';
    end if;
    for r in select (e->>'supp')::bigint as supp, sum(public._fw_num(e->>'usd')) as usd from jsonb_array_elements(v_side) e group by 1 order by 1 loop
      continue when r.usd = 0;
      perform public._supp_debt_move(p_filial, r.supp, r.usd, 0, 'clamp', 'batch_edit', v_key || ':s:' || r.supp, v_key, 'batch', null,
                                     'Partiya tahriri', p_staff_id, p_staff_name);
      v_supps := v_supps || r.supp;
    end loop;
    v_res := jsonb_build_object('changed', v_n);

  elsif p_kind = 'batch_delete' or p_kind = 'batch_arrive' then
    if jsonb_typeof(p->'localIds') <> 'array' or jsonb_array_length(p->'localIds') < 1 or jsonb_array_length(p->'localIds') > 500 then
      raise exception 'LEDGER: partiyalar ro''yxati noto''g''ri' using errcode = 'P0001';
    end if;
    if (select count(*) from public.batches b where b.filial = p_filial and b.local_id in (select jsonb_array_elements_text(p->'localIds')))
       <> (select count(distinct x) from jsonb_array_elements_text(p->'localIds') x) then
      raise exception 'LEDGER: partiya topilmadi' using errcode = 'P0001';
    end if;
    for r in select b.* from public.batches b where b.filial = p_filial and b.local_id in (select jsonb_array_elements_text(p->'localIds')) order by b.id for update loop
      if p_kind = 'batch_delete' then
        v_b := public._stock_move(r.id, 0, 0, 'delete', v_key || ':' || r.id, v_key, 'batch', r.local_id, 'Partiya o''chirildi',
                                  p_staff_id, p_staff_name, 'deleted', null);
      else
        if r.status <> 'transit' then raise exception 'LEDGER: partiya yo''lda emas (%)', r.local_id using errcode = 'P0001'; end if;
        v_val := public._fw_num(p->'costAdds'->>r.local_id);
        if v_val < 0 or v_val > 1000000 then raise exception 'LEDGER: bojxona ulushi noto''g''ri' using errcode = 'P0001'; end if;
        v_b := public._stock_move(r.id, 0, 0, 'arrive', v_key || ':' || r.id, v_key, 'batch', r.local_id, 'Partiya keldi',
                                  p_staff_id, p_staff_name, 'active', r.cost_usd + v_val);
      end if;
      v_batches := v_batches || r.id;
    end loop;

  elsif p_kind = 'revision' then
    if jsonb_typeof(p->'facts') <> 'array' or jsonb_array_length(p->'facts') < 1 or jsonb_array_length(p->'facts') > 5000 then
      raise exception 'LEDGER: reviziya ro''yxati noto''g''ri' using errcode = 'P0001';
    end if;
    for v_e in select e from jsonb_array_elements(p->'facts') e order by public._fw_num(e->>'pid') loop
      v_id := public._fw_num(v_e->>'pid')::bigint;
      v_fact := public._fw_num(v_e->>'fact');
      if v_id <= 0 or v_fact < 0 or v_fact > 10000000 then raise exception 'LEDGER: reviziya qatori noto''g''ri' using errcode = 'P0001'; end if;
      perform 1 from public.batches where filial = p_filial and pid = v_id and status = 'active' order by batch_date asc nulls last, id asc for update;
      select coalesce(sum(qty - sold), 0) into v_sys from public.batches where filial = p_filial and pid = v_id and status = 'active';
      select cost_usd into v_cost from public.batches where filial = p_filial and pid = v_id and status = 'active' and qty > sold
        order by batch_date asc nulls last, id asc limit 1;
      v_cost := coalesce(v_cost, 0);
      v_diff := v_fact - v_sys;
      if coalesce(p->>'apply', 'false') = 'true' and v_diff <> 0 then
        v_n := v_n + 1;
        if v_diff > 0 then
          v_b := public._batch_insert(p_filial, p->'surplusIds'->>v_id::text, v_id, v_diff, v_cost, 'active',
                   coalesce(p->'meta', '{}'::jsonb) || jsonb_build_object('origin', 'Revizya ortig''i'),
                   'revision', v_key || ':' || v_n, v_key, 'revision', p_op_key, p_staff_id, p_staff_name);
          v_batches := v_batches || v_b.id;
        else
          v_fifo := public._stock_fifo_out(p_filial, v_id, -v_diff, 'revision', v_key || ':' || v_n, v_key, 'revision', p_op_key,
                                           'Reviziya kamomadi', p_staff_id, p_staff_name);
          v_side := v_side || (v_fifo->'side');
          v_bd := v_bd + (v_fifo->>'bd')::numeric;
          v_batches := v_batches || array(select (a->>'batchId')::bigint from jsonb_array_elements(v_fifo->'allocs') a);
        end if;
      end if;
      v_rows := v_rows || jsonb_build_object('pid', v_id, 'sysQty', v_sys, 'factQty', v_fact, 'diff', v_diff, 'diffUsd', v_diff * v_cost, 'cost', v_cost);
    end loop;
    v_supps := public._fw_apply_side_debts(p_filial, v_side, v_bd, v_key, v_key, 'revision', p_op_key, p_staff_id, p_staff_name);
    v_res := jsonb_build_object('rows', v_rows);

  elsif p_kind = 'stock_out' then
    v_reason := p->>'reason';
    if v_reason is null or v_reason not in ('transfer','dealer') then raise exception 'LEDGER: amal turi noto''g''ri' using errcode = 'P0001'; end if;
    if jsonb_typeof(p->'items') <> 'array' or jsonb_array_length(p->'items') < 1 or jsonb_array_length(p->'items') > 500 then
      raise exception 'LEDGER: mahsulotlar ro''yxati noto''g''ri' using errcode = 'P0001';
    end if;
    if v_reason = 'transfer' then
      v_target := p->>'target';
      if p_filial <> 'baza' or coalesce(v_target, '') !~ '^[a-z0-9_]{1,40}$' or v_target = 'baza' then
        raise exception 'LEDGER: ko''chirish faqat Bazadan filialga' using errcode = 'P0001';
      end if;
    end if;
    for v_e in select e from jsonb_array_elements(p->'items') e order by public._fw_num(e->>'pid') loop
      v_n := v_n + 1;
      v_id := public._fw_num(v_e->>'pid')::bigint;
      v_fifo := public._stock_fifo_out(p_filial, v_id, public._fw_num(v_e->>'qty'), case when v_reason = 'transfer' then 'transfer_out' else 'dealer_out' end,
                                       v_key || ':' || v_n, v_key, v_reason, coalesce(v_target, p->>'dealerId', p_op_key),
                                       case when v_reason = 'transfer' then 'Filialga: ' || v_target else 'Dillerga' end, p_staff_id, p_staff_name);
      v_side := v_side || (v_fifo->'side');
      v_bd := v_bd + (v_fifo->>'bd')::numeric;
      v_batches := v_batches || array(select (a->>'batchId')::bigint from jsonb_array_elements(v_fifo->'allocs') a);
      v_items := v_items || jsonb_build_object('pid', v_id, 'qty', public._fw_num(v_e->>'qty'), 'firstCost', (v_fifo->>'firstCost')::numeric, 'cost', (v_fifo->>'cost')::numeric);
    end loop;
    v_supps := public._fw_apply_side_debts(p_filial, v_side, v_bd, v_key, v_key, v_reason, p_op_key, p_staff_id, p_staff_name);
    if v_reason = 'transfer' then
      if jsonb_typeof(p->'targetBatches') <> 'array' then raise exception 'LEDGER: filial partiyalari yo''q' using errcode = 'P0001'; end if;
      for v_e in select * from jsonb_array_elements(p->'targetBatches') loop
        if public._fw_num(v_e->>'qty') <> coalesce((select sum(public._fw_num(i->>'qty')) from jsonb_array_elements(p->'items') i
                                                    where public._fw_num(i->>'pid') = public._fw_num(v_e->>'pid')), -1) then
          raise exception 'LEDGER: filial partiyasi miqdori Bazadan chiqqan miqdorga teng emas' using errcode = 'P0001';
        end if;
        v_b := public._batch_insert(v_target, v_e->>'localId', public._fw_num(v_e->>'pid')::bigint, public._fw_num(v_e->>'qty'),
                 public._fw_num(v_e->>'costUsd'), 'active',
                 jsonb_build_object('origin', 'Bazadan (filial)', 'fromBranch', 'baza', 'bno', left(v_e->>'bno', 20), 'date', v_e->>'date'),
                 'transfer_in', v_key || ':t:' || (v_e->>'localId'), v_key, 'transfer', p_op_key, p_staff_id, p_staff_name);
        v_batches := v_batches || v_b.id;
      end loop;
      v_tsale := p->'transferSale';
      if v_tsale is not null and jsonb_typeof(v_tsale) = 'object' then
        select coalesce(sum(public._fw_num(i->>'qty') * public._fw_num(i->>'sellUsd')), 0) into v_ttotal from jsonb_array_elements(v_tsale->'items') i;
        select coalesce(sum(public._fw_num(x->>'qty') * public._fw_num(x->>'firstCost')), 0) into v_tcost from jsonb_array_elements(v_items) x;
        insert into public.sales (filial, inv, cust_id, subtotal_usd, disc_pct, total_usd, cost_usd, profit_usd, paid_usd, debt_usd, items,
                                  local_id, pay_type, cust_name, disc_usd, sale_date, status, staff_id, staff_name, is_transfer)
        values (p_filial, left(v_tsale->>'inv', 40), null, v_ttotal, 0, v_ttotal, v_tcost, v_ttotal - v_tcost, 0, v_ttotal,
                (select coalesce(jsonb_agg(jsonb_build_object('pid', public._fw_num(i->>'pid')::bigint, 'sku', left(i->>'sku', 80), 'name', left(i->>'name', 300),
                   'qty', public._fw_num(i->>'qty'), 'sell_usd', public._fw_num(i->>'sellUsd'),
                   'cost_usd', coalesce((select (x->>'firstCost')::numeric from jsonb_array_elements(v_items) x where (x->>'pid')::bigint = public._fw_num(i->>'pid')::bigint limit 1), 0),
                   'line_usd', public._fw_num(i->>'qty') * public._fw_num(i->>'sellUsd'), 'direct_supply', false, 'supp_id', null)), '[]'::jsonb)
                   from jsonb_array_elements(v_tsale->'items') i),
                v_tsale->>'localId', 'debt', left(v_tsale->>'custName', 200), 0, current_date, 'done', p_staff_id, left(p_staff_name, 200), true);
      end if;
    end if;
    v_res := jsonb_build_object('items', v_items);
  else
    raise exception 'LEDGER: noma''lum amal' using errcode = 'P0001';
  end if;

  return public._ledger_op_finish(p_filial, p_op_key, p_kind, jsonb_build_object('ok', true, 'kind', p_kind) || v_res,
                                  v_custs, v_supps, v_batches, p_staff_id, p_staff_name);
end;
$$;

-- ── 11. app_data (asosiy qator) — branchDebt faqat serverda o'zgaradi ───
-- Brauzer saqlashi (app-data-save) branchDebt'ni qayta yozmaydi: shu zahotdagi bazadagi qiymat qoladi
-- (yozish paytida qator qulflanadi — sotuvdagi oshirish yo'qolmaydi).
create or replace function public.app_data_save_main(p_data jsonb)
 returns void
 language plpgsql
 set search_path = ''
as $$
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'LEDGER: ma''lumot noto''g''ri' using errcode = 'P0001';
  end if;
  update public.app_data
     set data = (p_data - 'branchDebt') || jsonb_build_object('branchDebt', coalesce(data->'branchDebt', '{}'::jsonb)), updated_at = now()
   where id = 'main';
  if not found then
    insert into public.app_data (id, data, updated_at) values ('main', p_data, now());
  end if;
end;
$$;

-- v23.10: ilovada yo'q (eskirgan soya) partiyalar FIFO'dan chiqarilishidan OLDIN asl qatori to'liq saqlanadi.
-- Hech narsa o'chirilmaydi. Egasi qaror qiladi: tovar haqiqatan yo'q — 'confirmed_absent';
-- bor bo'lsa — ilovada «Boshlang'ich qoldiq» orqali kiritiladi ('reentered'). SQL orqali 'active' qilinmasin:
-- ilova faqat o'z ro'yxatidagi partiyalarni ko'rsatadi (server va ilova ajralib qoladi).
create table if not exists public.m27_stale_batches_archive (
  batch_id bigint primary key,
  filial text not null,
  local_id text,
  pid bigint,
  qty numeric,
  sold numeric,
  cost_usd numeric,
  original jsonb not null,
  archived_at timestamp with time zone not null default now(),
  decision text not null default 'pending',
  decided_at timestamp with time zone,
  decided_by text,
  note text,
  constraint m27_stale_batches_archive_decision_chk check (decision in ('pending','confirmed_absent','reentered'))
);
alter table public.m27_stale_batches_archive enable row level security;
revoke all on public.m27_stale_batches_archive from public, anon, authenticated;
grant select, update on public.m27_stale_batches_archive to service_role;

-- ── 12. Boshlang'ich qiymatlar — hozirgi JSON'dan BIR MARTA ('opening') ─────
-- Manba: app_data_branches.data (ilova shu yerdan yuklaydi), yo'q bo'lsa app_data.branchStore[filial].
-- Qayta ishga tushirilsa: jurnalida yozuvi bor mijoz/ta'minotchi/partiyaga TEGILMAYDI.
do $$
declare
  r record;
  v_old numeric;
  v_val numeric;
  v_paid numeric;
  v_b public.batches;
  v_qty numeric;
  v_sold numeric;
  v_status text;
  v_inv text;
  v_items jsonb;
  v_filials text[];
begin
  perform set_config('fw.debt_move', '1', true);
  perform set_config('fw.stock_move', '1', true);

  select coalesce(array_agg(distinct f), '{}') into v_filials from (
    select b.branch_key as f from public.app_data_branches b where jsonb_typeof(b.data) = 'object'
    union select s.key from public.app_data a, jsonb_each(coalesce(a.data->'branchStore', '{}'::jsonb)) s
     where a.id = 'main' and jsonb_typeof(s.value) = 'object') q;

  -- 12a. Mijozlar (so'm)
  for r in
    with src as (
      select b.branch_key as filial, b.data from public.app_data_branches b where jsonb_typeof(b.data) = 'object'
      union all
      select s.key, s.value from public.app_data a, jsonb_each(coalesce(a.data->'branchStore', '{}'::jsonb)) s
       where a.id = 'main' and jsonb_typeof(s.value) = 'object'
         and not exists (select 1 from public.app_data_branches b2 where b2.branch_key = s.key and jsonb_typeof(b2.data) = 'object'))
    select src.filial, (c->>'id')::bigint as id, c->>'debt' as debt from src,
           jsonb_array_elements(case when jsonb_typeof(src.data->'customers') = 'array' then src.data->'customers' else '[]'::jsonb end) c
     where jsonb_typeof(c) = 'object' and coalesce(c->>'id', '') ~ '^[0-9]{1,18}$' and (c->>'id')::numeric > 0
  loop
    continue when exists (select 1 from public.customer_debt_ledger l where l.filial = r.filial and l.customer_local_id = r.id);
    v_val := round(public._fw_num(r.debt), 2);
    select debt into v_old from public.customer_balances where filial = r.filial and customer_local_id = r.id;
    insert into public.customer_balances (filial, customer_local_id, debt, currency, updated_at) values (r.filial, r.id, v_val, 'UZS', now())
      on conflict (filial, customer_local_id) do update set debt = excluded.debt, currency = 'UZS', updated_at = now();
    insert into public.customer_debt_ledger (filial, customer_local_id, delta, balance_after, op_kind, op_key, note)
      values (r.filial, r.id, v_val, v_val, 'opening', 'opening:' || r.id,
              'Boshlang''ich qoldiq (27-migratsiya, ilovadagi qiymat)' || case when v_old is not null then ' · avvalgi soya qiymati: ' || v_old else '' end)
      on conflict (filial, op_key) do nothing;
  end loop;
  -- JSON'da yo'q (eskirgan soya) mijoz qatorlari — 0 ga tenglashtiriladi, eski qiymat izohda
  for r in select cb.filial, cb.customer_local_id as id, cb.debt from public.customer_balances cb
            where not exists (select 1 from public.customer_debt_ledger l where l.filial = cb.filial and l.customer_local_id = cb.customer_local_id) loop
    update public.customer_balances set debt = 0, currency = 'UZS', updated_at = now() where filial = r.filial and customer_local_id = r.id;
    insert into public.customer_debt_ledger (filial, customer_local_id, delta, balance_after, op_kind, op_key, note)
      values (r.filial, r.id, 0, 0, 'opening', 'opening:' || r.id, 'Ilovada yo''q mijoz — soya qiymati bekor qilindi: ' || r.debt)
      on conflict (filial, op_key) do nothing;
  end loop;

  -- 12b. Ta'minotchilar ($)
  for r in
    with src as (
      select b.branch_key as filial, b.data from public.app_data_branches b where jsonb_typeof(b.data) = 'object'
      union all
      select s.key, s.value from public.app_data a, jsonb_each(coalesce(a.data->'branchStore', '{}'::jsonb)) s
       where a.id = 'main' and jsonb_typeof(s.value) = 'object'
         and not exists (select 1 from public.app_data_branches b2 where b2.branch_key = s.key and jsonb_typeof(b2.data) = 'object'))
    select src.filial, (c->>'id')::bigint as id, c->>'debt' as debt, c->>'paid' as paid from src,
           jsonb_array_elements(case when jsonb_typeof(src.data->'suppliers') = 'array' then src.data->'suppliers' else '[]'::jsonb end) c
     where jsonb_typeof(c) = 'object' and coalesce(c->>'id', '') ~ '^[0-9]{1,18}$' and (c->>'id')::numeric > 0
  loop
    continue when exists (select 1 from public.supplier_debt_ledger l where l.filial = r.filial and l.supplier_local_id = r.id);
    v_val := round(public._fw_num(r.debt), 4);
    v_paid := greatest(round(public._fw_num(r.paid), 4), 0);
    select debt into v_old from public.supplier_balances where filial = r.filial and supplier_local_id = r.id;
    insert into public.supplier_balances (filial, supplier_local_id, debt, currency, total_paid, updated_at) values (r.filial, r.id, v_val, 'USD', v_paid, now())
      on conflict (filial, supplier_local_id) do update set debt = excluded.debt, currency = 'USD', total_paid = excluded.total_paid, updated_at = now();
    insert into public.supplier_debt_ledger (filial, supplier_local_id, delta, paid_delta, balance_after, op_kind, op_key, note)
      values (r.filial, r.id, v_val, v_paid, v_val, 'opening', 'opening:' || r.id,
              'Boshlang''ich qoldiq (27-migratsiya, ilovadagi qiymat)' || case when v_old is not null then ' · avvalgi soya qiymati: ' || v_old else '' end)
      on conflict (filial, op_key) do nothing;
  end loop;
  for r in select sb.filial, sb.supplier_local_id as id, sb.debt from public.supplier_balances sb
            where not exists (select 1 from public.supplier_debt_ledger l where l.filial = sb.filial and l.supplier_local_id = sb.supplier_local_id) loop
    update public.supplier_balances set debt = 0, currency = 'USD', updated_at = now() where filial = r.filial and supplier_local_id = r.id;
    insert into public.supplier_debt_ledger (filial, supplier_local_id, delta, paid_delta, balance_after, op_kind, op_key, note)
      values (r.filial, r.id, 0, 0, 0, 'opening', 'opening:' || r.id, 'Ilovada yo''q ta''minotchi — soya qiymati bekor qilindi: ' || r.debt)
      on conflict (filial, op_key) do nothing;
  end loop;

  -- 12c. Partiyalar (ombor qoldig'i)
  for r in
    with src as (
      select b.branch_key as filial, b.data from public.app_data_branches b where jsonb_typeof(b.data) = 'object'
      union all
      select s.key, s.value from public.app_data a, jsonb_each(coalesce(a.data->'branchStore', '{}'::jsonb)) s
       where a.id = 'main' and jsonb_typeof(s.value) = 'object'
         and not exists (select 1 from public.app_data_branches b2 where b2.branch_key = s.key and jsonb_typeof(b2.data) = 'object'))
    select src.filial, bt from src,
           jsonb_array_elements(case when jsonb_typeof(src.data->'batches') = 'array' then src.data->'batches' else '[]'::jsonb end) bt
     where jsonb_typeof(bt) = 'object' and coalesce(bt->>'id', '') ~ '^[0-9A-Za-z_.:-]{1,64}$'
       and coalesce(bt->>'pid', '') ~ '^[0-9]{1,18}$'
  loop
    select * into v_b from public.batches where filial = r.filial and local_id = r.bt->>'id';
    continue when found and exists (select 1 from public.stock_ledger l where l.batch_id = v_b.id);
    v_qty := greatest(public._fw_num(r.bt->>'qty'), 0);
    v_sold := least(greatest(public._fw_num(r.bt->>'sold'), 0), v_qty);
    v_status := case when r.bt->>'status' = 'transit' then 'transit' when v_qty - v_sold <= 0.000001 then 'empty' else 'active' end;
    if v_b.id is not null then
      update public.batches set pid = (r.bt->>'pid')::bigint, qty = v_qty, sold = v_sold, status = v_status,
             cost_usd = greatest(public._fw_num(r.bt->>'costUsd'), 0), bank_fee_usd = greatest(public._fw_num(r.bt->>'bankFeeUsd'), 0),
             supp_id = case when coalesce(r.bt->>'suppId', '') ~ '^[0-9]{1,18}$' then (r.bt->>'suppId')::bigint end,
             consignment = coalesce(r.bt->>'consignment', 'false') = 'true',
             from_branch = case when r.bt->>'fromBranch' ~ '^[a-z0-9_]{1,40}$' then r.bt->>'fromBranch' end,
             batch_date = case when coalesce(r.bt->>'date', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (r.bt->>'date')::date else batch_date end,
             bno = left(r.bt->>'bno', 20), origin = left(r.bt->>'origin', 300), kirim_ref = left(r.bt->>'kirimRef', 64), fk_ref = left(r.bt->>'fkRef', 64),
             updated_at = now()
       where id = v_b.id returning * into v_b;
    else
      insert into public.batches (local_id, filial, pid, bno, origin, cur, qty, sold, cost_usd, bank_fee_usd, supp_id, consignment,
                                  rate_usd_uzs, rate_usd_cny, batch_date, status, performed_by, from_branch, kirim_ref, fk_ref)
      values (r.bt->>'id', r.filial, (r.bt->>'pid')::bigint, left(r.bt->>'bno', 20), left(r.bt->>'origin', 300),
              case when r.bt->>'cur' in ('USD','UZS','CNY','KRW') then r.bt->>'cur' else 'USD' end,
              v_qty, v_sold, greatest(public._fw_num(r.bt->>'costUsd'), 0), greatest(public._fw_num(r.bt->>'bankFeeUsd'), 0),
              case when coalesce(r.bt->>'suppId', '') ~ '^[0-9]{1,18}$' then (r.bt->>'suppId')::bigint end,
              coalesce(r.bt->>'consignment', 'false') = 'true',
              nullif(public._fw_num(r.bt->'rates'->>'usdUzs'), 0), nullif(public._fw_num(r.bt->'rates'->>'usdCny'), 0),
              case when coalesce(r.bt->>'date', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (r.bt->>'date')::date end,
              v_status, left(r.bt->>'performedBy', 200),
              case when r.bt->>'fromBranch' ~ '^[a-z0-9_]{1,40}$' then r.bt->>'fromBranch' end,
              left(r.bt->>'kirimRef', 64), left(r.bt->>'fkRef', 64))
      returning * into v_b;
    end if;
    insert into public.stock_ledger (filial, batch_id, batch_local_id, pid, d_qty, d_sold, qty_after, sold_after, cost_usd, status_after, op_kind, op_key, note)
      values (v_b.filial, v_b.id, v_b.local_id, v_b.pid, v_b.qty, v_b.sold, v_b.qty, v_b.sold, v_b.cost_usd, v_b.status, 'opening', 'opening:' || v_b.id,
              'Boshlang''ich qoldiq (27-migratsiya, ilovadagi qiymat)')
      on conflict (filial, op_key) do nothing;
  end loop;
  -- Ilovada yo'q (eskirgan soya) partiyalar — FIFO'dan chiqariladi ('deleted'), o'chirilmaydi
  for v_b in select b.* from public.batches b
              where b.filial = any(v_filials) and b.status is distinct from 'deleted'
                and not exists (select 1 from public.stock_ledger l where l.batch_id = b.id) loop
    insert into public.m27_stale_batches_archive (batch_id, filial, local_id, pid, qty, sold, cost_usd, original)
      values (v_b.id, v_b.filial, v_b.local_id, v_b.pid, v_b.qty, v_b.sold, v_b.cost_usd, to_jsonb(v_b))
      on conflict (batch_id) do nothing;
    update public.batches set status = 'deleted', deleted_at = now(), updated_at = now() where id = v_b.id;
    insert into public.stock_ledger (filial, batch_id, batch_local_id, pid, d_qty, d_sold, qty_after, sold_after, cost_usd, status_after, op_kind, op_key, note)
      values (v_b.filial, v_b.id, v_b.local_id, v_b.pid, v_b.qty, v_b.sold, v_b.qty, v_b.sold, v_b.cost_usd, 'deleted', 'archive', 'archive:' || v_b.id,
              'Ilovada yo''q partiya (eskirgan soya) — FIFO''dan chiqarildi')
      on conflict (filial, op_key) do nothing;
  end loop;

  -- 12d. Savdolar — qaytarish/tahrir/o'chirish serverdagi yozuvdan hisoblanishi uchun
  for r in
    with src as (
      select b.branch_key as filial, b.data from public.app_data_branches b where jsonb_typeof(b.data) = 'object'
      union all
      select s.key, s.value from public.app_data a, jsonb_each(coalesce(a.data->'branchStore', '{}'::jsonb)) s
       where a.id = 'main' and jsonb_typeof(s.value) = 'object'
         and not exists (select 1 from public.app_data_branches b2 where b2.branch_key = s.key and jsonb_typeof(b2.data) = 'object'))
    select src.filial, sl from src,
           jsonb_array_elements(case when jsonb_typeof(src.data->'sales') = 'array' then src.data->'sales' else '[]'::jsonb end) sl
     where jsonb_typeof(sl) = 'object' and coalesce(sl->>'id', '') ~ '^[0-9A-Za-z_.:-]{1,64}$'
  loop
    continue when exists (select 1 from public.sales where filial = r.filial and local_id = r.sl->>'id');
    v_inv := left(coalesce(nullif(r.sl->>'inv', ''), 'S-' || (r.sl->>'id')), 40);
    select coalesce(jsonb_agg(jsonb_build_object('pid', public._fw_num(i->>'pid')::bigint, 'sku', left(i->>'sku', 80), 'name', left(i->>'name', 300),
             'qty', public._fw_num(i->>'qty'), 'sell_usd', public._fw_num(i->>'sellUsd'), 'cost_usd', public._fw_num(i->>'costUsd'),
             'line_usd', public._fw_num(i->>'qty') * public._fw_num(i->>'sellUsd'),
             'direct_supply', coalesce(i->>'directSupply', 'false') = 'true',
             'supp_id', case when coalesce(i->>'suppId', '') ~ '^[0-9]{1,18}$' then (i->>'suppId')::bigint end) order by o), '[]'::jsonb)
      into v_items
      from jsonb_array_elements(case when jsonb_typeof(r.sl->'items') = 'array' then r.sl->'items' else '[]'::jsonb end) with ordinality as t(i, o)
     where jsonb_typeof(i) = 'object';
    update public.sales set local_id = r.sl->>'id', items = v_items,
           cust_id = case when coalesce(r.sl->>'custId', '') ~ '^[0-9]{1,18}$' then (r.sl->>'custId')::bigint end,
           subtotal_usd = public._fw_num(r.sl->>'subtotalUsd'), disc_pct = least(greatest(public._fw_num(r.sl->>'disc'), 0), 100),
           total_usd = public._fw_num(r.sl->>'totalUsd'), paid_usd = public._fw_num(r.sl->>'paidUsd'), debt_usd = public._fw_num(r.sl->>'debtUsd'),
           profit_usd = public._fw_num(r.sl->>'profitUsd'), disc_usd = public._fw_num(r.sl->>'discUsd'),
           pay_type = left(r.sl->>'payType', 20),
           box_id = case when coalesce(r.sl->>'boxId', '') ~ '^[0-9]{1,9}$' then (r.sl->>'boxId')::int end,
           mixed_rows = case when jsonb_typeof(r.sl->'mixedRows') = 'array' then r.sl->'mixedRows' end,
           cust_name = left(r.sl->>'custName', 200),
           sale_date = case when coalesce(r.sl->>'date', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (r.sl->>'date')::date end,
           staff_name = left(r.sl->>'staffName', 200), is_transfer = coalesce(r.sl->>'isFilialTransfer', 'false') = 'true'
     where filial = r.filial and inv = v_inv and local_id is null;
    if not found then
      if exists (select 1 from public.sales where filial = r.filial and inv = v_inv) then
        v_inv := left(v_inv, 20) || '#' || right(r.sl->>'id', 19);
      end if;
      insert into public.sales (filial, inv, cust_id, subtotal_usd, disc_pct, total_usd, cost_usd, profit_usd, paid_usd, debt_usd, items,
                                local_id, pay_type, box_id, mixed_rows, cust_name, disc_usd, sale_date, status, staff_name, is_transfer)
      values (r.filial, v_inv, case when coalesce(r.sl->>'custId', '') ~ '^[0-9]{1,18}$' then (r.sl->>'custId')::bigint end,
              public._fw_num(r.sl->>'subtotalUsd'), least(greatest(public._fw_num(r.sl->>'disc'), 0), 100), public._fw_num(r.sl->>'totalUsd'),
              coalesce((select sum(public._fw_num(i->>'qty') * public._fw_num(i->>'cost_usd')) from jsonb_array_elements(v_items) i), 0),
              public._fw_num(r.sl->>'profitUsd'), public._fw_num(r.sl->>'paidUsd'), public._fw_num(r.sl->>'debtUsd'), v_items,
              r.sl->>'id', left(r.sl->>'payType', 20),
              case when coalesce(r.sl->>'boxId', '') ~ '^[0-9]{1,9}$' then (r.sl->>'boxId')::int end,
              case when jsonb_typeof(r.sl->'mixedRows') = 'array' then r.sl->'mixedRows' end,
              left(r.sl->>'custName', 200), public._fw_num(r.sl->>'discUsd'),
              case when coalesce(r.sl->>'date', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (r.sl->>'date')::date end,
              'done', left(r.sl->>'staffName', 200), coalesce(r.sl->>'isFilialTransfer', 'false') = 'true');
    end if;
  end loop;

  perform set_config('fw.debt_move', '', true);
  perform set_config('fw.stock_move', '', true);
end $$;

-- v23.10: 27 avvalroq (arxiv jadvalisiz) qo'llangan bazada — FIFO'dan chiqarilgan partiyalar ham arxivga yoziladi
insert into public.m27_stale_batches_archive (batch_id, filial, local_id, pid, qty, sold, cost_usd, original, archived_at)
select b.id, b.filial, b.local_id, b.pid, b.qty, b.sold, b.cost_usd, to_jsonb(b), coalesce(b.deleted_at, now())
  from public.batches b
 where exists (select 1 from public.stock_ledger l where l.batch_id = b.id and l.op_kind = 'archive')
on conflict (batch_id) do nothing;

-- Yangi yozuvlar uchun: sotilgan ≤ miqdor (eski qatorlar tekshirilmaydi — NOT VALID; buzilgan bo'lsa ogohlantirish)
do $$
declare v_bad int;
begin
  if not exists (select 1 from pg_constraint where conname = 'batches_qty_sold_chk' and conrelid = 'public.batches'::regclass) then
    alter table public.batches add constraint batches_qty_sold_chk
      check (qty >= 0 and sold >= 0 and sold <= qty + 0.000001 and status in ('active','empty','transit','deleted')) not valid;
  end if;
  select count(*) into v_bad from public.batches where not (qty >= 0 and sold >= 0 and sold <= qty + 0.000001 and status in ('active','empty','transit','deleted'));
  if v_bad > 0 then
    raise warning '27-migratsiya: % ta partiya qatori qty/sold/status qoidasiga mos emas (tekshiring)', v_bad;
  end if;
end $$;

-- ── 13. Ruxsatlar: faqat server ─────────────────────────────────────────
revoke all on function public._debt_balances_guard() from public, anon, authenticated;
revoke all on function public._batches_guard() from public, anon, authenticated;
revoke all on function public._fw_num(text) from public, anon, authenticated;
revoke all on function public._fw_rate() from public, anon, authenticated;
revoke all on function public._cust_debt_move(text, bigint, numeric, text, text, text, text, text, text, text, bigint, text) from public, anon, authenticated;
revoke all on function public._supp_debt_move(text, bigint, numeric, numeric, text, text, text, text, text, text, text, bigint, text) from public, anon, authenticated;
revoke all on function public._stock_move(bigint, numeric, numeric, text, text, text, text, text, text, bigint, text, text, numeric) from public, anon, authenticated;
revoke all on function public._batch_insert(text, text, bigint, numeric, numeric, text, jsonb, text, text, text, text, text, bigint, text) from public, anon, authenticated;
revoke all on function public._branch_debt_add(text, numeric) from public, anon, authenticated;
revoke all on function public._stock_fifo_out(text, bigint, numeric, text, text, text, text, text, text, bigint, text) from public, anon, authenticated;
revoke all on function public._fw_apply_side_debts(text, jsonb, numeric, text, text, text, text, bigint, text) from public, anon, authenticated;
revoke all on function public._fw_authority(text, bigint[], bigint[], bigint[]) from public, anon, authenticated;
revoke all on function public._fw_sale_json(public.sales) from public, anon, authenticated;
revoke all on function public._ledger_op_replay(text, text, text) from public, anon, authenticated;
revoke all on function public._ledger_op_finish(text, text, text, jsonb, bigint[], bigint[], bigint[], bigint, text) from public, anon, authenticated;
revoke all on function public.sale_checkout_atomic_v3(text, text, jsonb, jsonb, bigint, text) from public, anon, authenticated;
revoke all on function public.sale_checkout_atomic_v2(text, jsonb, numeric, numeric, bigint, jsonb, text) from public, anon, authenticated;
revoke all on function public.sale_return_atomic(text, text, text, bigint, numeric, text, jsonb, bigint, text) from public, anon, authenticated;
revoke all on function public.sale_void_atomic(text, text, text, jsonb, jsonb, bigint, text) from public, anon, authenticated;
revoke all on function public.sale_edit_atomic(text, text, text, text, jsonb, bigint, text) from public, anon, authenticated;
revoke all on function public.cash_payment_atomic(text, text, text, jsonb, text, jsonb, bigint, text) from public, anon, authenticated;
revoke all on function public.cash_payment_atomic_v2(text, text, text, jsonb, text, jsonb, bigint, text) from public, anon, authenticated;
revoke all on function public.stock_debt_op(text, text, text, jsonb, bigint, text) from public, anon, authenticated;
revoke all on function public.app_data_save_main(jsonb) from public, anon, authenticated;
grant execute on function public.sale_checkout_atomic_v3(text, text, jsonb, jsonb, bigint, text) to service_role;
grant execute on function public.sale_checkout_atomic_v2(text, jsonb, numeric, numeric, bigint, jsonb, text) to service_role;
grant execute on function public.sale_return_atomic(text, text, text, bigint, numeric, text, jsonb, bigint, text) to service_role;
grant execute on function public.sale_void_atomic(text, text, text, jsonb, jsonb, bigint, text) to service_role;
grant execute on function public.sale_edit_atomic(text, text, text, text, jsonb, bigint, text) to service_role;
grant execute on function public.cash_payment_atomic(text, text, text, jsonb, text, jsonb, bigint, text) to service_role;
grant execute on function public.cash_payment_atomic_v2(text, text, text, jsonb, text, jsonb, bigint, text) to service_role;
grant execute on function public.stock_debt_op(text, text, text, jsonb, bigint, text) to service_role;
grant execute on function public.app_data_save_main(jsonb) to service_role;
grant execute on function public._fw_authority(text, bigint[], bigint[], bigint[]) to service_role;

comment on table public.ledger_ops is 'F4b (27-migratsiya): murakkab ombor/qarz amallari — idempotent natija (takror so''rov ikkinchi marta yozilmaydi)';
comment on table public.stock_ledger is 'F4b: ombor qoldig''i jurnali (o''zgarmas). batches.qty/sold faqat shu orqali o''zgaradi';
comment on table public.customer_debt_ledger is 'F4b: mijoz qarzi jurnali (so''m, o''zgarmas). customer_balances.debt faqat shu orqali';
comment on table public.supplier_debt_ledger is 'F4b: ta''minotchi qarzi jurnali ($, o''zgarmas). supplier_balances.debt faqat shu orqali';
