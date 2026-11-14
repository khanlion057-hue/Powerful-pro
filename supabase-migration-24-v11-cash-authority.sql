-- ════════════════════════════════════════════════════════════════════
-- Migratsiya 24 (v11, 2026-10-02) — FILIAL KASSALARI: SERVER HAQIQIY MANBA
-- (F4) + FILIAL → FIRMA KASSA to'lovi atomik (B7).
-- 23-migratsiyadan KEYIN qo'llanadi (firma_kassa_* jadvallari kerak).
-- Takroriy ishga tushirish xavfsiz. Mavjud ma'lumot o'chirilmaydi.
--
-- MUAMMO (v10 auditi, F4): filial kassalarining qoldig'i (app_data JSON ichidagi
-- cashboxes[].bal) BRAUZERDA hisoblanib, serverga tayyor son sifatida yuborilardi.
-- Huquqi bor xodim (yoki brauzer konsoli) istalgan qoldiqni yozib qo'yishi mumkin edi.
--
-- YECHIM (Firma Kassa bilan bir xil yondashuv):
--  1) cashbox_balances — HAQIQIY qoldiq (filial, kassa) bo'yicha, valyutasi bilan.
--  2) cashbox_ledger — o'zgarmas jurnal: har bir pul harakati bitta yozuv,
--     balance_after bilan; (filial, op_key) UNIQUE — takroriy so'rov ikki marta yozilmaydi.
--  3) _cb_move() — yagona yozish yo'li: qator FOR UPDATE bilan qulflanadi, chiqim
--     qoldiqdan oshmaydi, valyuta mos kelishi shart.
--  4) cashbox_balances'ga ledger'siz yozish TRIGGER bilan taqiqlanadi (eski
--     funksiyalar yoki xato kod qoldiqni "jimgina" o'zgartira olmaydi).
--  5) cashbox_apply_ops() — bir amaldagi bir nechta harakat (masalan ko'chirish,
--     valyuta almashtirish) BITTA tranzaksiyada: hammasi yoki hech biri.
--  6) branch_firma_transfer() — filial kassasi ↔ Firma kassa VA filialning bazaga
--     qarzini kamaytirish BITTA tranzaksiyada (B7: yarim muvaffaqiyat yo'q).
--  7) sale_checkout_atomic_v2 — kassaga tushum ham ledger orqali; kassaga savdo
--     summasidan ortiq pul yozilmaydi.
--  8) Boshlang'ich qoldiqlar hozirgi JSON'dan BIR MARTA ko'chiriladi ('opening').
--
-- Kirish: faqat server (service_role). Brauzer (anon/authenticated) — yo'q.
-- ════════════════════════════════════════════════════════════════════

-- ── 1. cashbox_balances: valyuta ustuni ────────────────────────────────
alter table public.cashbox_balances add column if not exists currency text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cashbox_balances_currency_chk' and conrelid = 'public.cashbox_balances'::regclass) then
    alter table public.cashbox_balances add constraint cashbox_balances_currency_chk check (currency is null or currency in ('USD','UZS'));
  end if;
end $$;

-- ── 2. cashbox_ledger — o'zgarmas jurnal ───────────────────────────────
create table if not exists public.cashbox_ledger (
  id bigint generated always as identity primary key,
  created_at timestamp with time zone not null default now(),
  filial text not null,
  box_local_id integer not null,
  box_name text,
  currency text not null,
  direction text not null,
  amount numeric(20,2) not null,
  balance_after numeric(20,2) not null,
  op_kind text not null,
  op_key text not null,
  group_key text,
  ref_type text,
  ref_id text,
  note text,
  staff_id bigint,
  staff_name text,
  constraint cashbox_ledger_op_key_key unique (filial, op_key),
  constraint cashbox_ledger_currency_chk check (currency in ('USD','UZS')),
  constraint cashbox_ledger_direction_chk check (direction in ('in','out')),
  constraint cashbox_ledger_amount_chk check (amount > 0 or (op_kind = 'opening' and amount >= 0)),
  constraint cashbox_ledger_kind_chk check (op_kind in (
    'opening','sale','sale_fix','manual_in','manual_out','move','exchange','expense','expense_fix','salary',
    'cust_debt_pay','supp_pay','kirim_pay','dealer_pay','home_withdrawal','branch_to_firma','firma_to_branch','reset_zero')),
  constraint cashbox_ledger_text_len check (coalesce(length(note),0) <= 500 and coalesce(length(box_name),0) <= 200
    and coalesce(length(staff_name),0) <= 200 and length(op_key) <= 140 and coalesce(length(ref_id),0) <= 100)
);
create index if not exists idx_cb_ledger_box on public.cashbox_ledger (filial, box_local_id, id desc);
create index if not exists idx_cb_ledger_created on public.cashbox_ledger (filial, created_at desc);
create index if not exists idx_cb_ledger_group on public.cashbox_ledger (filial, group_key) where group_key is not null;

alter table public.cashbox_ledger enable row level security;
revoke all on public.cashbox_ledger from anon, authenticated;
grant select, insert on public.cashbox_ledger to service_role;
grant usage on sequence public.cashbox_ledger_id_seq to service_role;

-- ── 3. Qoldiqni faqat ledger orqali o'zgartirish (trigger) ─────────────
create or replace function public._cb_balances_guard()
 returns trigger
 language plpgsql
 set search_path = ''
as $$
begin
  if coalesce(current_setting('fw.cb_move', true), '') = '1' then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' and coalesce(new.balance, 0) = 0 then
    return new;                                   -- bo'sh (0) qator — xavfsiz
  end if;
  if tg_op = 'UPDATE' and new.balance is not distinct from old.balance
     and (old.currency is null or new.currency is not distinct from old.currency) then
    return new;                                   -- qoldiq o'zgarmagan
  end if;
  raise exception 'CASHBOX: kassa qoldig''i faqat kassa jurnali (cashbox_ledger) orqali o''zgaradi' using errcode = 'P0001';
end;
$$;
create or replace trigger cashbox_balances_guard
  before insert or update or delete on public.cashbox_balances
  for each row execute function public._cb_balances_guard();

-- ── 4. _cb_move — yagona yozish yo'li ──────────────────────────────────
create or replace function public._cb_move(
  p_filial text, p_box integer, p_currency text, p_direction text, p_amount numeric, p_kind text, p_op_key text,
  p_group_key text default null, p_box_name text default null, p_ref_type text default null, p_ref_id text default null,
  p_note text default null, p_staff_id bigint default null, p_staff_name text default null)
 returns public.cashbox_ledger
 language plpgsql
 set search_path = ''
as $$
declare
  v_amt numeric;
  v_bal numeric;
  v_cur text;
  v_row public.cashbox_ledger;
begin
  if coalesce(p_filial, '') = '' or p_box is null or coalesce(p_op_key, '') = '' then
    raise exception 'CASHBOX: filial, kassa va amal kaliti majburiy' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount = 'NaN'::numeric or p_amount <= 0 or p_amount > 1000000000000 then
    raise exception 'CASHBOX: summa musbat bo''lishi kerak' using errcode = 'P0001';
  end if;
  v_amt := round(p_amount, 2);
  if v_amt <= 0 then
    raise exception 'CASHBOX: summa juda kichik' using errcode = 'P0001';
  end if;

  -- Idempotency: shu kalit bilan amal allaqachon yozilgan bo'lsa — o'sha natija.
  -- Kalit boshqa mazmun bilan qayta ishlatilsa — rad etiladi (kalitni "o'g'irlab" bo'lmaydi).
  select * into v_row from public.cashbox_ledger where filial = p_filial and op_key = p_op_key;
  if found then
    if v_row.box_local_id <> p_box or v_row.direction <> p_direction or v_row.amount <> v_amt then
      raise exception 'CASHBOX: amal kaliti boshqa amal uchun ishlatilgan' using errcode = 'P0001';
    end if;
    return v_row;
  end if;

  if p_currency is null or p_currency not in ('USD','UZS') then
    raise exception 'CASHBOX: valyuta faqat USD yoki UZS bo''lishi mumkin' using errcode = 'P0001';
  end if;
  if p_direction is null or p_direction not in ('in','out') then
    raise exception 'CASHBOX: yo''nalish noto''g''ri' using errcode = 'P0001';
  end if;

  select balance, currency into v_bal, v_cur from public.cashbox_balances
    where filial = p_filial and box_local_id = p_box for update;
  if not found then
    insert into public.cashbox_balances (filial, box_local_id, balance, currency) values (p_filial, p_box, 0, p_currency)
      on conflict (filial, box_local_id) do nothing;
    select balance, currency into v_bal, v_cur from public.cashbox_balances
      where filial = p_filial and box_local_id = p_box for update;
  end if;
  if v_cur is not null and v_cur <> p_currency then
    raise exception 'CASHBOX: kassa valyutasi % (so''rovda %)', v_cur, p_currency using errcode = 'P0001';
  end if;
  v_bal := coalesce(v_bal, 0);

  if p_direction = 'out' then
    if v_bal < v_amt then
      raise exception 'CASHBOX: kassada mablag'' yetarli emas (qoldiq %, so''ralgan %)', v_bal, v_amt using errcode = 'P0001';
    end if;
    v_bal := v_bal - v_amt;
  else
    v_bal := v_bal + v_amt;
  end if;

  perform set_config('fw.cb_move', '1', true);
  update public.cashbox_balances set balance = v_bal, currency = p_currency, updated_at = now()
    where filial = p_filial and box_local_id = p_box;
  perform set_config('fw.cb_move', '', true);

  insert into public.cashbox_ledger
    (filial, box_local_id, box_name, currency, direction, amount, balance_after, op_kind, op_key, group_key,
     ref_type, ref_id, note, staff_id, staff_name)
  values
    (p_filial, p_box, left(p_box_name, 200), p_currency, p_direction, v_amt, v_bal, p_kind, p_op_key, p_group_key,
     left(p_ref_type, 40), left(p_ref_id, 100), left(p_note, 500), p_staff_id, left(p_staff_name, 200))
  returning * into v_row;
  return v_row;
exception when unique_violation then
  perform set_config('fw.cb_move', '', true);
  select * into v_row from public.cashbox_ledger where filial = p_filial and op_key = p_op_key;
  if found then return v_row; end if;
  raise;
end;
$$;

-- Bir filialning berilgan kassalari bo'yicha qoldiqlar xaritasi {"1": 100.00, ...}
create or replace function public._cb_balances_map(p_filial text, p_boxes integer[] default null)
 returns jsonb
 language sql
 stable
 set search_path = ''
as $$
  select coalesce(jsonb_object_agg(box_local_id::text, balance), '{}'::jsonb)
  from public.cashbox_balances
  where filial = p_filial and (p_boxes is null or box_local_id = any(p_boxes));
$$;

-- ── 5. cashbox_apply_ops — bir amal = bitta tranzaksiya ────────────────
-- p_ops: [{"box":1,"currency":"UZS","dir":"out","amount":100,"box_name":"Naqd","note":"..","ref_type":"..","ref_id":".."}, ...]
create or replace function public.cashbox_apply_ops(
  p_filial text, p_group_key text, p_kind text, p_ops jsonb, p_staff_id bigint default null, p_staff_name text default null)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  v_n int;
  v_op jsonb;
  v_idx int;
  v_boxes integer[];
  v_row public.cashbox_ledger;
  v_entries jsonb := '[]'::jsonb;
  v_existing int;
  v_pass text;
begin
  if coalesce(p_filial, '') = '' or coalesce(p_group_key, '') = '' or length(p_group_key) > 100 then
    raise exception 'CASHBOX: filial va amal kaliti majburiy' using errcode = 'P0001';
  end if;
  if p_ops is null or jsonb_typeof(p_ops) <> 'array' then
    raise exception 'CASHBOX: amallar ro''yxati noto''g''ri' using errcode = 'P0001';
  end if;
  v_n := jsonb_array_length(p_ops);
  if v_n < 1 or v_n > 20 then
    raise exception 'CASHBOX: bir so''rovda 1–20 ta harakat bo''lishi mumkin' using errcode = 'P0001';
  end if;

  if exists (select 1 from jsonb_array_elements(p_ops) e
             where jsonb_typeof(e) <> 'object' or coalesce(e->>'dir', '') not in ('in','out')
                or coalesce(e->>'box', '') !~ '^[0-9]{1,9}$') then
    raise exception 'CASHBOX: harakat maydonlari noto''g''ri (kassa/yo''nalish)' using errcode = 'P0001';
  end if;

  -- Bir xil kalit bilan parallel so'rovlar navbatga qo'yiladi
  perform pg_advisory_xact_lock(hashtext('cb_grp:' || p_filial || ':' || p_group_key));

  select array_agg(distinct (e->>'box')::int order by (e->>'box')::int) into v_boxes from jsonb_array_elements(p_ops) e;
  select count(*) into v_existing from public.cashbox_ledger where filial = p_filial and group_key = p_group_key;
  if v_existing > 0 then
    -- Takroriy so'rov: mazmuni AYNAN bir xil bo'lishi shart (kalitni boshqa amal uchun ishlatib bo'lmaydi)
    v_idx := 0;
    for v_op in select * from jsonb_array_elements(p_ops) loop
      v_idx := v_idx + 1;
      select * into v_row from public.cashbox_ledger where filial = p_filial and op_key = p_group_key || ':' || v_idx;
      if not found or v_row.box_local_id <> (v_op->>'box')::int or v_row.direction <> (v_op->>'dir')
         or v_row.amount <> round((v_op->>'amount')::numeric, 2) then
        raise exception 'CASHBOX: amal kaliti boshqa amal uchun ishlatilgan' using errcode = 'P0001';
      end if;
    end loop;
    if v_existing <> v_n then
      raise exception 'CASHBOX: amal kaliti boshqa amal uchun ishlatilgan' using errcode = 'P0001';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'box', box_local_id, 'dir', direction, 'amount', amount,
             'balanceAfter', balance_after) order by id), '[]'::jsonb) into v_entries
      from public.cashbox_ledger where filial = p_filial and group_key = p_group_key;
    return jsonb_build_object('ok', true, 'replay', true, 'balances', public._cb_balances_map(p_filial, v_boxes), 'entries', v_entries);
  end if;

  -- Kassa qatorlari tartib bilan qulflanadi (deadlock bo'lmasligi uchun)
  perform 1 from public.cashbox_balances where filial = p_filial and box_local_id = any(v_boxes)
    order by box_local_id for update;

  -- Avval kirimlar, keyin chiqimlar (bir kassada tuzatish amali oraliqda manfiyga tushmasin)
  foreach v_pass in array array['in','out'] loop
    v_idx := 0;
    for v_op in select * from jsonb_array_elements(p_ops) loop
      v_idx := v_idx + 1;
      continue when v_op->>'dir' <> v_pass;
      v_row := public._cb_move(p_filial, (v_op->>'box')::int, v_op->>'currency', v_op->>'dir',
        (v_op->>'amount')::numeric, p_kind, p_group_key || ':' || v_idx, p_group_key, v_op->>'box_name',
        v_op->>'ref_type', v_op->>'ref_id', v_op->>'note', p_staff_id, p_staff_name);
      v_entries := v_entries || jsonb_build_object('id', v_row.id, 'box', v_row.box_local_id, 'dir', v_row.direction,
        'amount', v_row.amount, 'balanceAfter', v_row.balance_after);
    end loop;
  end loop;

  return jsonb_build_object('ok', true, 'replay', false, 'balances', public._cb_balances_map(p_filial, v_boxes), 'entries', v_entries);
end;
$$;

-- ── 6. branch_firma_transfer — filial kassasi ↔ Firma kassa (+ filial qarzi) ──
-- p_direction: 'to_firma' (filialdan Firma kassaga) | 'from_firma' (Firma kassadan filialga)
-- p_reduce_debt: true — to'lov filialning bazaga qarzini (app_data.branchDebt, USD) kamaytiradi.
-- UZS kassadan to'langanda qarz SERVERDAGI kurs (settings.usdUzs) bo'yicha USD'ga o'giriladi.
create or replace function public.branch_firma_transfer(
  p_filial text, p_box integer, p_currency text, p_direction text, p_amount numeric, p_key text,
  p_reduce_debt boolean default false, p_box_name text default null, p_note text default null,
  p_staff_id bigint default null, p_staff_name text default null)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  v_key text;
  v_cb public.cashbox_ledger;
  v_fk public.firma_kassa_ledger;
  v_amt numeric;
  v_rate numeric;
  v_usd numeric := null;
  v_data jsonb;
  v_debt_before numeric := null;
  v_debt_after numeric := null;
  v_note text;
begin
  if coalesce(p_key, '') = '' or length(p_key) > 100 then
    raise exception 'CASHBOX: amal kaliti majburiy' using errcode = 'P0001';
  end if;
  if p_direction is null or p_direction not in ('to_firma','from_firma') then
    raise exception 'CASHBOX: yo''nalish noto''g''ri' using errcode = 'P0001';
  end if;
  if coalesce(p_reduce_debt, false) and p_direction <> 'to_firma' then
    raise exception 'CASHBOX: qarz faqat filialdan to''lov bilan kamayadi' using errcode = 'P0001';
  end if;
  if coalesce(p_filial, '') = '' or (p_filial = 'baza' and coalesce(p_reduce_debt, false)) then
    raise exception 'CASHBOX: bu amal faqat filial uchun' using errcode = 'P0001';
  end if;
  v_key := 'bft:' || p_key;
  perform pg_advisory_xact_lock(hashtext('cb_bft:' || p_filial || ':' || v_key));

  -- Takroriy so'rov: ikkala tomon ham yozilgan — birinchi natija qaytadi (qarz ikkinchi marta kamaymaydi)
  select * into v_cb from public.cashbox_ledger where filial = p_filial and op_key = v_key;
  if found then
    select * into v_fk from public.firma_kassa_ledger where idem_key = v_key;
    if v_cb.box_local_id <> p_box or v_cb.amount <> round(p_amount, 2)
       or v_cb.op_kind <> (case when p_direction = 'to_firma' then 'branch_to_firma' else 'firma_to_branch' end) then
      raise exception 'CASHBOX: amal kaliti boshqa amal uchun ishlatilgan' using errcode = 'P0001';
    end if;
    select data into v_data from public.app_data where id = 'main';
    return jsonb_build_object('ok', true, 'replay', true, 'filial', p_filial, 'box', v_cb.box_local_id, 'currency', v_cb.currency,
      'amount', v_cb.amount, 'branchBalance', (select balance from public.cashbox_balances where filial = p_filial and box_local_id = p_box),
      'firmaBalance', (select balance from public.firma_kassa_balance where currency = v_cb.currency),
      'debtAfter', (v_data->'branchDebt'->>p_filial)::numeric, 'branchEntryId', v_cb.id, 'firmaEntryId', v_fk.id);
  end if;

  if p_amount is null or p_amount = 'NaN'::numeric or p_amount <= 0 or p_amount > 1000000000000 then
    raise exception 'CASHBOX: summa musbat bo''lishi kerak' using errcode = 'P0001';
  end if;
  v_amt := round(p_amount, 2);

  -- Qulflash tartibi DOIM bir xil (deadlock bo'lmasligi uchun): filial qarzi → filial kassasi → Firma kassa
  if coalesce(p_reduce_debt, false) then
    perform 1 from public.app_data where id = 'main' for update;
  end if;
  perform 1 from public.cashbox_balances where filial = p_filial and box_local_id = p_box for update;
  perform 1 from public.firma_kassa_balance where currency = p_currency for update;

  if coalesce(p_reduce_debt, false) then
    select data into v_data from public.app_data where id = 'main' for update;
    if v_data is null then
      raise exception 'CASHBOX: asosiy ma''lumot topilmadi' using errcode = 'P0001';
    end if;
    v_debt_before := round(coalesce(nullif(v_data->'branchDebt'->>p_filial, '')::numeric, 0), 2);
    if p_currency = 'USD' then
      v_usd := v_amt;
    else
      v_rate := nullif(nullif(v_data->'settings'->>'usdUzs', '')::numeric, 0);
      if v_rate is null or v_rate <= 0 then
        raise exception 'CASHBOX: USD/UZS kursi sozlanmagan' using errcode = 'P0001';
      end if;
      v_usd := round(v_amt / v_rate, 2);
    end if;
    if v_debt_before <= 0 then
      raise exception 'CASHBOX: filialning bazaga qarzi yo''q' using errcode = 'P0001';
    end if;
    if v_usd > v_debt_before + 0.01 then
      raise exception 'CASHBOX: to''lov (% $) qarzdan (% $) oshib ketdi', v_usd, v_debt_before using errcode = 'P0001';
    end if;
    v_debt_after := greatest(round(v_debt_before - v_usd, 2), 0);
    v_note := left(coalesce(p_note || ' · ', '') || 'Filial qarzi: ' || v_debt_before || ' → ' || v_debt_after || ' $'
              || case when v_rate is not null then ' (kurs ' || v_rate || ')' else '' end, 500);
  else
    v_note := p_note;
  end if;

  if p_direction = 'to_firma' then
    v_cb := public._cb_move(p_filial, p_box, p_currency, 'out', v_amt, 'branch_to_firma', v_key, v_key, p_box_name,
                            case when p_reduce_debt then 'branch_debt' else 'firma_kassa' end, p_filial, v_note, p_staff_id, p_staff_name);
    v_fk := public._fk_cash_move(p_currency, 'in', v_amt, 'branch_in', 'branch', p_filial, p_filial, p_filial,
                                 case when p_reduce_debt then 'branch_debt' else 'cashbox' end, p_box::text, v_note, p_staff_id, p_staff_name, v_key);
  else
    v_fk := public._fk_cash_move(p_currency, 'out', v_amt, 'branch_out', 'branch', p_filial, p_filial, p_filial,
                                 'cashbox', p_box::text, v_note, p_staff_id, p_staff_name, v_key);
    v_cb := public._cb_move(p_filial, p_box, p_currency, 'in', v_amt, 'firma_to_branch', v_key, v_key, p_box_name,
                            'firma_kassa', p_filial, v_note, p_staff_id, p_staff_name);
  end if;

  if coalesce(p_reduce_debt, false) then
    update public.app_data
       set data = jsonb_set(data, '{branchDebt}', coalesce(data->'branchDebt', '{}'::jsonb) || jsonb_build_object(p_filial, v_debt_after)),
           updated_at = now()
     where id = 'main';
  end if;

  return jsonb_build_object('ok', true, 'replay', false, 'filial', p_filial, 'box', p_box, 'currency', p_currency, 'amount', v_amt,
    'amountUsd', v_usd, 'rate', v_rate, 'debtBefore', v_debt_before, 'debtAfter', v_debt_after,
    'branchBalance', v_cb.balance_after, 'firmaBalance', v_fk.balance_after, 'branchEntryId', v_cb.id, 'firmaEntryId', v_fk.id);
end;
$$;

-- ── 7. Savdo: kassaga tushum ledger orqali ─────────────────────────────
CREATE OR REPLACE FUNCTION public.sale_checkout_atomic_v2(p_filial text, p_items jsonb, p_disc_pct numeric, p_paid_usd numeric, p_cust_id bigint, p_box_payments jsonb, p_inv text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_item jsonb;
  v_bp jsonb;
  v_pid bigint;
  v_qty numeric;
  v_remaining numeric;
  v_batch record;
  v_take numeric;
  v_subtotal numeric := 0;
  v_total numeric;
  v_cost numeric := 0;
  v_profit numeric;
  v_debt numeric;
  v_change numeric;
  v_sale_id bigint;
  v_box int;
  v_amt numeric;
  v_cur text;
  v_rate numeric;
  v_box_usd numeric := 0;
  v_idx int := 0;
  v_boxes integer[] := '{}';
begin
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_subtotal := v_subtotal + (v_item->>'qty')::numeric * (v_item->>'sell_usd')::numeric;
  end loop;
  v_total := v_subtotal * (1 - coalesce(p_disc_pct,0)/100);

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_pid := (v_item->>'pid')::bigint;
    v_qty := (v_item->>'qty')::numeric;

    if coalesce((v_item->>'direct_supply')::boolean, false) then
      v_cost := v_cost + v_qty * (v_item->>'cost_usd')::numeric;
      if v_item->>'supp_id' is not null then
        insert into public.supplier_balances (filial, supplier_local_id, debt)
          values (p_filial, (v_item->>'supp_id')::bigint, v_qty * (v_item->>'cost_usd')::numeric)
          on conflict (filial, supplier_local_id) do update
            set debt = public.supplier_balances.debt + excluded.debt, updated_at = now();
      end if;
    else
      v_remaining := v_qty;
      for v_batch in
        select id, qty, sold, cost_usd from public.batches
        where filial = p_filial and pid = v_pid and status = 'active' and qty > sold
        order by batch_date asc nulls last, id asc
        for update
      loop
        exit when v_remaining <= 0;
        v_take := least(v_batch.qty - v_batch.sold, v_remaining);
        update public.batches set sold = sold + v_take,
               status = case when qty <= sold + v_take then 'empty' else status end,
               updated_at = now()
          where id = v_batch.id;
        v_cost := v_cost + v_take * v_batch.cost_usd;
        v_remaining := v_remaining - v_take;
      end loop;
      if v_remaining > 0 then
        raise exception 'Omborda yetarli qoldiq yo''q: pid=%, yetishmayotgan miqdor=%', v_pid, v_remaining;
      end if;
    end if;
  end loop;

  v_profit := v_total - v_cost;
  v_debt := greatest(0, v_total - p_paid_usd);
  v_change := greatest(0, p_paid_usd - v_total);

  insert into public.sales (filial, inv, cust_id, subtotal_usd, disc_pct, total_usd, cost_usd, profit_usd, paid_usd, debt_usd, items)
    values (p_filial, p_inv, p_cust_id, v_subtotal, coalesce(p_disc_pct,0), v_total, v_cost, v_profit, least(p_paid_usd, v_total), v_debt, p_items)
    returning id into v_sale_id;

  if p_cust_id is not null and v_debt > 0 then
    insert into public.customer_balances (filial, customer_local_id, debt)
      values (p_filial, p_cust_id, v_debt)
      on conflict (filial, customer_local_id) do update
        set debt = public.customer_balances.debt + excluded.debt, updated_at = now();
  end if;

  -- MIXED-PAYMENT: har bir kassaga tushum — shu tranzaksiya ichida, kassa jurnali orqali (v11).
  -- Kassaga jami tushum savdo summasidan (yaxlitlash uchun 2% / 1$ chegarasi bilan) oshmaydi.
  if p_box_payments is not null and jsonb_typeof(p_box_payments) = 'array' then
    for v_bp in select * from jsonb_array_elements(p_box_payments) loop
      v_idx := v_idx + 1;
      v_box := (v_bp->>'box_id')::int;
      v_amt := (v_bp->>'amount_native')::numeric;
      continue when v_amt is null or v_amt <= 0;
      select currency into v_cur from public.cashbox_balances where filial = p_filial and box_local_id = v_box;
      v_cur := coalesce(v_cur, v_bp->>'currency');
      if v_cur is null then
        raise exception 'CASHBOX: kassa valyutasi noma''lum (kassa %)', v_box using errcode = 'P0001';
      end if;
      if v_cur = 'USD' then
        v_box_usd := v_box_usd + v_amt;
      else
        if v_rate is null then
          select nullif(nullif(data->'settings'->>'usdUzs', '')::numeric, 0) into v_rate from public.app_data where id = 'main';
          if v_rate is null then
            raise exception 'CASHBOX: USD/UZS kursi sozlanmagan' using errcode = 'P0001';
          end if;
        end if;
        v_box_usd := v_box_usd + v_amt / v_rate;
      end if;
      -- Kalit savdo ID'siga bog'langan (chek raqami qurilmalar orasida takrorlanishi mumkin)
      perform public._cb_move(p_filial, v_box, v_cur, 'in', v_amt, 'sale', 'sale:' || v_sale_id || ':' || v_idx, 'sale:' || v_sale_id,
                              v_bp->>'box_name', 'sale', p_inv, 'Savdo ' || p_inv, null, null);
      v_boxes := v_boxes || v_box;
    end loop;
    if v_box_usd > v_total + greatest(1, v_total * 0.02) then
      raise exception 'CASHBOX: kassaga tushum (% $) savdo summasidan (% $) oshib ketdi — qaytimni ayiring', round(v_box_usd, 2), round(v_total, 2) using errcode = 'P0001';
    end if;
  end if;

  return jsonb_build_object(
    'ok', true, 'saleId', v_sale_id, 'inv', p_inv,
    'subtotalUsd', v_subtotal, 'totalUsd', v_total, 'costUsd', v_cost,
    'profitUsd', v_profit, 'debtUsd', v_debt, 'changeUsd', v_change,
    'balances', public._cb_balances_map(p_filial, v_boxes)
  );
end;
$function$
;

-- ── 8. Boshlang'ich qoldiqlar — hozirgi JSON'dan BIR MARTA ───────────
-- Manba: app_data_branches.data.cashboxes (ilova shu yerdan yuklaydi), yo'q bo'lsa
-- app_data.data.branchStore[filial].cashboxes. Kassada hali jurnal yozuvi bo'lmasa —
-- qoldiq JSON'dagi qiymatga tenglashtiriladi va 'opening' yozuvi qoldiriladi.
-- Qayta ishga tushirilsa: jurnalida yozuvi bor kassaga TEGILMAYDI.
do $$
declare
  r record;
  v_cur text;
  v_bal numeric;
begin
  perform set_config('fw.cb_move', '1', true);
  for r in
    with src as (
      select b.branch_key as filial, b.data->'cashboxes' as boxes from public.app_data_branches b
       where jsonb_typeof(b.data->'cashboxes') = 'array'
      union all
      select s.key, s.value->'cashboxes' from public.app_data a, jsonb_each(coalesce(a.data->'branchStore', '{}'::jsonb)) s
       where a.id = 'main' and jsonb_typeof(s.value->'cashboxes') = 'array'
         and not exists (select 1 from public.app_data_branches b2 where b2.branch_key = s.key and jsonb_typeof(b2.data->'cashboxes') = 'array')
    )
    select src.filial, (bx->>'id')::int as box, bx->>'name' as box_name, bx->>'cur' as cur,
           coalesce(nullif(bx->>'bal', '')::numeric, 0) as bal
      from src, jsonb_array_elements(src.boxes) bx
     where jsonb_typeof(bx) = 'object' and (bx->>'id') ~ '^[0-9]{1,9}$'
  loop
    continue when exists (select 1 from public.cashbox_ledger l where l.filial = r.filial and l.box_local_id = r.box);
    v_cur := case when r.cur in ('USD','UZS') then r.cur else 'UZS' end;
    v_bal := round(r.bal, 2);
    insert into public.cashbox_balances (filial, box_local_id, balance, currency, updated_at)
      values (r.filial, r.box, v_bal, v_cur, now())
      on conflict (filial, box_local_id) do update set balance = excluded.balance, currency = excluded.currency, updated_at = now();
    insert into public.cashbox_ledger (filial, box_local_id, box_name, currency, direction, amount, balance_after, op_kind, op_key, note)
      values (r.filial, r.box, left(r.box_name, 200), v_cur, case when v_bal < 0 then 'out' else 'in' end, abs(v_bal), v_bal,
              'opening', 'opening:' || r.box, 'Boshlang''ich qoldiq (24-migratsiya, ilovadagi qiymat)')
      on conflict (filial, op_key) do nothing;
  end loop;
  perform set_config('fw.cb_move', '', true);
end $$;

-- ── 9. Ruxsatlar: faqat server ─────────────────────────────────────────
revoke all on function public._cb_balances_guard() from public, anon, authenticated;
revoke all on function public._cb_move(text, integer, text, text, numeric, text, text, text, text, text, text, text, bigint, text) from public, anon, authenticated;
revoke all on function public._cb_balances_map(text, integer[]) from public, anon, authenticated;
revoke all on function public.cashbox_apply_ops(text, text, text, jsonb, bigint, text) from public, anon, authenticated;
revoke all on function public.branch_firma_transfer(text, integer, text, text, numeric, text, boolean, text, text, bigint, text) from public, anon, authenticated;
revoke all on function public.sale_checkout_atomic_v2(text, jsonb, numeric, numeric, bigint, jsonb, text) from public, anon, authenticated;
grant execute on function public._cb_move(text, integer, text, text, numeric, text, text, text, text, text, text, text, bigint, text) to service_role;
grant execute on function public._cb_balances_map(text, integer[]) to service_role;
grant execute on function public.cashbox_apply_ops(text, text, text, jsonb, bigint, text) to service_role;
grant execute on function public.branch_firma_transfer(text, integer, text, text, numeric, text, boolean, text, text, bigint, text) to service_role;
grant execute on function public.sale_checkout_atomic_v2(text, jsonb, numeric, numeric, bigint, jsonb, text) to service_role;
