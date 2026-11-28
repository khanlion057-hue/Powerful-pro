-- ════════════════════════════════════════════════════════════
-- BIZNES PRO — 15-MIGRATSIYA: staff jadvalini qulflash
-- ════════════════════════════════════════════════════════════
-- Sabab: staff endi FAQAT Netlify Functions orqali ishlaydi:
--   staff-list.js, staff-delete.js, staff-whoami.js,
--   create-staff.js, update-staff.js — barchasi service_role bilan.
-- "staff_read_own" policy'si ham olib tashlanadi, chunki login vaqtidagi
-- o'qish endi staff-whoami Function ichida (token server tomonda
-- tekshirilgach) service_role bilan amalga oshadi — brauzer to'g'ridan-to'g'ri
-- staff jadvaliga kira olmaydi.
--
-- MUHIM: bu migratsiyadan oldin js/main.js va netlify/functions/staff-*.js
-- allaqachon deploy qilingan bo'lishi shart (aks holda vaqtincha login ishlamay qoladi).
--
-- Supabase Dashboard → SQL Editor → shu faylni to'liq nusxalab, RUN qiling

drop policy if exists staff_all_staff on public.staff;
drop policy if exists staff_read_own on public.staff;

alter table public.staff enable row level security;
-- Policy yo'q — anon va authenticated uchun HAMMA amal (SELECT/INSERT/UPDATE/DELETE)
-- avtomatik rad etiladi. Faqat service_role (Netlify Functions) ishlay oladi.

-- Tayyor! Endi staff jadvaliga faqat netlify/functions/staff-*.js va *-staff.js orqali kirish mumkin.
