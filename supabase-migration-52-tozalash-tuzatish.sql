-- 52: sinovni tozalash — Supabase pg_safeupdate qoidasi (WHERE shartsiz DELETE/UPDATE taqiqlangan) tufayli 49 dagi funksiya
-- prod'da «DELETE requires a WHERE clause» bilan yiqilardi (hech narsa o'chmagan — tranzaksiya bekor bo'lgan). Takror ishga tushirish xavfsiz.
create or replace function public.fw_trial_reset(p_dry boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t text; n bigint; res jsonb := '{}'::jsonb;
  tabs text[] := array[
    'sales','sale_credit_uses','customer_debt_ledger','customer_debt_payments','customer_credit_ledger','customer_credit_balances','customer_balances',
    'supplier_debt_ledger','supplier_payments','supplier_advance_ledger','supplier_advance_balances','supplier_balances',
    'cashbox_ledger','cashbox_transactions','cashbox_balances','firma_kassa_ledger','firma_kassa_balance','home_withdrawals',
    'dealer_orders','dealer_pay_notices','dealer_payments','dealer_sales','dealer_stock','dealer_stock_moves','dealer_audit_log','fw_dealer_revisions',
    'partner_ledger','partner_payments','partner_periods','branch_transfer_shipments','branch_transfers','branch_debt_cur','branch_debt_cur_ledger',
    'stock_writeoffs','fw_notifications','tg_outbox','fw_audit_events','staff_audit_log','ops_events','ops_alerts','ledger_ops','idempotency_keys'];
begin
  foreach t in array tabs loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('select count(*) from public.%I', t) into n;
    res := res || jsonb_build_object(t, n);
    if not p_dry then
      -- jurnal jadvallari o'zgarmas (immutable trigger): tozalash vaqtida faqat shu tranzaksiyada o'chirib qo'yiladi
      execute format('alter table public.%I disable trigger user', t);
      execute format('delete from public.%I where true', t);   -- Supabase pg_safeupdate: WHERE shartsiz DELETE taqiqlangan
      execute format('alter table public.%I enable trigger user', t);
    end if;
  end loop;
  -- ombor jurnali: kirim/import/boshlang'ich yozuvlar qoladi (tarix), qolgani (savdo, tuzatish...) o'chadi.
  -- ledger_ops, idempotency_keys va audit jurnallari ham tozalanadi (iz qolmasin); tozalagandan keyin barcha qurilmalar qayta yuklanishi kerak.
  execute 'select count(*) from public.stock_ledger where op_kind not in (''kirim'',''import'',''opening'')' into n;
  res := res || jsonb_build_object('stock_ledger', n);
  if not p_dry then
    alter table public.stock_ledger disable trigger user;
    delete from public.stock_ledger where op_kind not in ('kirim','import','opening');
    alter table public.stock_ledger enable trigger user;
  end if;
  select count(*) into n from public.batches where sold <> 0 or status in ('empty','transit');
  res := res || jsonb_build_object('batches_reset', n);
  if not p_dry then
    perform set_config('fw.stock_move', '1', true); perform set_config('fw.debt_move', '1', true);
    alter table public.batches disable trigger user;
    update public.batches set sold = 0, status = case when qty > 0 then 'active' else 'empty' end where status in ('empty','transit','active');
    alter table public.batches enable trigger user;
    update public.dealers set debt_usd = 0, total_shipped_usd = 0, total_sold_usd = 0, total_paid_usd = 0, points = 0 where true;
  end if;
  return res;
end $$;
revoke all on function public.fw_trial_reset(boolean) from public, anon, authenticated;
grant execute on function public.fw_trial_reset(boolean) to service_role;
