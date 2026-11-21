-- ════════════════════════════════════════════════════════════
-- BIZNES PRO — 12-MIGRATSIYA: MAHSULOT RASMLARI UCHUN ALOHIDA SAQLAGICH
-- Supabase Dashboard → SQL Editor → shu faylni to'liq nusxalab, RUN qiling
-- ════════════════════════════════════════════════════════════
-- Muammo: hozir mahsulot rasmlari to'g'ridan-to'g'ri app_data jadvalining
-- o'zida (uzun matn/base64 sifatida) saqlanadi — har "saqlash"da BUTUN
-- rasmlar ro'yxati qayta-qayta bulutga yuboriladi, baza tez to'lib,
-- sekinlashadi.
--
-- Yechim: rasmlar endi alohida "Storage" (fayl-ombor)ga yuklanadi,
-- mahsulot ichida esa faqat QISQA LINK saqlanadi. app_data jadvali
-- yengil va tez qoladi.

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

-- Ilova hozircha login/parolsiz (anon key) ishlaydi, shuning uchun
-- boshqa jadvallar kabi shu bucket ham anon key orqali o'qish/yozish/o'chirishga ochiq
drop policy if exists product_images_read on storage.objects;
create policy product_images_read on storage.objects for select
  to anon using (bucket_id = 'product-images');

drop policy if exists product_images_write on storage.objects;
create policy product_images_write on storage.objects for insert
  to anon with check (bucket_id = 'product-images');

drop policy if exists product_images_update on storage.objects;
create policy product_images_update on storage.objects for update
  to anon using (bucket_id = 'product-images') with check (bucket_id = 'product-images');

drop policy if exists product_images_delete on storage.objects;
create policy product_images_delete on storage.objects for delete
  to anon using (bucket_id = 'product-images');

-- Tayyor! Endi ilovada yangi yuklanadigan rasmlar avtomatik shu yerga
-- tushadi. Eski (mavjud) rasmlarni ko'chirish uchun ilovada
-- Sozlamalar → "🖼️ Rasmlarni saqlagichga ko'chirish" tugmasini bosing.
