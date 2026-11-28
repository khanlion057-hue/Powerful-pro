# Powerful PRO v24 — TO'LIQ AUDIT VA TUZATISHLAR (2026-10-13)

## 1. Boshlang'ich holat
- Papka git emas → to'liq zaxira: `backup-v23.9-pre-audit`. Bazaviy: `npm test` 189/189, `check` toza, `build` OK, 56 funksiya.
- Production: 24–30-migratsiyalar qo'llanmagan (DEPLOY.md jadvali). Bu ishda production'ga **hech narsa yozilmagan**, deploy qilinmagan.

## 2. Aniqlangan muammolar
| Daraja | Muammo | Holat |
|---|---|---|
| P0 | «Saqlanmadi!» — server rad etsa, yopiq eski yo'lga (anon upsert, 21-migratsiyadan beri yopiq) o'tib asl sababni yashirardi; «Saqlandi» xato bo'lsa ham chiqardi | ✅ tuzatildi |
| P1 | Sotuvchi portalida tannarx ko'rinardi | ✅ ko'rinishdan olib tashlandi (ma'lumot darajasi — 5-band) |
| P1 | Sotuvchi QR — faqat SKU, shtrix-kod emas | ✅ |
| P1 | Kam to'lovda tanlov yo'q (qolgani avtomatik qarz; mijozsiz chegirma imkonsiz) | ✅ «Qarzga yozish» / «Chegirma qilib berdim» |
| P1 | Tahrirlash muddatlari yo'q, tahrir tarixi yo'q | ✅ 31-migratsiya (server + DB) |
| P1 | Diller narx pastki chegarasi yo'q | ✅ −10% (DB) |
| P1 | O'chirilgan savdo izi faqat bazada, ko'rinmasdi | ✅ «Savdo tarixi» |
| P1 | Diller savdosi / sotuvchi qarz to'lovi / mijoz qo'shishdan keyin oyna yopilmasdi (selektor xatosi) — qayta bosish xavfi | ✅ |
| P2 | Chakana/Optom rejimi, rasmli katalog, «Orqaga» tugmasi, 🔔, diller reviziyasi, Telegram e'loni, ijtimoiy tarmoqlar | ✅ |
| P2 | B2B «29-migratsiya kerak» — xato emas (production'da 29 yo'q) | ✅ aniq tushuntirish; migratsiya — faqat egasi |
| P3 | «Anonim» → «Naqd savdo» | ✅ (faqat ko'rinish) |

## 3. Migratsiya va xavfsizlik
- 31-migratsiya: faqat qo'shadi, takror xavfsiz (PG16 da 2 marta), brauzer rollariga yangi huquq yo'q, yangi jadvallarda RLS, audit o'zgarmas (trigger). Zanjir 24→31: verify 63/63.
- Maxfiy kalitlar: bot tokeni faqat serverda (javoblarda yo'q — testlangan). Klientdagi Supabase anon kalit — ochiq kalit (sir emas).
- Avval oshkor bo'lgan kalitlar rotatsiyasi va Supabase «leaked password protection» — **NOT VERIFIED** (production paneliga kirilmadi; DEPLOY.md bo'yicha egasi tekshiradi).

## 4. Egasi qarori kerak (o'zgartirilmadi)
1. **Yaxlitlash:** «Savdoda so'm yaxlitlash» yoqilgan bo'lsa, «Qancha berdi» bo'sh qolsa kassaga **yaxlitlangan** so'm yoziladi (avvalgi qaror, P1.2). Spec 19 «yaxlitlash faqat ko'rinish» deydi — qaysi qoida amal qilsin?
2. **Diller qaytarishi:** tizimda diller qarzi faqat **sotilganda** yoziladi (konsignatsiya). Sotilmagan tovar qaytsa qarz o'zgarmaydi — bu to'g'ri. Spec 14 dagi «qaytarish qarzni kamaytirsin / avans» faqat diller **sotgan** tovar mijozdan qaytganda kerak — bunday oqim hozir yo'q. Kerakmi?
3. **Optom narxi belgilanmagan** mahsulotda diller narxi = o'rtacha tannarx (23-migratsiya qoidasi) — dillerga shu ko'rinadi. Optom narxlarini to'ldirish yoki boshqa qoida?
4. **41 ta eski partiya birligi** — tegilmadi.

## 5. Qolgan (bajarilmagan / qisman)
- Tannarx sotuvchi qurilmasiga ma'lumot sifatida hali keladi (partiyalar `app-data-load` orqali) — ekranda ko'rsatilmaydi; to'liq yashirish server filtri talab qiladi (katta o'zgarish).
- Direct Sale uchun alohida hisobot va mahsulotlarni Excel'dan «Direct Sale» sifatida import — qilinmadi.
- Butun ilova bo'ylab to'liq dizayn yangilanishi — faqat savdo oynalari, portallar va yangi oynalar; boshqa sahifalar avvalgi dizayn tizimida.
- Diller savdosini tahrirlash funksiyasi yo'q (4 kunlik muddat DB'da tayyor, amal yo'q).

# Powerful PRO v23.2 — F4b FINAL FIX (2026-10-06)

## 1. Holat
- **F4b — TUZATILDI (lokal dalil bilan):** mijoz qarzi, ta'minotchi qarzi va ombor qoldig'i (sold/qty) endi serverdagi haqiqiy manba (27-migratsiya). Brauzer faqat amalni so'raydi va server qaytargan qiymatni ko'rsatadi. Batafsil — `docs/F4B-INVENTAR.md`.
- **Yakuniy baho — NOT PRODUCTION READY.** Sabab endi faqat bitta: real (staging/production) bazada 24→25→26→27 va deploy tekshirilmagan (**BLOCKED** — ruxsatingiz kerak). Lokal tekshiruvlarning hammasi PASS.
- Production'ga hech narsa yozilmadi: migratsiya qo'llanmadi, deploy qilinmadi.

## 2. 21 bandli jadval (v23.2)
| # | Yo'nalish | Holat | Dalil / izoh |
|---|---|---|---|
| 1 | Source | **PASS** | `npm run check`: 106/106 JS, 49/49 funksiya, config — faqat anon |
| 2 | Build | **PASS** | `dist/` 16 fayl |
| 3 | Tests | **PASS** | `npm test` **154/154** (146 + P19 — 7 + P14 F4b E2E — 1); toza ZIP'dan qayta — o'sha natija |
| 4 | Supabase | **BLOCKED** | Lokal: PGlite + PostgreSQL 16 (production sxemasi nusxasi → 24→25→26→27, verify 46/46). Production'da qo'llash — ruxsat kerak |
| 5 | RLS | **PASS** | Yangi 4 jadvalda RLS, siyosatsiz; qoldiq jadvallari brauzer rollaridan qo'shimcha olindi |
| 6 | Auth | **PASS** | P18 (401/403) o'zgarishsiz PASS; yangi `sale-ops`, `stock-debt-ops` — `requireStaffAuth` + RBAC |
| 7 | Firma Kassa | **PASS** | P11/P15, PG16 B7 |
| 8 | Legacy Cashbox | **PASS** | 410 o'zgarishsiz; 27 dan keyin eski brauzer savdo kassasi (`sale`/`sale_fix`) — 409 "sahifani yangilang" |
| 9 | Sale | **PASS** | FIFO, konsignatsiya, nasiya, filial qarzi — serverda (v3). PG16: 2×2 dona (qoldiq 3) parallel — biri rad; eski shadow-sync `sold`ni qayta yoza olmaydi (trigger) |
| 10 | Return | **PASS** | Serverdagi savdo yozuvidan (`sale_return_atomic`); takror — replay; qolmagan miqdor — rad; kassa yetmasa — to'liq rollback (PG16) |
| 11 | Customer Debt | **PASS** | `customer_balances` (so'm) + jurnal; to'lovda qarz qatori qulflanadi: PG16 parallel 2×400 000 (qarz 600 000) — biri rad, kassa +400 000 bir marta |
| 12 | Supplier Debt | **PASS** | PG16 parallel 2×80$ (qarz 100$) — biri rad; kirimda "to'langan" summa kassa/Firma kassa jurnalidan oshmaydi |
| 13 | Currency | **PASS** | O'zgarishsiz; mijoz qarzi so'mda — serverdagi kurs bo'yicha |
| 14 | CNY | **PASS** | O'zgarishsiz |
| 15 | Partner Investor | **FAIL** | Hamkor `invested` hali brauzerda (F4b doirasidan tashqari, shu sinf) — pul to'lovi Firma kassada (PASS) |
| 16 | Partner Security | **PASS** | O'zgarishsiz |
| 17 | B2B | **PASS** | Diller to'lovi (SQL) o'zgarishsiz; dillerga jo'natishda asosiy ombor — serverda. Diller omboridagi qoldiq va diller savdosidagi qarz — brauzerda (qolgan ish, pastda) |
| 18 | Future B2B architecture | **PASS** | Hujjat |
| 19 | Security | **PASS** | Kritik yo'q. Qarz/ombor amallari uchun aniq ruxsatlar (pastda). P2/P3: CSP, `SECRETS_SCAN_OMIT_KEYS` |
| 20 | Regression | **PASS** | 154/154; UI 728/728; smoke 117/117; PG16 dalillari: F4b 16/16, zanjir 10/10, moliyaviy matritsa 9/9, F4/B7 7/7, v23 6/6, kategoriyalar 7/7 |
| 21 | Deployment readiness | **BLOCKED** | Staging + production (24/25/26/27, deploy, E2E) — ruxsat kerak |

## 3. Ruxsatlar (xavfsizlik qarori — tekshiring)
Avval qarz va partiya qiymatlarini `customers`/`batches` JSON kalitiga yozish huquqi bor HAR QANDAY xodim (masalan faqat `savdo.create`) o'zgartira olardi. Endi har bir amal uchun aniq ruxsat:
| Amal | Ruxsat |
|---|---|
| Savdo, qaytarish, savdo tahriri/o'chirish (`sale-ops`) | `savdo.create` / `savdo.edit` / `savdo.delete` / `qaytarish.create` (avvalgi `sale_fix` kassa ruxsati bilan bir xil — o'zgarmadi) |
| Mijoz qarzini qo'lda o'rnatish (yangi mijoz qarzi, tahrir) | `mijozlar.edit` |
| Ta'minotchi qarzini qo'lda o'rnatish | `taminotchilar.edit` |
| Kirim, Excel import | `kirim.create` |
| Boshlang'ich qoldiq, partiya tahriri/o'chirish, "keldi" | `kirim.create` yoki `ombor.edit` |
| Reviziya | `ombor.edit` |
| Bazadan filialga ko'chirish | faqat admin |
| Dillerga jo'natish / buyurtmani tasdiqlash | `dillerlar.manage` yoki `dillerlar.orders` |
| Dillerdan qaytgan tovar | `dillerlar.manage` |

## 4. Saqlangan (o'zgartirilmagan) biznes qoidalari — qaror kerak bo'lishi mumkin
Server avvalgi brauzer mantiqini AYNAN takrorlaydi. Quyidagilar avvaldan shunday edi va o'zgartirilmadi (biznes qoidasi — sizning tasdig'ingizsiz o'zgartirmayman):
1. Savdoni o'chirish va "Savdoni tahrirlash" (to'liq) — ta'minotchidan to'g'ridan-to'g'ri sotilgan (omborda bo'lmagan) mahsulotni ham omborga yangi partiya sifatida qaytaradi, ta'minotchi qarzi esa kamaymaydi.
2. "Savdoni tahrirlash" (to'liq) — to'lov turi "qarz" bo'lmasa, yangi jami to'liq "to'langan" deb hisoblanadi (avval qisman qarz bo'lsa ham).
3. Teskari amallarda mijoz qarzi 0 dan pastga tushmaydi (avans saqlanmaydi).
4. Reviziya kamomadi konsignatsiya partiyasidan yechilsa — ta'minotchi qarziga yoziladi (FIFO qoidasi bilan bir xil).

## 5. Qolgan ishlar
1. Staging Supabase'da 24→25→26→27 (`psql -1`), verify 46/46, preview deploy, `DEPLOY.md` 3-qadam (1b — F4b) — ruxsatingiz bilan.
2. Production: kun yopilgach kod + 24/25/26/27 + verify + E2E + barcha xodimlar F5 — ruxsatingiz bilan.
3. Diller ombori qoldig'i (`dealer_stock`) va diller savdosidagi diller qarzi, hamkor `invested` — keyingi bosqich (shu model bilan).
4. 4-bo'limdagi biznes qoidalari bo'yicha qaror; RBAC `owner` uchun "0 qilish"/"bekor qilish"; CSP (P2), `SECRETS_SCAN_OMIT_KEYS` (P3); mijoz/ta'minotchi to'lovini bekor qilish UI.

---

# (tarix) Powerful PRO v23.1 — FINAL PRE-PRODUCTION GATE (2026-10-02)

## 1. Yakuniy holat: **NOT PRODUCTION READY**

Production'ga hech narsa deploy qilinmadi, 24/25/26 productionga qo'llanmadi. Productionda faqat o'qish so'rovlari bajarilgan.
Belgilar faqat: **PASS** (real dalil bor) · **FAIL** (muammo dalil bilan qayta hosil qilingan) · **NOT VERIFIED** (tekshirish imkoni bo'lmadi) · **BLOCKED** (ruxsat kerak).

## 2. Blockerlar
| # | Blocker | Turi | Dalil |
|---|---|---|---|
| B1 | **F4b** — mijoz qarzi, ta'minotchi qarzi, ombor `sold/qty` brauzerda hisoblanadi | moliyaviy yaxlitlik | `tests/evidence/f4b-gap-evidence.js` — 4/4 qayta hosil qilindi; `docs/F4B-INVENTAR.md` |
| B2 | Production DB: 24/25/26 qo'llanmagan, production E2E yo'q | real DB tekshiruvi yetishmaydi | read-only: `cashbox_ledger`, `cash_payment_atomic`, `expense_categories` yo'q |
| B3 | v23.1 deploy qilinmagan (preview ham) | deploy | ruxsat kerak |

Kritik xavfsizlik muammosi, migratsiya bog'liqligi muammosi va regression xatosi — **topilmadi** (pastda).

## 3. 21 bandli yakuniy jadval

| # | Yo'nalish | Holat | Dalil / izoh |
|---|---|---|---|
| 1 | Source | **PASS** | `npm run check`: 99/99 JS, 47/47 funksiya, config — faqat anon kalit. Qotirilgan xarajat kategoriyasi — 0 |
| 2 | Build | **PASS** | `npm run build` → `dist/` 16 fayl (faqat sayt) |
| 3 | Tests | **PASS** | `npm test` **146/146** (P18 — yangi, P14 — +1 real HTTP holati). Toza ZIP'dan qayta: o'sha natija |
| 4 | Supabase | **BLOCKED** | Lokal: PGlite + PostgreSQL 16 (production sxemasi nusxasi 35/21/102/81 → 24→25→26, verify 27/27). Production'da qo'llash — ruxsatingiz kerak |
| 5 | RLS | **PASS** | Barcha jadvallarda RLS; `expense_categories` — siyosatsiz (default deny), anon/authenticated — ruxsat yo'q (PG16 da `permission denied`) |
| 6 | Auth | **PASS** | P18: tokensiz/noma'lum token — 401; xodim emas/nofaol — 403 (11 amalning hammasida) |
| 7 | Firma Kassa | **PASS** | P11/P15, PG16 (B7 parallel, rollback, bekor qilish 1 marta, jurnal o'zgarmas) |
| 8 | Legacy Cashbox | **PASS** | 24 dan keyin eski API — 410, "yarim" yozuv yo'q (P15) |
| 9 | Sale | **FAIL** | Savdo o'zi atomik (PG16: oxirgi donalar — 1 o'tdi, 1 rad). Lekin brauzer `batches-shadow-sync` SQL `sold` ni qayta yozadi → 3 donali partiyadan 5 dona sotildi (F4b-A) |
| 10 | Return | **FAIL** | Fail-close PASS (P0.2). Qaytarishda `sold` va qarz brauzerda (F4b). Takroriy qaytarish — NOT VERIFIED |
| 11 | Customer Debt | **FAIL** | Bir xil kalit — himoyalangan. Turli qurilmadan 2×400 000 (qarz 600 000) — ikkalasi o'tdi (F4b-B, PG16 da ham) |
| 12 | Supplier Debt | **FAIL** | 2×80$ (qarz 100$) — ikkalasi o'tdi, kassadan 160$ chiqdi (F4b-C) |
| 13 | Currency | **PASS** | Hisob valyutasi faqat USD/UZS; CNY kassa rad (P15) |
| 14 | CNY | **PASS** | Faqat Kirim kiritishida → USD + bank 0.6% (P1.1/P12) |
| 15 | Partner Investor | **FAIL** | Firma kassadan to'lov — PASS (PG16 parallel). `invested` hisobi brauzerda (F4b sinfi); parallel ziddiyat dalil bilan qayta hosil qilinmagan, lekin manba brauzer |
| 16 | Partner Security | **PASS** | Faqat o'z filiali hamkorlari (P15/P16); SQL `partner_*` — brauzerga yopiq |
| 17 | B2B | **PASS** | Diller to'lovi: qarz SQL'da, qator qulfi, parallel 2×30$ (qarz 40$) — 1 o'tdi (PG16) |
| 18 | Future B2B architecture | **PASS** | `docs/ARXITEKTURA-HAMKORLAR-B2B.md` (hujjat; qidiruv/CRM/pipeline — kelajak talabi) |
| 19 | Security | **PASS** | Kritik muammo yo'q (P18 + P2). P2/P3: CSP yo'q; `SECRETS_SCAN_OMIT_KEYS` (pastda) |
| 20 | Regression | **PASS** | 146/146; UI 728/728; smoke 117/117; PG16 dalillari: kategoriyalar 7/7, v23 6/6, F4/B7 7/7, moliyaviy matritsa 8/9 + 1 ⚠️ (F4b), migratsiya zanjiri 9/9 |
| 21 | Deployment readiness | **BLOCKED** | F4b ochiq; production 24/25/26 + deploy + E2E — ruxsat kerak |

## 4. 24 → 25 → 26 migratsiya tayyorligi
Dalil: `tests/evidence/migration-chain-rehearsal.js` (haqiqiy PostgreSQL 16.13, UTF8; boshlang'ich sxema production bilan bir xil: 35 jadval / 21 funksiya / 102 cheklov / 81 indeks).

| Talab | 24 | 25 | 26 |
|---|---|---|---|
| Idempotent (2-marta ishga tushirish: sxema md5 va ma'lumot o'zgarmaydi) | PASS | PASS | PASS |
| Mavjud ma'lumot (`app_data`, `app_data_branches`, `staff`, `dealers` — bayt-ma-bayt) | PASS | PASS | PASS |
| Bog'liqlik | — | 24 siz xato beradi (`cashbox_ledger` yo'q) | mustaqil (faqat `staff`) |
| FK | `cashbox_ledger` → o'z jadvallari | `bigint` kengaytirish, ma'lumot yo'qolmaydi | `created_by` → `staff` (on delete set null; PG16 da xodim o'chirildi — kategoriya saqlandi) |
| RLS / brauzer (anon, authenticated) | yopiq | yopiq + qo'shimcha REVOKE | yopiq (o'qish ham) |
| service_role (server) | bor | bor | bor |
| Rollback xavfi | jurnalni o'chirmang (moliyaviy tarix) | jurnal o'zgarmas triggerlari — favqulodda o'chirish yo'li DEPLOY.md da; `bigint` ni qaytarmang | jadval qoladi; kod qaytarilsa ishlatilmaydi |
| Bitta tranzaksiyada (`psql -1`) | PASS | sun'iy xato → 25 dan hech narsa qolmadi | PASS |
| Yakuniy sxema = `supabase/schema.sql` | | 37/35/118/92, funksiyalar md5 bir xil | |
| `supabase-migration-25-verify.sql` | | 27/27 `true` | |

**Maintenance window tartibi** (`DEPLOY.md`): kun yopilgandan keyin → kod deploy → darhol `psql -1` bilan 24 → 25 → 26 (yoki SQL Editor'da `begin; … commit;`) → verify SQL → hamma xodim F5.
**Migratsiyalar orasida ilova ishlatilsa:** pul "yarim" yozilmaydi — yetishmagan qism rad etiladi (jadval `DEPLOY.md` da). Eng xavfli oraliq — **24 bor, 25 yo'q**: mijoz/ta'minotchi/uyga to'lovlar kassani o'zgartiradi, lekin SQL to'lov yozuvi yozilmaydi (`recordSkipped`). Shuning uchun 24 va 25 orasida ish to'xtatilgan bo'lishi shart.
**NOT VERIFIED:** Supabase SQL Editor butun so'rovni o'zi bitta tranzaksiyada bajarishi; production'ning o'zida qo'llash (BLOCKED).

## 5. F4b — FINAL BLOCKER (ochiq)
To'liq ro'yxat: `docs/F4B-INVENTAR.md` (11 ta mijoz qarzi, 10 ta ta'minotchi qarzi, 15+ ombor yozish yo'li; server o'qish yo'llari `cashbox-ops.buildRecord` va `sale-checkout-atomic`).
Qayta hosil qilingan (haqiqiy server funksiyalari + PostgreSQL):
- A. Ombor: brauzerning eski nusxasi `sold=2` ni `0` ga qaytardi → ortiqcha sotuv o'tdi.
- B. Mijoz qarzi 600 000 — 2×400 000 ikkalasi qabul qilindi.
- C. Ta'minotchi qarzi 100$ — 2×80$ ikkalasi o'tdi, kassadan 160$ chiqdi.
- D. `customer_balances` / `supplier_balances` to'lovda yangilanmaydi.
Testlar PASS bo'lishi F4b ni yopmaydi: mavjud testlar bitta qurilma va bir xil kalit holatini tekshiradi.

## 6. Moliyaviy yaxlitlik (15 amal × 4 holat)
Manba: PG16 = `tests/evidence/*-real-postgres.js`; P-raqamlar = `npm test`.

| Amal | SUCCESS | FAIL (o'zgarmaydi) | DUPLICATE | CONCURRENT |
|---|---|---|---|---|
| Mijoz to'lovi | PASS (P15, P16) | PASS (P16, PG16 rollback) | PASS (P15, PG16 bir xil kalit → replay) | **FAIL** (F4b-B) |
| Ta'minotchi to'lovi | PASS (P15, P16) | PASS (P16) | PASS (P15) | kassa chegarasi PASS (PG16) · qarz chegarasi **FAIL** (F4b-C) |
| Diller to'lovi | PASS (P16) | PASS (PG16: rad → kassa ham bekor) | PASS (`idem_key` unique, P15) | PASS (PG16) |
| Kassa xarajati | PASS (P14 E2E) | PASS (P14: 26 yo'q → kassa/jurnal o'zgarmadi) | PASS (PG16 F4-6) | PASS (PG16) |
| Kassa ko'chirish | PASS (P13/P14) | PASS (PG16 ko'p kassa all-or-nothing) | PASS (PG16 F4-6) | PASS (PG16 deadlock yo'q) |
| Qaytarish | PASS (P12) | PASS (P0.2) | NOT VERIFIED | **FAIL** (`sold`/qarz brauzerda — F4b) |
| Savdo | PASS (P11/P12/P14) | PASS (P0.2) | PASS (P10: parallel takror savdo — bitta) | **FAIL** (F4b-A; savdolarning o'zaro parallelligi PASS) |
| Qarz (nasiya) | PASS (savdo bilan) | PASS (P0.2) | PASS (savdo `idemKey`) | **FAIL** (F4b) |
| Firma Kassa | PASS (P11/P15) | PASS (PG16 B7 rollback) | PASS (PG16 Kirim bir xil kalit) | PASS (PG16) |
| Filial qarzi (olish) | PASS (P15) | PASS (P16 fail-close) | PASS (P15: bir xil kalit → replay) | PASS (PG16 deadlock yo'q) |
| Filial qarzini qaytarish | PASS (P13 B7, P15) | PASS (PG16 B7 rollback) | PASS (P13 B7-2 takroriy yuborish) | PASS (PG16 2×150$ — 1 o'tdi) |
| Kirim | PASS (P16 K-havola) | PASS (P12) | PASS (PG16) | pul PASS (PG16) · ta'minotchi qarzi NOT VERIFIED (F4b) |
| Hamkor/investor to'lovi | PASS (P15, P16) | PASS (PG16: Firma kassa yetmasa rad) | PASS (P11: Firma kassa idem kalit) | Firma kassa PASS (PG16) · `invested` NOT VERIFIED (F4b) |
| Ta'sischi chiqimi | PASS (PG16) | PASS (PG16: yetmasa rad, qoldiq manfiy emas) | PASS (`cashbox-ops` kaliti, P13 F4-6) | PASS (PG16) |
| Kunlik uyga berish | PASS (P16) | PASS (P16, PG16) | PASS (`cashbox-ops` kaliti, P13 F4-6) | PASS (PG16: 2 kassa — all-or-nothing) |

Yakuniy izchillik (PG16): har bir filial kassasi va Firma kassa qoldig'i = jurnal yig'indisi; manfiy qoldiq yo'q.

## 7. Xavfsizlik
P18 — haqiqiy seed ruxsatlari va haqiqiy server funksiyalari (`expense-categories`, `cashbox-ops`, `firma-kassa`):

| Aktor | kat. ro'yxat | kat. yaratish (do'kon) | kat. yaratish (ta'sischi) | kat. tahrir | xarajat | mijoz to'lovi | qo'lda chiqim | 0 qilish | Firma ko'rish | Firma kirim | Firma bekor |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Tizimga kirmagan / noma'lum token | 401 | 401 | 401 | 401 | 401 | 401 | 401 | 401 | 401 | 401 | 401 |
| Xodim emas / nofaol | 403 | 403 | 403 | 403 | 403 | 403 | 403 | 403 | 403 | 403 | 403 |
| Xodim (employee) | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ |
| Sotuvchi (kassir) | ✔ | ✔ | ✖ | ✖ | ✔ | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ |
| Savdo menejeri | ✔ | ✔ | ✖ | ✖ | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ |
| Ombor mudiri | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ |
| Hisobchi | ✔ | ✔ | ✔ | ✔ | ✔ | ✖ | ✔ | ✖ | ✔ | ✖ | ✖ |
| Filial menejeri | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ |
| Administrator (RBAC) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✖ | ✔ | ✔ | ✖ |
| Egasi roli (RBAC `owner`) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✖ | ✔ | ✔ | ✖ |
| Admin / Egasi (`staff.role='admin'`) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |

- **Boshqa filial:** so'rovdagi boshqa filial xodimning o'z filialiga majburlanadi — Baza kassasi o'zgarmadi (P18); boshqa filial kategoriyasi → 404 (P17).
- **Sotuvchi:** kategoriya yaratadi, tahrir/o'chira olmaydi — 403 (P17, P18).
- **Telegram tokeni / PIN** — server javoblarida va brauzer fayllarida yo'q (P15, P18). Brauzer fayllarida faqat `role=anon` JWT; `service_role`, JWT secret, private key yo'q (P18 + ZIP skaneri).
- **Kuzatuv:** RBAC `owner` roli (staff.role ≠ 'admin') "0 qilish" va "Firma bekor qilish" ni bajara olmaydi — bu faqat `staff.role='admin'` uchun. Xavfsizlik nuqtai nazaridan qat'iy (fail-safe), lekin egasi rolidagi xodim uchun kutilmagan bo'lishi mumkin — biznes qarori kerak.
- **P2/P3 (alohida):** CSP sarlavhasi yo'q (P2); `netlify.toml` dagi `SECRETS_SCAN_OMIT_KEYS` (P3 — ochiq anon kalit uchun, olib tashlash deploy'ni buzishi mumkin).

## 8. UI
728/728 (6 desktop: 1920/1600/1536/1440/1366/1280; 6 mobil: 320/360/375/390/412/430; landshaft 844×390): admin va sotuvchi xarajat formasi, kategoriya oynasi, select, yaratish/tahrir/boshqaruv oynalari, uzun nom, xato holati — gorizontal surilish, ekrandan chiqish, ustma-ust, kesilgan, yopilgan boshqaruv, oyna sig'ishi. Smoke 117/117.
Funksional holatlar (P17/P14): yuklanish, xato, muvaffaqiyat, takror (409), 3× bosish → 1 so'rov, XSS.
**NOT VERIFIED:** haqiqiy telefon ekran klaviaturasi (faqat kichik balandlik/landshaft bilan simulyatsiya).
Gate paytida topilgan va tuzatilgan: sahifa qayta yuklanganda xarajatlar tarixida kategoriya nomi serverdan kelguncha eski nom bilan qolardi (P14 ~50% FAIL). Endi kategoriyalar yuklangach tarix nomlari ham yangilanadi (admin va sotuvchi). P14 6/6 marta ketma-ket PASS.

## 9. Productionga chiqishdan oldin qolgan ishlar
1. **F4b** — qarz va ombor qoldig'ini serverga ko'chirish (DB o'zgarishi — tasdiqingiz bilan; reja `docs/F4B-INVENTAR.md`). `f4b-gap-evidence.js` 4/4 "TUZATILGAN" bo'lishi.
2. Sinov (staging) Supabase'da 24→25→26 `psql -1` bilan + verify SQL + preview deploy + `DEPLOY.md` 3-qadam E2E.
3. Ruxsatingiz bilan production: kun yopilgach kod + 24/25/26 + verify + E2E.
4. RBAC `owner` uchun "0 qilish"/"bekor qilish" bo'yicha biznes qarori.
5. CSP (P2) va `SECRETS_SCAN_OMIT_KEYS` (P3).
6. Mijoz/ta'minotchi to'lovini bekor qilish UI (hozir faqat Firma kassada).

---

# (tarix) Powerful PRO v23.1 — xarajat kategoriyalari (2026-10-02)

| Yo'nalish | Holat | Dalil |
|---|---|---|
| Qotirilgan kategoriyalar | **FIXED** | Do'kon, ta'sischi va hamkor ro'yxatlari, "Boshqa" fallback, `selCat === 'Boshqa'` — admin va sotuvchi kodidan olib tashlandi. Qolgan mosliklar xarajat kategoriyasi emas (`TEST-NATIJALARI.md`) |
| Yagona manba | **FIXED** | `expense_categories` (26-migratsiya) + `expense-categories` funksiyasi; admin paneli va sotuvchi portali bir xil |
| CRUD | **FIXED** | Yaratish; tahrirda ID o'zgarmaydi; ishlatilgan kategoriya nofaol bo'ladi, ishlatilmagani o'chiriladi; nofaol kategoriya select'da chiqmaydi |
| Xavfsizlik | **PASS** | 401/403 (ruxsatlar), filial chegarasi (boshqa filial → 404), server tomonda normallashtirish, takror (harf/apostrof farqsiz), XSS — escape, RLS va brauzer rollari yopiq |
| Moliyaviy yaxlitlik | **PASS** | Kategoriya amallaridan keyin kassa, Firma kassa, jurnallar va filial ma'lumoti bayt-ma-bayt bir xil (P17) |
| DB migratsiya | **PASS (lokal)** / **BLOCKED (prod)** | PGlite va PostgreSQL 16 (UTF8): takroriy, CHECK, FK, indeks, RLS. Productionda qo'llanmagan |
| UI | **PASS** | 728/728, shu jumladan 1536 va kategoriya oynalari |
| Yakuniy baho | **NOT PRODUCTION READY** | Kategoriya funksiyasi tuzatildi. Lekin 24/25/26 productionda yo'q, F4b (mijoz/ta'minotchi qarzi, ombor `sold` JSON'da) va to'lovni bekor qilish UI qolgan |

Muhim deploy oqibati: 26-migratsiya qo'llanmaguncha **xarajat kiritib bo'lmaydi** (kategoriya yo'q, xato holati ko'rinadi). Shuning uchun kod + 24 + 25 + 26 bitta oynada qo'llanadi (`DEPLOY.md`).

---

# (tarix) Powerful PRO v23 — to'liq tuzatish, mustahkamlash va yakuniy audit (2026-10-02)

Asos: **v11-FINAL** (Powerful-PRO-v23.zip ilova qilinmagan, siz "v11-FINAL'dan" deb tanladingiz). Qayta yozilmadi; ishlab turgan funksiyalar o'chirilmadi.
Production'ga hech narsa deploy qilinmadi va hech qanday migratsiya qo'llanmadi. Productionda faqat o'qish so'rovlari bajarildi.

Belgilar: **PASS** — tekshirildi, muammo yo'q · **FIXED** — tuzatildi va test bilan dalillandi · **PARTIAL** — qisman · **NOT VERIFIED** — tekshirish imkoni bo'lmadi · **BLOCKED** — ruxsat kerak · **NOT IMPLEMENTED** — ataylab qilinmadi.

## 1. Yakuniy jadval (21 band)

| # | Yo'nalish | Holat | Dalil / izoh |
|---|---|---|---|
| 1 | Source | **PASS** | v11-FINAL asosida. 92 JS fayl va 46 funksiya. `npm run check` toza. Maxfiy kalit yo'q (faqat `role=anon` kalit) |
| 2 | Build | **PASS** | `npm run build` → `dist/` 16 fayl (faqat sayt) |
| 3 | Tests | **PASS** | `npm test` **143/143** (v23.1: +4 xarajat kategoriyalari — P17). Yangi 16 test v11-FINAL'da 0/16. 3 ta eski test talab o'zgargani uchun yangilandi, zaiflashtirilmadi (`TEST-NATIJALARI.md`) |
| 4 | Supabase | **PARTIAL** | Lokal: PGlite + haqiqiy PostgreSQL 16 (6/6 + 7/7). Production read-only: 23 qo'llangan (7 funksiya fayl bilan bir xil), **24/25 yo'q → BLOCKED** (ruxsatingiz kerak) |
| 5 | RLS | **FIXED** | Barcha jadvallarda RLS (prod: 35/35). 25-migratsiya brauzerga keraksiz GRANT'larni oladi: hamkor, bot, login va diller jadvallariga yozish. `supabase-migration-25-verify.sql` 22/22 |
| 6 | Auth | **PASS** | Har bir funksiya `requireStaffAuth` (Supabase JWT server tomonda tekshiriladi). Rol va ruxsat bazadan (`staff_roles` → `role_permissions`), brauzerga ishonilmaydi |
| 7 | Firma Kassa | **FIXED** | Asosiy kassa. Manba (`source_type/ref`), teskari yozuv bilan bekor qilish (faqat egasi), boshlang'ich qoldiq (faqat egasi). Jurnal o'zgarmas. Filiallar qarzi hisoboti, Kirim solishtiruvi |
| 8 | Legacy Cashbox | **FIXED** | `cashbox-transact` va `*-payment-add`: 24-migratsiyadan keyin **410** (yozuv yo'q). Undan oldin — fail-close, kassa o'zgarishidan OLDIN chaqiriladi |
| 9 | Sale | **PASS** | `sale-checkout-atomic`: atomik, fail-close, idempotent, ombor + qarz + kassa bitta tranzaksiyada (v10/v11, P0.2/P12/P13) |
| 10 | Return | **PARTIAL** | Fail-close tuzatildi: HTTP xatoda ham to'xtaydi (avval 4xx/5xx'da tekshiruvsiz davom etardi). Kassa — server jurnali. SQL "soya" yozuvi va JSON hali ikki manba (F4b) |
| 11 | Customer Debt | **PARTIAL** | Qisman / to'liq to'lov / qarzdan ortiq (rad) — FIXED. Kassa + yozuv bitta tranzaksiyada. Katta ID xatosi tuzatildi. **To'lovni bekor qilish UI yo'q — NOT IMPLEMENTED.** Qarzning o'zi hali JSON'da (F4b) |
| 12 | Supplier Debt | **PARTIAL** | Xuddi shunday: qisman / to'liq / ortiqcha — FIXED. Bekor qilish UI — NOT IMPLEMENTED. Qarz JSON'da (F4b) |
| 13 | Currency | **PASS** | Hisob valyutasi faqat USD/UZS (Firma kassa CHECK, `_cb_move`, cashbox-ops). CNY kassa rad etiladi (P15) |
| 14 | CNY | **PASS** | CNY faqat Kirim kiritishida → USD + bank 0.6% (sozlanadi). P1.1/P12 testlari |
| 15 | Partner Investor | **FIXED** | Barcha qoidalar saqlandi: keepPct, founderPct, kechiktirilgan kirim, oylik yopish, oxirgi oyni tahrir/bekor qilish, tarix/chop etish, Firma kassadan to'lov. **Har bir filialning o'z investorlari.** Yagona manba — JSON |
| 16 | Partner Security | **FIXED** | Server: xodim faqat o'z filiali hamkorlarini o'zgartiradi. SQL `partner_*` jadvallari va RPC — brauzerga yopiq (default deny); productionda anon/authenticated bajara olmaydi (tekshirildi) |
| 17 | B2B | **PASS** | Dillerlar, konsignatsiya, Direct Sale ishlaydi. Diller to'lovi: qarz SQL'da, qator qulfi bilan, bitta tranzaksiyada (FIXED) |
| 18 | Future B2B architecture | **PASS (hujjat)** | `docs/ARXITEKTURA-HAMKORLAR-B2B.md`: investor ≠ B2B, `b2b_*` nomlari band qilindi, bo'sh jadval yo'q. Qidiruv, CRM va pipeline — NOT IMPLEMENTED (talab) |
| 19 | Security | **PARTIAL** | FIXED: Telegram tokeni brauzerga ketmaydi, `login_*` RPC yopildi, "0 qilish" faqat egasi, admin ommaviy o'chirishi jurnalga yoziladi. Qolgan: CSP yo'q; `SECRETS_SCAN_OMIT_KEYS` (Netlify skaneri bitta kalitni chetlab o'tadi) — olib tashlash deploy'ni buzishi mumkin, siz bilan kelishib |
| 20 | Regression | **PASS** | 143/143; UI audit 728/728 (12 o'lcham); smoke 117/117; v11 F4/B7 dalillari qayta PASS |
| 21 | Deployment readiness | **NOT VERIFIED / BLOCKED** | Kod va migratsiya tayyor (`DEPLOY.md`). Production'da 24/25 + deploy + E2E qilinmagan (ruxsat kerak). F4b qoldi |

## 2. Yakuniy baho: **NOT PRODUCTION READY**

Lokal tekshiruvlarning hammasi PASS. Lekin qoidaga ko'ra "FINAL" faqat hammasi tasdiqlanganda deyiladi:
1. **Production DB — BLOCKED/NOT VERIFIED.** 24 va 25-migratsiyalar qo'llanmagan. v23 deploy qilinmagan. Production E2E yo'q.
2. **F4b (P1) — PARTIAL.** Mijoz/ta'minotchi qarzi va partiya `sold` qiymatlari hali brauzer hisoblagan JSON. Kassa harakati va to'lov yozuvi endi server tomonda, qarzdan ortiq to'lov server ma'lumoti bo'yicha rad etiladi. Lekin qarz sonining o'zi JSON'da.
3. **To'lovni bekor qilish UI — NOT IMPLEMENTED.** Firma kassada bor (teskari yozuv); mijoz/ta'minotchi to'lovi uchun yo'q.

"PRODUCTION READY" uchun: (a) kod + 24 + 25 ni bitta oynada qo'llashga ruxsat (`DEPLOY.md`), (b) `supabase-migration-25-verify.sql` va 3-qadam tekshiruvlari, (c) F4b va to'lovni bekor qilish bo'yicha qaror.

## 3. v23 da topilgan va tuzatilgan muammolar

| ID | Daraja | Muammo | Holat |
|---|---|---|---|
| V23-1 | **P0** | `customer_debt_payments.customer_local_id` va `supplier_payments.supplier_local_id` — `integer`, ilova ID'lari ~1.7e15. Har bir to'lov yozuvi bazada yiqilgan, brauzer xatoni yutib yuborgan (prod: 0 qator). Prod'da `22003 out of range` bilan tasdiqlandi | FIXED (25: bigint; eski sxemada aniq 409) |
| V23-2 | **P0** | Fail-open: payDebt, paySupplierDebt, doKassaOp, doKunlikHisob, svConfirmPay — tarmoq xatosida server tekshiruvisiz davom etardi | FIXED (P16) |
| V23-3 | P1 | Diller to'lovi: kassa yozilib, bulutga yozish xatosi faqat "⚠️" bilan o'tib ketardi (qarz bulutda o'zgarmay qolardi) | FIXED (`cash_payment_atomic`, qator qulfi) |
| V23-4 | P1 | Kassa harakati va to'lov yozuvi alohida so'rovlar (ikki tranzaksiya) | FIXED (bitta tranzaksiya) |
| V23-5 | P1 | Qaytarish tekshiruvi HTTP 4xx/5xx javobida tekshiruvsiz davom etardi | FIXED |
| V23-6 | P1 | "Uyga berish" qoldiqdan ortiq summani jimgina qisqartirardi (`Math.min`) | FIXED (rad) |
| V23-7 | P1 | Kirim → Firma kassa havolasi = "keyingi partiya raqami" — filiallar/parallel foydalanuvchilarda takrorlanadi, yetim to'lovni topib bo'lmasdi | FIXED (`K-uid`, `batches[].fkRef`, `reconcile`) |
| V23-8 | P1 | Firma/filial jurnal yozuvlarini SQL bilan o'zgartirish yoki o'chirish mumkin edi | FIXED (trigger) |
| V23-9 | P1 | Xato Firma kassa yozuvini tuzatish yo'li yo'q edi | FIXED (teskari yozuv, faqat egasi) |
| V23-10 | P1 | Telegram bot tokeni admin brauzeriga yuborilar va brauzerdan Telegram'ga ketardi | FIXED (`telegram-test`) |
| V23-11 | P2 | `login_*` funksiyalari anon'ga ochiq (ishlatilmaydi). Hamkor, bot va login jadvallarida anon/authenticated GRANT (RLS to'sgan, lekin keraksiz) | FIXED (25) |
| V23-12 | P2 | Kassasiz xarajat, kassasiz qarz to'lovi yozilib ketishi mumkin edi (`if (box)`) | FIXED |
| V23-13 | P2 | "Hammasini 0 qilish" / "Mahsulotlarni o'chirish" — xodim UI orqali ham boshlay olardi (server baribir to'sardi) | FIXED (faqat egasi) |
| V23-14 | Biznes | Filial — o'z investorlari (egasining qarori); filial Bazadan pul qarzi oladi va qaytaradi | IMPLEMENTED |

Qabul qilingan qarorlar (qisqa):
- Filialga qarz berish — faqat Firma kassa huquqi bilan va faqat o'z filiali (admin — istalgan filial); qaytarish — kassir ham. Baza xodimi boshqa filialga qarz bera olmaydi (ehtiyotkor qoida).
- Filial kassasiga bog'liq Firma yozuvlari (filialdan qabul/berish, filial qarzi) yolg‘iz bekor qilinmaydi: ikki jurnal ajralib ketmasin.
- 25-migratsiyasiz diller to'lovi qabul qilinmaydi (409): qarz SQL'da, kassa bilan ajralib ketmasin.
- SQL hamkor jadvallari o'chirilmadi (prod'da 3 qator), faqat "ESKIRGAN" deb belgilandi.

---

# Powerful PRO v11 (FINAL P1 GATE) — audit, tuzatish va test hisoboti (2026-10-02)

v10-FINAL hisobotining davomi: F4 (filial kassasi qoldig'i) va B7 (filialdan Bazaga to'lov) tuzatildi.
v10 bo'limlari (3–4) o'zgarishsiz qoldirildi.

Belgilar: ✅ VERIFIED — real tekshirildi · 🔧 FIXED — tuzatildi · ❌ FAILED/QOLDI — muammo hal qilinmagan · ⚠️ NOT VERIFIED — tekshirish imkoni bo'lmadi.

## 1. Yakuniy jadval

| Yo'nalish | Natija | Izoh |
|---|---|---|
| Code / Build | ✅ PASS | `npm run check`: 87/87 JS, 45/45 funksiya; `npm run build`: dist 16 fayl |
| Unit + integratsiya testlari | ✅ PASS | `npm test`: **122/122** (109 eski + 13 yangi: P13 — 11, P14 — 2) |
| **F4 — kassa qoldig'i** | ✅ PASS | Server haqiqiy manba (24-migratsiya). 7 hujum ssenariysi PASS; v9 va v10-FINAL'da FAIL |
| **B7 — filial → Firma kassa** | ✅ PASS | Bitta tranzaksiya: filial kassasi + Firma kassa + filial qarzi. USD/UZS, kurs, idempotency, rollback, parallel |
| Haqiqiy PostgreSQL 16 (ko'p ulanish) | ✅ PASS | Qator qulfi, advisory lock, deadlock yo'q, rollback — `tests/evidence/f4-b7-real-postgres.js` |
| Lokal to'liq stek E2E | ✅ PASS | Chromium → HTTP → haqiqiy server funksiyalari → PostgreSQL (PGlite). Soxta qism faqat Auth va CDN (P14) |
| Desktop UI | ✅ PASS | 1920/1600/1440/1366/1280 — 0 muammo |
| Mobile UI | ✅ PASS (emulyatsiya) | 320/360/375/390/412/430 — 0 muammo (jami 480/480) |
| Brauzer regressiya (smoke) | ✅ PASS | 117/117 — barcha sahifa va portal, 3 o'lcham |
| ZIP ↔ production baza | ✅ (faqat o'qish) | 0 "faqat production"; farqlarning hammasi 23 + 24-migratsiya (5-bo'lim) |
| **Production'da v11 ishlashi** | ⚠️ NOT VERIFIED | 23 va 24-migratsiyalar qo'llanmagan, v11 deploy qilinmagan (sizning ruxsatingiz kerak) |
| Qarzlar va ombor (`debt`, `sold`) | ❌ QOLDI (P1) | Mijoz/ta'minotchi qarzi va partiya `sold` hali JSON'da, brauzer qiymatiga ishoniladi (7-bo'lim, F4b) |

## 2. Yakuniy baho: **NOT PRODUCTION READY**

F4 va B7 tuzatildi va dalillangan. Lekin gate shartiga ko'ra baho hali "tayyor" emas:
1. **Real DB verification — NOT VERIFIED.** Kod haqiqiy PostgreSQL 16 da va production sxemasi nusxasida sinaldi. Lekin production bazada 23/24-migratsiyalar yo'q va v11 deploy qilinmagan. Bular ruxsatingizsiz qilinmaydi.
2. **Moliyaviy yaxlitlik qoldig'i (F4b, P1):** mijoz/ta'minotchi qarzlari va ombor `sold` hali brauzer hisoblagan JSON qiymati. Kassa endi himoyalangan, lekin, masalan, mijoz qarzini brauzer konsolidan o'zgartirish mumkin (huquqi bor xodim).

"PRODUCTION READY FOR DEPLOY" uchun kerak:
- (a) 23 → 24-migratsiyalarni staging (yoki production) bazaga qo'llashga ruxsat;
- (b) preview deploy va DEPLOY.md 3-qadamdagi tekshiruvlar;
- (c) F4b bo'yicha qaror.

## 2a. F4 — filial kassasi qoldig'i: server haqiqiy manba

**Muammo (v9/v10).** Har bir amal (savdo, xarajat, qarz to'lovi, ko'chirish...) `box.bal`ni brauzerda o'zgartirardi. Keyin tayyor son `app_data` JSON'iga yuborilardi. Server faqat "kalitga ruxsat bormi"ni tekshirardi. Dalil (`tests/evidence/f4-save-path-attack.js`, v9):
```
- brauzer boshqa qoldiq yuboradi   → HTTP 200; saqlangan qoldiq: 1:1205000 3:5300
- juda katta qoldiq                → HTTP 200; saqlangan qoldiq: 1:1000000000000000 3:1000000000000000
- manfiy qoldiq                    → HTTP 200; saqlangan qoldiq: 1:-999 3:-999
```
v11 da xuddi shu hujumlar: `1:1200000 3:300` — bazadagi qoldiq qoladi.

**Yechim (Firma Kassa yondashuvi).**
- **Baza (24-migratsiya):**
  - `cashbox_balances` — haqiqiy qoldiq, valyutasi bilan;
  - `cashbox_ledger` — o'zgarmas jurnal: kim, qachon, qancha, `balance_after`; `(filial, op_key)` UNIQUE;
  - `_cb_move` — yagona yozish yo'li: FOR UPDATE qulf, chiqim qoldiqdan oshmaydi, valyuta mosligi, idempotency, kalitni boshqa amalga ishlatish rad etiladi;
  - `cashbox_apply_ops` — bir amaldagi bir nechta harakat bitta tranzaksiyada. Kassalar tartib bilan qulflanadi (deadlock yo'q). Bir xil kalit advisory lock bilan navbatga qo'yiladi;
  - trigger `cashbox_balances_guard` — qoldiqni jurnalsiz o'zgartirish (eski funksiya, xato kod) bazada to'siladi;
  - `sale_checkout_atomic_v2` — savdo tushumi ham jurnal orqali; kassaga savdo summasidan ortiq pul yozilmaydi;
  - hozirgi JSON qoldiqlari BIR MARTA "opening" yozuvi sifatida ko'chiriladi (takroriy ishga tushirish xavfsiz).
- **Server:**
  - yangi `cashbox-ops` — amal turi bo'yicha RBAC, filialni server aniqlaydi, kassa va valyuta serverdagi ma'lumotdan;
  - ko'chirish/almashtirishda qiymat yaratilmaydi: chiqim = kirim, kurs serverdagidan ±25%;
  - `app-data-save` / `app-data-branch-save` brauzer yuborgan `bal`ni bazadagi qiymat bilan almashtiradi va urinishni `staff_audit_log`ga yozadi; qoldig'i bor kassani o'chirib bo'lmaydi;
  - `app-data-load` qoldiqni bazadan beradi.
- **Mijoz:**
  - `fwCashOps()` (js/shared.js) — brauzer faqat amalni so'raydi;
  - 36 joy (main.js, sotuvchi.js, firma-kassa.js) o'tkazildi: server rad etsa, amal butunlay to'xtaydi (fail-closed);
  - tarmoq uzilsa — xuddi shu kalit bilan qayta urinish; ikki marta bosish — bitta amal.
- **Xavfsiz o'tish:** `cashbox_ledger` jadvali yo'q bo'lsa (migratsiyadan oldin) server avvalgidek ishlaydi. Shuning uchun kodni migratsiyadan oldin chiqarish hech narsani buzmaydi.

**F4 hujum testlari (P13 + P14, haqiqiy server kodi + haqiqiy PostgreSQL):**

| # | Ssenariy | v9 | v10-FINAL | v11 |
|---|---|---|---|---|
| 1 | Normal amal → server bajaradi, qoldiq bazadan | ❌ FAIL | ❌ FAIL | ✅ PASS |
| 2 | Brauzer boshqa qoldiq yuboradi (xodim ham, admin ham) | ❌ FAIL (saqlanadi) | ❌ FAIL | ✅ PASS (DENY + jurnal) |
| 3 | Juda katta qoldiq / 1000 so'm → 1000 $ / soxta kurs | ❌ FAIL | ❌ FAIL | ✅ PASS (DENY) |
| 4 | Manfiy, son emas, ortiqcha chiqim, huquqsiz, boshqa filial, to'g'ridan-to'g'ri SQL | ❌ FAIL | ❌ FAIL | ✅ PASS (DENY) |
| 5 | Ikki parallel chiqim (300$ dan 2×200$) | ❌ FAIL | ❌ FAIL | ✅ PASS (bittasi o'tadi, qoldiq 100) |
| 6 | Bir xil amal 2–3 marta | ❌ FAIL | ❌ FAIL | ✅ PASS (dublikat yo'q) |
| 7 | Yakuniy qoldiq = bazadagi qoldiq = jurnal yig'indisi | ❌ FAIL | ❌ FAIL | ✅ PASS |
| E2E | Brauzerdan soxta qoldiq + 5 ta haqiqiy amal + qayta yuklash | — | ❌ FAIL (mutatsiya) | ✅ PASS |

Haqiqiy PostgreSQL 16 (ko'p ulanish) dalili:
- 2-tranzaksiya qulfni KUTDI va "kassada mablag' yetarli emas" bilan rad etildi;
- bir xil kalit — `replay=true`, jurnalda 1 yozuv;
- qarama-qarshi ko'chirishlar deadlock'siz bajarildi.

## 2b. B7 — FILIAL KASSA → FIRMA KASSA (+ filial qarzi): atomik

**Muammo.** "Bazaga to'lov" brauzerda uchta ish qilardi: filial kassasidan ayirardi, qarzni kamaytirardi va Baza kassasiga qo'shardi. Baza kassasiga qo'shilgan pul hech qachon saqlanmasdi, chunki faqat joriy filial saqlanadi. Tarmoq uzilsa — yarim holat qolardi.

**Yechim:** `branch_firma_transfer` (baza) + `firma-kassa` → `branch_pay` (server). BITTA tranzaksiyada:
1. qarz tekshiriladi;
2. filial kassasidan chiqim (jurnal);
3. Firma kassaga kirim (jurnal, xuddi shu kalit);
4. `app_data.branchDebt[filial]` kamayadi.

Biror qadam bajarilmasa — hammasi bekor (rollback). `branch_in` / `branch_out` (Firma kassa sahifasidan) ham shu funksiya orqali ishlaydi.

| Talab | Natija | Dalil |
|---|---|---|
| USD | ✅ 100 $ → qarz 500 → 400, filial −100, Firma +100 | P13 B7-1 |
| UZS + kurs | ✅ 600 000 so'm ÷ 12 000 (serverdagi kurs) = 50 $ → qarz 350; Firma kassaga so'm o'z valyutasida | P13 B7-1, P14 |
| Komissiya / fee | ✅ yo'q — biznesda belgilanmagan, 0 deb qabul qilindi | — |
| Transaction ID | ✅ ikkala jurnalda bitta kalit (`bft:branch_pay:<idemKey>`) + yozuv ID'lari javobda | P13 B7-1 |
| Idempotency / duplicate submit | ✅ 3 marta (2 tasi parallel) → 1 to'lov; UI'da 2 marta bosish → 1 to'lov | P13 B7-2, P14 |
| Insufficient balance | ✅ rad, hech qayerda iz yo'q | P13 B7-2 |
| Qarzdan ortiq to'lov | ✅ rad | P13 B7-2 |
| Rollback (Firma tomoni xato) | ✅ filial kassasiga tegilmaydi | P13 B7-2, real PG |
| Concurrent requests | ✅ qarz 380, 2×300 → bittasi; qarz manfiy emas; deadlock yo'q | P13 B7-2, real PG |
| Audit trail | ✅ kim, filial, kassa, summa, kurs, "qarz 500 → 400" — ikkala jurnalda | P13 B7-1 |
| Huquq | ✅ `kassalar.transact` yoki `firma_kassa.transact`; Baza uchun — rad | P13 B7-2 |

**Siz bilishingiz kerak bo'lgan qarorlar** (talabingizda bor yoki xalqaro amaliyot):
- filialdan to'lov endi Baza "Dollar" kassasiga emas, **Firma kassaga** tushadi;
- **so'm kassadan** ham to'lash mumkin;
- **qarzdan ortiq to'lov rad etiladi** (avval ortig'i jimgina yo'qolardi);
- **barcha filial kassalari manfiyga tushmaydi:** xarajat, maosh, qaytarish, savdoni o'chirish — kassada pul yetmasa rad etiladi (avval jimgina 0 qilinar yoki manfiy bo'lardi);
- aralash to'lovda kassaga savdo summasidan (2% / 1$ dan) ortiq pul yozilmaydi;
- qoldig'i bor kassani o'chirib bo'lmaydi;
- "Tizimni 0 qilish" kassani jurnal yozuvi bilan nolga tushiradi — jurnal o'chirilmaydi.

## 3. Topilgan va tuzatilgan xatolar

### P0
| ID | Fayl:qator | Sabab | Ta'sir | Tuzatish | Test | Natija |
|---|---|---|---|---|---|---|
| F1 | netlify/functions/update-staff.js:39, staff-delete.js:29 | Boshqa xodimni tahrirlashda faqat filial tekshirilardi, nishonning admin ekani — yo'q | Filial menejeri admin parolini almashtirib tizimni egallardi | `assertCanManageStaff`: admin/owner/administrator'ni faqat admin o'zgartiradi/o'chiradi | P10 #1 | 🔧 ✅ |
| B1 | js/sotuvchi.js:192 (+ js/shared.js `fwMergeBranchSnap`) | Sotuvchi kirishda yuklangan ESKI nusxani butun ro'yxatlari bilan saqlardi | Admin/boshqa sotuvchi savdolari, kassa o'zgarishlari o'chib ketardi | Saqlashdan oldin server holati olinadi; ro'yxatlar ID bo'yicha, balanslar delta bilan birlashtiriladi | P12 #8, #9 | 🔧 ✅ |
| B2 | js/main.js:3319 | Savdo tugmasida bloklash yo'q, har bosishda yangi idemKey | 2–3 marta bosish = 2–3 savdo, ombor/kassa ikki barobar | Bosish qulfi + savat bo'yicha bir xil idemKey | P12 #1 | 🔧 ✅ |
| F5 | netlify/functions/_lib/idempotency.js, sale-checkout-atomic.js:53 (+4 to'lov funksiyasi) | "Tekshir → bajar → saqla": parallel so'rovlar ikkalasi ham o'tardi | Takroriy savdo/to'lov | "Avval band qil (UNIQUE) → bajar → yoz", xato bo'lsa bo'shatish; kalit endpoint bo'yicha ajratildi | P10 #3 | 🔧 ✅ |
| J1 | js/main.js:1661 | Boshqa filial kaliti S._store'da yo'q (server faqat o'z filialini beradi) → TypeError | Qo'shilgan filiallari bor korxonada xodim ilovasi OCHILMASDI | Yo'q filial o'tkazib yuboriladi | P12 #4 | 🔧 ✅ |
| J3 | supabase-migration-23:250 (record_dealer_sale) | Qarz uchun optim narx va ballar dillerning brauzeridan kelardi | Diller `p_optim_price=0` bilan qarzsiz, istalgan ball bilan sotardi | Narx/ball serverda (katalog + sozlama); qoldiq FOR UPDATE; eski variantlar yopildi | P11 #3 | 🔧 ✅ (production'da — 23-migratsiyadan keyin) |

### P1
| ID | Fayl:qator | Sabab | Ta'sir | Tuzatish | Test | Natija |
|---|---|---|---|---|---|---|
| F2 | sale-checkout-atomic.js:11 | Pul parametrlari tekshirilmasdi | Manfiy kassa to'lovi, 150% skidka, manfiy "to'langan" bilan kassa/qarz buzilardi | To'liq validatsiya (manfiy/cheksiz/oraliq) | P10 #3 | 🔧 ✅ |
| F3 | batches-shadow-sync.js:31 | Partiya qiymatlari tekshirilmasdi; checkout FIFO shu jadvaldan | Cheksiz qoldiq / 0 tannarx | Raqam, sold≤qty, holat, valyuta tekshiruvi | P10 #6 | 🔧 ✅ |
| F6 | dealer-payment-add.js:30 | `debt` ustuni so'ralardi (bazada `debt_usd`) | HAR BIR diller to'lovi serverda rad etilardi | `debt_usd` + idemKey | P10 #4 | 🔧 ✅ |
| F7 | app-data-load.js:64, _lib/appDataGuard.js:97 | Sozlamalar to'liq yuborilardi | Kassir Telegram bot tokeni va admin PIN'ini ko'rardi | Admin bo'lmaganga maxfiy kalitlar yuborilmaydi; saqlashda o'chmaydi | P10 #5 | 🔧 ✅ |
| F8 | dealer-update.js:41 | Balans maydonlari tekshiruvsiz | Manfiy/NaN qarz, iz qoldirmay o'zgartirish | Raqam tekshiruvi + har bir balans o'zgarishi audit jurnaliga | P10 #6 | 🔧 ✅ |
| B3 | js/main.js:6531 | Overhead'da bank 0.6% bor edi, yana qo'shilardi | Kirim'da bank haqi kassadan 2 marta yechilardi | Faqat Σ overhead | P12 #2 | 🔧 ✅ |
| B4 | js/main.js:3472 | Kassaga berilgan pul (qaytim bilan) yozilardi | Kassa qaytim miqdorida ortiqcha | Kassaga min(berilgan, jami) | P12 #1 | 🔧 ✅ |
| B5 | js/main.js:3383 | "Skidka sifatida" — serverga asl % ketardi | Server farqni mijoz QARZIGA yozardi | Samarali skidka % yuboriladi | P12 #1 | 🔧 ✅ |
| B6 | js/main.js:9998 | Turli valyutadagi kassalar orasida konvertatsiyasiz | 128 000 so'm → $128 000 | Kurs bo'yicha konvertatsiya; qoldiqdan ortiq chiqim bloklanadi | P12 #2 | 🔧 ✅ |
| B8 | js/main.js:3846 | Qaytarishda kassadan HAM, qarzdan HAM; skidka e'tiborsiz | Mijozga ikki barobar qaytarilardi | Skidkali narx; avval qarzdan, qolgani kassadan | P12 #3 | 🔧 ✅ |
| B9 | sale-checkout-atomic.js:58 (+4 funksiya), _lib/supabaseAdmin.js:178 | Server filialni admin'ning staff yozuvidan olardi | Admin 729-filialda sotsa — Baza omboridan tekshirilardi | Admin — tanlangan filial; boshqa xodim — o'z filiali | P10 #3 | 🔧 ✅ |
| J2 | js/main.js:1653, 12576 | Filiallar ro'yxati yuklanmasdan filial tanlanardi | Qo'shilgan filial xodimi bo'sh "Baza"ga tushardi | Avval ro'yxat tiklanadi; server filialiga ishoniladi | P12 #4 | 🔧 ✅ |
| J13 | js/sotuvchi.js:149 | Faqat 'f729' tanilardi | f702 sotuvchisi "Baza"da ishlab, savdolari yo'qolardi | `ME.filial` ishlatiladi | P12 #9 | 🔧 ✅ |
| J4, J5 | js/main.js:10748, 10770, 10351 | Mahsulot kartasi va xarajat egasi nomi esc'siz | Saqlangan XSS (sotuvchi kiritgan mijoz nomi admin'da bajarilardi) | `esc()` | P12 #4, #6 | 🔧 ✅ |
| U1 | css/design-system.css:557 | `.bs-ov{display:flex}` brauzerning `[hidden]` qoidasini bekor qilardi | Sozlamalardagi istalgan oyna yopilgach butun ekran bosilmay qolardi | `.bs-ov[hidden]{display:none}` | P12 #7 | 🔧 ✅ |

### P2
| ID | Fayl:qator | Sabab / ta'sir | Tuzatish | Test | Natija |
|---|---|---|---|---|---|
| F9 | rbac-staff-roles-set.js:29, rbac-permission-toggle.js:22, rbac-role-upsert.js:28 | `rollar.manage` egasi o'ziga istalgan rol berardi, tizim rollarini o'zgartirardi | O'ziga rol yo'q; owner/administrator — faqat admin; tizim rollari — faqat admin | P10 #2 | 🔧 ✅ |
| F11 | dealer-order-status.js:38 | Holat mashinasi yo'q; tasdiqlashda istalgan qatorlar | Faqat pending → approved/rejected; faqat buyurtmadagi mahsulotlar | P10 #6 | 🔧 ✅ |
| F12 | catalog-sync.js:26 | Mijoz qatorlari o'zgarishsiz (istalgan filial/ustun) | Oq ro'yxat, raqam tekshiruvi, o'z filiali | P10 #6 | 🔧 ✅ |
| F15 | _lib/appDataGuard.js:128 | Har qanday xodim `auditLogs:[]` bilan tarixni o'chirardi | Admin bo'lmagan — faqat qo'shish | P10 #5 | 🔧 ✅ |
| B13 | js/main.js:12143, 12174 | Excel import: 0.006 qattiq, yo'lkira bank asosiga kirmasdi; qarzga landed cost | `CUR.BANK_FEE`; qo'lda Kirim bilan bir xil asos; qarzga faqat tovar | P12 #6 | 🔧 ✅ |
| B15 | js/main.js:10202 | Bitta kassada yetmasa ham boshqalari yechilardi; 0 kurs | Avval hammasi tekshiriladi; kurs > 0 | P12 #2 | 🔧 ✅ |
| J7 | js/main.js:11309 | Qayta dizaynda PIN o'zgartirish oynasi yo'qolgan (standart 1212 qolardi) | Sozlamalar → Xavfli hudud → "Xavfsizlik PIN kodi" | UI audit | 🔧 ✅ |
| U2 | css/design-system.css:1313 | Bildirishnomalar konteyneri ostidagi tugmalarni to'sardi | `pointer-events:none` | P12 #7 | 🔧 ✅ |
| Hamkor/DB | supabase-migration-23 (3-bo'lim) | `partner_*_atomic` anon/authenticated uchun ochiq (RLS to'sardi) | EXECUTE faqat server | P11 #3 | 🔧 ✅ (23-migratsiyadan keyin) |

### P3
| ID | Fayl:qator | Tuzatish | Test | Natija |
|---|---|---|---|---|
| U3 | css/design-system.css:1310 | ≤380px galereya 2 ustun (★ va × ustma-ust edi) | P12 #7 | 🔧 ✅ |
| J9 | js/main.js:3139, js/sotuvchi.js:678 | Mijoz qidiruvi matni HTML/JS sifatida | P12 #6 | 🔧 ✅ |
| J6, J12 | js/sotuvchi.js:1242, 1254; js/main.js:105, 9857 | Diller/filial/kassa nomlari xavfsiz | kod ko'rib chiqildi (avtomatik test yo'q) | 🔧 |
| J10 | js/main.js:1230, 1622 | Buzuq localStorage ilovani to'xtatmaydi | kod ko'rib chiqildi (avtomatik test yo'q) | 🔧 |
| F16 | dealer-audit-log-add.js:32, dealer-audit-log-list.js, create-staff/dealer, update-staff | Boshqa filial dilleriga soxta yozuv; limit; `ilike` joker belgilari | kod ko'rib chiqildi (avtomatik test yo'q) | 🔧 |

## 4. Yangi modul: Firma Kassa (23-migratsiya)
- **Baza:** `firma_kassa_balance` (USD, UZS; CHECK ≥ 0), `firma_kassa_ledger` (o'chirilmaydi; `idem_key` UNIQUE; yo'nalish ↔ amal turi CHECK).
- **Funksiyalar:**
  - `_fk_cash_move` — yagona yozish yo'li: qoldiq FOR UPDATE bilan qulflanadi, manfiy yo'q, idempotent;
  - `firma_kassa_give_advance` / `firma_kassa_repay_advance` — avans; qaytarish qolgan avansdan oshmaydi, advisory lock bilan;
  - `firma_kassa_get_balance`, `firma_kassa_advance_outstanding`, `kirim_firma_kassa_check`.
- **Ruxsatlar:** RLS yoqilgan, anon/authenticated'ga hech narsa ochiq emas, faqat service_role. Yangi ruxsatlar `firma_kassa.view` va `firma_kassa.transact`: owner va administrator — ikkalasi, accountant — faqat ko'rish.
- **Server:** `netlify/functions/firma-kassa.js` — `state`, `kirim_check`, `move`, `branch_in`, `branch_out`, `advance_give`, `advance_repay`, `kirim_pay`, `partner_withdrawal`. Partner_withdrawal va tuzatish — faqat admin.
- **Interfeys:** Moliya → "Firma kassasi":
  - qoldiqlar, qaytarilmagan avanslar va harakatlar tarixi (sahifalab);
  - Kirim/Chiqim, Filialdan qabul, Filialga berish, Avans, Hamkorga to'lov.
- **Kirim integratsiyasi:** "Pul qaysi manbadan" → "🏛 Firma kassasi". Avval server yechadi; mablag' yetmasa Kirim umuman yozilmaydi (fail-closed).
- **Qoidalar:**
  - Filial-Kassa ≠ Firma-Kassa. Filial kassasi faqat server tasdiqlagandan keyin o'zgaradi.
  - Hisob valyutasi faqat USD yoki UZS; CNY 3 qatlamda rad etiladi: UI, server, baza CHECK.
  - Hamkor (ta'sischi) to'lovi `partner_withdrawal` — maosh EMAS. U Hamkorlar hisobotida "Ulush to'lovi" bo'lib ko'rinadi va hamkor SUMMA'sidan kamayadi.
- **v11:** filial kassalari ham endi server jurnalida (2a-bo'lim). Ular Firma Kassadan alohida qoladi; faqat "Filialdan qabul / Filialga berish / Bazaga to'lov" ikkalasini bitta tranzaksiyada bog'laydi.

## 5. ZIP ↔ PRODUCTION baza solishtiruvi (2026-10-02, faqat o'qish)
Production bazadan faqat SELECT bilan o'qildi, hech narsa yozilmadi. ZIP sxemasi haqiqiy PostgreSQL'da ko'tarildi. 518 obyekt solishtirildi: jadval ustunlari, funksiya matni, SECURITY DEFINER, search_path, EXECUTE ruxsatlari, RLS siyosatlari, RLS yoqilganligi, cheklovlar, indekslar, triggerlar, ruxsatlar, rol-ruxsat.

| Holat | Soni | Nima |
|---|---|---|
| BOTH (aynan bir xil) | 443 | Production'dagi hamma narsa |
| ZIP ONLY | 65 | 23-migratsiya (39): Firma Kassa — 2 jadval + RLS, 11 cheklov, 5 indeks, 6 funksiya + ruxsatlari, 2 permission, 5 rol-ruxsat. 24-migratsiya (26): `cashbox_ledger` + RLS, 8 cheklov, 5 indeks, 5 funksiya + ruxsatlari, `cashbox_balances_guard` trigger |
| MISMATCH | 10 | 23: `record_dealer_sale` (7 arg.) va 7 ta EXECUTE ruxsati. 24: `sale_checkout_atomic_v2` matni, `cashbox_balances` (+`currency` ustuni) |
| PRODUCTION ONLY | 0 | — |

**Holat (o'qildi):**
- **23-migratsiya QO'LLANMAGAN** (`firma_kassa_ledger` yo'q);
- **24-migratsiya QO'LLANMAGAN** (`cashbox_ledger` yo'q);
- `cashbox_balances` — 0 qator;
- baza va f729 kassalari JSON'da hammasi 0;
- `branchDebt` = {};
- kurs — 11 800.

Ya'ni 24-migratsiyaning "opening" bosqichi hozir faqat 0 qoldiqlarni ko'chiradi.

Isbot: PGlite'da "production + 23 + 24 = schema.sql" testi (funksiya matnlari va ruxsatlari bilan) va takroriy ishga tushirish testi o'tdi (P11 #1).

## 6. Test natijalari
- `npm test`: **122/122 PASS**. v11 da yangi:
  - **P13** (11 test) — F4 1–7, B7, brauzer;
  - **P14** (2 test) — lokal to'liq stek E2E.
- **Eski koddagi natija:**
  - P13 v9 da 0/11, v10-FINAL'da 0/11;
  - P14 F4/B7 tuzatishlari olib tashlangan nusxada yiqiladi (mutatsiya testi).
- **Eski testlarga o'zgartirish** (zaiflashtirish emas, yangi API'ga moslash):
  - P3 — `deleteExpenseRow`/`addExpense` endi asinxron (await), tekshiruvlar aynan o'sha;
  - P8/P11 — sxema sonlari 24-migratsiya bilan (+1 jadval, +5 funksiya, +8 cheklov, +5 indeks);
  - P8 savdo testida kassa valyutasi (server qo'shadi) va jurnal tekshiruvi qo'shildi;
  - test yordamchilari (mem-supabase, fake-admin) — "24-migratsiyagacha" holatni (`cashbox_ledger` yo'q) to'g'ri modellashtiradi.
- **Haqiqiy PostgreSQL 16:** `tests/evidence/f4-b7-real-postgres.js` — 7/7 (2a/2b-bo'limlar).
- **UI audit:** 11 o'lcham + 844×390 landshaft × 40 holat = **480/480**. **Smoke:** 117/117.

## 7. Qolgan muammolar (hal qilinmagan — qaror kerak)

### P1
- **F4 — kassa:** ✅ HAL QILINDI (2a). **B7:** ✅ HAL QILINDI (2b).
- **F4b — qarzlar va ombor (qoldi).**
  - Mijoz/ta'minotchi qarzi (`customers[].debt`, `suppliers[].debt`) va partiya `sold` hali JSON'da, brauzer qiymatiga ishoniladi.
  - Huquqi bor xodim ularni konsoldan o'zgartira oladi (kassa endi o'zgarmaydi).
  - **Yechim:** kassa bilan bir xil jurnal namunasi — `customer_ledger` / `supplier_ledger`; ombor uchun mavjud `batches` jadvalini haqiqiy manba qilish.
  - Bu jiddiy baza o'zgarishi, shuning uchun alohida tasdiq kerak.
- **Ikki manba (B12/B22) — qisman.**
  - Kassa uchun hal bo'ldi: `cashbox_balances` = jurnal = sahifa.
  - Qarz va to'lov uchun qoldi: `customer_balances` USD'da, to'lovlar UZS'da; `customer_debt_payments` kabi yozuvlar kassa amali bilan bitta tranzaksiyada emas. Avval to'lov yozuvi, keyin kassa amali bajariladi; kassa amali rad etilsa, to'lov yozuvi qoladi.

### P2
- **F10/B11:** kassa qismi ✅ hal qilindi — chiqim qoldiqdan oshmaydi (serverda). Qarzdan oshiq to'lov tekshiruvi esa hali mijoz yuborgan `debtBefore` qiymatiga tayanadi (F4b bilan birga hal bo'ladi).
- **F13:** diller savdosi `dealer-sale-add` + `dealer-stock-upsert` — parallel sotuvda qoldiq poygasi. Diller portali o'zi `record_dealer_sale` orqali ishlaydi, u tuzatilgan.
- **F14:** `migrate-branch-data` "migrate" rejimi yangi ma'lumotni eski bilan ustidan yozishi mumkin. Faqat admin vositasi.
- **J8:** zaxiradan tiklash (`importBackup`) tasdiqsiz va tuzilma tekshiruvisiz.
- **B14:** "yo'lda" kelgan tovar bojxonasi tannarxga qo'shiladi, lekin kassadan yechilmaydi va qarzga yozilmaydi.
- **B16/B17 — biznes qarori kerak:**
  - hamkor foydasiga filialga o'tkazish ustamasi kiradi;
  - xodim maoshi ta'sischilar ulushidan ayiriladi;
  - umumiy balans bitta filial aktivini butun korxona kapitali bilan solishtiradi.
- **Supabase maslahatchisi:**
  - 11 ta SQL funksiyada `search_path` mahkamlanmagan;
  - "sizib chiqqan parollarni tekshirish" o'chiq.
- **F16 qoldig'i:**
  - `catalog-full-sync` va `*-shadow-check` alohida ruxsat talab qilmaydi;
  - `netlify.toml` dagi `SECRETS_SCAN_OMIT_KEYS` Netlify'ning sir skanerini o'chiradi.

### P3
- B18: Dashboard'dagi "Xarajatlar" hamkor to'lovlarini ham qo'shadi.
- B19: INV raqami `sales.length+1` — takrorlanishi mumkin.
- B20: `c.total` faqat qarzli savdoda o'sadi.
- B21: "Powerful kassa" ba'zi tanlovlarda ko'rinadi.
- J11: Dashboard'da ishlatilmaydigan hisoblar.
- J7 qoldig'i: Excel eksport/chop etish funksiyalari menyudan chiqib qolgan, kodda bor.

## 8. Baza o'zgarishlari
| Migratsiya | Holat |
|---|---|
| 22 (`supabase-migration-22-v10-fixes.sql`) | ✅ Production'ga qo'llangan (siz, SQL Editor) |
| 23 (`supabase-migration-23-v10-firma-kassa.sql`) | ⏸ Tayyor, sinalgan — **qo'llanmagan** |
| 24 (`supabase-migration-24-v11-cash-authority.sql`) | ⏸ Tayyor, sinalgan (PGlite + PostgreSQL 16) — **qo'llanmagan**. 23 dan keyin |

24-migratsiya:
- **qo'shimcha (additive):** 1 jadval, 1 ustun, 1 trigger, 5 funksiya; `sale_checkout_atomic_v2` qayta yozilgan;
- **xavfsiz:** DROP/DELETE/TRUNCATE yo'q; takroriy ishga tushirish xavfsiz;
- **himoya:** RLS yoqilgan, anon/authenticated'ga yopiq, faqat service_role;
- **indekslar:** 3 ta; **cheklovlar:** 8 ta.

**Orqaga qaytarish:**
- kodni oldingi deploy'ga qaytarish yetarli: eski kod `cashbox_ledger`ni ishlatmaydi;
- lekin trigger eski kodning `sale_checkout_atomic` v1 chaqiruvini to'sadi — v10 kodi uni ishlatmaydi;
- jadvalni o'chirish tavsiya etilmaydi: jurnal — moliyaviy tarix.

## 9. O'zgargan fayllar (v11)
- **Baza:** `supabase-migration-24-v11-cash-authority.sql` (yangi), `supabase/schema.sql` (8-bo'lim).
- **Server:**
  - yangi: `netlify/functions/cashbox-ops.js`, `_lib/cashAuthority.js`;
  - o'zgargan: `app-data-save.js`, `app-data-branch-save.js`, `app-data-load.js`, `sale-checkout-atomic.js`, `firma-kassa.js`.
- **Mijoz:** `js/shared.js` (`fwCashOps`, `fwApplyCashBalances`, `fwApplyServerCashboxes`), `js/main.js`, `js/sotuvchi.js`, `js/firma-kassa.js`.
- **Testlar:**
  - yangi: `tests/p13-v11-f4-b7-kassa.test.js`, `tests/p14-v11-e2e-local-stack.test.js`, `tests/helpers/pg-supabase.js`, `tests/evidence/*.js`;
  - moslangan: `p3`, `p8`, `p11`, `helpers/mem-supabase.js`, `helpers/fake-admin.js`.
- **Hujjatlar:** `AUDIT-HISOBOT.md`, `TEST-NATIJALARI.md`, `CHANGES.md`, `DEPLOY.md`, `README.md`, `ornatish.md`.

v10 da o'zgargan fayllar — `CHANGES.md` (P10 bo'limi).
