-- ════════════════════════════════════════════════════════════
-- BIZNES PRO — 0-MIGRATSIYA: ASOSIY "app_data" JADVALI
-- BU FAYLNI ENG BIRINCHI boʻlib RUN qiling (yangi Supabase loyihasida)
-- ════════════════════════════════════════════════════════════
-- Butun tizimning asosiy holati (mahsulotlar, savdo, kassa va h.k.)
-- shu bitta jadvalda, bitta qatorda (id='main'), JSON (jsonb) sifatida saqlanadi.

create table if not exists public.app_data (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_data enable row level security;

drop policy if exists app_data_all on public.app_data;
create policy app_data_all on public.app_data for all to anon using (true) with check (true);

-- Boshqa qurilmalarda real vaqtda yangilanishi uchun (ilova shuni kutadi)
alter publication supabase_realtime add table public.app_data;

-- Tayyor! Endi qolgan migratsiya fayllarini RAQAM TARTIBIDA
-- (supabase-migration.sql, keyin -2-, -3- va hokazo, oxirida -11-filial.sql) RUN qiling.
