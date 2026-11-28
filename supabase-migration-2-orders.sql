-- ════════════════════════════════════════════════════════════
-- BIZNES PRO — 2-QO'SHIMCHA MIGRATSIYA: DILLER BUYURTMA TIZIMI
-- (Bu — 1-migratsiyadan KEYIN, alohida ishga tushiriladi)
-- ════════════════════════════════════════════════════════════
--
-- NIMA UCHUN: Diller endi asosiy ombordan tovar "so'rashi" (buyurtma berishi)
-- mumkin bo'ladi, lekin bu avtomatik o'tkazilmaydi — SIZ tasdiqlaguningizcha
-- "kutilmoqda" holatida turadi. Tasdiqlaganingizdan keyingina uning
-- omboriga o'tkaziladi.

-- Katalog — diller ko'radigan, xavfsiz (narx/tannarxsiz) mahsulot ro'yxati.
create table if not exists public.catalog_products (
  id bigint primary key,
  sku text,
  name text,
  qty numeric not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.catalog_products enable row level security;

drop policy if exists staff_all_catalog on public.catalog_products;
create policy staff_all_catalog on public.catalog_products for all to anon using (true) with check (true);

drop policy if exists dealer_read_catalog on public.catalog_products;
create policy dealer_read_catalog on public.catalog_products for select to authenticated using (true);

-- Diller buyurtmalari
create table if not exists public.dealer_orders (
  id bigint generated always as identity primary key,
  dealer_id bigint not null references public.dealers(id) on delete cascade,
  items jsonb not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_dealer_orders_dealer on public.dealer_orders(dealer_id, status);

alter table public.dealer_orders enable row level security;

drop policy if exists staff_all_orders on public.dealer_orders;
create policy staff_all_orders on public.dealer_orders for all to anon using (true) with check (true);

drop policy if exists dealer_read_own_orders on public.dealer_orders;
create policy dealer_read_own_orders on public.dealer_orders for select to authenticated
  using (dealer_id in (select id from public.dealers where auth_user_id = auth.uid()));

drop policy if exists dealer_insert_own_orders on public.dealer_orders;
create policy dealer_insert_own_orders on public.dealer_orders for insert to authenticated
  with check (
    dealer_id in (select id from public.dealers where auth_user_id = auth.uid())
    and status = 'pending'
  );

-- ════════════════════════════════════════════════════════════
-- Tayyor! Endi saytni yangilangan fayllar bilan qayta yuklang
-- (index.html, diller.html, js/main.js, js/diller.js).
-- ════════════════════════════════════════════════════════════
