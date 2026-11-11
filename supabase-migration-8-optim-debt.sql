-- ════════════════════════════════════════════════════════════
-- BIZNES PRO — 8-QO'SHIMCHA MIGRATSIYA: DILLER QARZI OPTIM NARXGA ASOSLANADI
-- ════════════════════════════════════════════════════════════
-- Muammo: diller o'zi "Sotdim" qilganda, TO'LIQ sotgan narxi uning
-- qarziga yozilardi — bu diller uchun hech qanday foyda qoldirmasdi.
-- Endi: diller qarzi FAQAT admin belgilagan OPTIM narx bo'yicha oshadi,
-- diller o'zi qancha yuqori sotsa — farq (foyda) o'zida qoladi.

alter table public.catalog_products
  add column if not exists optim_price numeric not null default 0;

create or replace function public.record_dealer_sale(
  p_pid bigint, p_qty numeric, p_sell_usd numeric, p_sku text, p_name text,
  p_points numeric default 0, p_optim_price numeric default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dealer_id bigint;
  v_stock numeric;
  v_optim numeric;
begin
  select id into v_dealer_id from dealers where auth_user_id = auth.uid();
  if v_dealer_id is null then
    raise exception 'Diller topilmadi — login qilinmagan';
  end if;
  if p_qty <= 0 then
    raise exception 'Miqdor 0 dan katta bo''lishi kerak';
  end if;

  select qty into v_stock from dealer_stock where dealer_id = v_dealer_id and pid = p_pid;
  if v_stock is null or v_stock < p_qty then
    raise exception 'Omborda yetarli mahsulot yo''q (bor: %, so''ralgan: %)', coalesce(v_stock,0), p_qty;
  end if;

  -- Qarz uchun asos — admin belgilagan OPTIM narx (agar berilmasa, xavfsizlik uchun sotilgan narxdan foydalaniladi)
  v_optim := coalesce(p_optim_price, p_sell_usd);

  update dealer_stock set qty = qty - p_qty, updated_at = now()
    where dealer_id = v_dealer_id and pid = p_pid;

  insert into dealer_sales (dealer_id, pid, sku, name, qty, sell_usd, total_usd, sale_date)
    values (v_dealer_id, p_pid, p_sku, p_name, p_qty, p_sell_usd, p_qty*p_sell_usd, current_date);

  update dealers set
    total_sold_usd = total_sold_usd + (p_qty*p_sell_usd),
    debt_usd        = debt_usd + (p_qty*v_optim),
    points          = points + coalesce(p_points,0)
  where id = v_dealer_id;
end;
$$;

grant execute on function public.record_dealer_sale(bigint, numeric, numeric, text, text, numeric, numeric) to authenticated;

-- Tayyor! Endi qayta yuklangan fayllar bilan diller "Sotdim" qilganda,
-- uning qarzi FAQAT optim narxga ko'ra oshadi, o'zi yuqoriroq sotsa farq unda qoladi.
