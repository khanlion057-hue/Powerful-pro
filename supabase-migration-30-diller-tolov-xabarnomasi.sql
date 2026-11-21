-- ════════════════════════════════════════════════════════════════════
-- 30-MIGRATSIYA (v23.8): DILLER PUL YUBORADI — TO'LOV XABARNOMASI (egasi tasdiqlagan qoida, 2026-10-07)
--   • Diller o'z portalidan pul yuboradi: naqd so'm, karta (so'm) yoki naqd dollar.
--     So'm summa SHU KUNGI KURS (serverdagi settings.usdUzs) bo'yicha dollarga o'giriladi va kurs xabarnomada qotiriladi.
--   • Diller qarzi DARHOL kamayadi (dealer_payments + dealers, bitta tranzaksiya).
--   • Bosh kassa / kassirga bildirishnoma ("kutilmoqda"):
--       «Qabul qildim» — pul tanlangan filial kassasiga tushadi (odatda Diller kassasi; so'm — so'm kassasiga),
--                        kassa yopishda boshqa pul bilan birga Bosh kassaga topshiriladi;
--       «Rad etish»    — pul kelmagan: diller qarzi QAYTADI (teskari yozuv, tarix o'chirilmaydi).
-- Faqat qo'shadi; ma'lumot o'chirmaydi; qayta ishga tushirish xavfsiz. Talab: 24 va 25-migratsiyalar (kassa jurnali).
-- Jadval faqat service_role (server funksiyasi `dealer-pay`) uchun — brauzer to'g'ridan-to'g'ri o'qimaydi/yozmaydi.
-- ════════════════════════════════════════════════════════════════════

-- ── 0. Bog'liqlik ──────────────────────────────────────────────────────
do $$ begin
  if to_regclass('public.cashbox_ledger') is null or not exists (select 1 from pg_proc where proname = 'cashbox_apply_ops')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'dealer_payments' and column_name = 'idem_key') then
    raise exception '30-migratsiya: avval 24 va 25-migratsiyalarni qo''llang';
  end if;
end $$;

-- ── 1. Jadval ──────────────────────────────────────────────────────────
create table if not exists public.dealer_pay_notices (
  id bigint generated always as identity primary key,
  dealer_id bigint not null references public.dealers(id) on delete cascade,
  filial text not null default 'baza',
  pay_type text not null,
  currency text not null,
  amount numeric(18,2) not null,
  rate numeric(14,4) not null,
  amount_usd numeric(14,2) not null,
  note text,
  status text not null default 'pending',
  idem_key text not null,
  dealer_payment_id bigint,
  box_local_id integer,
  box_name text,
  decided_at timestamptz,
  decided_by_id bigint,
  decided_by_name text,
  reject_reason text,
  created_at timestamptz not null default now(),
  constraint dealer_pay_notices_type_chk check (pay_type in ('cash_uzs','card','cash_usd')),
  constraint dealer_pay_notices_cur_chk check (currency in ('UZS','USD') and (currency = 'USD') = (pay_type = 'cash_usd')),
  constraint dealer_pay_notices_amt_chk check (amount > 0 and amount_usd > 0 and rate > 0),
  constraint dealer_pay_notices_status_chk check (status in ('pending','accepted','rejected'))
);
create unique index if not exists dealer_pay_notices_idem_uq on public.dealer_pay_notices (idem_key);
create index if not exists dealer_pay_notices_filial_status_idx on public.dealer_pay_notices (filial, status, created_at desc);
create index if not exists dealer_pay_notices_dealer_idx on public.dealer_pay_notices (dealer_id, created_at desc);

alter table public.dealer_pay_notices enable row level security;
revoke all on public.dealer_pay_notices from public, anon, authenticated;
grant select, insert, update on public.dealer_pay_notices to service_role;

-- ── 2. Yuborish: qarz darhol kamayadi ─────────────────────────────────
-- p_rate — 1$ necha so'm (server settings.usdUzs dan oladi; diller kiritmaydi).
create or replace function public.dealer_pay_notice_create(
  p_dealer_id bigint, p_pay_type text, p_amount numeric, p_rate numeric, p_note text, p_idem text)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  v_d record;
  v_n public.dealer_pay_notices;
  v_cur text;
  v_amt numeric;
  v_usd numeric;
  v_pay bigint;
begin
  if coalesce(p_idem, '') !~ '^[A-Za-z0-9_-]{8,80}$' then raise exception 'DEALER_PAY: amal kaliti noto''g''ri' using errcode = 'P0001'; end if;
  if p_pay_type is null or p_pay_type not in ('cash_uzs','card','cash_usd') then raise exception 'DEALER_PAY: to''lov turi noto''g''ri' using errcode = 'P0001'; end if;
  if p_amount is null or p_amount = 'NaN'::numeric or p_amount <= 0 or p_amount > 100000000000 then raise exception 'DEALER_PAY: summa noto''g''ri' using errcode = 'P0001'; end if;
  if p_rate is null or p_rate = 'NaN'::numeric or p_rate < 100 or p_rate > 1000000 then raise exception 'DEALER_PAY: kurs belgilanmagan — administratorga murojaat qiling' using errcode = 'P0001'; end if;

  perform pg_advisory_xact_lock(hashtext('dpn:' || p_idem));
  select * into v_n from public.dealer_pay_notices where idem_key = p_idem;
  if found then
    if v_n.dealer_id <> p_dealer_id or v_n.pay_type <> p_pay_type or v_n.amount <> round(p_amount, 2) then
      raise exception 'DEALER_PAY: amal kaliti boshqa to''lov uchun ishlatilgan' using errcode = 'P0001';
    end if;
    select debt_usd, total_paid_usd into v_d from public.dealers where id = p_dealer_id;
    return jsonb_build_object('ok', true, 'replay', true, 'notice', to_jsonb(v_n), 'dealerDebtUsd', v_d.debt_usd, 'dealerTotalPaidUsd', v_d.total_paid_usd);
  end if;

  select id, name, filial, debt_usd, total_paid_usd into v_d from public.dealers where id = p_dealer_id for update;
  if not found then raise exception 'DEALER_PAY: diller topilmadi' using errcode = 'P0001'; end if;

  v_cur := case when p_pay_type = 'cash_usd' then 'USD' else 'UZS' end;
  v_amt := round(p_amount, 2);
  v_usd := case when v_cur = 'USD' then v_amt else round(v_amt / p_rate, 2) end;
  if v_usd <= 0 then raise exception 'DEALER_PAY: summa juda kichik' using errcode = 'P0001'; end if;
  if v_usd > coalesce(v_d.debt_usd, 0) + 0.01 then
    raise exception 'DEALER_PAY: to''lov (% $) qarzingizdan (% $) oshib ketdi', v_usd, coalesce(v_d.debt_usd, 0) using errcode = 'P0001';
  end if;

  insert into public.dealer_payments (dealer_id, amount_usd, note, idem_key)
  values (v_d.id, v_usd, left('Portal: ' || case p_pay_type when 'cash_uzs' then 'naqd so''m' when 'card' then 'karta' else 'naqd $' end
           || case when v_cur = 'UZS' then ' ' || v_amt::text || ' so''m, kurs ' || round(p_rate, 2)::text else '' end
           || coalesce(' — ' || nullif(btrim(p_note), ''), ''), 300), 'dpn:' || p_idem)
  returning id into v_pay;
  update public.dealers set debt_usd = greatest(round(coalesce(debt_usd, 0) - v_usd, 2), 0), total_paid_usd = coalesce(total_paid_usd, 0) + v_usd
   where id = v_d.id returning debt_usd, total_paid_usd into v_d.debt_usd, v_d.total_paid_usd;

  insert into public.dealer_pay_notices (dealer_id, filial, pay_type, currency, amount, rate, amount_usd, note, idem_key, dealer_payment_id)
  values (v_d.id, coalesce(v_d.filial, 'baza'), p_pay_type, v_cur, v_amt, round(p_rate, 4), v_usd, left(nullif(btrim(p_note), ''), 300), p_idem, v_pay)
  returning * into v_n;
  return jsonb_build_object('ok', true, 'replay', false, 'notice', to_jsonb(v_n), 'dealerDebtUsd', v_d.debt_usd, 'dealerTotalPaidUsd', v_d.total_paid_usd);
end;
$$;

-- ── 3. Qabul qildim: pul filial kassasiga (kassa jurnali bilan bitta tranzaksiyada) ──
create or replace function public.dealer_pay_notice_accept(
  p_id bigint, p_filial text, p_box integer, p_box_name text, p_staff_id bigint default null, p_staff_name text default null)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  v_n public.dealer_pay_notices;
  v_dname text;
  v_res jsonb;
begin
  select * into v_n from public.dealer_pay_notices where id = p_id for update;
  if not found then raise exception 'DEALER_PAY: xabarnoma topilmadi' using errcode = 'P0001'; end if;
  if v_n.filial <> p_filial then raise exception 'DEALER_PAY: xabarnoma boshqa filialga tegishli' using errcode = 'P0001'; end if;
  if v_n.status = 'rejected' then raise exception 'DEALER_PAY: xabarnoma rad etilgan' using errcode = 'P0001'; end if;
  if v_n.status = 'accepted' then
    if v_n.box_local_id is distinct from p_box then raise exception 'DEALER_PAY: xabarnoma boshqa kassaga qabul qilingan' using errcode = 'P0001'; end if;
    return jsonb_build_object('ok', true, 'replay', true, 'notice', to_jsonb(v_n), 'balances', public._cb_balances_map(p_filial, array[p_box]));
  end if;
  select name into v_dname from public.dealers where id = v_n.dealer_id;
  v_res := public.cashbox_apply_ops(p_filial, 'dpn:' || v_n.id, 'dealer_pay',
    jsonb_build_array(jsonb_build_object('box', p_box, 'dir', 'in', 'amount', v_n.amount, 'currency', v_n.currency, 'box_name', p_box_name,
      'ref_type', 'dealer', 'ref_id', v_n.dealer_id::text,
      'note', left('Diller to''lovi (portal) — ' || coalesce(v_dname, '') || case when v_n.currency = 'UZS' then ', kurs ' || round(v_n.rate, 2)::text else '' end, 500))),
    p_staff_id, p_staff_name);
  update public.dealer_pay_notices set status = 'accepted', box_local_id = p_box, box_name = left(p_box_name, 200),
         decided_at = now(), decided_by_id = p_staff_id, decided_by_name = left(p_staff_name, 200)
   where id = v_n.id returning * into v_n;
  return jsonb_build_object('ok', true, 'replay', false, 'notice', to_jsonb(v_n), 'balances', v_res->'balances');
end;
$$;

-- ── 4. Rad etish: pul kelmagan — diller qarzi qaytadi (teskari yozuv) ──
create or replace function public.dealer_pay_notice_reject(
  p_id bigint, p_filial text, p_reason text, p_staff_id bigint default null, p_staff_name text default null)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  v_n public.dealer_pay_notices;
  v_d record;
begin
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'DEALER_PAY: rad etish sababini yozing' using errcode = 'P0001'; end if;
  select * into v_n from public.dealer_pay_notices where id = p_id for update;
  if not found then raise exception 'DEALER_PAY: xabarnoma topilmadi' using errcode = 'P0001'; end if;
  if v_n.filial <> p_filial then raise exception 'DEALER_PAY: xabarnoma boshqa filialga tegishli' using errcode = 'P0001'; end if;
  if v_n.status = 'accepted' then raise exception 'DEALER_PAY: pul kassaga qabul qilingan — rad etib bo''lmaydi' using errcode = 'P0001'; end if;
  if v_n.status = 'rejected' then
    select debt_usd, total_paid_usd into v_d from public.dealers where id = v_n.dealer_id;
    return jsonb_build_object('ok', true, 'replay', true, 'notice', to_jsonb(v_n), 'dealerDebtUsd', v_d.debt_usd, 'dealerTotalPaidUsd', v_d.total_paid_usd);
  end if;
  select id, debt_usd, total_paid_usd into v_d from public.dealers where id = v_n.dealer_id for update;
  insert into public.dealer_payments (dealer_id, amount_usd, note, idem_key)
  values (v_n.dealer_id, -v_n.amount_usd, left('Rad etildi (pul kelmadi): ' || btrim(p_reason), 300), 'dpnr:' || v_n.id);
  update public.dealers set debt_usd = round(coalesce(debt_usd, 0) + v_n.amount_usd, 2), total_paid_usd = greatest(round(coalesce(total_paid_usd, 0) - v_n.amount_usd, 2), 0)
   where id = v_n.dealer_id returning debt_usd, total_paid_usd into v_d.debt_usd, v_d.total_paid_usd;
  update public.dealer_pay_notices set status = 'rejected', reject_reason = left(btrim(p_reason), 300),
         decided_at = now(), decided_by_id = p_staff_id, decided_by_name = left(p_staff_name, 200)
   where id = v_n.id returning * into v_n;
  return jsonb_build_object('ok', true, 'replay', false, 'notice', to_jsonb(v_n), 'dealerDebtUsd', v_d.debt_usd, 'dealerTotalPaidUsd', v_d.total_paid_usd);
end;
$$;

revoke all on function public.dealer_pay_notice_create(bigint, text, numeric, numeric, text, text) from public, anon, authenticated;
revoke all on function public.dealer_pay_notice_accept(bigint, text, integer, text, bigint, text) from public, anon, authenticated;
revoke all on function public.dealer_pay_notice_reject(bigint, text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.dealer_pay_notice_create(bigint, text, numeric, numeric, text, text) to service_role;
grant execute on function public.dealer_pay_notice_accept(bigint, text, integer, text, bigint, text) to service_role;
grant execute on function public.dealer_pay_notice_reject(bigint, text, text, bigint, text) to service_role;
