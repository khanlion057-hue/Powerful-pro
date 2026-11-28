-- ════════════════════════════════════════════════════════════
-- BIZNES PRO — 19-MIGRATSIYA
-- 4b-BOSQICH / 1-QADAM: app_data_branches jadvalini yaratish
-- ════════════════════════════════════════════════════════════
-- Bu qadam FAQAT yangi bo'sh jadval yaratadi. Mavjud "app_data" jadvaliga
-- HECH QANDAY tegilmaydi — o'qilmaydi ham, yozilmaydi ham, o'zgartirilmaydi ham.
-- Hech qanday kod hali bu yangi jadvaldan foydalanmaydi (keyingi qadamda ulanadi).
--
-- Xavf darajasi: MINIMAL — oddiy CREATE TABLE, tizimga hech qanday ta'sir yo'q,
-- foydalanuvchilar bu o'zgarishni umuman sezmaydi.
--
-- Supabase Dashboard → SQL Editor → shu faylni to'liq nusxalab, RUN qiling

create table if not exists public.app_data_branches (
  branch_key text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_data_branches enable row level security;
-- Mavjud "app_data" jadvali qanday siyosatga ega bo'lsa, shu bilan bir xil
-- (anon to'liq kirishga ega — chunki admin panel PIN bilan himoyalangan, anon kalit orqali ishlaydi).
-- Agar "app_data" uchun boshqacha (masalan qulflangan) siyosat qo'ygan bo'lsangiz,
-- shu yerni ham moslashtiring — hozircha mavjud namunaga ergashamiz:
drop policy if exists app_data_branches_anon_all on public.app_data_branches;
create policy app_data_branches_anon_all on public.app_data_branches for all to anon using (true) with check (true);

-- Tayyor! Jadval yaratildi, lekin hali BO'SH va HECH QANDAY kod uni ishlatmaydi.
-- Keyingi qadam (2-qadam): mavjud app_data.branchStore'dan bu jadvalga
-- ma'lumotni FAQAT O'QIB (eskisiga tegmasdan) ko'chirish.
