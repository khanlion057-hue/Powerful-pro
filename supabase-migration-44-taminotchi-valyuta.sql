-- ════════════════════════════════════════════════════════════════════════════
-- 44-MIGRATSIYA (v25) — TA'MINOTCHI QARZI: $ yoki SO'MDA (har ta'minotchiga alohida)
-- ════════════════════════════════════════════════════════════════════════════
-- Egasi qarori (2026-11-10): har ta'minotchining qarz valyutasi tanlanadi — $ (avvalgidek) yoki so'm.
--   • So'mdagi ta'minotchi: qarz ANIQ SO'MDA yuritiladi (supplier_balances.debt_uzs). Har bir harakat
--     (kirim, to'lov, qaytarish, tuzatish) shu kungi kurs bo'yicha so'mga o'giriladi: so'm kassadan
--     to'lov so'mma-so'm, $ kassadan — bugungi kursda. Kurs keyin o'zgarsa ham qarz (so'mda) o'zgarmaydi.
--   • supplier_balances.debt ($) — so'mdagi qarzning bugungi kursdagi aksi: mavjud hisobotlar, kassa va
--     zaklad funksiyalari o'zgarishsiz ishlaydi; «to'lov qarzdan oshib ketdi» tekshiruvi so'mda.
--   • Valyuta faqat qarz 0 bo'lganda o'zgartiriladi (supp_set_currency) — eski qarz aralashib ketmasin.
-- 27 dagi _supp_debt_move kengaytiriladi ($ dagi ta'minotchi uchun xatti-harakati AYNAN avvalgidek).
-- Faqat QO'SHADI, takror ishga tushirish xavfsiz. Talab: 27, 28, 36.

do $$ begin
  if to_regprocedure('public._supp_debt_move(text,bigint,numeric,numeric,text,text,text,text,text,text,text,bigint,text)') is null then
    raise exception '44-migratsiya: avval 27-migratsiya qo''llanishi kerak';
  end if;
end $$;

alter table public.supplier_balances add column if not exists debt_uzs numeric not null default 0;
alter table public.supplier_debt_ledger add column if not exists delta_uzs numeric;
alter table public.supplier_debt_ledger add column if not exists rate numeric;
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'supplier_balances_currency_chk' and conrelid = 'public.supplier_balances'::regclass
              and pg_get_constraintdef(oid) not like '%UZS%') then
    alter table public.supplier_balances drop constraint supplier_balances_currency_chk;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'supplier_balances_currency_chk' and conrelid = 'public.supplier_balances'::regclass) then
    alter table public.supplier_balances add constraint supplier_balances_currency_chk check (currency in ('USD', 'UZS'));
  end if;
end $$;

-- So'mdagi harakat $ aksida 0 bo'lib qolishi mumkin (1 so'm) — jurnal yozuvi baribir ruxsat etiladi
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'supplier_debt_ledger_delta_chk' and conrelid = 'public.supplier_debt_ledger'::regclass
              and pg_get_constraintdef(oid) not like '%delta_uzs%') then
    alter table public.supplier_debt_ledger drop constraint supplier_debt_ledger_delta_chk;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'supplier_debt_ledger_delta_chk' and conrelid = 'public.supplier_debt_ledger'::regclass) then
    alter table public.supplier_debt_ledger add constraint supplier_debt_ledger_delta_chk
      check (delta <> 0 or paid_delta <> 0 or op_kind = 'opening' or coalesce(delta_uzs, 0) <> 0);
  end if;
end $$;

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
  v_cur text;
  v_uzs numeric;
  v_new_uzs numeric;
  v_rate numeric;
  v_d_uzs numeric;
  v_exact numeric;
  v_g text;
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
  select debt, currency, debt_uzs into v_bal, v_cur, v_uzs from public.supplier_balances where filial = p_filial and supplier_local_id = p_supp for update;
  v_bal := coalesce(v_bal, 0);

  if v_cur = 'UZS' then
    -- So'mdagi ta'minotchi: hisob so'mda (bugungi kurs), $ ustuni — aksi
    select nullif(public._fw_num(data->'settings'->>'usdUzs'), 0) into v_rate from public.app_data where id = 'main';
    if coalesce(v_rate, 0) < 100 then
      perform set_config('fw.debt_move', '', true);
      raise exception 'LEDGER: USD/UZS kursi sozlanmagan' using errcode = 'P0001';
    end if;
    v_uzs := coalesce(v_uzs, 0);
    v_d_uzs := round(p_delta * v_rate, 0);
    -- To'lov: so'm aniq qiymati $ ga o'girilganda (4 xona) yo'qolmasin — haqiqiy kassa summasidan olinadi
    if p_kind = 'payment' then
      v_g := current_setting('fw.pay_uzs', true);
      if coalesce(v_g, '') <> '' then
        v_exact := public._fw_num(v_g);
        perform set_config('fw.pay_uzs', '', true);
      elsif p_op_key like 'pay:%' and p_group_key is not null then
        select sum(case when currency = 'UZS' then amount else amount * v_rate end) into v_exact
          from public.cashbox_ledger where filial = p_filial and group_key = p_group_key and direction = 'out';
      end if;
      if coalesce(v_exact, 0) > 0 and abs(v_exact / v_rate + p_delta) <= 0.001 then v_d_uzs := -round(v_exact, 0); end if;
    end if;
    if p_mode = 'set' then
      v_new_uzs := v_d_uzs;
      if v_new_uzs < 0 then raise exception 'LEDGER: qarz manfiy bo''lishi mumkin emas' using errcode = 'P0001'; end if;
    elsif p_mode = 'strict' then
      v_new_uzs := v_uzs + v_d_uzs;
      if v_new_uzs < -1 then
        raise exception 'LEDGER: to''lov (% so''m) ta''minotchi qarzidan (% so''m) oshib ketdi', -v_d_uzs, v_uzs using errcode = 'P0001';
      end if;
      v_new_uzs := greatest(v_new_uzs, 0);
    elsif p_mode = 'clamp' then
      v_new_uzs := greatest(v_uzs + v_d_uzs, 0);
    else
      raise exception 'LEDGER: noma''lum rejim' using errcode = 'P0001';
    end if;
    v_new := round(v_new_uzs / v_rate, 4);
    update public.supplier_balances set debt = v_new, debt_uzs = v_new_uzs, total_paid = total_paid + v_paid, updated_at = now()
     where filial = p_filial and supplier_local_id = p_supp;
    if v_new_uzs <> v_uzs or v_new <> v_bal or v_paid <> 0 or p_kind = 'opening' then
      insert into public.supplier_debt_ledger (filial, supplier_local_id, delta, paid_delta, balance_after, op_kind, op_key, group_key, ref_type, ref_id, note,
                                               staff_id, staff_name, delta_uzs, rate)
      values (p_filial, p_supp, v_new - v_bal, v_paid, v_new, p_kind, p_op_key, p_group_key, left(p_ref_type, 40), left(p_ref_id, 100),
              left(coalesce(p_note || ' · ', '') || 'soʻmda: ' || v_uzs || ' → ' || v_new_uzs || ' (kurs ' || v_rate || ')', 500),
              p_staff_id, left(p_staff_name, 200), v_new_uzs - v_uzs, v_rate);
    end if;
    perform set_config('fw.debt_move', '', true);
    return v_new;
  end if;

  -- $ dagi ta'minotchi — avvalgidek (27)
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

-- Valyutani belgilash: faqat qarz 0 bo'lganda (eski qarz aralashmasin). Takror chaqiruv — xavfsiz.
create or replace function public.supp_set_currency(p_filial text, p_supp bigint, p_currency text,
  p_staff_id bigint default null, p_staff_name text default null)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  b public.supplier_balances;
begin
  if coalesce(p_filial, '') !~ '^[a-z0-9_]{1,40}$' or p_supp is null or p_supp <= 0 then
    raise exception 'LEDGER: ta''minotchi noto''g''ri' using errcode = 'P0001';
  end if;
  if p_currency is null or p_currency not in ('USD', 'UZS') then
    raise exception 'LEDGER: valyuta noto''g''ri' using errcode = 'P0001';
  end if;
  perform set_config('fw.debt_move', '1', true);
  insert into public.supplier_balances (filial, supplier_local_id, debt, currency) values (p_filial, p_supp, 0, 'USD')
    on conflict (filial, supplier_local_id) do nothing;
  select * into b from public.supplier_balances where filial = p_filial and supplier_local_id = p_supp for update;
  if b.currency = p_currency then
    perform set_config('fw.debt_move', '', true);
    return jsonb_build_object('ok', true, 'changed', false, 'currency', b.currency, 'debt', b.debt, 'debtUzs', b.debt_uzs);
  end if;
  if abs(coalesce(b.debt, 0)) > 0.005 or abs(coalesce(b.debt_uzs, 0)) > 0.5 then
    perform set_config('fw.debt_move', '', true);
    raise exception 'LEDGER: valyutani faqat qarz 0 boʻlganda oʻzgartirish mumkin (hozir % $)', round(b.debt, 2) using errcode = 'P0001';
  end if;
  update public.supplier_balances set currency = p_currency, debt = 0, debt_uzs = 0, updated_at = now()
   where filial = p_filial and supplier_local_id = p_supp;
  perform set_config('fw.debt_move', '', true);
  return jsonb_build_object('ok', true, 'changed', true, 'currency', p_currency, 'debt', 0, 'debtUzs', 0);
end;
$$;

-- Amal javobi (authority): so'mdagi ta'minotchi uchun valyuta va so'mdagi qarz ham (36 dagidan farqi — shu ikki maydon)
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
    'suppliers', coalesce((select jsonb_object_agg(supplier_local_id::text, jsonb_build_object('debt', debt, 'paid', total_paid,
                            'debtCur', currency, 'debtUzs', debt_uzs)) from public.supplier_balances
                            where filial = p_filial and supplier_local_id = any(coalesce(p_supp, '{}'))), '{}'::jsonb),
    'batches', coalesce((select jsonb_agg(jsonb_build_object('filial', filial, 'localId', local_id, 'qty', qty, 'sold', sold, 'status', status, 'costUsd', cost_usd,
                            'pid', pid, 'bno', bno, 'origin', origin, 'fromBranch', from_branch, 'date', batch_date) order by id)
                          from public.batches where id = any(coalesce(p_batches, '{}'))), '[]'::jsonb),
    'branchDebt', coalesce((select data->'branchDebt' from public.app_data where id = 'main'), '{}'::jsonb));
$$;

-- Bosh kassadan to'lov (28): so'mdagi summa _supp_debt_move ga aniq yetkaziladi (fw.pay_uzs); qolgani o'zgarmagan
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

  perform set_config('fw.pay_uzs', case when p_currency = 'UZS' then v_amt::text else (v_amt * public._fw_rate())::text end, true);
  v_debt := public._supp_debt_move(p_filial, p_supp, -v_usd, v_usd, 'strict', 'payment', 'fsp:' || p_op_key, p_op_key,
                                   'firma_kassa', null, left(coalesce(p_supp_name, ''), 200), p_staff_id, p_staff_name);
  perform set_config('fw.pay_uzs', '', true);
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

revoke all on function public._supp_debt_move(text, bigint, numeric, numeric, text, text, text, text, text, text, text, bigint, text) from public, anon, authenticated;
revoke all on function public.supp_set_currency(text, bigint, text, bigint, text) from public, anon, authenticated;
grant execute on function public.supp_set_currency(text, bigint, text, bigint, text) to service_role;
revoke all on function public._fw_authority(text, bigint[], bigint[], bigint[]) from public, anon, authenticated;
revoke all on function public.firma_supplier_pay(text, bigint, text, numeric, text, text, text, bigint, text) from public, anon, authenticated;
