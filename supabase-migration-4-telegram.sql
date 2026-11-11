-- ════════════════════════════════════════════════════════════
-- BIZNES PRO — 4-QO'SHIMCHA MIGRATSIYA: TELEGRAM GURUH ID
-- ════════════════════════════════════════════════════════════
-- Har bir dillerning o'z Telegram guruhiga xabar yuborish uchun

alter table public.dealers
  add column if not exists telegram_chat_id text;

-- Tayyor!
