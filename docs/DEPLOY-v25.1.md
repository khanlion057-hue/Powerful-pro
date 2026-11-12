# v25.1 — deploy tartibi (tayyor, hali chiqarilmagan)

Oxirgi deploy: `4eb3324` (Sozlamalar: «Versiya» — faqat raqam). Shundan keyingi o'zgarishlar — `CHANGES.md` → v25.1.

## Nima chiqadi
| Qism | Fayllar | Bazaga ta'siri |
|---|---|---|
| So'm yaxlitlash va foyda (yagona modul) | `js/fw-round.js`, `js/pos.js`, `js/shared.js`, `js/main.js`, `js/sotuvchi.js`, `netlify/functions/sale-checkout-atomic.js`, `_lib/ledgerAuthority.js`, `_lib/dailyReport.js`, `_lib/appDataGuard.js` | **47-migratsiya** (3 ustun + cheklov) |
| Mijozni Telegram botga ulash | `netlify/functions/tg-customer.js` (yangi, jami 64), `_lib/tgCustomers.js`, `_lib/tgEvents.js`, `telegram-daily-report.js`, `js/main.js` | `app_data` da yangi qator `tg_customer_links` (avtomatik, migratsiya kerak emas) |
| Yuklanish animatsiyasi (yog'och, 4 kesim → 5 bo'lak) | `js/fw-saw-loader.js`, `css/design-system.css`, `index.html`, `sotuvchi.html`, `diller.html`, `sw.js` | — |
| Versiya | `js/main.js` (FW_RELEASE 25.1), `package.json` 25.1.0 | — |

Muhit o'zgaruvchilari: **yangi kerak emas** (SUPABASE_URL va SUPABASE_SERVICE_ROLE_KEY — avvalgidek).

## Tartib
1. **47-migratsiya** — Supabase → SQL Editor → `supabase-migration-47-yaxlitlash.sql` (yoki MCP `apply_migration`).
   Tekshiruv (2026-11-12, faqat o'qish): `sales` — 0 qator, ustunlar va `sales_yaxlitlash_chk` yo'q → toza qo'llanadi.
   Takror ishga tushirish xavfsiz; mavjud savdolar o'zgarmaydi.
2. **Sayt** — Netlify deploy (build: `node scripts/build.js`, funksiyalar: 64).
3. **Deploydan keyin tekshirish:**
   - `/.netlify/functions/health` → `ok: true`
   - Kirish → yuklanish oynasida arra animatsiyasi
   - So'mda savdo (masalan 18 000 − 25 chegirma): savatda «Yaxlitlash chegirmasi −75», jami 17 900; chekda alohida qator
   - Sozlamalar → «Savdoda so'm yaxlitlash» matni va «Yaxlitlash qadamlari»
   - Mijozlar → kartada «Bot» → havola chiqadi (bot ulangan bo'lsa)
   - Hisobot → «Yaxlitlash chegirmalari jami»

## Orqaga qaytarish
Sayt — Netlify'da oldingi deployni qayta nashr qilish. 47-migratsiya faqat ustun qo'shadi — qaytarish shart emas
(eski kod yangi ustunlarni ishlatmaydi).
