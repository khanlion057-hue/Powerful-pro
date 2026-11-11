-- ════════════════════════════════════════════════════════════
-- BIZNES PRO — TUZATISH: barcha jadvallardagi KERAKLI ustunlarni
-- tekshirib, yetishmasa qo'shadi (xavfsiz — mavjud bo'lsa hech
-- narsa buzilmaydi, faqat yo'q bo'lsa qo'shadi)
-- ════════════════════════════════════════════════════════════

-- catalog_products
alter table public.catalog_products
  add column if not exists point_pct numeric not null default 0;
alter table public.catalog_products
  add column if not exists optim_price numeric not null default 0;

-- dealers
alter table public.dealers
  add column if not exists commission_pct numeric not null default 0;
alter table public.dealers
  add column if not exists telegram_chat_id text;
alter table public.dealers
  add column if not exists points numeric not null default 0;

-- Tayyor!
