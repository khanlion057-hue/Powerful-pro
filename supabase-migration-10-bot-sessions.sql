-- ════════════════════════════════════════════════════════════
-- BIZNES PRO — 10-MIGRATSIYA: TELEGRAM BOT SUHBAT HOLATI
-- ════════════════════════════════════════════════════════════
-- Bot bilan suhbat qaysi bosqichda ekanini saqlaydi (Netlify
-- funksiyalari holatsiz bo'lgani uchun, har xabar orasida
-- "eslab qolish" kerak).

create table if not exists public.bot_sessions (
  chat_id text primary key,
  dealer_id bigint references public.dealers(id) on delete set null,
  state text not null default 'idle',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.bot_sessions enable row level security;

-- Faqat server (service_role) kirishi mumkin — na anon, na authenticated
drop policy if exists no_public_access on public.bot_sessions;
create policy no_public_access on public.bot_sessions for all to public using (false) with check (false);

-- Tayyor!
