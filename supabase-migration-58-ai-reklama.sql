-- ============================================================================
-- 58-MIGRATSIYA (v25.8) - AI-REKLAMA (onlayn-do'kon mahsulotidan Telegram post / Reels)
-- ============================================================================
-- Egasi qarorlari (2026-11-23): har filial alohida (sozlama, kanal, avtopilot, tarix - branch_id);
-- AI oylik limiti butun tizim uchun bitta. Video va post rasmlari DOIMIY SAQLANMAYDI - bazada faqat matn,
-- metadata va tarix. Brauzer bu jadvallarga to'g'ridan yozmaydi ham, o'qimaydi ham: faqat "ai-ads"
-- funksiyasi (service_role) orqali, RBAC (reklama.*) tekshiruvi bilan.
--
--  1) ai_ad_posts    - postlar tarixi va qoralamalar (90 kundan keyin ops_cleanup o'chiradi)
--  2) ai_usage       - AI oylik hisoblagichi (YYYY-MM); ai_usage_take / ai_usage_release - atomik
--  3) ai_ad_settings - filial bo'yicha AI-reklama sozlamalari (kanal, til, mezonlar, avtopilot)
--  4) Ruxsatlar: reklama.view / reklama.create / reklama.publish / reklama.settings (hech bir rolga avtomatik berilmaydi)
--  5) Storage: ai-ads-tmp (YOPIQ) - Reels videosi vaqtincha (yuborilgach darhol o'chiriladi)
-- Takror ishga tushirish xavfsiz. Faqat ASCII. Talab: 48-migratsiya (ops_cleanup).

do $m$ begin
  if to_regclass('public.ops_events') is null or to_regclass('public.tg_outbox') is null then
    raise exception '58-migratsiya: avval 48-migratsiya (ops) qo''llanishi kerak';
  end if;
end $m$;

-- -- 1) Postlar ---------------------------------------------------------------
create table if not exists public.ai_ad_posts (
  id uuid primary key default gen_random_uuid(),
  branch_id text not null,
  product_id bigint not null,
  format text not null default 'photo',
  template text,
  caption text,
  price_snapshot jsonb,
  status text not null default 'draft',
  source text not null default 'manual',
  tg_chat text,
  tg_message_id bigint,
  error text,
  tries integer not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  expires_at timestamptz,
  constraint ai_ad_posts_format_chk check (format in ('photo', 'video', 'autophoto')),
  constraint ai_ad_posts_status_chk check (status in ('draft', 'sending', 'sent', 'failed', 'skipped', 'expired')),
  constraint ai_ad_posts_source_chk check (source in ('manual', 'autopilot')),
  constraint ai_ad_posts_len_chk check (coalesce(length(caption), 0) <= 2048 and coalesce(length(error), 0) <= 500
                                        and length(branch_id) <= 40 and coalesce(length(template), 0) <= 40)
);
create index if not exists ai_ad_posts_branch_pid on public.ai_ad_posts (branch_id, product_id, created_at desc);
create index if not exists ai_ad_posts_status_at on public.ai_ad_posts (status, created_at);

-- -- 2) AI oylik hisoblagichi --------------------------------------------------
create table if not exists public.ai_usage (
  month text primary key,
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint ai_usage_month_chk check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  constraint ai_usage_count_chk check (count >= 0)
);

-- v25.8: bitta tranzaksiyada - limitdan kam bo'lsa +1 (qatorni qulflab), aks holda rad. {ok, count}
create or replace function public.ai_usage_take(p_month text, p_limit integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path = ''
as $$
declare v_n integer;
begin
  if coalesce(p_month, '') !~ '^[0-9]{4}-[0-9]{2}$' then raise exception 'AI: oy noto''g''ri' using errcode = 'P0001'; end if;
  insert into public.ai_usage (month, count) values (p_month, 0) on conflict (month) do nothing;
  update public.ai_usage set count = count + 1, updated_at = now()
   where month = p_month and count < greatest(coalesce(p_limit, 0), 0)
  returning count into v_n;
  if v_n is null then
    select count into v_n from public.ai_usage where month = p_month;
    return jsonb_build_object('ok', false, 'count', v_n);
  end if;
  return jsonb_build_object('ok', true, 'count', v_n);
end;
$$;

-- v25.8: AI xato bersa - hisobdan chiqmaydi (olingan bitta qaytariladi)
create or replace function public.ai_usage_release(p_month text)
 returns jsonb
 language plpgsql
 security definer
 set search_path = ''
as $$
declare v_n integer;
begin
  update public.ai_usage set count = greatest(count - 1, 0), updated_at = now() where month = p_month returning count into v_n;
  return jsonb_build_object('ok', v_n is not null, 'count', coalesce(v_n, 0));
end;
$$;

-- -- 3) Filial sozlamalari ------------------------------------------------------
create table if not exists public.ai_ad_settings (
  branch_id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text,
  constraint ai_ad_settings_len_chk check (length(branch_id) <= 40 and pg_column_size(data) <= 8192)
);

-- -- Huquqlar: faqat server ---------------------------------------------------
alter table public.ai_ad_posts enable row level security;
alter table public.ai_usage enable row level security;
alter table public.ai_ad_settings enable row level security;
revoke all on table public.ai_ad_posts, public.ai_usage, public.ai_ad_settings from public, anon, authenticated;
grant select, insert, update, delete on table public.ai_ad_posts, public.ai_usage, public.ai_ad_settings to service_role;
revoke all on function public.ai_usage_take(text, integer) from public, anon, authenticated;
revoke all on function public.ai_usage_release(text) from public, anon, authenticated;
grant execute on function public.ai_usage_take(text, integer) to service_role;
grant execute on function public.ai_usage_release(text) to service_role;

-- -- 4) Ruxsatlar (deny-by-default: rolga berilmaydi; admin hammasini ko'radi) --
insert into public.permissions (key, module, label) values
  ('reklama.view', 'reklama', 'AI-reklamani ko''rish (nomzodlar, navbat, tarix)'),
  ('reklama.create', 'reklama', 'AI-reklama posti tayyorlash (matn, rasm, video)'),
  ('reklama.publish', 'reklama', 'AI-reklamani Telegram kanalga yuborish va qoralamani tasdiqlash'),
  ('reklama.settings', 'reklama', 'AI-reklama sozlamalari (kanal, til, mezonlar, avtopilot)')
on conflict (key) do nothing;

-- -- 5) Vaqtinchalik video uchun yopiq bucket ---------------------------------
insert into storage.buckets (id, name, public) values ('ai-ads-tmp', 'ai-ads-tmp', false)
on conflict (id) do update set public = false;
do $m$ begin
  -- Supabase'da: 20 MB va faqat MP4 (test bazasida bu ustunlar bo'lmasligi mumkin)
  if exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
    execute $q$update storage.buckets set file_size_limit = 20971520, allowed_mime_types = array['video/mp4'] where id = 'ai-ads-tmp'$q$;
  end if;
end $m$;

-- -- 6) Tozalash: 90 kundan eski postlar (48-migratsiyadagi ops_cleanup + 1 qator) --
create or replace function public.ops_cleanup()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from ops_events where at < now() - interval '30 days';
  delete from tg_outbox where (status = 'sent' and created_at < now() - interval '7 days')
                           or (status = 'failed' and created_at < now() - interval '30 days');
  delete from ops_rate where window_start < now() - interval '1 day';
  delete from ops_alerts where last_sent < now() - interval '30 days';
  delete from ai_ad_posts where created_at < now() - interval '90 days';   -- v25.8 (58)
end $$;
revoke all on function public.ops_cleanup() from public, anon, authenticated;

select '58: tayyor' as natija,
  to_regclass('public.ai_ad_posts') is not null as postlar,
  to_regclass('public.ai_usage') is not null as ai_hisob,
  to_regclass('public.ai_ad_settings') is not null as sozlamalar,
  (select count(*) from public.permissions where key like 'reklama.%') as ruxsatlar,
  (select count(*) from storage.buckets where id = 'ai-ads-tmp' and not public) as video_bucket_yopiq;
