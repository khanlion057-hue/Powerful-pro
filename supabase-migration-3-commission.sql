-- ════════════════════════════════════════════════════════════
-- BIZNES PRO — 3-QO'SHIMCHA MIGRATSIYA: DILLER XIZMAT FOIZI
-- ════════════════════════════════════════════════════════════
-- Har bir dillerga alohida xizmat/komissiya foizi belgilash uchun
-- (masalan: bittasiga 8%, bittasiga 5%, bittasiga 0%)

alter table public.dealers
  add column if not exists commission_pct numeric not null default 0;

-- Tayyor! Endi saytni yangilangan fayllar bilan qayta yuklang.
