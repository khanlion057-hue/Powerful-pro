-- ════════════════════════════════════════════════════════════════════════════
-- 43-MIGRATSIYA (v25) — FILIALNING BAZAGA QARZI: $ yoki SO'MDA
-- ════════════════════════════════════════════════════════════════════════════
-- Egasi qarori (2026-11-10): har filialga alohida sozlama — «Qarz valyutasi: $ / so'm»
--   (settings.branchCfg[filial].debtCur = 'UZS' | 'USD'; belgilanmagan — $, avvalgidek).
--   • So'mda: filial sotganda (yoki «qarzga» jo'natmani qabul qilganda) qarz $ dagi narx × o'sha kungi kurs
--     bo'yicha SO'MDA yoziladi — keyin kurs o'zgarsa ham o'zgarmaydi.
--   • So'mdagi qarz — branch_debt_cur jadvalida (app_data emas: brauzer saqlashi uni qayta yozolmaydi).
--   • To'lov: branch_debt_pay_uzs — so'm kassadan so'mma-so'm, $ kassadan bugungi kurs bo'yicha;
--     filial kassasi → Bosh kassa va qarz kamayishi BITTA tranzaksiyada, takroriy so'rov ikki marta yozilmaydi.
--   • Sozlama o'zgarsa — avvalgi qarz o'z valyutasida qoladi va alohida to'lanadi.
-- Faqat QO'SHADI (27 dagi _branch_debt_add kengaytiriladi), takror ishga tushirish xavfsiz. Talab: 24, 27, 28.

do $$ begin
  if to_regprocedure('public._branch_debt_add(text,numeric)') is null or to_regprocedure('public._fw_rate()') is null
     or not exists (select 1 from pg_proc where proname = '_cb_move') or not exists (select 1 from pg_proc where proname = '_fk_cash_move') then
    raise exception '43-migratsiya: avval 24, 27 va 28-migratsiyalar qo''llanishi kerak';
  end if;
end $$;

-- ── 1. Jadvallar ────────────────────────────────────────────────────────────
create table if not exists public.branch_debt_cur (
  filial text primary key,
  debt_uzs numeric(20,2) not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists public.branch_debt_cur_ledger (
  id bigint generated always as identity primary key,
  filial text not null,
  currency text not null default 'UZS',
  native_delta numeric(20,2) not null,
  native_after numeric(20,2) not null,
  rate numeric,
  usd_equiv numeric,
  op_kind text not null,                    -- sale | cancel | payment
  op_key text,
  note text,
  staff_id bigint, staff_name text,
  created_at timestamptz not null default now(),
  constraint branch_debt_cur_ledger_cur_chk check (currency in ('UZS')),
  constraint branch_debt_cur_ledger_kind_chk check (op_kind in ('sale','cancel','payment'))
);
create index if not exists branch_debt_cur_ledger_f_idx on public.branch_debt_cur_ledger (filial, created_at desc);
create unique index if not exists branch_debt_cur_ledger_pay_key on public.branch_debt_cur_ledger (filial, op_key) where op_kind = 'payment';
alter table public.branch_debt_cur enable row level security;
alter table public.branch_debt_cur_ledger enable row level security;
revoke all on public.branch_debt_cur, public.branch_debt_cur_ledger from public, anon, authenticated;

-- ── 2. Qarz oshishi / kamayishi (sotuv, bekor qilish) ───────────────────────
-- Filial qarzi so'mda (settings.branchCfg[filial].debtCur = 'UZS') — so'mda, o'sha kungi kursda qotadi;
-- aks holda avvalgidek $ da (app_data.branchDebt). Kurs topilmasa — $ da (qarz yo'qolmaydi).
create or replace function public._branch_debt_add(p_filial text, p_usd numeric)
 returns numeric
 language plpgsql
 set search_path = ''
as $$
declare
  v numeric;
  v_cur text;
  v_rate numeric;
  v_native numeric;
begin
  if p_usd is null or p_usd = 0 or p_filial = 'baza' then return null; end if;
  select upper(coalesce(data->'settings'->'branchCfg'->p_filial->>'debtCur', '')), nullif(public._fw_num(data->'settings'->>'usdUzs'), 0)
    into v_cur, v_rate from public.app_data where id = 'main';
  if v_cur = 'UZS' and coalesce(v_rate, 0) >= 100 then
    v_native := round(p_usd * v_rate, 2);
    insert into public.branch_debt_cur (filial, debt_uzs, updated_at) values (p_filial, v_native, now())
      on conflict (filial) do update set debt_uzs = round(public.branch_debt_cur.debt_uzs + excluded.debt_uzs, 2), updated_at = now()
      returning debt_uzs into v;
    insert into public.branch_debt_cur_ledger (filial, currency, native_delta, native_after, rate, usd_equiv, op_kind, note)
    values (p_filial, 'UZS', v_native, v, v_rate, round(p_usd, 4), case when p_usd > 0 then 'sale' else 'cancel' end,
            case when p_usd > 0 then 'Filial sotuvi' else 'Bekor qilindi' end);
    return v;
  end if;
  update public.app_data
     set data = jsonb_set(data, '{branchDebt}', coalesce(data->'branchDebt', '{}'::jsonb)
                || jsonb_build_object(p_filial, round(public._fw_num(data->'branchDebt'->>p_filial) + p_usd, 4))),
         updated_at = now()
   where id = 'main'
   returning public._fw_num(data->'branchDebt'->>p_filial) into v;
  return v;
end;
$$;

-- ── 3. So'mdagi qarz to'lovi: filial kassasi → Bosh kassa ───────────────────
-- p_currency — kassa valyutasi: 'UZS' (so'mma-so'm) yoki 'USD' (bugungi kurs bo'yicha so'mga o'giriladi).
create or replace function public.branch_debt_pay_uzs(
  p_filial text, p_box integer, p_currency text, p_amount numeric, p_key text,
  p_box_name text default null, p_note text default null, p_staff_id bigint default null, p_staff_name text default null)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  v_key text;
  v_cb public.cashbox_ledger;
  v_fk public.firma_kassa_ledger;
  v_amt numeric;
  v_rate numeric := null;
  v_native numeric;
  v_before numeric;
  v_after numeric;
  v_note text;
begin
  if coalesce(p_key, '') = '' or length(p_key) > 100 then
    raise exception 'CASHBOX: amal kaliti majburiy' using errcode = 'P0001';
  end if;
  if coalesce(p_filial, '') = '' or p_filial = 'baza' then
    raise exception 'CASHBOX: bu amal faqat filial uchun' using errcode = 'P0001';
  end if;
  if p_currency is null or p_currency not in ('USD','UZS') then
    raise exception 'CASHBOX: valyuta noto''g''ri' using errcode = 'P0001';
  end if;
  v_key := 'bft:' || p_key;
  perform pg_advisory_xact_lock(hashtext('cb_bft:' || p_filial || ':' || v_key));

  -- Takroriy so'rov — birinchi natija (qarz ikkinchi marta kamaymaydi)
  select * into v_cb from public.cashbox_ledger where filial = p_filial and op_key = v_key;
  if found then
    if v_cb.box_local_id <> p_box or v_cb.amount <> round(p_amount, 2) or v_cb.op_kind <> 'branch_to_firma' then
      raise exception 'CASHBOX: amal kaliti boshqa amal uchun ishlatilgan' using errcode = 'P0001';
    end if;
    select * into v_fk from public.firma_kassa_ledger where idem_key = v_key;
    return jsonb_build_object('ok', true, 'replay', true, 'filial', p_filial, 'box', v_cb.box_local_id, 'currency', v_cb.currency,
      'amount', v_cb.amount, 'debtCur', 'UZS',
      'branchBalance', (select balance from public.cashbox_balances where filial = p_filial and box_local_id = p_box),
      'firmaBalance', (select balance from public.firma_kassa_balance where currency = v_cb.currency),
      'debtUzsAfter', (select debt_uzs from public.branch_debt_cur where filial = p_filial),
      'debtAfter', (select public._fw_num(data->'branchDebt'->>p_filial) from public.app_data where id = 'main'),
      'branchEntryId', v_cb.id, 'firmaEntryId', v_fk.id);
  end if;

  if p_amount is null or p_amount = 'NaN'::numeric or p_amount <= 0 or p_amount > 1000000000000 then
    raise exception 'CASHBOX: summa musbat bo''lishi kerak' using errcode = 'P0001';
  end if;
  v_amt := round(p_amount, 2);

  -- Qulflash tartibi: filial qarzi → filial kassasi → Bosh kassa
  select debt_uzs into v_before from public.branch_debt_cur where filial = p_filial for update;
  v_before := round(coalesce(v_before, 0), 2);
  if v_before <= 0 then
    raise exception 'CASHBOX: filialning so''mdagi qarzi yo''q' using errcode = 'P0001';
  end if;
  if p_currency = 'UZS' then
    v_native := v_amt;
  else
    v_rate := public._fw_rate();
    v_native := round(v_amt * v_rate, 2);
  end if;
  if v_native > v_before + 1 then
    raise exception 'CASHBOX: to''lov (% so''m) qarzdan (% so''m) oshib ketdi', v_native, v_before using errcode = 'P0001';
  end if;
  v_native := least(v_native, v_before);
  v_after := round(v_before - v_native, 2);
  perform 1 from public.cashbox_balances where filial = p_filial and box_local_id = p_box for update;
  perform 1 from public.firma_kassa_balance where currency = p_currency for update;

  v_note := left(coalesce(p_note || ' · ', '') || 'Filial qarzi: ' || v_before || ' → ' || v_after || ' so''m'
            || case when v_rate is not null then ' (kurs ' || v_rate || ')' else '' end, 500);
  v_cb := public._cb_move(p_filial, p_box, p_currency, 'out', v_amt, 'branch_to_firma', v_key, v_key, p_box_name,
                          'branch_debt', p_filial, v_note, p_staff_id, p_staff_name);
  v_fk := public._fk_cash_move(p_currency, 'in', v_amt, 'branch_in', 'branch', p_filial, p_filial, p_filial,
                               'branch_debt', p_box::text, v_note, p_staff_id, p_staff_name, v_key);

  update public.branch_debt_cur set debt_uzs = v_after, updated_at = now() where filial = p_filial;
  insert into public.branch_debt_cur_ledger (filial, currency, native_delta, native_after, rate, usd_equiv, op_kind, op_key, note, staff_id, staff_name)
  values (p_filial, 'UZS', -v_native, v_after, v_rate, case when v_rate is not null then v_amt end, 'payment', v_key, v_note, p_staff_id, left(p_staff_name, 200));

  return jsonb_build_object('ok', true, 'replay', false, 'filial', p_filial, 'box', p_box, 'currency', p_currency, 'amount', v_amt,
    'debtCur', 'UZS', 'paidUzs', v_native, 'rate', v_rate,
    'branchBalance', (select balance from public.cashbox_balances where filial = p_filial and box_local_id = p_box),
    'firmaBalance', (select balance from public.firma_kassa_balance where currency = p_currency),
    'debtUzsBefore', v_before, 'debtUzsAfter', v_after,
    'debtAfter', (select public._fw_num(data->'branchDebt'->>p_filial) from public.app_data where id = 'main'),
    'branchEntryId', v_cb.id, 'firmaEntryId', v_fk.id);
end;
$$;

-- ── 4. Huquqlar (faqat server) ─────────────────────────────────────────────
revoke all on function public._branch_debt_add(text, numeric) from public, anon, authenticated;
revoke all on function public.branch_debt_pay_uzs(text, integer, text, numeric, text, text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.branch_debt_pay_uzs(text, integer, text, numeric, text, text, text, bigint, text) to service_role;
