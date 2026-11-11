-- ════════════════════════════════════════════════════════════════════════════
-- 46-MIGRATSIYA (v25) — MUSTAQIL FILIAL: O'Z NARXI (chegirma chegarasi serverda)
-- ════════════════════════════════════════════════════════════════════════════
-- Egasi qarori (2026-11-10): filial ikki xil — «Filial» (qaramog'idagi: narxni Baza belgilaydi) va «Mustaqil»
-- (o'z narxi). Mustaqil filial settings.branchCfg[filial].own = { r, o, max } bilan o'z chakana/optom ustamasini (%)
-- va maksimal chegirmasini belgilaydi; savdodagi chegirma chegarasi shu qiymatlardan hisoblanadi.
-- 37 dagi sale_checkout_v37 shu farq bilan qayta yoziladi (qolgani aynan o'sha). Takror ishga tushirish xavfsiz. Talab: 37.

do $$ begin
  if to_regprocedure('public.sale_checkout_v34(text,text,jsonb,jsonb,bigint,text,text,boolean,jsonb,numeric)') is null then
    raise exception '46-migratsiya: avval 34 va 37-migratsiyalar qo''llanishi kerak';
  end if;
end $$;

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
  v_own jsonb;
begin
  -- Takror so'rov (o'sha kalit) — v34 avvalgi natijani qaytaradi, qayta tekshirilmaydi
  if p_role <> 'admin' and not exists (select 1 from public.ledger_ops where filial = p_filial and op_key = p_op_key) then
    select data into v_main from public.app_data where id = 'main';
    v_max := public._fw_num_or(v_main->'settings'->>'maxDiscountPct', 10);
    -- v25 (46): mustaqil filial — o'z ustamasi va maks. chegirmasi (settings.branchCfg[filial].own)
    v_own := case when v_main->'settings'->'branchCfg'->p_filial->>'type' = 'mustaqil'
                  then v_main->'settings'->'branchCfg'->p_filial->'own' end;
    if jsonb_typeof(v_own) = 'object' and public._fw_num(v_own->>'max') between 0 and 100 and coalesce(v_own->>'max', '') <> '' then
      v_max := public._fw_num(v_own->>'max');
    end if;
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
        v_pct := case when jsonb_typeof(v_own) = 'object' and coalesce(v_own->>'o', '') <> '' then public._fw_num(v_own->>'o')
                      else public._fw_num_or(v_p->>'optMarkupPct', 15) end;
        v_base := round(v_cost * (1 + v_pct / 100), 2);
      else
        v_pct := case when jsonb_typeof(v_own) = 'object' and coalesce(v_own->>'r', '') <> '' then public._fw_num(v_own->>'r')
                      else public._fw_num_or(v_p->>'markupPct', 25) end;
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
revoke all on function public.sale_checkout_v37(text, text, jsonb, jsonb, bigint, text, text, boolean, jsonb, numeric, text) from public, anon, authenticated;
grant execute on function public.sale_checkout_v37(text, text, jsonb, jsonb, bigint, text, text, boolean, jsonb, numeric, text) to service_role;
