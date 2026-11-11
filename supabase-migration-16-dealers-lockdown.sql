-- ════════════════════════════════════════════════════════════
-- BIZNES PRO — 16-MIGRATSIYA: Dillerlar jadvallarini qulflash
--                              + staff jadvali uchun tuzatish
-- ════════════════════════════════════════════════════════════
-- Supabase Dashboard → SQL Editor → shu faylni to'liq nusxalab, RUN qiling
-- MUHIM: bu migratsiyadan OLDIN quyidagilar allaqachon deploy qilingan bo'lishi shart:
--   js/main.js, js/sotuvchi.js (yangilangan nusxalari)
--   netlify/functions/dealer-*.js, catalog-sync.js, staff-whoami.js

-- ────────────────────────────────────────────────────────────
-- 1-QISM: dealers / dealer_stock / dealer_sales / dealer_payments /
--         dealer_stock_moves / dealer_orders / catalog_products
-- ────────────────────────────────────────────────────────────
-- Sabab: admin/xodim tomonidagi barcha yozish (va katta hajmdagi o'qish)
-- endi Netlify Functions (service_role) orqali ishlaydi. "staff_all_*"
-- (anon, cheklovsiz to'liq CRUD) siyosatlari OLIB TASHLANADI — bu policy'lar
-- amalda hech qanday himoya bermas edi (public anon kalit bilan har kim
-- to'g'ridan-to'g'ri Supabase REST orqali yozishi mumkin edi).
--
-- Dillerning O'ZI (diller.html/js/diller.js, Supabase Auth orqali kirgan)
-- to'g'ridan-to'g'ri o'ziga tegishli qatorlarni o'qishi — SAQLANADI, chunki
-- bu allaqachon xavfsiz: "authenticated" + auth.uid() bilan bitta dillerning
-- FAQAT o'ziga tegishli qatorlarga cheklangan.

drop policy if exists staff_all_dealers on public.dealers;
drop policy if exists staff_all_stock   on public.dealer_stock;
drop policy if exists staff_all_sales   on public.dealer_sales;
drop policy if exists staff_all_pay     on public.dealer_payments;
drop policy if exists staff_all_moves   on public.dealer_stock_moves;
drop policy if exists staff_all_orders  on public.dealer_orders;
drop policy if exists staff_all_catalog on public.catalog_products;

-- Dillerning o'z-o'ziga xizmat qiluvchi (self-scoped) siyosatlari — O'ZGARTIRILMAYDI:
--   dealer_read_self          (dealers, select, auth_user_id = auth.uid())
--   dealer_read_stock         (dealer_stock, select, dealer_id -> o'ziniki)
--   dealer_read_sales         (dealer_sales, select, dealer_id -> o'ziniki)
--   dealer_read_payments      (dealer_payments, select, dealer_id -> o'ziniki)
--   dealer_read_catalog       (catalog_products, select, hammaga — maxfiy emas)
--   dealer_read_own_orders    (dealer_orders, select, dealer_id -> o'ziniki)
--   dealer_insert_own_orders  (dealer_orders, insert, dealer_id -> o'ziniki)
-- Bular allaqachon professional darajada yozilgan, qayta yaratish shart emas.

alter table public.dealers            enable row level security;
alter table public.dealer_stock       enable row level security;
alter table public.dealer_sales       enable row level security;
alter table public.dealer_payments    enable row level security;
alter table public.dealer_stock_moves enable row level security;
alter table public.dealer_orders      enable row level security;
alter table public.catalog_products   enable row level security;

-- dealer_stock_moves uchun dillerga o'ziga tegishli o'qish siyosati YO'Q edi (faqat admin ko'rar edi) —
-- bu qasddan shunday: diller o'z harakat tarixini emas, faqat joriy qoldig'ini (dealer_stock) ko'radi.
-- Xavfsizlik jihatidan muammo emas — policy yo'qligi = kirish yo'q, bu to'g'ri holat.

-- Tayyor! Endi bu 7 ta jadvalga admin/xodim tomonidan yozish FAQAT
-- netlify/functions/dealer-*.js va catalog-sync.js orqali mumkin.
-- Dillerning o'zi esa avvalgidek, o'z ma'lumotini to'g'ridan-to'g'ri (xavfsiz) ko'radi.


-- ────────────────────────────────────────────────────────────
-- 2-QISM: staff jadvali uchun TUZATISH
-- ────────────────────────────────────────────────────────────
-- Sabab: 15-migratsiya "staff_read_own" siyosatini olib tashlagan edi, bu esa
-- sotuvchi.html (js/sotuvchi.js) login oqimini buzayotgan edi. js/sotuvchi.js
-- ENDI staff-whoami.js Function orqali ishlaydi (token server tomonda
-- tekshiriladi) — shuning uchun bu policy endi kerak emas va qayta tiklanmaydi.
-- Bu qism faqat hujjat sifatida qoldirilmoqda — hech qanday amal bajarilmaydi,
-- chunki staff jadvali 15-migratsiyada to'g'ri qulflangan edi.
-- (Agar 15-migratsiyani ishga tushirmagan bo'lsangiz, avval uni bajaring.)
