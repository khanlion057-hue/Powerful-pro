-- ═══════════════════════════════════════════════════════════════════════════
-- 48-MIGRATSIYA (v25.2) — YUKLAMA VA NAZORATGA TAYYORLIK (egasi talabi: bepul tarif, 20 xodim)
-- ═══════════════════════════════════════════════════════════════════════════
--   ops_rate       — so'rovlar cheklovi (IP bo'yicha, qat'iy oyna): ops_rate_hit(kalit, limit, soniya) → ruxsatmi
--   ops_events     — xatolar jurnali (server 500, sekin javob, brauzer xatosi) — 30 kun saqlanadi
--   ops_alerts     — Telegram ogohlantirishini takrorlamaslik (bir xil xato — 10 daqiqada ko'pi bilan bitta)
--   tg_outbox      — Telegram navbati: darhol yuborilmagan xabar shu yerda kutadi, soatlik ish qayta yuboradi
--   ops_usage()    — bepul tarif chegaralariga nisbatan holat (baza, rasmlar, xatolar, navbat)
--   ops_cleanup()  — eski yozuvlarni tozalash (soatlik ishda)
-- Hammasi faqat server (service_role) uchun: RLS yoqilgan, siyosat yo'q; anon/authenticated'dan huquq olib tashlangan.
-- Faqat yangi jadval va funksiya qo'shiladi — mavjud ma'lumotga tegilmaydi. Takror ishga tushirish xavfsiz.

create table if not exists public.ops_rate (
  key text primary key,
  window_start timestamptz not null default now(),
  cnt integer not null default 0
);

create table if not exists public.ops_events (
  id bigserial primary key,
  at timestamptz not null default now(),
  kind text not null check (kind in ('error', 'slow', 'client', 'rate', 'tg')),
  fn text,
  msg text,
  alert_key text
);
create index if not exists ops_events_at_idx on public.ops_events (at);

create table if not exists public.ops_alerts (
  key text primary key,
  last_sent timestamptz,
  suppressed integer not null default 0
);

create table if not exists public.tg_outbox (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  chat text not null,
  text text not null,
  kind text,
  tries integer not null default 0,
  next_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  last_error text
);
create index if not exists tg_outbox_pending_idx on public.tg_outbox (next_at) where status = 'pending';

alter table public.ops_rate enable row level security;
alter table public.ops_events enable row level security;
alter table public.ops_alerts enable row level security;
alter table public.tg_outbox enable row level security;
revoke all on public.ops_rate, public.ops_events, public.ops_alerts, public.tg_outbox from anon, authenticated;

-- So'rovlar cheklovi: kalit bo'yicha p_window_s soniyalik oynadagi so'rovlar soni (shu so'rov bilan).
-- Server: son > p_limit bo'lsa — rad etadi; son = p_limit + 1 (birinchi oshish) bo'lsa — bir marta jurnalga yozadi.
create or replace function public.ops_rate_hit(p_key text, p_limit integer, p_window_s integer)
returns integer language plpgsql security definer set search_path = public as $$
declare v_cnt integer;
begin
  insert into ops_rate (key, window_start, cnt) values (left(p_key, 200), now(), 1)
  on conflict (key) do update set
    cnt = case when ops_rate.window_start < now() - make_interval(secs => p_window_s) then 1 else ops_rate.cnt + 1 end,
    window_start = case when ops_rate.window_start < now() - make_interval(secs => p_window_s) then now() else ops_rate.window_start end
  returning cnt into v_cnt;
  return v_cnt;
end $$;

-- Hodisani jurnalga yozadi va ogohlantirish yuborish kerakmi — aytadi (oynada birinchi bo'lsa — true)
create or replace function public.ops_alert(p_key text, p_kind text, p_fn text, p_msg text, p_window_s integer)
returns table (send boolean, suppressed integer) language plpgsql security definer set search_path = public as $$
declare v_last timestamptz; v_sup integer;
begin
  insert into ops_events (kind, fn, msg, alert_key) values (p_kind, left(p_fn, 60), left(p_msg, 500), left(p_key, 200));
  select a.last_sent, a.suppressed into v_last, v_sup from ops_alerts a where a.key = left(p_key, 200) for update;
  if not found then
    insert into ops_alerts (key, last_sent, suppressed) values (left(p_key, 200), now(), 0) on conflict (key) do nothing;
    return query select true, 0; return;
  end if;
  if v_last is null or v_last < now() - make_interval(secs => p_window_s) then
    update ops_alerts set last_sent = now(), suppressed = 0 where key = left(p_key, 200);
    return query select true, v_sup; return;
  end if;
  update ops_alerts set suppressed = ops_alerts.suppressed + 1 where key = left(p_key, 200);
  return query select false, v_sup + 1;
end $$;

-- Bepul tarif chegaralariga nisbatan holat (Supabase Free: baza 500 MB, fayllar 1 GB)
create or replace function public.ops_usage()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_storage bigint := 0;
begin
  begin
    select coalesce(sum((metadata ->> 'size')::bigint), 0) into v_storage from storage.objects;
  exception when others then v_storage := null;
  end;
  return jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'storage_bytes', v_storage,
    'errors_24h', (select count(*) from ops_events where kind in ('error', 'client') and at > now() - interval '1 day'),
    'slow_24h', (select count(*) from ops_events where kind = 'slow' and at > now() - interval '1 day'),
    'rate_24h', (select count(*) from ops_events where kind = 'rate' and at > now() - interval '1 day'),
    'outbox_pending', (select count(*) from tg_outbox where status = 'pending'),
    'outbox_failed_24h', (select count(*) from tg_outbox where status = 'failed' and created_at > now() - interval '1 day')
  );
end $$;

-- Tozalash: jurnal 30 kun, yuborilgan xabarlar 7 kun, yuborilmaganlar 30 kun, eski cheklov oynalari 1 kun
create or replace function public.ops_cleanup()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from ops_events where at < now() - interval '30 days';
  delete from tg_outbox where (status = 'sent' and created_at < now() - interval '7 days')
                           or (status = 'failed' and created_at < now() - interval '30 days');
  delete from ops_rate where window_start < now() - interval '1 day';
  delete from ops_alerts where last_sent < now() - interval '30 days';
end $$;

revoke all on function public.ops_rate_hit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.ops_alert(text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.ops_usage() from public, anon, authenticated;
revoke all on function public.ops_cleanup() from public, anon, authenticated;
grant execute on function public.ops_rate_hit(text, integer, integer) to service_role;
grant execute on function public.ops_alert(text, text, text, text, integer) to service_role;
grant execute on function public.ops_usage() to service_role;
grant execute on function public.ops_cleanup() to service_role;
