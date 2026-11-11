-- ════════════════════════════════════════════════════════════
-- BIZNES PRO — DILLER/OMBORCHI MODULI UCHUN MIGRATSIYA
-- Supabase Dashboard → SQL Editor → shu faylni to'liq nusxalab, RUN qiling
-- ════════════════════════════════════════════════════════════
--
-- BU NIMA UCHUN KERAK:
-- Hozirgi tizimda barcha ma'lumot bitta "app_data" jadvalida, bitta
-- qatorda saqlanadi. Bu — dillerlar bir-birining ma'lumotini
-- ko'rmasligini KAFOLATLAY olmaydi. Shu sabab, diller/omborchi
-- ma'lumotlari uchun ALOHIDA jadvallar yaratamiz va har biriga
-- "faqat o'ziniki" qoidasini (Row Level Security) qo'yamiz.
--
-- SIZNING ICHKI XODIMLARINGIZ (admin/menejer/kassir) — hozirgidek
-- ishlashda davom etadi, ular Supabase'ga alohida login qilmaydi
-- (ilova ichidagi oddiy PIN/parol yetarli). Faqat DILLERLAR/OMBORCHI
-- Supabase orqali haqiqiy login qiladi.

-- ── 1. JADVALLAR ────────────────────────────────────────────

create table if not exists public.dealers (
  id bigint generated always as identity primary key,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  login text unique not null,              -- diller kiritadigan login (ism)
  name text not null,
  phone text,
  region text,
  debt_usd numeric not null default 0,
  total_shipped_usd numeric not null default 0,
  total_sold_usd numeric not null default 0,
  total_paid_usd numeric not null default 0,
  color text,
  av text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.dealer_stock (
  id bigint generated always as identity primary key,
  dealer_id bigint not null references public.dealers(id) on delete cascade,
  pid bigint not null,                     -- asosiy mahsulot id (app_data.products dan)
  sku text,
  name text,
  qty numeric not null default 0,
  avg_cost_usd numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (dealer_id, pid)
);

create table if not exists public.dealer_sales (
  id bigint generated always as identity primary key,
  dealer_id bigint not null references public.dealers(id) on delete cascade,
  pid bigint not null,
  sku text,
  name text,
  qty numeric not null,
  sell_usd numeric not null,
  total_usd numeric not null,
  sale_date date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.dealer_payments (
  id bigint generated always as identity primary key,
  dealer_id bigint not null references public.dealers(id) on delete cascade,
  amount_usd numeric not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.dealer_stock_moves (
  id bigint generated always as identity primary key,
  dealer_id bigint not null references public.dealers(id) on delete cascade,
  type text not null check (type in ('send','return')),
  pid bigint not null,
  sku text,
  name text,
  qty numeric not null,
  cost_usd numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_dealer_stock_dealer on public.dealer_stock(dealer_id);
create index if not exists idx_dealer_sales_dealer  on public.dealer_sales(dealer_id, sale_date);
create index if not exists idx_dealer_payments_dealer on public.dealer_payments(dealer_id);
create index if not exists idx_dealer_moves_dealer   on public.dealer_stock_moves(dealer_id);

-- ── 2. ROW LEVEL SECURITY YOQISH ────────────────────────────

alter table public.dealers            enable row level security;
alter table public.dealer_stock       enable row level security;
alter table public.dealer_sales       enable row level security;
alter table public.dealer_payments    enable row level security;
alter table public.dealer_stock_moves enable row level security;

-- ── 3. XODIMLAR (siz, admin/menejer/kassir) — to'liq ruxsat ──
-- Ilova Supabase'ga "anon" kalit bilan ulanadi (Supabase login qilmaydi),
-- shuning uchun "anon" roliga to'liq CRUD beramiz — bu hozirgi
-- xatti-harakatni saqlab qoladi.

create policy staff_all_dealers on public.dealers            for all to anon using (true) with check (true);
create policy staff_all_stock   on public.dealer_stock       for all to anon using (true) with check (true);
create policy staff_all_sales   on public.dealer_sales       for all to anon using (true) with check (true);
create policy staff_all_pay     on public.dealer_payments    for all to anon using (true) with check (true);
create policy staff_all_moves   on public.dealer_stock_moves for all to anon using (true) with check (true);

-- ── 4. DILLER (haqiqiy Supabase login qilgan) — FAQAT O'ZINIKI ──

create policy dealer_read_self on public.dealers for select to authenticated
  using (auth_user_id = auth.uid());

create policy dealer_read_stock on public.dealer_stock for select to authenticated
  using (dealer_id in (select id from public.dealers where auth_user_id = auth.uid()));

create policy dealer_read_sales on public.dealer_sales for select to authenticated
  using (dealer_id in (select id from public.dealers where auth_user_id = auth.uid()));

create policy dealer_read_payments on public.dealer_payments for select to authenticated
  using (dealer_id in (select id from public.dealers where auth_user_id = auth.uid()));

-- Diller o'z omboriga/savdosiga to'g'ridan-to'g'ri YOZA olmaydi —
-- faqat pastdagi maxsus funksiya orqali, chunki u zaxirani tekshirib,
-- xato yoki firibgarlik (masalan o'zi omborni "to'ldirib qo'yish") ni oldini oladi.

-- ── 5. "SOTDIM" FUNKSIYASI — diller shu orqali savdo kiritadi ──

create or replace function public.record_dealer_sale(
  p_pid bigint, p_qty numeric, p_sell_usd numeric, p_sku text, p_name text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dealer_id bigint;
  v_stock numeric;
begin
  select id into v_dealer_id from dealers where auth_user_id = auth.uid();
  if v_dealer_id is null then
    raise exception 'Diller topilmadi — login qilinmagan';
  end if;
  if p_qty <= 0 then
    raise exception 'Miqdor 0 dan katta bo''lishi kerak';
  end if;

  select qty into v_stock from dealer_stock where dealer_id = v_dealer_id and pid = p_pid;
  if v_stock is null or v_stock < p_qty then
    raise exception 'Omborda yetarli mahsulot yo''q (bor: %, so''ralgan: %)', coalesce(v_stock,0), p_qty;
  end if;

  update dealer_stock set qty = qty - p_qty, updated_at = now()
    where dealer_id = v_dealer_id and pid = p_pid;

  insert into dealer_sales (dealer_id, pid, sku, name, qty, sell_usd, total_usd, sale_date)
    values (v_dealer_id, p_pid, p_sku, p_name, p_qty, p_sell_usd, p_qty*p_sell_usd, current_date);

  update dealers set
    total_sold_usd = total_sold_usd + (p_qty*p_sell_usd),
    debt_usd        = debt_usd + (p_qty*p_sell_usd)
  where id = v_dealer_id;
end;
$$;

grant execute on function public.record_dealer_sale(bigint, numeric, numeric, text, text) to authenticated;

-- ════════════════════════════════════════════════════════════
-- DILLER BUYURTMA TIZIMI — diller asosiy ombordan tovar so'raydi,
-- admin tasdiqlagandan keyingina uning omboriga o'tkaziladi
-- ════════════════════════════════════════════════════════════

-- Katalog — diller ko'radigan, xavfsiz (narx/tannarxsiz) mahsulot ro'yxati.
-- Admin ilovasi har safar saqlaganda avtomatik yangilab turadi.
create table if not exists public.catalog_products (
  id bigint primary key,           -- asosiy mahsulot id (app_data.products dan)
  sku text,
  name text,
  qty numeric not null default 0,  -- asosiy ombordagi mavjud qoldiq
  updated_at timestamptz not null default now()
);

alter table public.catalog_products enable row level security;
create policy staff_all_catalog on public.catalog_products for all to anon using (true) with check (true);
create policy dealer_read_catalog on public.catalog_products for select to authenticated using (true);

-- Diller buyurtmalari — "pending" holatda yaratiladi, admin tasdiqlaydi/rad etadi
create table if not exists public.dealer_orders (
  id bigint generated always as identity primary key,
  dealer_id bigint not null references public.dealers(id) on delete cascade,
  items jsonb not null,             -- [{pid, sku, name, qty}, ...]
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_dealer_orders_dealer on public.dealer_orders(dealer_id, status);

alter table public.dealer_orders enable row level security;

-- Xodimlar (anon) — to'liq ruxsat (tasdiqlash/rad etish shu orqali)
create policy staff_all_orders on public.dealer_orders for all to anon using (true) with check (true);

-- Diller — faqat o'z buyurtmasini ko'radi va yangi buyurtma yaratadi (pending holatda)
create policy dealer_read_own_orders on public.dealer_orders for select to authenticated
  using (dealer_id in (select id from public.dealers where auth_user_id = auth.uid()));

create policy dealer_insert_own_orders on public.dealer_orders for insert to authenticated
  with check (
    dealer_id in (select id from public.dealers where auth_user_id = auth.uid())
    and status = 'pending'
  );

-- ════════════════════════════════════════════════════════════
-- MIGRATSIYADAN KEYIN QILINADIGAN QADAMLAR (Supabase Dashboard'da):
--
-- 1. Authentication → Providers → Email → "Confirm email" ni OʻCHIRING.
--    (Diller login@ichki-domen bilan kiradi, u email tasdiqlay olmaydi,
--     shuning uchun tasdiqlashsiz kirish YOQILGAN bo'lishi shart.)
--
-- 2. Shundan keyin ilova ichidan "+ Diller qo'shish" tugmasi orqali
--    yangi diller yaratsangiz — tizim avtomatik Supabase Auth
--    hisobini ham yaratadi, buni qo'lda qilish shart emas.
-- ════════════════════════════════════════════════════════════
