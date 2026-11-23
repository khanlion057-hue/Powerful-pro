-- ============================================================================
-- 57-MIGRATSIYA (v25.7) - ZIYON PAROLI SERVERDA
-- ============================================================================
-- Egasi qoidalari (2026-11-23):
--  * Admin va sotuvchi tannarxdan past sotsa - faqat administrator paroli bilan (ziyon paroli).
--  * Diller va filial berilgan (optom) narxdan 10% gacha arzon sota oladi; undan past - faqat ziyon paroli bilan.
-- Parol OCHIQ SAQLANMAYDI: bazada faqat SHA-256 xeshi (hex) - public.fw_settings.loss_pin_hash.
-- Standart qiymat - egasi bergan standart parolning xeshi (o'zgartirish: ilovada Sozlamalar -> Ziyon paroli).
--
--  1) public.fw_settings (key/value) - faqat server (service_role) va SECURITY DEFINER funksiyalar o'qiydi.
--  2) public.fw_loss_pin_fails - noto'g'ri urinishlar: 15 daqiqada 5 marta xato -> 15 daqiqa qulf (parolni topib bo'lmasin).
--  3) public._fw_loss_pin_try(xesh, kim) -> 'ok' | 'wrong' | 'locked'  (ichki)
--     public.fw_loss_pin_check(xesh, kim) -> jsonb  (Netlify: POS savdosi; faqat service_role)
--     public.fw_loss_pin_set(eski_xesh, yangi_xesh, kim) -> jsonb  (Netlify: Sozlamalar, faqat admin; faqat service_role)
--  4) record_dealer_sale_v42(..., p_loss_pin text) -> jsonb: 10% dan past bo'lsa parol tekshiriladi
--     (pgcrypto: encode(digest(p_loss_pin,'sha256'),'hex') = loss_pin_hash). Noto'g'ri parol - savdo YOZILMAYDI,
--     javob {ok:false, code:'LOSS_PIN_WRONG'} (urinish hisobga olinadi). Parol bilan o'tgan savdo - audit + adminga bildirishnoma.
--  5) record_dealer_sale: 10% chegarasi saqlanadi; faqat _v42 parolni tasdiqlagan tranzaksiyada (fw.loss_pin_ok) o'tkaziladi.
--  6) sale_checkout_guarded: zararli savdo endi ADMIN uchun ham tasdiqsiz o'tmaydi (Netlify tasdiqni faqat
--     ziyon paroli serverda tekshirilgandan keyin beradi); audit/bildirishnomada "ziyon paroli bilan".
-- Takror ishga tushirish xavfsiz. Faqat ASCII. Talab: 31, 42-migratsiyalar.

do $m$ begin
  if to_regprocedure('public.record_dealer_sale(bigint,numeric,numeric,text,text,numeric,numeric)') is null
     or to_regprocedure('public.sale_checkout_guarded(text,text,jsonb,jsonb,bigint,text,text,boolean)') is null then
    raise exception '57-migratsiya: avval 31 va 42-migratsiyalar qo''llanishi kerak';
  end if;
  if not exists (select 1 from pg_proc where proname = 'digest') then
    raise exception '57-migratsiya: pgcrypto kengaytmasi kerak (create extension pgcrypto with schema extensions)';
  end if;
end $m$;

-- -- 1) Himoyalangan sozlamalar --------------------------------------------
create table if not exists public.fw_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now(),
  updated_by text
);
do $m$ begin
  if not exists (select 1 from pg_constraint where conname = 'fw_settings_loss_pin_hex') then
    alter table public.fw_settings add constraint fw_settings_loss_pin_hex check (key <> 'loss_pin_hash' or value ~ '^[0-9a-f]{64}$');
  end if;
end $m$;
alter table public.fw_settings enable row level security;
revoke all on table public.fw_settings from public, anon, authenticated;
grant select, insert, update on table public.fw_settings to service_role;
-- v25.7: standart ziyon paroli xeshi (ochiq parol bu faylda yo'q)
insert into public.fw_settings (key, value, updated_by)
values ('loss_pin_hash', '53992ec21f2a2595759a1591d80836f9d1cf0c17ba7595cee7abe866e0943590', '57-migratsiya')
on conflict (key) do nothing;

-- v25.7: audit va bildirishnoma turlariga yangi qiymatlar (mavjud ro'yxat o'qiladi va to'ldiriladi - hech biri yo'qolmaydi)
create or replace function public._fw57_extend_check(p_table text, p_con text, p_col text, p_add text[])
 returns void
 language plpgsql
 set search_path = ''
as $$
declare d text; vals text[]; v text;
begin
  select pg_get_constraintdef(c.oid) into d from pg_constraint c where c.conname = p_con and c.conrelid = ('public.' || p_table)::regclass;
  if d is null then return; end if;
  select array_agg(m[1]) into vals from regexp_matches(d, '''([A-Za-z0-9_]+)''', 'g') m;
  if vals @> p_add then return; end if;
  foreach v in array p_add loop if not (v = any(vals)) then vals := vals || v; end if; end loop;
  execute format('alter table public.%I drop constraint %I', p_table, p_con);
  execute format('alter table public.%I add constraint %I check (%I in (%s))', p_table, p_con, p_col,
                 (select string_agg(quote_literal(x), ',') from unnest(vals) x));
end;
$$;
select public._fw57_extend_check('fw_audit_events', 'fw_audit_events_action_chk', 'action', array['loss_pin_sale', 'loss_pin_change']);
select public._fw57_extend_check('fw_notifications', 'fw_notifications_kind_chk', 'kind', array['dealer_loss_pin']);
drop function public._fw57_extend_check(text, text, text, text[]);

-- -- 2) Noto'g'ri urinishlar ----------------------------------------------
create table if not exists public.fw_loss_pin_fails (
  id bigserial primary key,
  actor text not null,
  at timestamptz not null default now()
);
create index if not exists fw_loss_pin_fails_actor_at on public.fw_loss_pin_fails (actor, at);
alter table public.fw_loss_pin_fails enable row level security;
revoke all on table public.fw_loss_pin_fails from public, anon, authenticated;
grant select, insert, delete on table public.fw_loss_pin_fails to service_role;

-- -- 3) Tekshirish va o'zgartirish ----------------------------------------
-- v25.7: xesh bilan solishtiradi; 15 daqiqada 5 xato - qulf. Natija: 'ok' | 'wrong' | 'locked'.
-- MUHIM: xatoda EXCEPTION ko'tarilmaydi (aks holda urinish yozuvi ham bekor bo'lardi) - chaqiruvchi javob qaytaradi.
create or replace function public._fw_loss_pin_try(p_hash text, p_actor text)
 returns text
 language plpgsql
 security definer
 set search_path = ''
as $$
declare
  v_actor text := left(coalesce(nullif(btrim(p_actor), ''), '?'), 120);
  v_fails integer;
  v_cur text;
begin
  select count(*) into v_fails from public.fw_loss_pin_fails where actor = v_actor and at > now() - interval '15 minutes';
  if v_fails >= 5 then return 'locked'; end if;
  select value into v_cur from public.fw_settings where key = 'loss_pin_hash';
  if coalesce(p_hash, '') ~ '^[0-9a-f]{64}$' and v_cur is not null and p_hash = v_cur then
    delete from public.fw_loss_pin_fails where actor = v_actor;
    return 'ok';
  end if;
  insert into public.fw_loss_pin_fails (actor) values (v_actor);
  delete from public.fw_loss_pin_fails where at < now() - interval '1 day';
  return 'wrong';
end;
$$;
revoke all on function public._fw_loss_pin_try(text, text) from public, anon, authenticated;

-- v25.7: POS savdosi (Netlify) - parolni Netlify xeshlaydi, bu yerga faqat xesh keladi
create or replace function public.fw_loss_pin_check(p_hash text, p_actor text)
 returns jsonb
 language plpgsql
 security definer
 set search_path = ''
as $$
declare v_st text;
begin
  -- bo'sh xesh - faqat "57 qo'llanganmi?" tekshiruvi: urinish sifatida sanalmaydi
  if coalesce(p_hash, '') = '' then return jsonb_build_object('ok', false, 'status', 'empty'); end if;
  v_st := public._fw_loss_pin_try(lower(p_hash), p_actor);
  return jsonb_build_object('ok', v_st = 'ok', 'status', v_st);
end;
$$;
revoke all on function public.fw_loss_pin_check(text, text) from public, anon, authenticated;
grant execute on function public.fw_loss_pin_check(text, text) to service_role;

-- v25.7: Sozlamalar -> Ziyon paroli (Netlify faqat administratorga ruxsat beradi). Eski parol xeshi tekshiriladi.
create or replace function public.fw_loss_pin_set(p_old_hash text, p_new_hash text, p_actor text)
 returns jsonb
 language plpgsql
 security definer
 set search_path = ''
as $$
declare v_st text;
begin
  if coalesce(lower(p_new_hash), '') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'status', 'bad_new');
  end if;
  v_st := public._fw_loss_pin_try(lower(coalesce(p_old_hash, '')), p_actor);
  if v_st <> 'ok' then return jsonb_build_object('ok', false, 'status', v_st); end if;
  insert into public.fw_settings (key, value, updated_at, updated_by)
  values ('loss_pin_hash', lower(p_new_hash), now(), left(p_actor, 120))
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;
  insert into public.fw_audit_events (filial, entity, entity_id, action, actor_name, actor_role, after, note)
  values ('baza', 'settings', 'loss_pin', 'loss_pin_change', left(p_actor, 200), 'admin', jsonb_build_object('changedAt', now()),
          'Ziyon paroli o''zgartirildi');
  return jsonb_build_object('ok', true, 'status', 'ok');
end;
$$;
revoke all on function public.fw_loss_pin_set(text, text, text) from public, anon, authenticated;
grant execute on function public.fw_loss_pin_set(text, text, text) to service_role;

-- -- 5) record_dealer_sale: 10% chegarasi - parol tasdiqlangan tranzaksiyada o'tkaziladi --
do $m$
declare d text; n text;
begin
  d := pg_get_functiondef('public.record_dealer_sale(bigint,numeric,numeric,text,text,numeric,numeric)'::regprocedure);
  if position('fw.loss_pin_ok' in d) > 0 then raise notice '57: record_dealer_sale - allaqachon'; return; end if;
  n := regexp_replace(d, 'if p_sell_usd < v_floor - 0\.005 then',
    'if p_sell_usd < v_floor - 0.005 and coalesce(current_setting(''fw.loss_pin_ok'', true), '''') <> ''1'' then   -- v25.7: ziyon paroli (_v42)');
  if n = d then raise exception '57: record_dealer_sale 10%% naqshi topilmadi'; end if;
  execute n;
end $m$;

-- -- 4) Diller RPC: ixtiyoriy p_loss_pin -----------------------------------
-- Qaytish turi void -> jsonb bo'lgani uchun eski 7 argumentli funksiya o'chirilib, 8 argumentli yaratiladi
-- (eski ilova p_loss_pin'siz chaqirsa ham ishlaydi - standart null).
drop function if exists public.record_dealer_sale_v42(bigint, numeric, numeric, text, text, numeric, numeric);
create or replace function public.record_dealer_sale_v42(p_pid bigint, p_qty numeric, p_sell_usd numeric, p_sku text, p_name text,
  p_points numeric default 0, p_optim_price numeric default null, p_loss_pin text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path = ''
as $$
declare
  v_dealer_id bigint;
  v_dealer_name text;
  v_filial text;
  s public.dealer_stock;
  v_optim numeric;
  v_optim0 numeric;
  v_avg numeric;
  v_floor numeric;
  v_take numeric := 0;
  v_val numeric;
  v_pin boolean := false;
  v_st text;
begin
  select id, name, filial into v_dealer_id, v_dealer_name, v_filial from public.dealers where auth_user_id = auth.uid();
  -- v25.7: optom narxidan 10% dan past - ziyon paroli (record_dealer_sale bilan aynan bir xil optom narx)
  if v_dealer_id is not null and p_sell_usd is not null and p_sell_usd >= 0 then
    select avg_cost_usd into v_avg from public.dealer_stock where dealer_id = v_dealer_id and pid = p_pid;
    select nullif(optim_price, 0) into v_optim0 from public.catalog_products where id = p_pid and filial = coalesce(v_filial, 'baza');
    v_optim0 := coalesce(v_optim0, nullif(v_avg, 0), p_sell_usd);
    v_floor := round(v_optim0 * 0.9, 2);
    if p_sell_usd < v_floor - 0.005 then
      if nullif(btrim(coalesce(p_loss_pin, '')), '') is null then
        raise exception 'Narx juda past: optom narxidan ko''pi bilan 10%% chegirma mumkin (eng kami % $, optom % $). Pastroq - faqat ziyon paroli bilan |LOSS_PIN_REQUIRED',
          v_floor, round(v_optim0, 2) using errcode = 'P0001';
      end if;
      v_st := public._fw_loss_pin_try(encode(extensions.digest(btrim(p_loss_pin), 'sha256'), 'hex'), 'dealer:' || v_dealer_id);
      if v_st <> 'ok' then
        -- hech narsa yozilmaydi; urinish hisobga olindi (exception emas - aks holda u ham bekor bo'lardi)
        return jsonb_build_object('ok', false, 'code', case when v_st = 'locked' then 'LOSS_PIN_LOCKED' else 'LOSS_PIN_WRONG' end,
          'error', case when v_st = 'locked' then 'Ziyon paroli 5 marta noto''g''ri - 15 daqiqa kuting' else 'Ziyon paroli noto''g''ri' end);
      end if;
      v_pin := true;
      perform set_config('fw.loss_pin_ok', '1', true);
    end if;
  end if;

  if v_dealer_id is not null then
    select * into s from public.dealer_stock where dealer_id = v_dealer_id and pid = p_pid for update;
    if found and s.owned_qty > 0 and p_qty > 0 then
      v_take := least(s.owned_qty, p_qty);
      v_val := round(s.owned_usd * v_take / s.owned_qty, 4);
      select nullif(optim_price, 0) into v_optim from public.catalog_products where id = p_pid and filial = coalesce(v_filial, 'baza');
      v_optim := coalesce(v_optim, nullif(s.avg_cost_usd, 0), p_sell_usd);   -- record_dealer_sale bilan aynan bir xil
    end if;
  end if;
  perform public.record_dealer_sale(p_pid, p_qty, p_sell_usd, p_sku, p_name, p_points, p_optim_price);
  perform set_config('fw.loss_pin_ok', '', true);
  if v_take > 0 then
    update public.dealer_stock set owned_qty = greatest(0, owned_qty - v_take), owned_usd = greatest(0, round(owned_usd - v_val, 4)), updated_at = now()
     where id = s.id;
    update public.dealers set debt_usd = round(debt_usd - v_take * v_optim, 4) where id = v_dealer_id;
  end if;
  -- v25.7: parol bilan o'tgan savdo - auditga va administratorga
  if v_pin then
    insert into public.fw_audit_events (filial, entity, entity_id, action, actor_id, actor_name, actor_role, after, note)
    values (coalesce(v_filial, 'baza'), 'dealer_sale', p_pid::text, 'loss_pin_sale', v_dealer_id, left(v_dealer_name, 200), 'dealer',
            jsonb_build_object('pid', p_pid, 'sku', left(p_sku, 80), 'name', left(p_name, 300), 'qty', p_qty, 'sellUsd', p_sell_usd,
                               'optimUsd', round(v_optim0, 2), 'floorUsd', v_floor, 'lossUsd', round((v_optim0 - p_sell_usd) * p_qty, 2), 'lossPin', true),
            left('Diller ziyon paroli bilan 10% dan arzon sotdi: ' || coalesce(p_name, '') || ' - ' || p_qty || ' dona x ' || p_sell_usd
                 || ' $ (optom ' || round(v_optim0, 2) || ' $)', 1000));
    insert into public.fw_notifications (filial, audience, kind, title, body, ref_type, ref_id, actor_name, actor_role)
    values (coalesce(v_filial, 'baza'), 'admin', 'dealer_loss_pin', left('Diller ziyon paroli bilan sotdi: ' || coalesce(v_dealer_name, ''), 200),
            left(coalesce(p_name, '') || ': ' || p_qty || ' dona x ' || p_sell_usd || ' $ (optom ' || round(v_optim0, 2) || ' $, eng kami '
                 || v_floor || ' $). Ziyon: ' || round((v_optim0 - p_sell_usd) * p_qty, 2) || ' $. Qarz optom narxda yozildi.', 1000),
            'dealer', v_dealer_id::text, left(v_dealer_name, 200), 'dealer');
  end if;
  return jsonb_build_object('ok', true, 'lossPin', v_pin);
end;
$$;
revoke all on function public.record_dealer_sale_v42(bigint, numeric, numeric, text, text, numeric, numeric, text) from public, anon;
grant execute on function public.record_dealer_sale_v42(bigint, numeric, numeric, text, text, numeric, numeric, text) to authenticated, service_role;

-- -- 6) POS: zararli savdo admin uchun ham tasdiqsiz o'tmaydi ---------------
do $m$
declare d text; n text;
begin
  d := pg_get_functiondef('public.sale_checkout_guarded(text,text,jsonb,jsonb,bigint,text,text,boolean)'::regprocedure);
  if position('v25.7' in d) > 0 then raise notice '57: sale_checkout_guarded - allaqachon'; return; end if;
  n := replace(d, 'if v_loss > 0.005 and p_role <> ''admin'' and not coalesce(p_loss_ack, false) then',
                  'if v_loss > 0.005 and not coalesce(p_loss_ack, false) then   -- v25.7: admin ham (tasdiq = ziyon paroli serverda tekshirilgan)');
  if n = d then raise exception '57: sale_checkout_guarded naqshi topilmadi'; end if;
  n := replace(n, '''confirmedAt'', now()', '''confirmedAt'', now(), ''lossPin'', true');
  n := replace(n, '''Zarar bilan savdo tasdiqlandi: ''', '''Zarar bilan savdo (ziyon paroli bilan): ''');
  n := replace(n, ''' tannarxdan past sotdi va tasdiqladi. Savdo ''', ''' tannarxdan past sotdi (ziyon paroli bilan). Savdo ''');
  execute n;
end $m$;

select '57: tayyor' as natija,
  (select count(*) from public.fw_settings where key = 'loss_pin_hash') as loss_pin_hash_bor,
  position('fw.loss_pin_ok' in pg_get_functiondef('public.record_dealer_sale(bigint,numeric,numeric,text,text,numeric,numeric)'::regprocedure)) > 0 as diller_chegara,
  to_regprocedure('public.record_dealer_sale_v42(bigint,numeric,numeric,text,text,numeric,numeric,text)') is not null as diller_v42_parol,
  position('v25.7' in pg_get_functiondef('public.sale_checkout_guarded(text,text,jsonb,jsonb,bigint,text,text,boolean)'::regprocedure)) > 0 as pos_admin_ham;
