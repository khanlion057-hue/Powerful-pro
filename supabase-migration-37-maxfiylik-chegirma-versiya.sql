-- ════════════════════════════════════════════════════════════════════════════
-- 37-MIGRATSIYA (v24.8) — MAXFIYLIK, CHEGIRMA CHEGARASI, DIRECT SALE, YOZISHDA POYGA
-- ════════════════════════════════════════════════════════════════════════════
-- Egasi qarorlari (2026-10-17):
--   • Tannarx (partiya tannarxi, mahsulot cost/dsCostUsd) — faqat administrator va «tannarx.view»
--     ruxsati bor xodimga. Yangi ruxsat hech bir rolga avtomatik berilmaydi (egasi o'zi beradi).
--   • Chegirma chegarasi: admin bo'lmagan xodim sotuv narxini bazadagi narxdan ko'pi bilan
--     settings.maxDiscountPct (standart 10%) foizga tushira oladi. Asos narx — savdo rejimiga qarab:
--     chakana savdoda chakana narx, optom savdoda optom narx (tannarx × (1 + ustama%)).
--   • Direct Sale: mahsulotga ta'minotchi va narx oldindan belgilanmagan bo'lsa — admin bo'lmasa rad;
--     belgilangan bo'lsa — ta'minotchi va narx faqat mahsulotdagidek (xodim o'zgartira olmaydi).
--   • app_data / app_data_branches — «version» ustuni: har yozuvda +1 (trigger). Server eski versiya
--     bilan yozmoqchi bo'lsa — FW_VERSION_CONFLICT (funksiya 409 qaytaradi, brauzer yangilab qayta urinadi).
--   • record_dealer_sale ning eski 5 va 6 argumentli nusxalari o'chiriladi (23-migratsiyadan beri
--     hech kimga ruxsat yo'q, ilova faqat 7 argumentlisini chaqiradi).
-- Faqat QO'SHADI (ustun, trigger, funksiyalar, ruxsat). Takror ishga tushirish xavfsiz.
-- 34 dan KEYIN (sale_checkout_v34 kerak). Barcha yangi funksiyalar — faqat server (service_role).
-- Production (2026-10-17): Supabase MCP orqali ikki qismda — «v248_37a» (5-bo'limdan tashqari hammasi) qo'llandi;
-- 5-bo'lim (eski overloadlarni o'chirish) MCP tasdiqsiz bajarmadi — SQL Editor'da alohida bajarilishi mumkin (zararsiz: 23 dan beri huquqsiz).

do $$ begin
  if to_regprocedure('public.sale_checkout_v34(text,text,jsonb,jsonb,bigint,text,text,boolean,jsonb,numeric)') is null
     or to_regprocedure('public._fw_num(text)') is null then
    raise exception '37-migratsiya: avval 27 va 34-migratsiyalar qo''llanishi kerak';
  end if;
end $$;

-- ── 1. Versiya ustuni va avtomatik oshirish ─────────────────────────────────
alter table public.app_data add column if not exists version bigint not null default 0;
alter table public.app_data_branches add column if not exists version bigint not null default 0;

create or replace function public._fw_bump_version()
 returns trigger
 language plpgsql
 set search_path = ''
as $$
begin
  new.version := coalesce(old.version, 0) + 1;
  return new;
end;
$$;

-- app_data: faqat branchDebt o'zgargan yozuv (filial sotuvi — _branch_debt_add) versiyani oshirmaydi —
-- aks holda har sotuvdan keyin admin saqlashi keraksiz 409 olardi (branchDebt'ni server baribir bazadagidek saqlaydi)
create or replace function public._fw_bump_version_main()
 returns trigger
 language plpgsql
 set search_path = ''
as $$
begin
  if (new.data - 'branchDebt') is distinct from (old.data - 'branchDebt') then
    new.version := coalesce(old.version, 0) + 1;
  else
    new.version := coalesce(old.version, 0);
  end if;
  return new;
end;
$$;

create or replace trigger fw_app_data_version before update on public.app_data
  for each row execute function public._fw_bump_version_main();
create or replace trigger fw_app_data_branches_version before update on public.app_data_branches
  for each row execute function public._fw_bump_version();

-- ── 2. Versiya tekshiruvi bilan yozish (bitta tranzaksiyada: asosiy qator + filial qatorlari) ──
-- p_main — null bo'lsa asosiy qator yozilmaydi. p_main_base — server o'qigan versiya (null — tekshirilmaydi).
-- p_keep_branch_debt — true bo'lsa branchDebt bazadagisi qoladi (27 dan keyin filial qarzi — server hisobi).
-- p_branches — [{key, data, base}] (base null — tekshirilmaydi; qator yo'q bo'lsa base 0 yoki null bo'lishi kerak).
-- Natija: {main: <yangi versiya>, branches: {key: <yangi versiya>}}. Ziddiyat — FW_VERSION_CONFLICT|<qator>|<joriy versiya>.
create or replace function public.app_data_save_cas(
  p_main jsonb, p_main_base bigint, p_branches jsonb, p_keep_branch_debt boolean default true)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  v_cur bigint;
  v_new bigint;
  v_out jsonb := '{}'::jsonb;
  v_br jsonb := '{}'::jsonb;
  v_e jsonb;
  v_key text;
  v_base bigint;
begin
  if p_main is not null then
    if jsonb_typeof(p_main) <> 'object' then raise exception 'LEDGER: ma''lumot noto''g''ri' using errcode = 'P0001'; end if;
    select version into v_cur from public.app_data where id = 'main' for update;
    if not found then
      if coalesce(p_main_base, 0) <> 0 then
        raise exception 'FW_VERSION_CONFLICT|main|0' using errcode = 'P0001';
      end if;
      insert into public.app_data (id, data, updated_at) values ('main', p_main, now())
        on conflict (id) do nothing;
      if not found then raise exception 'FW_VERSION_CONFLICT|main|-1' using errcode = 'P0001'; end if;
      v_new := 0;
    else
      if p_main_base is not null and v_cur <> p_main_base then
        raise exception 'FW_VERSION_CONFLICT|main|%', v_cur using errcode = 'P0001';
      end if;
      update public.app_data
         set data = case when p_keep_branch_debt
                         then (p_main - 'branchDebt') || jsonb_build_object('branchDebt', coalesce(data->'branchDebt', '{}'::jsonb))
                         else p_main end,
             updated_at = now()
       where id = 'main'
      returning version into v_new;
    end if;
    v_out := v_out || jsonb_build_object('main', v_new);
  end if;

  if p_branches is not null then
    if jsonb_typeof(p_branches) <> 'array' or jsonb_array_length(p_branches) > 50 then
      raise exception 'LEDGER: filiallar ro''yxati noto''g''ri' using errcode = 'P0001';
    end if;
    for v_e in select e from jsonb_array_elements(p_branches) e order by e->>'key' loop
      v_key := v_e->>'key';
      if coalesce(v_key, '') !~ '^[a-z0-9_]{1,40}$' or jsonb_typeof(v_e->'data') <> 'object' then
        raise exception 'LEDGER: filial ma''lumoti noto''g''ri' using errcode = 'P0001';
      end if;
      v_base := case when v_e->>'base' ~ '^[0-9]{1,18}$' then (v_e->>'base')::bigint end;
      select version into v_cur from public.app_data_branches where branch_key = v_key for update;
      if not found then
        if coalesce(v_base, 0) <> 0 then
          raise exception 'FW_VERSION_CONFLICT|%|0', v_key using errcode = 'P0001';
        end if;
        insert into public.app_data_branches (branch_key, data, updated_at) values (v_key, v_e->'data', now())
          on conflict (branch_key) do nothing;
        if not found then raise exception 'FW_VERSION_CONFLICT|%|-1', v_key using errcode = 'P0001'; end if;
        v_new := 0;
      else
        if v_base is not null and v_cur <> v_base then
          raise exception 'FW_VERSION_CONFLICT|%|%', v_key, v_cur using errcode = 'P0001';
        end if;
        update public.app_data_branches set data = v_e->'data', updated_at = now()
         where branch_key = v_key
        returning version into v_new;
      end if;
      v_br := v_br || jsonb_build_object(v_key, v_new);
    end loop;
    v_out := v_out || jsonb_build_object('branches', v_br);
  end if;
  return v_out;
end;
$$;

-- ── 3. «tannarx.view» ruxsati (hech bir rolga avtomatik berilmaydi) ────────
insert into public.permissions (key, module, label) values
  ('tannarx.view', 'ombor', 'Tannarx, partiya narxi va foydani koʻrish')
on conflict (key) do nothing;

-- ── 4a. Son yoki standart qiymat (_fw_num noto'g'ri/yo'q qiymatda 0 qaytaradi — bu yerda standart kerak) ──
create or replace function public._fw_num_or(p text, p_default numeric)
 returns numeric
 language sql
 immutable
 set search_path = ''
as $$
  select case when p ~ '^\s*-?[0-9]{1,18}(\.[0-9]{1,40})?([eE][-+]?[0-9]{1,2})?\s*$' then trim(p)::numeric else p_default end;
$$;

-- ── 4. Savdo: chegirma chegarasi va Direct Sale — sale_checkout_v34 dan OLDIN, o'sha tranzaksiyada ──
-- p_price_mode: 'retail' (chakana) yoki 'wholesale' (optom). Admin (p_role = 'admin') — tekshirilmaydi.
-- Asos narx — ilovadagidek: tannarx = mahsulotda Direct Sale narxi (dsCostUsd > 0) bo'lsa o'sha, aks holda
-- filialdagi eng eski faol partiya tannarxi (FIFO); chakana = round(tannarx × (1 + markupPct/100)),
-- optom = round(tannarx × (1 + optMarkupPct/100), 2). Sotuv narxi (chek chegirmasi bilan) asosdan
-- settings.maxDiscountPct (standart 10) foizdan ko'p past bo'lsa — DISCOUNT_LIMIT.
create or replace function public.sale_checkout_v37(
  p_filial text, p_op_key text, p_sale jsonb, p_box_payments jsonb,
  p_staff_id bigint, p_staff_name text, p_role text, p_loss_ack boolean default false,
  p_overpay jsonb default null, p_credit_use_uzs numeric default 0, p_price_mode text default 'retail')
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  v_main jsonb;
  v_max numeric;
  v_disc numeric;
  v_mode text := case when p_price_mode = 'wholesale' then 'wholesale' else 'retail' end;
  v_e jsonb;
  v_p jsonb;
  v_pid text;
  v_cost numeric;
  v_pct numeric;
  v_base numeric;
  v_eff numeric;
  v_floor numeric;
begin
  -- Takror so'rov (o'sha kalit) — v34 avvalgi natijani qaytaradi, qayta tekshirilmaydi
  if p_role <> 'admin' and not exists (select 1 from public.ledger_ops where filial = p_filial and op_key = p_op_key) then
    select data into v_main from public.app_data where id = 'main';
    v_max := public._fw_num_or(v_main->'settings'->>'maxDiscountPct', 10);
    if v_max < 0 then v_max := 0; elsif v_max > 100 then v_max := 100; end if;
    v_disc := coalesce(public._fw_num(p_sale->>'discPct'), 0);
    if v_disc < 0 then v_disc := 0; elsif v_disc > 100 then v_disc := 100; end if;
    for v_e in select e from jsonb_array_elements(coalesce(p_sale->'items', '[]'::jsonb)) e loop
      v_pid := v_e->>'pid';
      select p into v_p from jsonb_array_elements(coalesce(v_main->'products', '[]'::jsonb)) p where p->>'id' = v_pid limit 1;
      -- Direct Sale: faqat mahsulotda oldindan belgilangan ta'minotchi va narx bilan
      if coalesce(v_e->>'directSupply', 'false') = 'true' then
        if v_p is null or coalesce(v_p->>'directSale', 'false') <> 'true' or coalesce(v_p->>'dsSuppId', '') = ''
           or coalesce(public._fw_num(v_p->>'dsCostUsd'), 0) <= 0 then
          raise exception 'LEDGER: Direct Sale: mahsulotga ta''minotchi va narx belgilanmagan (pid=%)', v_pid using errcode = 'P0001';
        end if;
        if coalesce(v_e->>'suppId', '') <> v_p->>'dsSuppId'
           or abs(coalesce(public._fw_num(v_e->>'costUsd'), -1) - public._fw_num(v_p->>'dsCostUsd')) > 0.0001 then
          raise exception 'LEDGER: Direct Sale: ta''minotchi yoki narx mahsulotdagidan farq qiladi (pid=%)', v_pid using errcode = 'P0001';
        end if;
      end if;
      -- Chegirma chegarasi
      v_cost := null;
      if v_p is not null and coalesce(v_p->>'directSale', 'false') = 'true' and coalesce(public._fw_num(v_p->>'dsCostUsd'), 0) > 0 then
        v_cost := public._fw_num(v_p->>'dsCostUsd');
      elsif v_pid ~ '^[0-9]{1,18}$' then
        select b.cost_usd into v_cost from public.batches b
         where b.filial = p_filial and b.pid = v_pid::bigint and b.deleted_at is null
           and b.status not in ('transit', 'deleted', 'empty') and b.qty - b.sold > 0
         order by b.batch_date, b.id limit 1;
      end if;
      continue when v_cost is null or v_cost <= 0;
      if v_mode = 'wholesale' then
        v_pct := public._fw_num_or(v_p->>'optMarkupPct', 15);
        v_base := round(v_cost * (1 + v_pct / 100), 2);
      else
        v_pct := public._fw_num_or(v_p->>'markupPct', 25);
        v_base := round(v_cost * (1 + v_pct / 100));
      end if;
      v_eff := coalesce(public._fw_num(v_e->>'sellUsd'), 0) * (1 - v_disc / 100);
      v_floor := v_base * (1 - v_max / 100);
      if v_eff < v_floor - 0.01 then
        raise exception 'LEDGER: DISCOUNT_LIMIT|max=%|pid=%|floor=%', v_max, v_pid, round(v_floor, 2) using errcode = 'P0001';
      end if;
    end loop;
  end if;
  return public.sale_checkout_v34(p_filial, p_op_key, p_sale, p_box_payments, p_staff_id, p_staff_name, p_role,
                                  p_loss_ack, p_overpay, p_credit_use_uzs);
end;
$$;

-- ── 5. record_dealer_sale — eski overloadlar (5 va 6 argument) ──────────────
drop function if exists public.record_dealer_sale(bigint, numeric, numeric, text, text);
drop function if exists public.record_dealer_sale(bigint, numeric, numeric, text, text, numeric);

-- ── 6. Huquqlar (faqat server) ─────────────────────────────────────────────
revoke all on function public._fw_bump_version() from public, anon, authenticated;
revoke all on function public._fw_bump_version_main() from public, anon, authenticated;
revoke all on function public._fw_num_or(text, numeric) from public, anon, authenticated;
revoke all on function public.app_data_save_cas(jsonb, bigint, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.app_data_save_cas(jsonb, bigint, jsonb, boolean) to service_role;
revoke all on function public.sale_checkout_v37(text, text, jsonb, jsonb, bigint, text, text, boolean, jsonb, numeric, text) from public, anon, authenticated;
grant execute on function public.sale_checkout_v37(text, text, jsonb, jsonb, bigint, text, text, boolean, jsonb, numeric, text) to service_role;

comment on column public.app_data.version is '37-migratsiya: har yozuvda +1 (trigger) — eski versiya bilan yozish rad etiladi (409)';
comment on column public.app_data_branches.version is '37-migratsiya: har yozuvda +1 (trigger) — eski versiya bilan yozish rad etiladi (409)';
