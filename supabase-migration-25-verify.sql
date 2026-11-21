-- ════════════════════════════════════════════════════════════════════
-- v24.5: 24–35-migratsiyalardan KEYIN tekshiruv. FAQAT O'QIYDI (hech narsa yozmaydi).
-- Supabase → SQL Editor → shu faylni joylab → Run. Har bir qatorda ok = true bo'lishi kerak.
-- ════════════════════════════════════════════════════════════════════
begin read only;

with chk(nomi, ok, izoh) as (
  values
  -- Migratsiyalar
  ('23: firma_kassa jadvallari',            to_regclass('public.firma_kassa_ledger') is not null and to_regclass('public.firma_kassa_balance') is not null, 'Firma kassa'),
  ('24: filial kassa jurnali',               to_regclass('public.cashbox_ledger') is not null and to_regclass('public.cashbox_balances') is not null, 'F4'),
  ('25: cash_payment_atomic',                exists (select 1 from pg_proc where proname = 'cash_payment_atomic'), 'to''lov + kassa bitta tranzaksiya'),
  ('25: branch_firma_loan',                  exists (select 1 from pg_proc where proname = 'branch_firma_loan'), 'filial Bazadan qarz'),
  ('25: firma_kassa_reverse',                exists (select 1 from pg_proc where proname = 'firma_kassa_reverse'), 'teskari yozuv'),
  ('25: firma_kassa_branch_summary',         exists (select 1 from pg_proc where proname = 'firma_kassa_branch_summary'), 'filiallar hisoboti'),
  ('25: manba ustunlari',                    (select count(*) from information_schema.columns where table_schema='public' and table_name='firma_kassa_ledger'
                                               and column_name in ('source_type','source_ref','reversal_of','reversed_by','reversed_at')) = 5, ''),
  ('25: barcha yozuvlarda manba bor',        not exists (select 1 from public.firma_kassa_ledger where source_type is null), ''),
  ('25: mijoz ID — bigint',                  (select data_type from information_schema.columns where table_schema='public' and table_name='customer_debt_payments' and column_name='customer_local_id') = 'bigint', 'avval integer — to''lovlar yozilmasdi'),
  ('25: ta''minotchi ID — bigint',           (select data_type from information_schema.columns where table_schema='public' and table_name='supplier_payments' and column_name='supplier_local_id') = 'bigint', ''),
  ('25: dealer_payments.idem_key unique',    exists (select 1 from pg_indexes where indexname = 'dealer_payments_idem_key_uq'), ''),
  ('25: jurnallar o''zgarmas (trigger)',     (select count(*) from pg_trigger where tgname like '%immutable%' and not tgisinternal) >= 2, 'UPDATE/DELETE rad etiladi'),
  -- 26: xarajat kategoriyalari (tayyor ro'yxat yo'q)
  ('26: expense_categories jadvali',         to_regclass('public.expense_categories') is not null, 'foydalanuvchi yaratadigan kategoriyalar'),
  ('26: faol nomlar noyob (filial+tur)',     exists (select 1 from pg_indexes where indexname = 'expense_categories_active_uq'), 'katta-kichik harf farqsiz'),
  ('26: idempotent yaratish',                exists (select 1 from pg_indexes where indexname = 'expense_categories_idem_uq'), 'ikki marta bosish'),
  ('26: RLS + brauzerga yopiq',              (select relrowsecurity from pg_class where oid = 'public.expense_categories'::regclass)
                                             and not has_table_privilege('anon','public.expense_categories','select')
                                             and not has_table_privilege('authenticated','public.expense_categories','insert'), 'faqat server'),
  ('26: staff tashqi kaliti',                exists (select 1 from pg_constraint where conrelid = 'public.expense_categories'::regclass and contype = 'f'), ''),
  -- 27: F4b — qarz va ombor qoldig'i server haqiqiy manba
  ('27: qarz va ombor jurnallari',           to_regclass('public.customer_debt_ledger') is not null and to_regclass('public.supplier_debt_ledger') is not null
                                             and to_regclass('public.stock_ledger') is not null and to_regclass('public.ledger_ops') is not null, 'F4b'),
  ('27: savdo/qaytarish/tahrir funksiyalari', (select count(*) from pg_proc where proname in ('sale_checkout_atomic_v3','sale_return_atomic','sale_void_atomic','sale_edit_atomic','stock_debt_op','app_data_save_main')) = 6, ''),
  ('27: qoldiqlar faqat jurnal orqali (trigger)', (select count(*) from pg_trigger where tgname in ('customer_balances_guard','supplier_balances_guard','batches_guard') and not tgisinternal) = 3, 'qo''lda UPDATE rad etiladi'),
  ('27: jurnallar o''zgarmas',               (select count(*) from pg_trigger where tgname in ('customer_debt_ledger_immutable','supplier_debt_ledger_immutable','stock_ledger_immutable','ledger_ops_immutable') and not tgisinternal) = 4, ''),
  ('27: savdo local_id noyob',               exists (select 1 from pg_indexes where indexname = 'sales_filial_local_id_uq'), ''),
  ('27: brauzerga yopiq',                    not has_table_privilege('anon','public.stock_ledger','select') and not has_table_privilege('authenticated','public.customer_debt_ledger','select')
                                             and not has_table_privilege('authenticated','public.batches','update') and not has_table_privilege('anon','public.customer_balances','select')
                                             and not has_function_privilege('authenticated','public.stock_debt_op(text,text,text,jsonb,bigint,text)','execute')
                                             and not has_function_privilege('anon','public.sale_return_atomic(text,text,text,bigint,numeric,text,jsonb,bigint,text)','execute'), 'faqat server'),
  ('Mijoz qarzlari: qoldiq = jurnal',        coalesce((select bool_and(c.debt = (select coalesce(sum(delta),0) from public.customer_debt_ledger l
                                               where l.filial=c.filial and l.customer_local_id=c.customer_local_id)) from public.customer_balances c), true), ''),
  ('Ta''minotchi qarzlari: qoldiq = jurnal', coalesce((select bool_and(s.debt = (select coalesce(sum(delta),0) from public.supplier_debt_ledger l
                                               where l.filial=s.filial and l.supplier_local_id=s.supplier_local_id)) from public.supplier_balances s), true), ''),
  ('Ombor: qoldiq = jurnal',                 coalesce((select bool_and(b.qty = (select coalesce(sum(d_qty),0) from public.stock_ledger l where l.batch_id=b.id)
                                               and b.sold = (select coalesce(sum(d_sold),0) from public.stock_ledger l where l.batch_id=b.id))
                                               from public.batches b where exists (select 1 from public.stock_ledger l where l.batch_id=b.id)), true), ''),
  ('Ombor: sotilgan ≤ miqdor',               not exists (select 1 from public.batches where status <> 'deleted' and (sold > qty + 0.000001 or sold < 0)), ''),
  -- 27: F4b — qarz va ombor qoldig'i server haqiqiy manba
  ('27: jurnallar (qarz, ombor, amallar)',   to_regclass('public.customer_debt_ledger') is not null and to_regclass('public.supplier_debt_ledger') is not null
                                             and to_regclass('public.stock_ledger') is not null and to_regclass('public.ledger_ops') is not null, 'F4b'),
  ('27: savdo/qaytarish/tahrir funksiyalari', (select count(distinct proname) from pg_proc where proname in ('sale_checkout_atomic_v3','sale_return_atomic','sale_void_atomic',
                                               'sale_edit_atomic','stock_debt_op','cash_payment_atomic_v2','app_data_save_main')) = 7, ''),
  ('27: qoldiqlar faqat jurnal orqali',      (select count(*) from pg_trigger where tgname in ('customer_balances_guard','supplier_balances_guard','batches_guard') and not tgisinternal) = 3, 'trigger'),
  ('27: jurnallar o''zgarmas',               (select count(*) from pg_trigger where tgname in ('customer_debt_ledger_immutable','supplier_debt_ledger_immutable','stock_ledger_immutable','ledger_ops_immutable') and not tgisinternal) = 4, ''),
  ('27: savdo hujjati ID (local_id) noyob',  exists (select 1 from pg_indexes where indexname = 'sales_filial_local_id_uq'), ''),
  ('27: brauzerga yopiq',                    not has_table_privilege('anon','public.customer_balances','select') and not has_table_privilege('authenticated','public.batches','update')
                                             and not has_table_privilege('authenticated','public.stock_ledger','select')
                                             and not has_function_privilege('authenticated','public.stock_debt_op(text,text,text,jsonb,bigint,text)','execute'), 'faqat server'),
  ('Mijoz qarzi: qoldiq = jurnal',           coalesce((select bool_and(b.debt = (select coalesce(sum(delta),0) from public.customer_debt_ledger l
                                               where l.filial=b.filial and l.customer_local_id=b.customer_local_id)) from public.customer_balances b), true), ''),
  ('Ta''minotchi qarzi: qoldiq = jurnal',    coalesce((select bool_and(b.debt = (select coalesce(sum(delta),0) from public.supplier_debt_ledger l
                                               where l.filial=b.filial and l.supplier_local_id=b.supplier_local_id)) from public.supplier_balances b), true), ''),
  ('Ombor: partiya = jurnal, sotilgan ≤ miqdor', coalesce((select bool_and(b.sold <= b.qty + 0.000001 and b.qty = (select coalesce(sum(d_qty),0) from public.stock_ledger l where l.batch_id=b.id)
                                               and b.sold = (select coalesce(sum(d_sold),0) from public.stock_ledger l where l.batch_id=b.id)) from public.batches b), true), ''),
  -- Izchillik
  ('Filial kassalari: qoldiq = jurnal',      coalesce((select bool_and(b.balance = (select coalesce(sum(case when direction='in' then amount else -amount end),0)
                                               from public.cashbox_ledger l where l.filial=b.filial and l.box_local_id=b.box_local_id)) from public.cashbox_balances b), true), ''),
  ('Firma kassa: qoldiq = jurnal',           coalesce((select bool_and(f.balance = (select coalesce(sum(case when direction='in' then amount else -amount end),0)
                                               from public.firma_kassa_ledger l where l.currency=f.currency)) from public.firma_kassa_balance f), true), ''),
  ('Manfiy qoldiq yo''q',                    not exists (select 1 from public.cashbox_balances where balance < 0) and not exists (select 1 from public.firma_kassa_balance where balance < 0), ''),
  -- RLS va ruxsatlar
  ('Barcha jadvallarda RLS',                 not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity), ''),
  ('anon: hamkor jadvallari yopiq',          not has_table_privilege('anon','public.partners','select') and not has_table_privilege('authenticated','public.partner_ledger','select'), ''),
  ('anon: diller jadvallari yopiq',          not has_table_privilege('anon','public.dealers','select') and not has_table_privilege('anon','public.dealer_payments','select'), ''),
  ('authenticated: diller yozuvi yo''q',     not has_table_privilege('authenticated','public.dealers','update') and not has_table_privilege('authenticated','public.dealer_payments','insert'), 'faqat server yozadi'),
  ('Diller portali o''qiy oladi',            has_table_privilege('authenticated','public.dealers','select') and has_table_privilege('authenticated','public.dealer_orders','insert'), 'RLS bilan — o''z qatori'),
  ('login_* — faqat server',                 not has_function_privilege('anon','public.login_check_lock(text)','execute'), ''),
  ('Pul funksiyalari brauzerga yopiq',       not has_function_privilege('authenticated','public.cash_payment_atomic(text,text,text,jsonb,text,jsonb,bigint,text)','execute')
                                             and not has_function_privilege('anon','public.cashbox_apply_ops(text,text,text,jsonb,bigint,text)','execute'), ''),
  -- 28: Firma kassasi — asosiy kassa
  ('28: Firma kassa funksiyalari',           exists (select 1 from pg_proc where proname = 'firma_supplier_pay') and exists (select 1 from pg_proc where proname = 'firma_kassa_reverse_expense'), 'ta''minotchi to''lovi, xarajatni bekor qilish'),
  ('28: xarajat va ta''minotchi to''lovi turi', pg_get_constraintdef((select oid from pg_constraint where conname = 'firma_kassa_ledger_op_chk')) like '%supplier_payment%'
                                             and pg_get_constraintdef((select oid from pg_constraint where conname = 'firma_kassa_ledger_source_chk')) like '%partner_deposit%', '25 qayta qo''llangan bo''lsa — 28 ni ham qayta'),
  ('28: funksiyalar brauzerga yopiq',        not has_function_privilege('authenticated','public.firma_supplier_pay(text,bigint,text,numeric,text,text,text,bigint,text)','execute')
                                             and not has_function_privilege('anon','public.firma_kassa_reverse_expense(bigint,text,text,bigint,text)','execute'), ''),
  ('28: Firma kassa qoldig''i = jurnal',      not exists (select 1 from public.firma_kassa_balance b where b.balance <> (select coalesce(sum(case when direction='in' then amount else -amount end),0) from public.firma_kassa_ledger l where l.currency=b.currency)), ''),
  -- 29: Hisobdan chiqarish va B2B
  ('29: jadvallar',                          to_regclass('public.stock_writeoffs') is not null and to_regclass('public.b2b_links') is not null and to_regclass('public.b2b_orders') is not null
                                             and to_regclass('public.b2b_shipments') is not null and to_regclass('public.b2b_product_map') is not null and to_regclass('public.b2b_inbound_log') is not null, ''),
  ('29: funksiyalar',                        (select count(*) from pg_proc where proname in ('stock_writeoff_atomic','stock_writeoff_cancel','b2b_ship_atomic','b2b_receive_atomic','b2b_ack_apply','b2b_restock_atomic')) = 6, ''),
  ('29: funksiyalar brauzerga yopiq',        not has_function_privilege('authenticated','public.stock_writeoff_atomic(text,text,jsonb,bigint,text)','execute')
                                             and not has_function_privilege('anon','public.b2b_receive_atomic(text,text,bigint,text,jsonb,jsonb,bigint,text)','execute')
                                             and not has_function_privilege('authenticated','public.b2b_ack_apply(text,text,bigint,text,jsonb,numeric)','execute'), ''),
  ('29: B2B kalitlari brauzerga yopiq',      not has_table_privilege('anon','public.b2b_links','select') and not has_table_privilege('authenticated','public.b2b_links','select')
                                             and not has_table_privilege('authenticated','public.stock_writeoffs','select') and (select relrowsecurity from pg_class where oid = 'public.b2b_links'::regclass), 'RLS yoqilgan, faqat server'),
  ('29: amal turlari',                       pg_get_constraintdef((select oid from pg_constraint where conname = 'stock_ledger_kind_chk')) like '%b2b_restock%'
                                             and pg_get_constraintdef((select oid from pg_constraint where conname = 'ledger_ops_kind_chk')) like '%writeoff_cancel%', '27 qayta qo''llangan bo''lsa — 28 va 29 ni ham qayta'),
  -- 27 (v23.10): eskirgan soya partiyalar — FIFO'dan chiqarilganlarning har biri arxivda asl holati bilan
  ('27: eskirgan partiyalar arxivi',          to_regclass('public.m27_stale_batches_archive') is not null
                                             and (select count(*) from public.stock_ledger where op_kind = 'archive') <= (select count(*) from public.m27_stale_batches_archive)
                                             and not has_table_privilege('authenticated','public.m27_stale_batches_archive','select')
                                             and (select relrowsecurity from pg_class where oid = 'public.m27_stale_batches_archive'::regclass), 'egasi qarori: decision = pending → confirmed_absent / reentered'),
  -- 30: Diller pul yuboradi (to'lov xabarnomasi)
  ('30: jadval va funksiyalar',              to_regclass('public.dealer_pay_notices') is not null
                                             and (select count(*) from pg_proc where proname in ('dealer_pay_notice_create','dealer_pay_notice_accept','dealer_pay_notice_reject')) = 3, ''),
  ('30: brauzerga yopiq',                    not has_table_privilege('anon','public.dealer_pay_notices','select') and not has_table_privilege('authenticated','public.dealer_pay_notices','select')
                                             and not has_function_privilege('authenticated','public.dealer_pay_notice_create(bigint,text,numeric,numeric,text,text)','execute')
                                             and (select relrowsecurity from pg_class where oid = 'public.dealer_pay_notices'::regclass), 'RLS yoqilgan, faqat server'),
  -- 31: Tahrirlash muddatlari, audit tarixi, bildirishnomalar, zarar tasdig'i, diller −10%, Direct Sale ruxsati
  ('31: jadvallar va funksiyalar',           to_regclass('public.fw_audit_events') is not null and to_regclass('public.fw_notifications') is not null
                                             and (select count(*) from pg_proc where proname in ('sale_edit_guarded','sale_void_guarded','sale_checkout_guarded','fw_edit_window_days','_fw_assert_sale_edit')) = 5, ''),
  ('31: muddatlar 30/7/4 kun',               public.fw_edit_window_days('admin') = 30 and public.fw_edit_window_days('seller') = 7 and public.fw_edit_window_days('dealer') = 4, 'server vaqti bo''yicha'),
  ('31: audit o''zgarmas',                   exists (select 1 from pg_trigger where tgname = 'fw_audit_events_immutable') and exists (select 1 from pg_trigger where tgname = 'fw_audit_events_no_truncate')
                                             and exists (select 1 from pg_trigger where tgname = 'fw_notifications_guard'), 'bildirishnomada faqat read_at o''zgaradi'),
  ('31: brauzerga yopiq',                    not has_table_privilege('anon','public.fw_audit_events','select') and not has_table_privilege('authenticated','public.fw_notifications','select')
                                             and not has_function_privilege('authenticated','public.sale_checkout_guarded(text,text,jsonb,jsonb,bigint,text,text,boolean)','execute')
                                             and (select relrowsecurity from pg_class where oid = 'public.fw_audit_events'::regclass)
                                             and (select relrowsecurity from pg_class where oid = 'public.fw_notifications'::regclass), 'RLS yoqilgan, faqat server'),
  ('31: diller 10% chegarasi',               pg_get_functiondef('public.record_dealer_sale(bigint,numeric,numeric,text,text,numeric,numeric)'::regprocedure) like '%v_optim * 0.9%', '23 qayta qo''llangan bo''lsa — 31 ni ham qayta'),
  ('31: savdo.direct_sale ruxsati',          exists (select 1 from public.permissions where key = 'savdo.direct_sale')
                                             and not exists (select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id join public.permissions p on p.id = rp.permission_id
                                                             where p.key = 'savdo.direct_sale' and r.key = 'dealer'), 'dillerga berilmaydi (32 dan keyin oddiy xodimga beriladi)'),
  ('32: reviziya tasdig''i',                 to_regclass('public.fw_dealer_revisions') is not null
                                             and exists (select 1 from pg_proc where proname = 'dealer_revision_decide')
                                             and exists (select 1 from pg_trigger where tgname = 'fw_dealer_revisions_guard')
                                             and not has_table_privilege('authenticated','public.fw_dealer_revisions','select')
                                             and not has_function_privilege('authenticated','public.dealer_revision_decide(bigint,boolean,bigint,text,text,text,text)','execute')
                                             and (select relrowsecurity from pg_class where oid = 'public.fw_dealer_revisions'::regclass), 'faqat server; qaror bir marta'),
  ('32: zarar summasi va Xodim — Direct Sale', pg_get_functiondef('public.sale_checkout_guarded(text,text,jsonb,jsonb,bigint,text,text,boolean)'::regprocedure) like '%|loss=%'
                                             and exists (select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id join public.permissions p on p.id = rp.permission_id
                                                         where p.key = 'savdo.direct_sale' and r.key = 'employee'), '31 qayta qo''llansa — 32 ni ham qayta'),
  ('33: taʼminotchi zakladi',                to_regclass('public.supplier_advance_balances') is not null and to_regclass('public.supplier_advance_ledger') is not null
                                             and exists (select 1 from pg_proc where proname = 'supplier_advance_pay') and exists (select 1 from pg_proc where proname = 'supplier_advance_apply')
                                             and exists (select 1 from pg_trigger where tgname = 'supplier_advance_ledger_immutable')
                                             and not has_table_privilege('authenticated','public.supplier_advance_balances','select')
                                             and not has_function_privilege('authenticated','public.supplier_advance_pay(text,text,bigint,text,text,integer,text,numeric,numeric,numeric,text,bigint,text)','execute')
                                             and pg_get_constraintdef((select oid from pg_constraint where conname = 'cashbox_ledger_kind_chk')) like '%supp_advance%', 'faqat server; 24/25 qayta qo''llansa — 33 ni ham qayta'),
  ('34: mijoz haqi (ortiqcha toʻlov)',      to_regclass('public.customer_credit_balances') is not null and to_regclass('public.customer_credit_ledger') is not null
                                             and to_regclass('public.sale_credit_uses') is not null
                                             and exists (select 1 from pg_proc where proname = 'sale_checkout_v34') and exists (select 1 from pg_proc where proname = 'sale_void_v34')
                                             and exists (select 1 from pg_trigger where tgname = 'customer_credit_ledger_immutable') and exists (select 1 from pg_trigger where tgname = 'customer_credit_balances_guard')
                                             and not has_table_privilege('authenticated','public.customer_credit_balances','select')
                                             and not has_table_privilege('anon','public.customer_credit_ledger','select')
                                             and not has_function_privilege('authenticated','public.sale_checkout_v34(text,text,jsonb,jsonb,bigint,text,text,boolean,jsonb,numeric)','execute')
                                             and (select relrowsecurity from pg_class where oid = 'public.customer_credit_ledger'::regclass)
                                             and pg_get_constraintdef((select oid from pg_constraint where conname = 'cashbox_ledger_kind_chk')) like '%cust_credit%', 'faqat server; 33 qayta qo''llansa — 34 ni ham qayta'),
  -- 35: Diller ombori va diller savdosi — serverda, bitta tranzaksiyada (v23.10.2 dagi 31 dan)
  ('35: funksiyalar',                        (select count(*) from pg_proc where proname in ('dealer_ship_atomic','dealer_return_atomic','dealer_sale_record_atomic','dealer_atomic_available')) = 4, ''),
  ('35: brauzerga yopiq',                    not has_function_privilege('authenticated','public.dealer_ship_atomic(text,text,bigint,jsonb,bigint,bigint,text)','execute')
                                             and not has_function_privilege('anon','public.dealer_return_atomic(text,text,bigint,jsonb,bigint,text)','execute')
                                             and not has_function_privilege('authenticated','public.dealer_sale_record_atomic(text,text,bigint,jsonb,numeric,bigint,text)','execute')
                                             and not has_function_privilege('anon','public.dealer_atomic_available()','execute'), 'faqat server (dealer-ops)'),
  ('35: amal turlari',                       pg_get_constraintdef((select oid from pg_constraint where conname = 'ledger_ops_kind_chk')) like '%dealer_sale%'
                                             and pg_get_constraintdef((select oid from pg_constraint where conname = 'ledger_ops_kind_chk')) like '%b2b_restock%'
                                             and pg_get_constraintdef((select oid from pg_constraint where conname = 'ledger_ops_kind_chk')) like '%supp_advance_apply%', '27/28/29/33 qayta qo''llangan bo''lsa — 35 ni ham qayta'),
  ('35: diller 10% chegarasi saqlangan',     pg_get_functiondef('public.record_dealer_sale(bigint,numeric,numeric,text,text,numeric,numeric)'::regprocedure) like '%v_optim * 0.9%', '35 record_dealer_sale''ga tegmaydi'),
  ('35: search_path (barcha public funksiyalar)', not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
                                             and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')), 'advisor 0011')
)
select nomi, ok, izoh from chk order by ok, nomi;

rollback;
