-- ════════════════════════════════════════════════════════════════════
-- Migratsiya 23 (v10, 2026-10-01) — FIRMA KASSA + diller savdosi xavfsizligi
-- Takroriy ishga tushirish xavfsiz. Mavjud ma'lumot o'chirilmaydi.
--
-- 1) FIRMA KASSA — korxona darajasidagi markaziy kassa (filial kassalaridan ALOHIDA).
--    • Hisob valyutasi FAQAT USD yoki UZS (CNY — faqat Kirim kiritish valyutasi,
--      hisob valyutasi bo'la olmaydi — CHECK cheklovi bilan).
--    • Qoldiq hech qachon manfiy bo'lmaydi (CHECK + funksiya ichida qulflab tekshirish).
--    • Har bir harakat — bitta tranzaksiyada: qoldiq qatori FOR UPDATE bilan
--      qulflanadi, yangilanadi va ledger'ga yoziladi (yarim holat yo'q).
--    • Idempotency: ledger.idem_key UNIQUE — bir xil so'rov ikki marta kelsa,
--      birinchi natija qaytadi, pul ikki marta harakatlanmaydi.
--    • Avans: berilgan (advance_give) − qaytarilgan (advance_repay); qaytarish
--      qolgan avansdan oshmaydi.
--    • Hamkor (ta'sischi) pul olishi — 'partner_withdrawal' (maosh EMAS).
--    • Kirish: faqat server (service_role) — brauzerdan to'g'ridan-to'g'ri yo'q.
-- 2) record_dealer_sale — qarz uchun optim narx va ballar endi SERVERDA
--    hisoblanadi (avval diller o'zi yuborardi: optim_price=0 → qarz yozilmasdi);
--    ombor qoldig'i qulflab o'qiladi (parallel savdo ikki marta sotolmaydi);
--    eski 5/6 argumentli variantlar diller uchun yopildi.
-- 3) Hamkor funksiyalari (partner_*_atomic) — anon/authenticated'dan EXECUTE
--    olib tashlandi (ularni faqat server chaqiradi; RLS baribir to'sardi —
--    bu qo'shimcha himoya qatlami).
-- 4) Ruxsatlar: firma_kassa.view, firma_kassa.transact.
-- ════════════════════════════════════════════════════════════════════

-- ── 1. FIRMA KASSA: jadvallar ──────────────────────────────────────────
create table if not exists public.firma_kassa_balance (
  currency text primary key,
  balance numeric(18,2) not null default 0,
  updated_at timestamp with time zone not null default now(),
  constraint firma_kassa_balance_currency_chk check (currency in ('USD','UZS')),
  constraint firma_kassa_balance_nonneg_chk check (balance >= 0)
);
insert into public.firma_kassa_balance (currency) values ('USD'), ('UZS') on conflict (currency) do nothing;

create table if not exists public.firma_kassa_ledger (
  id bigint generated always as identity primary key,
  created_at timestamp with time zone not null default now(),
  currency text not null,
  direction text not null,
  amount numeric(18,2) not null,
  balance_after numeric(18,2) not null,
  op_type text not null,
  counterparty_type text,
  counterparty_id text,
  counterparty_name text,
  filial text,
  ref_type text,
  ref_id text,
  note text,
  staff_id bigint,
  staff_name text,
  idem_key text,
  constraint firma_kassa_ledger_idem_key_key unique (idem_key),
  constraint firma_kassa_ledger_currency_chk check (currency in ('USD','UZS')),
  constraint firma_kassa_ledger_amount_chk check (amount > 0),
  constraint firma_kassa_ledger_balance_chk check (balance_after >= 0),
  constraint firma_kassa_ledger_cp_chk check (counterparty_type is null or counterparty_type in ('branch','supplier','staff','partner','dealer','other')),
  constraint firma_kassa_ledger_op_chk check (
    (direction = 'in'  and op_type in ('deposit','branch_in','advance_repay','adjust_in')) or
    (direction = 'out' and op_type in ('withdraw','branch_out','advance_give','kirim_payment','partner_withdrawal','adjust_out'))
  ),
  constraint firma_kassa_ledger_note_len check (coalesce(length(note),0) <= 500 and coalesce(length(counterparty_name),0) <= 200)
);
create index if not exists idx_fk_ledger_created on public.firma_kassa_ledger (created_at desc);
create index if not exists idx_fk_ledger_cp on public.firma_kassa_ledger (counterparty_type, counterparty_id, currency) where op_type in ('advance_give','advance_repay');

alter table public.firma_kassa_balance enable row level security;
alter table public.firma_kassa_ledger enable row level security;
revoke all on public.firma_kassa_balance, public.firma_kassa_ledger from anon, authenticated;
grant select, insert, update on public.firma_kassa_balance to service_role;
grant select, insert on public.firma_kassa_ledger to service_role;
grant usage on sequence public.firma_kassa_ledger_id_seq to service_role;

-- ── 1b. FIRMA KASSA: yagona yozish yo'li ───────────────────────────────
create or replace function public._fk_cash_move(
  p_currency text, p_direction text, p_amount numeric, p_op_type text,
  p_counterparty_type text default null, p_counterparty_id text default null, p_counterparty_name text default null,
  p_filial text default null, p_ref_type text default null, p_ref_id text default null, p_note text default null,
  p_staff_id bigint default null, p_staff_name text default null, p_idem_key text default null)
 returns public.firma_kassa_ledger
 language plpgsql
 set search_path = ''
as $$
declare
  v_amt numeric;
  v_bal numeric;
  v_row public.firma_kassa_ledger;
begin
  if p_idem_key is not null then
    select * into v_row from public.firma_kassa_ledger where idem_key = p_idem_key;
    if found then return v_row; end if;
  end if;
  if p_currency is null or p_currency not in ('USD','UZS') then
    raise exception 'FIRMA_KASSA: valyuta faqat USD yoki UZS bo''lishi mumkin (CNY hisob valyutasi emas)' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount = 'NaN'::numeric or p_amount <= 0 or p_amount > 10000000000000 then
    raise exception 'FIRMA_KASSA: summa musbat bo''lishi kerak' using errcode = 'P0001';
  end if;
  v_amt := round(p_amount, 2);
  if v_amt <= 0 then
    raise exception 'FIRMA_KASSA: summa juda kichik' using errcode = 'P0001';
  end if;

  select balance into v_bal from public.firma_kassa_balance where currency = p_currency for update;
  if not found then
    insert into public.firma_kassa_balance (currency, balance) values (p_currency, 0) on conflict (currency) do nothing;
    select balance into v_bal from public.firma_kassa_balance where currency = p_currency for update;
  end if;

  if p_direction = 'out' then
    if v_bal < v_amt then
      raise exception 'FIRMA_KASSA: mablag'' yetarli emas (qoldiq %, so''ralgan %)', v_bal, v_amt using errcode = 'P0001';
    end if;
    v_bal := v_bal - v_amt;
  elsif p_direction = 'in' then
    v_bal := v_bal + v_amt;
  else
    raise exception 'FIRMA_KASSA: yo''nalish noto''g''ri' using errcode = 'P0001';
  end if;

  update public.firma_kassa_balance set balance = v_bal, updated_at = now() where currency = p_currency;
  insert into public.firma_kassa_ledger
    (currency, direction, amount, balance_after, op_type, counterparty_type, counterparty_id, counterparty_name,
     filial, ref_type, ref_id, note, staff_id, staff_name, idem_key)
  values
    (p_currency, p_direction, v_amt, v_bal, p_op_type, p_counterparty_type, p_counterparty_id, left(p_counterparty_name, 200),
     p_filial, p_ref_type, p_ref_id, left(p_note, 500), p_staff_id, left(p_staff_name, 200), p_idem_key)
  returning * into v_row;
  return v_row;
exception when unique_violation then
  -- Parallel bir xil so'rov (idem_key) boshqa tranzaksiyada allaqachon yozildi
  select * into v_row from public.firma_kassa_ledger where idem_key = p_idem_key;
  if found then return v_row; end if;
  raise;
end;
$$;

create or replace function public.firma_kassa_advance_outstanding(p_currency text, p_counterparty_type text, p_counterparty_id text)
 returns numeric
 language sql
 stable
 set search_path = ''
as $$
  select coalesce(sum(case when op_type = 'advance_give' then amount else -amount end), 0)
  from public.firma_kassa_ledger
  where currency = p_currency and counterparty_type = p_counterparty_type and counterparty_id = p_counterparty_id
    and op_type in ('advance_give','advance_repay');
$$;

create or replace function public.firma_kassa_give_advance(
  p_currency text, p_amount numeric, p_counterparty_type text, p_counterparty_id text, p_counterparty_name text,
  p_note text default null, p_staff_id bigint default null, p_staff_name text default null, p_idem_key text default null)
 returns public.firma_kassa_ledger
 language plpgsql
 set search_path = ''
as $$
begin
  if p_counterparty_type is null or p_counterparty_type not in ('branch','supplier','staff','dealer','other') or coalesce(p_counterparty_id,'') = '' then
    raise exception 'FIRMA_KASSA: avans oluvchi ko''rsatilishi shart' using errcode = 'P0001';
  end if;
  return public._fk_cash_move(p_currency, 'out', p_amount, 'advance_give', p_counterparty_type, p_counterparty_id, p_counterparty_name,
                              null, null, null, p_note, p_staff_id, p_staff_name, p_idem_key);
end;
$$;

create or replace function public.firma_kassa_repay_advance(
  p_currency text, p_amount numeric, p_counterparty_type text, p_counterparty_id text, p_counterparty_name text,
  p_note text default null, p_staff_id bigint default null, p_staff_name text default null, p_idem_key text default null)
 returns public.firma_kassa_ledger
 language plpgsql
 set search_path = ''
as $$
declare
  v_row public.firma_kassa_ledger;
  v_out numeric;
begin
  if p_idem_key is not null then
    select * into v_row from public.firma_kassa_ledger where idem_key = p_idem_key;
    if found then return v_row; end if;
  end if;
  if p_counterparty_type is null or coalesce(p_counterparty_id,'') = '' then
    raise exception 'FIRMA_KASSA: avans egasi ko''rsatilishi shart' using errcode = 'P0001';
  end if;
  -- Bir xil avans egasi bo'yicha parallel qaytarishlar navbatga qo'yiladi
  perform pg_advisory_xact_lock(hashtext('fk_adv:' || p_currency || ':' || p_counterparty_type || ':' || p_counterparty_id));
  v_out := public.firma_kassa_advance_outstanding(p_currency, p_counterparty_type, p_counterparty_id);
  if p_amount is null or round(p_amount, 2) > v_out then
    raise exception 'FIRMA_KASSA: qaytarish summasi qolgan avansdan (%) oshib ketdi', v_out using errcode = 'P0001';
  end if;
  return public._fk_cash_move(p_currency, 'in', p_amount, 'advance_repay', p_counterparty_type, p_counterparty_id, p_counterparty_name,
                              null, null, null, p_note, p_staff_id, p_staff_name, p_idem_key);
end;
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
        where op_type in ('advance_give','advance_repay')
        group by currency, counterparty_type, counterparty_id
        having sum(case when op_type = 'advance_give' then amount else -amount end) > 0
      ) t), '[]'::jsonb)
  );
$$;

create or replace function public.kirim_firma_kassa_check(p_currency text, p_amount numeric)
 returns jsonb
 language plpgsql
 stable
 set search_path = ''
as $$
declare v_bal numeric;
begin
  if p_currency is null or p_currency not in ('USD','UZS') then
    return jsonb_build_object('ok', false, 'error', 'Valyuta faqat USD yoki UZS');
  end if;
  select balance into v_bal from public.firma_kassa_balance where currency = p_currency;
  v_bal := coalesce(v_bal, 0);
  return jsonb_build_object('ok', coalesce(p_amount, 0) > 0 and v_bal >= round(p_amount, 2), 'balance', v_bal,
                            'shortfall', greatest(round(coalesce(p_amount, 0), 2) - v_bal, 0));
end;
$$;

revoke all on function public._fk_cash_move(text, text, numeric, text, text, text, text, text, text, text, text, bigint, text, text) from public, anon, authenticated;
revoke all on function public.firma_kassa_advance_outstanding(text, text, text) from public, anon, authenticated;
revoke all on function public.firma_kassa_give_advance(text, numeric, text, text, text, text, bigint, text, text) from public, anon, authenticated;
revoke all on function public.firma_kassa_repay_advance(text, numeric, text, text, text, text, bigint, text, text) from public, anon, authenticated;
revoke all on function public.firma_kassa_get_balance() from public, anon, authenticated;
revoke all on function public.kirim_firma_kassa_check(text, numeric) from public, anon, authenticated;
grant execute on function public._fk_cash_move(text, text, numeric, text, text, text, text, text, text, text, text, bigint, text, text) to service_role;
grant execute on function public.firma_kassa_advance_outstanding(text, text, text) to service_role;
grant execute on function public.firma_kassa_give_advance(text, numeric, text, text, text, text, bigint, text, text) to service_role;
grant execute on function public.firma_kassa_repay_advance(text, numeric, text, text, text, text, bigint, text, text) to service_role;
grant execute on function public.firma_kassa_get_balance() to service_role;
grant execute on function public.kirim_firma_kassa_check(text, numeric) to service_role;

-- ── 2. DILLER SAVDOSI: narx va ball serverda, qoldiq qulflab ──────────
CREATE OR REPLACE FUNCTION public.record_dealer_sale(p_pid bigint, p_qty numeric, p_sell_usd numeric, p_sku text, p_name text, p_points numeric DEFAULT 0, p_optim_price numeric DEFAULT NULL::numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_dealer_id bigint;
  v_filial text;
  v_stock numeric;
  v_avg numeric;
  v_optim numeric;
  v_pct numeric;
  v_settings jsonb;
  v_usd_val numeric;
  v_step numeric;
  v_points numeric := 0;
begin
  -- p_points va p_optim_price — orqaga moslik uchun qabul qilinadi, lekin ISHLATILMAYDI:
  -- diller o'z qarzi va ballarini o'zi belgilay olmasligi kerak (v10 audit J3).
  select id, filial into v_dealer_id, v_filial from dealers where auth_user_id = auth.uid();
  if v_dealer_id is null then
    raise exception 'Diller topilmadi, avval tizimga kiring';
  end if;
  if p_qty is null or p_qty = 'NaN'::numeric or p_qty <= 0 or p_qty > 1000000 then
    raise exception 'Miqdor 0 dan katta bolishi kerak';
  end if;
  if p_sell_usd is null or p_sell_usd = 'NaN'::numeric or p_sell_usd < 0 or p_sell_usd > 1000000000 then
    raise exception 'Narx notogri';
  end if;

  select qty, avg_cost_usd into v_stock, v_avg from dealer_stock where dealer_id = v_dealer_id and pid = p_pid for update;
  if v_stock is null or v_stock < p_qty then
    raise exception 'Omborda yetarli mahsulot yoq (bor: %, soralgan: %)', coalesce(v_stock,0), p_qty;
  end if;

  select nullif(optim_price, 0), coalesce(point_pct, 0) into v_optim, v_pct
    from catalog_products where id = p_pid and filial = coalesce(v_filial, 'baza');
  v_optim := coalesce(v_optim, nullif(v_avg, 0), p_sell_usd);
  v_pct := coalesce(v_pct, 0);

  if v_pct > 0 then
    select data->'settings' into v_settings from app_data where id = 'main';
    v_usd_val := coalesce((v_settings->>'pointUsdValue')::numeric, 2);
    v_step := coalesce(nullif((v_settings->>'pointRoundStep')::numeric, 0), 1);
    if v_usd_val > 0 then
      v_points := round(((p_qty * p_sell_usd * v_pct / 100) / v_usd_val) / v_step) * v_step;
    end if;
  end if;

  update dealer_stock set qty = qty - p_qty, updated_at = now()
    where dealer_id = v_dealer_id and pid = p_pid;

  insert into dealer_sales (dealer_id, pid, sku, name, qty, sell_usd, total_usd, sale_date)
    values (v_dealer_id, p_pid, left(p_sku, 80), left(p_name, 300), p_qty, p_sell_usd, p_qty*p_sell_usd, current_date);

  update dealers set
    total_sold_usd = total_sold_usd + (p_qty*p_sell_usd),
    debt_usd        = debt_usd + (p_qty*v_optim),
    points          = points + v_points
  where id = v_dealer_id;
end;
$function$
;

-- Eski variantlar (optim narxsiz — diller narxni 0 qilib qarzdan qochishi mumkin edi):
-- o'chirilmaydi (loyiha qoidasi), faqat dillerlar uchun yopiladi.
-- (37-migratsiya bu ikki eski nusxani o'chiradi — 23 qayta ishga tushirilsa ham xato bermasin)
do $$ begin
  if to_regprocedure('public.record_dealer_sale(bigint,numeric,numeric,text,text)') is not null then
    revoke execute on function public.record_dealer_sale(bigint, numeric, numeric, text, text) from public, anon, authenticated;
  end if;
  if to_regprocedure('public.record_dealer_sale(bigint,numeric,numeric,text,text,numeric)') is not null then
    revoke execute on function public.record_dealer_sale(bigint, numeric, numeric, text, text, numeric) from public, anon, authenticated;
  end if;
end $$;

-- ── 3. HAMKOR FUNKSIYALARI: faqat server ──────────────────────────────
revoke execute on function public.partner_archive_atomic(bigint) from public, anon, authenticated;
revoke execute on function public.partner_ledger_add_atomic(bigint, text, numeric, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.partner_monthly_calc_atomic(text, date, date, numeric, numeric) from public, anon, authenticated;
revoke execute on function public.partner_undo_period_atomic(text, boolean) from public, anon, authenticated;
revoke execute on function public.partner_upsert_atomic(bigint, text, boolean, numeric, text, text, numeric, text, numeric) from public, anon, authenticated;
grant execute on function public.partner_archive_atomic(bigint) to service_role;
grant execute on function public.partner_ledger_add_atomic(bigint, text, numeric, text, text, text, text) to service_role;
grant execute on function public.partner_monthly_calc_atomic(text, date, date, numeric, numeric) to service_role;
grant execute on function public.partner_undo_period_atomic(text, boolean) to service_role;
grant execute on function public.partner_upsert_atomic(bigint, text, boolean, numeric, text, text, numeric, text, numeric) to service_role;

-- ── 4. RUXSATLAR ──────────────────────────────────────────────────────
insert into public.permissions (key, module, label) values
  ('firma_kassa.view', 'firma_kassa', 'Firma kassasini korish'),
  ('firma_kassa.transact', 'firma_kassa', 'Firma kassasida pul harakati (kirim/chiqim, avans, filial bilan)')
on conflict (key) do nothing;
insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id from public.roles r join public.permissions p on p.key in ('firma_kassa.view', 'firma_kassa.transact')
  where r.key in ('owner', 'administrator')
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id from public.roles r join public.permissions p on p.key = 'firma_kassa.view'
  where r.key = 'accountant'
on conflict do nothing;
