-- P0.1 — app-data-save.js uchun RBAC: yangi permission'lar + audit log jadvali.
-- ESLATMA: bu migratsiya production Supabase loyihasiga (dzzxrxudsejhdrbpiifc)
-- 2026-09-23'da to'g'ridan-to'g'ri qo'llangan edi (mcp__Supabase__apply_migration
-- orqali, migration nomi: p0_1_app_data_write_permissions). Bu fayl — o'sha
-- migratsiyaning repo'dagi yozuvi (hujjatlashtirish uchun qo'shildi).

-- 1) Uch modul uchun yetishmayotgan ".edit" permission'lari (avval faqat
--    ".view" bor edi — app-data-save.js RBAC'siz bo'lgani uchun ".edit" kerak
--    emas edi, endi kerak).
insert into permissions (key, module, label) values
  ('taminotchilar.edit', 'taminotchilar', 'Ta''minotchi ma''lumotini tahrirlash'),
  ('hamkorlar.edit',     'hamkorlar',     'Hamkor ma''lumotini tahrirlash'),
  ('ombor.edit',         'ombor',         'Ombor/partiya ma''lumotini tahrirlash')
on conflict (key) do nothing;

-- 2) Orqaga moslik: shu 3 modul uchun ".view" huquqiga ega bo'lgan har bir
--    rolga avtomatik ravishda mos ".edit" huquqi ham beriladi — aks holda
--    hozir shu modullarni tahrirlab kelayotgan xodimlar to'satdan 403 oladi.
insert into role_permissions (role_id, permission_id)
select rp.role_id, p_edit.id
from role_permissions rp
join permissions p_view on p_view.id = rp.permission_id
join permissions p_edit on p_edit.key = replace(p_view.key, '.view', '.edit')
where p_view.key in ('taminotchilar.view', 'hamkorlar.view', 'ombor.view')
on conflict (role_id, permission_id) do nothing;

-- 3) app-data-save.js'da deny-by-default rad etishlarini yozib boruvchi audit
--    jadvali (mavjud 19 ta RLS-yoqilgan-lekin-policy'siz jadvallar bilan bir
--    xil naqsh — faqat service-role kalit orqali yoziladi/o'qiladi).
create table if not exists staff_audit_log (
  id bigint generated always as identity primary key,
  staff_id bigint references staff(id),
  staff_name text,
  filial text,
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);
alter table staff_audit_log enable row level security;
