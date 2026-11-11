-- Foydalanuvchi eslatmalari jadvali
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists notes_user_id_idx on public.notes (user_id);

alter table public.notes enable row level security;

-- Har bir foydalanuvchi faqat o'z eslatmalarini ko'radi va boshqaradi
create policy "notes_select_own" on public.notes
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "notes_insert_own" on public.notes
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "notes_update_own" on public.notes
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "notes_delete_own" on public.notes
  for delete to authenticated using ((select auth.uid()) = user_id);
