-- ════════════════════════════════════════════════════════════════════
-- Migratsiya 25 (v23, 2026-10-02) — FIRMA KASSA kengaytmasi, FILIAL QARZI (Bazadan),
-- TO'LOV + KASSA atomik, xavfsizlik (RLS/GRANT) mustahkamlash.
-- 23 va 24-migratsiyalardan KEYIN qo'llanadi. Takroriy ishga tushirish xavfsiz.
-- Ma'lumot o'chirilmaydi: faqat qo'shiladi (ustun, funksiya, trigger, indeks)
-- va ortiqcha ruxsatlar olib tashlanadi.
--
-- 1) firma_kassa_ledger: source_type / source_ref / reversal_of / reversed_by —
--    har bir yozuv manbasi aniq; bekor qilish faqat TESKARI yozuv bilan (o'chirish
--    va tahrirlash trigger bilan taqiqlanadi). Yangi amallar: 'opening' (boshlang'ich
--    qoldiq), 'reversal_in/out'.
-- 2) firma_kassa_reverse() — yozuvni teskari yozuv bilan bekor qilish (idempotent).
-- 3) branch_firma_loan() — filial Bazadan (Firma kassadan) qarz oladi / qaytaradi:
--    Firma kassa + filial kassasi + qarz qoldig'i BITTA tranzaksiyada.
-- 4) firma_kassa_branch_summary() — har bir filialning Bazaga qarzlari (tovar va pul).
-- 5) cash_payment_atomic() — mijoz/ta'minotchi/diller to'lovi va kunlik "uyga berish":
--    kassa harakati + to'lov yozuvi (+ diller qarzi) BITTA tranzaksiyada.
-- 6) cashbox_ledger: filial qarzi turlari; jurnal o'zgarmas (trigger).
-- 7) Xavfsizlik: brauzer ishlatmaydigan jadval/funksiyalardan anon/authenticated
--    ruxsatlari olinadi (hozir RLS to'sib turibdi — bu ikkinchi himoya qatlami).
-- 8) Hamkorlar SQL jadvallari — ilova ishlatmaydi (haqiqiy manba: app_data.partners);
--    izoh bilan belgilanadi, o'chirilmaydi.
-- ════════════════════════════════════════════════════════════════════

-- ── 1. firma_kassa_ledger: manba va bekor qilish ma'lumoti ─────────────
alter table public.firma_kassa_ledger add column if not exists source_type text;
alter table public.firma_kassa_ledger add column if not exists source_ref text;
alter table public.firma_kassa_ledger add column if not exists reversal_of bigint;
alter table public.firma_kassa_ledger add column if not exists reversed_by bigint;
alter table public.firma_kassa_ledger add column if not exists reversed_at timestamp with time zone;

-- Amal turlari: + boshlang'ich qoldiq, + teskari yozuv
alter table public.firma_kassa_ledger drop constraint if exists firma_kassa_ledger_op_chk;
alter table public.firma_kassa_ledger add constraint firma_kassa_ledger_op_chk check (
  (direction = 'in'  and op_type in ('deposit','branch_in','advance_repay','adjust_in','opening','reversal_in')) or
  (direction = 'out' and op_type in ('withdraw','branch_out','advance_give','kirim_payment','partner_withdrawal','adjust_out','reversal_out'))
);

create or replace function public._fk_source_type(p_op_type text, p_cp_type text, p_ref_type text)
 returns text
 language sql
 immutable
 set search_path = ''
as $$
  select case
    when p_op_type = 'opening' then 'opening_balance'
    when p_op_type in ('adjust_in','adjust_out') then 'manual_adjustment'
    when p_op_type = 'deposit' then 'deposit'
    when p_op_type = 'withdraw' then 'withdraw'
    when p_op_type = 'branch_in' and p_ref_type = 'branch_debt' then 'branch_debt_payment'
    when p_op_type = 'branch_in' then 'branch_transfer_in'
    when p_op_type = 'branch_out' then 'branch_transfer_out'
    when p_op_type = 'advance_give' and p_cp_type = 'branch' then 'branch_loan'
    when p_op_type = 'advance_give' then 'advance_given'
    when p_op_type = 'advance_repay' then 'advance_repayment'
    when p_op_type = 'kirim_payment' and p_ref_type = 'kirim_shortfall' then 'kirim_shortfall'
    when p_op_type = 'kirim_payment' then 'kirim_payment'
    when p_op_type = 'partner_withdrawal' then 'partner_withdrawal'
    when p_op_type in ('reversal_in','reversal_out') then 'reversal'
  end;
$$;

-- Mavjud yozuvlar (agar 23-migratsiyadan keyin ishlatilgan bo'lsa) — bir marta to'ldiriladi
update public.firma_kassa_ledger
   set source_type = public._fk_source_type(op_type, counterparty_type, ref_type),
       source_ref  = coalesce(source_ref, nullif(concat_ws(':', ref_type, ref_id), ''))
 where source_type is null;

alter table public.firma_kassa_ledger drop constraint if exists firma_kassa_ledger_source_chk;
alter table public.firma_kassa_ledger add constraint firma_kassa_ledger_source_chk check (source_type is not null and source_type in (
  'opening_balance','manual_adjustment','deposit','withdraw','branch_debt_payment','branch_transfer_in','branch_transfer_out',
  'branch_loan','advance_given','advance_repayment','kirim_payment','kirim_shortfall','partner_withdrawal','reversal'));
create index if not exists idx_fk_ledger_source on public.firma_kassa_ledger (source_type, source_ref);

-- Yangi yozuv: manba avtomatik; teskari yozuv bo'lsa — qaysi yozuvni bekor qilgani
create or replace function public._fk_ledger_defaults()
 returns trigger
 language plpgsql
 set search_path = ''
as $$
begin
  new.source_type := coalesce(new.source_type, public._fk_source_type(new.op_type, new.counterparty_type, new.ref_type));
  new.source_ref  := coalesce(new.source_ref, nullif(concat_ws(':', new.ref_type, new.ref_id), ''));
  if new.op_type in ('reversal_in','reversal_out') and new.ref_type = 'reversal' and new.ref_id ~ '^[0-9]{1,18}$' then
    new.reversal_of := new.ref_id::bigint;
  end if;
  new.reversed_by := null; new.reversed_at := null;
  return new;
end;
$$;
create or replace trigger firma_kassa_ledger_defaults
  before insert on public.firma_kassa_ledger
  for each row execute function public._fk_ledger_defaults();

-- O'zgarmas jurnal: o'chirish yo'q; tahrirlash — faqat "bekor qilindi" belgisini bir marta qo'yish
create or replace function public._ledger_immutable()
 returns trigger
 language plpgsql
 set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'LEDGER: jurnal yozuvini o''chirib bo''lmaydi (teskari yozuv qiling)' using errcode = 'P0001';
  end if;
  if tg_table_name = 'firma_kassa_ledger' then
    if (to_jsonb(old)->>'reversed_by') is null and (to_jsonb(new)->>'reversed_by') is not null
       and (to_jsonb(new) - 'reversed_by' - 'reversed_at') = (to_jsonb(old) - 'reversed_by' - 'reversed_at') then
      return new;
    end if;
  end if;
  raise exception 'LEDGER: jurnal yozuvini o''zgartirib bo''lmaydi' using errcode = 'P0001';
end;
$$;
create or replace trigger firma_kassa_ledger_immutable
  before update or delete on public.firma_kassa_ledger
  for each row execute function public._ledger_immutable();
create or replace trigger cashbox_ledger_immutable
  before update or delete on public.cashbox_ledger
  for each row execute function public._ledger_immutable();

grant update (reversed_by, reversed_at) on public.firma_kassa_ledger to service_role;

-- Qolgan avans va qoldiq hisobida bekor qilingan yozuvlar hisobga olinmaydi
create or replace function public.firma_kassa_advance_outstanding(p_currency text, p_counterparty_type text, p_counterparty_id text)
 returns numeric
 language sql
 stable
 set search_path = ''
as $$
  select coalesce(sum(case when op_type = 'advance_give' then amount else -amount end), 0)
  from public.firma_kassa_ledger
  where currency = p_currency and counterparty_type = p_counterparty_type and counterparty_id = p_counterparty_id
    and op_type in ('advance_give','advance_repay') and reversed_by is null;
$$;

create or replace function public.firma_kassa_get_balance()
 returns jsonb
 language sql
 stable
 set search_path = ''
as $$
  select jsonb_build_object(
    'balances', coalesce((select jsonb_object_agg(currency, balance) from public.firma_kassa_balance), '{}'::jsonb),
    'advances', coalesce((
      select jsonb_agg(a order by a->>'counterparty_name') from (
        select jsonb_build_object('currency', currency, 'counterparty_type', counterparty_type, 'counterparty_id', counterparty_id,
                                  'counterparty_name', max(counterparty_name),
                                  'outstanding', sum(case when op_type = 'advance_give' then amount else -amount end)) a
        from public.firma_kassa_ledger
        where op_type in ('advance_give','advance_repay') and reversed_by is null
        group by currency, counterparty_type, counterparty_id
        having sum(case when op_type = 'advance_give' then amount else -amount end) > 0
      ) t), '[]'::jsonb)
  );
$$;

-- ── 2. Yozuvni bekor qilish (teskari yozuv) ───────────────────────────
create or replace function public.firma_kassa_reverse(
  p_entry_id bigint, p_idem_key text, p_note text default null, p_staff_id bigint default null, p_staff_name text default null)
 returns public.firma_kassa_ledger
 language plpgsql
 set search_path = ''
as $$
declare
  v_orig public.firma_kassa_ledger;
  v_rev public.firma_kassa_ledger;
  v_key text;
begin
  if coalesce(p_idem_key, '') = '' or length(p_idem_key) > 100 then
    raise exception 'FIRMA_KASSA: amal kaliti majburiy' using errcode = 'P0001';
  end if;
  v_key := 'rev:' || p_idem_key;
  select * into v_rev from public.firma_kassa_ledger where idem_key = v_key;
  if found then
    if v_rev.reversal_of is distinct from p_entry_id then
      raise exception 'FIRMA_KASSA: amal kaliti boshqa amal uchun ishlatilgan' using errcode = 'P0001';
    end if;
    return v_rev;
  end if;

  select * into v_orig from public.firma_kassa_ledger where id = p_entry_id for update;
  if not found then
    raise exception 'FIRMA_KASSA: yozuv topilmadi' using errcode = 'P0001';
  end if;
  if v_orig.reversed_by is not null then
    raise exception 'FIRMA_KASSA: bu yozuv allaqachon bekor qilingan' using errcode = 'P0001';
  end if;
  if v_orig.op_type in ('reversal_in','reversal_out') then
    raise exception 'FIRMA_KASSA: teskari yozuvni bekor qilib bo''lmaydi' using errcode = 'P0001';
  end if;
  -- Filial kassasi bilan bog'langan yozuvlar (filial bilan o'tkazma, qarz to'lovi, filial qarzi)
  -- ikkala tomonda ham bekor qilinishi kerak — bu yerda emas (teskari amal bilan bajariladi)
  if v_orig.op_type in ('branch_in','branch_out') or v_orig.counterparty_type = 'branch' or coalesce(v_orig.idem_key, '') like 'bf%' then
    raise exception 'FIRMA_KASSA: filial bilan bog''liq yozuvni bu yerda bekor qilib bo''lmaydi — teskari amal (filialga qaytarish) qiling' using errcode = 'P0001';
  end if;
  if v_orig.op_type = 'advance_give'
     and public.firma_kassa_advance_outstanding(v_orig.currency, v_orig.counterparty_type, v_orig.counterparty_id) < v_orig.amount then
    raise exception 'FIRMA_KASSA: avansning bir qismi qaytarilgan — avval qaytarishlarni bekor qiling' using errcode = 'P0001';
  end if;

  v_rev := public._fk_cash_move(v_orig.currency, case when v_orig.direction = 'in' then 'out' else 'in' end, v_orig.amount,
            case when v_orig.direction = 'in' then 'reversal_out' else 'reversal_in' end,
            v_orig.counterparty_type, v_orig.counterparty_id, v_orig.counterparty_name, v_orig.filial,
            'reversal', v_orig.id::text, left(coalesce(p_note, '') || ' (bekor: #' || v_orig.id || ')', 500), p_staff_id, p_staff_name, v_key);
  update public.firma_kassa_ledger set reversed_by = v_rev.id, reversed_at = now() where id = v_orig.id;
  return v_rev;
end;
$$;

-- ── 3. Filial Bazadan (Firma kassadan) qarz oladi / qaytaradi ─────────
alter table public.cashbox_ledger drop constraint if exists cashbox_ledger_kind_chk;
alter table public.cashbox_ledger add constraint cashbox_ledger_kind_chk check (op_kind in (
  'opening','sale','sale_fix','manual_in','manual_out','move','exchange','expense','expense_fix','salary',
  'cust_debt_pay','supp_pay','kirim_pay','dealer_pay','home_withdrawal','branch_to_firma','firma_to_branch','reset_zero',
  'branch_loan_in','branch_loan_repay'));

create or replace function public.branch_firma_loan(
  p_filial text, p_box integer, p_currency text, p_direction text, p_amount numeric, p_key text,
  p_box_name text default null, p_note text default null, p_staff_id bigint default null, p_staff_name text default null)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  v_key text;
  v_amt numeric;
  v_out numeric;
  v_cb public.cashbox_ledger;
  v_fk public.firma_kassa_ledger;
begin
  if coalesce(p_key, '') = '' or length(p_key) > 100 then
    raise exception 'CASHBOX: amal kaliti majburiy' using errcode = 'P0001';
  end if;
  if p_direction is null or p_direction not in ('give','repay') then
    raise exception 'CASHBOX: yo''nalish noto''g''ri' using errcode = 'P0001';
  end if;
  if coalesce(p_filial, '') = '' or p_filial = 'baza' then
    raise exception 'CASHBOX: qarz faqat filialga beriladi' using errcode = 'P0001';
  end if;
  v_key := 'bfl:' || p_key;
  perform pg_advisory_xact_lock(hashtext('cb_bfl:' || p_filial || ':' || v_key));
  -- Bir filial qarzi bo'yicha parallel amallar navbatga qo'yiladi (firma_kassa_repay_advance bilan bir xil qulf)
  perform pg_advisory_xact_lock(hashtext('fk_adv:' || coalesce(p_currency, '') || ':branch:' || p_filial));

  select * into v_cb from public.cashbox_ledger where filial = p_filial and op_key = v_key;
  if found then
    if v_cb.box_local_id <> p_box or v_cb.amount <> round(p_amount, 2)
       or v_cb.op_kind <> (case when p_direction = 'give' then 'branch_loan_in' else 'branch_loan_repay' end) then
      raise exception 'CASHBOX: amal kaliti boshqa amal uchun ishlatilgan' using errcode = 'P0001';
    end if;
    select * into v_fk from public.firma_kassa_ledger where idem_key = v_key;
    return jsonb_build_object('ok', true, 'replay', true, 'filial', p_filial, 'box', p_box, 'currency', v_cb.currency, 'amount', v_cb.amount,
      'outstanding', public.firma_kassa_advance_outstanding(v_cb.currency, 'branch', p_filial),
      'branchBalance', (select balance from public.cashbox_balances where filial = p_filial and box_local_id = p_box),
      'firmaBalance', (select balance from public.firma_kassa_balance where currency = v_cb.currency),
      'branchEntryId', v_cb.id, 'firmaEntryId', v_fk.id);
  end if;

  if p_amount is null or p_amount = 'NaN'::numeric or p_amount <= 0 or p_amount > 1000000000000 then
    raise exception 'CASHBOX: summa musbat bo''lishi kerak' using errcode = 'P0001';
  end if;
  v_amt := round(p_amount, 2);
  -- Qulflash tartibi: filial kassasi → Firma kassa (branch_firma_transfer bilan bir xil)
  perform 1 from public.cashbox_balances where filial = p_filial and box_local_id = p_box for update;
  perform 1 from public.firma_kassa_balance where currency = p_currency for update;

  if p_direction = 'give' then
    v_fk := public._fk_cash_move(p_currency, 'out', v_amt, 'advance_give', 'branch', p_filial, p_filial, p_filial,
                                 'branch_loan', p_box::text, p_note, p_staff_id, p_staff_name, v_key);
    v_cb := public._cb_move(p_filial, p_box, p_currency, 'in', v_amt, 'branch_loan_in', v_key, v_key, p_box_name,
                            'branch_loan', p_filial, coalesce(p_note, 'Bazadan qarz'), p_staff_id, p_staff_name);
  else
    v_out := public.firma_kassa_advance_outstanding(p_currency, 'branch', p_filial);
    if v_amt > v_out + 0.005 then
      raise exception 'CASHBOX: qaytarish (%) filialning Bazadan qarzidan (%) oshib ketdi', v_amt, v_out using errcode = 'P0001';
    end if;
    v_cb := public._cb_move(p_filial, p_box, p_currency, 'out', v_amt, 'branch_loan_repay', v_key, v_key, p_box_name,
                            'branch_loan', p_filial, coalesce(p_note, 'Bazaga qarz qaytarildi'), p_staff_id, p_staff_name);
    v_fk := public._fk_cash_move(p_currency, 'in', v_amt, 'advance_repay', 'branch', p_filial, p_filial, p_filial,
                                 'branch_loan', p_box::text, p_note, p_staff_id, p_staff_name, v_key);
  end if;

  return jsonb_build_object('ok', true, 'replay', false, 'filial', p_filial, 'box', p_box, 'currency', p_currency, 'amount', v_amt,
    'outstanding', public.firma_kassa_advance_outstanding(p_currency, 'branch', p_filial),
    'branchBalance', v_cb.balance_after, 'firmaBalance', v_fk.balance_after, 'branchEntryId', v_cb.id, 'firmaEntryId', v_fk.id);
end;
$$;

-- ── 4. Filiallarning Bazaga qarzlari (hisobot) ────────────────────────
create or replace function public.firma_kassa_branch_summary(p_filial text default null)
 returns jsonb
 language sql
 stable
 set search_path = ''
as $$
  with f as (
    select distinct filial from public.cashbox_balances where filial <> 'baza'
    union select key from public.app_data, jsonb_object_keys(coalesce(data->'branchDebt', '{}'::jsonb)) key where id = 'main'
    union select distinct counterparty_id from public.firma_kassa_ledger where counterparty_type = 'branch'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'filial', f.filial,
    'goodsDebtUsd', coalesce((select nullif(data->'branchDebt'->>f.filial, '')::numeric from public.app_data where id = 'main'), 0),
    'loanUsd', public.firma_kassa_advance_outstanding('USD', 'branch', f.filial),
    'loanUzs', public.firma_kassa_advance_outstanding('UZS', 'branch', f.filial),
    'cashUsd', coalesce((select sum(balance) from public.cashbox_balances b where b.filial = f.filial and b.currency = 'USD'), 0),
    'cashUzs', coalesce((select sum(balance) from public.cashbox_balances b where b.filial = f.filial and b.currency = 'UZS'), 0)
  ) order by f.filial), '[]'::jsonb)
  from f where f.filial is not null and (p_filial is null or f.filial = p_filial);
$$;

-- ── 5. To'lov + kassa harakati — bitta tranzaksiya ────────────────────
-- Mijoz/ta'minotchi ID'lari ilovada uid() (~1.7e15) — integer (max 2.1e9) ga SIG'MAYDI:
-- eski customer-debt-payment-add / supplier-payment-add har bir haqiqiy to'lovda
-- "integer out of range" bilan yiqilardi (brauzer xatoni yutib, "fail-open" davom etardi).
-- Kengaytirish (integer → bigint) — ma'lumot yo'qolmaydi; faqat hali integer bo'lsa.
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='customer_debt_payments'
             and column_name='customer_local_id' and data_type='integer') then
    alter table public.customer_debt_payments alter column customer_local_id type bigint;
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='supplier_payments'
             and column_name='supplier_local_id' and data_type='integer') then
    alter table public.supplier_payments alter column supplier_local_id type bigint;
  end if;
end $$;

alter table public.dealer_payments add column if not exists idem_key text;
create unique index if not exists dealer_payments_idem_key_uq on public.dealer_payments (idem_key) where idem_key is not null;

create or replace function public.cash_payment_atomic(
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
  v_extra jsonb := '{}'::jsonb;
begin
  if p_record_type is null or p_record_type not in ('customer_debt_payment','supplier_payment','dealer_payment','home_withdrawal') then
    raise exception 'CASHBOX: to''lov turi noto''g''ri' using errcode = 'P0001';
  end if;
  if p_record is null or jsonb_typeof(p_record) <> 'object' then
    raise exception 'CASHBOX: to''lov ma''lumoti yo''q' using errcode = 'P0001';
  end if;

  -- Diller qarzi: qulflab o'qiladi, qarzdan ortiq to'lov rad etiladi (kassa harakatidan OLDIN)
  if p_record_type = 'dealer_payment' then
    v_amt := round((p_record->>'amount_usd')::numeric, 2);
    select id, debt_usd, total_paid_usd, filial into v_dealer from public.dealers where id = (p_record->>'dealer_id')::bigint for update;
    if not found then raise exception 'CASHBOX: diller topilmadi' using errcode = 'P0001'; end if;
    if coalesce(v_dealer.filial, 'baza') <> p_filial then raise exception 'CASHBOX: diller boshqa filialga tegishli' using errcode = 'P0001'; end if;
  end if;

  v_res := public.cashbox_apply_ops(p_filial, p_group_key, p_kind, p_ops, p_staff_id, p_staff_name);
  if coalesce((v_res->>'replay')::boolean, false) then
    if p_record_type = 'dealer_payment' then
      v_extra := jsonb_build_object('dealerDebtUsd', v_dealer.debt_usd, 'dealerTotalPaidUsd', v_dealer.total_paid_usd);
    end if;
    return v_res || v_extra;   -- yozuv birinchi chaqiruvda (shu tranzaksiyada) qo'shilgan
  end if;

  if p_record_type = 'customer_debt_payment' then
    insert into public.customer_debt_payments (filial, customer_local_id, customer_name, amount_uzs, box_local_id, staff_id, staff_name, idem_key)
    values (p_filial, (p_record->>'customer_local_id')::bigint, left(p_record->>'customer_name', 200), (p_record->>'amount_uzs')::numeric,
            (p_record->>'box_local_id')::integer, p_staff_id, left(p_staff_name, 200), p_group_key);
  elsif p_record_type = 'supplier_payment' then
    insert into public.supplier_payments (filial, supplier_local_id, supplier_name, amount_usd, box_local_id, staff_id, staff_name, idem_key)
    values (p_filial, (p_record->>'supplier_local_id')::bigint, left(p_record->>'supplier_name', 200), (p_record->>'amount_usd')::numeric,
            (p_record->>'box_local_id')::integer, p_staff_id, left(p_staff_name, 200), p_group_key);
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
  return v_res || v_extra;
end;
$$;

-- ── 6. Ruxsatlar: yangi funksiyalar — faqat server ────────────────────
revoke all on function public._fk_source_type(text, text, text) from public, anon, authenticated;
revoke all on function public._fk_ledger_defaults() from public, anon, authenticated;
revoke all on function public._ledger_immutable() from public, anon, authenticated;
revoke all on function public.firma_kassa_reverse(bigint, text, text, bigint, text) from public, anon, authenticated;
revoke all on function public.branch_firma_loan(text, integer, text, text, numeric, text, text, text, bigint, text) from public, anon, authenticated;
revoke all on function public.firma_kassa_branch_summary(text) from public, anon, authenticated;
revoke all on function public.cash_payment_atomic(text, text, text, jsonb, text, jsonb, bigint, text) from public, anon, authenticated;
revoke all on function public.firma_kassa_advance_outstanding(text, text, text) from public, anon, authenticated;
revoke all on function public.firma_kassa_get_balance() from public, anon, authenticated;
grant execute on function public._fk_source_type(text, text, text) to service_role;
grant execute on function public.firma_kassa_reverse(bigint, text, text, bigint, text) to service_role;
grant execute on function public.branch_firma_loan(text, integer, text, text, numeric, text, text, text, bigint, text) to service_role;
grant execute on function public.firma_kassa_branch_summary(text) to service_role;
grant execute on function public.cash_payment_atomic(text, text, text, jsonb, text, jsonb, bigint, text) to service_role;
grant execute on function public.firma_kassa_advance_outstanding(text, text, text) to service_role;
grant execute on function public.firma_kassa_get_balance() to service_role;

-- ── 7. Xavfsizlik: brauzer ishlatmaydigan narsalardan ruxsatlar olinadi ──
-- (Hozir RLS bu jadvallarni to'sib turibdi — production'da anon bilan sinaldi: 0 qator.
--  Bu — ikkinchi qatlam: bitta xato policy butun jadvalni ochib yubormasligi uchun.)
revoke all on public.partners, public.partner_ledger, public.partner_ledger_legacy_history, public.partner_payments,
  public.partner_periods, public.partner_balances, public.partner_monthly_report_summary, public.partner_monthly_report_detail,
  public.bot_sessions, public.login_security
from anon, authenticated;
-- Diller portali (authenticated): faqat o'qish (+ buyurtma yaratish) — policy'lar shunga mos
revoke all on public.dealers, public.dealer_stock, public.dealer_sales, public.dealer_payments, public.catalog_products, public.dealer_orders from anon;
revoke insert, update, delete, truncate, references, trigger on public.dealers, public.dealer_stock, public.dealer_sales,
  public.dealer_payments, public.catalog_products from authenticated;
revoke update, delete, truncate, references, trigger on public.dealer_orders from authenticated;
-- Kirish blokirovkasi funksiyalari ilovada ishlatilmaydi (Supabase Auth o'zi himoya qiladi);
-- SECURITY INVOKER bo'lgani uchun anon ular orqali baribir hech narsa qila olmaydi (RLS) —
-- EXECUTE ortiqcha. O'chirilmaydi (loyiha qoidasi).
revoke execute on function public.login_check_lock(text) from public, anon, authenticated;
revoke execute on function public.login_record_failure(text) from public, anon, authenticated;
revoke execute on function public.login_record_success(text) from public, anon, authenticated;
grant execute on function public.login_check_lock(text) to service_role;
grant execute on function public.login_record_failure(text) to service_role;
grant execute on function public.login_record_success(text) to service_role;

-- ── 8. Hamkorlar SQL jadvallari — eskirgan (ilova ishlatmaydi) ──────────
comment on table public.partners is 'ESKIRGAN (v23): Hamkorlar (investor/ta''sischi) moduli app_data.data.partners (JSON) dan ishlaydi. Bu jadval faqat tarix uchun; yozilmaydi.';
comment on table public.partner_ledger is 'ESKIRGAN (v23): haqiqiy manba — app_data.data.partners/partnerPeriods va filial xarajatlari (turi=hamkor).';
comment on table public.partner_periods is 'ESKIRGAN (v23): haqiqiy manba — app_data.data.partnerPeriods.';
comment on table public.partner_payments is 'ESKIRGAN (v23): hamkor to''lovlari — firma_kassa_ledger (partner_withdrawal) yoki filial xarajatlari.';
comment on table public.firma_kassa_ledger is 'Firma kassasi jurnali: o''zgarmas; bekor qilish faqat teskari yozuv (firma_kassa_reverse).';
comment on table public.cashbox_ledger is 'Filial kassalari jurnali: o''zgarmas; har bir qoldiq o''zgarishi shu yerda.';
