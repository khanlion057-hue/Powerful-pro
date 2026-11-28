-- P2 (OWASP A02) — ortiqcha ruxsatlarni (GRANT) olib tashlash. 2026-09-28.
--
-- MUAMMO: quyidagi 20 ta jadvalda RLS yoqilgan, lekin birorta ham policy yo'q.
-- Himoya FAQAT "RLS + policy yo'q = hammasi rad" qoidasiga tayanardi, holbuki
-- anon/authenticated rollarida bu jadvallarga to'liq CRUD GRANT turardi. Bitta
-- xato migratsiya (masalan migratsiya #5'dagi `staff_all_staff ... to anon
-- using(true)`) butun jadvalni ochib yuborishi mumkin edi — bu avval bo'lgan.
--
-- FUNKSIONAL TA'SIR: YO'Q. Bu jadvallarga anon/authenticated allaqachon RLS
-- tufayli kira olmaydi; ular faqat Netlify Functions (service_role) orqali
-- ishlatiladi. service_role bu o'zgarishdan ta'sirlanmaydi.
--
-- ORQAGA QAYTARISH (kerak bo'lsa):
--   grant select, insert, update, delete on <jadval> to anon, authenticated;

revoke all on
  public.app_data, public.app_data_branches, public.batches,
  public.cashbox_balances, public.cashbox_transactions,
  public.customer_balances, public.customer_debt_payments,
  public.dealer_audit_log, public.dealer_stock_moves, public.home_withdrawals,
  public.idempotency_keys, public.permissions, public.role_permissions,
  public.roles, public.sales, public.staff, public.staff_audit_log,
  public.staff_roles, public.supplier_balances, public.supplier_payments
from anon, authenticated;

-- Policy'li jadvallar (diller portali va h.k.) — ular uchun SELECT/INSERT/
-- UPDATE/DELETE policy orqali ishlashi kerak, shuning uchun faqat API hech
-- qachon ishlatmaydigan xavfli huquqlar olinadi (TRUNCATE RLS'ga bo'ysunmaydi).
revoke truncate, trigger, references on
  public.bot_sessions, public.catalog_products, public.dealer_payments,
  public.dealer_sales, public.dealer_stock, public.dealers, public.login_security,
  public.partner_ledger, public.partner_ledger_legacy_history,
  public.partner_payments, public.partner_periods, public.partners,
  public.dealer_orders
from anon, authenticated;

-- SECURITY DEFINER funksiyalar: record_dealer_sale ichida auth.uid() orqali
-- diller tekshiriladi, shuning uchun anon (tizimga kirmagan) uni baribir
-- ishlata olmaydi — EXECUTE ruxsati ortiqcha. Diller (authenticated) uchun
-- ruxsat SAQLANADI (diller.js shu funksiyani chaqiradi).
revoke execute on function public.record_dealer_sale(bigint, numeric, numeric, text, text) from anon, public;
revoke execute on function public.record_dealer_sale(bigint, numeric, numeric, text, text, numeric) from anon, public;
revoke execute on function public.record_dealer_sale(bigint, numeric, numeric, text, text, numeric, numeric) from anon, public;
grant execute on function public.record_dealer_sale(bigint, numeric, numeric, text, text) to authenticated;
grant execute on function public.record_dealer_sale(bigint, numeric, numeric, text, text, numeric) to authenticated;
grant execute on function public.record_dealer_sale(bigint, numeric, numeric, text, text, numeric, numeric) to authenticated;

-- rls_auto_enable — event-trigger funksiyasi (yangi jadvalga avtomatik RLS
-- yoqadi). Event trigger EXECUTE ruxsatini tekshirmaydi, shuning uchun API
-- orqali chaqirish huquqini olib tashlash uning ishlashiga ta'sir qilmaydi.
revoke execute on function public.rls_auto_enable() from anon, authenticated, public;
