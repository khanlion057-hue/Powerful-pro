-- ════════════════════════════════════════════════════════════════════════════
-- 42-MIGRATSIYA (v25) — DILLERGA JO'NATMA: «SOTISH UCHUN» yoki «QARZGA»
-- ════════════════════════════════════════════════════════════════════════════
-- Egasi qarorlari (2026-11-08): hisob har jo'natma bo'yicha tanlanadi (filial bilan bir xil):
--   • «Sotish uchun» (avvalgidek): diller sotganda qarz = sotuv × (1 − xizmat %).
--   • «Qarzga» (yangi): qarz JO'NATILGANDA (son × narx); diller bu tovarni sotganda qarz qayta yozilmaydi.
-- Diller ombori mahsulot bo'yicha jamlanadi, shuning uchun «qarzga olingan» qism alohida yuritiladi:
--   dealer_stock.owned_qty / owned_usd. Sotuvda avval qarzga olingan qism sotilgan hisoblanadi;
--   qaytarishda avval «sotish uchun» qismi qaytadi, qarzga olingani qaytsa — qarzdan ayiriladi (o'rtacha narxda).
-- 35-migratsiyadagi funksiyalar O'ZGARMAYDI: *_v42 ularni chaqiradi va qo'shimcha yozuvlarni o'sha tranzaksiyada qiladi.
-- Reviziya (32): kamomad «sotuv» deb yoziladi — qarzga olingan qism uchun qarz qayta yozilmaydi (dealer_revision_decide_v42).
-- Diller portali (31/37): o'zi sotganda ham qarzga olingan qism uchun qarz qayta yozilmaydi (record_dealer_sale_v42).
-- Faqat QO'SHADI, takror ishga tushirish xavfsiz. Talab: 32, 35, 37.

do $$ begin
  if to_regprocedure('public.dealer_ship_atomic(text,text,bigint,jsonb,bigint,bigint,text)') is null
     or to_regprocedure('public.dealer_sale_record_atomic(text,text,bigint,jsonb,numeric,bigint,text)') is null
     or to_regprocedure('public.dealer_return_atomic(text,text,bigint,jsonb,bigint,text)') is null
     or to_regprocedure('public.dealer_revision_decide(bigint,boolean,bigint,text,text,text,text)') is null then
    raise exception '42-migratsiya: avval 32 va 35-migratsiyalar qo''llanishi kerak';
  end if;
end $$;

alter table public.dealer_stock add column if not exists owned_qty numeric not null default 0;
alter table public.dealer_stock add column if not exists owned_usd numeric not null default 0;

-- ── Jo'natish ───────────────────────────────────────────────────────────────
create or replace function public.dealer_ship_v42(
  p_filial text, p_op_key text, p_dealer_id bigint, p_items jsonb, p_order_id bigint, p_mode text default 'consign',
  p_staff_id bigint default null, p_staff_name text default null)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  v_res jsonb;
  e jsonb;
  v_qty numeric;
  v_price numeric;
  v_total numeric := 0;
  d public.dealers;
begin
  if exists (select 1 from public.ledger_ops where filial = p_filial and op_key = p_op_key) then
    return public.dealer_ship_atomic(p_filial, p_op_key, p_dealer_id, p_items, p_order_id, p_staff_id, p_staff_name);
  end if;
  if coalesce(p_mode, 'consign') not in ('consign', 'debt') then raise exception 'LEDGER: jo''natma turi noto''g''ri' using errcode = 'P0001'; end if;
  if p_mode = 'debt' and exists (select 1 from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i
                                  where public._fw_num(i->>'priceUsd') <= 0 or public._fw_num(i->>'priceUsd') > 1000000000) then
    raise exception 'LEDGER: «Qarzga» jo''natmada har mahsulot narxi kerak' using errcode = 'P0001';
  end if;
  v_res := public.dealer_ship_atomic(p_filial, p_op_key, p_dealer_id, p_items, p_order_id, p_staff_id, p_staff_name);
  if p_mode = 'debt' then
    for e in select * from jsonb_array_elements(p_items) loop
      v_qty := public._fw_num(e->>'qty'); v_price := public._fw_num(e->>'priceUsd');
      update public.dealer_stock set owned_qty = owned_qty + v_qty, owned_usd = round(owned_usd + v_qty * v_price, 4), updated_at = now()
       where dealer_id = p_dealer_id and pid = (e->>'pid')::bigint;
      v_total := v_total + v_qty * v_price;
    end loop;
    update public.dealers set debt_usd = round(debt_usd + v_total, 4), total_sold_usd = round(total_sold_usd + v_total, 4)
     where id = p_dealer_id returning * into d;
    v_res := v_res || jsonb_build_object('mode', 'debt', 'debtUsd', round(v_total, 4), 'dealer', public._dealer_json(d));
  end if;
  return v_res;
end;
$$;

-- ── Diller sotuvi: avval qarzga olingan qism (qarz qayta yozilmaydi) ──────────
create or replace function public.dealer_sale_v42(
  p_filial text, p_op_key text, p_dealer_id bigint, p_items jsonb, p_pct numeric,
  p_staff_id bigint default null, p_staff_name text default null)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  v_res jsonb;
  e jsonb;
  s public.dealer_stock;
  v_qty numeric;
  v_take numeric;
  v_refund numeric := 0;
  v_takes jsonb := '[]'::jsonb;
  d public.dealers;
begin
  if exists (select 1 from public.ledger_ops where filial = p_filial and op_key = p_op_key) then
    return public.dealer_sale_record_atomic(p_filial, p_op_key, p_dealer_id, p_items, p_pct, p_staff_id, p_staff_name);
  end if;
  for e in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    select * into s from public.dealer_stock where dealer_id = p_dealer_id and pid = public._fw_num(e->>'pid')::bigint for update;
    continue when not found or s.owned_qty <= 0;
    v_qty := public._fw_num(e->>'qty');
    v_take := least(s.owned_qty, v_qty);
    v_refund := v_refund + v_take * public._fw_num(e->>'priceUsd') * (1 - coalesce(p_pct, 0) / 100);
    v_takes := v_takes || jsonb_build_object('pid', s.pid, 'take', v_take, 'val', round(s.owned_usd * v_take / s.owned_qty, 4));
  end loop;
  v_res := public.dealer_sale_record_atomic(p_filial, p_op_key, p_dealer_id, p_items, p_pct, p_staff_id, p_staff_name);
  if v_refund > 0 then
    for e in select * from jsonb_array_elements(v_takes) loop
      update public.dealer_stock set owned_qty = greatest(0, owned_qty - public._fw_num(e->>'take')),
             owned_usd = greatest(0, round(owned_usd - public._fw_num(e->>'val'), 4)), updated_at = now()
       where dealer_id = p_dealer_id and pid = (e->>'pid')::bigint;
    end loop;
    update public.dealers set debt_usd = round(debt_usd - v_refund, 4), total_sold_usd = round(total_sold_usd - v_refund, 4)
     where id = p_dealer_id returning * into d;
    v_res := v_res || jsonb_build_object('owedUsd', round(public._fw_num(v_res->>'owedUsd') - v_refund, 4),
                                         'ownedSoldUsd', round(v_refund, 4), 'dealer', public._dealer_json(d));
  end if;
  return v_res;
end;
$$;

-- ── Qaytarish: avval «sotish uchun» qismi; qarzga olingani qaytsa — qarzdan ayiriladi ──
create or replace function public.dealer_return_v42(
  p_filial text, p_op_key text, p_dealer_id bigint, p_items jsonb,
  p_staff_id bigint default null, p_staff_name text default null)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  v_res jsonb;
  e jsonb;
  s public.dealer_stock;
  v_ret numeric;
  v_val numeric;
  v_back numeric := 0;
  v_takes jsonb := '[]'::jsonb;
  d public.dealers;
begin
  if exists (select 1 from public.ledger_ops where filial = p_filial and op_key = p_op_key) then
    return public.dealer_return_atomic(p_filial, p_op_key, p_dealer_id, p_items, p_staff_id, p_staff_name);
  end if;
  for e in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    select * into s from public.dealer_stock where dealer_id = p_dealer_id and pid = public._fw_num(e->>'pid')::bigint for update;
    continue when not found or s.owned_qty <= 0;
    v_ret := greatest(0, public._fw_num(e->>'qty') - greatest(0, s.qty - s.owned_qty));
    continue when v_ret <= 0;
    v_ret := least(v_ret, s.owned_qty);
    v_val := round(s.owned_usd * v_ret / s.owned_qty, 4);
    v_back := v_back + v_val;
    v_takes := v_takes || jsonb_build_object('pid', s.pid, 'take', v_ret, 'val', v_val);
  end loop;
  v_res := public.dealer_return_atomic(p_filial, p_op_key, p_dealer_id, p_items, p_staff_id, p_staff_name);
  if v_back > 0 then
    for e in select * from jsonb_array_elements(v_takes) loop
      update public.dealer_stock set owned_qty = greatest(0, owned_qty - public._fw_num(e->>'take')),
             owned_usd = greatest(0, round(owned_usd - public._fw_num(e->>'val'), 4)), updated_at = now()
       where dealer_id = p_dealer_id and pid = (e->>'pid')::bigint;
    end loop;
    update public.dealers set debt_usd = round(debt_usd - v_back, 4), total_sold_usd = round(total_sold_usd - v_back, 4)
     where id = p_dealer_id returning * into d;
    v_res := v_res || jsonb_build_object('ownedReturnUsd', round(v_back, 4), 'dealer', public._dealer_json(d));
  end if;
  return v_res;
end;
$$;

-- ── Reviziya: kamomad «sotuv» deb yoziladi — qarzga olingan qism uchun qarz qayta yozilmaydi ──
create or replace function public.dealer_revision_decide_v42(
  p_id bigint, p_approve boolean, p_actor_id bigint, p_actor_name text, p_actor_role text, p_note text, p_filial text)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  v_res jsonb;
  v_dealer bigint;
  e jsonb;
  s public.dealer_stock;
  v_take numeric;
  v_refund numeric := 0;
  v_val numeric;
begin
  v_res := public.dealer_revision_decide(p_id, p_approve, p_actor_id, p_actor_name, p_actor_role, p_note, p_filial);
  if v_res->>'status' is distinct from 'approved' or coalesce((v_res->>'replay')::boolean, false) then return v_res; end if;
  select dealer_id into v_dealer from public.fw_dealer_revisions where id = p_id;
  for e in select * from jsonb_array_elements(coalesce(v_res->'result'->'effects', '[]'::jsonb)) loop
    continue when e->>'kind' is distinct from 'sale';
    select * into s from public.dealer_stock where dealer_id = v_dealer and pid = (e->>'pid')::bigint for update;
    continue when not found or s.owned_qty <= 0;
    v_take := least(s.owned_qty, public._fw_num(e->>'qty'));
    v_val := round(s.owned_usd * v_take / s.owned_qty, 4);
    v_refund := v_refund + round(v_take * public._fw_num(e->>'priceUsd'), 2);
    update public.dealer_stock set owned_qty = greatest(0, owned_qty - v_take), owned_usd = greatest(0, round(owned_usd - v_val, 4)), updated_at = now()
     where id = s.id;
  end loop;
  -- qoldiq kamayib qarzga olingan qismdan pastga tushsa — moslash (ortiqcha «qarzga» belgisi qolmasin)
  update public.dealer_stock set owned_usd = round(owned_usd * greatest(qty, 0) / owned_qty, 4), owned_qty = greatest(qty, 0)
   where dealer_id = v_dealer and owned_qty > greatest(qty, 0);
  if v_refund > 0 then
    update public.dealers set debt_usd = round(debt_usd - v_refund, 4), total_sold_usd = round(total_sold_usd - v_refund, 4) where id = v_dealer;
    v_res := jsonb_set(v_res, '{result,debtDeltaUsd}', to_jsonb(round(public._fw_num(v_res->'result'->>'debtDeltaUsd') - v_refund, 2)));
    v_res := jsonb_set(v_res, '{result,ownedShortUsd}', to_jsonb(v_refund));
    -- reviziya qatori qaror qabul qilingach o'zgarmaydi (32-himoya) — tuzatish o'zgarmas audit tarixiga yoziladi
    insert into public.fw_audit_events (filial, entity, entity_id, action, actor_id, actor_name, actor_role, after, note, op_key)
    select r.filial, 'dealer_stock', r.dealer_id::text, 'revision_apply', p_actor_id, left(p_actor_name, 200), p_actor_role,
           jsonb_build_object('revisionId', r.id, 'ownedShortUsd', v_refund),
           left('Reviziya: kamomadning qarzga olingan qismi (' || v_refund || ' $) qarzga qayta yozilmadi', 1000), 'drevd42:' || r.id
      from public.fw_dealer_revisions r where r.id = p_id
    on conflict do nothing;
  end if;
  return v_res;
end;
$$;

-- ── Diller portali (record_dealer_sale, optom narxda qarz): qarzga olingan qism uchun qarz qayta yozilmaydi ──
create or replace function public.record_dealer_sale_v42(p_pid bigint, p_qty numeric, p_sell_usd numeric, p_sku text, p_name text,
  p_points numeric default 0, p_optim_price numeric default null)
 returns void
 language plpgsql
 security definer
 set search_path = ''
as $$
declare
  v_dealer_id bigint;
  v_filial text;
  s public.dealer_stock;
  v_optim numeric;
  v_take numeric := 0;
  v_val numeric;
begin
  select id, filial into v_dealer_id, v_filial from public.dealers where auth_user_id = auth.uid();
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
  if v_take > 0 then
    update public.dealer_stock set owned_qty = greatest(0, owned_qty - v_take), owned_usd = greatest(0, round(owned_usd - v_val, 4)), updated_at = now()
     where id = s.id;
    update public.dealers set debt_usd = round(debt_usd - v_take * v_optim, 4) where id = v_dealer_id;
  end if;
end;
$$;

revoke all on function public.dealer_ship_v42(text, text, bigint, jsonb, bigint, text, bigint, text) from public, anon, authenticated;
revoke all on function public.dealer_sale_v42(text, text, bigint, jsonb, numeric, bigint, text) from public, anon, authenticated;
revoke all on function public.dealer_return_v42(text, text, bigint, jsonb, bigint, text) from public, anon, authenticated;
grant execute on function public.dealer_ship_v42(text, text, bigint, jsonb, bigint, text, bigint, text) to service_role;
grant execute on function public.dealer_sale_v42(text, text, bigint, jsonb, numeric, bigint, text) to service_role;
grant execute on function public.dealer_return_v42(text, text, bigint, jsonb, bigint, text) to service_role;
revoke all on function public.dealer_revision_decide_v42(bigint, boolean, bigint, text, text, text, text) from public, anon, authenticated;
grant execute on function public.dealer_revision_decide_v42(bigint, boolean, bigint, text, text, text, text) to service_role;
revoke all on function public.record_dealer_sale_v42(bigint, numeric, numeric, text, text, numeric, numeric) from public, anon;
grant execute on function public.record_dealer_sale_v42(bigint, numeric, numeric, text, text, numeric, numeric) to authenticated, service_role;
