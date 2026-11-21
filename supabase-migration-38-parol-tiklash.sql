-- ════════════════════════════════════════════════════════════════════════════
-- 38-MIGRATSIYA (v24.9) — PAROLNI TIKLASH (Telegram kod) va SEANSLARNI YOPISH
-- ════════════════════════════════════════════════════════════════════════════
-- Egasi qarori (2026-10-23): «Admin tiklaydi + Telegram kod».
--   • Xodim (egasi ham) o'z Telegramini bir marta ulaydi (botga «Start»). «Parolni unutdingizmi?» →
--     login → botga 6 xonali kod (10 daqiqa, 5 urinish) → yangi parol. Kod bazada faqat xesh ko'rinishida.
--   • Admin xodim parolini tiklasa — vaqtinchalik parol, xodim kirganda yangisini qo'yishga majbur
--     (belgi auth foydalanuvchisining app_metadata'sida — brauzer o'zgartira olmaydi), eski seanslar yopiladi.
-- Faqat QO'SHADI (3 jadval, 1 funksiya). Takror ishga tushirish xavfsiz. Barchasi — faqat server (service_role).

do $$ begin
  if to_regclass('public.staff') is null then
    raise exception '38-migratsiya: avval 5-migratsiya (staff jadvali) qo''llanishi kerak';
  end if;
end $$;

-- ── 1. Xodimning Telegram ulanishi va tiklash kodi ──────────────────────────
create table if not exists public.staff_pw_reset (
  staff_id bigint primary key references public.staff(id) on delete cascade,
  tg_chat_id text,
  tg_name text,
  tg_linked_at timestamptz,
  link_code text,
  link_code_exp timestamptz,
  code_hash text,
  code_exp timestamptz,
  code_attempts integer not null default 0,
  last_sent_at timestamptz,
  sent_count integer not null default 0,
  sent_window timestamptz,
  updated_at timestamptz not null default now(),
  constraint staff_pw_reset_chat_chk check (tg_chat_id is null or tg_chat_id ~ '^-?[0-9]{3,20}$'),
  constraint staff_pw_reset_attempts_chk check (code_attempts between 0 and 100 and sent_count between 0 and 1000)
);
alter table public.staff_pw_reset enable row level security;

-- ── 2. So'rovlar jurnali (IP bo'yicha cheklov — ko'p urinishdan himoya) ──────
create table if not exists public.pw_reset_ip_log (
  id bigint generated always as identity primary key,
  ip text not null,
  at timestamptz not null default now()
);
create index if not exists pw_reset_ip_log_ip_at_idx on public.pw_reset_ip_log (ip, at);
alter table public.pw_reset_ip_log enable row level security;

-- ── 2b. Noto'g'ri parol urinishlari va vaqtinchalik blok (egasi qarori 2026-10-23) ──
-- 5 ta noto'g'ri parol → 15 daqiqa blok; blokdan keyin yana 3 ta noto'g'ri → 30 daqiqa (har safar).
-- To'g'ri kirish, Telegram kod bilan tiklash yoki admin — hisobni tozalaydi. Kalit: 'l:' + login (kichik harf).
create table if not exists public.login_guard (
  login_key text primary key,
  fails integer not null default 0,
  stage integer not null default 0,
  locked_until timestamptz,
  last_fail_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint login_guard_chk check (fails between 0 and 1000 and stage between 0 and 10 and length(login_key) <= 120)
);
alter table public.login_guard enable row level security;

-- ── 3. Foydalanuvchining barcha seanslarini yopish (parol tiklanganda) ──────
-- Auth sxemasi yo'q yoki huquq yetmasa — xato bermaydi (-1): funksiya ishlashda davom etadi,
-- eski kirish tokeni o'z muddati (≈1 soat) tugaguncha amal qiladi.
create or replace function public.fw_revoke_sessions(p_uid uuid)
 returns integer
 language plpgsql
 security definer
 set search_path = ''
as $$
declare
  n integer := 0;
begin
  if p_uid is null then return 0; end if;
  begin
    if to_regclass('auth.sessions') is not null then
      execute 'delete from auth.sessions where user_id = $1' using p_uid;
      get diagnostics n = row_count;
    end if;
    if to_regclass('auth.refresh_tokens') is not null then
      execute 'delete from auth.refresh_tokens where user_id = $1::text' using p_uid;
    end if;
  exception when insufficient_privilege or undefined_column or undefined_table then
    return -1;
  end;
  return n;
end;
$$;

-- ── 4. Huquqlar (faqat server) ─────────────────────────────────────────────
revoke all on table public.staff_pw_reset from public, anon, authenticated;
revoke all on table public.pw_reset_ip_log from public, anon, authenticated;
grant select, insert, update, delete on table public.staff_pw_reset to service_role;
grant select, insert, delete on table public.pw_reset_ip_log to service_role;
revoke all on table public.login_guard from public, anon, authenticated;
grant select, insert, update, delete on table public.login_guard to service_role;
revoke all on function public.fw_revoke_sessions(uuid) from public, anon, authenticated;
grant execute on function public.fw_revoke_sessions(uuid) to service_role;

comment on table public.staff_pw_reset is '38-migratsiya: xodim Telegram ulanishi va parol tiklash kodi (faqat xesh) — faqat server';
comment on table public.login_guard is '38-migratsiya: noto''g''ri parol urinishlari va vaqtinchalik blok (5 → 15 daqiqa, keyin 3 → 30 daqiqa) — faqat server';
comment on table public.pw_reset_ip_log is '38-migratsiya: parol tiklash so''rovlari (IP bo''yicha cheklov) — faqat server';
