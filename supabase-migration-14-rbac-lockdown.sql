-- ════════════════════════════════════════════════════════════
-- BIZNES PRO — 14-MIGRATSIYA: RBAC jadvallarini qulflash
-- ════════════════════════════════════════════════════════════
-- Sabab: roles/permissions/role_permissions/staff_roles endi FAQAT
-- Netlify Functions (rbac-*.js, service_role kalit bilan) orqali
-- ishlaydi. Brauzer (anon yoki authenticated) endi bu jadvallarga
-- to'g'ridan-to'g'ri kira olmasligi kerak — service_role RLS'ni
-- avtomatik chetlab o'tadi, shuning uchun policy qoldirish shart emas.
--
-- Supabase Dashboard → SQL Editor → shu faylni to'liq nusxalab, RUN qiling
-- MUHIM: bu migratsiyadan keyin eski (13-migratsiyadagi) anon/authenticated
-- policy'lar bilan brauzerdan to'g'ridan-to'g'ri so'rov yubormang — endi
-- ishlamaydi. Bu ATAYLAB shunday (xavfsizlik uchun).

drop policy if exists roles_anon_all on public.roles;
drop policy if exists roles_read_auth on public.roles;
drop policy if exists perms_anon_all on public.permissions;
drop policy if exists perms_read_auth on public.permissions;
drop policy if exists rp_anon_all on public.role_permissions;
drop policy if exists rp_read_auth on public.role_permissions;
drop policy if exists sr_anon_all on public.staff_roles;
drop policy if exists sr_read_own on public.staff_roles;

-- RLS yoqilgan holda qoladi, lekin ENDI HECH QANDAY policy yo'q —
-- demak anon va authenticated uchun HAMMA amal (SELECT/INSERT/UPDATE/DELETE)
-- avtomatik rad etiladi. Faqat service_role (Netlify Functions) ishlay oladi.
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.staff_roles enable row level security;

-- Tayyor! Endi bu 4 ta jadvalga faqat netlify/functions/rbac-*.js orqali kirish mumkin.

