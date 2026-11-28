-- ════════════════════════════════════════════════════════════
-- BIZNES PRO — 13-MIGRATSIYA: RBAC (Role-Based Access Control)
-- Supabase Dashboard → SQL Editor → shu faylni to'liq nusxalab, RUN qiling
-- ════════════════════════════════════════════════════════════
-- Maqsad: rollar va ruxsatlar to'liq bazada saqlanadi. Yangi rol qo'shish,
-- ruxsatlarni o'zgartirish — barchasi admin panel orqali, KOD O'ZGARISHISIZ.
-- Faqat tizimning o'zi qo'llab-quvvatlaydigan YANGI FUNKSIYA qo'shilganda
-- (masalan yangi modul) — o'sha yangi ruxsat kalitini PERMISSIONS_CATALOG'ga
-- (js/main.js) qo'shish kerak bo'ladi, chunki bu haqiqatan ham yangi kod.

create extension if not exists pgcrypto;

-- ── ROLLAR ──
create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  name text not null,
  description text,
  is_system boolean not null default false,   -- tizim rollari (Owner, Administrator, Dealer) o'chirilmaydi
  created_at timestamptz not null default now()
);

-- ── RUXSATLAR KATALOGI ──
create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,        -- masalan 'savdo.view', 'mahsulot.delete'
  module text not null,            -- guruhlash uchun: 'savdo', 'mahsulotlar' ...
  label text not null,
  created_at timestamptz not null default now()
);

-- ── ROL <-> RUXSAT (ko'p-ko'pga) ──
create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

-- ── XODIM <-> ROL (ko'p-ko'pga, bitta xodim bir nechta rolga ega bo'lishi mumkin) ──
create table if not exists public.staff_roles (
  staff_id bigint not null references public.staff(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  primary key (staff_id, role_id)
);

alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.staff_roles enable row level security;

-- Admin panel anon kalit bilan to'liq boshqaradi (mavjud arxitekturaga mos, PIN himoyalangan)
drop policy if exists roles_anon_all on public.roles;
create policy roles_anon_all on public.roles for all to anon using (true) with check (true);
drop policy if exists perms_anon_all on public.permissions;
create policy perms_anon_all on public.permissions for all to anon using (true) with check (true);
drop policy if exists rp_anon_all on public.role_permissions;
create policy rp_anon_all on public.role_permissions for all to anon using (true) with check (true);
drop policy if exists sr_anon_all on public.staff_roles;
create policy sr_anon_all on public.staff_roles for all to anon using (true) with check (true);

-- Xodim/diller o'zi login qilgach (authenticated), faqat O'QISH huquqi — frontendda ruxsat tekshirish uchun
drop policy if exists roles_read_auth on public.roles;
create policy roles_read_auth on public.roles for select to authenticated using (true);
drop policy if exists perms_read_auth on public.permissions;
create policy perms_read_auth on public.permissions for select to authenticated using (true);
drop policy if exists rp_read_auth on public.role_permissions;
create policy rp_read_auth on public.role_permissions for select to authenticated using (true);
drop policy if exists sr_read_own on public.staff_roles;
create policy sr_read_own on public.staff_roles for select to authenticated
  using (staff_id in (select id from public.staff where auth_user_id = auth.uid()));

-- Eski staff.role ustunidagi qattiq CHECK cheklovini olib tashlaymiz (endi moslashuvchan RBAC ishlaydi)
alter table public.staff drop constraint if exists staff_role_check;

-- ═══ STANDART ROLLAR (talab qilingan 9 tasi, o'zbek tilida) ═══
insert into public.roles (key, name, description, is_system) values
  ('owner',              'Korxona egasi',    'Egasi — barcha huquqlarga ega, tizim roli, o''chirib bo''lmaydi', true),
  ('administrator',      'Administrator',     'Deyarli barcha huquqlar, jumladan rollarni boshqarish', true),
  ('branch_manager',     'Filial menejeri',   'Filial menejeri — Dashboard, Savdo, Sklad, Moliya', false),
  ('cashier',            'Kassir',            'Kassir — Dashboard, Kassa, Savdo', false),
  ('warehouse_manager',  'Ombor mudiri',      'Ombor mudiri — Mahsulotlar, Ombor, Kirim', false),
  ('sales_manager',      'Savdo menejeri',    'Savdo menejeri — Savdo, Mijozlar, Hisobot', false),
  ('accountant',         'Hisobchi',          'Hisobchi — Kassalar, Xarajatlar, Hisobot, Hamkorlar', false),
  ('dealer',             'Diller',            'Diller — alohida portal (diller.html), admin panelga kirmaydi', true),
  ('employee',           'Xodim',             'Oddiy xodim — yengil sotuvchi portali (sotuvchi.html)', false)
on conflict (key) do nothing;

-- ═══ RUXSATLAR KATALOGI (modul.amal) ═══
insert into public.permissions (key, module, label) values
  ('dashboard.view',        'dashboard',     'Bosh sahifani ko''rish'),
  ('savdo.view',             'savdo',         'Savdo bo''limini ko''rish'),
  ('savdo.create',           'savdo',         'Yangi savdo yaratish'),
  ('savdo.edit',              'savdo',         'Savdoni tahrirlash'),
  ('savdo.delete',            'savdo',         'Savdoni o''chirish'),
  ('qaytarish.view',         'qaytarish',     'Qaytarishlarni ko''rish'),
  ('qaytarish.create',       'qaytarish',     'Qaytarish qilish'),
  ('mahsulotlar.view',       'mahsulotlar',   'Mahsulotlarni ko''rish'),
  ('mahsulotlar.create',     'mahsulotlar',   'Mahsulot qo''shish'),
  ('mahsulotlar.edit',        'mahsulotlar',   'Mahsulotni tahrirlash'),
  ('mahsulotlar.delete',      'mahsulotlar',   'Mahsulotni o''chirish'),
  ('ombor.view',              'ombor',         'Omborni (FIFO) ko''rish'),
  ('kirim.view',              'kirim',         'Import/Kirimni ko''rish'),
  ('kirim.create',            'kirim',         'Yangi kirim qilish'),
  ('mijozlar.view',           'mijozlar',      'Mijozlarni ko''rish'),
  ('mijozlar.edit',            'mijozlar',      'Mijoz ma''lumotini tahrirlash'),
  ('mijozlar.debt_payment',    'mijozlar',      'Mijoz qarzini qabul qilish'),
  ('taminotchilar.view',       'taminotchilar', 'Ta''minotchilarni ko''rish'),
  ('hamkorlar.view',           'hamkorlar',     'Hamkorlarni ko''rish'),
  ('hamkorlar.calc',           'hamkorlar',     'Oylik foyda taqsimotini hisoblash'),
  ('dillerlar.view',           'dillerlar',     'Dillerlar bo''limini ko''rish'),
  ('dillerlar.manage',         'dillerlar',     'Diller qo''shish/tahrirlash/o''chirish'),
  ('dillerlar.orders',         'dillerlar',     'Diller buyurtmalarini tasdiqlash/rad etish'),
  ('sotuvchilar.view',         'sotuvchilar',   'Xodimlar ro''yxatini ko''rish'),
  ('sotuvchilar.manage',       'sotuvchilar',   'Xodim qo''shish/tahrirlash/o''chirish'),
  ('kassalar.view',            'kassalar',      'Kassalarni ko''rish'),
  ('kassalar.transact',        'kassalar',      'Kirim/Chiqim/Ko''chirish qilish'),
  ('xarajatlar.view',          'xarajatlar',    'Xarajatlarni ko''rish'),
  ('xarajatlar.create',        'xarajatlar',    'Xarajat qo''shish'),
  ('hisobot.view',             'hisobot',       'Hisobotlarni ko''rish'),
  ('hisobot.export',           'hisobot',       'Excel eksport qilish'),
  ('sozlamalar.view',          'sozlamalar',    'Sozlamalarni ko''rish'),
  ('sozlamalar.edit',           'sozlamalar',    'Sozlamalarni o''zgartirish'),
  ('rollar.manage',             'rollar',        'Rol va ruxsatlarni boshqarish')
on conflict (key) do nothing;

-- ═══ STANDART ROLLARGA BOSHLANG'ICH RUXSATLARNI BIRIKTIRISH ═══
-- (Bular faqat BOSHLANG'ICH holat — admin "Rollar" sahifasidan istalgan vaqt o'zgartira oladi)

-- Owner va Administrator — HAMMA ruxsat
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key in ('owner','administrator')
on conflict do nothing;

-- Branch Manager
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'dashboard.view','savdo.view','savdo.create','savdo.edit','qaytarish.view','qaytarish.create',
  'ombor.view','mahsulotlar.view','kirim.view','kassalar.view','kassalar.transact',
  'xarajatlar.view','xarajatlar.create','hisobot.view','mijozlar.view','mijozlar.debt_payment'
) where r.key='branch_manager'
on conflict do nothing;

-- Cashier
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'dashboard.view','kassalar.view','kassalar.transact','savdo.view','savdo.create','mijozlar.debt_payment'
) where r.key='cashier'
on conflict do nothing;

-- Warehouse Manager
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'dashboard.view','mahsulotlar.view','mahsulotlar.create','mahsulotlar.edit',
  'ombor.view','kirim.view','kirim.create'
) where r.key='warehouse_manager'
on conflict do nothing;

-- Sales Manager
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'dashboard.view','savdo.view','savdo.create','savdo.edit','qaytarish.view','qaytarish.create',
  'mijozlar.view','mijozlar.edit','mijozlar.debt_payment','hisobot.view'
) where r.key='sales_manager'
on conflict do nothing;

-- Accountant
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'dashboard.view','kassalar.view','kassalar.transact','xarajatlar.view','xarajatlar.create',
  'hisobot.view','hisobot.export','hamkorlar.view','hamkorlar.calc','taminotchilar.view'
) where r.key='accountant'
on conflict do nothing;

-- Employee — minimal (yengil sotuvchi.html portalidan foydalanadi)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in ('dashboard.view')
where r.key='employee'
on conflict do nothing;

-- ═══ MAVJUD staff.role QIYMATLARINI YANGI TIZIMGA KO'CHIRISH ═══
insert into public.staff_roles (staff_id, role_id)
select s.id, r.id from public.staff s
join public.roles r on
  (s.role='admin'    and r.key='administrator') or
  (s.role='menejer'  and r.key='branch_manager') or
  (s.role='kassir'   and r.key='cashier') or
  (s.role='sotuvchi' and r.key='employee')
on conflict do nothing;

-- Tayyor! Endi js/main.js dagi "🔐 Rollar" sahifasidan rollarni boshqarishingiz mumkin.
