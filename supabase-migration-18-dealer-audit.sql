-- ════════════════════════════════════════════════════════════
-- BIZNES PRO — 18-MIGRATSIYA: Diller amallari uchun to'liq audit jurnali
-- ════════════════════════════════════════════════════════════
-- Har bir diller bilan bog'liq amal uchun: kim, qachon, qaysi filialdan,
-- eski qiymat, yangi qiymat — saqlanadi. Bitta yangi jadval (mavjud
-- auditLog() — S.auditLogs matn ro'yxati — bilan bir xil emas: bu
-- STRUKTURAVIY, so'rov qilinadigan, Hisobotlar moduli foydalana oladigan jurnal).
--
-- Supabase Dashboard → SQL Editor → shu faylni to'liq nusxalab, RUN qiling

create extension if not exists pgcrypto;

create table if not exists public.dealer_audit_log (
  id uuid primary key default gen_random_uuid(),
  dealer_id bigint not null references public.dealers(id) on delete cascade,
  action text not null,           -- 'create'|'update'|'delete'|'stock_send'|'stock_return'|'payment'|'sale'|'order_approve'|'order_reject'
  actor_kind text not null,       -- 'owner' | 'staff'
  actor_name text,
  actor_staff_id bigint,
  filial text not null,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index if not exists dealer_audit_log_dealer_idx on public.dealer_audit_log(dealer_id, created_at desc);
create index if not exists dealer_audit_log_filial_idx on public.dealer_audit_log(filial, created_at desc);

alter table public.dealer_audit_log enable row level security;
-- Policy yo'q — faqat service_role (Netlify Functions) yoza/o'qiy oladi,
-- xuddi boshqa admin-tomon jadvallar (roles, staff va h.k.) kabi.

-- Tayyor! netlify/functions/dealer-audit-log-add.js va dealer-audit-log-list.js orqali ishlaydi.
