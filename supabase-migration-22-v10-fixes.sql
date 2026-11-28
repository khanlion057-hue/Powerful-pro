-- ════════════════════════════════════════════════════════════════════
-- Migratsiya 22 (v10, 2026-10-01) — egasi tasdiqlagan 3 ta tuzatish
--   1) partner_upsert_atomic: bo'sh bazada birinchi hamkor qo'shilmasligi
--   2) product-images saqlagichi: yozish faqat faol xodimga
--   3) catalog_products.image: diller portalida mahsulot rasmi
-- Takroriy ishga tushirish xavfsiz. Ma'lumot o'chirilmaydi.
-- ════════════════════════════════════════════════════════════════════

-- 1) HAMKOR FUNKSIYASI
--    Xato: jsonb_set(..., updated_at = now()) — 4-argument sifatida "updated_at = now()"
--    taqqoslash natijasi (false) ketardi: kalit yo'q bo'lsa hamkor JSON'ga yozilmasdi,
--    app_data.updated_at esa umuman yangilanmasdi. Moliyaviy mantiq (ledger, foizlar) o'zgarmaydi.
CREATE OR REPLACE FUNCTION public.partner_upsert_atomic(p_legacy_id bigint, p_name text, p_is_founder boolean, p_keep_pct numeric, p_color text DEFAULT NULL::text, p_avatar text DEFAULT NULL::text, p_initial_invested numeric DEFAULT NULL::numeric, p_partner_type text DEFAULT 'BUSINESS_OWNER'::text, p_investment_pct numeric DEFAULT NULL::numeric)
 RETURNS TABLE(partner_id bigint, is_new boolean)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_id bigint; v_is_new boolean := false;
BEGIN
  IF p_investment_pct IS NOT NULL THEN
    IF p_partner_type = 'INVESTOR' AND (p_investment_pct < 10 OR p_investment_pct > 100) THEN
      RAISE EXCEPTION 'HAMKORLAR_V2_ERR: INVESTOR uchun investment_pct 10-100 oralig''ida bo''lishi shart (got %)', p_investment_pct USING ERRCODE='P0009';
    ELSIF p_partner_type <> 'INVESTOR' AND (p_investment_pct <= 0 OR p_investment_pct > 100) THEN
      RAISE EXCEPTION 'HAMKORLAR_V2_ERR: investment_pct 0dan katta va 100dan kichik/teng bo''lishi shart (got %)', p_investment_pct USING ERRCODE='P0009';
    END IF;
  END IF;
  SELECT id INTO v_id FROM partners WHERE legacy_id = p_legacy_id;
  IF v_id IS NULL THEN
    v_is_new := true;
    INSERT INTO partners (legacy_id, name, is_founder, keep_pct, color, avatar, partner_type, investment_pct)
    VALUES (p_legacy_id, p_name, p_is_founder, p_keep_pct, p_color, p_avatar, p_partner_type, p_investment_pct)
    RETURNING id INTO v_id;
    UPDATE app_data SET data = jsonb_set(
      COALESCE(data,'{}'::jsonb), '{partners}',
      COALESCE(data->'partners','[]'::jsonb) || jsonb_build_array(
        jsonb_build_object('id', p_legacy_id, 'name', p_name, 'isFounder', p_is_founder,
                            'keepPct', p_keep_pct, 'color', p_color, 'av', p_avatar,
                            'partnerType', p_partner_type, 'investmentPct', p_investment_pct,
                            'invested', COALESCE(p_initial_invested,0))
      ), true
    ), updated_at = now() WHERE id='main';
    IF COALESCE(p_initial_invested,0) <> 0 THEN
      PERFORM partner_ledger_add_atomic(p_legacy_id, 'capital_in', p_initial_invested, 'partner_create', NULL, 'Initial capital on partner creation');
    END IF;
  ELSE
    UPDATE partners SET name=p_name, is_founder=p_is_founder, keep_pct=p_keep_pct,
           color=COALESCE(p_color,color), avatar=COALESCE(p_avatar,avatar),
           partner_type=COALESCE(p_partner_type,partner_type),
           investment_pct=p_investment_pct, updated_at=now()
    WHERE id=v_id;
    UPDATE app_data SET data = jsonb_set(
      COALESCE(data,'{}'::jsonb), '{partners}',
      COALESCE((SELECT jsonb_agg(CASE WHEN (e->>'id')::bigint=p_legacy_id
                        THEN e || jsonb_build_object('name',p_name,'isFounder',p_is_founder,'keepPct',p_keep_pct,
                                                      'partnerType',p_partner_type,'investmentPct',p_investment_pct)
                        ELSE e END)
       FROM jsonb_array_elements(COALESCE(data->'partners','[]'::jsonb)) e), '[]'::jsonb), true
    ), updated_at = now() WHERE id='main';
  END IF;
  RETURN QUERY SELECT v_id, v_is_new;
END;
$function$
;

-- 2) RASM SAQLAGICHI: yozish/o'zgartirish/o'chirish — faqat faol xodim
--    Avval tizimga kirmagan (anon) har kim rasm yuklay/o'chira olardi.
--    O'qish (ochiq havola orqali ko'rish) o'zgarmaydi — bucket ochiq.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create or replace function private.is_active_staff()
 returns boolean
 language sql
 stable
 security definer
 set search_path = ''
as $$
  select exists (
    select 1 from public.staff s
    where s.auth_user_id = (select auth.uid()) and s.active
  );
$$;
revoke all on function private.is_active_staff() from public, anon;
grant execute on function private.is_active_staff() to authenticated, service_role;

drop policy if exists product_images_write  on storage.objects;
drop policy if exists product_images_update on storage.objects;
drop policy if exists product_images_delete on storage.objects;

drop policy if exists product_images_write_auth on storage.objects;
create policy product_images_write_auth on storage.objects as permissive for insert to authenticated
  with check (bucket_id = 'product-images' and (select private.is_active_staff()));
drop policy if exists product_images_update_auth on storage.objects;
create policy product_images_update_auth on storage.objects as permissive for update to authenticated
  using (bucket_id = 'product-images' and (select private.is_active_staff()))
  with check (bucket_id = 'product-images' and (select private.is_active_staff()));
drop policy if exists product_images_delete_auth on storage.objects;
create policy product_images_delete_auth on storage.objects as permissive for delete to authenticated
  using (bucket_id = 'product-images' and (select private.is_active_staff()));

-- 3) DILLER KATALOGIDA MAHSULOT RASMI
--    catalog-full-sync.js har sinxronlashda to'ldiradi (faqat https havola).
alter table public.catalog_products add column if not exists image text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='catalog_products_image_https' and conrelid='public.catalog_products'::regclass) then
    alter table public.catalog_products add constraint catalog_products_image_https
      check (image is null or (image ~* '^https://' and length(image) <= 1000));
  end if;
end $$;
