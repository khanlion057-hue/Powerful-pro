-- ════════════════════════════════════════════════════════════════════
-- 34-MIGRATSIYA (v24.5): MIJOZ HAQI (ORTIQCHA TO'LOV) VA SAVDO TO'LOVINI SERVERDA TEKSHIRISH
-- Egasi tasdiqlagan qoida (2026-10-14):
--   • Savdoda olingan summa chekdan KO'P bo'lsa — mijoz majburiy; ortiqchasi avval mijozning mavjud
--     qarzidan ayiriladi, qolgani mijozning HAQI (oldindan to'lovi) bo'lib qoladi. Pul kassaga to'liq tushadi.
--   • Haq keyingi savdoda «Haqidan ishlatish» bilan sarflanadi (haqdan ortiq emas).
--   • Mijoz qarzi qoidalari (qarz manfiy bo'lmaydi) o'zgarmaydi — haq ALOHIDA hisob (ta'minotchi zakladi kabi).
--   • Haqdan to'langan savdo o'chirilsa — haq to'liq qaytadi, kassadan faqat naqd qismi chiqadi.
--     Bunday savdoni tahrirlash taqiqlanadi (qaytarish va o'chirish ishlaydi).
-- Xavfsizlik tuzatishi: savdoda «to'langan» summa endi kassaga tushum + haqdan oshmasligi serverda tekshiriladi
-- (avval brauzer yuborgan paidUsd kassaga tushumsiz ham qabul qilinardi — qarz kam yozilishi mumkin edi).
-- Hammasi bitta tranzaksiyada; takror so'rov ikki marta yozilmaydi. Faqat qo'shadi; mavjud ma'lumot o'zgarmaydi;
-- qayta ishga tushirish xavfsiz. Talab: 24, 27, 31, 32.
-- ════════════════════════════════════════════════════════════════════

-- ── 0. Bog'liqlik ──────────────────────────────────────────────────────
do $$ begin
  if to_regclass('public.ledger_ops') is null or not exists (select 1 from pg_proc where proname = '_cust_debt_move')
     or not exists (select 1 from pg_proc where proname = 'sale_checkout_guarded') or not exists (select 1 from pg_proc where proname = 'sale_void_guarded')
     or to_regclass('public.fw_dealer_revisions') is null then
    raise exception '34-migratsiya: avval 24, 27, 31 va 32-migratsiyalarni qo''llang';
  end if;
end $$;

-- ── 1. Mijoz haqi (so'm) va o'zgarmas jurnal ───────────────────────────
create table if not exists public.customer_credit_balances (
  filial text not null,
  customer_local_id bigint not null,
  credit_uzs numeric(20,2) not null default 0,
  updated_at timestamp with time zone not null default now(),
  primary key (filial, customer_local_id),
  constraint customer_credit_balances_nonneg check (credit_uzs >= 0)
);
create table if not exists public.customer_credit_ledger (
  id bigint generated always as identity primary key,
  created_at timestamp with time zone not null default now(),
  filial text not null,
  customer_local_id bigint not null,
  kind text not null,
  delta_uzs numeric(20,2) not null,
  balance_after numeric(20,2) not null,
  op_key text not null,
  ref_type text,
  ref_id text,
  note text,
  staff_id bigint,
  staff_name text,
  constraint customer_credit_ledger_kind_chk check (kind in ('overpay','apply','void_restore','refund','adjust')),
  constraint customer_credit_ledger_amt_chk check (delta_uzs <> 0 and balance_after >= 0),
  constraint customer_credit_ledger_len_chk check (length(op_key) <= 160 and coalesce(length(note),0) <= 500
    and coalesce(length(staff_name),0) <= 200 and coalesce(length(ref_id),0) <= 100 and length(filial) <= 40),
  constraint customer_credit_ledger_op_uq unique (filial, op_key, kind)
);
create index if not exists idx_cust_credit_ledger_party on public.customer_credit_ledger (filial, customer_local_id, id desc);

-- Savdoda haqdan foydalanish (o'chirilsa — qaytariladi; tahrir taqiqlanadi)
create table if not exists public.sale_credit_uses (
  filial text not null,
  sale_local_id text not null,
  customer_local_id bigint not null,
  credit_uzs numeric(20,2) not null,
  restored_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  primary key (filial, sale_local_id),
  constraint sale_credit_uses_amt_chk check (credit_uzs > 0)
);

create or replace function public._fw_credit_guard()
 returns trigger
 language plpgsql
 set search_path = ''
as $$
begin
  if tg_table_name in ('customer_credit_balances','sale_credit_uses') and coalesce(current_setting('fw.credit_move', true), '') = '1' and tg_op <> 'DELETE' then
    return new;
  end if;
  raise exception 'HAQ: mijoz haqi faqat savdo amallari orqali o''zgaradi (jurnal o''zgarmas)' using errcode = 'P0001';
end;
$$;
create or replace trigger customer_credit_balances_guard before insert or update or delete on public.customer_credit_balances
  for each row execute function public._fw_credit_guard();
create or replace trigger sale_credit_uses_guard before insert or update or delete on public.sale_credit_uses
  for each row execute function public._fw_credit_guard();
create or replace trigger customer_credit_ledger_immutable before update or delete on public.customer_credit_ledger
  for each row execute function public._fw_credit_guard();
create or replace trigger customer_credit_ledger_no_truncate before truncate on public.customer_credit_ledger
  for each statement execute function public._fw_credit_guard();

alter table public.customer_credit_balances enable row level security;
alter table public.customer_credit_ledger enable row level security;
alter table public.sale_credit_uses enable row level security;
revoke all on public.customer_credit_balances, public.customer_credit_ledger, public.sale_credit_uses from anon, authenticated;
grant select, insert, update on public.customer_credit_balances, public.sale_credit_uses to service_role;
grant select, insert on public.customer_credit_ledger to service_role;
grant usage on sequence public.customer_credit_ledger_id_seq to service_role;

-- ── 2. Kassa amal turi: ortiqcha to'lov (mijoz haqi / qarz to'lovi) ────
alter table public.cashbox_ledger drop constraint if exists cashbox_ledger_kind_chk;
alter table public.cashbox_ledger add constraint cashbox_ledger_kind_chk check (op_kind in (
  'opening','sale','sale_fix','manual_in','manual_out','move','exchange','expense','expense_fix','salary',
  'cust_debt_pay','supp_pay','kirim_pay','dealer_pay','home_withdrawal','branch_to_firma','firma_to_branch','reset_zero',
  'branch_loan_in','branch_loan_repay','supp_advance','cust_credit'));

-- ── 3. Haq harakati (yagona yo'l) ──────────────────────────────────────
create or replace function public._cust_credit_move(
  p_filial text, p_cust bigint, p_delta numeric, p_kind text, p_op_key text,
  p_ref_type text default null, p_ref_id text default null, p_note text default null,
  p_staff_id bigint default null, p_staff_name text default null)
 returns numeric
 language plpgsql
 set search_path = ''
as $$
declare
  v_bal numeric;
  v_new numeric;
begin
  if coalesce(p_filial, '') = '' or p_cust is null or p_cust <= 0 then raise exception 'HAQ: mijoz noto''g''ri' using errcode = 'P0001'; end if;
  if p_delta is null or p_delta = 'NaN'::numeric or p_delta = 0 or abs(p_delta) > 1000000000000 then
    raise exception 'HAQ: summa noto''g''ri' using errcode = 'P0001';
  end if;
  perform set_config('fw.credit_move', '1', true);
  insert into public.customer_credit_balances (filial, customer_local_id, credit_uzs) values (p_filial, p_cust, 0)
    on conflict (filial, customer_local_id) do nothing;
  select credit_uzs into v_bal from public.customer_credit_balances where filial = p_filial and customer_local_id = p_cust for update;
  v_new := round(coalesce(v_bal, 0) + p_delta, 2);
  if v_new < 0 then
    raise exception 'HAQ: mijoz haqi yetarli emas (bor: % so''m, kerak: % so''m)', round(coalesce(v_bal, 0)), round(-p_delta) using errcode = 'P0001';
  end if;
  update public.customer_credit_balances set credit_uzs = v_new, updated_at = now() where filial = p_filial and customer_local_id = p_cust;
  insert into public.customer_credit_ledger (filial, customer_local_id, kind, delta_uzs, balance_after, op_key, ref_type, ref_id, note, staff_id, staff_name)
  values (p_filial, p_cust, p_kind, round(p_delta, 2), v_new, left(p_op_key, 160), left(p_ref_type, 40), left(p_ref_id, 100), left(p_note, 500), p_staff_id, left(p_staff_name, 200));
  perform set_config('fw.credit_move', '', true);
  return v_new;
end;
$$;

-- ── 4. SAVDO (v34): to'lov tekshiruvi + haqdan foydalanish + ortiqcha to'lov ──
-- p_overpay: {box_id, amount_native} — kassaga tushgan, chek summasidan ORTIQ pul (mijoz majburiy)
-- p_credit_use_uzs: mijoz haqidan shu savdoga ishlatiladigan summa (so'm)
create or replace function public.sale_checkout_v34(
  p_filial text, p_op_key text, p_sale jsonb, p_box_payments jsonb,
  p_staff_id bigint, p_staff_name text, p_role text, p_loss_ack boolean default false,
  p_overpay jsonb default null, p_credit_use_uzs numeric default 0)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  v_res jsonb;
  v_cust bigint;
  v_rate numeric;
  v_paid numeric;
  v_cash_usd numeric := 0;
  v_credit numeric := round(coalesce(p_credit_use_uzs, 0), 2);
  v_credit_usd numeric := 0;
  v_bp jsonb;
  v_cur text;
  v_amt numeric;
  v_box int;
  v_local text;
  v_inv text;
  v_ov_box int;
  v_ov_amt numeric;
  v_ov_cur text;
  v_ov_uzs numeric;
  v_debt numeric;
  v_to_debt numeric;
  v_rows jsonb;
  v_bal jsonb;
begin
  v_cust := case when coalesce(p_sale->>'custId', '') ~ '^[0-9]{1,18}$' and (p_sale->>'custId')::numeric > 0 then (p_sale->>'custId')::bigint end;
  v_local := p_sale->>'localId';
  -- Takror so'rov — birinchi natija + mijozning joriy qarzi/haqi
  if exists (select 1 from public.ledger_ops where filial = p_filial and op_key = p_op_key) then
    v_res := public.sale_checkout_guarded(p_filial, p_op_key, p_sale, p_box_payments, p_staff_id, p_staff_name, p_role, p_loss_ack);
    if v_cust is not null then
      v_res := v_res || jsonb_build_object(
        'custDebtUzs', coalesce((select debt from public.customer_balances where filial = p_filial and customer_local_id = v_cust), 0),
        'custCreditUzs', coalesce((select credit_uzs from public.customer_credit_balances where filial = p_filial and customer_local_id = v_cust), 0));
    end if;
    return v_res;
  end if;

  if v_credit < 0 or v_credit > 1000000000000 then raise exception 'HAQ: summa noto''g''ri' using errcode = 'P0001'; end if;
  if (v_credit > 0 or p_overpay is not null) and v_cust is null then
    raise exception 'SAVDO: ortiqcha to''lov yoki haqdan foydalanish uchun mijoz tanlanishi shart' using errcode = 'P0001';
  end if;
  v_rate := public._fw_rate();

  -- To'langan summa = kassaga tushum + haqdan; ortig'i qabul qilinmaydi (qarz kam yozilmasin)
  if p_box_payments is not null and jsonb_typeof(p_box_payments) = 'array' then
    for v_bp in select * from jsonb_array_elements(p_box_payments) loop
      continue when coalesce(v_bp->>'box_id', '') !~ '^[0-9]{1,9}$';
      v_amt := public._fw_num(v_bp->>'amount_native');
      continue when v_amt <= 0;
      select currency into v_cur from public.cashbox_balances where filial = p_filial and box_local_id = (v_bp->>'box_id')::int;
      v_cur := coalesce(v_cur, case when v_bp->>'currency' in ('USD','UZS') then v_bp->>'currency' end, 'UZS');
      v_cash_usd := v_cash_usd + case when v_cur = 'USD' then v_amt else v_amt / v_rate end;
    end loop;
  end if;
  v_credit_usd := v_credit / v_rate;
  v_paid := public._fw_num(p_sale->>'paidUsd');
  if v_paid > v_cash_usd + v_credit_usd + greatest(0.02, (v_cash_usd + v_credit_usd) * 0.005) then
    raise exception 'SAVDO: to''langan summa (% $) kassaga tushumdan (% $) oshib ketdi', round(v_paid, 2), round(v_cash_usd + v_credit_usd, 2) using errcode = 'P0001';
  end if;

  -- Haqdan foydalanish — savdodan OLDIN tekshiriladi (yetmasa hech narsa yozilmaydi)
  if v_credit > 0 then
    perform public._cust_credit_move(p_filial, v_cust, -v_credit, 'apply', p_op_key, 'sale', p_sale->>'inv',
                                     'Savdoda haqdan: ' || coalesce(p_sale->>'inv', ''), p_staff_id, p_staff_name);
  end if;

  v_res := public.sale_checkout_guarded(p_filial, p_op_key, p_sale, p_box_payments, p_staff_id, p_staff_name, p_role, p_loss_ack);
  v_local := v_res->>'localId';
  v_inv := v_res->>'inv';

  -- v24.5 audit (P1): haqdan ishlatiladigan summa savdoning kassadan to'lanmagan qismidan oshmasin. Avval chegarasiz edi:
  -- 100 000 so'mlik savdoga 1 000 000 so'm haq yuborilsa, haq to'liq yechilar, ortig'i hech qayerga yozilmay yo'qolardi.
  -- Xato bo'lsa butun tranzaksiya (haq yechimi va savdo) qaytariladi.
  if v_credit > 0 and v_credit_usd > greatest(0, coalesce((v_res->>'totalUsd')::numeric, 0) - v_cash_usd)
                                      + greatest(0.02, coalesce((v_res->>'totalUsd')::numeric, 0) * 0.005) then
    raise exception 'HAQ: ishlatiladigan haq (% $) savdoning to''lanmagan qismidan (% $) ko''p', round(v_credit_usd, 2),
      round(greatest(0, coalesce((v_res->>'totalUsd')::numeric, 0) - v_cash_usd), 2) using errcode = 'P0001';
  end if;

  if v_credit > 0 then
    -- O'chirishda kassadan faqat NAQD qism chiqishi uchun to'lov aralash (kassa qatorlari) ko'rinishida saqlanadi
    select coalesce(jsonb_agg(jsonb_build_object('boxId', (e->>'box_id')::int, 'amount', public._fw_num(e->>'amount_native'))), '[]'::jsonb)
      into v_rows from jsonb_array_elements(coalesce(p_box_payments, '[]'::jsonb)) e
     where coalesce(e->>'box_id', '') ~ '^[0-9]{1,9}$' and public._fw_num(e->>'amount_native') > 0;
    update public.sales set pay_type = 'mixed', box_id = null, mixed_rows = v_rows
     where filial = p_filial and local_id = v_local;
    perform set_config('fw.credit_move', '1', true);
    insert into public.sale_credit_uses (filial, sale_local_id, customer_local_id, credit_uzs) values (p_filial, v_local, v_cust, v_credit);
    perform set_config('fw.credit_move', '', true);
  end if;

  -- Ortiqcha to'lov: kassaga kirim → avval mijoz qarzi, qolgani — haq
  if p_overpay is not null and jsonb_typeof(p_overpay) = 'object' then
    if coalesce(p_overpay->>'box_id', '') !~ '^[0-9]{1,9}$' then raise exception 'SAVDO: ortiqcha to''lov kassasi noto''g''ri' using errcode = 'P0001'; end if;
    v_ov_box := (p_overpay->>'box_id')::int;
    v_ov_amt := round(public._fw_num(p_overpay->>'amount_native'), 2);
    if v_ov_amt > 0 then
      select currency into v_ov_cur from public.cashbox_balances where filial = p_filial and box_local_id = v_ov_box;
      if v_ov_cur is null then raise exception 'CASHBOX: kassa topilmadi (kassa %)', v_ov_box using errcode = 'P0001'; end if;
      v_ov_uzs := round(case when v_ov_cur = 'USD' then v_ov_amt * v_rate else v_ov_amt end, 2);
      if v_ov_uzs > greatest(100000000, coalesce((v_res->>'totalUsd')::numeric, 0) * v_rate * 10) then
        raise exception 'SAVDO: ortiqcha summa haddan katta — tekshiring' using errcode = 'P0001';
      end if;
      perform public._cb_move(p_filial, v_ov_box, v_ov_cur, 'in', v_ov_amt, 'cust_credit', p_op_key || ':ov', 'sale:' || v_local,
                              null, 'sale', v_inv, 'Ortiqcha to''lov (mijoz) — ' || coalesce(v_inv, ''), p_staff_id, p_staff_name);
      select coalesce(debt, 0) into v_debt from public.customer_balances where filial = p_filial and customer_local_id = v_cust;
      v_to_debt := least(coalesce(v_debt, 0), v_ov_uzs);
      if v_to_debt > 0 then
        perform public._cust_debt_move(p_filial, v_cust, -v_to_debt, 'strict', 'payment', p_op_key || ':ovd', p_op_key, 'sale', v_inv,
                                       'Ortiqcha to''lovdan qarz uzildi: ' || coalesce(v_inv, ''), p_staff_id, p_staff_name);
      end if;
      if v_ov_uzs - v_to_debt > 0.004 then
        perform public._cust_credit_move(p_filial, v_cust, v_ov_uzs - v_to_debt, 'overpay', p_op_key, 'sale', v_inv,
                                         'Ortiqcha to''lov: ' || coalesce(v_inv, ''), p_staff_id, p_staff_name);
      end if;
    end if;
  end if;

  if v_cust is not null then
    v_res := v_res || jsonb_build_object(
      'custDebtUzs', coalesce((select debt from public.customer_balances where filial = p_filial and customer_local_id = v_cust), 0),
      'custCreditUzs', coalesce((select credit_uzs from public.customer_credit_balances where filial = p_filial and customer_local_id = v_cust), 0));
  end if;
  if v_ov_box is not null then
    v_bal := coalesce(v_res->'balances', '{}'::jsonb) || public._cb_balances_map(p_filial, array[v_ov_box]);
    v_res := v_res || jsonb_build_object('balances', v_bal);
  end if;
  return v_res;
end;
$$;

-- ── 5. O'chirish (v34): haqdan to'langan qism mijozga qaytadi ─────────
create or replace function public.sale_void_v34(
  p_filial text, p_op_key text, p_sale_local_id text, p_batch_ids jsonb, p_meta jsonb,
  p_staff_id bigint, p_staff_name text, p_role text, p_can_others boolean default false)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  v_res jsonb;
  u public.sale_credit_uses;
begin
  v_res := public.sale_void_guarded(p_filial, p_op_key, p_sale_local_id, p_batch_ids, p_meta, p_staff_id, p_staff_name, p_role, p_can_others);
  select * into u from public.sale_credit_uses where filial = p_filial and sale_local_id = p_sale_local_id for update;
  if found and u.restored_at is null then
    perform public._cust_credit_move(p_filial, u.customer_local_id, u.credit_uzs, 'void_restore', p_op_key, 'sale', p_sale_local_id,
                                     'Savdo o''chirildi — haq qaytdi', p_staff_id, p_staff_name);
    perform set_config('fw.credit_move', '1', true);
    update public.sale_credit_uses set restored_at = now() where filial = p_filial and sale_local_id = p_sale_local_id;
    perform set_config('fw.credit_move', '', true);
    v_res := v_res || jsonb_build_object('creditRestoredUzs', u.credit_uzs, 'custId', u.customer_local_id,
      'custCreditUzs', (select credit_uzs from public.customer_credit_balances where filial = p_filial and customer_local_id = u.customer_local_id));
  end if;
  return v_res;
end;
$$;

-- ── 6. Funksiya huquqlari (faqat server) ───────────────────────────────
revoke all on function public._fw_credit_guard() from public, anon, authenticated;
revoke all on function public._cust_credit_move(text, bigint, numeric, text, text, text, text, text, bigint, text) from public, anon, authenticated;
revoke all on function public.sale_checkout_v34(text, text, jsonb, jsonb, bigint, text, text, boolean, jsonb, numeric) from public, anon, authenticated;
revoke all on function public.sale_void_v34(text, text, text, jsonb, jsonb, bigint, text, text, boolean) from public, anon, authenticated;
grant execute on function public.sale_checkout_v34(text, text, jsonb, jsonb, bigint, text, text, boolean, jsonb, numeric) to service_role;
grant execute on function public.sale_void_v34(text, text, text, jsonb, jsonb, bigint, text, text, boolean) to service_role;

comment on table public.customer_credit_balances is '34-migratsiya: mijoz haqi (ortiqcha to''lov, oldindan to''lov), so''m — qarzdan alohida';
comment on table public.customer_credit_ledger is '34-migratsiya: mijoz haqi jurnali (ortiqcha to''lov, savdoda ishlatish, o''chirishda qaytish). O''zgarmas';
comment on table public.sale_credit_uses is '34-migratsiya: savdoda haqdan foydalanish (o''chirilsa qaytariladi; bunday savdo tahrirlanmaydi)';
