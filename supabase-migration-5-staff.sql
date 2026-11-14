-- ════════════════════════════════════════════════════════════
-- BIZNES PRO — 5-QO'SHIMCHA MIGRATSIYA: XODIMLAR (SOTUVCHI VA H.K.)
-- ════════════════════════════════════════════════════════════
-- Ichki xodimlar (sotuvchi, kelajakda menejer) uchun login tizimi.
-- Diller kabi alohida "auth" hisobi, lekin ular umumiy do'kon
-- ma'lumotlari (mahsulot/mijoz/kassa) bilan ishlaydi — shuning
-- uchun RLS bilan izolyatsiya emas, faqat kirish nazorati.

create table if not exists public.staff (
  id bigint generated always as identity primary key,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  login text unique not null,
  name text not null,
  role text not null default 'sotuvchi' check (role in ('admin','menejer','sotuvchi','kassir')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.staff enable row level security;

drop policy if exists staff_all_staff on public.staff;
create policy staff_all_staff on public.staff for all to anon using (true) with check (true);

drop policy if exists staff_read_own on public.staff;
create policy staff_read_own on public.staff for select to authenticated
  using (auth_user_id = auth.uid());

-- Tayyor!
