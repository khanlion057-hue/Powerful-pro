-- ════════════════════════════════════════════════════════════════════
-- 28-MIGRATSIYA (v23.4): FIRMA KASSASI — ASOSIY KASSA
--   • Kunlik yopish («Uyga berish») — pul tizimdan chiqmaydi: filial kassasi → Firma kassasi
--     (mavjud branch_firma_transfer orqali, bu yerda o'zgarish yo'q).
--   • Firma kassasidan XARAJAT (op_type = 'expense', ref_type = 'expense').
--   • Firma kassasidan TA'MINOTCHIGA QARZ TO'LOVI — kassa va qarz BITTA tranzaksiyada
--     (firma_supplier_pay; qarz jurnali 27-migratsiyadagi _supp_debt_move orqali, qarzdan ortiq — rad).
--   • Xarajat yozuvini bekor qilish faqat Xarajatlar bo'limidan (firma_kassa_reverse_expense).
-- Faqat qo'shadi / kengaytiradi; ma'lumot o'chirmaydi; qayta ishga tushirish xavfsiz.
-- Talab: 23, 25 va 27-migratsiyalar. Har doim 27 dan KEYIN.
-- ════════════════════════════════════════════════════════════════════

-- ── 0. Bog'liqlik ──────────────────────────────────────────────────────
do $$ begin
  if to_regclass('public.firma_kassa_ledger') is null or to_regclass('public.ledger_ops') is null
     or not exists (select 1 from pg_proc where proname = '_supp_debt_move')
     or not exists (select 1 from pg_proc where proname = 'firma_kassa_reverse') then
    raise exception '28-migratsiya: avval 23, 25 va 27-migratsiyalarni qo''llang';
  end if;
end $$;

-- ── 1. Amal turlari va manba turlari ───────────────────────────────────
alter table public.firma_kassa_ledger drop constraint if exists firma_kassa_ledger_op_chk;
alter table public.firma_kassa_ledger add constraint firma_kassa_ledger_op_chk check (
  (direction = 'in'  and op_type in ('deposit','branch_in','advance_repay','adjust_in','opening','reversal_in')) or
  (direction = 'out' and op_type in ('withdraw','branch_out','advance_give','kirim_payment','partner_withdrawal','adjust_out','reversal_out',
                                     'expense','supplier_payment'))
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
    when p_op_type = 'deposit' and p_ref_type = 'expense' then 'partner_deposit'
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
    when p_op_type = 'expense' then 'expense'
    when p_op_type = 'supplier_payment' then 'supplier_payment'
    when p_op_type in ('reversal_in','reversal_out') then 'reversal'
  end
$$;

alter table public.firma_kassa_ledger drop constraint if exists firma_kassa_ledger_source_chk;
alter table public.firma_kassa_ledger add constraint firma_kassa_ledger_source_chk check (source_type is not null and source_type in (
  'opening_balance','manual_adjustment','deposit','withdraw','branch_debt_payment','branch_transfer_in','branch_transfer_out',
  'branch_loan','advance_given','advance_repayment','kirim_payment','kirim_shortfall','partner_withdrawal','reversal',
  'expense','supplier_payment','partner_deposit'));

alter table public.ledger_ops drop constraint if exists ledger_ops_kind_chk;
alter table public.ledger_ops add constraint ledger_ops_kind_chk check (kind in ('sale','sale_return','sale_void','sale_edit','cust_set','supp_set',
  'batches_create','batch_edit','batch_delete','batch_arrive','revision','stock_out','firma_supp_pay'));

-- ── 2. Umumiy bekor qilish: xarajat va ta'minotchi to'lovi bu yerda bekor qilinmaydi ──
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
  -- 28: xarajat yozuvi — faqat Xarajatlar bo'limidan (firma_kassa_reverse_expense) bekor qilinadi (JSON yozuvi ham o'chadi);
  -- ta'minotchiga to'lov — qarz jurnali bilan bog'langan, bu yerda bekor qilinmaydi
  if coalesce(v_orig.ref_type, '') = 'expense' then
    raise exception 'FIRMA_KASSA: xarajat yozuvini Xarajatlar bo''limidan o''chiring (kassa va xarajat birga qaytadi)' using errcode = 'P0001';
  end if;
  if v_orig.op_type = 'supplier_payment' then
    raise exception 'FIRMA_KASSA: ta''minotchiga to''lov qarz jurnali bilan bog''langan — bu yerda bekor qilib bo''lmaydi' using errcode = 'P0001';
  end if;
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


-- ── 3. Xarajat yozuvini bekor qilish (Xarajatlar bo'limidan o'chirilganda) ──
create or replace function public.firma_kassa_reverse_expense(
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
  if coalesce(v_orig.ref_type, '') <> 'expense' or v_orig.op_type not in ('expense','deposit') then
    raise exception 'FIRMA_KASSA: bu xarajat yozuvi emas' using errcode = 'P0001';
  end if;
  if v_orig.reversed_by is not null then
    raise exception 'FIRMA_KASSA: bu yozuv allaqachon bekor qilingan' using errcode = 'P0001';
  end if;
  v_rev := public._fk_cash_move(v_orig.currency, case when v_orig.direction = 'in' then 'out' else 'in' end, v_orig.amount,
            case when v_orig.direction = 'in' then 'reversal_out' else 'reversal_in' end,
            v_orig.counterparty_type, v_orig.counterparty_id, v_orig.counterparty_name, v_orig.filial,
            'reversal', v_orig.id::text, left(coalesce(p_note, '') || ' (xarajat bekor: #' || v_orig.id || ')', 500), p_staff_id, p_staff_name, v_key);
  update public.firma_kassa_ledger set reversed_by = v_rev.id, reversed_at = now() where id = v_orig.id;
  return v_rev;
end;
$$;

-- ── 4. Firma kassasidan ta'minotchi qarzini to'lash — kassa + qarz BITTA tranzaksiyada ──
-- Qulf tartibi (27 bilan bir xil): ta'minotchi → kassa. Qarzdan ortiq to'lov — rad (1 sent tolerantlik).
-- Takroriy so'rov (bir xil p_op_key) — birinchi natija qaytadi, ikkinchi marta yozilmaydi.
create or replace function public.firma_supplier_pay(
  p_filial text, p_supp bigint, p_currency text, p_amount numeric, p_op_key text,
  p_supp_name text default null, p_note text default null, p_staff_id bigint default null, p_staff_name text default null)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  v_prev jsonb;
  v_amt numeric;
  v_usd numeric;
  v_debt numeric;
  v_fk public.firma_kassa_ledger;
  v_res jsonb;
begin
  if coalesce(p_filial, '') = '' or p_supp is null or p_supp <= 0 then
    raise exception 'LEDGER: ta''minotchi noto''g''ri' using errcode = 'P0001';
  end if;
  if p_currency is null or p_currency not in ('USD','UZS') then
    raise exception 'FIRMA_KASSA: valyuta faqat USD yoki UZS' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount = 'NaN'::numeric or p_amount <= 0 or p_amount > 10000000000000 then
    raise exception 'FIRMA_KASSA: summa musbat bo''lishi kerak' using errcode = 'P0001';
  end if;
  v_prev := public._ledger_op_replay(p_filial, p_op_key, 'firma_supp_pay');
  if v_prev is not null then return v_prev; end if;

  v_amt := round(p_amount, 2);
  v_usd := case when p_currency = 'USD' then v_amt else round(v_amt / public._fw_rate(), 4) end;
  if v_usd <= 0 then raise exception 'FIRMA_KASSA: summa juda kichik' using errcode = 'P0001'; end if;

  v_debt := public._supp_debt_move(p_filial, p_supp, -v_usd, v_usd, 'strict', 'payment', 'fsp:' || p_op_key, p_op_key,
                                   'firma_kassa', null, left(coalesce(p_supp_name, ''), 200), p_staff_id, p_staff_name);
  v_fk := public._fk_cash_move(p_currency, 'out', v_amt, 'supplier_payment', 'supplier', p_supp::text, left(p_supp_name, 200),
                               p_filial, 'supplier_debt', p_supp::text, p_note, p_staff_id, p_staff_name, 'fsp:' || p_filial || ':' || p_op_key);
  insert into public.supplier_payments (filial, supplier_local_id, supplier_name, amount_usd, box_local_id, staff_id, staff_name, idem_key)
  values (p_filial, p_supp, left(p_supp_name, 200), v_usd, null, p_staff_id, left(p_staff_name, 200), 'fsp:' || p_op_key);

  v_res := jsonb_build_object('ok', true, 'fkEntryId', v_fk.id, 'currency', p_currency, 'amount', v_amt, 'amountUsd', v_usd,
    'firmaBalance', v_fk.balance_after,
    'supplierDebt', (select debt from public.supplier_balances where filial = p_filial and supplier_local_id = p_supp),
    'supplierPaid', (select total_paid from public.supplier_balances where filial = p_filial and supplier_local_id = p_supp));
  return public._ledger_op_finish(p_filial, p_op_key, 'firma_supp_pay', v_res, null, array[p_supp], null, p_staff_id, p_staff_name);
end;
$$;

-- ── 5. Huquqlar: brauzer rollari chaqira olmaydi, faqat server (service_role) ──
revoke all on function public._fk_source_type(text, text, text) from public, anon, authenticated;
revoke all on function public.firma_kassa_reverse(bigint, text, text, bigint, text) from public, anon, authenticated;
revoke all on function public.firma_kassa_reverse_expense(bigint, text, text, bigint, text) from public, anon, authenticated;
revoke all on function public.firma_supplier_pay(text, bigint, text, numeric, text, text, text, bigint, text) from public, anon, authenticated;
grant execute on function public._fk_source_type(text, text, text) to service_role;
grant execute on function public.firma_kassa_reverse(bigint, text, text, bigint, text) to service_role;
grant execute on function public.firma_kassa_reverse_expense(bigint, text, text, bigint, text) to service_role;
grant execute on function public.firma_supplier_pay(text, bigint, text, numeric, text, text, text, bigint, text) to service_role;
