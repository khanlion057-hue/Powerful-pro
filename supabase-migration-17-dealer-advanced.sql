-- ════════════════════════════════════════════════════════════
-- BIZNES PRO — 17-MIGRATSIYA: Diller — kredit nazorati + qaytarish tafsilotlari
-- ════════════════════════════════════════════════════════════
-- Faqat 2 ta MAVJUD jadvalga, jami 4 ta ustun qo'shiladi (ADDITIVE, xavfsiz,
-- mavjud ma'lumotlarni buzmaydi). Yangi jadval YARATILMAYDI.
--
-- Supabase Dashboard → SQL Editor → shu faylni to'liq nusxalab, RUN qiling

-- 1) Kredit nazorati — dealers jadvaliga
alter table public.dealers add column if not exists credit_limit_usd numeric not null default 0;
alter table public.dealers add column if not exists payment_due_days integer not null default 30;

-- 2) Qaytarish tafsilotlari — dealer_stock_moves jadvaliga
--    (mavjud "type" ustuni allaqachon 'send'/'return' qiymatlarini qo'llab-quvvatlaydi)
alter table public.dealer_stock_moves add column if not exists reason text;
alter table public.dealer_stock_moves add column if not exists condition text; -- 'Yangi' | 'Yaxshi' | "Ta'mirtalab" | 'Yaroqsiz'

-- Tayyor! Hech qanday mavjud qator o'zgarmadi — barcha yangi ustunlar standart qiymat bilan.
