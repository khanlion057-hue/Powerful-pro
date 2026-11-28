-- ════════════════════════════════════════════════════════════
-- POWERFUL PRO — FINAL-SQL.sql (YANGILANGAN — mixed-payment kengaytmasi)
-- Migratsiya 20-23 va 24-27 — ALLAQACHON production'da RUN qilingan
-- (siz tomondan tasdiqlangan). Bu faylda FAQAT hali RUN qilinmagan
-- YANGI migratsiya (28) bor.
--
-- 28: sale_checkout_atomic_v2() — mixed-payment (bir nechta kassaga
--     bo'lingan to'lov) ham to'liq atomik bo'lishi uchun kengaytilgan RPC.
--     Eski sale_checkout_atomic() (8-parametrli) — DROP QILINMAGAN, xavfsiz
--     qoldirilgan, lekin endi kod tomonidan ishlatilmaydi.
-- ════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════
-- BIZNES PRO — 28-MIGRATSIYA: P3-12 TO'LIQ — Mixed-payment atomik checkout
-- ════════════════════════════════════════════════════════════
-- FAQAT QO'SHIMCHA. DROP yo'q. Bu — `sale_checkout_atomic()`ning YANGI,
-- KENGROQ signatureli versiyasi (p_box_id+p_box_amount_native o'rniga
-- p_box_payments massivi) — Postgres buni ALOHIDA overload sifatida
-- qo'shadi (eski 8-parametrli versiya DROP qilinmaydi, shunchaki
-- ishlatilmay qoladi — xavfsiz, additive).
--
-- Endi BIR nechta kassaga bo'lingan to'lov (mixed-payment) ham TO'LIQ
-- ATOMIK: ombor (FIFO) + savdo + mijoz qarzi + BARCHA tanlangan kassalar —
-- bittasi ham "yarmi yozilib" qolmaydi.

create or replace function public.sale_checkout_atomic_v2(
  p_filial text,
  p_items jsonb,             -- [{"pid":1,"sku":"","name":"","qty":2,"sell_usd":15,"cost_usd":10,"direct_supply":false,"supp_id":null}]
  p_disc_pct numeric,
  p_paid_usd numeric,
  p_cust_id bigint,
  p_box_payments jsonb,      -- [{"box_id":3,"amount_native":150000}, ...] — BO'SH massiv ham bo'lishi mumkin (masalan sof qarzga sotuv)
  p_inv text
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_item jsonb;
  v_bp jsonb;
  v_pid bigint;
  v_qty numeric;
  v_remaining numeric;
  v_batch record;
  v_take numeric;
  v_subtotal numeric := 0;
  v_total numeric;
  v_cost numeric := 0;
  v_profit numeric;
  v_debt numeric;
  v_change numeric;
  v_sale_id bigint;
begin
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_subtotal := v_subtotal + (v_item->>'qty')::numeric * (v_item->>'sell_usd')::numeric;
  end loop;
  v_total := v_subtotal * (1 - coalesce(p_disc_pct,0)/100);

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_pid := (v_item->>'pid')::bigint;
    v_qty := (v_item->>'qty')::numeric;

    if coalesce((v_item->>'direct_supply')::boolean, false) then
      v_cost := v_cost + v_qty * (v_item->>'cost_usd')::numeric;
      if v_item->>'supp_id' is not null then
        insert into public.supplier_balances (filial, supplier_local_id, debt)
          values (p_filial, (v_item->>'supp_id')::bigint, v_qty * (v_item->>'cost_usd')::numeric)
          on conflict (filial, supplier_local_id) do update
            set debt = public.supplier_balances.debt + excluded.debt, updated_at = now();
      end if;
    else
      v_remaining := v_qty;
      for v_batch in
        select id, qty, sold, cost_usd from public.batches
        where filial = p_filial and pid = v_pid and status = 'active' and qty > sold
        order by batch_date asc nulls last, id asc
        for update
      loop
        exit when v_remaining <= 0;
        v_take := least(v_batch.qty - v_batch.sold, v_remaining);
        update public.batches set sold = sold + v_take,
               status = case when qty <= sold + v_take then 'empty' else status end,
               updated_at = now()
          where id = v_batch.id;
        v_cost := v_cost + v_take * v_batch.cost_usd;
        v_remaining := v_remaining - v_take;
      end loop;
      if v_remaining > 0 then
        raise exception 'Omborda yetarli qoldiq yo''q: pid=%, yetishmayotgan miqdor=%', v_pid, v_remaining;
      end if;
    end if;
  end loop;

  v_profit := v_total - v_cost;
  v_debt := greatest(0, v_total - p_paid_usd);
  v_change := greatest(0, p_paid_usd - v_total);

  insert into public.sales (filial, inv, cust_id, subtotal_usd, disc_pct, total_usd, cost_usd, profit_usd, paid_usd, debt_usd, items)
    values (p_filial, p_inv, p_cust_id, v_subtotal, coalesce(p_disc_pct,0), v_total, v_cost, v_profit, least(p_paid_usd, v_total), v_debt, p_items)
    returning id into v_sale_id;

  if p_cust_id is not null and v_debt > 0 then
    insert into public.customer_balances (filial, customer_local_id, debt)
      values (p_filial, p_cust_id, v_debt)
      on conflict (filial, customer_local_id) do update
        set debt = public.customer_balances.debt + excluded.debt, updated_at = now();
  end if;

  -- MIXED-PAYMENT: bir nechta kassaga bo'lingan to'lov — HAR BIRI ham
  -- shu bitta tranzaksiya ichida, atomik ravishda yangilanadi.
  if p_box_payments is not null then
    for v_bp in select * from jsonb_array_elements(p_box_payments) loop
      insert into public.cashbox_balances (filial, box_local_id, balance)
        values (p_filial, (v_bp->>'box_id')::bigint, (v_bp->>'amount_native')::numeric)
        on conflict (filial, box_local_id) do update
          set balance = public.cashbox_balances.balance + excluded.balance, updated_at = now();
    end loop;
  end if;

  return jsonb_build_object(
    'ok', true, 'saleId', v_sale_id, 'inv', p_inv,
    'subtotalUsd', v_subtotal, 'totalUsd', v_total, 'costUsd', v_cost,
    'profitUsd', v_profit, 'debtUsd', v_debt, 'changeUsd', v_change
  );
end;
$$;

revoke execute on function public.sale_checkout_atomic_v2(text, jsonb, numeric, numeric, bigint, jsonb, text) from public, anon, authenticated;
grant execute on function public.sale_checkout_atomic_v2(text, jsonb, numeric, numeric, bigint, jsonb, text) to service_role;
