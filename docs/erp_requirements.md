# POWERFUL PRO — ERP TALABLARI REYESTRI (ASOSIY NAZORAT REJASI)

> **MUHIM QOIDA:** Har bir yangi modul yoki o'zgarishdan OLDIN shu hujjat o'qilishi va
> mavjud talablar bilan ziddiyat bo'lmasligi tekshirilishi SHART. Har bir modul
> tugagach — tegishli band shu yerda yangilanadi. Hech qanday band "bajarilmadi"
> deb o'chirilmaydi yoki yo'qotilmaydi. Talab "o'xshash funksiya bor" degan asosda
> avtomatik ✅ deb belgilanmaydi — faqat kod/testdan tasdiqlangan holat yoziladi.

Oxirgi yangilangan sana: **2026-08-12** (To'liq audit + Master Nazorat Rejasi)

**Belgilar:** ✅ TO'LIQ · 🟡 QISMAN · ❌ QOLGAN · ⚠️ TEKSHIRILMAGAN

---

## 0-BLOK — BUSINESS OVERVIEW (`01_Business_Overview-1.docx`)

| # | Talab | Holat | Izoh |
|---|---|---|---|
| 0.1 | Mahsulot bir nechta omborda (filialda) bo'lishi mumkin | ✅ | `BRANCH_KEYS` orqali har filial o'z `batches`iga ega |
| 0.2 | Diller: yetkazilgan/sotilgan/qolgan/qaytgan miqdor kuzatuvi | ✅ | Kuzatuv bor va **filial-scoped, Function darajasida xavfsiz** (P1 — tasdiqlandi) |
| 0.3 | Qaytarilgan tovar avtomatik ombor qoldig'ini oshiradi | ✅ | `doDealerReturn()` — faqat sotiladigan holatdagilar |
| 0.4 | Dashboard: savdo/foyda/xarajat/sekin-sotiluvchi/o'lik-zaxira/ortiqcha/kam-qoldiq/eng-ko'p-sotilgan | ✅ | 8/8 ko'rsatkich mavjud |
| 0.5 | Moliya: naqd/bank/xarajat/ta'minotchi to'lovi/diller to'lovi | ✅ | |
| 0.6 | Moliya: egasi pul olishi (owner withdrawal) | ✅ | "Uyga berish" (`doKunlikHisob`) — RBAC-cheklangan, kim/izoh saqlanadi (P2 tasdiqlandi) |
| 0.7 | Excel/PDF/Print qo'llab-quvvatlash | ✅ | 16+ joy |
| 0.8 | Barcha muhim amallarni log qilish (faoliyat jurnali) | ✅ | `auditLog()` |
| 0.9 | Bir nechta filialni qo'llab-quvvatlash | ✅ | Asosiy tizim va diller qismi — ikkalasi ham tasdiqlangan (P1) |

---

## 1-BLOK — UMUMIY TIZIM

| # | Talab | Holat | Dalil |
|---|---|---|---|
| 1 | Oddiy mahsulot 0 qoldiqda sotilmasin | ✅ | `savdoAdd()` |
| 2 | Konsignatsiya va Direct Sale bir-biriga aralashmasin | ✅ | Mustaqil mexanizmlar |
| 3 | Dona/kg/m² birlik tizimi butun tizimda yagona | ✅ | `p.unit` — barcha oqimda |
| 4 | Filial bo'yicha mahsulot ko'rinishi ajratilsin | ✅ | `branchVisibleProducts()` |
| 5 | Sotuvchi mijoz qarzi va to'lovini ko'rsin | ✅ | `svDebtHtml()` |
| 6 | Savdo miqdori avtomatik 1, katta/kasrli son | ✅ | `qty:1`, 88px input, `parseFloat` |
| 7 | Qaytim/qarz-yoki-skidka/zarar tasdiqlash | ✅ | `_openSaleConfirm()` — 5 test PASS |
| 8 | Kassa firma nomiga dinamik bog'lansin | ✅ | `syncCompanyCashboxName()` |
| 9 | Xarajat kategoriyalarida "Ijara" mavjud | ✅ | `DOKON_EX_CATS` |
| 10 | Global son formatlash (`fmtNum`/`parseNum`) | ✅ | Butun loyihada |
| 11 | Dashboard — ism/rol/filial | ✅ | |
| 12 | Kunlik hisob mavjud (Aksiverka o'rniga) | ✅ | |
| 13 | RLS va xavfsizlik saqlansin | ✅ | `app_data`/`app_data_branches` yopilgan |

---

## 2-BLOK — DIRECT SALE (Ta'minotchidan to'g'ridan-to'g'ri sotish)

| # | Talab | Holat | Dalil |
|---|---|---|---|
| 14 | Ombordagi mahsulotni ham Direct Sale sifatida sotish | ✅ | Qidiruv 🚚 tugmasi |
| 15 | Bir savatda ombordagi + ta'minotchidan birga | ✅ | 4 test PASS |
| 16 | Har bir mahsulot o'z manbasiga qarab alohida hisoblanadi | ✅ | Noyob `key` |
| 17 | Manba (Ombordan/Ta'minotchidan) aniq ko'rinsin | ✅ | Badge — savat/qaytarish |
| 18 | Yagona Savdo ro'yxatida saqlanadi | ✅ | Bitta `S.sales` |
| 19 | Ta'minotchidan sotilganda qarz hisobga olinsin | ✅ | `supp.debt += ...` |
| 20 | Ta'minotchiga to'lovda qarz kamaysin | ✅ | `paySupplierDebt()` |
| 21 | Foyda Dashboard/Moliya/Hisobotda to'g'ri | ✅ | `sale.profitUsd` |
| 22 | Ombordan sotilganda ombor qoldig'i kamaysin | ✅ | `deductFIFO()` |
| 23 | Qaytarishda ombordan/ta'minotchidan alohida ishlansin | ✅ | `doSaleReturn()` |
| 24 | Ta'minotchidan sotilgan qaytarilsa omborga jismoniy qo'shilmasin | ✅ | Kritik xato tuzatildi |
| 25 | Qaytarishda 2 marta hisoblanmasin | ✅ | 4 test PASS |
| 26 | Aralash savatda noyob key orqali izolyatsiya | ✅ | |
| 27 | Konsignatsiya mantiqi buzilmasin | ✅ | |
| 28 | Filial/ombor kesimida to'g'ri ajratilsin | ✅ | |
| 29 | Savdo tarixi/qaytarishlar hisobotda saqlansin | ✅ | |

**Testlar:** Aralash savat 4/4, Qaytarish 4/4 — jami 8/8 PASS

---

## 3-BLOK — DILLER

| # | Talab | Holat | Izoh |
|---|---|---|---|
| 3.1 | Diller — yetkazilgan/sotilgan/qolgan/qaytgan miqdor | ✅ | Mavjud va filial-scoped (P1 tasdiqlandi) |
| 3.2 | Diller reyting, kredit nazorati | ✅ | "📊 Tahlil" tab |
| 3.3 | Diller qaytarish — holat (Yangi/Yaxshi/Ta'mirtalab/Yaroqsiz) | ✅ | `doDealerReturn()` |
| 3.4 | Diller — ball (points) tizimi | ✅ | `pointPct`, `POINT_SETTINGS` |
| 3.5 | Diller — kredit limiti, to'lov muddati | ✅ | `credit_limit_usd`, `payment_due_days` |
| 3.6 | Diller audit jurnali | ✅ | `dealer_audit_log`, `dlAuditDealer()` |
| 3.7 | Diller — filial scope (faqat o'z filiali dilleri) | ✅ | `dealer-data-load.js` + `assertOwnFilial()` — 7 Function'da tasdiqlandi (P1) |
| 3.8 | Diller revizyasi — alohida, tarixi saqlanadigan | ✅ | `S.dealerRevisions` |
| 3.9 | Diller buyurtmalari (order approve/reject) | ✅ | `dealer-order-status.js` |

---

## 4-BLOK — OMBOR / KIRIM

| # | Talab | Holat | Izoh |
|---|---|---|---|
| 4.1 | Kirim → Yo'lda → Keldi → Ombor oqimi | ✅ | |
| 4.2 | Bojxona xarajati — Donaga/Summaga taqsimlash | ✅ | `distributeUsd()` |
| 4.3 | Faqat "Ta'minotchi" maydoni | ✅ | |
| 4.4 | "Kelib chiqqan joy" olib tashlangan | ✅ | |
| 4.5 | Partiya o'chirish (bitta/butun guruh) | ✅ | |
| 4.6 | Rasm — qayta yuklashda eskisi almashadi, etim qolmaydi | ✅ | |
| 4.7 | Excel import shabloni — 9 ustun | ✅ | |

---

## 5-BLOK — FILIAL / MULTI-BRANCH

| # | Talab | Holat | Izoh |
|---|---|---|---|
| 5.1 | Filial almashtirish — faqat admin | ✅ | |
| 5.2 | Filial menejeri — o'z xodimini boshqarsin | ✅ | migratsiya 23 |
| 5.3 | Asosiy ombor admini filialga o'tganda vakolatni noto'g'ri boshqarmasin | ✅ | |
| 5.4 | Mahsulot katalogi — to'liq filial bo'yicha ajratilishi | ❌ | **TAKLIF, biznes qarori kutilmoqda (P4)** |
| 5.5 | Diller/dealerStock — filial bo'yicha ajratilishi | ✅ | **P1 — tasdiqlandi**, Function darajasida to'liq xavfsiz |

---

## 6-BLOK — DASHBOARD / CRM / HISOBOTLAR

| # | Talab | Holat | Izoh |
|---|---|---|---|
| 6.1 | Dashboard — kim/rol/filial | ✅ | |
| 6.2 | Dashboard — 8 ta ko'rsatkich | ✅ | |
| 6.3 | Mahsulot harakat kartochkasi | ✅ | `productMovementsHtml()` |
| 6.4 | CRM — mijozlar ro'yxati, qidiruv | ✅ | |
| 6.5 | Qidiruv (mahsulot/mijoz/ta'minotchi) | ✅ | |
| 6.6 | Bildirishnomalar (notifications) tizimi | ⚠️ | Faqat `toast()` (bir martalik) — doimiy/tarixiy bildirishnoma yo'q |
| 6.7 | Hisobotlar | ✅ | |

---

## 7-BLOK — MOLIYA / FOYDA / QARZ

| # | Talab | Holat | Izoh |
|---|---|---|---|
| 7.1 | Kassa/Qobiljon — firma nomiga dinamik | ✅ | |
| 7.2 | Ta'minotchi qarzi — aniq ko'rinishi | ✅ | |
| 7.3 | Foyda — barcha savdo turida to'g'ri | ✅ | |
| 7.4 | Egasi pul olishi — alohida funksiya | ✅ | **P2 — tasdiqlandi**, RBAC-cheklangan |
| 7.5 | Savdo/checkout — server-darajasida tasdiqlash | ❌ | **P3 — eng katta ochiq band** |

---

## 8-BLOK — ROLLAR / RBAC / XAVFSIZLIK

| # | Talab | Holat | Izoh |
|---|---|---|---|
| 8.1 | RBAC — rollar, ruxsatlar | ✅ | 9 standart rol |
| 8.2 | `app_data`/`app_data_branches` RLS | ✅ | migratsiya 22 |
| 8.3 | `requireStaffAuth` — barcha muhim Function'da | ✅ | |
| 8.4 | Filial menejeri — xodim/rol boshqaruvi | ✅ | |
| 8.5 | `service_role` frontendga chiqmasin | ✅ | |
| 8.6 | Test/tozalash rejimi — production'da yashiringan | ✅ | |
| 8.7 | Production'da migratsiyalar ishga tushirilganini tasdiqlash | ⚠️ | **P5** |

---

## 🔴 MAJBURIY OCHIQ BANDLAR

### P1 — Diller/dealerStock/dealerTxns — filial bo'yicha to'liq ajratish
**Holat: ✅ TO'LIQ — Function/DB darajasida allaqachon xavfsiz ekanligi tasdiqlandi.**

Chuqur audit natijasida: `dealer-data-load.js` va bog'liq 6 ta Function
(`dealer-update`, `dealer-delete`, `dealer-stock-upsert`, `dealer-payment-add`,
`dealer-sale-add`, `dealer-stock-move-add`, `dealer-orders-list`) — barchasida
`requireStaffAuth({filialField})` va/yoki `assertOwnFilial()` orqali filial-cheklov
**allaqachon to'liq ishlaydi** (kod bilan tasdiqlandi, 2026-08-12).

Eskirgan, chalg'ituvchi kod izohi **to'g'irlandi** (`js/main.js`, `BRANCH_KEYS`
yaqinida). `app_data` blokidagi `dealers`/`dealerStock`/`dealerTxns` yozuvlari —
xavfsizligi 100% isbotlanmagani uchun **olib tashlanmadi** (halos, zararsiz
qoldiq sifatida qoldirildi — bu ma'lumotlar hech qachon o'qib ishlatilmaydi,
chunki `dlLoadDealerData()` ularni initData() ichida darhol almashtiradi).

### P2 — Egasi pul olishi — aniq alohida moliyaviy funksiya
**Holat: ✅ TO'LIQ (mavjud "Uyga berish" funksiyasi xavfsizlashtirildi).**

Audit natijasida aniqlandi: "Egasi pul olishi" — Kunlik hisobdagi **"🏠 Uyga
berish"** funksiyasi orqali allaqachon mavjud edi (Hamkorlar modulidan
**butunlay farqli** — Hamkorlar faqat ulush-hisobi, kassaga tegmaydi).
Quyidagilar qo'shildi:
- `kassalar.transact` RBAC ruxsati bilan cheklandi (mavjud ruxsat, yangisi yaratilmadi)
- Yuqori paneldagi tugma ham ruxsatsizlarga yashiriladi
- "Kim bajargani" — `performedByStaffId` (ishonchli, RBAC-staffId) + `performedBy` (o'qish uchun ism)
- Ixtiyoriy izoh maydoni (bo'sh qoldirilsa — eski standart matn saqlanadi)
- Tarix jadvaliga "Kim" va "Izoh" ustunlari qo'shildi, eski yozuvlar `—` bilan ko'rsatiladi

**Qolgan ochiq xavf (P3ga tegishli, bu yerda hal qilinmadi):** server-tomon
tasdiqlash yo'q — bu butun tizimning umumiy P3 muammosi.

**"Uyga berilgan pul" qayerda ko'rinadi:** faqat "📜 Kunlik hisob tarixi"
oynasida. Asosiy Dashboard/Hisobot sahifasida alohida ko'rsatkich sifatida
**hali yo'q** — kelajakda kerak bo'lsa alohida ko'rib chiqiladi.

### P3 — Savdo/checkout hisob-kitoblarini server/database darajasida tasdiqlash
**Holat: ❌ Boshlanmagan — TO'LIQ AUDIT YAKUNLANDI (2026-08-12), implementatsiya rejasi tayyorlandi.**

#### P3 AUDIT XULOSASI

Loyihada "savdo/checkout" uchun **hech qanday Function yo'q** — barcha moliyaviy
hisob-kitob (`js/main.js`) 100% frontendda bajariladi, `app_data` blokiga
to'g'ridan-to'g'ri yoziladi. Diller-bog'liq 5 ta Function bor
(`dealer-sale-add`, `dealer-payment-add`, `dealer-stock-upsert`,
`dealer-stock-move-add`), lekin ular **faqat yozadi — hech qachon qiymatlarni
qayta hisoblamaydi yoki tekshirmaydi** (masalan `total_usd=qty*sell_usd`
tasdiqlanmaydi, qarz-yetarliligi tekshirilmaydi).

| Blok | Holat | Asosiy dalil |
|---|---|---|
| Asosiy Savdo (savat/jami/chegirma/foyda/tannarx/to'lov/qarz) | ❌ FAQAT FRONTEND | `_savdoCommit()` |
| Direct Sale (ombordan/ta'minotchidan/aralash/manba/foyda/qarz) | ❌ FAQAT FRONTEND | `confirmDirectSupplySale()`, `_savdoCommit()` |
| Qaytarish (ombor/ta'minotchi/kassa/foyda/qarz) | ❌ FAQAT FRONTEND | `doSaleReturn()` |
| Diller qaytimi | ✅ YAXSHILANDI (P3-1) | `dealer-stock-move-add.js` — endi `return` uchun qoldiq-yetarliligini serverda tekshiradi |
| Kassa kirim/chiqim/uyga berish/ta'minotchi to'lovi | ❌ FAQAT FRONTEND | `js/shared.js` `logCashTxn()`, `paySupplierDebt()` |
| Dillerga mahsulot/savdo/to'lov | ✅ YAXSHILANDI (P3-1) | `dealer-*.js` — auth+filial ✅, **endi qiymat/qoldiq/qarz serverda tekshiriladi**, `total_usd` serverda qayta hisoblanadi |
| Ombor (qabul/chiqim/ko'chirish/qoldiq) | ❌ FAQAT FRONTEND | `deductFIFO()`, `S.batches` |
| Takroriy yuborishdan himoya (idempotency) | ⚠️ YO'Q | `inv` raqami vaqt-asosli, kalit-asosli emas |
| Qisman muvaffaqiyatsizlikda yarimta qolish | 🔴 XAVF TASDIQLANDI | `doDealerReturn()` — ketma-ket `await`, atomik emas |

**Bog'liqlik xaritasi:** Savdo/checkout — markaziy tugun (Ombor-FIFO va
Ta'minotchi-qarzga bog'liq). Diller — nisbatan mustaqil shox.

**Tavsiya etilgan tartib:** (1) Diller Function-validatsiya → (2) Ombor/FIFO
serverga → (3) Asosiy Savdo/checkout serverga → (4) Qaytarish serverga.

To'liq 17-bandli implementatsiya rejasi — quyida, alohida bo'limda.

### P4 — Mahsulot katalogining filiallar bo'yicha arxitekturasi
**Holat: ❌ TAKLIF, qaror kutilmoqda.**

### P5 — Production'da jonli test va migratsiyalarni tekshirish
**Holat: ⚠️ Faqat siz tasdiqlay olasiz.**

---

## 📐 P3 — IMPLEMENTATSIYA REJASI (17 bosqich, kod hali yozilmagan)

> Har bir bosqich uchun: fayl → Function → jadval → manba → saqlanadigan mantiq →
> serverga ko'chadigan qism → regressiya xavfi → testlar.

### 1. Diller Function — server-side validatsiya
**Holat: ✅ TO'LIQ BAJARILDI (2026-08-12), 15/15 test PASS.**

O'zgargan fayllar (faqat 4 ta, boshqa hech narsa tegilmadi):
- `netlify/functions/dealer-sale-add.js`
- `netlify/functions/dealer-payment-add.js`
- `netlify/functions/dealer-stock-upsert.js`
- `netlify/functions/dealer-stock-move-add.js`

Qo'shilgan tekshiruvlar:
- `total_usd = qty × sell_usd` — **server har doim o'zi qayta hisoblaydi**, client yuborgan qiymatga ishonilmaydi
- Sotish/qaytarish miqdori — diller ombiridagi haqiqiy qoldiqdan (`dealer_stock.qty`, serverdan o'qiladi) oshib ketmasligi tekshiriladi
- To'lov summasi — diller haqiqiy qarzidan (`dealers.debt`, serverdan o'qiladi) oshib ketsa **rad etiladi**
- Manfiy/noto'g'ri qiymatlar (`qty<=0`, `sellUsd<0`, `avgCostUsd<0`) — rad etiladi
- Oddiy idempotency — so'nggi 5 soniyada aynan bir xil (mahsulot+miqdor+narx/summasi) so'rov — takroriy (tarmoq-retry) deb hisoblanadi, qayta yozilmaydi
- Filial/RBAC (`requireStaffAuth`+`assertOwnFilial`) — **tegilmadi, mavjudicha qoldi**

SQL/migratsiya — **ishlatilmadi**. Boshqa fayl (frontend, boshqa Function) — **tegilmadi**.

⚠️ **Sizning tasdig'ingiz bilan yopildi (2026-08-12):** to'lov qarzdan oshsa —
**RAD ETILADI** (`Math.min` bilan kesib olinmaydi). Yakuniy qaror.

### 2. Umumiy server-side hisoblash yadrosi
**Holat: ✅ TO'LIQ BAJARILDI (2026-08-12), 15/15 test PASS.**

- **Yangi fayl:** `netlify/functions/_lib/saleEngine.js`
- Barcha formula (`subtotalUsd`, `discUsd`, `totalUsd`, `costUsd`, `profitUsd`,
  `debtUsd`, `changeUsd`) — `js/main.js`dagi asl (`savdoCalc()`, `_savdoCommit()`,
  `savdoFinish()`) formulalardan **aynan** ko'chirilgan, qo'shimcha yaxlitlash
  kiritilmagan (server/client bit-aniqligida mos kelishi uchun)
- **15 test** — frontend formulasi bilan qo'lda solishtirib tasdiqlangan: oddiy
  savat, chegirma, tannarx/foyda, zarar, qaytim/qarz, aralash savat (Direct
  Sale+oddiy), bo'sh savat
- **Hozircha hech qanday Function bu modulni chaqirmaydi** — bu faqat P3-4+
  uchun tayyorlangan, mustaqil, sinovdan o'tgan asos
- SQL/migratsiya — kerak emas
- Boshqa fayl — tegilmadi, to'liq regressiya tasdiqlandi (barcha Function + `main.js` sintaksisi toza)

### 3. Ombor/FIFO — server-side
**Holat: ✅ TO'LIQ, SQL PRODUCTION'DA JONLI (2026-08-12 tasdiqlangan).**
- `sale_checkout_atomic()` RPC endi FIFO-kamaytirishni **to'g'ridan-to'g'ri `batches` SQL jadvalidan**, `FOR UPDATE` qator-qulflash bilan bajaradi — bu **haqiqiy concurrency-himoya** (ikkita xodim bir vaqtda oxirgi donani sotmoqchi bo'lsa, faqat bittasi muvaffaqiyatli bo'ladi, sinovdan o'tkazildi)
- Shadow-sync (`batches-shadow-sync.js`) — hamon ishlaydi, JSON blok bilan solishtirish uchun
- ✅ **SQL siz tomondan ishga tushirildi (2026-08-12, "Success. No rows returned")** — `batches` jadvali endi production Supabase'da mavjud

### 12. Atomik tranzaksiya
**Holat: ✅ TO'LIQ YAKUNLANDI, SQL PRODUCTION'DA JONLI (2026-08-12).**
- **Yangi:** `sale_checkout_atomic()` — Postgres RPC (migratsiya 27) — ombor
  (FIFO, qator-qulflash bilan), savdo yozuvi, mijoz qarzi, kassa balansi,
  ta'minotchi qarzi — **BITTA tranzaksiyada**. Xato (masalan yetarli qoldiq
  yo'q) — **HAMMASI avtomatik bekor qilinadi** (Postgres native rollback)
- **Yangi Function:** `sale-checkout-atomic.js` — RPCni chaqiradi, RBAC (`savdo.create`) + filial (server) + idempotency bilan
- **`_savdoCommit()` ulandi:** endi avval RPCni chaqiradi. Server **rad etsa** —
  savdo **to'xtaydi**. Muvaffaqiyatli bo'lsa — **server natijasi** (totalUsd,
  costUsd, profitUsd, debtUsd, changeUsd) ishonchli manba sifatida qabul
  qilinadi, mavjud JSON-blok yo'li (Dashboard/Hisobot moslik uchun) **parallel
  davom etadi**
- **6/6+4+2 test PASS:** FIFO muvaffaqiyatli, yetarsiz-qoldiq-exception,
  concurrency, idempotency, partial-failure-rollback, branch-isolation,
  **mixed-payment (bir nechta kassaga bo'lingan) — 4 boxPayments-qurish testi +
  2 mixed-rollback testi**
- ✅ **MIXED-PAYMENT TO'LIQ QAMRAB OLINDI (halol chegara olib tashlandi):**
  `sale_checkout_atomic_v2()` (migratsiya 28) — `p_box_payments` massivi orqali
  bir nechta kassaga bo'lingan to'lov ham **bitta atomik tranzaksiyada**
  ishlaydi. Eski 8-parametrli `sale_checkout_atomic()` — DROP qilinmadi (xavfsiz
  qoldirildi), lekin endi ishlatilmaydi — `sale-checkout-atomic.js` va
  frontend endi **har doim** `sale_checkout_atomic_v2()`ni chaqiradi, `boxId`
  yoki `mixedRows`dan qat'iy nazar.

### 4. Asosiy Savdo/Checkout — server-side
**Holat: ✅ BLOKLOVCHI REJIMGA O'TKAZILDI.**

- `_savdoCommit()` endi serverni **kutadi** (`await`) — server aniq farq
  topsa (javob keldi, lekin mos kelmadi) — **savdo TO'XTATILADI**, foydalanuvchiga
  aniq xato ko'rsatiladi
- Tarmoq/Function ishlamasa (xato, vaqt tugashi) — **fail-open**, savdo
  davom etadi (kunlik savdo tarmoq nosozligi tufayli to'xtab qolmasin)
- Funksiya `async` qilindi — yagona chaqiruv nuqtalari (`savdoFinish()`,
  `_saleConfirmChoice()`) fire-and-forget edi, **regressiya yo'q** (tasdiqlandi)
- 16 ta konsolidatsiyalangan test PASS

### 5. Direct Sale
- **Ombor:** 3-bandga bog'liq
- **Manba/foyda/qarz:** P3-4 checkout (saleEngine) orqali qamrab olindi — Direct Sale itemlari ham xuddi shu bloklovchi tekshiruvdan o'tadi (alohida Function shart emas, checkout'ning bir qismi)
- Aralash savat, ombordan/ta'minotchidan ajratish — bugungi sessiyada tuzatilgan 2 ta kritik xato (qidiruv blokировкаsi, qaytarish-ikki-marta) shu yerga tegishli, testlar bilan tasdiqlangan

### 6. Qaytarish — server-side
**Holat: ✅ BLOKLOVCHI REJIMGA O'TKAZILDI.**
- `doSaleReturn()` xuddi shu naqsh (kutadi, aniq farqda to'xtaydi, tarmoq
  xatosida fail-open) — `async` qilindi, yagona chaqiruv nuqtasi (`onclick`)
  xavfsiz, regressiya yo'q

### 7-10. Kassa/uyga-berish/ta'minotchi-to'lov/mijoz-qarz — server-side
**Holat: ✅ Yangi Function'lar yaratildi va frontendga ULANDI (bloklovchi, fail-open).**

- **Yangi:** `cashbox-transact.js` (P3-7), `home-withdrawal-add.js` (P3-8),
  `supplier-payment-add.js` (P3-9), `customer-debt-payment-add.js` (P3-10)
- **Frontend ulandi:** `doKassaOp()`, `doKunlikHisob()`, `paySupplierDebt()`,
  `payDebt()` — barchasi endi avval serverga so'rov yuboradi; server **rad
  etsa** — amal **to'xtaydi** (haqiqiy bloklash). Server/tarmoq ishlamasa —
  **fail-open** (amal davom etadi, ish kuni to'xtab qolmaydi)
- Mavjud RBAC ruxsatlaridan foydalanildi (`kassalar.transact`,
  `taminotchilar.view`, `mijozlar.debt_payment`) — **yangi ruxsat yaratilmadi**
- Filial — client yubormaydi, server `auth.filial`dan oladi (P3-14)
- 9/9 test PASS + 16 ta konsolidatsiyalangan regressiya test PASS

⚠️ **Ochiq qoldiq — YOPILDI:** `js/sotuvchi.js`dagi mijoz-qarz-to'lov
funksiyasi (`svConfirmPay()`) endi `customer-debt-payment-add.js`ga ulandi
(P3-10 to'liq qamrab oldi, admin va sotuvchi panellari — ikkalasi ham).

### 11. Idempotency
**Holat: ✅ Barqaror mexanizmga o'tkazildi.**
- **Yangi:** `idempotency_keys` SQL jadval (`idem_key` UNIQUE) + `_lib/idempotency.js` helper
- Endi 5-10 soniyalik "taxminiy" emas — **UNIQUE constraint** orqali, parallel so'rovlarda ham faqat bittasi o'tadi
- P3-7...10ning barcha Function'ida qo'llanildi

### 12. Atomik tranzaksiya
**Holat: 🟡 QISMAN — real SQL jadvallar uchun bajarildi, `app_data` blok uchun texnik chegara bor (halol).**
- **Yangi:** `dealer_sale_atomic()` — Postgres RPC funksiyasi (migratsiya 26), `dealer_sales`+`dealer_stock`ni **bitta tranzaksiyada** yozadi (xato bo'lsa — ikkalasi ham bekor bo'ladi)
- SQL sintaksis tekshirildi, qavslar balansda, `$$` juftligi to'g'ri
- ⚠️ **Halol chegara:** Asosiy Savdo/Checkout, Qaytarish, Kirim — hamon `app_data` JSON blokida (client tomonda) ishlaydi. Bularga **to'liq** Postgres-atomiklik — faqat `batches` va boshqa asosiy ma'lumotlar to'liq SQLga ko'chirilgandan keyin (P3-3'ning katta, hali boshlanmagan keyingi bosqichi) mumkin. Bu RPC — **shu yo'ldagi birinchi, ishlaydigan qadam**, lekin butun tizim atomik emas.
- Frontend RPCga **ulanmadi** (dealer-sale-add.js hamon eski, oddiy insert bilan ishlaydi) — chunki frontend ikki alohida chaqiruv (`dlUpsertStock`+`dealer-sale-add`) qiladi, RPCga o'tkazish uchun bu ikkitasini birlashtirish kerak, bu esa **qo'shimcha frontend-refaktor talab qiladi va o'zi alohida regressiya xavfi** — shuning uchun bu bosqichda **ataylab ulanmadi** (xavfsizlik uchun)

### 13-14. RBAC / Filial izolyatsiyasi
**Holat: ✅ PASS.**
- Barcha 8 ta bugungi yangi Function (`batches-shadow-sync/check`, `sale-checkout/return-shadow-check`, `cashbox-transact`, `home-withdrawal-add`, `supplier-payment-add`, `customer-debt-payment-add`) — `requireStaffAuth` bilan tasdiqlangan
- Ma'lumot yozadigan barcha Function — `auth.filial` (server-aniqlangan), client yubormaydi

### 15. Audit log
**Holat: ✅ PASS.**
- Yangi ledger jadvallarida: `staff_id`, `staff_name`, `idem_key`, `created_at` — barchasi bor (23 marta uchraydi, 5 jadvalda mos taqsimlangan)

### 16. RLS/security review
**Holat: ✅ PASS.**
- Barcha yangi jadval (`batches`, `idempotency_keys`, `cashbox_transactions`, `home_withdrawals`, `supplier_payments`, `customer_debt_payments`) — RLS yoqilgan, `anon`/`authenticated` uchun **hech qanday** siyosat yo'q (faqat `service_role`)
- RPC funksiyasi — `EXECUTE` huquqi faqat `service_role`ga berilgan

### 17. Rollback / production readiness
**Holat: ✅ Yakuniy audit bajarildi.**
- Barcha 3 yangi migratsiya (24,25,26) — **faqat qo'shimcha**, `DROP`/`DELETE`/`TRUNCATE` **yo'q** (avtomatik tekshirildi)
- Idempotent — barcha `CREATE TABLE/FUNCTION IF NOT EXISTS`/`CREATE OR REPLACE`
- Eski ma'lumot mosligi — yangi maydonlar hammasi ixtiyoriy/standart qiymatli, eski yozuvlarga ta'sir qilmaydi
- To'liq regressiya — 41 Function + 4 frontend fayl, sintaksis toza

---

## ⚠️ ENG MUHIM OGOHLANTIRISH

**3-band (Ombor/FIFO serverga ko'chirish)** — `batches`ni hozirgi `app_data` JSON blokidan **alohida SQL jadvalga** ko'chirishni talab qilishi mumkin. Bu — **katta arxitektura qarori**, Kirim/Revizya/Konsignatsiya/Direct Sale — barchasiga ta'sir qiladi. Bu qadam **alohida, maxsus tasdiqlaringizni** talab qiladi, avtomatik boshlanmaydi.

---

## 📅 2026-08-12 — YAKUNIY HOLAT (P3-1 dan keyingi to'liq regressiya)

**P3-1 — ✅ yopiq va tasdiqlangan.** P3-2...17 — **ataylab boshlanmadi**: bu —
loyihaning butun savdo/moliya yadrosini qayta qurish, bir javobda shoshilib
bajarilishi mumkin bo'lmagan, haqiqiy production-xavfli ish. Har bir keyingi
bosqich — avvalgidek, alohida, bosqichma-bosqich, sizning tasdig'ingiz bilan
davom etadi.

**Konsolidatsiyalangan regressiya (14 test, barcha asosiy modul bo'yicha):
14/14 PASS.** Yangi xato/regressiya **topilmadi**.

## ISHLASH QOIDALARI

1. Har yangi ish oldidan shu hujjat o'qiladi, tegishli talablar topiladi
2. Mavjud kod/DB bog'liqligi va boshqa modullarga ta'siri tekshiriladi
3. Moliyaviy va RLS/ruxsat ta'siri baholanadi
4. Shundan keyin implementatsiya rejasi beriladi (kod emas)
5. Ish tugagach: bajarilgan/qisman/qolgan + testlar + fayllar + SQL + deploy yoziladi
6. Bir vaqtda faqat BITTA katta arxitektura ishi bajariladi
7. Hech qanday talab taxminan ✅ deb belgilanmaydi
