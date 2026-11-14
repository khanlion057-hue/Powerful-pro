-- ════════════════════════════════════════════════════════════════════
-- 33-MIGRATSIYA (v24.4): TA'MINOTCHIGA ZAKLAD (OLDINDAN TO'LOV) — YUANDA, $ KASSADAN
-- Egasi tasdiqlagan qoida (2026-10-14):
--   • Xitoy ta'minotchisiga zaklad yuanda beriladi: masalan 10 000 ¥ + 0,6% xizmat, kurs 6,65 →
--     kassadan 1 512,78 $ chiqadi; ta'minotchiga faqat 10 000 ¥ (= 1 503,76 $) zaklad bo'lib yoziladi,
--     0,6% (9,02 $) — alohida XARAJAT («Pul o'tkazish xizmati»).
--   • Pul har doim $ kassadan chiqadi (filial $ kassasi yoki Bosh kassa $). Filiallarda ham.
--   • Zaklad ta'minotchining QARZIDAN ALOHIDA hisob: mavjud qarz qoidalari (qarz manfiy bo'lmaydi) o'zgarmaydi.
--     Tovar kelgach (kirim — qarz) administrator «Zakladdan yopish» bilan qarzni zakladdan kamaytiradi
--     (qarzdan ham, zakladdan ham ortiq emas) — bitta tranzaksiyada, to'lov tarixiga yoziladi.
-- Hammasi bitta tranzaksiyada (kassa, zaklad, xarajat, jurnal); takror so'rov ikki marta yozilmaydi.
-- Faqat qo'shadi; mavjud ma'lumot o'chirilmaydi/o'zgartirilmaydi; qayta ishga tushirish xavfsiz.
-- Talab: 24 (kassa), 27 (qarz jurnali, ledger_ops), 28 (Bosh kassa — ta'minotchi to'lovi va xarajat).
-- ════════════════════════════════════════════════════════════════════

-- ── 0. Bog'liqlik ──────────────────────────────────────────────────────
do $$ begin
  if to_regclass('public.ledger_ops') is null or not exists (select 1 from pg_proc where proname = '_supp_debt_move')
     or not exists (select 1 from pg_proc where proname = 'cashbox_apply_ops') or not exists (select 1 from pg_proc where proname = 'firma_supplier_pay') then
    raise exception '33-migratsiya: avval 24, 27 va 28-migratsiyalarni qo''llang';
  end if;
end $$;

-- ── 1. Zaklad qoldig'i (ta'minotchi bo'yicha, $) va o'zgarmas jurnal ──
create table if not exists public.supplier_advance_balances (
  filial text not null,
  supplier_local_id bigint not null,
  balance_usd numeric(20,4) not null default 0,
  updated_at timestamp with time zone not null default now(),
  primary key (filial, supplier_local_id),
  constraint supplier_advance_balances_nonneg check (balance_usd >= 0)
);
create table if not exists public.supplier_advance_ledger (
  id bigint generated always as identity primary key,
  created_at timestamp with time zone not null default now(),
  filial text not null,
  supplier_local_id bigint not null,
  supplier_name text,
  kind text not null,
  cny_amount numeric(20,2),
  fee_pct numeric(6,3),
  rate numeric(14,6),
  usd_amount numeric(20,4) not null,
  fee_usd numeric(20,4) not null default 0,
  source text,
  box_local_id integer,
  fk_entry_id bigint,
  balance_after numeric(20,4) not null,
  op_key text not null,
  note text,
  staff_id bigint,
  staff_name text,
  constraint supplier_advance_ledger_kind_chk check (kind in ('advance','apply')),
  constraint supplier_advance_ledger_amt_chk check (usd_amount > 0 and fee_usd >= 0 and balance_after >= 0),
  constraint supplier_advance_ledger_src_chk check (source is null or source in ('box','firma')),
  constraint supplier_advance_ledger_len_chk check (length(op_key) <= 160 and coalesce(length(note),0) <= 500
    and coalesce(length(supplier_name),0) <= 200 and coalesce(length(staff_name),0) <= 200 and length(filial) <= 40),
  constraint supplier_advance_ledger_op_uq unique (filial, op_key, kind)
);
create index if not exists idx_supp_adv_ledger_party on public.supplier_advance_ledger (filial, supplier_local_id, id desc);

-- Qoldiq faqat zaklad funksiyalari orqali o'zgaradi; jurnal o'zgarmas
create or replace function public._fw_adv_guard()
 returns trigger
 language plpgsql
 set search_path = ''
as $$
begin
  if tg_table_name = 'supplier_advance_balances' and coalesce(current_setting('fw.adv_move', true), '') = '1' and tg_op <> 'DELETE' then
    return new;
  end if;
  raise exception 'ZAKLAD: zaklad faqat zaklad amallari orqali o''zgaradi (jurnal o''zgarmas)' using errcode = 'P0001';
end;
$$;
create or replace trigger supplier_advance_balances_guard before insert or update or delete on public.supplier_advance_balances
  for each row execute function public._fw_adv_guard();
create or replace trigger supplier_advance_ledger_immutable before update or delete on public.supplier_advance_ledger
  for each row execute function public._fw_adv_guard();
create or replace trigger supplier_advance_ledger_no_truncate before truncate on public.supplier_advance_ledger
  for each statement execute function public._fw_adv_guard();

alter table public.supplier_advance_balances enable row level security;
alter table public.supplier_advance_ledger enable row level security;
revoke all on public.supplier_advance_balances, public.supplier_advance_ledger from anon, authenticated;
grant select, insert, update on public.supplier_advance_balances to service_role;
grant select, insert on public.supplier_advance_ledger to service_role;
grant usage on sequence public.supplier_advance_ledger_id_seq to service_role;

-- ── 2. Amal turlari kengaytiriladi ─────────────────────────────────────
alter table public.cashbox_ledger drop constraint if exists cashbox_ledger_kind_chk;
alter table public.cashbox_ledger add constraint cashbox_ledger_kind_chk check (op_kind in (
  'opening','sale','sale_fix','manual_in','manual_out','move','exchange','expense','expense_fix','salary',
  'cust_debt_pay','supp_pay','kirim_pay','dealer_pay','home_withdrawal','branch_to_firma','firma_to_branch','reset_zero',
  'branch_loan_in','branch_loan_repay','supp_advance'));
alter table public.ledger_ops drop constraint if exists ledger_ops_kind_chk;
alter table public.ledger_ops add constraint ledger_ops_kind_chk check (kind in ('sale','sale_return','sale_void','sale_edit','cust_set','supp_set',
  'batches_create','batch_edit','batch_delete','batch_arrive','revision','stock_out','firma_supp_pay',
  'writeoff','writeoff_cancel','b2b_ship','b2b_receive','b2b_ack','b2b_restock','supp_advance','supp_advance_apply'));

-- ── 3. ZAKLAD BERISH: ¥ + xizmat % → $ kassadan; ta'minotchiga ¥ (=$), xizmat — xarajat ──
create or replace function public.supplier_advance_pay(
  p_filial text, p_op_key text, p_supp bigint, p_supp_name text, p_source text, p_box integer, p_box_name text,
  p_cny numeric, p_fee_pct numeric, p_rate numeric, p_note text default null,
  p_staff_id bigint default null, p_staff_name text default null)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  v_prev jsonb;
  v_cny numeric;
  v_usd numeric;
  v_fee numeric;
  v_bal numeric;
  v_cb jsonb := null;
  v_fk public.firma_kassa_ledger;
  v_fk_id bigint := null;
  v_fk_bal numeric := null;
  v_ops jsonb;
  v_note text;
  v_res jsonb;
begin
  if coalesce(p_filial, '') = '' or p_supp is null or p_supp <= 0 then
    raise exception 'ZAKLAD: ta''minotchi noto''g''ri' using errcode = 'P0001';
  end if;
  if p_source is null or p_source not in ('box','firma') or (p_source = 'box' and (p_box is null or p_box < 0)) then
    raise exception 'ZAKLAD: pul manbai noto''g''ri' using errcode = 'P0001';
  end if;
  if p_cny is null or p_cny = 'NaN'::numeric or p_cny <= 0 or p_cny > 1000000000 then
    raise exception 'ZAKLAD: yuan summasi musbat bo''lishi kerak' using errcode = 'P0001';
  end if;
  if p_fee_pct is null or p_fee_pct = 'NaN'::numeric or p_fee_pct < 0 or p_fee_pct > 5 then
    raise exception 'ZAKLAD: xizmat foizi 0–5%% oralig''ida bo''lishi kerak' using errcode = 'P0001';
  end if;
  if p_rate is null or p_rate = 'NaN'::numeric or p_rate < 1 or p_rate > 50 then
    raise exception 'ZAKLAD: yuan kursi noto''g''ri (1 $ = ? ¥)' using errcode = 'P0001';
  end if;
  v_prev := public._ledger_op_replay(p_filial, p_op_key, 'supp_advance');
  if v_prev is not null then return v_prev; end if;

  v_cny := round(p_cny, 2);
  v_usd := round(v_cny / p_rate, 2);
  v_fee := round(v_cny * p_fee_pct / 100 / p_rate, 2);
  if v_usd <= 0 then raise exception 'ZAKLAD: summa juda kichik' using errcode = 'P0001'; end if;
  v_note := left(coalesce(nullif(btrim(p_note), ''), 'Zaklad') || ' — ' || v_cny || ' ¥, kurs ' || round(p_rate, 4)
                 || case when v_fee > 0 then ', xizmat ' || round(p_fee_pct, 3) || '%' else '' end, 500);

  if p_source = 'box' then
    v_ops := jsonb_build_array(jsonb_build_object('box', p_box, 'currency', 'USD', 'dir', 'out', 'amount', v_usd, 'box_name', left(p_box_name, 200),
                                                  'ref_type', 'supplier_advance', 'ref_id', p_supp::text, 'note', left('Zaklad: ' || coalesce(p_supp_name, '') || ' — ' || v_note, 500)));
    if v_fee > 0 then
      v_ops := v_ops || jsonb_build_array(jsonb_build_object('box', p_box, 'currency', 'USD', 'dir', 'out', 'amount', v_fee, 'box_name', left(p_box_name, 200),
                                                             'ref_type', 'expense', 'ref_id', 'transfer_fee', 'note', left('Pul oʻtkazish xizmati (zaklad: ' || coalesce(p_supp_name, '') || ')', 500)));
    end if;
    v_cb := public.cashbox_apply_ops(p_filial, 'sadv:' || p_op_key, 'supp_advance', v_ops, p_staff_id, p_staff_name);
  else
    v_fk := public._fk_cash_move('USD', 'out', v_usd, 'supplier_payment', 'supplier', p_supp::text, left(p_supp_name, 200),
                                 p_filial, 'supplier_advance', p_supp::text, v_note, p_staff_id, p_staff_name, 'sadv:' || p_filial || ':' || p_op_key);
    v_fk_id := v_fk.id; v_fk_bal := v_fk.balance_after;
    if v_fee > 0 then
      v_fk := public._fk_cash_move('USD', 'out', v_fee, 'expense', null, null, 'Pul oʻtkazish xizmati',
                                   p_filial, 'expense', 'transfer_fee', left('Zaklad xizmati: ' || coalesce(p_supp_name, ''), 500), p_staff_id, p_staff_name,
                                   'sadvf:' || p_filial || ':' || p_op_key);
      v_fk_bal := v_fk.balance_after;
    end if;
  end if;

  perform set_config('fw.adv_move', '1', true);
  insert into public.supplier_advance_balances (filial, supplier_local_id, balance_usd) values (p_filial, p_supp, v_usd)
    on conflict (filial, supplier_local_id) do update set balance_usd = public.supplier_advance_balances.balance_usd + excluded.balance_usd, updated_at = now()
    returning balance_usd into v_bal;
  perform set_config('fw.adv_move', '', true);
  insert into public.supplier_advance_ledger (filial, supplier_local_id, supplier_name, kind, cny_amount, fee_pct, rate, usd_amount, fee_usd, source,
                                              box_local_id, fk_entry_id, balance_after, op_key, note, staff_id, staff_name)
  values (p_filial, p_supp, left(p_supp_name, 200), 'advance', v_cny, round(p_fee_pct, 3), round(p_rate, 6), v_usd, v_fee, p_source,
          case when p_source = 'box' then p_box end, v_fk_id, v_bal, p_op_key, left(p_note, 500), p_staff_id, left(p_staff_name, 200));

  v_res := jsonb_build_object('ok', true, 'cny', v_cny, 'feePct', round(p_fee_pct, 3), 'rate', round(p_rate, 6), 'usd', v_usd, 'feeUsd', v_fee,
    'totalUsd', v_usd + v_fee, 'advanceUsd', v_bal, 'source', p_source,
    'balances', coalesce(v_cb->'balances', '{}'::jsonb), 'firmaBalance', v_fk_bal, 'fkEntryId', v_fk_id);
  return public._ledger_op_finish(p_filial, p_op_key, 'supp_advance', v_res, null, array[p_supp], null, p_staff_id, p_staff_name);
end;
$$;

-- ── 4. ZAKLADDAN YOPISH: ta'minotchi qarzi zakladdan kamayadi (qarzdan ham, zakladdan ham ortiq emas) ──
create or replace function public.supplier_advance_apply(
  p_filial text, p_op_key text, p_supp bigint, p_supp_name text, p_amount_usd numeric,
  p_staff_id bigint default null, p_staff_name text default null)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  v_prev jsonb;
  v_amt numeric;
  v_bal numeric;
  v_debt numeric;
  v_res jsonb;
begin
  if coalesce(p_filial, '') = '' or p_supp is null or p_supp <= 0 then
    raise exception 'ZAKLAD: ta''minotchi noto''g''ri' using errcode = 'P0001';
  end if;
  if p_amount_usd is null or p_amount_usd = 'NaN'::numeric or p_amount_usd <= 0 or p_amount_usd > 1000000000 then
    raise exception 'ZAKLAD: summa musbat bo''lishi kerak' using errcode = 'P0001';
  end if;
  v_prev := public._ledger_op_replay(p_filial, p_op_key, 'supp_advance_apply');
  if v_prev is not null then return v_prev; end if;

  v_amt := round(p_amount_usd, 2);
  select balance_usd into v_bal from public.supplier_advance_balances where filial = p_filial and supplier_local_id = p_supp for update;
  v_bal := coalesce(v_bal, 0);
  if v_amt > v_bal + 0.005 then
    raise exception 'ZAKLAD: summa (% $) zakladdan (% $) ko''p', v_amt, round(v_bal, 2) using errcode = 'P0001';
  end if;
  v_amt := least(v_amt, v_bal);
  -- qarzdan ortiq bo'lsa _supp_debt_move rad etadi (strict)
  v_debt := public._supp_debt_move(p_filial, p_supp, -v_amt, v_amt, 'strict', 'payment', 'sadp:' || p_op_key, p_op_key,
                                   'supplier_advance', null, left('Zakladdan: ' || coalesce(p_supp_name, ''), 500), p_staff_id, p_staff_name);
  perform set_config('fw.adv_move', '1', true);
  update public.supplier_advance_balances set balance_usd = round(balance_usd - v_amt, 4), updated_at = now()
   where filial = p_filial and supplier_local_id = p_supp returning balance_usd into v_bal;
  perform set_config('fw.adv_move', '', true);
  insert into public.supplier_advance_ledger (filial, supplier_local_id, supplier_name, kind, usd_amount, balance_after, op_key, note, staff_id, staff_name)
  values (p_filial, p_supp, left(p_supp_name, 200), 'apply', v_amt, v_bal, p_op_key, 'Qarz zakladdan yopildi', p_staff_id, left(p_staff_name, 200));
  insert into public.supplier_payments (filial, supplier_local_id, supplier_name, amount_usd, box_local_id, staff_id, staff_name, idem_key)
  values (p_filial, p_supp, left(p_supp_name, 200), v_amt, null, p_staff_id, left(p_staff_name, 200), 'sadp:' || p_op_key);

  v_res := jsonb_build_object('ok', true, 'appliedUsd', v_amt, 'advanceUsd', v_bal,
    'supplierDebt', (select debt from public.supplier_balances where filial = p_filial and supplier_local_id = p_supp),
    'supplierPaid', (select total_paid from public.supplier_balances where filial = p_filial and supplier_local_id = p_supp));
  return public._ledger_op_finish(p_filial, p_op_key, 'supp_advance_apply', v_res, null, array[p_supp], null, p_staff_id, p_staff_name);
end;
$$;

-- ── 5. Funksiya huquqlari (faqat server) ───────────────────────────────
revoke all on function public._fw_adv_guard() from public, anon, authenticated;
revoke all on function public.supplier_advance_pay(text, text, bigint, text, text, integer, text, numeric, numeric, numeric, text, bigint, text) from public, anon, authenticated;
revoke all on function public.supplier_advance_apply(text, text, bigint, text, numeric, bigint, text) from public, anon, authenticated;
grant execute on function public.supplier_advance_pay(text, text, bigint, text, text, integer, text, numeric, numeric, numeric, text, bigint, text) to service_role;
grant execute on function public.supplier_advance_apply(text, text, bigint, text, numeric, bigint, text) to service_role;

comment on table public.supplier_advance_balances is '33-migratsiya: ta''minotchiga berilgan zaklad (oldindan to''lov) qoldig''i, $ — qarzdan alohida';
comment on table public.supplier_advance_ledger is '33-migratsiya: zaklad jurnali (berish ¥ → $, xizmat — xarajat; qarzni zakladdan yopish). O''zgarmas';
