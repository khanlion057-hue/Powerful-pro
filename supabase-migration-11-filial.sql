-- ════════════════════════════════════════════════════════════
-- BIZNES PRO — 11-MIGRATSIYA: FILIAL (BAZA / 729) AJRATISH
-- Supabase Dashboard → SQL Editor → shu faylni to'liq nusxalab, RUN qiling
-- ════════════════════════════════════════════════════════════
-- Endi tizimda 2 ta filial bor: "baza" va "f729". Har birining
-- diller/xodim ro'yxati mustaqil bo'lishi uchun shu ustunni qo'shamiz.
-- Eski (mavjud) qatorlarning barchasi avtomatik "baza"ga tegishli
-- deb belgilanadi — hech narsa yo'qolmaydi.

alter table public.dealers add column if not exists filial text not null default 'baza';
alter table public.staff   add column if not exists filial text not null default 'baza';

create index if not exists idx_dealers_filial on public.dealers(filial);
create index if not exists idx_staff_filial   on public.staff(filial);

-- Katalog (dillerlar ko'radigan mahsulot ro'yxati) — endi har filial
-- o'zining qoldig'ini ko'rishi kerak, shuning uchun (id, filial) juftligi
-- bo'yicha noyob qilamiz.
alter table public.catalog_products add column if not exists filial text not null default 'baza';
alter table public.catalog_products drop constraint if exists catalog_products_pkey;
alter table public.catalog_products add primary key (id, filial);
create index if not exists idx_catalog_filial on public.catalog_products(filial);

-- Tayyor! Endi ilova filial bo'yicha diller/xodim/katalogni avtomatik ajratadi.
