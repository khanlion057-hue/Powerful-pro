# Powerful PRO — v24.5: Diller ombori atomik (35-migratsiya, v23.10.2 dagi 31 dan ko'chirildi) (2026-10-14)
- **35-migratsiya (yangi, qo'llanmagan):** dillerga jo'natish (+ buyurtma tasdig'i — admin va sotuvchi), dillerdan qaytarish, admin diller savdosi — serverda BITTA tranzaksiyada (`dealer-ops`, `_lib/dealerAtomic`; FIFO tannarx, diller qatori qulflanadi, takror kalit — replay). Avval brauzer qoldiq/qarzni mutlaq qiymat sifatida yozardi (o'rtadagi xatoda tovar yo'qolar, parallel tasdiqda o'zgarish yo'qolar edi). 35 bo'lsa eski yo'llar 409 (`stock-debt-ops` diller jo'natmasi/qaytishi ham — yangilanmagan sahifa tovarni «yarim» ko'chira olmaydi). 35 bo'lmasa — avvalgi yo'l; 35 sahifa ochiq turganda qo'llansa ham keyingi amal yangi yo'ldan (v23 dagi kabi keshlanmaydi). `ledger_ops` turlari — 27–34 dagilarning hammasi + `dealer_ship/return/sale`; diller −10% (31), reviziya (32), `dealer_sales.source` o'zgarmaydi. 10 ta eski funksiyaga `search_path`.
- **Testlar:** P44 (yangi, 4 holat — haqiqiy PostgreSQL, 35 ikki marta; v24.5 mosligi; admin brauzeri); P8 (sonlar: +7 funksiya; 27 arxiv jadvali sonlari ham tuzatildi), P11 (35 bilan zanjir), P10 (35-siz baza — PGRST202 bilan).

# Powerful PRO — v24.5: Yangi savdo oynasi (admin = sotuvchi), 1 000 ga yaxlit, ortiqcha toʻlov → mijoz haqi (34-migratsiya), PDF hujjatlar, kamera skaneri, Telegram zaxira va tiklash, navigatsiya (2026-10-14)
- **Egasi qarorlari (2026-10-14):** soʻmda narx — **eng yaqin minggacha** (107 200 → 107 000; 107 500 → 108 000; 10 500 → 11 000), hisob aniq qoladi; ortiqcha toʻlov — **mijoz haqi** boʻlib qoladi (mijoz majburiy); xavfli amallar — **egasining paroli** bilan; diller va sotuvchi — **shaxsiy + oʻz filiali sozlamalari**; Excel — faqat bosh qoldiq (Kod · Nomi · Kategoriya · Brend · Miqdor · Tannarx ($) · Chakana · Optom).
- **Savdo oynasi — yangi (`js/pos.js`), admin va sotuvchida BITTA modul:** qidiruv + kamera tugmasi, kategoriya va ★ Sevimlilar, roʻyxatda qoldiq va narx, savat (miqdor, narx, qator %, izoh), chekka chegirma klaviaturasi, kechiktirilgan cheklar (pauza), mijoz tanlash va yangi mijoz (ism + telefon majburiy), Chakana/Optom va UZS/USD — alohida kichik almashtirgichlar. Kompyuterda savat oʻng ustunda.
- **Toʻlov qoidalari:** summa kiritilmaguncha savdo yopilmaydi; summa teng — **«Naqd savdo»**; kam yoki koʻp — **mijoz tanlash majburiy**; kam toʻlov — qarzga yoki aniq tasdiq bilan «Farqni chegirma qilish»; ortiqcha — avval mijoz qarzidan ayiriladi, qolgani **mijoz haqi** (keyingi xariddan ishlatiladi). Zarar bilan sotuv — ziyon summasi bilan tasdiq. Kassaga tushgan soʻm = chekdagi soʻm.
- **34-migratsiya (`supabase-migration-34-mijoz-haqi.sql`) — 33 dan KEYIN:** `customer_credit_balances`, `customer_credit_ledger` (oʻzgarmas), `sale_credit_uses`; `sale_checkout_v34`, `sale_void_v34` (bekor qilinsa haq qaytadi); kassa amal turi `cust_credit`. Faqat server (brauzer rollariga huquq yoʻq), takror xavfsiz. 34 qoʻllanmaguncha: aniq va kam toʻlov avvalgidek ishlaydi, ortiqcha toʻlov/haq — aniq xabar bilan rad (`MIGRATION34_PENDING`), hech narsa yozilmaydi. Server toʻlangan summani kassa + haq bilan solishtiradi (soxta «toʻlangan» rad etiladi).
- **«Yangi qoʻshish» — oʻz toʻliq oynasi:** kirimda topilmagan mahsulot → mahsulot formasi, yangi taʼminotchi → taʼminotchi formasi; saqlangach chaqirgan joyda avtomatik tanlanadi.
- **Navigatsiya:** bitta X; X va telefonning «Orqaga» tugmasi — **bir qadam**, oldingi joyga; brauzer tarixi oʻsmaydi. **Ikki qavat X yoʻq** — oyna ustida oyna ochilsa, ostidagi X yashiriladi. Tuzatildi: oyna yopilib darhol yangisi ochilsa, keyingi «Orqaga» ilovadan chiqarib yuborishi mumkin edi (qoʻriqchi yozuv poygasi).
- **Moslashuv:** kirim qatorlari (¥ narx, miqdor) telefonda teng 50/50; savdo va diller oynalari 360 px da siljishsiz.
- **Excel kirim** — faqat «Bosh qoldiq»: shablon + fayl (ortiqcha sozlamalar olib tashlandi).
- **Diller portali:** Sotuv — savatcha (koʻp mahsulot, narx, −10% chegara, ziyon tasdigʻi); Buyurtma va Buyurtmalarim — bitta boʻlimda; «Qarzingiz» — faqat Toʻlov boʻlimida; Omborim — Baza uslubida (qidiruv, Kam qoldi, kategoriyalar). Pastki menyu: Omborim · Buyurtma · **Sotuv** · Toʻlov · Savdolarim.
- **Sozlamalar — faqat oʻziga tegishli:** sotuvchi va diller — mavzu, oʻlcham, skaner, parol; `sozlamalar.edit` boʻlsa — oʻz filiali cheki (nom, telefon, manzil, chek matni). Administrator boʻlmagan xodim **zaxira manzilini oʻzgartira olmaydi** (server tekshiradi).
- **Hujjatlar — PDF:** barcha chop etishlar (chek, hisobotlar, nakladnoy …) ilova ichidagi oynada: **PDF yuklab olish**, **Yuborish** (telefon ulashish), **Chop etish**, administratorda — **Botga**. PDF kutubxonasi — `js/vendor/html2pdf.bundle.min.js` 0.14.0 (MIT, lokal, kerak boʻlganda yuklanadi).
- **Skaner:** bevosita kamera (BarcodeDetector, boʻlmasa html5-qrcode), chiroq va qoʻlda kiritish; Sozlamalar → Skaner: «Kamera» yoki «USB/Bluetooth skaner».
- **Zaxira va tiklash:** Sozlamalar → Maʼlumotlar: zaxirani yuklab olish (server tomonda, maxfiy kalitlarsiz), **Telegram botga** (egasining SHAXSIY chatiga) va **har kuni avtomatik** (belgilangan soatda, kuniga bir marta); **tiklash** .json fayldan — oldin koʻrib chiqish, egasining paroli, avtomatik zaxira. Bulut rejimida pul/qoldiq jurnallari (savdo, partiya, kassa) fayldan ustiga yozilmaydi — server qiymati saqlanadi.
- **Olib tashlandi:** «Xavfli hudud» (xavfsizlik PIN, test rejimi, oʻchirish tugmalari), «Tizim 0 mahsulot · 0 savdo» qatori. Yopiq oyni oʻzgartirish — egasining paroli bilan.
- **Yangi server funksiyalari (jami 61):** `telegram-file` (PDF va zaxira — faqat administrator), `backup-daily` (jadval, har soatda tekshiradi). Yangilangan: `sale-checkout-atomic`, `sale-ops`, `telegram-announce` (narx 1 000 ga), `_lib/ledgerAuthority`, `_lib/appDataGuard`.
- **Testlar:** **222 / 222 PASS** (yangi: P34 — 34-migratsiya haqiqiy PostgreSQL 4; P35 — savdo oynasi, navigatsiya, bitta X, zaxira xavfsizligi 5; P1.2, P4, P8, P11, P12, P14, P20, P26, P27, P29, P32 — yangi oynaga moslandi). Rehearsal 24→34, verify 67/67. `package.json` — 24.5.0.

# Powerful PRO — v24.4: Telefon «Orqaga» = ✕, yopiq oy qoidasi, ta'minotchiga zaklad (33-migratsiya), hujjat raqamlari, kirimda qarz eslatmasi (2026-10-14)
- **Telefonning «Orqaga» tugmasi — ✕ bilan bir xil, har bosishda 1 qadam:** oyna ✕ bilan yopilganda tarixdagi «qo'riqchi» yozuv ham olib tashlanadi (avval keyingi «Orqaga» bosishi hech narsa qilmasdi); oyna yopilib darhol bo'lim ochilsa — yozuv almashtiriladi; ✕ endi tarixga yangi qadam qo'shmaydi (history.back) — «Orqaga» bilan yopilgan bo'limga qayta kirilmaydi.
- **Yopiq oy qoidasi (egasi qarori):** foydasi hamkorlarga taqsimlangan oyga savdo, tahrir, o'chirish, qaytarish, xarajat, hisobdan chiqarish yoki zaklad xizmati kiritilsa — ogohlantirish; tasdiqlansa yozuv kiritiladi va OXIRGI yopiq oy taqsimoti avtomatik qayta hisoblanib yopiladi (oy foydasi yozuv keltirgan FARQ qadar o'zgaradi, qo'lda kiritilgan tuzatish saqlanadi; hamkor hisoblariga faqat farq; qayta hisoblash tarixi saqlanadi). Undan eski yopiq oyga — taqiq (avval keyingi oylarni bekor qilish kerak). Sotuvchi portalida yopiq oydagi savdoni tahrirlash — taqiq. Yopilgandan keyingi boshqa o'zgarishlar (masalan, server tomonidan) — Hamkorlar bo'limida eslatma va «qayta hisoblash» tugmasi.
- **Taʼminotchiga zaklad — yuanda, $ kassadan (33-migratsiya, yangi `supplier-advance` server funksiyasi — jami 59):** Taʼminotchilar → «Zaklad (¥)»: yuan summasi, kurs (1 $ = ? ¥), xizmat % (standart 0,6). Misol: 10 000 ¥ + 0,6%, kurs 6,65 → kassadan **1 512,78 $**; taʼminotchiga zaklad **1 503,76 $** (faqat yuan summasi), **9,02 $** — xarajat «Pul oʻtkazish xizmati». Pul filialning $ kassasidan yoki Bosh kassa $ dan (filiallarda ham). Zaklad taʼminotchi qarzidan ALOHIDA saqlanadi; tovar kelgach «Zakladdan yopish» — qarz zakladdan kamayadi (qarzdan ham, zakladdan ham ortiq emas; toʻlov tarixiga yoziladi). Hammasi serverda bitta tranzaksiyada, takrorsiz; jurnal o'zgarmas.
- **Hujjat raqamlari — 0001 dan:** kirim partiyasi raqami endi 4 xonali (0001, 0002 …; avval 01). Savdo, diller savdosi, filial o'tkazmasi va hisobdan chiqarish raqami — «ro'yxat uzunligi + 1» emas, shu turdagi ENG KATTA raqam + 1 (xato tuzatildi: savdo o'chirilgach keyingi chek raqami mavjud chek raqami bilan takrorlanib qolardi). Eski raqamlar o'zgartirilmagan.
- **Kirim → «Taʼminotchiga toʻlov»:** taʼminotchi tanlanishi bilan uning joriy qarzi (qizil) yoki haqi (yashil), zakladi — kichik bo'lsa ham ko'rinadi; qidiruv ro'yxatida ham.
- **Testlar:** P32 (yopiq oy), P33 (zaklad — haqiqiy PostgreSQL + server, 3), P30 (+1 — telefon «Orqaga»), P8/P11 (33 sonlari izohli); rehearsal 24→33, verify 66/66. `package.json` — 24.4.0.

# Powerful PRO — v24.3: Tezkor amallar takrorsiz, ✕ — kirilgan joyga qaytish (2026-10-14)
- **Tezkor amallar — faqat boshqa joyda yo'q bo'limlar** (egasi talabi: son emas, sifat): Qaytarishlar, Kassalar, Mijozlar, Taʼminotchi, Ombor, Bosh kassa, Doʻkon, Xodimlar (ko'pi bilan 8 ta, huquq bo'yicha). Har bo'lim bitta joydan ochiladi: Savdo, Kirim, Mahsulotlar, Statistika — pastki menyu; Sozlamalar, **Rollar va ruxsatlar** (profilga ko'chdi), Jurnal — profil; Dillerlar — bosh sahifadagi Dillerlar bloki; Xarajatlar — «Xarajatlar» ko'rsatkichi (qo'shish va kategoriyalar); Hamkorlar — Audit (investorlar, taʼsischilar); Barcha cheklar — «Barcha sotilgan mahsulotlar».
- **✕ va telefonning «Orqaga» tugmasi — qayerdan kirilgan bo'lsa o'sha yerga:** bo'lim kichik oynadan (ko'rsatkich, Audit, profil, do'konlar, bildirishnomalar) ochilgan bo'lsa — yopilganda o'sha oyna qayta ochiladi; bo'limdan boshqa bo'limga o'tilgan bo'lsa — ketma-ket orqaga; bosh sahifaga to'g'ridan-to'g'ri o'tilsa yo'l tozalanadi.
- **Testlar:** P30 (+1 — qaytish yo'li), P4 (Tezkor amallar takrorsiz, Rollar — profilda). `package.json` — 24.3.0.

# Powerful PRO — v24.2: Telefon qobig'i (bo'limlar to'liq ekranda ✕ bilan), Barcha cheklar, Amallar jurnali, reviziya tasdig'i (32-migratsiya), ziyon summasi (2026-10-14)
- **Dizayn (egasi qarori):** v24.1 dagi rang/mavzu o'zgarishlari, bosh sahifadagi salomlashish va «Yangi savdo» tugmasi, pastki menyuning ko'tariladigan aylanasi **qaytarildi** (v24 ko'rinishi). Mavzular — avvalgi 6 ta (Tizimdagi, Yorug', Blue, Qorong'i, Monoxrom, Monoxrom yorug'); **standart — Tizimdagi** (telefon sozlamasi), boshqasi faqat Sozlamalar → Dizayn mavzusi orqali. Yuqori paneldagi kun/tun tugmasi olib tashlandi.
- **Telefon (admin paneli) — yangi tuzilma:** bosh sahifa — yagona «uy»: yuqorida **«Mening doʻkonlarim»** (logo va nom, nom uzunligiga mos o'lcham; bosilsa — Baza va filiallar ro'yxati: bugungi va oylik savdo, «Siz shu yerdasiz», boshqa filialga parol bilan o'tish, filiallarni boshqarish, do'kon qo'shish), 🔔 va **profil** (Jurnal, Ayirboshlash, Kun yakuni — kassa yopish, Sozlamalar, Chiqish). Har qanday bo'lim (Savdo, Kirim, …) **to'liq ekranda**: yuqorida nomi va ✕, pastki menyu ko'rinmaydi; ✕ (va telefonning «Orqaga» tugmasi) — doim bosh sahifaga. Pastki menyu: Kirim · Mahsulotlar · Savdo · Stat · **Audit** («Ko'proq» o'rnida — Biznes holati oynasi). Kompyuterda yon menyu maketi saqlandi.
- **Bosh sahifa tartibi:** Sotuv (Bugun / 7 kun / Bu oy) → **Barcha sotilgan mahsulotlar** → **Tezkor amallar** (barcha bo'limlar, huquq bo'yicha — yon menyu o'rnida) → Kategoriyalar → Asosiy ko'rsatkichlar → Xodimlar → Dillerlar. «Biznes holati» kartasi — pastki menyudagi «Audit»da.
- **Barcha cheklar (yangi):** qidiruv (chek, mijoz, mahsulot, xodim), «Sotilgan cheklar» / «Sotilgan mahsulotlar», davr — Bugun / Kecha / Oy / sana; xulosa: summa, chek va dona soni, foyda, chegirma, qaytarishlar, qarzlar; chek bosilsa — tafsilot. O'chirilgan savdo kirmaydi.
- **Amallar jurnali (yangi, profil → Jurnal):** Bugun / Kecha / Hafta / Oy / sana; yaratilgan / o'zgartirilgan / o'chirilgan soni; qidiruv; har yozuvda kim, qachon va **edi → bo'ldi** (jami, to'langan, qarz, chegirma, mahsulot soni va narxi, holat). Manba — o'zgarmas server audit jurnali (31-migratsiya) va shu qurilmadagi tizim yozuvlari («… ochildi» yozuvlari chiqarilmaydi).
- **Xato tuzatildi:** `design-system.css` da `--border` o'ziga havola qilgan (sikl) — kunduzgi rejimda ramkalar ko'rinmasdi (avval standart mavzu tungi bo'lgani uchun sezilmagan). Tungi «Blue»da ramkalar biroz aniqroq.
- **32-migratsiya (egasi qarorlari 2026-10-13):** diller reviziyasi — **administrator tasdig'i bilan** kamomad → sotuv, ortiqcha → qaytish (bitta tranzaksiya, takrorsiz, qoldiq o'zgargan bo'lsa rad, rad etish sababi majburiy, dillerga bildirishnoma); Dillerlar → «Reviziyalar» oynasi va 🔔 dan ochiladi. Sotuvchi tannarxdan past sotsa — **ziyon summasi** ko'rsatiladi («Siz bu savdoda 125 000 so'm ziyon qilyapsiz… Rozimisiz?»; tannarxning o'zi emas). `savdo.direct_sale` — oddiy «Xodim» roliga ham (diller — yo'q).
- **Diller:** optom narxidan past (10% ichida) sotishda «Ziyon qilishingiz mumkin. Sotuvga rozimisiz?»; qarz paneli faqat «Omborim» va «To'lov»da.
- **Testlar:** P30 (telefon qobig'i: cheklar, jurnal, do'konlar, mavzu), P31 (32-migratsiya: haqiqiy PostgreSQL — 4), P4 («Ko'proq» testi yangi qobiq testiga almashtirildi), P8/P11 (32 sonlari izohli), P25 («Biznes holati» — Audit), P29 (ziyon summasi, diller tasdig'i).
- `package.json` — 24.2.0.

# Powerful PRO — v24.1: Ijodiy bosh sahifa, mavzular saralandi (Po'lat · Oltin · Mis · Yalpiz), pastki menyu — faol bo'lim katta aylana (2026-10-13)
- **Bosh sahifa (foydalanuvchi namunalari asosida):** salomlashish (vaqtga qarab, ism, o'zbekcha sana); katta **«Yangi savdo»** tugmasi; «Sotuv» kartasida chek soni nishoni (savdo grafigi egasi so'rovi bilan qo'shilmadi — namuna menyu harakatini ko'rsatish uchun edi); **Tezkor amallar yuqoriga** ko'tarildi (doira ikonkalar, Do'kon — faol buyurtmalar soni nishoni); «Biznes holati»da **aktivlar tarkibi chizig'i** (Ombor · Yo'lda · Kassalar · Bizga qarz, foizda); «Qoldiq» plitkasida kam qolgan mahsulotlar soni. Avvalgi versiyada bir xil «Sotuv» kartasi ikki marta chiqardi — bittasi qoldi. Hisob-kitob formulalari **o'zgarmadi** (faqat ko'rinish).
- **Mavzular:** oq/qora qoldi (Tizimdagi, Yorug', Qorong'i, Monoxrom, Monoxrom yorug'). «Blue» → **«Po'lat»** (namuna palitrasi #06141B · #11212D · #253745 · #9BA8AB — eski ko'k-qora o'rniga yangilandi). Yangi: **«Oltin»** (qora + #F5B800), **«Mis»** (qora + #F07A1A), **«Yalpiz»** (#131321 + #46F0D2, krem #FBE2B4). Urg'u ranglari endi tokenlardan (FAB, banner, almashtirgich, tugmalar — avval ko'k qattiq yozilgan edi). Tungi ↔ kunduzgi tugma oxirgi tanlangan tungi mavzuga qaytadi; telefon yuqori paneli rangi mavzuga mos.
- **Tungi rejimda ramkalar aniqroq** (Po'lat, Qorong'i, Monoxrom — chegara rangi kuchaytirildi, kartalarga yengil soya).
- **Pastki menyu (namuna):** bosilgan bo'lim ikonkasi **katta aylana bo'lib panel ustiga ko'tariladi** (atrofida «o'yiq»), qolganlari ixcham; admin, sotuvchi va diller portalida bir xil. Navigatsiya mantiqi o'zgarmadi.
- **Filial nishoni:** «🏬 Filial — alohida hisob» o'rniga faqat belgi (to'liq matn — ustiga bosib turganda/ekran o'quvchida).
- **Diller:** optom narxidan past (10% ichida) sotishda — «Ziyon qilishingiz mumkin. Sotuvga rozimisiz?» (farq summasi bilan); qarz paneli faqat «Omborim» (bosh) va «To'lov» bo'limlarida.
- **Testlar:** 203 (201 + P30 — 2: bosh sahifa, mavzular, pastki menyu); P29 — diller tasdig'i qo'shildi. Baza sxemasi **o'zgarmadi** (migratsiya yo'q).
- `package.json` — 24.1.0.

# Powerful PRO — v24: To'liq audit, tahrirlash muddatlari, audit tarixi va 🔔, zarar tasdig'i, savdo oynasi, diller −10%, Telegram e'lon (2026-10-13)
- **Qarorlar (egasi tasdiqlagan, 2026-10-11):** 31-migratsiya — ha; tannarxdan past savdoni **sotuvchi o'zi tasdiqlaydi** (tannarx ko'rsatilmaydi, administrator xabardor qilinadi); bildirishnomalar — **yangi jadval**, 7 kundan keyin arxiv (o'chirilmaydi).
- **«Saqlanmadi!» xatosining haqiqiy sababi (P0):** server (`app-data-save`) rad etsa, ilova 21-migratsiyadan beri YOPIQ eski yo'lga (anon `upsert`) o'tib, har doim umumiy «Saqlanmadi!» ko'rsatardi — asl sabab (sessiya tugagan, ruxsat yo'q, hajm katta) faqat konsolda qolardi. Endi server javobi bo'lsa — uning **aniq va xavfsiz sababi** ko'rsatiladi, eski yo'lga faqat funksiya umuman yo'q bo'lsa (404) o'tiladi. Sozlamalar, profil/logo, Telegram, mahsulot, mijoz/ta'minotchi/hamkor saqlashda **«Saqlandi» faqat bulutga haqiqatan yozilgandan keyin** chiqadi (avval xato bo'lsa ham chiqardi). Sotuvchi portalida ham shunday.
- **31-migratsiya (`supabase-migration-31-tahrir-muddati-audit-bildirishnoma.sql`):** `fw_audit_events` (o'zgarmas: UPDATE/DELETE/TRUNCATE — trigger rad etadi), `fw_notifications` (faqat «o'qildi» o'zgaradi, o'chirilmaydi); `sale_edit_guarded` / `sale_void_guarded` / `sale_checkout_guarded` — mavjud atomik funksiyalar ustidan, **bitta tranzaksiyada**: tahrirlash muddati (**server vaqti**: admin 30, sotuvchi 7, diller 4 kun; yozuv sanasi — `created_at` va savdo sanasining ertarog'i), sotuvchi faqat o'z savdosini (`savdo.edit` bo'lsa — boshqalarnikini ham), oldingi → yangi qiymat auditga, adminga (admin tuzatsa — sotuvchiga) bildirishnoma; o'chirilgan savdo bazada «voided» bo'lib **iz qoladi**; zararli savdo tasdiqsiz — `LOSS_ACK_REQUIRED` (hech narsa yozilmaydi), tasdiq bilan — kim, qachon, mahsulot, miqdor, tannarx, narx va zarar auditda. `record_dealer_sale` — optom narxidan **ko'pi bilan 10% chegirma** (server rad etadi), chegirmali savdo auditda va adminga. Yangi ruxsat `savdo.direct_sale` — hozir savdo qila oladigan rollarga (oddiy «Xodim» va dillerdan tashqari) beriladi. Brauzer rollariga hech qanday yangi huquq yo'q; 31 qo'llanmaguncha barcha amallar avvalgidek ishlaydi.
- **Yangi server funksiyalari (jami 58):** `notifications` (🔔 ro'yxat, arxiv, o'qildi; «Savdo tarixi» — sotuvchiga tannarx/foydasiz; diller bildirishnomalari va **ombor reviziyasi**), `telegram-announce` (yangi mahsulot e'loni). Yangilangan: `sale-checkout-atomic` (zarar tasdig'i, Direct Sale ruxsati — ta'minotchi va narx **serverdagi mahsulotdan**), `sale-ops` (muddat va audit), `dealer-pay` (kassir qarori — dillerga bildirishnoma; `dealerAuth` umumiy kutubxonaga), `_lib/appDataGuard` (ijtimoiy tarmoq/e'lon havolasi — faqat https, chatlar formati).
- **🔔 Bildirishnomalar va savdo tarixi:** admin — yuqori panelda qo'ng'iroq (o'qilmaganlar soni): «Yangi», «Arxiv (7 kundan eski)», «Savdo tarixi» (yaratildi / tahrirlandi — oldingi → yangi / o'chirildi / zarar tasdig'i / diller chegirmasi va reviziyasi; kim, roli, vaqti). Sotuvchi — qo'ng'iroq oynasida bildirishnomalar; diller — yangi 🔔 tugmasi.
- **Savdo oynasi:** «Anonim» → **«Naqd savdo»** (bazadagi eski yozuvlar o'zgartirilmagan — faqat ko'rinish); **Chakana (so'm) / Optom ($)** rejimi — admin va sotuvchida, standart Chakana, almashganda savat va miqdorlar saqlanadi; qidiruv ro'yxati rasmsiz, **«Hamma mahsulotlar» — rasmli katalog**; QR/shtrix-kod — SKU **va mahsulot shtrix-kodlari** bo'yicha (sotuvchida avval faqat SKU); **telefonning «Orqaga» tugmasi** ochiq oynani (modal, pastki oyna, skaner, katalog, diller savdo oynasi) yopadi — ilovadan chiqib ketmaydi, savat saqlanadi.
- **Kam to'lov:** savdo izohsiz yakunlanmaydi — qolgan summa so'mda ko'rsatiladi va **«Qarzga yozish»** (mijoz shart) yoki **«Chegirma qilib berdim»** tanlanadi; chegirma — aniq tasdiq: «Siz xaridorga 10 000 so'm chegirma berdingiz. Tasdiqlaysizmi?»; «Bekor» — hech narsa bajarilmaydi; kassaga aynan olingan so'm yoziladi; takror bosish ikkinchi savdo yaratmaydi.
- **Sotuvchi tannarxni ko'rmaydi** (qidiruv, savat, savdo tarixi); narx minimal narxdan past bo'lsa — belgi va tasdiq (tannarx summasi ko'rsatilmaydi).
- **Direct Sale (sotuvchi):** mahsulotda admin belgilagan ta'minotchi va ta'minotchi narxi (mahsulot formasi → «Direct Sale ta'minotchisi», «Ta'minotchi narxi»); `savdo.direct_sale` ruxsati bilan omborda 0 bo'lsa ham sotiladi, alohida belgi; qarz — aynan shu ta'minotchiga; oddiy ombor qoldig'iga tegilmaydi.
- **Diller portali:** narx oynasida 10% chegarasi ko'rsatiladi (brauzer ham to'xtatadi); **«Ombor reviziyasi»** — har mahsulot: qabul qilingan, sotilgan, qaytarilgan, tizimdagi qoldiq (serverdan) va sanalgan son; kamomad/ortiqcha **avtomatik sotuv yoki qaytarishga aylanmaydi** — natija, sabab, kim/qachon auditga va adminga. **Xato tuzatildi:** savdo tasdiqlangach oyna yopilmay qolardi (brauzer `style` atributini «position: fixed» qiladi — eski selektor topa olmasdi); sotuvchida mijoz qo'shish va qarz to'lovidan keyin ham shu xato edi.
- **Onlayn do'kon / Telegram:** yangi mahsulot qo'shilganda (yoqilgan bo'lsa) **e'lon** sozlangan kanal va guruhlarga — rasm, nom, narx (serverdagi FIFO × ustama, vitrina chegirmasi bilan), havola va ijtimoiy tarmoq tugmalari; **takrorlanmaydi** (mahsulot × chat bandligi), xatoda — log, adminga bildirishnoma va xavfsiz qayta yuborish; «Bot ruxsatlarini tekshirish» (bot kanalda administratormi, guruhda a'zomi). Mahsulot kartochkasida «E'lon qilish». Sozlamalar → Brend va profil: **Instagram, YouTube, Facebook** (faqat https). Token faqat serverda.
- **B2B:** «B2B uchun 29-migratsiya qo'llanishi kerak» — kod xatosi emas: production bazada 29-migratsiya qo'llanmagan. Endi oynada aniq tushuntirish va qadamlar; taklif kodi tugmalari migratsiyasiz ko'rsatilmaydi.
- **Testlar:** 201 (189 + P28 — 9: haqiqiy PostgreSQL + server; P29 — 3: Chromium, telefon o'lchami). P8/P11 — 31-migratsiya sonlari izohli yangilandi (+2 jadval, +9 funksiya, +8 cheklov, +7 indeks, +5 rol bog'lanishi); P27 — savat summasi endi so'mda (Chakana) va Optom almashtirish tekshiriladi. Dalil: `edit-window-audit-real-postgres.js` (PG16, parallel) 6/6, `migration-chain-rehearsal.js` (24→31, verify 63/63).
- `package.json` — 24.0.0.

# Powerful PRO — v23.9: Telefon uchun sotuvchi va diller oynalari, bosh sahifa, kunlik Telegram hisobot, kunlik kurs (2026-10-07)
- **Brend nomi (telefon):** nom uzunligiga moslashadi — qisqa nom katta, uzun nom kichikroq, juda uzun nom ikki qatorga o'tadi (kesilmaydi); ekran o'lchami o'zgarsa qayta moslanadi.
- **Bosh sahifa — sotuv kartochkasi:** katta umumiy summa, ostida 6 ta teng katak (Foyda, To'landi, Yangi qarz, Qaytarishlar, Yopilgan qarz, Xarajat — telefonda 3×2, kompyuterda 6×1), «Sof foyda» alohida ajratilgan qator; raqamlar kattaroq va bir xil.
- **Sotuvchi portali (telefon birinchi — savdoning ~70% telefonda):** «Menyu» olib tashlandi (egasi so'ragan). Pastki panel: Qarzlar · Kassa · **Savdo** · Hisobot · **Xarajat**; **Oylik — Xarajat ichida** («Xarajat | Oylik» almashtirgich, bu oy xarajatim va oyligim kartochkalari). **Buyurtmalar** — yuqorida qo'ng'iroq ikonkasi, yangi buyurtmalar soni bilan; kun/tun va chiqish — ikonkalar. Savdo ekrani: bugungi 3 ta teng ko'rsatkich, kunlik kurs (tasdiqlanmagan bo'lsa ogohlantirish), qidiruv + **QR-kod tugmasi** (kamera rasmi o'rniga), **«Tez sotiladiganlar»** — rasmli kataklar, bir bosishda savatga; savat paneli («Savat · $… — To'lovga»). Kassa tanlovi — kartochkalar; sotuvchiga Shaxsiy va diller kassasi ko'rinmaydi.
- **Diller portali:** «Menyu» o'rniga — **Buyurtmalarim**; pastki panel: Omborim · To'lov · **Buyurtma** · Savdolarim · Buyurtmalarim.
- **Kunlik hisobot Telegram guruhiga (yangi `telegram-daily-report` — jadval bo'yicha, va `telegram-report` — administrator uchun):** Sozlamalar → Telegram bot → «Har kuni guruhga hisobot yuborilsin» va vaqt (Toshkent). Server har soatda tekshiradi, belgilangan soatdan keyin **kuniga bir marta** yuboradi (ikki marta yubormaydi; Telegram xatosida keyingi soatda qayta urinadi). Har filial: savdo va to'lov turlari, foyda, xarajat, sof foyda, undirilgan qarz, kassa yopilgani, kassalar (Shaxsiy kassasiz), mijoz/ta'minotchi qarzi, eng yaxshi sotuvchi va mahsulotlar; Bosh kassa, dillerlar to'lovi, jami. «Hisobotni ko'rish» va «Hozir guruhga yuborish» — faqat administrator. Bot tokeni faqat serverda.
- **Kunlik kurs:** har kuni birinchi kirishda so'raladi (avvalgidek); tasdiqlanganda sana sozlamaga ham yoziladi (`settings.rateDate`) — sotuvchi portali va Telegram hisoboti kurs bugun tasdiqlanganini ko'radi. Demo'da ham kurs oynasi chiqadi. Server: `rateDate` — kurs bilan birga har bir xodim yoza oladigan kalit.
- **Testlar:** P27 (4 — hisobot matni; haqiqiy PostgreSQL + server, kuniga bir marta; sotuvchi portali telefonda; brend nomi va kurs), P26 — diller pastki paneli (menyusiz). Baza sxemasi **o'zgarmadi** (migratsiya yo'q).
- `package.json` — 23.9.0.

# Powerful PRO — v23.8: Diller pul yuboradi (30-migratsiya), bosh sahifa — Dillerlar, Kategoriyalar, Xodimlar; portallar (2026-10-07)
- **Qarorlar (egasi tasdiqlagan):** diller yuborganda qarz **darhol** kamayadi, kassir pul kelmasa **rad etadi va qarz qaytadi**; pul Diller kassasiga (so'm — so'm kassasiga) tushadi va kassa yopishda Bosh kassaga o'tadi; 30-migratsiya — ruxsat berildi.
- **Diller pul yuboradi (30-migratsiya, yangi `dealer-pay` funksiyasi, `js/dealer-pay.js`):** diller portalida «Toʻlov» — naqd soʻm, karta yoki naqd $; soʻm **shu kungi kurs** (serverdagi kunlik kurs, diller kiritmaydi) bo'yicha dollarga o'giriladi va kurs qotiriladi; qarzdan ortiq — rad; qayta bosish takror yozmaydi. Admin: bosh sahifada (Dillerlar bloki), Bosh kassa, Kassalar va Dillerlar sahifalarida **bildirishnoma**; yangi to'lov kelganda xabar (har 60 s). «Qabul qildim» — pul tanlangan kassaga (valyuta mos, Shaxsiy kassa emas; $ — avval Diller kassasi), «Rad etish» — sabab bilan, qarz qaytadi (tarix o'chmaydi). Huquq: ko'rish — diller/kassa/Bosh kassa ko'rish huquqi; qabul/rad — `kassalar.transact` yoki `firma_kassa.transact`. Yangi ruxsat kalitlari yo'q.
- **Kassa yopish:** Diller kassasi endi kassa huquqi bor xodim/egasi uchun ro'yxatda (kun yakunida dillerlar puli Bosh kassaga); sotuvchiga — avvalgidek yo'q.
- **Bosh sahifa:** «Biznes holati» — 6 ta teng katak (Ombor, Yo'lda, Bizga qarz, Qarzim, Investorlar, Ta'sischilar), bir xil o'lchamdagi raqamlar ($1 000 dan kattasi butun dollar); sotuv kartochkasi raqamlari muvozanatlandi. Tezkor amallardan keyin keng **Dillerlar** bloki (qarzi, tovarlari, bu oy sotdi/to'ladi, eng katta qarzdorlar, kutilayotgan to'lovlar). **7 kunlik grafik olib tashlandi** — o'rniga **Kategoriyalar** va **Xodimlar** grafiklari (tanlangan davr: Bugun / 7 kun / Bu oy; chegirma hisobga olingan).
- **Sotuvchi va diller portallari:** yangi yuqori panel — avatar, kun vaqtiga mos salomlashish, **ikonkali** kun/tun va chiqish tugmalari (matnli «Chiqish» o'rniga); tablarda ikonkalar; «Menyu» — **barcha bo'limlar** bitta katakli oynada; pastki panel: sotuvchi — Qarzlar, Kassa, Savdo, Hisobot, Menyu; diller — Omborim, To'lov, Buyurtma, Savdolarim, Menyu; diller xulosasi telefonda 2×2 katak va «Pul yuborish» tugmasi.
- **Testlar:** P26 (4 — haqiqiy PostgreSQL + server; admin bildirishnomasi va bosh sahifa; diller portali), P8/P11 — 30-migratsiya. Dalil: `dealer-pay-real-postgres.js` (PG16, parallel) 8/8, `migration-chain-rehearsal.js` (24→30, verify 57/57).
- `package.json` — 23.8.0.

# Powerful PRO — v23.7: Bosh sahifa «Biznes holati» (foyda/ziyon), kassa yopish — sotuvchi ham, filiallar o'z hisobi bilan (2026-10-07)
- **Bosh sahifa — eng yuqorida «Biznes holati»:** biznes foyda qilyaptimi yoki ziyonmi — bitta kartochkada. **Natija = sof qiymat − kiritilgan pul** (investorlar + ta'sischilar). Sof qiymat = bor narsalar − qarzim. Bor narsalar: **ombordagi mahsulot** (faqat omborda bor, puli to'langan tovar, tannarxda — yo'ldagi, konsignatsiya va «ta'minotchidan sotiladi» kirmaydi), **yo'ldagi mahsulotlar**, dillerlardagi tovar, kassalar, Bosh kassa (Bazada), mijoz/diller/filial qarzlari. **Qarzim:** ta'minotchilarga qarz (+ filialda — Bazaga qarz). Bosilsa — har bir qator batafsil (bo'limga o'tish bilan) va «Bu oy» sof foydasi.
- **Sotuv kartochkasi:** Bugun / 7 kun / Bu oy almashtirgich; **sof foyda (foyda − xarajat)** alohida qator. «Kun yakunida ayirboshlash» — o'zgarmadi.
- **Kassa yopish (avval «Kunlik hisob»):** yangi ikonka (kassa apparati); pul **asosiy kassaga — Bosh kassaga** topshirilishi aniq yozilgan; **Shaxsiy (avval «Powerful kassa») va diller kassasi ro'yxatda yo'q** — ular savdo kassasi emas. Har kassa: qoldiq, bugungi kirim/chiqim, «Hammasi», kassada qoladigan summa. Bugungi kun: savdolar, tushum (naqd/karta/$), qarzga sotilgan, undirilgan qarz, xarajat; **foyda va sof natija faqat egasiga** (yoki hisobot huquqi bor xodimga). Tarix — vaqt, kim, izoh bilan.
- **Sotuvchilar kassani yopadi (egasi so'ragan):** `firma-kassa` → `daily_close` endi `savdo.create` huquqi bilan ham ishlaydi — faqat **o'z filiali**, faqat savdo kassalari (Shaxsiy/diller kassasi — 403). Boshqa Bosh kassa amallari (qoldiqni ko'rish, filial qarzini to'lash, xarajat) sotuvchiga — avvalgidek yopiq.
- **Sotuvchi portali — yangi «Kassa» bo'limi:** «Mening kunim» (sotdim, cheklar, dona, qarz undirdim, qarzga berdim, to'lov turlari bo'yicha), **bu oy filialdagi o'rnim**, **mening qarzdorlarim** (bir bosishda undirish), **kassani yopish → Bosh kassa** (qayta bosish takror yozmaydi), kassa yopish tarixi. Foyda ko'rsatilmaydi.
- **Filiallar — o'z hisobi:** Biznes holati filialda faqat o'z ombori, kassalari, mijozlari, dillerlari, hamkorlari (investor/ta'sischi) bo'yicha; Bazaga qarz — «Qarzim»da; kassa yopishda Bosh kassaga topshirgan puli — filialning aktivi («Bosh kassaga topshirilgan»), ziyon sifatida ko'rinmaydi. Demo'da filialga kirish mumkin (parol ishorasi ko'rsatiladi: 1234), filialning o'z hamkori, mijozi, ta'minotchisi va kassa tarixi bor.
- **Testlar:** P25 (4 — haqiqiy PostgreSQL + server; admin oynasi; biznes holati hisobi; sotuvchi portali). Baza sxemasi **o'zgarmadi** (migratsiya yo'q).
- `package.json` — 23.7.0.

# Powerful PRO — v23.6: Brend (white-label), B2B hamkor tizimlar, hisobdan chiqarish, mahsulot kartochkasi (2026-10-07)
- **Qarorlar (egasi tasdiqlagan):** B2B — to'liq; «Firma kassasi» → **Bosh kassa**, filialdagi yopiq kassa → **Shaxsiy kassa**; mahsulot arxivi — ha; hisobdan chiqarish zarari — sof foydadan ayiriladi.
- **Brend (white-label):** firma nomi, shior va logotip `js/brand.js` + `assets/brand-logo.jpg` dan va ilovada Sozlamalar → «Brend va profil»dan (logotip bulutga yuklanadi). Menyu, kirish va yuklanish oynalari, bosh sahifa va sozlamalardagi doira (avval «E» harfi), chek, sotuvchi/diller portallari, brauzer belgisi va sarlavha — hammasi brenddan. Kodda firma nomi qattiq yozilmagan. Ko'chirma: `npm run brand -- --name … --logo …` va `docs/KOCHIRMA.md`.
- **B2B hamkor tizimlar (29-migratsiya, yangi `b2b`, `b2b-inbound` funksiyalari, `js/b2b.js`):** taklif kodi bilan ulanish, ikkala egasining tasdig'i va ruxsatlari, katalog (qoldiq, opt narx, «buyurtma bo'yicha» — omborda yo'q tovar), «+ katalogimga» (ta'minotchidan sotiladi belgisi bilan), buyurtma → tasdiq (soni/narxi) → jo'natma (FIFO) → sonini tekshirib qabul → qarzlar faqat qabul qilingan son bo'yicha → kelmaganini qaytarish; qayta yuborish; demo'da «Sharq Savdo» hamkori bilan to'liq ko'rsatilgan. Batafsil: `docs/B2B-HISOBDAN-CHIQARISH.md`.
- **Hisobdan chiqarish (Qaytarishlar bo'limida):** sabablar, davr, hujjatlar, bekor qilish; ombor va zarar — serverda (`stock-writeoff`); zarar sof foydadan ayiriladi.
- **Mahsulotlar:** ro'yxat (Tannarxda / Sotuvda, Barcha / Kam / Mavjud emas, ro'yxat yoki katakcha ko'rinish, narx tugmasi); kartochka (sotuv narxi, kirim narxi, marja, qoldiq, «Sotuv narxini o'zgartirish», «Arxivga», ma'lumotlar, Hafta/Oy/Yil, Grafik/Tarix/Audit/Qaytarishlar); bo'limli forma (asosiy, parametrlar, kategoriya, o'lchov birligi, narx va qoldiq — kirim orqali, rasmlar, tavsif, shtrix-kodlar — asosiy va qo'shimcha, skaner, kod yaratish; kod va shtrix-kod takrori rad).
- **Boshqa:** barcha so'm «1 000» ko'rinishida (kiritishda ham); Ta'minotchilar — Telegram, WhatsApp, WeChat va izoh; Qaytarishlarda mahsulot kodi/nomi bo'yicha qidiruv; Xarajatlar ikonkasi; diller demo — buyurtmalar ko'rinadi; portal bildirishnomalari pastki menyuni yopmaydi.
- **Testlar:** P23 (3 — ikki alohida PostgreSQL + haqiqiy server), P24 (3 — brauzer); P8/P11 — 29-migratsiya; P22 — raqam ko'rinishi. Dalil: `writeoff-b2b-real-postgres.js` 10/10, `migration-chain-rehearsal.js` (24→29, verify 55/55).
- `package.json` — 23.6.0.

# Powerful PRO — v23.5: Kichik oynalar 2.0, yozuvlar 90%, portallar (2026-10-06)
- **Yozuvlar 90%:** ilovaning standart matn o'lchami endi 90% (ixchamroq, ekranga ko'proq sig'adi). Sozlamalar → «Matn o'lchami»: 80–130%, foydalanuvchi tanlovi qurilmada saqlanadi. Admin, sotuvchi va diller portallarida bir xil.
- **Kichik oynalar (modal) — butun ilova bo'ylab:** telefonda pastdan chiquvchi varaq, kompyuterda markazda; sarlavha va tugmalar uzun formada ham ko'rinib turadi; sarlavhada rangli ikonka; har bo'lim o'z rangida (Mijozlar — ko'k, Ta'minotchilar — to'q sariq, Hamkorlar — binafsha, Dillerlar — havorang, Sotuvchilar — indigo, Kassalar — yashil, Xarajatlar — qizil va h.k.); belgilash katakchalari — kalitli kartochkalar; yozuvlar KATTA HARF emas.
- **Qayta shakllantirilgan oynalar:** mijoz / ta'minotchi / hamkor / diller / xodim qo'shish va tahrirlash (shaxs kartasi: qarz, tezkor «To'lov» va «Tarix»; bo'limlar; «Qarz tuzatish» alohida va izohli), mijoz / ta'minotchi / diller to'lovi (kassa — qoldig'i ko'rinadigan kartochkalar, «Hammasi / 50% / 25%», to'lovdan keyin qoladigan qarz, qarzdan oshsa ogohlantirish), kassa kirim/chiqim/ko'chirish (kassa qoldig'i), xodim va diller paroli (yashirin + kuchli parol yaratish).
- **Xavfsizroq to'lov kiritish:** kassa valyutasi almashtirilganda summa avtomatik o'sha valyutaga o'giriladi (avval so'mdagi son $ kassasi tanlanganda o'zgarmay qolardi). Server tekshiruvlari o'zgarmagan.
- **Portallar:** diller — ombor (qidiruv, rasm, qoldiq belgisi, jami qiymat), «Sotdim» oynasi (± tugmalar, jami summa); sotuvchi — mijoz qarzini qabul qilish oynasi (valyuta o'girish, tezkor summa, qolgan qarz); tungi rejimda oq maydonlar tuzatildi.
- **Tuzatildi:** ta'minotchini tahrirlashda «Mamlakat» qiymati HTML'ga ekranlanmasdan qo'yilardi.
- **Testlar:** P22 (6 ta, mutatsiya bilan tekshirilgan), P4 — 90% standart o'lcham testi; P4 joylashuv testlari 100% da o'lchanadi (izohli); P14 — kassa tanlash kartochka orqali (tekshiruvlar o'zgarmagan). Baza, server va biznes qoidalari **o'zgarmadi** (migratsiya yo'q).
- `package.json` — 23.5.0.

# Powerful PRO — v23.4: Firma kassasi — asosiy kassa; Bosh sahifaning 4 kartochkasi (2026-10-06)
- **Qaror (egasi tasdiqlagan):** «uyga berish» puli tizimdan chiqmaydi — Firma kassasiga o'tadi; har filial o'z kassalariga ega va asosiy kassaga pul yuboradi; xarajat, kirim, ta'minotchi va hamkor to'lovlari Firma kassasidan qilinishi mumkin. Batafsil: `docs/FIRMA-KASSA-ASOSIY.md`.
- **28-migratsiya (yangi, qo'llanmagan):** `supabase-migration-28-firma-kassa-asosiy.sql` — Firma kassa jurnaliga `expense`, `supplier_payment` amallari; `firma_supplier_pay` (kassa + qarz bitta tranzaksiyada), `firma_kassa_reverse_expense`; umumiy bekor qilish xarajat/ta'minotchi to'lovini rad etadi. Additive, idempotent, faqat `service_role`.
- **Server:** `firma-kassa` — yangi amallar `daily_close`, `expense`, `expense_reverse`, `supplier_pay` (ikki bosqichli ruxsat, 28 siz — 409).
- **Brauzer:** Kunlik hisob → «Firmaga topshirish» (har kassa alohida, barqaror kalit bilan — qayta bosish takror yozmaydi); xarajat formasi va ta'minotchi to'lovida «🏛 Firma kassasi»; Firma kassadagi xarajatni o'chirish/tahrirlash qoidalari; ta'minotchi tarixida Firma kassa to'lovlari.
- **Bosh sahifa:** 4 kartochka (Qoldiq, Qarzlar, Tushumlar, Xarajatlar) — namuna rasmlardagidek alohida oynalar (davr, amallar, ro'yxat). «Qoldiq» endi ombor qoldig'i (tannarxda); pul qoldig'i — Kassalar → «Jami pul» (Firma kassasi bilan).
- **Testlar:** P21 (4), P16 kunlik yopish yangi qoidaga moslandi, P8/P11 — 28-migratsiya. Dalil: `firma-kassa-real-postgres.js` 11/11, `migration-chain-rehearsal.js` (24→28, verify 50/50). Jami 164/164.
- `package.json` — 23.4.0.

# Powerful PRO — v23.3: Onlayn-do'kon moduli va sahifalarni qayta shakllantirish (2026-10-06)
- **Onlayn-do'kon (yangi sahifa `dokon`, `js/dokon.js`):** do'kon kartasi (havola, Ochish/Nusxalash/Ulashish, holatlar), sozlamalar (yoqish, nom, slug, tavsif, aloqa, valyuta, yetkazib berish, joylashuv/xarita), bannerlar (≤5, 2:1, ~70 KB, Storage), chegirma (≤20, faqat vitrina narxi), Telegram bot ulash (token faqat serverda), statistika, buyurtmalar (holatlar, qidiruv, qo'lda buyurtma, bekor qilish sababi, tarix), «Sotuvga o'tkazish» — mavjud server checkout orqali va savdo bilan bog'lanadi, sharhlar, xaridor ko'rinishidagi vitrina (sinov buyurtmasi). Batafsil: `docs/ONLAYN-DOKON.md`.
- **Server:** `appDataGuard` — `shop` kaliti uchun huquqlar (sozlama — `sozlamalar.edit`, buyurtma — savdo huquqlari), buyurtma/sharh o'chirilmaydi (ID bo'yicha birlashtirish), banner faqat https; `shopBotToken` maxfiy kalit. Yangi `netlify/functions/shop-bot.js`. Baza sxemasi **o'zgarmadi** (migratsiya yo'q).
- **Sahifalar qayta shakllantirildi (bir xil tuzilma: hero → asosiy amal → tezkor amallar → qidiruv/filtr → kartochkalar):** Mijozlar, Ta'minotchilar, Kassalar, Ombor, Qaytarishlar, Hamkorlar, Dillerlar, Firma kassasi, Xarajatlar, Rollar; Savdo — bugungi ko'rsatkichlar va onlayn buyurtma qatori; sotuvchi portali (savdo, qarzlar) va diller portali (xulosa). Funksiyalar, ID'lar va server chaqiruvlari o'zgarmagan.
- **Tuzatildi:** partiyani o'chirish tugmasi raqamli ID'da «topilmadi» qaytarardi; kassalar sahifasida yashirin (Powerful) kassa kartochkasi huquqsiz xodimga ham chiqardi; chek raqami (`inv`) HTML'ga ekranlanmasdan chiqardi (savdo/statistika); sotuvchilar va rollar sahifasida telefonda gorizontal siljish; bottom-sheet yopilish animatsiyasi yangi oynani tozalab yuborishi; Telegram tokenlari qurilma xotirasiga yozilmaydi.
- **Testlar:** P20 (6 ta, mutatsiya bilan tekshirilgan); P2 XSS testi yangi kartochka belgilanishiga moslandi (tekshiruvlar o'zgarmagan). Jami 160/160.
- `package.json` — 23.3.0.

# Powerful PRO — v23.2 F4b FINAL FIX: qarz va ombor qoldig'i — server haqiqiy manba (2026-10-06)
- **27-migratsiya (yangi, qo'llanmagan):** `supabase-migration-27-f4b-ledger-authority.sql` — o'zgarmas jurnallar (`customer_debt_ledger`, `supplier_debt_ledger`, `stock_ledger`, `ledger_ops`), qoldiqlarni faqat jurnal orqali o'zgartiruvchi triggerlar, savdo hujjati (`sales.local_id`), `sale_checkout_atomic_v3`, `sale_return_atomic`, `sale_void_atomic`, `sale_edit_atomic`, `stock_debt_op`, `cash_payment_atomic_v2`, `app_data_save_main`; JSON'dan boshlang'ich ko'chirish. Additive, idempotent.
- **Server:** yangi `sale-ops`, `stock-debt-ops`; `sale-checkout-atomic` (v3), `cashbox-ops` (qarz bazada qulf bilan; 27 dan keyin eski `sale`/`sale_fix` — 409), `app-data-load/save/branch-save` (qarz, ombor, savdo summalari — bazadan), `batches-shadow-sync` (27 dan keyin yozmaydi), `catalog-full-sync` (bazadagi qoldiq). Umumiy modul — `_lib/ledgerAuthority.js`.
- **Brauzer:** admin va sotuvchi portali — savdo, qaytarish, tahrir, o'chirish, to'lov, kirim, import, boshlang'ich qoldiq, partiya tahriri/o'chirish/"keldi", reviziya, filialga ko'chirish, dillerga jo'natish/qaytish — server amali; qarz va qoldiq faqat server javobidan. Sotuvchi savdosi endi `sale-checkout-atomic` orqali (avval SQL omborga tegmasdi). Tarmoq uzilsa — xuddi shu kalit va ID'lar (takror yozilmaydi).
- **Testlar:** P19 (7), P14 F4b E2E; dalil skriptlari `f4b-real-postgres.js`, `f4b-old-client-negative.js`; `migration-chain-rehearsal.js` va boshqalar 27 bilan. Jami 154/154.
- **Hujjatlar:** `docs/F4B-INVENTAR.md` (yozish yo'llari → server), `DEPLOY.md` (24→25→26→27, F5 majburiy, 1b tekshiruv), `AUDIT-HISOBOT.md`, verify SQL — 46 ta tekshiruv.
- `package.json` — 23.2.0. Biznes qoidalari o'zgartirilmadi (saqlanganlari — `AUDIT-HISOBOT.md` 4-bo'lim).

# Powerful PRO — v23.1 FINAL GATE (2026-10-02)
- **Tuzatildi:** sahifa qayta yuklanganda xarajatlar tarixidagi kategoriya nomi (admin va sotuvchi portali) serverdan kelgan joriy nom bilan yangilanadi; `.then(exCatRefresh)` argument xatosi.
- **Yangi test:** P18 — rollar matritsasi (9 rol + 401/403, 11 amal, boshqa filial, Telegram/PIN, brauzer kalitlari); P14 — admin kategoriyalari real HTTP orqali va 26-migratsiyasiz holat. Jami 146.
- **Dalil skriptlari:** `migration-chain-rehearsal.js` (production sxemasi nusxasida 24→25→26, `psql -1`), `financial-matrix-real-postgres.js`, `f4b-gap-evidence.js`.
- **Hujjatlar:** `docs/F4B-INVENTAR.md`; `DEPLOY.md` — migratsiyani bitta tranzaksiyada qo'llash va migratsiyalar orasidagi holatlar jadvali; `AUDIT-HISOBOT.md` — FINAL GATE.
- `package.json` versiyasi: 23.1.0.
- Baza sxemasi, moliyaviy qoidalar va ruxsatlar **o'zgarmadi**.

# Powerful PRO — v23.1: xarajat kategoriyalari — foydalanuvchi yaratadi, serverdagi yagona manba (2026-10-02)
Oldingi oraliq yechim (kategoriyalar filial JSON'ida, `expenseCats`) deploy qilinmagan edi va **almashtirildi**: endi yagona manba — SQL jadval.
- **26-migratsiya (yangi, qo'llanmagan):** `supabase-migration-26-expense-categories.sql`.
  - Jadval `expense_categories`: `id`, `filial`, `turi` (dokon/tasischi/hamkor), `name`, `name_key` (generated), `is_active`, `created_at`, `updated_at`, `created_by` (FK → staff, on delete set null), `created_by_name`, `updated_by_name`, `deactivated_at`, `deactivated_by_name`, `idem_key`.
  - Faol nomlar noyob (filial+tur), katta-kichik harf va apostrof turi farqsiz.
  - Idempotent yaratish, CHECK cheklovlari, RLS, brauzerga yopiq. Baza UTF8 bo'lishi shart.
- **Server:** yangi `netlify/functions/expense-categories.js` (`list` / `create` / `rename` / `remove`).
  - JWT, RBAC (mavjud ruxsatlar), filial chegarasi.
  - Nom normallashtirish: NFC, bo'shliqlar, 1–60 belgi, boshqaruv belgisi yo'q. Takror → 409.
  - Ikki marta bosish (bir xil kalit) → o'sha kategoriya qaytadi.
  - O'chirish: ishlatilgan bo'lsa nofaol bo'ladi, aks holda o'chiriladi.
  - 26-migratsiyasiz → aniq 409.
- **Mijoz:**
  - Barcha qotirilgan xarajat kategoriyalari olib tashlandi (do'kon, ta'sischi, hamkor; admin va sotuvchi portali). "Boshqa" ham default emas.
  - "+ Kategoriya qo'shish" oynasi: nom, Saqlash/Bekor qilish, Enter/Escape, belgilar hisoblagichi, yuklanish/xato/muvaffaqiyat holatlari. Tarmoq xatosida "saqlandi" deyilmaydi.
  - "⚙️ Kategoriyalar" oynasida nomni o'zgartirish va o'chirish (tasdiq bilan).
  - Xarajat kategoriyaga ID bilan bog'lanadi (`catId` + o'sha paytdagi nom `cat`). Ro'yxat va hisobotda joriy nom ko'rinadi.
  - Xarajatni tahrirlashda kategoriya ro'yxatdan tanlanadi.
- **Tizim yozuvlari:** ilova avtomatik yaratadigan xarajat turlari (qaytarish zarari, hamkor ulushi, oylik, ijara) endi `sysType` bilan belgilanadi. Matnlar bitta joyda (`FW_SYS_EXPENSE`) va foydalanuvchi tanlaydigan kategoriya emas. Eski yozuvlar nomi bo'yicha taniladi.
- **Qo'shimcha:** oylik to'lovida (admin va sotuvchi) kassa tanlanmasa endi yozilmaydi (fail-close).
- **Testlar:**
  - P17 qayta yozildi — 4 ta, 20 talabni qamraydi; HAQIQIY server funksiyasi + PostgreSQL.
  - P14 (to'liq stek): sotuvchi kategoriya yaratadi, sahifa qayta yuklanadi, kategoriya joyida.
  - P3 va P8/P11 yangilandi.
  - Jami 143/143. Haqiqiy PostgreSQL 16 dalili: kategoriyalar 7/7.
  - UI audit: 728/728 (6 desktop o'lchami + 1536). Smoke: 117/117.

# Powerful PRO — v23: to'liq tuzatish va mustahkamlash (2026-10-02)

Asos: v11-FINAL. To'liq hisobot — `AUDIT-HISOBOT.md` (21 bandli yakuniy jadval).
- **25-migratsiya (yangi, productionda qo'llanmagan):**
  - Firma kassa: manba (`source_type`/`source_ref`), teskari yozuv bilan bekor qilish (`firma_kassa_reverse`), boshlang'ich qoldiq (`opening`).
  - Ikkala kassa jurnali o'zgarmas (UPDATE/DELETE trigger bilan rad etiladi).
  - `branch_firma_loan`: filial Bazadan pul qarzi oladi yoki qaytaradi. Ikki jurnal bitta tranzaksiyada; qarzdan ortiq qaytarish rad etiladi.
  - `firma_kassa_branch_summary`: filiallarning tovar va pul qarzi.
  - `cash_payment_atomic`: mijoz, ta'minotchi va diller to'lovi hamda "uyga berish" — kassa harakati va yozuv bitta tranzaksiyada. Diller qarzi qatori qulflanadi; qarzdan ortiq to'lov rad etiladi.
  - **Topilgan production xatosi:** `customer_debt_payments.customer_local_id` va `supplier_payments.supplier_local_id` ustunlari `integer` edi, ilova ID'lari esa ~1.7e15. Har bir to'lov yozuvi yiqilgan, brauzer xatoni yutib yuborgan. Ustunlar `bigint` qilindi.
  - `dealer_payments.idem_key` qo'shildi (unique).
  - Ruxsatlar: hamkor, `bot_sessions`, `login_security` jadvallari va `login_*` funksiyalari anon/authenticated'dan olindi; diller jadvallariga brauzerdan yozish yopildi.
  - SQL hamkor jadvallari "ESKIRGAN" deb belgilandi (haqiqiy manba — JSON).
- **Server:**
  - `cashbox-ops`: to'lov turlari uchun `record` majburiy. Qarzdan ortiq to'lov server ma'lumoti bo'yicha rad etiladi. 25-migratsiyasiz diller to'lovi qabul qilinmaydi (409).
  - Eski `cashbox-transact` va `*-payment-add` endpoint'lari 24-migratsiyadan keyin 410 qaytaradi (jimgina yozuv yo'q). Eski sxemada katta ID → aniq 409.
  - `firma-kassa`: `branch_loan_give` (Firma kassa huquqi), `branch_loan_repay` (kassir ham), `reverse` va `opening` (faqat admin), `branch_summary` (xodim faqat o'z filialini ko'radi), `reconcile` (Kirimga bog'lanmagan to'lovlar).
  - Telegram tokeni hech kimga yuborilmaydi; yangi `telegram-test` (faqat admin) sinov xabarini serverdan yuboradi.
  - `appDataGuard`: hamkorlarni filial bo'yicha cheklaydi; adminning ommaviy o'chirishi jurnalga yoziladi.
- **Mijoz (brauzer):**
  - Fail-close ishlaydi: `payDebt`, `paySupplierDebt`, `doDealerPay`, `doKunlikHisob`, `doKassaOp`, `svConfirmPay` va qaytarish tekshiruvi. Server xatosi yoki tarmoq uzilsa, hech narsa o'zgarmaydi.
  - "Uyga berish" qoldiqdan ortiq summani endi rad etadi (avval jimgina qisqartirardi).
  - Kassasiz xarajat yozilmaydi.
  - Diller qarzi server javobidan olinadi.
  - Kirim → Firma kassa to'lovi partiyaga `K-...` havolasi bilan bog'lanadi (`batches[].fkRef`). Qayta urinishda o'sha kalit ishlatiladi.
  - Firma kassasi sahifasi: manba, bekor qilish, boshlang'ich qoldiq, filiallar qarzi jadvali, bog'lanmagan to'lovlar ogohlantirishi.
  - Kassalar sahifasi (filialda): "Baza bilan hisob-kitob" — tovar va pul qarzi, qarz olish va qaytarish.
  - **Hamkorlar har bir filialda alohida** (egasining qarori). Eski yozuvlar Bazaniki bo'lib qoladi.
  - Telegram sozlamasida token ko'rsatilmaydi.
  - "Hammasini 0 qilish" — faqat egasi.
- **Testlar:** +16 (P15 — 9, P16 — 7) va 3 ta yangilangan test: P0.3, P10 F7, P13 F4-7. Jami 139/139.
  - Yangi testlar v11-FINAL kodida 0/16.
  - Haqiqiy PostgreSQL 16 (v23): 6/6; eski F4/B7 dalili: 7/7.
  - UI audit: 588/588; smoke: 117/117.
- **Qoldi:** production'da 24/25 + deploy (ruxsat kerak); F4b (mijoz/ta'minotchi qarzi va ombor `sold` hali JSON'da); to'lovni bekor qilish UI yo'q.

# Powerful PRO — v11 / FINAL P1 GATE: F4 kassa qoldig'i server haqiqiy manba, B7 atomik (2026-10-02)

To'liq hisobot — `AUDIT-HISOBOT.md` (2a, 2b-bo'limlar).
- **24-migratsiya (yangi, qo'llanmagan):**
  - `cashbox_ledger` (o'zgarmas jurnal);
  - `cashbox_balances.currency`;
  - `_cb_move`, `cashbox_apply_ops`, `branch_firma_transfer`, `_cb_balances_map`;
  - jurnalsiz qoldiq o'zgarishini to'suvchi trigger;
  - `sale_checkout_atomic_v2` kassaga jurnal orqali yozadi;
  - JSON qoldiqlari bir marta "opening" sifatida ko'chiriladi.
- **Server:**
  - yangi `cashbox-ops` (amal turi bo'yicha RBAC, qiymat yaratilmaydi, kurs ±25%);
  - `app-data-save`/`app-data-branch-save` brauzer yuborgan `bal`ni bazadagi qiymat bilan almashtiradi va jurnalga yozadi;
  - `app-data-load` qoldiqni bazadan beradi;
  - `sale-checkout-atomic` javobida haqiqiy qoldiq;
  - `firma-kassa`: `branch_pay` (yangi), `branch_in`/`branch_out` — atomik.
- **Mijoz:**
  - `fwCashOps` — 36 ta `box.bal` o'zgartirish joyi server amaliga o'tkazildi (fail-closed, qayta urinishda o'sha kalit);
  - "Bazaga to'lov" — Firma kassaga, USD yoki UZS, natija serverdan.
- **Biznes qoidalari (talab bo'yicha):**
  - filial kassasi manfiyga tushmaydi;
  - qarzdan ortiq to'lov rad etiladi;
  - qoldig'i bor kassani o'chirib bo'lmaydi;
  - aralash to'lovda kassaga savdodan ortiq pul yozilmaydi.
- **Testlar:** +13 (P13 — 11, P14 — 2), jami 122/122. Yangi testlar v9 va v10-FINAL'da 0/11. Haqiqiy PostgreSQL 16 parallel dalili 7/7. UI 480/480, smoke 117/117.
- **Qoldi:** production'da sinash (migratsiya + deploy ruxsati), F4b (qarzlar/ombor JSON'da).

# Powerful PRO — P10 / v10-FINAL: to'liq audit, tuzatishlar, Firma Kassa (2026-10-01)

To'liq hisobot — `AUDIT-HISOBOT.md`. Qisqacha:
- **Server (19 tuzatish):**
  - F1 — admin hisobini egallash yopildi;
  - F2 — savdo pul parametrlari validatsiyasi;
  - F5 — idempotency "avval band qil";
  - F6 — diller to'lovi ishlamasdi;
  - F7 — maxfiy sozlamalar xodimdan yashirildi;
  - F8/F11/F12/F3 — validatsiya;
  - F9 — RBAC'da o'z-o'zini ko'tarish yopildi;
  - F15 — audit jurnalini o'chirib bo'lmaydi;
  - B9 — admin joriy filialda savdo qiladi.
- **Mijoz:**
  - B1/J13 — sotuvchi portali savdolarni o'chirmaydi, filial to'g'ri;
  - B2 — 2 marta bosish = 1 savdo;
  - B3 — bank haqi 1 marta;
  - B4 — qaytim kassaga yozilmaydi;
  - B5 — "skidka" qarzga aylanmaydi;
  - B6 — ko'chirishda kurs;
  - B8 — qaytarish ikki barobar emas;
  - B13 — Excel import bank haqi va qarz;
  - B15 — ayirboshlash yarim bajarilmaydi;
  - J1/J2 — filial xodimi ilovasi ochiladi;
  - J4/J5/J9 — XSS;
  - J7 — PIN o'zgartirish qaytdi;
  - U1 — yopilgan oyna ekranni to'sib qolardi;
  - U2/U3 — mobil.
- **Firma Kassa (yangi):**
  - 23-migratsiya — jadvallar, atomik funksiyalar, ruxsatlar;
  - `firma-kassa.js` server funksiyasi;
  - Moliya → "Firma kassasi" sahifasi;
  - Kirim'da "Firma kassasidan" to'lov (fail-closed).
- **Baza (23-migratsiya):** diller qarzi va ballari serverda hisoblanadi (J3); hamkor funksiyalari faqat server.
- **Testlar:** +19 (P10 mock-DB server, P11 haqiqiy PostgreSQL, P12 haqiqiy Chromium), jami 109/109. UI audit — 12 o'lcham × 40 holat = 480/480.
- **Qoldi (qaror kerak):** F4 (app_data balanslari), B7 (filial → Baza to'lovi), ikki manba muammosi — `AUDIT-HISOBOT.md` 7-bo'lim.

# Powerful PRO — P9 / v10: baza tuzatishlari (2026-10-01)

> AZIMSHER tasdiqladi: hamkor funksiyasi xatosi, rasm saqlagichi himoyasi, diller katalogiga rasm.
> Hammasi `supabase-migration-22-v10-fixes.sql` da (bir marta, SQL Editor'da). Ma'lumot o'chmaydi.

1. **`partner_upsert_atomic` tuzatildi.** `jsonb_set(..., updated_at = now())` qavs xatosi:
   4-argumentga taqqoslash natijasi ketardi — bo'sh blokda birinchi hamkor JSON'ga yozilmasdi,
   `app_data.updated_at` hech qachon yangilanmasdi. Ledger/foiz mantiqi o'zgarmadi.
   Xato eski funksiyada qayta ishlab chiqarilib isbotlandi (natija `{}`), yangisida — to'g'ri.
2. **Rasm saqlagichi (`product-images`) himoyalandi.** Yuklash/o'zgartirish/o'chirish endi faqat
   **faol xodimga** (`private.is_active_staff()`, security definer, `search_path=''`). Tizimga
   kirmagan foydalanuvchi, diller va o'chirilgan xodim — rad etiladi. Ko'rish ochiq qoladi.
   Production'da tekshirildi: anon yuklagan 202 rasm 9-avgustgacha; keyingilari — xodimlar.
3. **Diller katalogida mahsulot rasmi.** `catalog_products.image` (faqat `https://`, ≤1000 belgi —
   CHECK cheklovi). `catalog-full-sync` galereyaning 1-rasmini yozadi (data:/blob: — yo'q).
   Diller portali: buyurtma ro'yxatida 40px rasm, statistika reytingida rasm.
   Ustun hali yo'q bazada sinxronlash avtomatik rasmsiz davom etadi (deploy tartibi muhim emas).
4. `supabase/schema.sql` yangi holatga keltirildi: eski sxema + 22-migratsiya = yangi sxema (1:1).
5. Testlar: +6 (P9), jami **90/90**.

# Powerful PRO — P8: Loyihani noldan ko'tarish mumkin (2026-10-01)

> AZIMSHER talabi: "loyihaning o'zi deploy qila oladigan qilib, 0 dan tersam qanday bo'ladi —
> nimalar kam, to'ldiraylik". Ilova funksiyalari, biznes qoidalari, production bazasi
> O'ZGARMADI (bazadan faqat o'qildi).

## Nimalar yetishmas edi
1. **Baza sxemasi repo'da to'liq yo'q edi** — 20–27-migratsiyalar, hamkorlar v2, login
   xavfsizligi, `sale_checkout_atomic_v2` va boshqalar bazaga to'g'ridan-to'g'ri qo'llangan,
   fayl sifatida yo'q. Yangi bazani qayta qurib bo'lmas edi.
2. Supabase manzili/kaliti 3 ta JS faylga qattiq yozilgan — yangi loyihaga ulash uchun kod
   tahrirlash kerak edi.
3. Birinchi administratorni yaratish imkoni yo'q edi (xodim yaratish funksiyasi o'zi admin talab qiladi).
4. Deploydan keyin "hammasi ulanganmi?" degan tekshiruv yo'q edi.
5. Netlify `publish = "."` — SQL migratsiyalar, ichki hujjatlar, testlar ochiq internetda turardi.
6. CI/CD (avtomatik test + deploy) yo'q edi; `ornatish.md` eskirgan va xavfli ("hamma yoza oladi" RLS).

## Qo'shildi
- `supabase/schema.sql` — production'dan faqat o'qib olingan to'liq sxema: 33 jadval, 90 cheklov,
  76 indeks, 13 funksiya (15 variant), 3 view, 22 RLS siyosat, ruxsatlar (P2 holati), saqlagich,
  RLS-avto trigger, rollar/ruxsatlar (132 bog'lanish). Har bir bo'lim production bilan **md5
  orqali 1:1** solishtirildi. Idempotent (qayta ishga tushirish xavfsiz).
- `js/config.js` + `npm run setup` — sayt qaysi Supabase'ga ulanishi bitta faylda; **service_role
  yoki secret kalit rad etiladi** (brauzerga tushmasin). Fayl bo'lmasa — production qiymatlari.
- `npm run create-admin` — birinchi administrator (Auth + staff 'admin' + "Korxona egasi" roli),
  parol yashirin so'raladi, xatoda yarim holat qolmaydi.
- `netlify/functions/health.js` — `GET /.netlify/functions/health`: env, baza, sxema, rollar
  holati (faqat ha/yo'q, kalit/manzil chiqmaydi).
- `scripts/build.js` + `netlify.toml` (`publish = "dist"`): internetga faqat sayt chiqadi; build
  havolalarni, SRI va config.js'dagi kalit turini tekshiradi; xavfsizlik sarlavhalari.
- `scripts/check.js` (`npm run check`) — 5 soniyalik statik tekshiruv (sintaksis, require harf
  farqi, funksiyalar yuklanishi, havolalar, maxfiy kalit).
- `.github/workflows/ci.yml` — push/PR: check → build → testlar; `main`da (secretlar bo'lsa)
  Netlify deploy + `/health` tekshiruvi. `.env.example`, `.gitignore`.
- Testlar endi istalgan kompyuter/CI'da ishlaydi (Chromium yo'li moslashuvchan).
- `ornatish.md` — noldan o'rnatish qo'llanmasi (yangidan yozildi). `DEPLOY.md` yangilandi.

## Topilgan (production'ga ta'sir qilmaydigan) xato
- `partner_upsert_atomic()`: `jsonb_set(..., updated_at = now())` — qavs xatosi tufayli 4-argument
  `create_missing=false` bo'lib qolgan; bo'sh `app_data` da birinchi hamkor qo'shilmaydi.
  Production'da `partners` kaliti bor — ta'sir yo'q. Yangi o'rnatishda boshlang'ich blok
  `{"partners":[],"partnerPeriods":[]}` bilan yaratiladi. Funksiyaning o'zini tuzatish —
  moliyaviy funksiya o'zgarishi, alohida tasdiq bilan.

## Testlar
- Yangi `tests/p8-noldan-ornatish.test.js` — 6 ta: sxema bo'sh PostgreSQL'ga (PGlite) qo'llanadi
  va production sonlari/rollari bilan mos; yangi bazada savdo (FIFO, aralash to'lov, atomiklik),
  hamkorlar taqsimoti/bekor qilish, ruxsatlar; config kalit himoyasi; birinchi admin; health; build.

# Powerful PRO — P7: Oylik mahsulotlar reytingi + mahsulot rasmlari galereyasi (2026-10-01)

> Eng yangi bo'lim. AZIMSHER talabi: "7 kunlik statistika o'rniga Mahsulotlar reytingi —
> kunlik emas, 1 oylik: 1-sanadan kelgan kunigacha"; "Dillerlar va sotuvchilar panelida ham";
> "mahsulot rasmlari qo'shilishi kerak edi" (OmborX namunasi: 4 tagacha rasm, qirqish, ~40 KB).
> Hisob-kitob qoidalari va ruxsatlar o'zgarmadi. Mahsulot yozuviga ixtiyoriy `images` maydoni
> qo'shildi (app_data JSON ichida; jadval/migratsiya o'zgarmagan).

## Oylik mahsulotlar reytingi
- **Statistika**: bir kun (Bugun/Kecha/sana) tanlansa ham Dinamika "so'nggi 7 kun" o'rniga
  **oy boshidan** (1-sanadan tanlangan kungacha) ko'rsatiladi. Uning ostida sahifaning o'zida
  **Mahsulotlar reytingi** — oy boshidan: Eng yaxshi / Kam sotilgan / Sotuvsiz, rasmlar bilan.
  Tushum kartasidagi "Mahsulotlar reytingi" tugmasi shu kartaga olib boradi.
- **Sotuvchilar, Dillerlar, sotuvchi va diller portallari**: davrlar — Bugun / **Shu oy**
  (standart, 1-sanadan bugungacha) / O'tgan oy / Shu yil; "7 kun" olib tashlandi. "Shu oy"
  o'tgan oyning xuddi shu kunlari (1..N) bilan taqqoslanadi. Bir kunlik davrda grafik —
  soatlar bo'yicha.
- Har bir panelda yagona **Mahsulotlar reytingi** kartasi (`fwRankCardHtml`): Eng yaxshi /
  Kam sotilgan / Sotuvsiz (dillerlarda — "Turib qolgan", tannarxdagi qiymati bilan), mahsulot
  rasmi, sana oralig'i. Sotuvchiga foyda ko'rsatilmaydi.

## Mahsulot rasmlari (galereya)
- Yangi va tahrirlash formalarida **"📷 Mahsulot rasmi n/4"**: 4 tagacha rasm, bir nechtasini
  birdan tanlash, ★ asosiy qilish, × o'chirish, rasm ustiga bosib **kvadrat qirqish** (surish +
  kattalashtirish). Har bir rasm ~40 KB gacha siqiladi (JPEG). "Bekor" — hech narsa o'zgarmaydi;
  yuklash "Saqlash" bosilganda bo'ladi.
- Ma'lumot: `p.images = [havola…]` (≤4), `p.image = p.images[0]` — savdo, katalog, chek,
  eksport avvalgidek `p.image` dan foydalanadi. Fayllar Storage'da `p<pid>-g<vaqt>.jpg`.
  Oflayn rejimda avvalgidek ichki ko'rinishda saqlanadi; "Rasmlarni saqlagichga ko'chirish"
  galereya rasmlarini ham ko'chiradi.
- Mahsulot kartochkasida galereya chizig'i (bosilsa almashadi); Mahsulotlar ro'yxatida rasmlar
  soni belgisi. Kamera tugmasi asosiy rasmni almashtiradi, galereyaning qolganini saqlaydi.
- Xavfsizlik: rasm manzili faqat https/blob/data:image bo'lsa ko'rsatiladi (`fwImgSafe`).
- **Backend** `cleanup-duplicate-images`: mahsulot ishlatayotgan barcha fayllar (asosiy +
  galereya) "duplikat" deb o'chirilmaydi; mahsulotlar ro'yxatini o'qib bo'lmasa — hech narsa
  o'chirilmaydi. `uploadImageToStorage` ham galereya fayllarini tozalamaydi.
- Diller portali katalogida rasm ustuni yo'q (`catalog_products`), shuning uchun u yerda
  reytingda rasm o'rnida belgi ko'rinadi — ustun qo'shish DB o'zgarishi, alohida tasdiq kerak.

## Testlar
- Yangi `tests/p7-oylik-reyting-rasmlar.test.js` — 5 ta (oy boshidan reyting va dinamika,
  standart "Shu oy", galereya: bekor/siqish/4 chegara/asosiy rasm, formalar, backend tozalash).
  2 tasi eski kodda yiqilishi tekshirildi.
- `p6` testlari yangi davrlar va "Turib qolgan" nomiga moslandi (tekshiruvlar kuchaytirildi).
- `npm test`: **78 / 78 PASS**.

# Powerful PRO — P6: Sotuvchilar / Dillerlar / Filiallar statistikasi + planshet = telefon (2026-10-01)

> Eng yangi bo'lim. AZIMSHER talabi: "Filial, Dillerlar va sotuvchilar bo'limiga o'ziga kerak
> ma'lumot — qaysi mahsulot yaxshi/zo'r ketyapti, tugmalar va grafiklar"; "telefon va planshetda
> bir xil, kompyuterda o'zgacha". Ma'lumotlar bazasi tuzilmasi, hisob-kitob qoidalari, ruxsatlar —
> O'ZGARMADI. Barcha statistika faqat O'QIYDI.

## Asos: ikki versiya birlashtirildi
- Demo sahifada parallel sessiyadan yangiroq versiya bor edi (Kirim, Revizia, Sozlamalar,
  Mahsulotlar qayta qurilgan, mavzular, Statistika v3). AZIMSHER qarori: **birlashtirish** —
  o'sha versiya asos; unga testlar, backend va quyidagi tuzatishlar qo'shildi.
- `index.html`, `sotuvchi.html`, `diller.html`, `js/*`, `css/*` — yangi versiyadan (demo.js
  qatorisiz). `netlify/`, `tests/`, migratsiyalar — avvalgidek.

## Statistika (Hisobotlar) tuzatishlari — `sxData()` / `pgHisobot()`
- «Hisobotlar va chop etish» bloki (Excel / Qoldiq chop / Kartochka / Cheklar) va Excel tanlash
  oynasi (`sxExcelSheet`) olib tashlandi — foydalanuvchi talabi. Eksport funksiyalari kodda
  qoladi; «Tarix» Mahsulotlar sahifasida ishlaydi.
- **Qaytarish** summasi = omborga qaytgan partiya tannarxi + «Qaytarish zarari» (= xaridorga
  qaytarilgan sotuv narxi). Avval faqat tannarx edi ($38 o'rniga $52). Dinamikadagi «Qaytarish»
  ham shunday.
- Naqd kassa: «Savdo o'chirildi» / «Tahrirlash» harakatlari xarajat emas, naqd savdodan
  ayriladi; kassalar orasidagi o'tkazma (→/←/Ayirboshlash) sof holda alohida qatorda.
- Kirim: barcha tizim partiyalari (qaytarish, tahrir, o'chirish, boshlang'ich qoldiq…) chiqarildi.
- «Kecha» — td() (UTC) sanasidan bir kun oldin (yozuvlar sanasi bilan bir xil asos).
- Yangi: **Filiallar** kartasi — tanlangan davr uchun har bir filial: tushum, foyda, xarajat,
  cheklar, o'rtacha chek, ombor (tannarx), Bazaga qarz, eng yaxshi mahsulot. Faqat egasi
  Baza'dan kirganda ko'rinadi (filial paroli bilan kirgan foydalanuvchi boshqa filialni ko'rmaydi).

## Yangi statistika bo'limlari (umumiy komponentlar: `shared.js` → `fw*`, `design-system.css` → `fws-*`)
- **Admin → Sotuvchilar**: davr (7 kun / 30 kun / Shu oy / Shu yil), xodim tanlash chiplari,
  KPI (tushum, foyda+marja, cheklar+o'rtacha chek, dona) o'tgan davrga nisbatan ▲/▼ bilan;
  sotuvchilar reytingi (ulush, o'rtacha chek, o'sish); dinamika grafigi; mahsulotlar
  (tushum / dona / sotilmayotgan); to'lov turlari; faol soatlar. Har bir xodim qatorida 📈.
- **Admin → Dillerlar → 📈 Statistika** (yangi tab): KPI (sotuv, dona, to'lovlar+qarz, faol
  dillerlar), diller reytingi (o'sish, hudud, qarz), dinamika, mahsulotlar (tushum / dona /
  **sust — dillerlar omborida turib qolgan**), hududlar, pul oqimi (yuborildi / sotdi / to'ladi).
  Mavjud «Tahlil» tabi o'zgarmadi.
- **Sotuvchi portali → Hisobot**: «Mening statistikam» — o'z savdolari, o'sish, grafik, eng
  yaxshi / sotilmayotgan mahsulotlar (taklif qilish uchun), to'lov turlari, faol soatlar.
  Sotuvchiga tannarx/foyda ko'rsatilmaydi.
- **Diller portali → Savdolarim**: «Mening statistikam» — sotuv, dona, savdo kunlari, qarz/ball,
  grafik, eng yaxshi va omborda turib qolgan mahsulotlar. Statistika uchun o'z savdolari 1000
  tagacha yuklanadi (avval 100); ro'yxatda avvalgidek 100 ta.

## Qurilma rejimi: telefon = planshet, kompyuter alohida
- Mobil maket chegarasi 768px → **1024px** (admin), portallar 899px → **1024px**. Planshet
  (portret va landshaft) telefon bilan bir xil: pastki menyu, yon menyu yashirin, bir ustun;
  600–1024px'da kontent o'rtada 760px ustunda. ≥1025px — kompyuter maketi.
- Yuqori paneldagi Savdo/Hisobot tugmalarini yashirish qoidasi yangi `data-icf` atributini ham
  qamraydi.

## Testlar
- `tests/p5-statistika.test.js` — 9 ta (sxData: biznes qoidalari, naqd kassa, o'chirilgan savdo
  va naqd→karta o'tkazma, davrlar, kirim, faqat-o'qish, render: eksport tugmalari yo'q +
  `--border` regressiyasi, S.sx saqlanmasligi, format).
- `tests/p6-statistika-bolimlar.test.js` — 6 ta (yordamchilar, Sotuvchilar, Dillerlar, Filiallar
  ruxsati, sotuvchi va diller portallari; XSS va faqat-o'qish tekshiruvlari bilan).
- `tests/p4-responsive.test.js` — +3 ta (planshet 1024×768 va 820×1180 mobil maketda,
  1280px kompyuter, portallar planshetda). Eski testlar o'zgartirilmadi.
- `npm test`: **73 / 73 PASS**. Yangi testlarning 5 tasi eski kodda yiqilishi tekshirildi.

# Powerful PRO — P4: Qurilmaga moslashuvchan ko'rinish (kompyuter / planshet / telefon) (2026-09-30)

> Eng yangi bo'lim. AZIMSHER shikoyati: "Kompyuterda kirsangiz kompyuter versiyasi, telefonda
> kirsangiz telefon versiyasi o'tishi kerak edi — bunda chalkashliklar bor".
> Faqat CSS joylashuvi + bitta HTML o'ram. Biznes mantiqi, hisob-kitob, ma'lumotlar bazasi,
> ruxsatlar — O'ZGARMADI.

## Topilgan sabablar (Playwright bilan 390 / 768 / 1024 / 1440px'da o'lchab aniqlandi)
1. **Admin, telefon/planshet — 68px "arvoh" chekka.** `.sidebar.collapsed ~ .main-content
   {margin-left:68px}` (specificity 0,2,1) telefon uchun yozilgan `.main-content{margin-left:0}`
   (0,1,0) dan kuchli edi. Yon menyu birinchi kirishda standart holatda YIG'ILGAN bo'lgani uchun
   deyarli har bir telefonda kontent 68px o'ngga surilardi: sarlavha "Bosh s…" bo'lib kesilar,
   yuqori paneldagi tugmalar ekrandan chiqib ketardi (442px, ekran 390px).
2. **Admin, telefon — ikki xil navigatsiya.** Hamburger va pastki menyudagi "Ko'proq" aynan bir
   xil ish qilardi (dizayn tizimi 6-bo'limiga zid).
3. **Admin, telefon — yuqori panel to'lib ketgan.** 🛒 (Savdo) va 📊 (Hisobot) pastki menyuni
   takrorlardi.
4. **Sotuvchi va Diller portallari kompyuterda ham telefon ko'rinishida** — 480px ustun,
   ekranning 67% bo'sh.
5. Sotuvchi portali, telefon: 6 ta tab 5+1 bo'lib chiqardi. Kompyuter topbar'ida "Chiqish"
   o'ng chetga emas, ism yoniga yopishib turardi.

## Tuzatishlar
- `css/style.css` (oxiri): ≤768px'da `.sidebar.collapsed ~ .main-content` ham 0px; hamburger
  yashirin (navigatsiya — pastki menyu); ochiq yon menyu orqasida qorong'i fon (fonga bosilsa
  yopiladi — mavjud click-handler); yuqori paneldagi 🛒/📊 telefonda yashirin.
- `css/design-system.css` (oxiri, faqat `.dl-wrap` ichida — admin panelga ta'siri yo'q):
  portallar ≥900px'da 1180px keng; diller ko'rsatkichlari bir qatorda; ro'yxatlar 2 ustun
  (≥1280px — 3); sotuvchi savdo ekrani: chapda qidiruv+mahsulotlar, o'ngda savat+to'lov
  (yopishqoq); <900px'da 5+ tab teng 3 ustunli panjarada; topbar amallari o'ng chetda.
- `js/sotuvchi.js` → `svSaleHtml()`: faqat ikkita joylashuv o'rami qo'shildi
  (`.sv-sale-main` / `.sv-sale-side`). Barcha `id`, `onclick`, hisob-kitob — o'zgarmagan.

## Testlar
- YANGI: `tests/p4-responsive.test.js` — 6 ta test, haqiqiy index/sotuvchi/diller.html
  sahifalarini 390 / 768 / 1440px'da ochib o'lchaydi (tarmoqsiz, Supabase soxta).
  **Eski kodda 5/6 YIQILADI** ("hozir: 68px", "hozir: 480px"), yangisida 6/6 o'tadi —
  ya'ni testlar aynan shu xatolarni ushlaydi.
- Jami: **55/55 PASS** (eski 49 ta + yangi 6 ta). Hech bir eski test o'zgartirilmagan.

## Dizayn maketi
- Figma: "Powerful PRO — Responsive dizayn (kompyuter / planshet / telefon)" —
  Admin (1440/768/390), Sotuvchi (1440/390), Diller (1440/390) + breakpoint qoidalari.

---

# Powerful PRO — P3: Hamkor kirimi (pul qo'shish) — kechiktirilgan foyda-eligibility (2026-09-28)

> Eng yangi bo'lim. AZIMSHER talabi: hamkor/ta'sischi oy davomida hisobiga pul QO'SHSA
> (avvalgi bo'lim faqat yechib olishni — "chiqim"ni — hisobga olardi), bu yangi pul
> foyda taqsimotiga DARHOL emas, KECHIKTIRIB qo'shilishi kerak.

## Yangi qoida (AZIMSHER tasdig'i, so'zma-so'z misol bilan)
- Hamkor oyning **1–5-sanasida** pul qo'shsa → bu pul **KEYINGI oydan** boshlab foyda
  taqsimotiga qo'shiladi.
- Hamkor oyning **6-sanasi va undan keyin** pul qo'shsa → bu pul **undan KEYINGI oydan**
  (bir oy o'tkazib) boshlab foyda taqsimotiga qo'shiladi.
- Misol (AZIMSHERning o'zi bergan): 20.08.2026 da 1500$ qo'shildi → Sentabr oyi uchun bu
  1500$ HALI hisobga olinmaydi (band), Oktabr 2026 taqsimotidan boshlab hisoblanadi.
- Bu qoida — avvalgi "chiqimning yarmi hisoblanadi" qoidasidan FARQLI: yechib olingan pul
  o'sha oyning YARMI uchun ham foyda beradi (yumshoq), qo'shilgan pul esa yangi
  eligibility-oyigacha UMUMAN hisobga olinmaydi (qattiq) — chunki qo'shilgan pul hali
  "ishlamagan" yangi kapital, chiqim esa oy davomida ishlab turgan kapitalning bir qismi.

## Amalga oshirilishi (`js/main.js`)
- Xarajatlar → Hamkorlar bo'limiga **"Amal turi"** tanlovi qo'shildi: 💸 Chiqim (yechib
  olish, avvalgidek) / 💰 Kirim (pul qo'shish, yangi). Har ikkalasi ham bir xil
  `S.expenses` yozuvi (`turi:'hamkor'`), faqat `kind:'kirim'|'chiqim'` maydoni bilan
  farqlanadi (eski yozuvlarda `kind` yo'q — ular avtomatik "chiqim" hisoblanadi, orqaga
  moslik saqlangan).
- Kirim: hamkor hisobi (SUMMA) VA tanlangan kassa balansi **darhol oshadi** (chiqimda —
  ikkalasi ham kamayadi). Tahrirlash/o'chirish — ikkalasi ham to'g'ri teskari qaytariladi.
- `depositEffectiveMonth(sana)` — kirim sanasiga qarab, u qaysi oydan "band emas" bo'lishini
  hisoblaydi (1–5-sana → +1 oy, 6-sanadan → +2 oy).
- `partnersForMonth(oy)` endi shareBase'ni hisoblashda oldingi oy(lar)da qo'shilgan, lekin
  hali eligibility-oyi kelmagan kirimlarni ("band" — `pendingDeposits`) chiqarib tashlaydi.
  Joriy/keyingi oyda qo'shilgan kirimlar esa (avvalgidek) oy-boshi balansini tiklashda
  hisobga olinadi (ular hali balansning bir qismi bo'lmagan).
- "Hamkorlar" umumiy ro'yxatida va "Oyni hisoblash" oldindan ko'rish jadvalida **⏳ band**
  yorlig'i — qancha pul hali kutilayotgani va qaysi oydan boshlab hisoblanishi ko'rsatiladi.
- `partnerLedger()` (Hamkor tarixi) — kirim yozuvlarini endi to'g'ri **musbat (+)** va
  "💰 Kirim" deb ko'rsatadi (avval hammasi "💸 Xarajat" va manfiy ko'rsatilardi — bu ham
  shu ish jarayonida topilgan, alohida tuzatilgan bug edi).
- Dashboard'dagi "Oylik xarajatlar" ko'rsatkichi endi kirim yozuvlarini **xarajat deb
  hisoblamaydi** (aks holda hamkor puli qo'shilganda "xarajat oshgandek" ko'rinardi).

## Testlar (`tests/p3-hamkorlar.test.js`) — 6 ta yangi, jami 49/49 PASS
- Sana chegarasi (1–5 / 6+, yil chegarasidan o'tish) to'g'ri hisoblanishi.
- AZIMSHERning o'z misoli (20.08 → Sentabrda band, Oktabrdan hisoblanadi) — aniq raqamlar bilan.
- 1–5-sanada qo'shilgan kirim — keyingi oydayoq hisoblanishi.
- Kirim bekor qilinganda (tahrir/o'chirish) hamkor hisobi VA kassa asl holatga qaytishi.
- To'liq forma orqali (haqiqiy `addExpense()` funksiyasi) kirim qo'shilganda hisob/kassa
  KAMAYMAY, OSHISHI.
- Hamkor tarixida kirim musbat va "Kirim" deb belgilanishi.

---

# Powerful PRO — P3: Hamkorlar formulasi + mobil dizayn (2026-09-28)

> Eng yangi bo'lim. Paket P0 + P1 + P2 + P3 ning hammasini o'z ichiga oladi.

## Hamkorlar — nima buzilgan edi (production ma'lumotidan aniqlandi)
1. **"Bekor qilish" ishlamasdi.** Taqsimot faqat shu qurilmadan o'chirilardi, saqlashda
   bulutdagi nusxa bilan birlashtirilganda (mergeById) QAYTIB kelardi. 01.08–20.08
   taqsimoti 5 marta bekor qilingan, lekin har safar qaytgan. Hisoblar esa har safar
   taqsimotdan oldingi holatga qaytarilgan — natijada ro'yxat va hisoblar bir-biriga
   mos kelmay qolgan.
2. **Eski qurilma hisoblarni qayta yozardi.** Hamkor hisobi (invested) oddiy maydon
   sifatida birlashtirilardi — ochiq qolgan eski oyna saqlaganda yangi taqsimot
   natijasi o'chib ketardi.
3. **Ta'sischi belgisini olib tashlaganda 100% qolib ketardi** — Kozimjon holati:
   sentabr hisobida u $0 olgan, $800 ning hammasi ta'sischilarga ketgan.
4. "Mendan ulush" yozuvi tushunarsiz edi — kim necha foiz olishi ko'rinmasdi.

## Tuzatildi (`js/main.js`)
- `computePartnerDistribution()` — yagona sof formula (oldindan ko'rish ham, saqlash ham shundan).
- "Oylik hisoblash" oynasida **saqlashdan oldin jadval**: har bir hamkor — hisobi, ulushi %,
  foyda ulushi, ta'sischilarga qoladigan qism, oladi, yangi hisob.
- **Ta'sischilar alohida %** (AZIMSHER tasdiqlagan): hamkor tahririda "Ta'sischilar o'rtasidagi
  ulushi (%)". Yig'indi 100% bo'lmasa hisoblash bloklanadi. Hech biriga kiritilmasa — teng (avvalgidek).
  Ta'sischi xarajatlari ham shu ulushda ayiriladi.
- Oddiy hamkor uchun maydon endi: "Ta'sischilarga qoladigan qism (%)" + jonli izoh
  ("Hamkor 70%ini oladi, 30%i ta'sischilarga qoladi"). Kartada "Foydasidan oladi / ta'sischilarga".
- Bekor qilish: faqat shu taqsimot qo'shgan summani ayiradi (keyingi xarajatlar saqlanadi) +
  tombstone (boshqa qurilmadan qaytib chiqmaydi).
- Sinxronlash: hamkor hisobi kassa balansi kabi delta bilan birlashtiriladi; ism/% — `updatedAt`
  bo'yicha yangirog'i. Taqsimotlar eng so'nggisi birinchi tartiblanadi.
- Ustma-ust tushadigan davr uchun ogohlantirish (foyda ikki marta taqsimlanmasin).
- `js/sotuvchi.js` endi hamkorlar ma'lumotini umuman yubormaydi.
- Foyda manbai — **faqat Baza** (AZIMSHER qarori, o'zgarmadi).

## Production ma'lumoti (AZIMSHER tasdig'i bilan, 2026-09-28 — ALLAQACHON bajarilgan)
- Bekor qilingan 2 ta taqsimot (01.08–20.08 va 31.08–27.09) olib tashlandi + tombstone.
- Kozimjon: ta'sischilarga qoladigan qism 100% → 0% (o'z ulushini to'liq oladi).
- Oldingi holat nusxasi `staff_audit_log`da saqlangan (action = `partner_data_cleanup_backup`).
- Hisoblar o'zgartirilmadi: AZIMSHER $0, ABDULAZIZ $0, Kozimjon $2 000. SARDOR 15.09'da
  o'chirilgan — tiklanmadi.

## Oylik taqsimot ko'rinishi (AZIMSHER talabi, 2026-09-28)
- "📊 Oyni hisoblash": sana oralig'i o'rniga **oy** tanlanadi (1-kundan oxirgi kungacha). Standart —
  o'tgan oy (yopilmagan bo'lsa), aks holda joriy oy.
- Hisoblangan oy **yopiladi**: o'sha oyni ikkinchi marta hisoblab bo'lmaydi (tugma o'chadi, ogohlantirish chiqadi).
- Hamkorlar sahifasida **"📅 Oylik taqsimotlar"** ro'yxati: har bir oy — `01.08.2026  Avgust 2026  $530.00  🖊 🗑 🖨`,
  tagida har bir hamkor qancha olgani. Eski oylar 🔒 "yopilgan" (faqat chop etish).
- 🖊 Tahrirlash va 🗑 o'chirish — faqat **oxirgi** oyda (buxgalteriya qoidasi: oldingi oyni o'zgartirsangiz,
  keyingi oylarning foizlari noto'g'ri bo'lib qoladi). Tahrirda hisoblarga faqat farq qo'shiladi,
  foizlar o'sha oydagi hisoblar asosida qoladi.

## Foyda uchun hisob — oy davomidagi chiqimlar (AZIMSHER qoidasi, 2026-09-28)
- Avval ulush foyda **hisoblangan paytdagi** hisobdan olinardi (oy davomida pul olgan hamkor
  kam ulush olardi, keyinroq hisoblansa — keyingi oydagi chiqimlar ham ayirilib ketardi).
- Endi: **Foyda uchun hisob = oy boshidagi hisob − shu oyda olgan summaning YARMI**.
  Misol: Kozimjon oy boshida $2 000, 11.08 da $200, 22.08 da $300 oldi →
  2 000 − 500/2 = **$1 750** uchun ulush beriladi. Ta'sischilarga ham xuddi shunday.
- "Oyda olgan" = Xarajatlar → Hamkorlar xarajatlari (shu hamkorga yozilgan, shu oy sanasi).
  Oy boshidagi hisob avtomatik tiklanadi (keyingi oylardagi chiqimlar ham qaytarib qo'shiladi).
- Yangi hisob = haqiqiy joriy hisob + oladi (asos faqat ulush % uchun).
- Oylar ketma-ket: oxirgi yopilgan oydan oldingi oyni hisoblab bo'lmaydi.
- Jadvalda yangi ustunlar: Oy boshida · Oyda oldi · Foyda uchun hisob; chop etishda ham.

## Mobil dizayn (`css/style.css`)
- 390px telefonda 15 sahifadan 13 tasi ekrandan kengayib, gorizontal surilardi (masalan Ombor
  ~830px, pastki menyu yarmida qolardi). Sabab: flex/grid elementlarda `min-width:auto`.
  Tuzatildi — jadvallar o'z ichida suriladi, sahifa ekranga sig'adi (15/15 sahifa tekshirildi).
- Mobilda statistika kartalari 2 ustun, grid'lar 1 ustun, modal ekranga sig'adi, sarlavha qisqartiriladi.

## Testlar
`npm test` — **43/43 PASS** (+7 ta hamkorlar testi, jumladan oy yopilishi va tahrir farqi;: avgust production misoli, 60/40 ta'sischi,
bekor qilish, ko'p-qurilma sinxron, ta'sischi belgisi).

---

# Powerful PRO — P2: OWASP xavfsizlik tuzatishlari (2026-09-28)

> Bu bo'lim — eng yangi o'zgarishlar. Pastda avvalgi P0/P1 (2026-09-23) tavsifi
> o'zgarishsiz qoldirilgan. Bu paket P0 + P1 + P2 ning HAMMASINI o'z ichiga oladi.

## Deploy'dan oldin bilish kerak bo'lgan 3 narsa

1. **DB migratsiyasi #21 ALLAQACHON production'da qo'llangan** (2026-09-28,
   nomi `p2_grants_hardening`, fayl: `supabase-migration-21-p2-grants-hardening.sql`).
   Funksional ta'siri yo'q — faqat ortiqcha GRANT'lar olindi. Qayta ishga tushirish shart emas.
2. **P0.1'dagi xato tuzatildi.** Avvalgi paketdagi `app-data-save.js` har
   saqlashda o'zgarmagan `products`/`settings`ni ham tekshirardi — sotuvchi va
   kassirning savdosi 403 bilan rad etilardi (u paket deploy qilingan bo'lsa,
   "loyiha buzildi" belgilaridan biri shu bo'lishi mumkin). Endi faqat
   O'ZGARGAN kalitlar tekshiriladi.
3. **729-filialdagi "sotuvchi" xodimga hech qanday RBAC roli biriktirilmagan**
   (production'da tekshirildi). U savdo qila olmaydi (`sale-checkout-atomic`
   `savdo.create` talab qiladi — bu avvaldan shunday edi). Rollar bo'limida
   unga "Sotuv menejeri" yoki "Kassir" rolini bering.

## O'zgargan fayllar

### Server (Netlify Functions)
| Fayl | Nima o'zgardi | OWASP |
|---|---|---|
| `_lib/appDataGuard.js` (YANGI) | app_data/app_data_branches uchun umumiy RBAC: faqat o'zgargan kalit tekshiriladi; ruxsatsiz kalit yozilmaydi (server qiymati qoladi va klientga qaytariladi); admin bo'lmaganga ommaviy o'chirish (≥10 yozuvli ro'yxatni bir yo'la yarmidan ko'p qisqartirish) bloklanadi; `settings` ichida faqat kurs (usdUzs/usdCny) hammaga ochiq, admin PIN va boshqalar — `sozlamalar.edit`; `deletedIds` tombstone'lari — o'sha ro'yxatga huquq bo'lsagina | A01 |
| `app-data-branch-save.js` | Avval HECH QANDAY ruxsat tekshiruvi yo'q edi (kassir filialning hamma ma'lumotini o'chira olardi). Endi `appDataGuard` | A01 |
| `app-data-save.js` | `appDataGuard`ga o'tkazildi; filial solishtiruvi `app_data_branches`ga nisbatan; yozilgan filial `app_data_branches`ga ham sinxron yoziladi (**sotuvchi ilovasidagi savdolar qayta yuklanganda yo'qolib qolish xatosi tuzatildi**) | A01 + bug |
| `supplier-payment-add.js` | `taminotchilar.view` → `taminotchilar.edit` (ko'rish huquqi bilan pul yozish yopildi). Bu huquq `.view` bo'lgan barcha rollarda allaqachon bor | A01 |
| `batches-shadow-sync.js`, `dealer-audit-log-add.js` | Ruxsat tekshiruvi qo'shildi | A01 |
| `_lib/supabaseAdmin.js` | `serverError()` — xom DB xatosi klientga chiqmaydi (biznes-xabarlar, masalan "Omborda yetarli qoldiq yo'q", chiqadi); `logSecurityEvent()` — ruxsat rad etilishi `staff_audit_log`ga yoziladi | A09, A10 |
| 40 ta boshqa Function | `json({error:e.message},500)` → `serverError(...)` | A10 |

### Klient
| Fayl | Nima o'zgardi | OWASP |
|---|---|---|
| `js/shared.js` | `esc()` va `escJsAttr()` qo'shildi | A05 |
| `js/main.js`, `js/sotuvchi.js`, `js/diller.js` | ~350 joyda foydalanuvchi kiritgan matn (ism, telefon, izoh, SKU, kategoriya, partiya raqami, rasm manzili...) HTML'ga `esc()` orqali qo'yiladi; `toast()` endi `textContent` | A05 |
| `js/main.js` | Server rad etgan o'zgarishlar haqida ogohlantirish (sessiyada bir marta) va mahalliy nusxani server qiymati bilan tuzatish; Sozlamalarda standart PIN (1212) ogohlantirishi | A01, A07 |
| `js/sotuvchi.js` | Zaxira saqlash xatosi endi jim yutilmaydi; server tuzatishlari qo'llanadi | A10 |
| `index.html`, `sotuvchi.html`, `diller.html` | CDN skriptlar aniq versiyaga qotirildi + SRI (`integrity`) qo'shildi. **qrcode 1.5.3 → 1.4.4**: 1.5.3 paketida `build/qrcode.min.js` fayli umuman yo'q, ya'ni QR-kod yaratish production'da ishlamayotgan bo'lishi kerak edi. ExcelJS cdnjs'dan jsdelivr'ga ko'chirildi (hash npm paketi bilan aynan mos kelishi uchun) | A03 + bug |

### DB (allaqachon qo'llangan)
`supabase-migration-21-p2-grants-hardening.sql` — policy'siz 20 ta jadvaldan
anon/authenticated GRANT'lari olindi; policy'li jadvallardan TRUNCATE/TRIGGER/
REFERENCES olindi; `record_dealer_sale` anon'dan olindi (diller uchun saqlandi);
`rls_auto_enable` API orqali chaqirilishi yopildi. Tekshirildi: service_role va
diller portali ruxsatlari joyida.

## Testlar
`npm test` — **36/36 PASS** (P0/P1 ning 19 tasi + 17 ta yangi xavfsizlik testi:
filial-yozish RBAC, ommaviy o'chirish, sozlamalar/PIN, tombstone, Kirim va
konsignatsiya savdosi to'liq saqlanishi, sotuvchi → app_data_branches sinxroni,
xato matni yashirilishi, XSS).
Qo'shimcha: 15 ta asosiy sahifa + sotuvchi/diller ekranlari zararli ma'lumot
(`<img onerror>`) bilan chizildi — xato 0, XSS ishga tushishi 0. 4 ta CDN
kutubxona SRI hash bilan brauzerda yuklanib ishlashi va o'zgartirilgan fayl
bloklanishi tekshirildi.

## Qolgan (bu paketda yopilmagan) xavflar
- JSON-blob arxitekturasi sabab ruxsat kalit darajasida: masalan savdo huquqi bor
  xodim filialning partiya/kassa ma'lumotini ham o'zgartira oladi (savdo shuni
  talab qiladi). To'liq yechim — ma'lumotni SQL jadvallarga ko'chirish (P3).
- Ommaviy o'chirish himoyasini ko'p marta 49% dan qisqartirib aylanib o'tish mumkin
  (bir martalik "hammasini o'chirish"ni to'xtatadi, lekin to'liq kafolat emas).
- Admin PIN `settings` ichida saqlanadi va app-data-load orqali barcha xodimlarga
  yetib boradi — PIN xodimlardan sir emas. Endi bu xavfli emas (xavfli amallarni
  server tekshiradi), lekin PIN'ni "parol" deb hisoblamang.
- Supabase panelida: "Leaked password protection" o'chiq; 11 ta funksiyada
  `search_path` belgilanmagan (past xavf) — alohida, ehtiyotkorlik bilan.

## Orqaga qaytarish
- Kod: oldingi deploy'ni Netlify → Deploys → "Publish deploy".
- DB #21: `grant select, insert, update, delete on <jadval> to anon, authenticated;`
  (kerak bo'lmaydi — kod unga bog'liq emas).

---

# Powerful PRO — P0 + P1 (P1.1, P1.2, P1.3) o'zgarishlar (2026-09-23)

Bu hujjat — shu paketdagi barcha o'zgarishlarning to'liq, aniq tavsifi. Har bir
fayl **to'liq yakuniy holatda** berilgan (patch emas) — sizning haqiqiy GitHub
repo'ingizdagi fayllar bilan qo'lda solishtirib, ongli ravishda merge qilishingiz
uchun. Production Supabase loyihasiga (`dzzxrxudsejhdrbpiifc`) faqat DB
migratsiyasi (quyida 0-band) allaqachon qo'llangan — qolgan hech narsa hali
production'ga chiqarilmagan.

---

## 0. DB migratsiyasi — ALLAQACHON PRODUCTION'DA QO'LLANGAN

`supabase-migration-20-p0.1-app-data-permissions.sql` — 2026-09-23'da
`dzzxrxudsejhdrbpiifc` loyihasiga to'g'ridan-to'g'ri qo'llangan (migration nomi:
`p0_1_app_data_write_permissions`). Bu fayl faqat repo'da yozuv sifatida
qo'shildi (hujjatlashtirish uchun) — QAYTA ISHGA TUSHIRISH SHART EMAS.

Nima qildi:
- 3 ta yangi permission: `taminotchilar.edit`, `hamkorlar.edit`, `ombor.edit`
- Mos `.view` huquqiga ega rollarga avtomatik `.edit` ham ulandi (orqaga moslik)
- `staff_audit_log` jadvali yaratildi (RLS yoqilgan, faqat service-role yozadi)

Zararsiz — eski kod bu jadval/permission'lardan xabardor emas, hech narsani
buzmaydi. Lekin bularni ISHLATADIGAN kod (pastda) hali deploy qilinmagan.

---

## 1. P0.1 — `app-data-save.js` RBAC yo'qligi (KRITIK)

**Muammo edi:** har qanday faol xodim (kassir ham) `app_data` blobining
ISTALGAN qismini (mahsulotlar, sozlamalar, boshqa filiallar ma'lumoti) ustidan
yoza olardi — chunki `requireStaffAuth()` faqat "faol xodimmi" deb tekshirardi,
"shu amalga ruxsati bormi" deb emas.

**Fayl 1: `netlify/functions/_lib/supabaseAdmin.js`**
`requireStaffAuth()` funksiyasiga `loadPermissions` degan yangi (ixtiyoriy,
orqaga moslik saqlangan) parametr qo'shildi — bu chaqiruvchiga bitta majburiy
permission talab qilmasdan, xodimning BARCHA permission kalitlarini
(`permKeys`) yuklab olish imkonini beradi (`app-data-save.js` bir nechta
turli kalitni tekshirishi kerak bo'lgani uchun).

**Fayl 2: `netlify/functions/app-data-save.js`**
To'liq qayta yozildi — `TOP_LEVEL_PERMISSION_MAP` va `BRANCH_KEY_PERMISSION_MAP`
degan ikkita xarita qo'shildi (har bir haqiqiy yuboriladigan kalit → kerakli
permission), va **deny-by-default** qoidasi: ro'yxatda yo'q har qanday
(kelajakda qo'shiladigan) kalit admin bo'lmagan xodim uchun avtomatik rad
etiladi. Rad etishlar `staff_audit_log`ga yoziladi (kim, qachon, qaysi
kalitlar). Admin — cheklovsiz. Mavjud merge/upsert logikasi o'zgarishsiz
qoldi — faqat oldidan bitta ruxsat-tekshiruv qatlami qo'shildi.

**Test:** `tests/p0.1-rbac.test.js` (7 holat, backend/Node darajasida,
`tests/helpers/fake-admin.js` orqali — production DB'ga tegmasdan, real
handler kodini ishga tushirib tekshiradi): kassir rad etiladi + audit
yoziladi, admin cheklovsiz, mos huquqli xodim o'tadi, nomalum kalit
deny-by-default, filial-ichidagi (branchStore) kalitlar ham tekshiriladi,
yaroqsiz token 401.

---

## 2. P0.2 — Savdo/Qaytarishda "fail-open" (KRITIK)

**Muammo edi:** `js/main.js` ichida `_savdoCommit()` va `doSaleReturn()`
funksiyalarida, agar serverga (atomik FIFO/balans tekshiruvchi) so'rov tarmoq
xatosi bilan tugasa, kod jimgina himoyasiz client-only yo'lga o'tib ketardi —
ya'ni internet uzilishi xavfsizlik tekshiruvini butunlay chetlab o'tishga olib
kelardi.

**Fayl: `js/main.js`**
- `_savdoCommit()` ichida (~3007-qator atrofi, `catch(e)` blokida): fail-open
  fallback fail-close bilan almashtirildi — xato log qilinadi, audit yoziladi,
  foydalanuvchiga aniq xato ko'rsatiladi, `return` bilan to'xtaydi (savat
  saqlanadi, hech qanday holat o'zgarmaydi).
- `doSaleReturn()` ichida (~3376-qator atrofi) xuddi shunday fail-close.

**Test:** `tests/p0.2-fail-close.test.js` (2 holat, Playwright — real
`js/main.js` haqiqiy brauzerda, tarmoq xatosi simulyatsiya qilinib): savdo
va qaytarish ikkalasida ham holat o'zgarmasligi va xato xabari chiqishi
tekshiriladi.

---

## 3. P0.3 — Kassa "⇄ Ko'chirish" (move) validatsiya bugi (O'RTA)

**Muammo edi:** server-tomon balans tekshiruvi kod ichida
`type==='out' || type==='transfer'` shartiga bog'liq edi, lekin haqiqiy
qiymat hech qachon `'transfer'` emas, `'move'` edi (`kassaOp()` funksiyasi
faqat `'move'` yuboradi) — natijada filiallararo pul ko'chirishda server-tomon
balans tekshiruvi HECH QACHON ishga tushmasdi.

**Fayl: `js/main.js`** (~8600-qator, `doKassaOp` ichida): bitta so'z
tuzatildi — `'transfer'` → `'move'`.

**Test:** `tests/p0.3-cashbox-move.test.js` (2 holat): move amalida server
chaqirilishi, va server rad etganda balans o'zgarmasligi tekshiriladi.

---

## 4. P1.1 — Xitoy bank komissiyasi sozlanuvchan (past xavfli)

**Avval:** `CUR.BANK_FEE = 0.006` (0.6%) qattiq kodlangan edi, faqat bitta
joyda (`kirimCalc()`, CNY kirim tannarxida) ishlatilardi.

**Fayl: `js/main.js`** — 4 ta joy:
- `CUR` obyekti (`load()`/`save()`) — `bankFeePct` endi `bp_cur` localStorage
  kalitiga ham yoziladi/o'qiladi.
- `initData()` — bulutdagi (`S.settings.bankFeePct`) qiymat ustuvor (xuddi
  `usdUzs`/`usdCny` kursi bilan bir xil naqsh), bo'lmasa standart avtomatik
  bulutga yoziladi.
- `syncRateToSettings()` — endi `bankFeePct`ni ham sinxronlaydi.
- `pgSozlamalar()` — "💱 Joriy kurs" blokiga yangi input qo'shildi: "🏦 Xitoy
  bank komissiyasi (CNY kirim uchun), %".
- `saveSettings()` — yangi inputni o'qib, `CUR.BANK_FEE` va
  `S.settings.bankFeePct`ni yangilaydi, mavjud "💾 Saqlash" tugmasi orqali
  (yangi tugma/modal yaratilmadi). `sozlamalar.edit` huquqi bilan himoyalangan
  (P0.1 RBAC orqali).

Standart qiymat hamon 0.6% — hech kim o'zgartirmasa, xatti-harakat AYNAN
avvalgidek qoladi (backward-compatible).

**Test:** `tests/p1.1-bank-fee.test.js` (2 holat): Sozlamalar'da % kiritilsa
`CUR.BANK_FEE`/`S.settings.bankFeePct`/localStorage barchasi yangilanishi, va
`kirimCalc()` formulasi joriy (sozlangan) qiymatdan foydalanishi.

---

## 5. P1.2 — Yaxlitlash (Rounding) qoidasi + P1.3 — Currency snapshot

**Biznes qoidalari (AZIMSHER tasdiqlagan, 2026-09-23):**
- Yaxlitlash: qoldiq 0–500 → pastga, 501–999 → yuqoriga, eng yaqin 1000 so'mga.
- **HAR BIR SAVDO QATORI alohida yaxlitlanadi**, keyin jami hisoblanadi (jamini
  bitta butun sifatida yaxlitlash YO'Q).
- **Skidka — LINE-LEVEL:** bir xil % har qatorga alohida qo'llanadi (keyin
  har biri alohida yaxlitlanadi) — total-level (jami summadan bir martalik
  ayirish) EMAS.
- **Zarar (tan narxdan past sotuv) — BLOKLANMAYDI:** mavjud `_openSaleConfirm`
  tasdiqlash oynasi orqali (allaqachon bor edi) o'tadi, lekin endi HAR SAFAR
  `staff_audit_log`ga ("⚠️ Zarar bilan sotuv...") yoziladi.

**Fayl: `js/main.js`:**
- `CUR.roundUzs(amount)` — yaxlitlash formulasi (yangi funksiya, `CUR` obyekti
  ichida).
- `CUR.roundedSaleUzsTotal(cart, discPct)` — savat qatorlarini alohida
  yaxlitlab, jamini hisoblaydigan yangi funksiya.
- `saleUzsTotal(discPct)` — yangi global yordamchi funksiya: joriy `S.cart`
  uchun UZS jamini hisoblaydi, `S.settings.roundingEnabled` holatini hisobga
  oladi (o'chirilgan bo'lsa — oddiy, yaxlitlanmagan konvertatsiya).
- `initData()` — yangi: `S.settings.roundingEnabled` standart holati (birinchi
  yuklashda) — **YOQILGAN** (`true`). Bu — muammo chiqsa tezkor o'chirish
  imkonini beruvchi "feature flag" (arxitektura hujjati 18-bandidagi rollback
  tamoyiliga mos).
- `pgSozlamalar()` / `saveSettings()` — yangi checkbox: "🔢 Savdoda UZS
  yaxlitlash... yoqilgan" — istalgan payt o'chirish/yoqish mumkin,
  `sozlamalar.edit` RBAC bilan himoyalangan.
- `savdoSummaryHtml()` — savat hisobida ko'rsatiladigan UZS summa endi
  YAXLITLANGAN qiymat (avval xom `CUR.toUzs(totalUsd)` edi).
- `_savdoCommit()` — 3 ta o'zgarish:
  1. Naqd (UZS) kassaga standart tushiradigan summa (cashier hech narsa
     kiritmagan holatda) endi YAXLITLANGAN — bu qiymat serverga yuboriladigan
     `boxAmountNative` bilan ham, lokal kassa balansini yangilashda ham
     BIR XIL (`saleUzsRounded` o'zgaruvchisi orqali, ikkalasi sinxron).
  2. Yangi `sale` obyekt maydonlari: `roundedTotalUzs` (yaxlitlangan, chekda/
     hisobotda ko'rsatiladigan doimiy summa) va `rateUsdUzs`/`rateUsdCny`/
     `rateDate` (**P1.3 — Currency snapshot**: shu savdo vaqtidagi kurs, DB
     sxemasi o'zgarishisiz, mavjud JSON blob ichida — kelajakda kurs
     o'zgarsa ham, bu yozuv o'z kursini saqlaydi).
  3. Zarar bilan sotuvlar uchun majburiy `auditLog()` chaqiruvi qo'shildi.
- `showReceipt()` — chekda JAMI qatoriga yaxlitlangan UZS summa qo'shildi
  (avval faqat USD ko'rsatilardi).

**Qamrov chegarasi (ataylab QILINMAGAN, keyingi qadam sifatida qayd etilgan):**
`doSaleReturn()` (qaytarish oqimi) hali rounding/currency-snapshot bilan
yangilanmagan — qaytarish moliyaviy jihatdan murakkabroq (qisman qaytarish,
qayta hisoblash) va bu safar qamrovga kiritilmadi, alohida keyingi qadamda
ko'rib chiqiladi.

**Test:** `tests/p1.2-rounding-currency.test.js` (6 holat): `roundUzs()`
chegara holatlari, arxitektura hujjatidagi aniq misol (141960→142000,
106470→106000, jami 248000), skidkaning line-level taqsimlanishi, sozlama
orqali o'chirish, zarar-sotuv bloklanmasligi+audit, va kurs snapshot
saqlanishi.

---

## 6. Test infratuzilmasi (yangi, avval 0 ta avtomatlashtirilgan test bor edi)

- `tests/run.js` — minimal test-runner (`npm test`), og'ir freymvork yo'q.
- `tests/helpers/load-app.js` — Playwright orqali haqiqiy `js/shared.js` +
  `js/main.js`ni lokal HTTP server'dan haqiqiy brauzerda ishga tushiradi
  (Supabase CDN stub bilan, tashqi tarmoqqa chiqmaydi).
- `tests/helpers/fake-admin.js` — backend (Node) testlari uchun Supabase admin
  klientini soxta qiladi (module-cache injection), real handler kodi
  o'zgarishsiz ishga tushadi.
- `tests/fixtures/blank.html` — minimal test sahifasi.
- `package.json` — `"test": "node tests/run.js"` skripti va `playwright`
  devDependency qo'shildi.

**Joriy natija: 19/19 test PASS** (7 backend/browser P0.1 test + 2 P0.2 + 2 P0.3
+ 2 P1.1 + 6 P1.2/P1.3).

---

## FAYLLAR RO'YXATI (bu paketda)

```
netlify/functions/_lib/supabaseAdmin.js     — o'zgartirilgan (P0.1)
netlify/functions/app-data-save.js          — o'zgartirilgan (P0.1)
js/main.js                                  — o'zgartirilgan (P0.2, P0.3, P1.1, P1.2, P1.3)
package.json                                — o'zgartirilgan (test skripti)
supabase-migration-20-p0.1-app-data-permissions.sql — YANGI (hujjat uchun, DB'da allaqachon jonli)
tests/run.js                                — YANGI
tests/helpers/load-app.js                   — YANGI
tests/helpers/fake-admin.js                 — YANGI
tests/fixtures/blank.html                   — YANGI
tests/p0.1-rbac.test.js                     — YANGI
tests/p0.2-fail-close.test.js               — YANGI
tests/p0.3-cashbox-move.test.js             — YANGI
tests/p1.1-bank-fee.test.js                 — YANGI
tests/p1.2-rounding-currency.test.js        — YANGI
```

## TAVSIYA ETILGAN QO'LLASH TARTIBI

1. Yuqoridagi fayllarni o'z repo'ingizdagi mos yo'llarga nusxalang (yoki
   diff tool bilan solishtirib, farqlarni ko'rib chiqing).
2. `npm install` (agar `playwright` hali yo'q bo'lsa).
3. `npm test` — 19/19 PASS bo'lishi kerak.
4. `git add -A && git commit -m "P0.1+P0.2+P0.3+P1.1+P1.2+P1.3: RBAC, fail-close, kassa bugi, bank fee, rounding, currency snapshot"`.
5. `git push` → Netlify avtomatik deploy qiladi (agar shunday sozlangan bo'lsa).
6. Deploy'dan keyin qisqa smoke-test: (a) oddiy xodim bilan kirib, ruxsatsiz
   modulga yozishga urinib ko'ring — 403 kutilmoqda; (b) bitta test savdo
   qiling (UZS jami endi 1000gacha yaxlitlangan bo'lishi kerak) — odatdagidek
   ishlashi kerak; (c) Sozlamalar'da bank komissiyasi va "UZS yaxlitlash"
   checkbox'ini ko'rib, saqlab ko'ring; (d) tan narxdan past narx bilan bitta
   test-sotuv qiling — ogohlantirish chiqishi va bloklanmasligi kerak.
7. Agar rounding bilan bog'liq biror muammo chiqsa — kodni qaytarish shart
   emas, Sozlamalar'dan "🔢 Savdoda UZS yaxlitlash" checkbox'ini o'chirib
   qo'yish yetarli (darhol eski xatti-harakatga qaytaradi).
8. Boshqa muammo bo'lsa — `git revert` bilan tez qaytarish mumkin (DB'dagi
   migratsiya zararsiz qoladi, uni orqaga qaytarish shart emas).

## KEYINGI QADAM SIFATIDA QOLDIRILGAN (ataylab, bu paketga kiritilmagan)

- `doSaleReturn()` (qaytarish) — rounding/currency-snapshot bilan yangilanmagan.
- `exchange_rate_history` SQL jadvali — hozircha kurs faqat har bir savdo
  yozuvida (blobda) snapshot qilinadi, alohida tarixiy audit jadvali yo'q
  (bu DB sxema o'zgarishi bo'lgani uchun, alohida so'rov bilan qilinadi).
- Kirim (purchase) uchun bank-fee rate snapshot (`bank_fee_rate_used`) —
  hozircha faqat joriy % ishlatiladi.
