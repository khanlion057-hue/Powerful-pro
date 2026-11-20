-- 50: diller katalogida kategoriya va brend (diller portali «Buyurtma»da kategoriya filtri, brend bo'yicha qidiruv).
-- Faqat ustun qo'shadi — takror ishga tushirish xavfsiz. Qo'llangach: Dillerlar → «Katalogni yangilash» (yoki istalgan saqlash).
alter table public.catalog_products add column if not exists cat text;
alter table public.catalog_products add column if not exists brand text;
