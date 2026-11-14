-- ════════════════════════════════════════════════════════════════════════════
-- 45-MIGRATSIYA (v25) — ZAKLAD (OLDINDAN TO'LOV): YUAN, $ yoki SO'MDA
-- ════════════════════════════════════════════════════════════════════════════
-- Egasi qarori (2026-11-10): zaklad yuanda (avvalgidek, $ kassadan), dollarda ($ kassadan) yoki so'mda
-- (so'm kassadan) beriladi. Xizmat foizi — alohida XARAJAT (o'sha valyutada, o'sha kassadan).
--   • Zaklad qoldig'i ta'minotchining qarz valyutasida yuritiladi (44): so'mdagi ta'minotchida — so'mda
--     (balance_uzs; $ ustuni — bugungi kursdagi aksi), $ dagida — $ da (avvalgidek).
--   • «Zakladdan yopish» so'mdagi ta'minotchida so'mda (qarz so'mma-so'm kamayadi), $ dagida — $ da.
-- 33 dagi supplier_advance_pay / _apply O'ZGARMAYDI: *_v45 ularni chaqiradi yoki yangi valyutalarni o'zi bajaradi.
-- Faqat QO'SHADI, takror ishga tushirish xavfsiz. Talab: 33, 44.

do $$ begin
  if to_regprocedure('public.supplier_advance_pay(text,text,bigint,text,text,integer,text,numeric,numeric,numeric,text,bigint,text)') is null
     or to_regprocedure('public.supp_set_currency(text,bigint,text,bigint,text)') is null then
    raise exception '45-migratsiya: avval 33 va 44-migratsiyalar qo''llanishi kerak';
  end if;
end $$;

alter table public.supplier_advance_balances add column if not exists balance_uzs numeric(20,2) not null default 0;
alter table public.supplier_advance_ledger add column if not exists currency text;
alter table public.supplier_advance_ledger add column if not exists amount_native numeric(20,2);
alter table public.supplier_advance_ledger add column if not exists uzs_amount numeric(20,2);

-- Zaklad qoldig'ini o'zgartirish (faqat shu funksiyalar ichida; 33 dagi himoya — fw.adv_move)
create or replace function public._adv_add(p_filial text, p_supp bigint, p_usd numeric, p_uzs numeric, p_supp_uzs boolean, p_rate numeric)
 returns numeric
 language plpgsql
 set search_path = ''
as $$
declare v_bal numeric;
begin
  perform set_config('fw.adv_move', '1', true);
  insert into public.supplier_advance_balances (filial, supplier_local_id, balance_usd, balance_uzs) values (p_filial, p_supp, 0, 0)
    on conflict (filial, supplier_local_id) do nothing;
  if p_supp_uzs then
    update public.supplier_advance_balances
       set balance_uzs = round(balance_uzs + p_uzs, 0), balance_usd = greatest(round((balance_uzs + p_uzs) / p_rate, 4), 0), updated_at = now()
     where filial = p_filial and supplier_local_id = p_supp returning balance_usd into v_bal;
  else
    update public.supplier_advance_balances set balance_usd = round(balance_usd + p_usd, 4), updated_at = now()
     where filial = p_filial and supplier_local_id = p_supp returning balance_usd into v_bal;
  end if;
  perform set_config('fw.adv_move', '', true);
  return v_bal;
end;
$$;

-- ── Zaklad berish ───────────────────────────────────────────────────────────
-- p_currency: 'CNY' (p_amount — yuan, p_rate — 1 $ = ? ¥; $ kassadan) | 'USD' ($ kassadan) | 'UZS' (so'm kassadan)
create or replace function public.supplier_advance_pay_v45(
  p_filial text, p_op_key text, p_supp bigint, p_supp_name text, p_source text, p_box integer, p_box_name text,
  p_currency text, p_amount numeric, p_fee_pct numeric, p_rate numeric, p_note text default null,
  p_staff_id bigint default null, p_staff_name text default null)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  v_prev jsonb;
  v_res jsonb;
  v_rate numeric;
  v_supp_uzs boolean;
  v_amt numeric;
  v_fee numeric;
  v_usd numeric;
  v_fee_usd numeric;
  v_uzs numeric;
  v_bal numeric;
  v_cb jsonb := null;
  v_fk public.firma_kassa_ledger;
  v_fk_id bigint := null;
  v_fk_bal numeric := null;
  v_ops jsonb;
  v_note text;
  v_sym text;
begin
  if p_currency is null or p_currency not in ('CNY', 'USD', 'UZS') then
    raise exception 'ZAKLAD: valyuta noto''g''ri' using errcode = 'P0001';
  end if;
  select coalesce((select currency = 'UZS' from public.supplier_balances where filial = p_filial and supplier_local_id = p_supp), false) into v_supp_uzs;
  select nullif(public._fw_num(data->'settings'->>'usdUzs'), 0) into v_rate from public.app_data where id = 'main';

  if p_currency = 'CNY' then
    v_prev := public._ledger_op_replay(p_filial, p_op_key, 'supp_advance');
    if v_prev is not null then return v_prev; end if;
    v_res := public.supplier_advance_pay(p_filial, p_op_key, p_supp, p_supp_name, p_source, p_box, p_box_name,
                                         p_amount, p_fee_pct, p_rate, p_note, p_staff_id, p_staff_name);
    if v_supp_uzs then
      -- so'mdagi ta'minotchi: yuan zaklad ($ ga o'girilgani) bugungi kursda so'mga; 33 qo'shgan $ — so'mdan qayta hisoblanadi
      if coalesce(v_rate, 0) < 100 then raise exception 'ZAKLAD: USD/UZS kursi sozlanmagan' using errcode = 'P0001'; end if;
      v_uzs := round(public._fw_num(v_res->>'usd') * v_rate, 0);
      v_bal := public._adv_add(p_filial, p_supp, 0, v_uzs, true, v_rate);
      v_res := v_res || jsonb_build_object('advanceUsd', v_bal, 'advanceUzs',
        (select balance_uzs from public.supplier_advance_balances where filial = p_filial and supplier_local_id = p_supp));
    end if;
    return v_res;
  end if;

  if coalesce(p_filial, '') = '' or p_supp is null or p_supp <= 0 then
    raise exception 'ZAKLAD: ta''minotchi noto''g''ri' using errcode = 'P0001';
  end if;
  if p_source is null or p_source not in ('box','firma') or (p_source = 'box' and (p_box is null or p_box < 0)) then
    raise exception 'ZAKLAD: pul manbai noto''g''ri' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount = 'NaN'::numeric or p_amount <= 0 or p_amount > 100000000000 then
    raise exception 'ZAKLAD: summa musbat bo''lishi kerak' using errcode = 'P0001';
  end if;
  if p_fee_pct is null or p_fee_pct = 'NaN'::numeric or p_fee_pct < 0 or p_fee_pct > 5 then
    raise exception 'ZAKLAD: xizmat foizi 0–5%% oralig''ida bo''lishi kerak' using errcode = 'P0001';
  end if;
  if coalesce(v_rate, 0) < 100 then raise exception 'ZAKLAD: USD/UZS kursi sozlanmagan' using errcode = 'P0001'; end if;
  v_prev := public._ledger_op_replay(p_filial, p_op_key, 'supp_advance');
  if v_prev is not null then return v_prev; end if;

  v_amt := round(p_amount, case when p_currency = 'UZS' then 0 else 2 end);
  v_fee := round(v_amt * p_fee_pct / 100, case when p_currency = 'UZS' then 0 else 2 end);
  v_usd := case when p_currency = 'USD' then v_amt else round(v_amt / v_rate, 4) end;
  v_fee_usd := case when p_currency = 'USD' then v_fee else round(v_fee / v_rate, 4) end;
  v_uzs := case when p_currency = 'UZS' then v_amt else round(v_amt * v_rate, 0) end;
  if v_usd <= 0 then raise exception 'ZAKLAD: summa juda kichik' using errcode = 'P0001'; end if;
  v_sym := case when p_currency = 'USD' then ' $' else ' so''m' end;
  v_note := left(coalesce(nullif(btrim(p_note), ''), 'Zaklad') || ' — ' || v_amt || v_sym
                 || case when v_fee > 0 then ', xizmat ' || round(p_fee_pct, 3) || '%' else '' end, 500);

  if p_source = 'box' then
    v_ops := jsonb_build_array(jsonb_build_object('box', p_box, 'currency', p_currency, 'dir', 'out', 'amount', v_amt, 'box_name', left(p_box_name, 200),
                                                  'ref_type', 'supplier_advance', 'ref_id', p_supp::text, 'note', left('Zaklad: ' || coalesce(p_supp_name, '') || ' — ' || v_note, 500)));
    if v_fee > 0 then
      v_ops := v_ops || jsonb_build_array(jsonb_build_object('box', p_box, 'currency', p_currency, 'dir', 'out', 'amount', v_fee, 'box_name', left(p_box_name, 200),
                                                             'ref_type', 'expense', 'ref_id', 'transfer_fee', 'note', left('Pul oʻtkazish xizmati (zaklad: ' || coalesce(p_supp_name, '') || ')', 500)));
    end if;
    v_cb := public.cashbox_apply_ops(p_filial, 'sadv:' || p_op_key, 'supp_advance', v_ops, p_staff_id, p_staff_name);
  else
    v_fk := public._fk_cash_move(p_currency, 'out', v_amt, 'supplier_payment', 'supplier', p_supp::text, left(p_supp_name, 200),
                                 p_filial, 'supplier_advance', p_supp::text, v_note, p_staff_id, p_staff_name, 'sadv:' || p_filial || ':' || p_op_key);
    v_fk_id := v_fk.id; v_fk_bal := v_fk.balance_after;
    if v_fee > 0 then
      v_fk := public._fk_cash_move(p_currency, 'out', v_fee, 'expense', null, null, 'Pul oʻtkazish xizmati',
                                   p_filial, 'expense', 'transfer_fee', left('Zaklad xizmati: ' || coalesce(p_supp_name, ''), 500), p_staff_id, p_staff_name,
                                   'sadvf:' || p_filial || ':' || p_op_key);
      v_fk_bal := v_fk.balance_after;
    end if;
  end if;

  v_bal := public._adv_add(p_filial, p_supp, v_usd, v_uzs, v_supp_uzs, v_rate);
  insert into public.supplier_advance_ledger (filial, supplier_local_id, supplier_name, kind, fee_pct, rate, usd_amount, fee_usd, source,
                                              box_local_id, fk_entry_id, balance_after, op_key, note, staff_id, staff_name, currency, amount_native, uzs_amount)
  values (p_filial, p_supp, left(p_supp_name, 200), 'advance', round(p_fee_pct, 3), round(v_rate, 6), v_usd, v_fee_usd, p_source,
          case when p_source = 'box' then p_box end, v_fk_id, v_bal, p_op_key, left(p_note, 500), p_staff_id, left(p_staff_name, 200),
          p_currency, v_amt, case when v_supp_uzs then v_uzs end);

  v_res := jsonb_build_object('ok', true, 'currency', p_currency, 'amount', v_amt, 'fee', v_fee, 'feePct', round(p_fee_pct, 3), 'rate', round(v_rate, 6),
    'usd', v_usd, 'feeUsd', v_fee_usd, 'totalUsd', v_usd + v_fee_usd, 'total', v_amt + v_fee, 'advanceUsd', v_bal,
    'advanceUzs', (select balance_uzs from public.supplier_advance_balances where filial = p_filial and supplier_local_id = p_supp), 'source', p_source,
    'balances', coalesce(v_cb->'balances', '{}'::jsonb), 'firmaBalance', v_fk_bal, 'fkEntryId', v_fk_id);
  return public._ledger_op_finish(p_filial, p_op_key, 'supp_advance', v_res, null, array[p_supp], null, p_staff_id, p_staff_name);
end;
$$;

-- ── Zakladdan yopish ────────────────────────────────────────────────────────
-- $ dagi ta'minotchi: p_amount — $ (33 dagi kabi). So'mdagi: p_amount — so'm (qarz so'mma-so'm kamayadi).
create or replace function public.supplier_advance_apply_v45(
  p_filial text, p_op_key text, p_supp bigint, p_supp_name text, p_amount numeric,
  p_staff_id bigint default null, p_staff_name text default null)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  v_prev jsonb;
  v_rate numeric;
  v_amt numeric;
  v_usd numeric;
  v_bal numeric;
  v_res jsonb;
begin
  if not coalesce((select currency = 'UZS' from public.supplier_balances where filial = p_filial and supplier_local_id = p_supp), false) then
    return public.supplier_advance_apply(p_filial, p_op_key, p_supp, p_supp_name, p_amount, p_staff_id, p_staff_name);
  end if;
  if p_amount is null or p_amount = 'NaN'::numeric or p_amount <= 0 or p_amount > 100000000000 then
    raise exception 'ZAKLAD: summa musbat bo''lishi kerak' using errcode = 'P0001';
  end if;
  v_prev := public._ledger_op_replay(p_filial, p_op_key, 'supp_advance_apply');
  if v_prev is not null then return v_prev; end if;
  select nullif(public._fw_num(data->'settings'->>'usdUzs'), 0) into v_rate from public.app_data where id = 'main';
  if coalesce(v_rate, 0) < 100 then raise exception 'ZAKLAD: USD/UZS kursi sozlanmagan' using errcode = 'P0001'; end if;

  v_amt := round(p_amount, 0);
  select balance_uzs into v_bal from public.supplier_advance_balances where filial = p_filial and supplier_local_id = p_supp for update;
  v_bal := coalesce(v_bal, 0);
  if v_amt > v_bal + 0.5 then
    raise exception 'ZAKLAD: summa (% so''m) zakladdan (% so''m) ko''p', v_amt, v_bal using errcode = 'P0001';
  end if;
  v_amt := least(v_amt, v_bal);
  v_usd := round(v_amt / v_rate, 4);
  if v_usd <= 0 then raise exception 'ZAKLAD: summa juda kichik' using errcode = 'P0001'; end if;
  perform set_config('fw.pay_uzs', v_amt::text, true);   -- qarz so'mma-so'm kamaysin (44)
  perform public._supp_debt_move(p_filial, p_supp, -v_usd, v_usd, 'strict', 'payment', 'sadp:' || p_op_key, p_op_key,
                                 'supplier_advance', null, left('Zakladdan: ' || coalesce(p_supp_name, ''), 500), p_staff_id, p_staff_name);
  perform set_config('fw.pay_uzs', '', true);
  v_bal := public._adv_add(p_filial, p_supp, 0, -v_amt, true, v_rate);
  insert into public.supplier_advance_ledger (filial, supplier_local_id, supplier_name, kind, usd_amount, balance_after, op_key, note, staff_id, staff_name,
                                              currency, amount_native, uzs_amount, rate)
  values (p_filial, p_supp, left(p_supp_name, 200), 'apply', v_usd, v_bal, p_op_key, 'Qarz zakladdan yopildi', p_staff_id, left(p_staff_name, 200),
          'UZS', v_amt, v_amt, round(v_rate, 6));
  insert into public.supplier_payments (filial, supplier_local_id, supplier_name, amount_usd, box_local_id, staff_id, staff_name, idem_key)
  values (p_filial, p_supp, left(p_supp_name, 200), v_usd, null, p_staff_id, left(p_staff_name, 200), 'sadp:' || p_op_key);

  v_res := jsonb_build_object('ok', true, 'appliedUsd', v_usd, 'appliedUzs', v_amt, 'advanceUsd', v_bal,
    'advanceUzs', (select balance_uzs from public.supplier_advance_balances where filial = p_filial and supplier_local_id = p_supp),
    'supplierDebt', (select debt from public.supplier_balances where filial = p_filial and supplier_local_id = p_supp),
    'supplierPaid', (select total_paid from public.supplier_balances where filial = p_filial and supplier_local_id = p_supp),
    'supplierDebtCur', 'UZS',
    'supplierDebtUzs', (select debt_uzs from public.supplier_balances where filial = p_filial and supplier_local_id = p_supp));
  return public._ledger_op_finish(p_filial, p_op_key, 'supp_advance_apply', v_res, null, array[p_supp], null, p_staff_id, p_staff_name);
end;
$$;

-- Valyuta o'zgarishi (44): zaklad qoldig'i bo'lsa ham rad etiladi (zaklad ta'minotchi valyutasida yuritiladi)
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
  if exists (select 1 from public.supplier_advance_balances a where a.filial = p_filial and a.supplier_local_id = p_supp
              and (a.balance_usd > 0.005 or a.balance_uzs > 0.5)) then
    perform set_config('fw.debt_move', '', true);
    raise exception 'LEDGER: valyutani faqat zaklad 0 boʻlganda oʻzgartirish mumkin' using errcode = 'P0001';
  end if;
  update public.supplier_balances set currency = p_currency, debt = 0, debt_uzs = 0, updated_at = now()
   where filial = p_filial and supplier_local_id = p_supp;
  perform set_config('fw.debt_move', '', true);
  return jsonb_build_object('ok', true, 'changed', true, 'currency', p_currency, 'debt', 0, 'debtUzs', 0);
end;
$$;

revoke all on function public._adv_add(text, bigint, numeric, numeric, boolean, numeric) from public, anon, authenticated;
revoke all on function public.supplier_advance_pay_v45(text, text, bigint, text, text, integer, text, text, numeric, numeric, numeric, text, bigint, text) from public, anon, authenticated;
revoke all on function public.supplier_advance_apply_v45(text, text, bigint, text, numeric, bigint, text) from public, anon, authenticated;
revoke all on function public.supp_set_currency(text, bigint, text, bigint, text) from public, anon, authenticated;
grant execute on function public.supplier_advance_pay_v45(text, text, bigint, text, text, integer, text, text, numeric, numeric, numeric, text, bigint, text) to service_role;
grant execute on function public.supplier_advance_apply_v45(text, text, bigint, text, numeric, bigint, text) to service_role;
grant execute on function public.supp_set_currency(text, bigint, text, bigint, text) to service_role;
