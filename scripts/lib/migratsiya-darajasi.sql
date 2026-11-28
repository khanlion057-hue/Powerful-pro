-- Powerful PRO v24.5 — bazadagi migratsiya darajasi (FAQAT O'QIYDI). Har qator: "<raqam> <belgi> <t|f>".
-- scripts/backup-before-deploy.sh (manifest) va scripts/migrate-v24.5.sh (--check, oldin/keyin) ishlatadi.
-- Belgi — o'sha migratsiya yaratadigan asosiy obyekt. 35 ("diller-ombor-atomik") — dealer_ship_atomic funksiyasi
-- (supabase-migration-35-diller-ombor-atomik.sql yaratadi; tekshirildi).
begin read only;
select '23 firma_kassa_ledger', to_regclass('public.firma_kassa_ledger') is not null union all
select '24 cashbox_ledger', to_regclass('public.cashbox_ledger') is not null union all
select '25 cash_payment_atomic', exists(select 1 from pg_proc where proname = 'cash_payment_atomic' and pronamespace = 'public'::regnamespace) union all
select '26 expense_categories', to_regclass('public.expense_categories') is not null union all
select '27 stock_ledger', to_regclass('public.stock_ledger') is not null union all
select '28 firma_supplier_pay', exists(select 1 from pg_proc where proname = 'firma_supplier_pay' and pronamespace = 'public'::regnamespace) union all
select '29 b2b_links', to_regclass('public.b2b_links') is not null union all
select '30 dealer_pay_notices', to_regclass('public.dealer_pay_notices') is not null union all
select '31 fw_audit_events', to_regclass('public.fw_audit_events') is not null union all
select '32 fw_dealer_revisions', to_regclass('public.fw_dealer_revisions') is not null union all
select '33 supplier_advance_ledger', to_regclass('public.supplier_advance_ledger') is not null union all
select '34 customer_credit_ledger', to_regclass('public.customer_credit_ledger') is not null union all
select '35 dealer_ship_atomic', exists(select 1 from pg_proc where proname = 'dealer_ship_atomic' and pronamespace = 'public'::regnamespace);
select '36 branch_transfer_op', exists(select 1 from pg_proc where proname = 'branch_transfer_op' and pronamespace = 'public'::regnamespace);
rollback;
