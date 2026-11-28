-- ============================================================================
-- 59-MIGRATSIYA (v25.9) - YAGONA TELEGRAM BOT: KELGAN XABARLAR QUTISI (tg_inbox)
-- ============================================================================
-- Egasi qarori (2026-11-28): barcha Telegram ishlari bitta (asosiy, hisobot) botda. Bot endi webhook
-- orqali ishlaydi ("telegram-bot" funksiyasi). Webhook yoqilgach Telegram getUpdates'ni rad etadi (409),
-- shuning uchun ulash tekshiruvlari (mijoz, xodim paroli, investor, guruhlarni topish) endi shu jadvaldan o'qiydi.
--
--  * Faqat kerakli qism saqlanadi: shaxsiy chatda faqat "/start <kod>" matni; guruh va kanallardan
--    faqat chat nomi/turi va botning holati (matn saqlanmaydi). Boshqa shaxsiy xabarlar umuman yozilmaydi.
--  * (bot_id, update_id) - noyob: Telegram bir xabarni qayta yuborsa, ikkinchi marta ishlanmaydi.
--  * 48 soatdan eski yozuvlar ops_cleanup() da o'chiriladi.
--  * Brauzer bu jadvalni ko'rmaydi ham, yozmaydi ham: faqat server (service_role).
-- Takror ishga tushirish xavfsiz. Faqat ASCII. Talab: 48-migratsiya (ops_cleanup) va 58-migratsiya (ai_ad_posts).

do $m$ begin
  if to_regclass('public.ops_events') is null then
    raise exception '59-migratsiya: avval 48-migratsiya (ops) qo''llanishi kerak';
  end if;
  if to_regclass('public.ai_ad_posts') is null then
    raise exception '59-migratsiya: avval 58-migratsiya (ai-reklama) qo''llanishi kerak';
  end if;
end $m$;

-- -- 1) Kelgan xabarlar qutisi -------------------------------------------------
create table if not exists public.tg_inbox (
  bot_id bigint not null,
  update_id bigint not null,
  kind text not null,
  chat_id bigint not null,
  chat_type text not null,
  chat_title text,
  chat_username text,
  from_id bigint,
  from_name text,
  from_username text,
  text text,
  member_status text,
  at timestamptz not null default now(),
  constraint tg_inbox_pkey primary key (bot_id, update_id),
  constraint tg_inbox_kind_chk check (kind in ('message', 'my_chat_member', 'channel_post')),
  constraint tg_inbox_chat_type_chk check (chat_type in ('private', 'group', 'supergroup', 'channel')),
  -- shaxsiy chatda faqat /start kodi; guruh/kanalda matn yo'q
  constraint tg_inbox_text_chk check ((text is null) or (chat_type = 'private' and text ~ '^/start [A-Za-z0-9_-]{1,64}$')),
  constraint tg_inbox_len_chk check (coalesce(length(chat_title), 0) <= 128 and coalesce(length(chat_username), 0) <= 64
                                     and coalesce(length(from_name), 0) <= 128 and coalesce(length(from_username), 0) <= 64
                                     and coalesce(length(member_status), 0) <= 20)
);
create index if not exists tg_inbox_bot_at on public.tg_inbox (bot_id, at desc);
create index if not exists tg_inbox_bot_text on public.tg_inbox (bot_id, text) where text is not null;

-- -- 2) Huquqlar: faqat server ---------------------------------------------------
alter table public.tg_inbox enable row level security;
revoke all on table public.tg_inbox from public, anon, authenticated;
grant select, insert, update, delete on table public.tg_inbox to service_role;

-- -- 3) Tozalash: 48 soatdan eski yozuvlar (58-migratsiyadagi ops_cleanup + 1 qator) --
create or replace function public.ops_cleanup()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from ops_events where at < now() - interval '30 days';
  delete from tg_outbox where (status = 'sent' and created_at < now() - interval '7 days')
                           or (status = 'failed' and created_at < now() - interval '30 days');
  delete from ops_rate where window_start < now() - interval '1 day';
  delete from ops_alerts where last_sent < now() - interval '30 days';
  delete from ai_ad_posts where created_at < now() - interval '90 days';   -- v25.8 (58)
  delete from tg_inbox where at < now() - interval '48 hours';             -- v25.9 (59)
end $$;
revoke all on function public.ops_cleanup() from public, anon, authenticated;

-- -- 4) Tekshiruv ---------------------------------------------------------------
select '59: tayyor' as natija,
  to_regclass('public.tg_inbox') is not null as inbox_jadvali,
  coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.tg_inbox')), false) as rls_yoqilgan,
  coalesce(not has_table_privilege('anon', to_regclass('public.tg_inbox'), 'select')
       and not has_table_privilege('authenticated', to_regclass('public.tg_inbox'), 'select'), false) as brauzer_kora_olmaydi,
  (select count(*) from pg_constraint where conrelid = to_regclass('public.tg_inbox') and contype in ('p', 'c')) = 5 as cheklovlar_5,
  (select count(*) from pg_indexes where schemaname = 'public' and tablename = 'tg_inbox') = 3 as indekslar_3,
  position('tg_inbox' in pg_get_functiondef('public.ops_cleanup()'::regprocedure)) > 0 as tozalash_ulangan,
  position('ai_ad_posts' in pg_get_functiondef('public.ops_cleanup()'::regprocedure)) > 0 as tozalash_58_saqlangan;
