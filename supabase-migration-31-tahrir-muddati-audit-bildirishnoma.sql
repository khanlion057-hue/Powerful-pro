-- ════════════════════════════════════════════════════════════════════
-- 31-MIGRATSIYA (v24): TAHRIRLASH MUDDATLARI, AUDIT TARIXI, BILDIRISHNOMALAR,
--                      ZARARLI SAVDO TASDIG'I, DILLER NARX CHEGARASI, DIRECT SALE RUXSATI
-- Egasi tasdiqlagan qoidalar (2026-10-11):
--   • Tahrirlash muddati — yozuv yaratilgan vaqtdan (SERVER vaqti): administrator 30 kun, sotuvchi 7 kun, diller 4 kun.
--     Sotuvchi faqat o'zi bajargan savdoni (yoki «savdo.edit» ruxsati bo'lsa — boshqalarnikini ham) tahrirlaydi.
--     Har tahrir/o'chirishda oldingi va yangi qiymat, kim, roli, vaqti — o'zgarmas audit jurnaliga yoziladi.
--   • Tannarxdan past (zarar bilan) savdo: sotuvchi O'ZI tasdiqlaydi (tannarx unga ko'rsatilmaydi); tasdiqsiz server rad etadi;
--     tasdiqlangan zararli savdo auditga yoziladi va administratorga bildirishnoma boradi.
--   • Bildirishnomalar — alohida jadval; 7 kundan eskilari «arxiv» (o'chirilmaydi). Moliyaviy yozuvlarga tegilmaydi.
--   • Diller: joriy optom narxidan ko'pi bilan 10% chegirma (server rad etadi); chegirmali savdo auditda.
--   • «savdo.direct_sale» ruxsati — omborda yo'q Direct Sale mahsulotini sotish. Hozir savdo qila oladigan rollarga
--     (oddiy «Xodim» — employee va diller bundan mustasno) beriladi — mavjud xatti-harakat buzilmaydi.
-- Faqat qo'shadi; mavjud ma'lumot o'chirilmaydi/o'zgartirilmaydi; qayta ishga tushirish xavfsiz.
-- Talab: 27-migratsiya (savdo hujjati serverda, ledger_ops) va 23-migratsiya (record_dealer_sale).
-- Yangi jadvallar faqat service_role (server funksiyalari) uchun — brauzer to'g'ridan-to'g'ri o'qimaydi/yozmaydi.
-- ════════════════════════════════════════════════════════════════════

-- ── 0. Bog'liqlik ──────────────────────────────────────────────────────
do $$ begin
  if to_regclass('public.ledger_ops') is null or not exists (select 1 from pg_proc where proname = 'sale_edit_atomic')
     or not exists (select 1 from pg_proc where proname = 'sale_checkout_atomic_v3') then
    raise exception '31-migratsiya: avval 27-migratsiyani qo''llang';
  end if;
end $$;

-- ── 1. AUDIT JURNALI (o'zgarmas) ───────────────────────────────────────
create table if not exists public.fw_audit_events (
  id bigint generated always as identity primary key,
  created_at timestamp with time zone not null default now(),
  filial text,
  entity text not null,
  entity_id text,
  action text not null,
  actor_id bigint,
  actor_name text,
  actor_role text not null default 'system',
  before jsonb,
  after jsonb,
  note text,
  op_key text,
  constraint fw_audit_events_role_chk check (actor_role in ('admin','seller','dealer','system')),
  constraint fw_audit_events_action_chk check (action in ('create','edit','void','loss_sale','price_discount','revision','announce')),
  constraint fw_audit_events_len_chk check (length(entity) <= 40 and coalesce(length(entity_id),0) <= 80 and coalesce(length(actor_name),0) <= 200
    and coalesce(length(note),0) <= 1000 and coalesce(length(op_key),0) <= 160 and coalesce(length(filial),0) <= 40)
);
create index if not exists idx_fw_audit_entity on public.fw_audit_events (entity, entity_id, created_at desc);
create index if not exists idx_fw_audit_filial on public.fw_audit_events (filial, created_at desc);
create unique index if not exists fw_audit_events_op_uq on public.fw_audit_events (op_key, action) where op_key is not null;

create or replace function public._fw_audit_immutable()
 returns trigger
 language plpgsql
 set search_path = ''
as $$
begin
  raise exception 'AUDIT: audit yozuvini o''zgartirib yoki o''chirib bo''lmaydi' using errcode = 'P0001';
end;
$$;
create or replace trigger fw_audit_events_immutable before update or delete on public.fw_audit_events
  for each row execute function public._fw_audit_immutable();
create or replace trigger fw_audit_events_no_truncate before truncate on public.fw_audit_events
  for each statement execute function public._fw_audit_immutable();

alter table public.fw_audit_events enable row level security;
revoke all on public.fw_audit_events from anon, authenticated;
grant select, insert on public.fw_audit_events to service_role;
grant usage on sequence public.fw_audit_events_id_seq to service_role;

-- ── 2. BILDIRISHNOMALAR (7 kundan keyin — arxiv; o'chirilmaydi) ───────
create table if not exists public.fw_notifications (
  id bigint generated always as identity primary key,
  created_at timestamp with time zone not null default now(),
  filial text,
  audience text not null,
  audience_id bigint,
  kind text not null,
  title text not null,
  body text,
  ref_type text,
  ref_id text,
  actor_name text,
  actor_role text,
  dedupe_key text,
  read_at timestamp with time zone,
  constraint fw_notifications_audience_chk check (audience in ('admin','seller','dealer')),
  constraint fw_notifications_kind_chk check (kind in ('sale_edit','sale_void','loss_sale','dealer_discount','dealer_revision','dealer_pay','announce_error','system')),
  constraint fw_notifications_len_chk check (length(title) <= 200 and coalesce(length(body),0) <= 1000 and coalesce(length(ref_id),0) <= 80
    and coalesce(length(dedupe_key),0) <= 200 and coalesce(length(actor_name),0) <= 200 and coalesce(length(filial),0) <= 40)
);
create index if not exists idx_fw_notif_aud on public.fw_notifications (audience, filial, created_at desc);
create unique index if not exists fw_notifications_dedupe_uq on public.fw_notifications (dedupe_key) where dedupe_key is not null;

-- Faqat «o'qildi» belgisi o'zgaradi; mazmun o'zgarmaydi va yozuv o'chirilmaydi (arxiv — yoshi bo'yicha)
create or replace function public._fw_notif_guard()
 returns trigger
 language plpgsql
 set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'NOTIF: bildirishnomani o''chirib bo''lmaydi (7 kundan keyin arxivga o''tadi)' using errcode = 'P0001';
  end if;
  if (to_jsonb(new) - 'read_at') <> (to_jsonb(old) - 'read_at') then
    raise exception 'NOTIF: faqat «o''qildi» belgisini o''zgartirish mumkin' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create or replace trigger fw_notifications_guard before update or delete on public.fw_notifications
  for each row execute function public._fw_notif_guard();

alter table public.fw_notifications enable row level security;
revoke all on public.fw_notifications from anon, authenticated;
grant select, insert on public.fw_notifications to service_role;
grant update (read_at) on public.fw_notifications to service_role;
grant usage on sequence public.fw_notifications_id_seq to service_role;

-- ── 3. TAHRIRLASH MUDDATI (server vaqti) ───────────────────────────────
create or replace function public.fw_edit_window_days(p_role text)
 returns integer
 language sql
 immutable
 set search_path = ''
as $$
  select case p_role when 'admin' then 30 when 'seller' then 7 when 'dealer' then 4 else 0 end;
$$;

-- Yozuv yaratilgan vaqt: bazadagi created_at va savdo sanasi (Toshkent kuni boshi) — qaysi biri ERTAROQ bo'lsa
-- (eski, ko'chirib yozilgan savdolar created_at'i migratsiya kuni bo'lib qolgani uchun — qat'iyroq tomon)
create or replace function public.fw_sale_created_at(s public.sales)
 returns timestamp with time zone
 language sql
 stable
 set search_path = ''
as $$
  select least(s.created_at, coalesce((s.sale_date::timestamp at time zone 'Asia/Tashkent'), s.created_at));
$$;

create or replace function public._fw_assert_sale_edit(s public.sales, p_role text, p_staff_id bigint, p_can_others boolean)
 returns void
 language plpgsql
 stable
 set search_path = ''
as $$
declare
  v_days integer := public.fw_edit_window_days(p_role);
  v_created timestamptz := public.fw_sale_created_at(s);
begin
  if p_role not in ('admin','seller') then
    raise exception 'TAHRIR: bu rol savdoni tahrirlay olmaydi' using errcode = 'P0001';
  end if;
  if s.is_transfer then
    raise exception 'TAHRIR: filiallararo o''tkazma savdosi bu yerda tahrirlanmaydi' using errcode = 'P0001';
  end if;
  if p_role = 'seller' and not coalesce(p_can_others, false) and s.staff_id is distinct from p_staff_id then
    raise exception 'TAHRIR: faqat o''zingiz bajargan savdoni tahrirlay olasiz' using errcode = 'P0001';
  end if;
  if now() > v_created + make_interval(days => v_days) then
    raise exception 'TAHRIR: tahrirlash muddati tugagan (% kun; savdo % da yaratilgan) — administrator tuzatish yozuvi bilan o''zgartiradi',
      v_days, to_char(v_created at time zone 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI') using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public._fw_sale_snapshot(p_id bigint)
 returns jsonb
 language sql
 stable
 set search_path = ''
as $$
  select public._fw_sale_json(s) || jsonb_build_object('staffId', s.staff_id, 'staffName', s.staff_name, 'createdAt', s.created_at,
    'editedAt', s.edited_at, 'voidedAt', s.voided_at, 'payType', s.pay_type, 'custName', s.cust_name)
  from public.sales s where s.id = p_id;
$$;

-- ── 4. SAVDONI TAHRIRLASH / O'CHIRISH — muddat + audit + bildirishnoma (bitta tranzaksiya) ──
create or replace function public.sale_edit_guarded(
  p_filial text, p_op_key text, p_sale_local_id text, p_mode text, p_payload jsonb,
  p_staff_id bigint, p_staff_name text, p_role text, p_can_others boolean default false)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  s public.sales;
  v_before jsonb;
  v_res jsonb;
begin
  -- Takroriy so'rov (tarmoq uzilgan) — avvalgi natija qaytadi, muddat qayta tekshirilmaydi
  if exists (select 1 from public.ledger_ops where filial = p_filial and op_key = p_op_key) then
    return public.sale_edit_atomic(p_filial, p_op_key, p_sale_local_id, p_mode, p_payload, p_staff_id, p_staff_name);
  end if;
  select * into s from public.sales where filial = p_filial and local_id = p_sale_local_id for update;
  if not found then
    raise exception 'LEDGER: savdo serverda topilmadi' using errcode = 'P0001';
  end if;
  perform public._fw_assert_sale_edit(s, p_role, p_staff_id, p_can_others);
  v_before := public._fw_sale_snapshot(s.id);
  v_res := public.sale_edit_atomic(p_filial, p_op_key, p_sale_local_id, p_mode, p_payload, p_staff_id, p_staff_name);
  insert into public.fw_audit_events (filial, entity, entity_id, action, actor_id, actor_name, actor_role, before, after, note, op_key)
  values (p_filial, 'sale', s.local_id, 'edit', p_staff_id, left(p_staff_name, 200), p_role, v_before, public._fw_sale_snapshot(s.id),
          left('Tahrir (' || p_mode || '): ' || s.inv, 1000), p_op_key)
  on conflict do nothing;
  if p_role <> 'admin' then
    insert into public.fw_notifications (filial, audience, kind, title, body, ref_type, ref_id, actor_name, actor_role, dedupe_key)
    values (p_filial, 'admin', 'sale_edit', left('Savdo tahrirlandi: ' || s.inv, 200),
            left(coalesce(p_staff_name, 'Xodim') || ' savdoni tahrirladi: ' || round(s.total_usd, 2) || ' $ → '
                 || coalesce(round((select total_usd from public.sales where id = s.id), 2)::text, '?') || ' $', 1000),
            'sale', s.local_id, left(p_staff_name, 200), p_role, 'sale_edit:' || p_filial || ':' || p_op_key)
    on conflict do nothing;
  elsif s.staff_id is not null and s.staff_id is distinct from p_staff_id then
    -- Administrator sotuvchining savdosini tuzatdi — sotuvchiga bildirishnoma
    insert into public.fw_notifications (filial, audience, audience_id, kind, title, body, ref_type, ref_id, actor_name, actor_role, dedupe_key)
    values (p_filial, 'seller', s.staff_id, 'sale_edit', left('Savdongiz tuzatildi: ' || s.inv, 200),
            left('Administrator (' || coalesce(p_staff_name, 'Admin') || ') savdoni tahrirladi.', 1000),
            'sale', s.local_id, left(p_staff_name, 200), p_role, 'sale_edit_s:' || p_filial || ':' || p_op_key)
    on conflict do nothing;
  end if;
  return v_res;
end;
$$;

create or replace function public.sale_void_guarded(
  p_filial text, p_op_key text, p_sale_local_id text, p_batch_ids jsonb, p_meta jsonb,
  p_staff_id bigint, p_staff_name text, p_role text, p_can_others boolean default false)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  s public.sales;
  v_before jsonb;
  v_res jsonb;
begin
  if exists (select 1 from public.ledger_ops where filial = p_filial and op_key = p_op_key) then
    return public.sale_void_atomic(p_filial, p_op_key, p_sale_local_id, p_batch_ids, p_meta, p_staff_id, p_staff_name);
  end if;
  select * into s from public.sales where filial = p_filial and local_id = p_sale_local_id for update;
  if not found then
    raise exception 'LEDGER: savdo serverda topilmadi' using errcode = 'P0001';
  end if;
  perform public._fw_assert_sale_edit(s, p_role, p_staff_id, p_can_others);
  v_before := public._fw_sale_snapshot(s.id);
  v_res := public.sale_void_atomic(p_filial, p_op_key, p_sale_local_id, p_batch_ids, p_meta, p_staff_id, p_staff_name);
  -- Savdo yozuvi bazada QOLADI (status='voided') — bu yerda faqat iz va kim/qachon
  insert into public.fw_audit_events (filial, entity, entity_id, action, actor_id, actor_name, actor_role, before, after, note, op_key)
  values (p_filial, 'sale', s.local_id, 'void', p_staff_id, left(p_staff_name, 200), p_role, v_before, public._fw_sale_snapshot(s.id),
          left('O''chirildi (teskari yozuv): ' || s.inv, 1000), p_op_key)
  on conflict do nothing;
  if p_role <> 'admin' then
    insert into public.fw_notifications (filial, audience, kind, title, body, ref_type, ref_id, actor_name, actor_role, dedupe_key)
    values (p_filial, 'admin', 'sale_void', left('Savdo oʻchirildi: ' || s.inv, 200),
            left(coalesce(p_staff_name, 'Xodim') || ' savdoni o''chirdi (' || round(s.total_usd, 2) || ' $). Ombor, kassa va qarz teskari qaytarildi.', 1000),
            'sale', s.local_id, left(p_staff_name, 200), p_role, 'sale_void:' || p_filial || ':' || p_op_key)
    on conflict do nothing;
  elsif s.staff_id is not null and s.staff_id is distinct from p_staff_id then
    insert into public.fw_notifications (filial, audience, audience_id, kind, title, body, ref_type, ref_id, actor_name, actor_role, dedupe_key)
    values (p_filial, 'seller', s.staff_id, 'sale_void', left('Savdongiz oʻchirildi: ' || s.inv, 200),
            left('Administrator (' || coalesce(p_staff_name, 'Admin') || ') savdoni o''chirdi (teskari yozuv bilan).', 1000),
            'sale', s.local_id, left(p_staff_name, 200), p_role, 'sale_void_s:' || p_filial || ':' || p_op_key)
    on conflict do nothing;
  end if;
  return v_res;
end;
$$;

-- ── 5. SAVDO YARATISH — zarar tasdig'i + audit (bitta tranzaksiya; rad etilsa hech narsa yozilmaydi) ──
create or replace function public.sale_checkout_guarded(
  p_filial text, p_op_key text, p_sale jsonb, p_box_payments jsonb,
  p_staff_id bigint, p_staff_name text, p_role text, p_loss_ack boolean default false)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  v_res jsonb;
  v_total numeric;
  v_cost numeric;
  v_loss numeric;
  v_items jsonb;
begin
  if p_role not in ('admin','seller') then
    raise exception 'SAVDO: rol noto''g''ri' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.ledger_ops where filial = p_filial and op_key = p_op_key) then
    return public.sale_checkout_atomic_v3(p_filial, p_op_key, p_sale, p_box_payments, p_staff_id, p_staff_name);
  end if;
  v_res := public.sale_checkout_atomic_v3(p_filial, p_op_key, p_sale, p_box_payments, p_staff_id, p_staff_name);
  v_total := coalesce((v_res->>'totalUsd')::numeric, 0);
  v_cost := coalesce((v_res->>'costUsd')::numeric, 0);
  v_loss := round(v_cost - v_total, 2);
  if v_loss > 0.005 and p_role <> 'admin' and not coalesce(p_loss_ack, false) then
    -- Tranzaksiya to'liq bekor bo'ladi (ombor, kassa, qarz, savdo hujjati — hech biri yozilmaydi)
    raise exception 'LOSS_ACK_REQUIRED: savdo tannarxdan past (zarar) — sotuvchi tasdig''i kerak' using errcode = 'P0001';
  end if;
  v_items := coalesce(v_res->'sale'->'items', '[]'::jsonb);
  insert into public.fw_audit_events (filial, entity, entity_id, action, actor_id, actor_name, actor_role, before, after, note, op_key)
  values (p_filial, 'sale', v_res->>'localId', 'create', p_staff_id, left(p_staff_name, 200), p_role, null, v_res->'sale',
          left('Savdo: ' || coalesce(v_res->>'inv', ''), 1000), p_op_key)
  on conflict do nothing;
  if v_loss > 0.005 then
    insert into public.fw_audit_events (filial, entity, entity_id, action, actor_id, actor_name, actor_role, before, after, note, op_key)
    values (p_filial, 'sale', v_res->>'localId', 'loss_sale', p_staff_id, left(p_staff_name, 200), p_role, null,
            jsonb_build_object('inv', v_res->>'inv', 'totalUsd', v_total, 'costUsd', v_cost, 'lossUsd', v_loss, 'items', v_items,
                               'confirmedBy', p_staff_name, 'confirmedRole', p_role, 'confirmedAt', now()),
            left('Zarar bilan savdo tasdiqlandi: ' || coalesce(v_res->>'inv', '') || ' — zarar ' || v_loss || ' $', 1000), p_op_key)
    on conflict do nothing;
    if p_role <> 'admin' then
      insert into public.fw_notifications (filial, audience, kind, title, body, ref_type, ref_id, actor_name, actor_role, dedupe_key)
      values (p_filial, 'admin', 'loss_sale', left('Zarar bilan savdo: ' || coalesce(v_res->>'inv', ''), 200),
              left(coalesce(p_staff_name, 'Xodim') || ' tannarxdan past sotdi va tasdiqladi. Savdo ' || round(v_total, 2) || ' $, tannarx '
                   || round(v_cost, 2) || ' $, zarar ' || v_loss || ' $.', 1000),
              'sale', v_res->>'localId', left(p_staff_name, 200), p_role, 'loss_sale:' || p_filial || ':' || p_op_key)
      on conflict do nothing;
    end if;
  end if;
  return v_res;
end;
$$;

-- ── 6. DILLER SAVDOSI — optom narxidan ko'pi bilan 10% chegirma (server) ──
-- 23-migratsiyadagi tana o'zgarmagan; faqat chegara tekshiruvi va chegirma auditi qo'shildi.
CREATE OR REPLACE FUNCTION public.record_dealer_sale(p_pid bigint, p_qty numeric, p_sell_usd numeric, p_sku text, p_name text, p_points numeric DEFAULT 0, p_optim_price numeric DEFAULT NULL::numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_dealer_id bigint;
  v_dealer_name text;
  v_filial text;
  v_stock numeric;
  v_avg numeric;
  v_optim numeric;
  v_floor numeric;
  v_pct numeric;
  v_settings jsonb;
  v_usd_val numeric;
  v_step numeric;
  v_points numeric := 0;
begin
  -- p_points va p_optim_price — orqaga moslik uchun qabul qilinadi, lekin ISHLATILMAYDI:
  -- diller o'z qarzi va ballarini o'zi belgilay olmasligi kerak (v10 audit J3).
  select id, name, filial into v_dealer_id, v_dealer_name, v_filial from dealers where auth_user_id = auth.uid();
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

  -- v24 (31-migratsiya): diller joriy optom narxidan ko'pi bilan 10% chegirma bera oladi
  v_floor := round(v_optim * 0.9, 2);
  if p_sell_usd < v_floor - 0.005 then
    raise exception 'Narx juda past: optom narxidan ko''pi bilan 10%% chegirma mumkin (eng kami % $, optom % $)', v_floor, round(v_optim, 2)
      using errcode = 'P0001';
  end if;

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

  -- Chegirma bilan (optom narxidan past) savdo — auditga va administratorga
  if p_sell_usd < v_optim - 0.005 then
    insert into public.fw_audit_events (filial, entity, entity_id, action, actor_id, actor_name, actor_role, after, note)
    values (coalesce(v_filial, 'baza'), 'dealer_sale', p_pid::text, 'price_discount', v_dealer_id, left(v_dealer_name, 200), 'dealer',
            jsonb_build_object('pid', p_pid, 'sku', left(p_sku, 80), 'name', left(p_name, 300), 'qty', p_qty, 'sellUsd', p_sell_usd,
                               'optimUsd', round(v_optim, 2), 'discountPct', round((1 - p_sell_usd / nullif(v_optim, 0)) * 100, 2)),
            left('Diller chegirma bilan sotdi: ' || coalesce(p_name, '') || ' — ' || p_qty || ' dona × ' || p_sell_usd || ' $ (optom ' || round(v_optim, 2) || ' $)', 1000));
    insert into public.fw_notifications (filial, audience, kind, title, body, ref_type, ref_id, actor_name, actor_role)
    values (coalesce(v_filial, 'baza'), 'admin', 'dealer_discount', left('Diller chegirma berdi: ' || coalesce(v_dealer_name, ''), 200),
            left(coalesce(p_name, '') || ': ' || p_qty || ' dona × ' || p_sell_usd || ' $ (optom ' || round(v_optim, 2) || ' $). Qarz optom narxda yozildi.', 1000),
            'dealer', v_dealer_id::text, left(v_dealer_name, 200), 'dealer');
  end if;
end;
$function$
;

-- ── 7. DIRECT SALE RUXSATI ─────────────────────────────────────────────
insert into public.permissions (key, module, label) values
  ('savdo.direct_sale', 'savdo', 'Direct Sale: omborda yoʻq mahsulotni taʼminotchi hisobidan sotish')
on conflict (key) do nothing;
insert into public.role_permissions (role_id, permission_id)
select distinct rp.role_id, pd.id
  from public.role_permissions rp
  join public.permissions pc on pc.id = rp.permission_id and pc.key = 'savdo.create'
  join public.roles r on r.id = rp.role_id and r.key not in ('employee', 'dealer')
  cross join public.permissions pd
 where pd.key = 'savdo.direct_sale'
on conflict (role_id, permission_id) do nothing;

-- ── 8. Funksiya huquqlari (faqat server) ───────────────────────────────
revoke all on function public._fw_audit_immutable() from public, anon, authenticated;
revoke all on function public._fw_notif_guard() from public, anon, authenticated;
revoke all on function public.fw_edit_window_days(text) from public, anon, authenticated;
revoke all on function public.fw_sale_created_at(public.sales) from public, anon, authenticated;
revoke all on function public._fw_assert_sale_edit(public.sales, text, bigint, boolean) from public, anon, authenticated;
revoke all on function public._fw_sale_snapshot(bigint) from public, anon, authenticated;
revoke all on function public.sale_edit_guarded(text, text, text, text, jsonb, bigint, text, text, boolean) from public, anon, authenticated;
revoke all on function public.sale_void_guarded(text, text, text, jsonb, jsonb, bigint, text, text, boolean) from public, anon, authenticated;
revoke all on function public.sale_checkout_guarded(text, text, jsonb, jsonb, bigint, text, text, boolean) from public, anon, authenticated;
grant execute on function public.fw_edit_window_days(text) to service_role;
grant execute on function public.fw_sale_created_at(public.sales) to service_role;
grant execute on function public.sale_edit_guarded(text, text, text, text, jsonb, bigint, text, text, boolean) to service_role;
grant execute on function public.sale_void_guarded(text, text, text, jsonb, jsonb, bigint, text, text, boolean) to service_role;
grant execute on function public.sale_checkout_guarded(text, text, jsonb, jsonb, bigint, text, text, boolean) to service_role;
-- record_dealer_sale (7 argumentli) — `create or replace` mavjud huquqlarni saqlaydi (23-migratsiyadagi kabi dillerga ochiq);
-- bu migratsiya brauzer rollariga hech qanday yangi huquq bermaydi.

comment on table public.fw_audit_events is '31-migratsiya: savdo yaratish/tahrir/o''chirish, zararli savdo, diller chegirmasi va reviziya — o''zgarmas audit tarixi';
comment on table public.fw_notifications is '31-migratsiya: bildirishnomalar (7 kundan keyin arxiv; o''chirilmaydi). Faqat read_at o''zgaradi';
