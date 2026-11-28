-- POWERFUL PRO -> FRANKFURT: 3-QADAM (tozalash, ko'chirish tekshirilgandan KEYIN)
-- FAQAT YANGI loyihada: Powerful-pro-eu (marqgbbwqpqohtzjkyyy) -> SQL Editor -> Run
-- Vaqtinchalik ko'prikni olib tashlaydi: storage qoidalari va yordamchi funksiyalar.
-- Ilova ma'lumotlariga tegmaydi.

drop policy if exists fw_migr_tmp_ins on storage.objects;
drop policy if exists fw_migr_tmp_sel on storage.objects;
drop policy if exists fw_migr_tmp_del on storage.objects;
drop policy if exists fw_migr_tmp_img on storage.objects;
drop function if exists public.fw_migr_load(text);
drop function if exists public.fw_migr_get(text);
update storage.buckets set public = false where id = 'fw-migr-tmp';

select (select count(*) from pg_policies where policyname like 'fw_migr_tmp%') as qolgan_qoidalar,
       (select count(*) from pg_proc where proname like 'fw_migr_%') as qolgan_funksiyalar;
