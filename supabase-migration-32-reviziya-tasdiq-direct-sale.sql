-- ════════════════════════════════════════════════════════════════════
-- 32-MIGRATSIYA (v24.2): DILLER REVIZIYASI — ADMIN TASDIG'I BILAN SOTUV/QAYTISH,
--                        ZARAR SUMMASI SOTUVCHIGA, «XODIM» ROLIGA DIRECT SALE
-- Egasi tasdiqlagan qoidalar (2026-10-13):
--   • Diller reviziyasi: diller sanaydi va yuboradi → administrator (yoki «dillerlar.manage») TASDIQLASA:
--       kamomad  → SOTUV  (diller omboridan chiqadi, qarz optom narxda oshadi — oddiy diller savdosi kabi);
--       ortiqcha → QAYTISH (avval sotilgan deb yozilgan tovar omborga qaytadi, qarz optom narxda kamayadi;
--                  qarzdan oshsa — dillerning haqi (manfiy qarz) bo'ladi). Hech qachon sotilmagan miqdordan ortig'i —
--                  «noma'lum ortiqcha»: faqat ombor qoldig'iga qo'shiladi, pulga ta'sir qilmaydi.
--     Rad etilsa — hech narsa o'zgarmaydi. Har qaror — o'zgarmas auditda, dillerga bildirishnoma.
--     Reviziyadan keyin qoldiq o'zgargan bo'lsa (yangi savdo/jo'natma) — tasdiq rad etiladi (qayta reviziya kerak).
--   • Tannarxdan past savdo: sotuvchiga ZARAR SUMMASI ko'rsatiladi (server javobida ham).
--   • «savdo.direct_sale» — oddiy «Xodim» (employee) roliga ham beriladi; diller — yo'q.
-- Faqat qo'shadi; mavjud yozuvlar o'chirilmaydi/o'zgartirilmaydi; qayta ishga tushirish xavfsiz.
-- Talab: 31-migratsiya.
-- ════════════════════════════════════════════════════════════════════

-- ── 0. Bog'liqlik ──────────────────────────────────────────────────────
do $$ begin
  if to_regclass('public.fw_audit_events') is null or to_regclass('public.fw_notifications') is null
     or not exists (select 1 from pg_proc where proname = 'sale_checkout_guarded') then
    raise exception '32-migratsiya: avval 31-migratsiyani qo''llang';
  end if;
end $$;

-- ── 1. Audit va bildirishnoma turlari kengaytiriladi ───────────────────
alter table public.fw_audit_events drop constraint if exists fw_audit_events_action_chk;
alter table public.fw_audit_events add constraint fw_audit_events_action_chk
  check (action in ('create','edit','void','loss_sale','price_discount','revision','announce','revision_apply','revision_reject'));
alter table public.fw_notifications drop constraint if exists fw_notifications_kind_chk;
alter table public.fw_notifications add constraint fw_notifications_kind_chk
  check (kind in ('sale_edit','sale_void','loss_sale','dealer_discount','dealer_revision','dealer_pay','announce_error','system','dealer_revision_result'));

-- ── 2. Diller savdolarida manba (reviziyadan kelgan yozuvlar ajralib turadi) ──
alter table public.dealer_sales add column if not exists source text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'dealer_sales_source_chk' and conrelid = 'public.dealer_sales'::regclass) then
    alter table public.dealer_sales add constraint dealer_sales_source_chk check (source is null or source in ('revision_short','revision_surplus'));
  end if;
end $$;
comment on column public.dealer_sales.source is '32-migratsiya: null — oddiy savdo; revision_short — reviziya kamomadi (sotuv); revision_surplus — reviziya ortiqchasi (qaytish, qty manfiy)';

-- ── 3. REVIZIYALAR (kutilmoqda → tasdiqlandi / rad etildi) ─────────────
create table if not exists public.fw_dealer_revisions (
  id bigint generated always as identity primary key,
  created_at timestamp with time zone not null default now(),
  filial text not null default 'baza',
  dealer_id bigint not null references public.dealers(id),
  dealer_name text,
  lines jsonb not null,
  reason text,
  shortage_qty numeric not null default 0,
  surplus_qty numeric not null default 0,
  status text not null default 'pending',
  op_key text not null,
  decided_at timestamp with time zone,
  decided_by_id bigint,
  decided_by_name text,
  decided_role text,
  decision_note text,
  result jsonb,
  constraint fw_dealer_revisions_status_chk check (status in ('pending','approved','rejected')),
  constraint fw_dealer_revisions_lines_chk check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) between 1 and 500),
  constraint fw_dealer_revisions_len_chk check (coalesce(length(reason),0) <= 500 and coalesce(length(decision_note),0) <= 500
    and coalesce(length(dealer_name),0) <= 200 and coalesce(length(decided_by_name),0) <= 200 and length(op_key) <= 160 and length(filial) <= 40),
  constraint fw_dealer_revisions_decided_chk check ((status = 'pending') = (decided_at is null))
);
create unique index if not exists fw_dealer_revisions_op_uq on public.fw_dealer_revisions (op_key);
create index if not exists idx_fw_dealer_revisions_st on public.fw_dealer_revisions (filial, status, created_at desc);
create index if not exists idx_fw_dealer_revisions_dealer on public.fw_dealer_revisions (dealer_id, created_at desc);

-- Faqat bir marta qaror: kutilmoqda → tasdiqlandi/rad etildi; mazmun o'zgarmaydi, o'chirilmaydi
create or replace function public._fw_rev_guard()
 returns trigger
 language plpgsql
 set search_path = ''
as $$
begin
  if tg_op <> 'UPDATE' then
    raise exception 'REVIZIYA: yozuvni o''chirib bo''lmaydi' using errcode = 'P0001';
  end if;
  if old.status <> 'pending' then
    raise exception 'REVIZIYA: qaror allaqachon qabul qilingan' using errcode = 'P0001';
  end if;
  if (to_jsonb(new) - array['status','decided_at','decided_by_id','decided_by_name','decided_role','decision_note','result'])
     <> (to_jsonb(old) - array['status','decided_at','decided_by_id','decided_by_name','decided_role','decision_note','result']) then
    raise exception 'REVIZIYA: sanoq natijasini o''zgartirib bo''lmaydi' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create or replace trigger fw_dealer_revisions_guard before update or delete on public.fw_dealer_revisions
  for each row execute function public._fw_rev_guard();
create or replace trigger fw_dealer_revisions_no_truncate before truncate on public.fw_dealer_revisions
  for each statement execute function public._fw_rev_guard();

alter table public.fw_dealer_revisions enable row level security;
revoke all on public.fw_dealer_revisions from anon, authenticated;
grant select, insert on public.fw_dealer_revisions to service_role;
grant update (status, decided_at, decided_by_id, decided_by_name, decided_role, decision_note, result) on public.fw_dealer_revisions to service_role;
grant usage on sequence public.fw_dealer_revisions_id_seq to service_role;

-- ── 4. QAROR — bitta tranzaksiyada (ombor, qarz, savdo yozuvi, audit, bildirishnoma) ──
create or replace function public.dealer_revision_decide(
  p_id bigint, p_approve boolean, p_actor_id bigint, p_actor_name text, p_actor_role text, p_note text, p_filial text)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  v_rev public.fw_dealer_revisions%rowtype;
  v_line jsonb;
  v_pid bigint;
  v_diff numeric;
  v_sys numeric;
  v_cur numeric;
  v_avg numeric;
  v_optim numeric;
  v_sold numeric;
  v_ret numeric;
  v_sku text;
  v_name text;
  v_debt numeric := 0;
  v_effects jsonb := '[]'::jsonb;
  v_result jsonb;
  v_note text := left(nullif(btrim(coalesce(p_note, '')), ''), 500);
begin
  if p_actor_role not in ('admin','seller') then
    raise exception 'REVIZIYA: rol noto''g''ri' using errcode = 'P0001';
  end if;
  select * into v_rev from public.fw_dealer_revisions where id = p_id for update;
  if not found then
    raise exception 'REVIZIYA: topilmadi' using errcode = 'P0001';
  end if;
  -- Filial chegarasi: p_filial null — barcha filial (administrator); aks holda faqat o'z filiali
  if p_filial is not null and v_rev.filial <> p_filial then
    raise exception 'REVIZIYA: boshqa filial' using errcode = 'P0001';
  end if;
  if v_rev.status <> 'pending' then
    -- takror bosish: avvalgi natija qaytariladi, hech narsa qayta yozilmaydi
    return jsonb_build_object('id', v_rev.id, 'status', v_rev.status, 'replay', true, 'result', v_rev.result);
  end if;

  if not coalesce(p_approve, false) then
    update public.fw_dealer_revisions set status = 'rejected', decided_at = now(), decided_by_id = p_actor_id,
      decided_by_name = left(p_actor_name, 200), decided_role = p_actor_role, decision_note = v_note,
      result = jsonb_build_object('applied', false)
     where id = p_id;
    insert into public.fw_audit_events (filial, entity, entity_id, action, actor_id, actor_name, actor_role, before, after, note, op_key)
    values (v_rev.filial, 'dealer_stock', v_rev.dealer_id::text, 'revision_reject', p_actor_id, left(p_actor_name, 200), p_actor_role,
            jsonb_build_object('revisionId', v_rev.id, 'lines', v_rev.lines), null,
            left('Reviziya rad etildi: ' || coalesce(v_rev.dealer_name, '') || coalesce(' — ' || v_note, ''), 1000), 'drevd:' || v_rev.id)
    on conflict do nothing;
    insert into public.fw_notifications (filial, audience, audience_id, kind, title, body, ref_type, ref_id, actor_name, actor_role, dedupe_key)
    values (v_rev.filial, 'dealer', v_rev.dealer_id, 'dealer_revision_result', 'Reviziya rad etildi',
            left('Administrator reviziyangizni rad etdi. Qoldiq va qarz oʻzgarmadi.' || coalesce(' Izoh: ' || v_note, ''), 1000),
            'dealer_revision', v_rev.id::text, left(p_actor_name, 200), p_actor_role, 'drevd:' || v_rev.id)
    on conflict do nothing;
    return jsonb_build_object('id', v_rev.id, 'status', 'rejected', 'replay', false);
  end if;

  -- Diller qatorini qulflash (qarz bir vaqtda boshqa amal bilan o'zgarmasin)
  perform 1 from public.dealers where id = v_rev.dealer_id for update;

  for v_line in select * from jsonb_array_elements(v_rev.lines) loop
    v_pid := (v_line->>'pid')::bigint;
    v_diff := coalesce((v_line->>'diff')::numeric, 0);
    v_sys := coalesce((v_line->>'system')::numeric, 0);
    if v_diff = 0 then continue; end if;
    select qty, avg_cost_usd, sku, name into v_cur, v_avg, v_sku, v_name
      from public.dealer_stock where dealer_id = v_rev.dealer_id and pid = v_pid for update;
    v_cur := coalesce(v_cur, 0);
    if abs(v_cur - v_sys) > 0.0005 then
      raise exception 'REV_STALE: % — reviziyadan keyin qoldiq oʻzgargan (reviziyada %, hozir %). Dillerdan qayta reviziya soʻrang',
        coalesce(v_line->>'name', v_pid::text), v_sys, v_cur using errcode = 'P0001';
    end if;
    select nullif(optim_price, 0) into v_optim from public.catalog_products where id = v_pid and filial = v_rev.filial;
    v_optim := round(coalesce(v_optim, nullif(v_avg, 0), 0), 2);
    v_sku := coalesce(v_sku, left(v_line->>'sku', 80));
    v_name := coalesce(v_name, left(v_line->>'name', 300));

    if v_diff < 0 then
      -- KAMOMAD → SOTUV (optom narxda; record_dealer_sale bilan bir xil qarz qoidasi)
      update public.dealer_stock set qty = qty + v_diff, updated_at = now() where dealer_id = v_rev.dealer_id and pid = v_pid;
      insert into public.dealer_sales (dealer_id, pid, sku, name, qty, sell_usd, total_usd, sale_date, source)
      values (v_rev.dealer_id, v_pid, v_sku, v_name, -v_diff, v_optim, round(-v_diff * v_optim, 2), current_date, 'revision_short');
      v_debt := v_debt + round(-v_diff * v_optim, 2);
      v_effects := v_effects || jsonb_build_array(jsonb_build_object('pid', v_pid, 'name', v_name, 'kind', 'sale', 'qty', -v_diff,
                     'priceUsd', v_optim, 'amountUsd', round(-v_diff * v_optim, 2)));
    else
      -- ORTIQCHA → QAYTISH: faqat avval sotilgan (sof) miqdorgacha; ortig'i — «noma'lum ortiqcha» (faqat qoldiq)
      select coalesce(sum(qty), 0) into v_sold from public.dealer_sales where dealer_id = v_rev.dealer_id and pid = v_pid;
      v_ret := greatest(0, least(v_diff, v_sold));
      insert into public.dealer_stock (dealer_id, pid, sku, name, qty, avg_cost_usd)
      values (v_rev.dealer_id, v_pid, v_sku, v_name, v_diff, coalesce(v_avg, 0))
      on conflict (dealer_id, pid) do update set qty = public.dealer_stock.qty + excluded.qty, updated_at = now();
      if v_ret > 0 then
        insert into public.dealer_sales (dealer_id, pid, sku, name, qty, sell_usd, total_usd, sale_date, source)
        values (v_rev.dealer_id, v_pid, v_sku, v_name, -v_ret, v_optim, -round(v_ret * v_optim, 2), current_date, 'revision_surplus');
        v_debt := v_debt - round(v_ret * v_optim, 2);
      end if;
      v_effects := v_effects || jsonb_build_array(jsonb_build_object('pid', v_pid, 'name', v_name, 'kind', 'return', 'qty', v_ret,
                     'unknownQty', v_diff - v_ret, 'priceUsd', v_optim, 'amountUsd', -round(v_ret * v_optim, 2)));
    end if;
  end loop;

  update public.dealers set debt_usd = debt_usd + v_debt, total_sold_usd = total_sold_usd + v_debt where id = v_rev.dealer_id;

  v_result := jsonb_build_object('applied', true, 'debtDeltaUsd', v_debt, 'effects', v_effects);
  update public.fw_dealer_revisions set status = 'approved', decided_at = now(), decided_by_id = p_actor_id,
    decided_by_name = left(p_actor_name, 200), decided_role = p_actor_role, decision_note = v_note, result = v_result
   where id = p_id;
  insert into public.fw_audit_events (filial, entity, entity_id, action, actor_id, actor_name, actor_role, before, after, note, op_key)
  values (v_rev.filial, 'dealer_stock', v_rev.dealer_id::text, 'revision_apply', p_actor_id, left(p_actor_name, 200), p_actor_role,
          jsonb_build_object('revisionId', v_rev.id, 'lines', v_rev.lines), v_result,
          left('Reviziya tasdiqlandi: ' || coalesce(v_rev.dealer_name, '') || ' — qarz ' || case when v_debt >= 0 then '+' else '' end || v_debt || ' $', 1000),
          'drevd:' || v_rev.id)
  on conflict do nothing;
  insert into public.fw_notifications (filial, audience, audience_id, kind, title, body, ref_type, ref_id, actor_name, actor_role, dedupe_key)
  values (v_rev.filial, 'dealer', v_rev.dealer_id, 'dealer_revision_result', 'Reviziya tasdiqlandi',
          left('Kamomad sotuv, ortiqcha qaytish sifatida yozildi. Qarzingiz ' || case when v_debt >= 0 then '+' else '−' end
               || abs(v_debt) || ' $ oʻzgardi.' || coalesce(' Izoh: ' || v_note, ''), 1000),
          'dealer_revision', v_rev.id::text, left(p_actor_name, 200), p_actor_role, 'drevd:' || v_rev.id)
  on conflict do nothing;
  return jsonb_build_object('id', v_rev.id, 'status', 'approved', 'replay', false, 'result', v_result);
end;
$$;

-- ── 5. SAVDO — zarar summasi xabarda (sotuvchiga ko'rsatiladi; egasi qarori 2026-10-13) ──
-- 31-migratsiyadagi tana o'zgarmagan; faqat LOSS_ACK_REQUIRED xabariga «|loss=<$>» qo'shildi.
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
    raise exception 'LOSS_ACK_REQUIRED: savdo tannarxdan past (zarar) — sotuvchi tasdig''i kerak |loss=%', v_loss using errcode = 'P0001';
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

-- ── 6. «Xodim» (employee) roliga Direct Sale (diller — yo'q) ───────────
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r cross join public.permissions p
 where r.key = 'employee' and p.key = 'savdo.direct_sale'
on conflict (role_id, permission_id) do nothing;

-- ── 7. Funksiya huquqlari (faqat server) ───────────────────────────────
revoke all on function public._fw_rev_guard() from public, anon, authenticated;
revoke all on function public.dealer_revision_decide(bigint, boolean, bigint, text, text, text, text) from public, anon, authenticated;
grant execute on function public.dealer_revision_decide(bigint, boolean, bigint, text, text, text, text) to service_role;
revoke all on function public.sale_checkout_guarded(text, text, jsonb, jsonb, bigint, text, text, boolean) from public, anon, authenticated;
grant execute on function public.sale_checkout_guarded(text, text, jsonb, jsonb, bigint, text, text, boolean) to service_role;

comment on table public.fw_dealer_revisions is '32-migratsiya: diller reviziyalari — kutilmoqda / tasdiqlandi (kamomad → sotuv, ortiqcha → qaytish) / rad etildi. O''chirilmaydi';
