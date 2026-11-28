# v24.5 (2026-10-14) — test natijalari
| Tekshiruv | Natija |
|---|---|
| `npm test` (ishchi papka) | ✅ **222 / 222 PASS** |
| P34 (34-migratsiya — haqiqiy PostgreSQL + haqiqiy `sale-checkout-atomic`/`sale-ops`) | ✅ 4/4 — ortiqcha → qarzdan ayiriladi, qolgani haq; haqdan ishlatish; bekor qilinsa haq qaytadi; soxta «toʻlangan» rad; 34 siz — aniq xato, hech narsa yozilmaydi |
| P35 (haqiqiy `js/main.js`, Chromium 390×844) | ✅ 5/5 — toʻlov qoidalari, 1 000 ga yaxlit, kechiktirilgan chek, yangi mijoz, «Orqaga» 1 qadam (tarix oʻsmaydi), toʻliq formalar, Excel, hujjat oynasi, **bitta X**, zaxirada maxfiy kalit yoʻq, zaxira manzili — faqat administrator |
| P29 (sotuvchi/admin/diller — yangi oynalar) | ✅ 3/3 — tannarxsiz, shtrix-kod, kam toʻlov va «Farqni chegirma qilish» (aniq matn, Bekor), zarar tasdigʻi, «Orqaga» bitta qadam, Chakana/Optom, Direct Sale; diller savatchasi −10% |
| `migration-chain-rehearsal.js` (PostgreSQL 16) | ✅ 24 → … → 34 xatosiz, verify **67/67**, takror xavfsiz, yakuniy sxema = schema.sql (56/86/207/143) |
| `npm run check` / `npm run build` | ✅ 61 funksiya / ✅ dist (pos.js va PDF kutubxonasi ichida) |
| PDF yaratish (html2pdf, Chromium) | ✅ fayl `%PDF-` bilan boshlanadi |
| Haqiqiy telefonda kamera skaneri, «Yuborish» (navigator.share) | NOT VERIFIED — Chromium emulyatsiyasi |
| Haqiqiy Telegram botga PDF va zaxira yuborish, kunlik jadval | NOT VERIFIED — testda Telegram soxta |
| Production deploy / migratsiya / haqiqiy maʼlumot | YOʻQ / YOʻQ / YOʻQ |

# v24.2 (2026-10-14) — test natijalari
- `npm test`: **207 / 207 PASS** (yangi: P30 — telefon qobig'i 2, P31 — 32-migratsiya haqiqiy PostgreSQL 4; P4 «Ko'proq» testi yangi qobiq testiga almashtirildi).
- `migration-chain-rehearsal.js` (PG16, production nusxasi): 24 → … → 32 xatosiz, verify SQL **65/65**, takroriy qo'llash o'zgarishsiz, yakuniy sxema = schema.sql (51/79/190/134).
- Production'ga tegilmagan: deploy, migratsiya va haqiqiy ma'lumot — yo'q. Haqiqiy telefonda (Android/iOS) qo'lda sinov — **NOT VERIFIED** (Chromium 390 px emulyatsiyasi bilan tekshirildi).

# Powerful PRO v24 — To'liq audit, tahrirlash muddati, audit tarixi va 🔔, savdo oynasi, diller −10%: test natijalari (2026-10-13)
| Tekshiruv | Natija |
|---|---|
| Bazaviy holat (o'zgarishdan oldin) | ✅ `npm test` 189/189, `npm run check` toza, `npm run build` OK (56 funksiya) |
| `npm test` (yakuniy, ishchi papka) | ✅ **201 / 201 PASS** (189 + P28 — 9 + P29 — 3) |
| P28 (haqiqiy PostgreSQL — PGlite + haqiqiy `sale-checkout-atomic`, `sale-ops`, `notifications`, `telegram-announce`) | ✅ 9/9 — zararli savdo tasdig'isiz rad (hech narsa yozilmaydi), tasdiq bilan audit + admin; tahrir muddati 7/30 kun (server vaqti), egalik, oldingi→yangi audit, replay; o'chirishda iz qoladi; audit/bildirishnoma o'zgarmas, anon/authenticated huquqsiz; 7 kun/arxiv, o'qildi; sotuvchiga tannarxsiz tarix; Direct Sale — ruxsat va server narxi; diller −10% va reviziya; 31 siz — eski yo'l; Telegram e'loni takrorsiz (soxta Telegram); sozlamalar validatsiyasi |
| P29 (haqiqiy `sotuvchi.html`, `diller.html`, `js/main.js`, Chromium 390×844) | ✅ 3/3 — tannarxsiz, shtrix-kod, kam to'lov (aniq matn «Siz xaridorga 10 000 so'm chegirma berdingiz. Tasdiqlaysizmi?», Bekor), zarar tasdig'i (tannarxsiz matn), katalog/QR «Orqaga», Chakana/Optom (savat saqlanadi), Direct Sale; admin «Saqlanmadi» — asl sabab, yolg'on xabarsiz; muddat; 🔔 va tarix (HTML ekranlangan); diller 10%, reviziya, oyna yopilishi |
| `edit-window-audit-real-postgres.js` (PostgreSQL 16, PARALLEL) | ✅ 6/6 — zarar tasdig'i (bir xil kalit 5 parallel → 1 savdo), bir savdoga 6 parallel tahrir (zanjir uzilmagan, kassa = jurnal), bir xil kalit 4 parallel tahrir → 1 audit, muddat va o'chirish, audit o'zgarmas (egasi uchun ham), diller 8 parallel savdo (qoldiq 5 → 5 tasi o'tdi, manfiy emas) |
| `migration-chain-rehearsal.js` (PostgreSQL 16) | ✅ production nusxasi 24→31, **verify 63/63**, takror xavfsiz, yakuniy sxema = schema.sql (50/77/183/130) |
| `npm run check` / `npm run build` | ✅ 58 funksiya / ✅ dist |
| Skrinshotlar (390 px, yorug' va qorong'i): sotuvchi savdo, kam to'lov, katalog; diller reviziyasi; admin bosh sahifa, 🔔 tarixi, savdo | ✅ ko'rib chiqildi; diller reviziyasi kiritish maydoni ko'rinmasdi — tuzatildi |
| Haqiqiy Telegram kanal/guruhga e'lon | NOT VERIFIED — testda Telegram API soxta (tarmoqsiz) |
| Haqiqiy telefon (iOS Safari / Android Chrome), kamera bilan QR | NOT VERIFIED — Chromium emulyatsiyasi; kamerali skanerlash qurilmada tekshirilmagan |
| Production migratsiya / deploy | YO'Q / YO'Q |

# Powerful PRO v23.9 — Telefon portallari, bosh sahifa, kunlik Telegram hisobot, kunlik kurs: test natijalari (2026-10-07)
| Tekshiruv | Natija |
|---|---|
| `npm test` (toza o'rnatish — ZIP'dan, `npm ci`) | ✅ **189 / 189 PASS** (185 + P27 — 4). P26 — diller pastki paneli menyusiz (egasi talabi); P14 — sotuvchi xarajatida valyuta va kassa endi kartochka bilan tanlanadi (tanlangan qiymat ham tekshiriladi) |
| P27 (hisobot matni; haqiqiy PostgreSQL — PGlite + haqiqiy `telegram-daily-report`/`telegram-report`; haqiqiy `sotuvchi.html` va `js/main.js`, Chromium) | ✅ 4/4 — bugungi ko'rsatkichlar, Shaxsiy kassa yo'q, HTML ekranlangan, uzun hisobot bo'linadi; o'chiq/erta — yubormaydi, vaqti kelganda **kuniga bir marta**, Telegram xatosida keyingi urinishda qayta, ko'rish/yuborish faqat administrator, javobda token yo'q; sotuvchi — menyusiz panel, buyurtmalar qo'ng'irog'i, QR, tez sotiladiganlar, Oylik Xarajat ichida, kassalar; brend nomi uzunligiga mos (kesilmaydi); kurs tasdiqlanganda `rateDate` |
| P27 mutatsiya nazorati | kunlik bandlik tekshiruvi o'chirilsa yoki hisobotda Shaxsiy kassa filtri olib tashlansa — tegishli test FAIL |
| `npm run check` | ✅ 56 funksiya |
| XSS smoke (sotuvchi: tez sotiladiganlar, kassa kartochkalari, buyurtmalar; admin: brend nomi, Telegram hisobot ko'rinishi) | ✅ 0 |
| Gorizontal siljish (sotuvchi va diller portali, 360/390 px) | ✅ yo'q |
| Netlify jadval funksiyasi (har soatda) — haqiqiy saytda | NOT VERIFIED — lokal testda jadval chaqiruvi taqlid qilingan |
| Haqiqiy Telegram guruhiga yuborish | NOT VERIFIED — testda Telegram API taqlid qilingan |
| Haqiqiy telefon (iOS Safari / Android Chrome) | NOT VERIFIED — Chromium emulyatsiyasi |
| Production migratsiya / deploy | kerak emas (migratsiya yo'q) / YO'Q |

# Powerful PRO v23.8 — Diller pul yuboradi (30-migratsiya), bosh sahifa, portallar: test natijalari (2026-10-07)
| Tekshiruv | Natija |
|---|---|
| `npm test` | ✅ **185 / 185 PASS** (181 + P26 — 4). P8/P11 — 30-migratsiya (sxema sonlari izohli yangilandi: +1 jadval, +3 funksiya, +6 cheklov, +4 indeks; rollar o'zgarmagan) |
| P26 (haqiqiy PostgreSQL — PGlite + haqiqiy `dealer-pay`; haqiqiy `js/main.js`, `js/dealer-pay.js`, `diller.html`, Chromium) | ✅ 4/4 — kurs serverdan, qarz darhol kamayadi, takror yo'q, qarzdan ortiq rad; qabul — valyutasi mos kassaga (Shaxsiy kassa emas), rad — qarz qaytadi, qabuldan keyin rad yo'q; huquq va filial chegarasi; kurssiz va 30 siz — 409; admin oynasi; bosh sahifa (Dillerlar, Kategoriyalar, Xodimlar, 7 kunlik yo'q); diller «To'lov» (tarmoq xatosida o'zgarmaydi, o'sha kalit), ikonkali panel, menyu |
| P26 mutatsiya nazorati | serverdagi yoki oynadagi Shaxsiy kassa filtri olib tashlansa — tegishli test FAIL |
| `dealer-pay-real-postgres.js` (PG16) | ✅ 8/8 — PARALLEL 6 ta yuborish (qarzdan oshmaydi), bir xil kalit PARALLEL 5 marta (bitta yozuv), PARALLEL qabul+rad (faqat bittasi), rad → qarz qaytadi, jurnal = qoldiq, huquqlar |
| `migration-chain-rehearsal.js` (PG16) | ✅ production nusxasi 24→30, verify 57/57, takror xavfsiz, yakuniy sxema = schema.sql (48/68/175/123) |
| `npm run check` | ✅ 54 funksiya |
| XSS smoke (16 sahifa, kassa yopish, Biznes holati, diller to'lovi oynasi va tarixi, Dillerlar bloki, grafiklar, diller «To'lov») / gorizontal siljish (360, 390, 1280) | ✅ 0 / ✅ yo'q (faqat ichki aylantiriladigan filiallar jadvali) |
| Skrinshotlar: bosh sahifa (390, 1280), portallar (yuqori panel, menyu), diller «To'lov», kassir oynasi | ✅ ko'rib chiqildi |
| Haqiqiy telefon (iOS Safari / Android Chrome) | NOT VERIFIED — Chromium emulyatsiyasi |
| Production migratsiya / deploy | YO'Q / YO'Q |

# Powerful PRO v23.7 — Biznes holati, kassa yopish (sotuvchi ham), sotuvchi «Kassa» bo'limi: test natijalari (2026-10-07)
| Tekshiruv | Natija |
|---|---|
| `npm test` | ✅ **181 / 181 PASS** (177 + P25 — 4). Avvalgi testlar o'zgartirilmagan |
| P25 (haqiqiy PostgreSQL — PGlite + haqiqiy `firma-kassa`; haqiqiy `js/main.js` va `sotuvchi.html`, Chromium) | ✅ 4/4 — sotuvchi o'z filiali savdo kassasini Bosh kassaga topshiradi, takror yozilmaydi; Shaxsiy/diller kassasi, boshqa filial, Bosh kassa qoldig'i, filial qarzini to'lash — sotuvchiga rad; admin oynasida Shaxsiy/diller kassasi yo'q, foyda faqat egasiga; Biznes holati hisobi (ombor faqat to'langan va omborda bor, yo'ldagi, qarzlar, investor/ta'sischi, filialda — o'ziniki); sotuvchi portali — foydasiz, fail-close, qayta bosishda o'sha kalit |
| P25 mutatsiya nazorati | serverdagi Shaxsiy/diller kassasi tekshiruvi o'chirilsa yoki oynadagi ro'yxatga Shaxsiy kassa qaytsa — tegishli test FAIL |
| `firma-kassa-real-postgres.js` (PG16) | ✅ 11/11 (o'zgarmagan) |
| `npm run check` / `npm run build` | ✅ 53 funksiya / ✅ 20 fayl |
| XSS smoke (16 sahifa + kassa yopish, tarix, Biznes holati, sotuvchi «Kassa») / gorizontal siljish (360, 390, 1280) | ✅ 0 / ✅ yo'q (faqat ichki aylantiriladigan filiallar jadvali) |
| Skrinshotlar: bosh sahifa, Biznes holati (Baza va 729-filial), kassa yopish, tarix, filial paroli, sotuvchi «Kassa» | ✅ ko'rib chiqildi (390 va 1280 px) |
| Haqiqiy telefon (iOS Safari / Android Chrome) | NOT VERIFIED — Chromium emulyatsiyasi |
| Production migratsiya / deploy | kerak emas (migratsiya yo'q) / YO'Q |

# Powerful PRO v23.6 — Brend, B2B, hisobdan chiqarish, mahsulot kartochkasi: test natijalari (2026-10-07)
| Tekshiruv | Natija |
|---|---|
| `npm test` | ✅ **177 / 177 PASS** (171 + P23 — 3 + P24 — 3). P8/P11 — 29-migratsiya (sxema sonlari va rollar snapshot'i yangilandi, izohli); P22 — summa ekranda «1 280 000», kod o'qiganda bo'shliqsiz |
| P23 (ikki ALOHIDA PostgreSQL — ta'minotchi va xaridor, haqiqiy `b2b`/`b2b-inbound`/`stock-writeoff`) | ✅ 3/3 — ulanish va ikki tomon tasdig'i, kalit faqat xesh, noto'g'ri kalit 403, pauza/uzish; katalog → buyurtma → tasdiq → jo'natma → 4/5 qabul → qarzlar faqat qabul bo'yicha → qaytarish; takror va tarmoq uzilishi; hisobdan chiqarish |
| P23/P24 mutatsiya nazorati | kalit tekshiruvi o'chirilsa, tasdiq jo'natilgan son bo'yicha hisoblansa, hamkor nomi ekranlanmasa, shtrix-kod takrori tekshirilmasa — tegishli testlar FAIL |
| `writeoff-b2b-real-postgres.js` (PG16) | ✅ 10/10 — FIFO zarar, takror, PARALLEL hisobdan chiqarish, bekor qilish, PARALLEL jo'natma, tasdiq, qaytarish, PARALLEL qabul, to'xtatilgan ulanish, huquqlar va jurnal = qoldiq |
| `migration-chain-rehearsal.js` (PG16) | ✅ production nusxasi 24→29, verify 55/55, takror xavfsiz, yakuniy sxema = schema.sql; `firma-kassa-real-postgres.js` 11/11 |
| `npm run check` | ✅ 53 funksiya |
| XSS smoke (16 sahifa + oynalar) / gorizontal siljish (90%) | ✅ 0 / ✅ yo'q |
| Ikki haqiqiy sayt orasida B2B (internet orqali) | NOT VERIFIED |
| Haqiqiy telefon (iOS Safari / Android Chrome) | NOT VERIFIED — Chromium emulyatsiyasi |
| Production migratsiya / deploy | YO'Q / YO'Q |

# Powerful PRO v23.5 — Kichik oynalar 2.0, yozuvlar 90%: test natijalari (2026-10-06)
| Tekshiruv | Natija |
|---|---|
| `npm test` | ✅ **171 / 171 PASS** (164 + P22 — 6 + P4 90% testi — 1). P4 joylashuv testlari 100% o'lchamda (izohli; 90% — alohida test). P14: kassa endi kartochka bilan tanlanadi (tanlov qiymati ham tekshiriladi) |
| P22 mutatsiya nazorati | valyuta o'girish o'chirilsa va «Mamlakat» ekranlanmasa — tegishli 2 test FAIL |
| `npm run check` / `npm run build` | ✅ (50 funksiya) / ✅ 17 fayl |
| XSS smoke (16 sahifa + 4 kartochka oynasi) | ✅ 0 |
| Gorizontal siljish (360, 390, 1280 px; 90% o'lcham) | ✅ yo'q (faqat ichki aylantiriladigan jadval/chip qatorlari) |
| Oynalar skrinshoti (40 ta oyna, 2 portal; tungi va kunduzgi) | ✅ ko'rib chiqildi |
| Haqiqiy telefon (iOS Safari / Android Chrome) | NOT VERIFIED — faqat Chromium emulyatsiyasi |
| Production migratsiya / deploy | kerak emas (migratsiya yo'q) / YO'Q |

# Powerful PRO v23.4 — Firma kassasi asosiy kassa: test natijalari (2026-10-06)
| Tekshiruv | Natija |
|---|---|
| `npm test` | ✅ **164 / 164 PASS** (160 + P21 — 4). P16 kunlik yopish testi yangi biznes qoidasiga moslandi (tekshiruvlar kuchaytirildi: eski yo'l ishlatilmaydi, kalit barqaror); P8/P11 — 28-migratsiya |
| P21 mutatsiya nazorati | ikkinchi ruxsat olib tashlansa — 2 FAIL; qarz rejimi `strict` → `clamp` bo'lsa — FAIL |
| `firma-kassa-real-postgres.js` (PG16) | ✅ 11/11 — oddiy, so'mda, qarzdan ortiq, kassada yetmaydi (rollback), takror, PARALLEL 2×40$, xarajat bekor qilish, huquqlar, 25 qayta (rad, hech narsa o'zgarmaydi), jurnal = qoldiq |
| `migration-chain-rehearsal.js` (PG16) | ✅ production nusxasi 24→25→26→27→28, verify 50/50, takror xavfsiz, schema.sql bilan bir xil |
| XSS smoke (16 sahifa + 4 kartochka oynasi) / gorizontal siljish | ✅ 0 / ✅ yo'q |
| Production migratsiya / deploy | YO'Q / YO'Q |

# Powerful PRO v23.3 — Onlayn-do'kon va sahifalar: test natijalari (2026-10-06)
| Tekshiruv | Natija |
|---|---|
| `npm test` | ✅ **160 / 160 PASS** (154 + P20 — 6). P2 XSS testi: tanlovchi yangi kartochka belgilanishiga moslandi (barcha tekshiruvlar saqlangan) |
| P20 mutatsiya nazorati | birlashtirish / huquq filtri / token yashirish / bot javobi buzilganda tegishli testlar FAIL (4/4) |
| `npm run check` / `npm run build` | ✅ (50 funksiya) / ✅ 17 fayl |
| Gorizontal siljish (360, 390, 1280 px; 18 sahifa) | ✅ yo'q (faqat ichki aylantiriladigan chip/jadval qatorlari) |
| XSS smoke (16 sahifa + do'kon oynalari, zararli nom/manzil/sharh/chek raqami) | ✅ 0 ishga tushdi (chek raqami ekranlanmagan joy topildi va tuzatildi) |
| Production migratsiya / deploy | YO'Q / YO'Q |

# Powerful PRO v23.2 — F4b FINAL FIX: test natijalari (2026-10-06)

Yakuniy baho — **NOT PRODUCTION READY** (`AUDIT-HISOBOT.md`): F4b tuzatildi (lokal dalil), real baza (staging/production) tekshiruvi BLOCKED.

| Tekshiruv | Natija |
|---|---|
| `npm run check` | ✅ 106/106 JS · 49/49 funksiya · config faqat anon |
| `npm run build` | ✅ dist/ — 16 fayl |
| `npm test` | ✅ **154 / 154 PASS** (146 + P19 — 7 + P14 F4b brauzer E2E — 1). P8/P11/P13/P14/P15/P18 — 27-migratsiyaga moslandi (sonlar, boshlang'ich qiymatlar jurnal orqali), zaiflashtirilmadi |
| P19 (mijoz/ta'minotchi qarzi, ombor — HAQIQIY server funksiyalari + PGlite) | ✅ 7/7 — oddiy, yetishmaydi, takror, ikki qurilma (eski nusxa), rollback, qaytarish/o'chirish/tahrir, kirim/reviziya, brauzer yuborgan qarz 2 000 000 / qty 999, 27-migratsiyasiz 409 |
| P14 F4b (brauzer → HTTP → server → PostgreSQL) | ✅ admin: yangi mijoz qarzi, konsoldan soxta qarz/qoldiq, nasiya savdo, to'lov, qaytarish, qayta yuklash — sahifa = baza; sotuvchi: savdo bazadagi omborni kamaytiradi, ortiqcha sotuv rad |
| P14 va P19 — 3 marta ketma-ket | ✅ 3/3 |
| PG16: `f4b-real-postgres.js` (parallel, ko'p ulanish) | ✅ **16/16** — 2×400 000 (qarz 600 000), 2×80$ (qarz 100$), 2×2 dona (qoldiq 3), rollback, verify 46/46 |
| `f4b-gap-evidence.js` (avvalgi 4 ta muammo) | ✅ **5/5 TUZATILGAN** (v23.1 kodida — 4/4 qayta hosil qilinadi) |
| Negativ nazorat: ESKI v23.1 brauzer kodi + yangi server (`f4b-old-client-negative.js`) | ✅ 4/4 — eski kod yozgan qarz/qoldiq bazaga o'tmaydi, qarzdan ortiq to'lov va ortiqcha sotuv rad (409) |
| Negativ nazorat: P19 eski v23.1 kodida | ❌ 0/7 — ishga tushmaydi (27-migratsiya, `sale-ops`, `stock-debt-ops` yo'q) |
| PG16: `migration-chain-rehearsal.js` | ✅ 10/10 — production nusxasi → 24→25→26→27, verify 46/46, takroriy, `psql -1`, 27 dan keyin 24/25 qayta → 27 tiklaydi |
| PG16: moliyaviy matritsa · v23 · F4/B7 · kategoriyalar | ✅ 9/9 (F4b ⚠️ endi ✅) · 6/6 · 7/7 · 7/7 |
| UI audit (12 o'lcham + landshaft) | ✅ **728/728** |
| Smoke | ✅ **117/117** |

---

# (tarix) Powerful PRO v23.1 — FINAL GATE: test natijalari (2026-10-02)

Yakuniy baho — **NOT PRODUCTION READY** (`AUDIT-HISOBOT.md`): F4b ochiq (dalil bilan qayta hosil qilingan), production DB tekshiruvi BLOCKED.

| Tekshiruv | Natija |
|---|---|
| `npm run check` | ✅ 99/99 JS · 47/47 funksiya · config faqat anon |
| `npm run build` | ✅ dist/ — 16 fayl |
| `npm test` | ✅ **146 / 146 PASS** (143 + P18 rollar matritsasi 2 + P14 admin kategoriyalar real HTTP 1) |
| P14 (real HTTP stek) — 6 marta ketma-ket | ✅ 6/6 (tuzatishdan oldin admin holati ~50% FAIL edi — pastda) |
| P17 (kategoriyalar, 20 talab) | ✅ 4/4 |
| P18 (9 rol + 401/403 × 11 amal; boshqa filial; Telegram/PIN; brauzer kalitlari) | ✅ 2/2 |
| UI audit (12 o'lcham + landshaft, admin + sotuvchi + kategoriya oynalari) | ✅ **728/728** |
| Smoke | ✅ **117/117** |
| PG16: `expense-categories-real-postgres.js` | ✅ 7/7 |
| PG16: `migration-chain-rehearsal.js` (production sxemasi nusxasi, 24→25→26, `psql -1`) | ✅ 9/9 · verify 27/27 |
| PG16: `financial-matrix-real-postgres.js` | ✅ 8/9 · ⚠️ 1 (F4b — mijoz to'lovi turli kalit bilan qarzdan ortiq) |
| PG16: `f4-b7-real-postgres.js` · `v23-real-postgres.js` | ✅ 7/7 · ✅ 6/6 |
| `f4b-gap-evidence.js` (F4b ochiqligini ko'rsatadi) | ❌ 4/4 QAYTA HOSIL QILINDI — ombor `sold`, mijoz qarzi, ta'minotchi qarzi, SQL soya jadvallari |
| Production (faqat o'qish) | UTF8 · 23 qo'llangan · 24/25/26 qo'llanmagan |

**Gate paytida topilgan va tuzatilgan:** to'liq `npm test` da P14 admin holati FAIL bo'ldi (`'Elektr energiyasi'` ≠ `'Elektr (oylik)'`). Sabab — sahifa qayta yuklanganda xarajatlar tarixi kategoriyalar serverdan kelishidan oldin chiziladi va keyin yangilanmasdi (eski nom ko'rinardi). Shu kamchilik sotuvchi portalidagi "Mening xarajatlarim"da ham bor edi. Tuzatish: kategoriyalar yuklangach tarix nomlari ID bo'yicha yangilanadi (`exCatRefresh`, `svCatRefresh`); `.then(exCatRefresh)` ga ro'yxat massivi argument sifatida tushib qolishi ham tuzatildi. Test zaiflashtirilmadi.

---

# (tarix) Powerful PRO v23.1 — xarajat kategoriyalari: test natijalari (2026-10-02)

| Tekshiruv | Natija |
|---|---|
| `npm run check` | ✅ 95/95 JS · 47/47 funksiya · config faqat anon |
| `npm run build` | ✅ dist/ — 16 fayl |
| `npm test` | ✅ **143 / 143 PASS** (oldingi 139 + P17 — 4 ta; P3, P8, P11, P14 yangilangan) |
| P17 — 20 ta talab (server + baza + brauzer, HAQIQIY funksiya va PostgreSQL) | ✅ 4/4 |
| Mutatsiya sinovi | brauzerdagi ikki marta bosish himoyalari olib tashlansa — ❌ "uch marta bosish — bitta so'rov"; serverdagi nom normallashtirish olib tashlansa — ❌ 2 ta server testi |
| Eski kodda (negativ nazorat) | v23 (oldingi ZIP) va v11-FINAL: P17 0/4 (funksiya yo'q). Yangi server qo'yib, eski brauzer kodi bilan: server testlari 2/2 PASS, brauzer testlari 0/2 (eski kodda serverdagi kategoriya manbasi yo'q) |
| Haqiqiy PostgreSQL 16, UTF8 (`tests/evidence/expense-categories-real-postgres.js`) | ✅ 7/7 — takroriy migratsiya, harf/apostrof takrori, 2 ulanishdan parallel yaratish, CHECK, FK, brauzer rollari yopiq |
| PG16 v23 / F4-B7 dalillari (UTF8 bazada qayta) | ✅ 6/6 · 7/7 |
| `supabase-migration-25-verify.sql` (to'liq sxema, PG16 UTF8) | ✅ 27/27 `true` |
| UI audit: 1920/1600/**1536**/1440/1366/1280 + 320/360/375/390/412/430 + landshaft; +7 kategoriya holati | ✅ **728/728** (gorizontal surilish, ekrandan chiqish, ustma-ust, kesilgan tugma, yopilgan boshqaruv, oyna sig'ishi) |
| Smoke | ✅ 117/117 |
| Production (faqat o'qish) | baza UTF8 ✅ · `expense_categories` yo'q (26 qo'llanmagan) · 24/25 qo'llanmagan |

Topilgan va tuzatilgan: lokal PostgreSQL klasteri `SQL_ASCII` edi — unda `translate()` ko'p baytli apostrofni noto'g'ri almashtirdi (`Yo‘lkira` → `yo''lkira`). Supabase UTF8 bo'lgani uchun productionga ta'siri yo'q. Shunday bo'lsa ham, 26-migratsiyaga "baza UTF8 bo'lmasa — to'xtash" himoyasi qo'shildi, dalil skriptlari esa endi UTF8 baza yaratadi.

Qotirilgan kategoriya qidiruvi (runtime kodi: `js/`, `netlify/`, `*.html`) — xarajat kategoriyasi ro'yxati yoki select varianti **qolmadi**. Topilgan mosliklar boshqa narsalar:
- `'Boshqa'` — mahsulot kategoriyasi standarti (`main.js` 4926, 11157, 12163, 12290 — ombor domeni, xarajat emas), Firma kassa kontragent turi (`firma-kassa.js` 33, 186) va oddiy matnlar ("Boshqa filial...", "Boshqa davrni...").
- `'Ijara'` — `FW_SYS_EXPENSE.rent` (shared.js): oylik/ijara xodimiga to'lovning **tizim belgisi**, tanlanadigan kategoriya emas; "Oylik / Ijara xodimlar" sarlavhasi.
- `Yo'lkira` — Kirim (import) oynasidagi izoh matni (yo'lkira/bojxona taqsimoti), kategoriya emas.
- Migratsiya izohida eski nomlar tarix sifatida tilga olingan.

---

# (tarix) Powerful PRO v23 — Test natijalari (2026-10-02)

To'liq baho — `AUDIT-HISOBOT.md`. Yakuniy baho: **NOT PRODUCTION READY**. Sabablar:
- production'da 24/25-migratsiya qo'llanmagan va v23 deploy qilinmagan — production E2E: **NOT VERIFIED** (ruxsatingizsiz qilinmaydi);
- F4b (mijoz/ta'minotchi qarzi, ombor `sold`) hali JSON'da — **PARTIAL**.

| Tekshiruv | Natija |
|---|---|
| `npm run check` | ✅ 92/92 JS · 46/46 funksiya · config faqat anon |
| `npm run build` | ✅ dist/ — 16 fayl (faqat sayt) |
| `npm test` | ✅ **142 / 142 PASS** (123 eski/yangilangan + 16 yangi v23 + 3 yangi P17 — xarajat kategoriyalari) |
| Yangi testlar (P15 — 9, P16 — 7) v11-FINAL kodida | ❌ **0/16** (har biri aniq sabab bilan FAIL — pastda) |
| Haqiqiy PostgreSQL 16, ko'p ulanish — v23 (`tests/evidence/v23-real-postgres.js`) | ✅ 6/6 |
| Haqiqiy PostgreSQL 16 — v11 F4/B7 (yangi sxema ustida qayta) | ✅ 7/7 |
| Saqlash yo'li hujumi (`f4-save-path-attack.js`) | ✅ rad etiladi (bazadagi qoldiq qoladi) |
| 25-migratsiya: 2 marta ketma-ket, ma'lumot o'zgarmaydi | ✅ (P15, P11, PG16) |
| `production + 23 + 24 + 25 = schema.sql` (funksiya matni + ruxsatlar md5) | ✅ (P11) |
| `supabase-migration-25-verify.sql` (to'liq sxemada) | ✅ 22/22 `true` |
| Production read-only | ✅ 23 qo'llangan (7 funksiya matni fayl bilan bir xil) · 24/25 yo'q · `customer_debt_payments.customer_local_id` = integer (xato tasdiqlandi: `22003 out of range`) |
| UI audit (11 o'lcham + landshaft; +9 v23 holat, +1 kategoriya) | ✅ 600/600 |
| Smoke (barcha sahifa/portal) | ✅ 117/117 |
| Maxfiy kalitlar | ✅ manbada faqat ochiq `anon` kalit (role=anon), joy egallovchilar |
| Production'da v23 E2E | ⚠️ NOT VERIFIED |

## O'zgartirilgan eski testlar (talab o'zgargani uchun, zaiflashtirilmagan)
- **P0.3** (kassa "ko'chirish"): endi `cashbox-ops` → `authority:false` → eski `cashbox-transact` tekshiruvi (fail-close) zanjiri tekshiriladi. Rad etish sinovida summa 999 → 4 qilindi: avval mahalliy tekshiruv so'rovni serverga yetkazmasdan to'xtatardi, ya'ni server rad etishi umuman sinalmasdi. **+1 yangi holat:** 24-migratsiyadan keyin eski endpoint chaqirilmaydi.
- **P10 F7**: avval "admin tokenni ko'radi" deb kutilardi. v23 talabi — token hech kimga yuborilmaydi. Endi qo'shimcha tekshiriladi: admin tokensiz saqlasa token o'chmaydi, ataylab bo'sh yuborsa o'chadi.
- **P13 F4-7**: `home_withdrawal` endi `record` talab qiladi. Qo'shimcha tekshiruv: `home_withdrawals` yozuvi kassa amali bilan birga paydo bo'ladi.
- **P8/P11**: sxema sonlari 25-migratsiya bilan (+7 funksiya, +1 cheklov, +2 indeks); P11 — `production + 23 + 24 + 25`. Migratsiyada "o'chirish yo'q" tekshiruvi `revoke ... truncate` (ruxsat bayonoti) ni chetlab o'tadi. Uning o'rniga yangi tekshiruv qo'shildi: "25-migratsiya anon'ga hech narsa bermaydi".

## Yangi testlar v11-FINAL kodida (0/16)
```
P15 (server + baza)
FAIL Firma kassa: manba, teskari yozuv bilan bekor qilish, jurnallar o'zgarmas
FAIL Filial Bazadan pul qarzi: berish/qaytarish atomik, ortiqcha yo'q, hisobot
FAIL To'lov + kassa bitta tranzaksiyada: katta mijoz ID, takror yo'q, diller ortiqcha — hammasi bekor
FAIL Ruxsatlar yopiq (anon/authenticated); 25-migratsiya takroriy xavfsiz        — 25-migratsiya yo'q
FAIL cashbox-ops: record majburiy, qarzdan ortiq rad, CNY kassa yo'q            — "record'siz to'lov qabul qilinmaydi"
FAIL Eski kassa API'lari 410 — "yarim" yozuv yo'q                               — "cashbox-transact: eskirgan — 410"
FAIL firma-kassa: qarz/bekor qilish/boshlang'ich qoldiq ruxsatlari, ...          — "filial kassiri o'ziga qarz BERA olmaydi"
FAIL Telegram tokeni brauzerga ketmaydi; hamkorlar — faqat o'z filiali           — "admin javobida ham token yo'q"
FAIL 25-migratsiyasiz: katta ID aniqlanadi; diller to'lovi fail-close (409)      — bigIdColumn yo'q
== 0 PASS, 9 FAIL
P16 (brauzer)
FAIL Mijoz qarz to'lovi: tarmoq/rad/eski yozuv xatosi — hech narsa o'zgarmaydi   — tarmoq xatosida qarz kamaygan (fail-open)
FAIL Ta'minotchi to'lovi va kunlik yopish: fail-close, qisqartirish yo'q         — "ortiqcha summa serverga yuborilmadi"
FAIL Diller to'lovi: qarz va kassa serverdan, eski yo'llar ishlatilmaydi
FAIL Hamkorlar har bir filialda alohida; Baza hamkorlari va oylari daxlsiz
FAIL Telegram: token ko'rsatilmaydi, sinov serverdan, ...                        — "token o'rnatilgani ko'rsatiladi"
FAIL Kirim → Firma kassa: partiya K-havola bilan bog'lanadi; ...                 — "noyob K-... (avval keyingi partiya raqami edi)"
FAIL Sotuvchi portali: qarz to'lovi fail-close                                    — tarmoq xatosida to'lov o'tib ketdi
== 0 PASS, 7 FAIL
```

## Haqiqiy PostgreSQL 16 — v23 (`PGHOST=/tmp/fwpg PGPORT=5499 PGUSER=postgres node tests/evidence/v23-real-postgres.js`)
```
PostgreSQL: 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1) (lokal sinov bazasi "fw_v23_test")
✅ Filial qarzi: 2 parallel qaytarish (qarz 200$, 2×150$): 1-si o'tdi, 2-si KUTDI va rad etildi; qolgan qarz 50, filial 350, Firma 950
✅ Diller to'lovi: 2 parallel (qarz 40$, 2×30$): 1-si o'tdi; 2-si diller qatori qulfida KUTDI → rad; qarz 10, kassaga faqat +30 (rad etilganning kassa harakati ham bekor)
✅ Bekor qilish: bir yozuv, 2 parallel: 1-si o'tdi, 2-si rad ("bu yozuv allaqachon bekor qilingan"); teskari yozuv 1 ta, qoldiq tiklandi
✅ Deadlock yo'q (qarz olish va tovar qarzi to'lovi bir vaqtda): ikkalasi ham bajarildi (tartib: filial kassasi → Firma kassa)
✅ To'lov rollback + katta mijoz ID: xatoda yozuv ham, kassa ham yo'q; muvaffaqiyatda bigint ID (1759300000000123) saqlandi
✅ Jurnallar o'zgarmas + yakuniy izchillik: UPDATE/DELETE rad etildi; har bir qoldiq = jurnal yig'indisi (filial va Firma kassa)
```

---

# Powerful PRO v11 (FINAL P1 GATE) — Test natijalari (2026-10-02)

To'liq baho — `AUDIT-HISOBOT.md`. Yakuniy baho: **NOT PRODUCTION READY**. Sabab — F4 va B7 emas (ular PASS):
- production'da 23/24-migratsiyalar hali qo'llanmagan, shuning uchun v11 production bazada sinalmagan (NOT VERIFIED);
- qarzlar/ombor (F4b) hali JSON'da.

| Tekshiruv | Natija |
|---|---|
| `npm ci` → `npm run check` → `npm run build` | ✅ 87/87 JS · 45/45 funksiya · dist 16 fayl |
| `npm test` | ✅ **122 / 122 PASS** (109 eski + 13 yangi) |
| F4 hujum testlari (P13 F4-1…7) | ✅ v11: 7/7 · ❌ v9: 0/7 · ❌ v10-FINAL: 0/7 |
| B7 testlari (P13 B7-1, B7-2) | ✅ v11: 2/2 · ❌ v9, v10-FINAL: 0/2 |
| Brauzer F4/B7 (P13) | ✅ v11: 2/2 · ❌ v9, v10-FINAL: 0/2 |
| Lokal to'liq stek E2E (P14: Chromium → server funksiyalari → PostgreSQL) | ✅ 2/2 · F4/B7 tuzatishi olib tashlansa — ❌ (mutatsiya testi) |
| Haqiqiy PostgreSQL 16, ko'p ulanish (`tests/evidence/f4-b7-real-postgres.js`) | ✅ 7/7 |
| Saqlash yo'li hujumi (`tests/evidence/f4-save-path-attack.js`) | v9: soxta qoldiq saqlanadi · v11: rad etiladi |
| ZIP ↔ production (518 obyekt, faqat o'qish) | ✅ 443 bir xil · 65 faqat ZIP · 10 farq — hammasi 23/24-migratsiya · 0 faqat production |
| UI audit (11 o'lcham + landshaft × 40 holat) | ✅ 480/480 |
| Smoke (barcha sahifa/portal, 3 o'lcham) | ✅ 117/117 |
| Production'da v11 E2E | ⚠️ NOT VERIFIED — deploy va migratsiya ruxsatingizsiz qilinmaydi |
| Maxfiy kalitlar | ✅ ZIP'da faqat ochiq `anon` kalit |

## Yangi testlar eski kodda (v10-FINAL; v9 da ham aynan 0/11)
```
FAIL F4-1: normal kassa amali — server bajaradi, qoldiq bazadan 
FAIL F4-2: brauzer boshqa qoldiq yuborsa — DENY (bazadagi qoldiq qoladi, jurnalga yoziladi) 
FAIL F4-3: juda katta qoldiq / qiymat yaratish / soxta kurs — DENY 
FAIL F4-4: manfiy, son emas, ortiqcha chiqim, huquqsiz, boshqa filial, to'g'ridan-to'g'ri SQL — DENY 
FAIL F4-5: ikki parallel amal — faqat to'g'ri natija, qoldiq manfiy emas 
FAIL F4-6: bir xil amal ikki/uch marta — dublikat yo'q 
FAIL F4-7: yakuniy qoldiq = bazadagi qoldiq = jurnal yig'indisi (savdo ham) 
FAIL B7-1: USD va UZS (serverdagi kurs), qarz kamayadi, ikki jurnalda audit izi 
FAIL B7-2: takroriy yuborish, mablag' yetmasligi, ortiqcha to'lov, valyuta, rollback, parallel 
FAIL F4 brauzer: qoldiq serverdan; rad/tarmoq xatosida o'zgarmaydi; qayta urinish — o'sha kalit 
FAIL B7 brauzer: 'Bazaga to'lov' — bitta server tranzaksiyasi, natija serverdan 
== 0 PASS, 11 FAIL
```

## Haqiqiy PostgreSQL 16 (lokal sinov bazasi, ko'p ulanish)
```
PostgreSQL: 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1) (lokal sinov bazasi "fw_cash_test")
✅ F4-5 parallel chiqim (qator qulfi): 1-si o'tdi, 2-si KUTDI va rad etildi ("kassada mablag' yetarli emas (qoldiq 100.00, so'ralgan 200.00)"), qoldiq 100
✅ F4-6 bir xil kalit parallel: 2-si advisory lock'da kutdi → replay=true; jurnalda 1 yozuv; qoldiq 150
✅ Deadlock yo'q (qarama-qarshi ko'chirishlar): ikkalasi ham bajarildi (kassalar tartib bilan qulflanadi)
✅ B7 parallel to'lov (qarz 380$, 2×300$): 1-si o'tdi; 2-si qarz qatori qulfida KUTDI → qarzdan oshgani uchun rad; qarz 80, Firma +300, filial 350
✅ B7 rollback (tranzaksiya oxirida xato): filial kassasi, Firma kassa va qarz — o'zgarmadi; jurnallarda iz yo'q
✅ B7 deadlock yo'q (filial→Firma va Firma→filial bir vaqtda): ikkalasi ham bajarildi, qoldiq 360
✅ F4-7 / B7 yakuniy izchillik: har bir kassa qoldig'i = jurnal yig'indisi (filial va Firma kassa)
```

## Saqlash yo'li hujumi — v9 va v11
```
v9:  brauzer boshqa qoldiq yuboradi → saqlangan 1:1205000 3:5300
     juda katta qoldiq              → saqlangan 1:1000000000000000 3:1000000000000000
     manfiy qoldiq                  → saqlangan 1:-999 3:-999
v11: uchala hujum                   → saqlangan 1:1200000 3:300 (bazadagi qoldiq)
```

## `npm test` natijasi
```
▶ P0.1 — app-data-save.js RBAC (backend)
  • ruxsati yo'q xodim (kassir) 'products' yoza olmaydi (kalit tashlanadi) + audit log ... ✅ PASS
  • admin har qanday modulni saqlay oladi (200) ... ✅ PASS
  • mos permission'ga ega xodim saqlay oladi (200) ... ✅ PASS
  • ro'yxatda yo'q kalit — admin bo'lmaganga har doim rad etiladi (deny-by-default) ... ✅ PASS
  • branchStore ichidagi customers — mijoz huquqisiz yozilmaydi ... ✅ PASS
  • branchStore ichidagi customers — mijozlar.edit bilan o'tadi ... ✅ PASS
  • yaroqsiz token — 401 ... ✅ PASS

▶ P0.2 — Savdo/Qaytarish fail-close
  • sale-checkout-atomic tarmoq xatosida savdo bekor qilinadi (fail-close) ... ✅ PASS
  • sale-return-shadow-check tarmoq xatosida qaytarish bekor qilinadi (fail-close) ... ✅ PASS

▶ P0.3 — Kassa "move" server-validatsiyasi
  • 'move' amali cashbox-transact serverini chaqiradi ... ✅ PASS
  • server rad etsa, move amali balansni o'zgartirmaydi ... ✅ PASS

▶ P1.1 — Bank komissiyasi (CUR.BANK_FEE) sozlanuvchan
  • Sozlamalar'da % kiritilsa, CUR.BANK_FEE + S.settings.bankFeePct + localStorage yangilanadi ... ✅ PASS
  • Kirim tannarx formulasi joriy CUR.BANK_FEE qiymatidan foydalanadi ... ✅ PASS

▶ P1.2+P1.3 — Yaxlitlash (rounding) va Currency snapshot
  • CUR.roundUzs() — chegara holatlari (0-500 pastga, 501-999 yuqoriga) ... ✅ PASS
  • Har bir savdo qatori alohida yaxlitlanadi (arxitektura hujjati misoli) ... ✅ PASS
  • Skidka LINE-LEVEL qo'llanadi (har qatorga bir xil %) ... ✅ PASS
  • Sozlamalarda roundingEnabled=false bo'lsa, yaxlitlash o'chadi ... ✅ PASS
  • Zarar bilan sotuv bloklanmaydi, lekin audit-logga yoziladi ... ✅ PASS
  • Har bir savdoda kurs (exchange rate) snapshot qilinadi ... ✅ PASS

▶ P10 — v10 audit: server funksiyalari (avtorizatsiya, validatsiya, idempotency) — mock DB
  • F1: menejer admin/egasi parolini o'zgartira yoki o'chira olmaydi ... ✅ PASS
  • F9: o'ziga rol berish, 'owner' berish, tizim rolini o'zgartirish — faqat admin ... ✅ PASS
  • F2+F5: savdo — pul parametrlari tekshiriladi; parallel takror savdo bitta ... [sale-checkout-atomic] Omborda yetarli qoldiq yo'q
✅ PASS
  • F6: diller to'lovi yoziladi; takror yo'q; haqiqiy ikkinchi to'lov yo'qolmaydi ... ✅ PASS
  • F7+F15: maxfiy sozlamalar xodimga ketmaydi va o'chmaydi; audit jurnali faqat qo'shiladi ... ✅ PASS
  • F3/F8/F11/F12: buyurtma holati, partiya, katalog, diller balans validatsiyasi ... ✅ PASS
  • Firma Kassa funksiyasi: ruxsat, CNY rad, idemKey majburiy, filialdan qabul ... ✅ PASS

▶ P11 — v10: Firma Kassa va diller savdosi — haqiqiy PostgreSQL (PGlite)
  • production qismi = production; production + 23-migratsiya = schema.sql; takror xavfsiz ... ✅ PASS
  • Firma Kassa: faqat USD/UZS, manfiy yo'q, idempotent, avans, ledger izchilligi, brauzerga yopiq ... ✅ PASS
  • Diller savdosi: qarz/ball serverda, eski variantlar yopiq, hamkor funksiyalari faqat server ... ✅ PASS

▶ P12 — v10 audit: mijoz tomoni (haqiqiy brauzer) — savdo, kirim, kassa, qaytarish, XSS, filial, Firma Kassa
  • B2/B4/B5: 3 marta bosish — 1 savdo; qaytim kassaga yozilmaydi; 'skidka' — qarz emas ... ✅ PASS
  • B3/B6/B15: Kirim bank haqi 1 marta; ko'chirishda kurs; ortiqcha chiqim/yarim ayirboshlash yo'q ... ✅ PASS
  • B8: qaytarish — skidkali narx, avval qarzdan, ikki barobar qaytarilmaydi ... ✅ PASS
  • J1/J2/J5: qo'shilgan filial xodimi ilovasi ochiladi, o'z filialida; XSS bajarilmaydi ... ✅ PASS
  • Firma Kassa UI: server tasdiqlagandagina filial kassasi o'zgaradi; Kirim to'lovi fail-closed ... ✅ PASS
  • B13/J4/J9: Excel import bank haqi va qarz; mijoz qidiruvi va mahsulot kartasida XSS yo'q ... ✅ PASS
  • U1/U2/U3: yopilgan oyna va bildirishnoma bosishni to'smaydi; tor ekranda galereya ... ✅ PASS
  • B1 (unit): filial ma'lumotini delta bilan birlashtirish ... ✅ PASS
  • J13/B1: f702 sotuvchisi o'z filialida; saqlash admin o'zgarishlarini o'chirmaydi ... ✅ PASS

▶ P13 — v11: F4 kassa qoldig'i server haqiqiy manba, B7 filial → Firma kassa atomik
  • F4-1: normal kassa amali — server bajaradi, qoldiq bazadan ... ✅ PASS
  • F4-2: brauzer boshqa qoldiq yuborsa — DENY (bazadagi qoldiq qoladi, jurnalga yoziladi) ... ✅ PASS
  • F4-3: juda katta qoldiq / qiymat yaratish / soxta kurs — DENY ... ✅ PASS
  • F4-4: manfiy, son emas, ortiqcha chiqim, huquqsiz, boshqa filial, to'g'ridan-to'g'ri SQL — DENY ... [cashbox-ops] CASHBOX: kassada mablag' yetarli emas (qoldiq 300.00, so'ralgan 301.00)
✅ PASS
  • F4-5: ikki parallel amal — faqat to'g'ri natija, qoldiq manfiy emas ... [cashbox-ops] CASHBOX: kassada mablag' yetarli emas (qoldiq 100.00, so'ralgan 200.00)
✅ PASS
  • F4-6: bir xil amal ikki/uch marta — dublikat yo'q ... [cashbox-ops] CASHBOX: amal kaliti boshqa amal uchun ishlatilgan
✅ PASS
  • F4-7: yakuniy qoldiq = bazadagi qoldiq = jurnal yig'indisi (savdo ham) ... [cashbox-ops] CASHBOX: kassada mablag' yetarli emas (qoldiq 358.50, so'ralgan 999.00)
✅ PASS
  • B7-1: USD va UZS (serverdagi kurs), qarz kamayadi, ikki jurnalda audit izi ... ✅ PASS
  • B7-2: takroriy yuborish, mablag' yetmasligi, ortiqcha to'lov, valyuta, rollback, parallel ... [firma-kassa] CASHBOX: kassada mablag' yetarli emas (qoldiq 180.00, so'ralgan 181.00)
✅ PASS
  • F4 brauzer: qoldiq serverdan; rad/tarmoq xatosida o'zgarmaydi; qayta urinish — o'sha kalit ... ✅ PASS
  • B7 brauzer: 'Bazaga to'lov' — bitta server tranzaksiyasi, natija serverdan ... ✅ PASS

▶ P14 — v11: lokal to'liq stek E2E (brauzer → server funksiyalari → PostgreSQL)
  • Admin: soxta qoldiq saqlanmaydi; kirim/ko'chirish/ortiqcha chiqim/savdo/Bazaga to'lov (2× bosish) — bazada to'g'ri ... ✅ PASS
  • Sotuvchi portali: xarajat serverda; konsoldan qoldiqni o'zgartirish rad etiladi ... ✅ PASS

▶ P2 — OWASP auditi tuzatishlari (xavfsizlik)
  • A01: branch-save — sotuvchining oddiy savdosi saqlanadi ... ✅ PASS
  • A01: branch-save — huquqsiz modul (revizya) o'zgarishi yozilmaydi + audit + server qiymati qaytadi ... ✅ PASS
  • A01: branch-save — RBAC roli yo'q xodim hech narsani o'zgartira olmaydi ... ✅ PASS
  • A01: branch-save — boshqa filialga yozib bo'lmaydi ... ✅ PASS
  • A01/A07: ommaviy o'chirish admin bo'lmaganga SERVERDA bloklanadi ... ✅ PASS
  • A01/A07: admin ommaviy tozalay oladi ... ✅ PASS
  • P0.1 regressiyasi: to'liq payload bilan sotuvchi savdosi rad etilmaydi ... ✅ PASS
  • A01: app-data-save — barcha mahsulotni o'chirish faqat admin ... ✅ PASS
  • A01+A09: supplier-payment .edit talab qiladi, rad etish jurnalga yoziladi ... ✅ PASS
  • A10: xom DB xatosi yashiriladi, biznes-xato ko'rsatiladi ... ✅ PASS
  • A05: mijoz ismidagi XSS esc() orqali zararsizlantiriladi ... ✅ PASS
  • Omborchi Kirim'i kassa/ta'minotchi qismi bilan to'liq saqlanadi ... ✅ PASS
  • Sotuvchi savdosida ta'minotchi qarzi yo'qolmaydi ... ✅ PASS
  • Sozlamalar: kurs — hammaga, admin PIN — faqat sozlamalar.edit ... ✅ PASS
  • deletedIds: tombstone faqat o'sha ro'yxatga huquq bo'lsa ... ✅ PASS
  • Sotuvchi ilovasi saqlashi app_data_branches'ni ham yangilaydi ... ✅ PASS
  • Kichik filialda partiya guruhini o'chirish bloklanmaydi ... ✅ PASS

▶ P3 — Hamkorlar foyda taqsimoti
  • Avgust (production) misoli: Sardor 30%, Kozimjon to'liq, ta'sischilar teng ... ✅ PASS
  • Ta'sischilar alohida % (60/40) + yig'indi 100% bo'lmasa blok ... ✅ PASS
  • Bekor qilish: faqat taqsimot summasini ayiradi + tombstone ... ✅ PASS
  • Sinxron: bekor qilingan taqsimot qaytmaydi, hisob eski qurilma tomonidan qayta yozilmaydi ... ✅ PASS
  • Ta'sischi belgisini olib tashlash 100% ni qoldirmaydi ... ✅ PASS
  • Oylik: hisoblangan oy yopiladi, tahrir faqat farqni qo'shadi ... ✅ PASS
  • Foyda uchun hisob = oy boshi − oyda olganining yarmi (2000−500/2=1750) ... ✅ PASS
  • Kirim kechiktirish: sanaga qarab keyingi/keyingi-keyingi oydan boshlanadi ... ✅ PASS
  • AZIMSHER misoli: 20.08 kirim → Sentabrda band, Oktabrdan foyda oladi ... ✅ PASS
  • 1-5 sanada qo'shilgan kirim keyingi oydayoq foyda oladi ... ✅ PASS
  • Kirim bekor qilinganda hamkor hisobi va kassa asl holatga qaytadi ... ✅ PASS
  • Xarajatlar formasi: 'Kirim' tanlansa hisob va kassa OSHADI (kamaymaydi) ... ✅ PASS
  • Hamkor tarixi: kirim yozuvi musbat (+) va 'Kirim' deb ko'rsatiladi ... ✅ PASS

▶ P4 — Qurilmaga moslashuvchan ko'rinish (kompyuter / planshet / telefon)
  • Planshet (1024×768 va 820×1180) — telefon bilan bir xil mobil maket, kontent o'rtada ... ✅ PASS
  • Kompyuter maketi 1025px dan (1280px: yon menyu, pastki menyu yo'q) ... ✅ PASS
  • Portallar: planshetda telefon maketi (pastki menyu), kompyuterda tablar ... ✅ PASS
  • Admin, telefon 390px: 68px menyu cheti yo'q, faqat pastki menyu, sarlavha kesilmagan ... ✅ PASS
  • Admin, planshet 768px: kontent chetdan boshlanadi, pastki menyu ... ✅ PASS
  • Admin, kompyuter 1440px: yon menyu bor, telefon menyusi yo'q ... ✅ PASS
  • Admin, telefon: 'Ko'proq' menyusi orqa fon soyasi bilan ochiladi va fonga bosilsa yopiladi ... ✅ PASS
  • Sotuvchi portali: telefonda bir ustun (tablar 3+3), kompyuterda keng kassa ko'rinishi ... ✅ PASS
  • Diller portali: kompyuterda keng, ko'rsatkichlar bir qatorda ... ✅ PASS

▶ P5 — Statistika sahifasi (sxData + render, eksport tugmalarisiz)
  • Bugungi ko'rsatkichlar: tushum/foyda, do'kon xarajati, qaytarish = tannarx + zarar ... ✅ PASS
  • Naqd kassa oqimi: faqat naqd kassalar, karta kirmaydi, o'tkazma xarajat emas ... ✅ PASS
  • O'chirilgan savdo savdodan ayriladi; naqd → karta o'tkazmasi xarajat emas ... ✅ PASS
  • Davr filtrlari: bugun / kecha (UTC sanalar) / kun / joriy va o'tgan oy ... ✅ PASS
  • Kirim tizim partiyalarisiz; ta'minotchi to'lov/qarz ... ✅ PASS
  • sxData faqat o'qiydi — ma'lumotlar o'zgarmaydi ... ✅ PASS
  • Render: eksport tugmalari yo'q, bo'limlar va plitkalar to'g'ri, xatosiz, --border bo'sh emas ... ✅ PASS
  • Davr tanlovi (S.sx) bulut/localStorage'ga saqlanmaydi ... ✅ PASS
  • Pul formati: manfiy −$, minglik bo'shliq ... ✅ PASS

▶ P6 — Sotuvchilar, Dillerlar, Filiallar statistikasi va portallar
  • Umumiy yordamchilar: davrlar, grafik nuqtalari, o'sish belgisi, format, escape ... ✅ PASS
  • Sotuvchilar: KPI, reyting, sotilmayotgan mahsulot, xodim filtri, XSS, faqat o'qish ... ✅ PASS
  • Dillerlar: KPI, reyting, sust mahsulotlar, hududlar, diller filtri, XSS, faqat o'qish ... ✅ PASS
  • Filiallar taqqoslash faqat egasiga va Baza'dan ko'rinadi ... ✅ PASS
  • Sotuvchi portali: faqat o'z savdolari, foyda/tannarxsiz ... ✅ PASS
  • Diller portali: mening statistikam va turib qolgan mahsulotlar ... ✅ PASS

▶ P7 — Oylik mahsulotlar reytingi va mahsulot rasmlari (galereya)
  • Statistika: bugun tanlansa ham reyting va dinamika oy boshidan; rasmlar; xavfsiz manzil ... ✅ PASS
  • Sotuvchilar/Dillerlar paneli standart — «Shu oy», «Mahsulotlar reytingi» rasmlar bilan ... ✅ PASS
  • Galereya: bekor qilish, ~40 KB siqish, 4 ta chegara, asosiy rasm = p.image ... ✅ PASS
  • Mahsulot formalarida rasm bo'limi (tahrirlash va yangi) ... ✅ PASS
  • Storage tozalash galereya rasmlarini o'chirmaydi (backend) ... ✅ PASS

▶ P8 — Noldan o'rnatish: baza sxemasi, sozlamalar, birinchi admin, health, build
  • supabase/schema.sql bo'sh bazaga qo'llanadi (2 marta ham); sonlar va rollar production bilan bir xil ... ✅ PASS
  • Yangi bazada savdo (FIFO, aralash to'lov, atomiklik), hamkorlar taqsimoti, ruxsatlar ishlaydi ... ✅ PASS
  • js/config.js: faqat anon kalit; service_role/secret rad etiladi; kod config'dan o'qiydi ... ✅ PASS
  • Birinchi administrator skripti: yaratish, takror login, qisqa parol, xatoda orqaga qaytarish ... ✅ PASS
  • health funksiyasi: holatni ko'rsatadi, kalit/manzil chiqarmaydi ... ✅ PASS
  • Build (dist/) faqat sayt; statik tekshiruv; .env.example, .gitignore, CI mavjud ... ✅ PASS

▶ P9 — v10: hamkor funksiyasi, rasm saqlagichi himoyasi, diller katalogida rasm
  • partner_upsert_atomic: bo'sh blokda birinchi hamkor yoziladi, updated_at yangilanadi (regressiya) ... ✅ PASS
  • Rasm saqlagichi: faqat faol xodim yozadi/o'chiradi; anon, diller, o'chirilgan xodim — yo'q ... ✅ PASS
  • catalog_products.image: faqat https; sinxronlash faqat https rasmni yozadi ... ✅ PASS
  • Katalog sinxronlash: https rasm yoziladi; image ustuni hali yo'q bazada ham ishlaydi (rasmsiz) ... ✅ PASS
  • Diller portali: buyurtma ro'yxati va reytingda rasm, xavfli havola chizilmaydi ... ✅ PASS
  • 22-migratsiya = schema.sql holati, takror ishga tushirish xavfsiz, ma'lumot o'chirmaydi ... ✅ PASS

──────────────────────────────
JAMI: 122 ta test — ✅ 122 PASS, ❌ 0 FAIL
```
