# Powerful PRO v24 — ERP/CRM (chakana + ulgurji savdo)

Mahsulot, ombor (FIFO), kirim (import: CNY/USD/UZS), savdo (POS), qaytarish, filial kassalari,
**Bosh kassa** (asosiy kassa), kassa yopish (sotuvchi ham), «Biznes holati» (foyda/ziyon), kassa jurnali (server), mijoz/ta'minotchi qarzlari, dillerlar (alohida portal), sotuvchilar (alohida
portal), hamkorlar (investor/ta'sischi — har bir filialning o'zi) foydasi, statistika va rollar (RBAC).

**Texnologiya:** vanilla JS (`js/`), Supabase (PostgreSQL + Auth + Storage), Netlify Functions
(`netlify/functions/`). Bundler yo'q.

| Fayl / papka | Nima |
|---|---|
| `index.html` + `js/main.js` | Admin panel (barcha bo'limlar) |
| `js/firma-kassa.js` | Bosh kassa moduli (v10, ilgari «Firma kassasi») |
| `js/brand.js` | Brend (white-label): firma nomi, shior, logotip — `npm run brand`, `docs/KOCHIRMA.md` |
| `js/writeoff.js` | Hisobdan chiqarish (Qaytarishlar bo'limida) |
| `js/dealer-pay.js` | Dillerlar yuborgan pul — bildirishnoma, qabul/rad (30-migratsiya) |
| `js/notifications.js` | 🔔 Bildirishnomalar, arxiv va «Savdo tarixi» (31-migratsiya) |
| `js/b2b.js` | B2B hamkor tizimlar (Ta'minotchilar bo'limida) — `docs/B2B-HISOBDAN-CHIQARISH.md` |
| `sotuvchi.html` + `js/sotuvchi.js` | Sotuvchi portali |
| `diller.html` + `js/diller.js` | Diller portali |
| `js/shared.js` | Umumiy yordamchilar (statistika, xavfsiz HTML, filial birlashtirish) |
| `js/config.js` | Supabase manzili va OCHIQ (anon) kalit — `npm run setup` yozadi |
| `netlify/functions/` | Server: avtorizatsiya, RBAC, pul harakatlari (service_role faqat shu yerda) |
| `supabase/schema.sql` | To'liq baza sxemasi (noldan o'rnatish uchun) |
| `supabase-migration-*.sql` | Mavjud bazaga ketma-ket migratsiyalar (22, 23 — v10; 24 — v11; 25 — v23; 26 — xarajat kategoriyalari; 27 — F4b: qarz va ombor server) |
| `supabase-migration-25-verify.sql` | 24/25/26/27 dan keyingi FAQAT O'QIYDIGAN tekshiruv |
| `docs/F4B-INVENTAR.md` | F4b: qarz/ombor yozish yo'llari → server amallari |
| `docs/ARXITEKTURA-HAMKORLAR-B2B.md` | Investor-hamkorlar ≠ B2B savdo hamkorlari; kelajak `b2b_*` rejasi |
| `tests/` | 164 ta avtomatik test (`npm test`); `tests/evidence/` — haqiqiy PostgreSQL 16 dalil skriptlari |

## Tez boshlash
- **Yangi o'rnatish (bo'sh Supabase + Netlify):** `ornatish.md`
- **Mavjud saytni yangilash:** `DEPLOY.md`
- **Audit hisoboti (v23.2 — F4b tuzatildi; holat: NOT PRODUCTION READY — real baza tekshiruvi kerak):** `AUDIT-HISOBOT.md`
- **F4b (qarz va ombor — server):** `docs/F4B-INVENTAR.md`
- **Test natijalari:** `TEST-NATIJALARI.md` · **O'zgarishlar tarixi:** `CHANGES.md`

```bash
npm ci
npm run check   # sintaksis, server funksiyalari yuklanishi, havolalar, kalit turi
npm test        # 164 ta test (Chromium kerak: npx playwright install chromium)
npm run build   # dist/ — faqat sayt fayllari
```

## Asosiy qoidalar
- Hisob valyutasi faqat **USD** yoki **UZS**. CNY — faqat Kirim kiritishda (CNY→USD + bank 0.6%, Sozlamalarda o'zgaradi).
- **Filial kassasi ≠ Firma kassasi.** Ikkalasi ham serverdagi jurnal (`cashbox_ledger`, `firma_kassa_ledger`): o'chirilmaydi, manfiy bo'lmaydi, takroriy so'rov ikki marta yozilmaydi.
- **Kassa qoldig'ini brauzer hisoblamaydi.** Har bir pul harakati serverda bajariladi (`cashbox-ops`, savdo, Firma kassa); brauzer yuborgan `bal` e'tiborga olinmaydi.
- Brauzerga faqat `anon` kalit tushadi; `service_role` — faqat Netlify muhit o'zgaruvchisida.
- Noma'lum ruxsat — rad etiladi (deny-by-default).
- **Fail-close (v23):** har bir pul amali avval serverda bajariladi. Server rad etsa yoki javob bermasa, mahalliy ma'lumot o'zgarmaydi. To'lov yozuvi va kassa harakati bitta tranzaksiyada yoziladi (`cash_payment_atomic`).
- **Jurnallar o'zgarmas (v23):** xato yozuv o'chirilmaydi — faqat egasi teskari yozuv bilan bekor qiladi.
- **Filial avtonom (v23):** o'z kassasi, mijozlari va investorlari bor. Baza bilan faqat tovar qarzi va pul qarzi (Bazadan qarz olish/qaytarish) orqali bog'lanadi.
- **Telegram tokeni** faqat serverda; brauzerga (admin'ga ham) yuborilmaydi.
- **Xarajat kategoriyalari** — tayyor ro'yxat yo'q: foydalanuvchi yaratadi (`expense_categories`, faqat `expense-categories` funksiyasi orqali; filial + tur bo'yicha).
- **Qarz va ombor qoldig'ini brauzer hisoblamaydi (v23.2, F4b):** mijoz/ta'minotchi qarzi, partiya `sold/qty` va savdo hujjati — serverdagi jurnal; brauzer amalni so'raydi va server qaytargan qiymatni ko'rsatadi.
