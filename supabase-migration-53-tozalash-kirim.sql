-- 53: sinovni tozalash — KIRIMLAR HAM (ombor 0). Egasi talabi: FIFO ombori ham nol bo'lsin.
-- Mahsulotlar ro'yxati (app_data.products) va katalog qatorlari QOLADI (qoldig'i 0). Takror ishga tushirish xavfsiz.
create or replace function public.fw_trial_reset_kirim(p_dry boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n1 bigint; n2 bigint;
begin
  select count(*) into n1 from public.batches;
  select count(*) into n2 from public.stock_ledger;
  if not p_dry then
    perform set_config('fw.stock_move', '1', true);
    alter table public.stock_ledger disable trigger user;
    delete from public.stock_ledger where true;             -- partiyaga bog'liq jurnal (FK) — avval
    alter table public.stock_ledger enable trigger user;
    alter table public.batches disable trigger user;
    delete from public.batches where true;
    alter table public.batches enable trigger user;
    if to_regclass('public.catalog_products') is not null then
      update public.catalog_products set qty = 0, updated_at = now() where true;
    end if;
  end if;
  return jsonb_build_object('batches', n1, 'stock_ledger_all', n2);
end $$;
revoke all on function public.fw_trial_reset_kirim(boolean) from public, anon, authenticated;
grant execute on function public.fw_trial_reset_kirim(boolean) to service_role;
