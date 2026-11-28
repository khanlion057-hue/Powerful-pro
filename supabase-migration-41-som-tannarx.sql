-- ════════════════════════════════════════════════════════════════════════════
-- 41-MIGRATSIYA (v25) — SO'MDA HISOB: TANNARX SO'MDA QOTADI
-- ════════════════════════════════════════════════════════════════════════════
-- Egasi qarorlari (2026-11-08): kirim va hisob valyutasi har filialga alohida («So'mda», «Aralash» rejimlari);
-- so'mda hisoblangan partiyaning tannarxi KIRIM KURSIDA so'mda qotadi va kurs o'zgarsa ham o'zgarmaydi.
-- Ichki hisob ($) o'zgarmaydi: kurs o'zgarganda faqat shunday partiyalarning qolgan qismi uchun
-- cost_usd = cost_uzs / bugungi kurs qayta hisoblanadi — shunda savdo narxi, foyda va chegirma chegarasi
-- so'mda aynan bir xil qoladi. Sotilgan savdolar (o'z tannarxi bilan yozilgan) o'zgarmaydi.
-- Faqat QO'SHADI (ustun + funksiya), takror ishga tushirish xavfsiz. Talab: 27, 36.

do $$ begin
  if to_regprocedure('public._fw_authority(text,bigint[],bigint[],bigint[])') is null then
    raise exception '41-migratsiya: avval 27 va 36-migratsiyalar qo''llanishi kerak';
  end if;
end $$;

alter table public.batches add column if not exists cost_uzs numeric;

-- p_mark — so'mda hisoblanadigan partiyalar (local_id); p_reprice — bugungi kurs bo'yicha $ tannarxni yangilash
create or replace function public.batch_acc_uzs(p_filial text, p_mark jsonb default '[]'::jsonb, p_reprice boolean default false)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  v_rate numeric;
  v_marked integer := 0;
  v_repriced integer := 0;
  v_bids bigint[] := '{}';
  v_ids bigint[];
begin
  if coalesce(p_filial, '') !~ '^[a-z0-9_]{1,40}$' then raise exception 'LEDGER: filial noto''g''ri' using errcode = 'P0001'; end if;
  select public._fw_num(data->'settings'->>'usdUzs') into v_rate from public.app_data where id = 'main';
  perform set_config('fw.stock_move', '1', true);
  if jsonb_typeof(p_mark) = 'array' and jsonb_array_length(p_mark) > 0 then
    if jsonb_array_length(p_mark) > 500 then raise exception 'LEDGER: juda ko''p partiya' using errcode = 'P0001'; end if;
    with u as (
      update public.batches b
         set cost_uzs = round(b.cost_usd * coalesce(nullif(b.rate_usd_uzs, 0), v_rate), 2)
       where b.filial = p_filial and b.local_id in (select jsonb_array_elements_text(p_mark)) and b.cost_uzs is null
         and coalesce(nullif(b.rate_usd_uzs, 0), v_rate, 0) > 0
      returning b.id)
    select count(*), coalesce(array_agg(id), '{}') into v_marked, v_ids from u;
    v_bids := v_bids || v_ids;
  end if;
  if p_reprice then
    if coalesce(v_rate, 0) < 100 or v_rate > 1000000 then
      perform set_config('fw.stock_move', '', true);
      raise exception 'LEDGER: bugungi kurs noto''g''ri' using errcode = 'P0001';
    end if;
    with u as (
      update public.batches b
         set cost_usd = round(b.cost_uzs / v_rate, 6), updated_at = now()
       where b.filial = p_filial and b.cost_uzs is not null and b.status in ('active', 'transit') and b.qty > b.sold
         and abs(b.cost_usd - round(b.cost_uzs / v_rate, 6)) > 0.0000005
      returning b.id)
    select count(*), coalesce(array_agg(id), '{}') into v_repriced, v_ids from u;
    v_bids := v_bids || v_ids;
  end if;
  perform set_config('fw.stock_move', '', true);
  return jsonb_build_object('ok', true, 'marked', v_marked, 'repriced', v_repriced, 'rate', v_rate,
    'authority', public._fw_authority(p_filial, null, null, v_bids));
end;
$$;
revoke all on function public.batch_acc_uzs(text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.batch_acc_uzs(text, jsonb, boolean) to service_role;
