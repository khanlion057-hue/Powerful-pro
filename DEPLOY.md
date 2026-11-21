# Mavjud saytni yangilash (v24.5, 2026-10-14)

Ishlab turgan `powerful-pro.netlify.app` ni shu versiyaga o'tkazish. Noldan yangi o'rnatish — `ornatish.md`.

> ⚠️ Hisobot bahosi — **NOT PRODUCTION READY** (`AUDIT-HISOBOT.md`). Kod va migratsiyalar lokal
> PostgreSQL'da (PGlite + haqiqiy PostgreSQL 16) sinalgan, lekin **production bazada 24/25/26/27 hali qo'llanmagan**.
> Avval **sinov havolasi (preview) + sinov bazasi**da 3-qadamni bajaring.
> **v24.9 (nasiya muddati, logo, parolni tiklash):** **38-migratsiya** (`supabase-migration-38-parol-tiklash.sql`) — 5-migratsiyadan keyin istalgan vaqtda. Uch jadval (`staff_pw_reset` — xodim Telegram ulanishi va tiklash kodi xeshi; `pw_reset_ip_log` — so'rovlar cheklovi; `login_guard` — noto'g'ri parol: 5 ta → 15 daqiqa blok, keyin har safar 3 ta → 30 daqiqa) va `fw_revoke_sessions(uuid)` (parol tiklanganda auth seanslarini yopadi; huquq yetmasa — xatosiz, eski token ≈1 soatda tugaydi). Faqat qo'shadi, takror xavfsiz, faqat server (service_role). Yangi funksiyalar `pw-reset` va `staff-login` (kirish endi server orqali — urinishlar sanaladi; funksiya topilmasa brauzer avvalgidek to'g'ridan-to'g'ri kiradi; jami 65). ⚠️ Kimdir Supabase Auth API'ga to'g'ridan-to'g'ri murojaat qilsa, sanoqni chetlab o'tadi — u yerda Supabase'ning o'z cheklovi (Auth → Rate Limits) amal qiladi. **Telegram:** kod Sozlamalar → Telegram bot tokeni bilan yuboriladi; ulash `getUpdates` orqali (botda webhook **bo'lmasligi** kerak — investor hisoboti bilan bir xil). Admin xodim parolini tiklasa yoki tahrirda yangi parol qo'ysa — xodim kirganda o'zi yangisini qo'yadi (`app_metadata.must_change_pw`; server shu paytgacha boshqa amallarni 403 bilan rad etadi). Nasiya muddati va logo — migratsiyasiz. **Tartib:** zaxira → 38 → sayt (38'siz sayt ham ishlaydi: «Parolni unutdingizmi?» «hali yoqilmagan» deydi).

> **v24.8 (maxfiylik, chegirma, versiya):** **37-migratsiya** (`supabase-migration-37-maxfiylik-chegirma-versiya.sql`) — 36 dan KEYIN (34 shart). `app_data` / `app_data_branches` — `version` ustuni (har yozuvda +1, trigger) va `app_data_save_cas` (eski versiya bilan yozuv — 409, brauzer yangilab qayta yuboradi); `sale_checkout_v37` (chegirma chegarasi `settings.maxDiscountPct`, standart 10%, asos — savdo rejimiga qarab; Direct Sale — faqat mahsulotda belgilangan ta'minotchi/narx bilan; admin cheklanmaydi); yangi ruxsat `tannarx.view` (**hech bir rolga avtomatik berilmaydi** — tannarx/foyda ko'rishi kerak bo'lgan menejer rollariga egasi o'zi beradi); `record_dealer_sale` ning eski 5 va 6 argumentli nusxalari o'chiriladi. Faqat qo'shadi (o'sha ikki eski nusxadan tashqari), takror xavfsiz, faqat server. **Tartib:** zaxira → 37 → sayt (37'siz yangi sayt ham ishlaydi: chegirma tekshiruvi JS'da, versiyasiz) → barcha xodimlar F5. ⚠️ 27 yoki 34 qayta ishga tushirilsa — oxirida 37 ni ham qayta ishga tushiring.
>
> **v24.6 (filiallar o'tkazmasi):** **36-migratsiya** (`supabase-migration-36-filial-otkazma.sql`) — 35 dan KEYIN. So'rov → jo'natish → yo'lda → sanab qabul (Baza → filial, filial → filial, filial → Baza); qisman bajarish; kam kelgan qism — izoh majburiy, jo'natuvchi «omborga qaytdi»/«yo'qotish» deb hal qiladi; jo'natishda «ichki savdo» yozilmaydi — Baza foydasi filial sotganda (`branch_income`). Yangi jadvallar `branch_transfers`, `branch_transfer_shipments`, ustun `batches.base_cost_usd`, funksiyalar `branch_transfer_op`, `branch_transfer_list`, `branch_income`, `_tr_json` (+ `_fw_authority` javobiga kalitlar qo'shildi). Faqat qo'shadi, takror xavfsiz, faqat server. Server funksiyasi `branch-transfer` — jami **63**. 36 qo'llanmaguncha «O'tkazmalar» tugmasi avvalgi oynani ochadi. ⚠️ 27 yoki 35 qayta ishga tushirilsa — oxirida 36 ni ham qayta ishga tushiring.
>
> **v24.5 (diller ombori):** **35-migratsiya** (`supabase-migration-35-diller-ombor-atomik.sql`) — 34 dan KEYIN (oxirgi). Dillerga jo'natish (+ buyurtma tasdig'i), dillerdan qaytarish va admin yozadigan diller savdosi — serverda BITTA tranzaksiyada (`dealer-ops`; yangi funksiyalar `dealer_ship_atomic`, `dealer_return_atomic`, `dealer_sale_record_atomic`, `dealer_atomic_available`; `ledger_ops` turlariga `dealer_ship/return/sale` qo'shildi, 27–34 turlari saqlangan). Faqat qo'shadi, takror xavfsiz, faqat server (brauzer rollariga huquq yo'q); diller portalidagi −10% chegarasi (31) va reviziya (32) o'zgarmaydi. 35 qo'llanmaguncha sayt avvalgidek ishlaydi; 35 qo'llangach eski «mutlaq qiymat» yo'llari (`dealer-stock-upsert`, `dealer-stock-move-add`, `dealer-sale-add`, `dealer-update` balans maydonlari, `dealer-order-status` tasdig'i, `stock-debt-ops` diller jo'natmasi/qaytishi) — 409 «sahifani yangilang»: **35 dan keyin barcha xodimlar F5**. Server funksiyalari — jami **62**. ⚠️ 27, 28, 29 yoki 33 qayta ishga tushirilsa — oxirida 35 ni ham qayta ishga tushiring (diller amallari yozilgan bazada ular CHECK xatosi bilan to'xtaydi — hech narsa o'zgarmaydi). Verify SQL — 73 ta tekshiruv.
> **v24.5:** **34-migratsiya** (`supabase-migration-34-mijoz-haqi.sql`) — 33 dan KEYIN. Mijoz haqi (ortiqcha toʻlov): yangi jadvallar `customer_credit_balances`, `customer_credit_ledger` (oʻzgarmas), `sale_credit_uses`; funksiyalar `sale_checkout_v34`, `sale_void_v34`; kassa amal turiga `cust_credit` qoʻshildi. Faqat qoʻshadi, takror xavfsiz; brauzer rollariga yangi huquq yoʻq. 34 qoʻllanmaguncha sayt ishlaydi (ortiqcha toʻlov — rad, aniq xabar bilan). Yangi server funksiyalari: `telegram-file`, `backup-daily` (jadval — `netlify.toml`, har soatda) — jami **61** (35-migratsiya bilan `dealer-ops` — **62**). Front: `js/pos.js`, `js/vendor/html2pdf.bundle.min.js` (lokal). Kunlik zaxira uchun: Sozlamalar → Maʼlumotlar → Telegram — SHAXSIY chat ID (guruh emas) va soat. ⚠️ 25, 27, 29 yoki 33 qayta ishga tushirilsa — oxirida 34 ni ham qayta ishga tushiring. Verify SQL — 67 ta tekshiruv.
> **v24.4:** **33-migratsiya** (`supabase-migration-33-taminotchi-zaklad.sql`) — 32 dan KEYIN. Taʼminotchiga zaklad (oldindan to'lov): yangi jadvallar `supplier_advance_balances`, `supplier_advance_ledger` (faqat server, jurnal o'zgarmas), funksiyalar `supplier_advance_pay`, `supplier_advance_apply`; kassa va `ledger_ops` amal turlariga `supp_advance` qo'shildi. Faqat qo'shadi, takror xavfsiz; brauzer rollariga yangi huquq yo'q. Yangi server funksiyasi: `supplier-advance` (jami **59**). Front: `js/zaklad.js`. ⚠️ 25, 27 yoki 29 qayta ishga tushirilsa — oxirida 33 ni ham qayta ishga tushiring (amal turlari cheklovi tiklanadi; zaklad yozuvlari bo'lsa 25/27/29 ni qayta ishga tushirmang — cheklov eski ro'yxat bilan qayta qo'yilmaydi). Verify SQL — 66 ta tekshiruv.
> **v24.2:** **32-migratsiya** (`supabase-migration-32-reviziya-tasdiq-direct-sale.sql`) — 31 dan KEYIN. Diller reviziyasi «kutilmoqda» bo'lib saqlanadi va administrator (yoki «dillerlar.manage») tasdiqlasa: kamomad — sotuv (qarz optom narxda), ortiqcha — qaytish (faqat avval sotilgan miqdorgacha, qarz kamayadi); yangi jadval `fw_dealer_revisions` (faqat server), `dealer_sales.source` ustuni (null — oddiy savdo), `dealer_revision_decide` funksiyasi; zararli savdoda server zarar summasini qaytaradi; `savdo.direct_sale` — oddiy «Xodim» roliga ham. Faqat qo'shadi, takror xavfsiz; brauzer rollariga yangi huquq yo'q. 32 qo'llanmaguncha reviziya avvalgidek faqat qayd etiladi, «Reviziyalar» oynasi — 409 «32-migratsiya kerak». Server funksiyalari soni o'zgarmadi (58). Front: yangi fayl `js/shell.js` (telefon qobig'i). ⚠️ 31 qayta ishga tushirilsa — oxirida 32 ni ham qayta ishga tushiring (`sale_checkout_guarded` zarar summasi tiklanadi). Verify SQL (`supabase-migration-25-verify.sql`) — 65 ta tekshiruv.
> **v24:** **31-migratsiya** — tahrirlash muddatlari (server vaqti: admin 30, sotuvchi 7, diller 4 kun), o'zgarmas audit tarixi (`fw_audit_events`), bildirishnomalar (`fw_notifications`, 7 kundan keyin arxiv), zararli savdo tasdig'i, diller optom narxidan ko'pi bilan 10% chegirma, `savdo.direct_sale` ruxsati (`supabase-migration-31-tahrir-muddati-audit-bildirishnoma.sql`). Faqat qo'shadi, ma'lumot o'chirmaydi, takror xavfsiz; brauzer rollariga yangi huquq yo'q. Yangi server funksiyalari: `notifications`, `telegram-announce` (jami **58**). 31 qo'llanmaguncha savdo, tahrir va o'chirish **avvalgidek** ishlaydi (muddat/audit yo'q), 🔔 va diller reviziyasi — 409 «31-migratsiya kerak». ⚠️ 23 yoki 25 qayta ishga tushirilsa — oxirida 31 ni ham qayta ishga tushiring (`record_dealer_sale` 10% chegarasi tiklanadi). Telegram e'loni uchun: Sozlamalar → Telegram bot → «Yangi mahsulot e'loni» (kanal/guruhlar, bot kanalda administrator bo'lishi kerak).
>
> **v23.9:** yangi migratsiya yo'q. Yangi server funksiyalari: `telegram-daily-report` — **jadval bo'yicha** (`netlify.toml`: har soatda) va `telegram-report` (administrator: hisobotni ko'rish / hozir yuborish); jami 56. Netlify «Scheduled functions» production deploy'da avtomatik yoqiladi (NOT VERIFIED — saytda tekshirilmagan; Netlify → Logs → Functions → `telegram-daily-report` da har soat yozuv ko'rinishi kerak). Sozlamalar → Telegram bot → «Kunlik hisobot» yoqilmaguncha hech narsa yubormaydi.
>
> **v23.8:** **30-migratsiya** — diller portaldan pul yuboradi (`supabase-migration-30-diller-tolov-xabarnomasi.sql`, jadval `dealer_pay_notices` + 3 funksiya, faqat server). Yangi server funksiyasi `dealer-pay` (jami 54). Bosh sahifa (Dillerlar bloki, Kategoriyalar va Xodimlar grafiklari), portallar yangi yuqori panel va menyu. 30 qo'llanmaguncha diller «To'lov» bo'limi va bildirishnomalar 409 «30-migratsiya kerak» qaytaradi — boshqa hech narsa o'zgarmaydi.
>
> **v23.7:** bosh sahifada «Biznes holati» (foyda/ziyon), kassa yopish (sotuvchi ham — `savdo.create`, faqat o'z filiali, Shaxsiy/diller kassasisiz), sotuvchi portalida «Kassa» bo'limi. **Yangi migratsiya yo'q**, server funksiyalari soni o'zgarmagan (faqat `firma-kassa` yangilandi). v23.6 (29-migratsiya) qo'llanmagan bo'lsa — avval uni qo'llang.
>
> **v23.6:** 29-migratsiya — **hisobdan chiqarish** va **B2B hamkor tizimlar** (`docs/B2B-HISOBDAN-CHIQARISH.md`); brend (white-label: nom, logotip — `docs/KOCHIRMA.md`), «Firma kassasi» → **Bosh kassa**, mahsulot kartochkasi va bo'limli forma, raqamlar «1 000» ko'rinishida. Yangi server funksiyalari: `stock-writeoff`, `b2b`, `b2b-inbound` (hamkor serveri chaqiradi). B2B uchun Netlify `URL` avtomatik; boshqa domen bo'lsa — `B2B_SELF_URL=https://domen`.
>
> **v23.5:** faqat ko'rinish (kichik oynalar 2.0, standart matn o'lchami 90%, portallar). Baza va server o'zgarmagan — **yangi migratsiya yo'q**; v23.4 (28-migratsiya) qo'llanmagan bo'lsa, avval uni qo'llang.
>
> **v23.4:** Firma kassasi — asosiy kassa (28-migratsiya, `docs/FIRMA-KASSA-ASOSIY.md`): kunlik yopish («uyga berish») pulni Firma kassasiga o'tkazadi, xarajat va ta'minotchi qarzi Firma kassasidan to'lanadi. Bosh sahifaning 4 kartochkasi (Qoldiq, Qarzlar, Tushumlar, Xarajatlar) — alohida oynalar.
> **v23.3:** Onlayn-do'kon moduli (`docs/ONLAYN-DOKON.md`) — yangi migratsiya YO'Q; yangi server funksiyasi `shop-bot` (Telegram API'ga chiqadi). 27-migratsiya talablari o'zgarmagan.
> **F4b** (mijoz/ta'minotchi qarzi va ombor qoldig'i) — v23.2 da serverga ko'chirildi (27-migratsiya): `docs/F4B-INVENTAR.md`.

> ⚠️ Netlify'dan yuklab olingan eski deploy ZIP'ni qayta deploy qilmang: unda
> `netlify/functions/_lib/` fayl nomlari kichik harfga o'tib qolgan.

## Xavfsiz yangilash tartibi (v24.5 skriptlari): PRECHECK → BACKUP → VALIDATE → MIGRATE → TEST → VERIFY → RELEASE
Bitta "ish yo'q" oynasida, ketma-ket. `DATABASE_URL` faqat o'z kompyuteringizda (skriptlarda standart manzil YO'Q,
hech qayerga chiqarilmaydi). Har qadam xato bilan tugasa — keyingisiga O'TMANG.

1. **PRECHECK** — `scripts/migrate-v24.5.sh --check` (faqat o'qiydi: migratsiya darajasi 23…35, zanjir fayllari, sxema
   barmoq izi) va `scripts/deploy-netlify.sh --dry-run --prod` (toza Git daraxti yoki reliz manifesti, `NODE_VERSION 22`,
   `404.html`, 61 funksiya).
2. **BACKUP** — `scripts/backup-before-deploy.sh`: `pg_dump` custom format (ruxsatlar bilan) + `.sha256` + `.summary` +
   `.fingerprint` + `.manifest` (`version=24.5`, UTC vaqt, migratsiya darajasi, sha256). Nusxani xavfsiz joyga ko'chiring.
3. **VALIDATE** — `cd backups && sha256sum -c <fayl>.dump.sha256`; manifestdagi `migration_level` kutilganidek
   (production hozir 23); ixtiyoriy `VERIFY_URL=<lokal bo'sh baza>` bilan tiklash sinovi.
4. **MIGRATE** — `FW_MIGRATE_CONFIRM=HA-QOLLAYMAN-V24.5 FW_BACKUP_FILE=<fayl>.dump scripts/migrate-v24.5.sh --apply`:
   24 → 34 (+ 35, fayl bo'lsa — logda aniq yoziladi) **bitta tranzaksiyada** (`psql -1 -v ON_ERROR_STOP=1`). Zaxirasiz,
   sha256/manifest mos kelmasa, zaxira 120 daqiqadan eski yoki zaxiradan keyin sxema o'zgargan bo'lsa — rad.
   Xato — hech narsa o'zgarmaydi.
5. **TEST** — skript o'zi `supabase-migration-25-verify.sql` ni ishga tushiradi: hamma qator `ok = t` (aks holda kod 3);
   oldin/keyin barmoq izi chiqariladi.
6. **VERIFY** — `scripts/deploy-netlify.sh --prod` (yuqoridagi 1-qadam): check, test, build, `scripts/verify-netlify-artifact.mjs`
   (61 funksiya, 404, sarlavhalar), deploydan keyin funksiyalar soni, `/.netlify/functions/health`, sarlavhalar.
7. **RELEASE** — xodimlar F5; quyidagi "3-qadam — tekshirish". Reliz ZIP: `scripts/make-release-zip.sh <zip>`
   (bitta `powerful-pro-v24.5/` papka, `RELEASE-MANIFEST.sha256`, yonida `<zip>.sha256`).

**Rollback.** Kod: Netlify → Deploys → oldingi deploy → **Publish deploy**. Baza (faqat favqulodda, zaxiradan keyingi
amallar yo'qoladi): `FW_RESTORE_TARGET_DB=<baza nomi> FW_ROLLBACK_CONFIRM=HA-TIKLAYMAN FW_BACKUP_FILE=<fayl>.dump
scripts/rollback-from-backup.sh` — avval sha256 va manifest tekshiriladi; `public` sxemasi bitta tranzaksiyada zaxira
holatiga qaytadi (sxema ACL, event trigger bilan); so'ng ma'lumot xulosasi va barmoq izi zaxiradagi bilan solishtiriladi.
Production'ga o'xshagan maqsad (Supabase manzili, `postgres` nomi, nomida `prod`) uchun qo'shimcha
`FW_RESTORE_PROD_CONFIRM=HA-PRODUCTION-BAZASINI-TIKLAYMAN` kerak. Lokal mashq (PG 17.6, production nusxasi):
zaxira → 24…34 → verify → rollback → barmoq izi asl bilan AYNAN bir xil.

## Production holati (read-only tekshirildi, 2026-10-02)
| Migratsiya | Holat | Dalil |
|---|---|---|
| 22 | ✅ qo'llangan | — |
| 23 (Firma kassa) | ✅ **qo'llangan** | 7 ta funksiya matni (bo'shliqlar normallashtirilgan) fayl bilan AYNAN bir xil; jadvallarda RLS bor, anon/authenticated ruxsatsiz; yozuvlar 0 |
| 24 (filial kassa jurnali) | ⏸ qo'llanmagan | `cashbox_ledger` yo'q |
| 25 (v23) | ⏸ qo'llanmagan | `cash_payment_atomic` yo'q |
| 26 (xarajat kategoriyalari) | ⏸ qo'llanmagan | `expense_categories` yo'q; baza kodlashi UTF8 (migratsiya talabi bajarilgan) |
| 27 (F4b: qarz va ombor — server) | ⏸ qo'llanmagan | yangi fayl, productionda tekshirilmagan (NOT VERIFIED) |
| 28 (Firma kassasi — asosiy kassa) | ⏸ qo'llanmagan | yangi fayl, productionda tekshirilmagan (NOT VERIFIED) |
| 29 (hisobdan chiqarish, B2B) | ⏸ qo'llanmagan | yangi fayl, productionda tekshirilmagan (NOT VERIFIED) |
| 30 (diller to'lov xabarnomasi) | ⏸ qo'llanmagan | yangi fayl, productionda tekshirilmagan (NOT VERIFIED) |
| 31 (tahrir muddati, audit, bildirishnoma, diller −10%) | ⏸ qo'llanmagan | yangi fayl, productionda tekshirilmagan (NOT VERIFIED) |

## Tartib (muhim) — bitta "ish yo'q" oynasida, ketma-ket
1. **Sayt (kod)** deploy.
2. Darhol **baza: 24 → 25 → 26 → 27 → 28 → 29 → 30 → 31**. 24 shu paytdagi kassa qoldiqlarini, 27 esa mijoz/ta'minotchi qarzlari, partiyalar va savdolarni (ilovadagi JSON qiymati) bazaga ko'chiradi — shuning uchun **kun yopilgandan keyin, hech kim ishlamayotganda** qo'llang.
3. `supabase-migration-25-verify.sql` → barcha qatorlarda `ok = true`.
4. Barcha xodimlar sahifani **yangilaydi** (F5) — **majburiy**: 27 dan keyin eski brauzer kodi savdo/qaytarish qila olmaydi (409 "sahifani yangilang"), u qarz va ombor qoldig'ini o'zgartira olmaydi.

**Nega oraliq qisqa bo'lishi kerak:** v23.1 kodi fail-close ishlaydi — yetishmagan migratsiya pulni "yarim" yozmaydi, balki operatsiyani rad etadi. Kod deploy qilingan, lekin migratsiyalar to'liq emas holatda (manba: kod tahlili; "26 yo'q" holati P14 real HTTP testida, "24/25" holati P11/P13 testlarida tekshirilgan):

| Holat | Nima ishlaydi | Nima rad etiladi (pul/qarz o'zgarmaydi) |
|---|---|---|
| Kod bor, **24/25/26 yo'q** | savdo, kirim, Firma kassa (23) | mijoz/ta'minotchi qarz to'lovi — 409 "25-migratsiya kerak" (eski `integer` ustun ilova ID'sini sig'dirmaydi); "Filialga qarz", "Bekor qilish", "Filiallar qarzi" — aniq xabar; **xarajat** — kategoriya yo'q |
| **24 bor, 25 yo'q** | filial kassa jurnali (F4), savdo | eski `cashbox-transact` va `*-payment-add` — 410; diller to'lovi — 409; qarz/teskari yozuv — 409; mijoz/ta'minotchi/uyga olib ketish to'lovlari kassani o'zgartiradi, lekin SQL to'lov yozuvi yozilmaydi (`recordSkipped` ogohlantirishi) — **shuning uchun 24 dan keyin 25 darhol** |
| **24+25 bor, 26 yo'q** | barcha pul operatsiyalari, oylik/ijara (tizim nomlari) | **xarajat** — kategoriya ro'yxati "⚠️ Kategoriyalar yuklanmadi" (409 `migrationPending`), xarajat yozilmaydi, kassa va jurnal o'zgarmaydi (P14 E2E) |
| **24+25+26 bor, 27 yo'q** | hammasi (v23.1 dagi kabi) | F4b ochiq: qarz va ombor qoldig'i hali brauzer nusxasi (JSON) — shuning uchun 26 dan keyin 27 darhol |
| 24+25+26+27, **28 yo'q** | hammasi; kunlik yopish → Firma kassa (24 yetarli) | Firma kassadan **xarajat** va **ta'minotchi to'lovi** — 409 "28-migratsiya kerak" (hech narsa yozilmaydi, P21) |
| 24…28, **29 yo'q** | hammasi | hisobdan chiqarish va B2B — 409 "29-migratsiya kerak" (hech narsa yozilmaydi) |
| 24…29, **30 yo'q** | hammasi | diller portalidan pul yuborish va bildirishnomalar — 409 "30-migratsiya kerak" (qarz o'zgarmaydi, P26) |
| 24…30 | hammasi; qarz, ombor, savdo hujjati — server haqiqiy manba; Bosh kassa; hisobdan chiqarish; B2B; diller pul yuboradi | brauzer yuborgan qarz/qoldiq e'tiborga olinmaydi; eski brauzer kodi savdo kassasi — 409 |

- 26-migratsiyadan keyin har bir filial **avval o'z kategoriyalarini yaratishi kerak** ("+ Kategoriya qo'shish"). Eski xarajatlar o'z nomi bilan ko'rinaveradi.
- Migratsiya **o'rtasida xato** bo'lsa va u tranzaksiyaga o'ralmagan bo'lsa, yarim holat qolishi mumkin (masalan, 25 ning bir qismi). Shuning uchun har bir faylni **bitta tranzaksiyada** qo'llang (2-qadam).

## 1-qadam — sayt
**Faqat Git/CLI — `scripts/deploy-netlify.sh`.** Brauzerdan drag-and-drop **ishlatilmaydi** (unda `netlify/functions`
yig'ilmaydi — production'da 0 funksiya bo'lgan; ZIP papkasi tashlansa "/" 404). Reliz ZIP'i (`scripts/make-release-zip.sh`)
bitta `powerful-pro-v24.5/` papkasidan iborat — uni oching va **shu papka ichidan** skriptni ishga tushiring:
```bash
npm ci
netlify link                                       # powerful-pro (yoki NETLIFY_AUTH_TOKEN + NETLIFY_SITE_ID)
scripts/deploy-netlify.sh --dry-run                # faqat tekshiruvlar
FW_DEPLOY_CONFIRM=HA-PREVIEW NL_TOOLS=<...>/node_modules scripts/deploy-netlify.sh       # sinov havolasi
FW_DEPLOY_CONFIRM=HA-PRODUCTION FW_BACKUP_FILE=backups/powerful-pro-v24.5-<vaqt>.dump \
  NL_TOOLS=<...>/node_modules scripts/deploy-netlify.sh --prod                          # production
```

## 2-qadam — baza
**Tavsiya etilgan usul — `psql` bitta tranzaksiyada** (xato bo'lsa, o'sha fayldan hech narsa qolmaydi; PostgreSQL 16 da sun'iy xato bilan sinalgan):
```bash
# DATABASE_URL — Supabase → Project Settings → Database (faqat o'z kompyuteringizda, hech qayerga yozmang)
psql "$DATABASE_URL" -X -1 -v ON_ERROR_STOP=1 -f supabase-migration-24-v11-cash-authority.sql
psql "$DATABASE_URL" -X -1 -v ON_ERROR_STOP=1 -f supabase-migration-25-v23-hardening.sql
psql "$DATABASE_URL" -X -1 -v ON_ERROR_STOP=1 -f supabase-migration-26-expense-categories.sql
psql "$DATABASE_URL" -X -1 -v ON_ERROR_STOP=1 -f supabase-migration-27-f4b-ledger-authority.sql
psql "$DATABASE_URL" -X -1 -v ON_ERROR_STOP=1 -f supabase-migration-28-firma-kassa-asosiy.sql
psql "$DATABASE_URL" -X -1 -v ON_ERROR_STOP=1 -f supabase-migration-29-hisobdan-chiqarish-b2b.sql
psql "$DATABASE_URL" -X -1 -v ON_ERROR_STOP=1 -f supabase-migration-30-diller-tolov-xabarnomasi.sql
psql "$DATABASE_URL" -X -1 -v ON_ERROR_STOP=1 -f supabase-migration-31-tahrir-muddati-audit-bildirishnoma.sql
psql "$DATABASE_URL" -X -1 -v ON_ERROR_STOP=1 -f supabase-migration-32-reviziya-tasdiq-direct-sale.sql
psql "$DATABASE_URL" -X -1 -v ON_ERROR_STOP=1 -f supabase-migration-33-taminotchi-zaklad.sql
psql "$DATABASE_URL" -X -1 -v ON_ERROR_STOP=1 -f supabase-migration-34-mijoz-haqi.sql
psql "$DATABASE_URL" -X -1 -v ON_ERROR_STOP=1 -f supabase-migration-35-diller-ombor-atomik.sql
psql "$DATABASE_URL" -X -f supabase-migration-25-verify.sql      # hamma qatorda ok = t (73 ta)
```

**SQL Editor orqali** (Supabase → **SQL Editor → New query**): har bir faylni alohida so'rovda, boshiga `begin;`, oxiriga `commit;` qo'shib → **Run**. Xato chiqsa — `rollback;` ni ishga tushiring va to'xtang. Tartib:
1. `supabase-migration-24-v11-cash-authority.sql`
2. `supabase-migration-25-v23-hardening.sql` (24 siz — xato beradi)
3. `supabase-migration-26-expense-categories.sql` (24/25 ga bog'liq emas, faqat `staff` jadvali kerak)
4. `supabase-migration-27-f4b-ledger-authority.sql` (24 va 25 siz — aniq xato bilan to'xtaydi)
5. `supabase-migration-28-firma-kassa-asosiy.sql` (23, 25 va 27 siz — aniq xato bilan to'xtaydi)
6. `supabase-migration-29-hisobdan-chiqarish-b2b.sql` (27 va 28 siz — aniq xato bilan to'xtaydi)
7. `supabase-migration-30-diller-tolov-xabarnomasi.sql` (24 va 25 siz — aniq xato bilan to'xtaydi)
8. `supabase-migration-31-tahrir-muddati-audit-bildirishnoma.sql` (27 siz — aniq xato bilan to'xtaydi)
9. `supabase-migration-32-reviziya-tasdiq-direct-sale.sql` (31 dan keyin)
10. `supabase-migration-33-taminotchi-zaklad.sql` (32 dan keyin)
11. `supabase-migration-34-mijoz-haqi.sql` (33 dan keyin)
12. `supabase-migration-35-diller-ombor-atomik.sql` (27 va 34 siz — aniq xato bilan to'xtaydi)

> ⚠️ 27 qo'llangandan keyin 24 yoki 25 ni qayta ishga tushirsangiz, eski nomli funksiyalar (`sale_checkout_atomic_v2`, `cash_payment_atomic`) eski holatiga qaytadi. Yangi kod ishlatadigan funksiyalarga (`sale_checkout_atomic_v3`, `cash_payment_atomic_v2`, `sale_*_atomic`, `stock_debt_op`) ta'sir qilmaydi, lekin **har doim oxirida 27, 28 va 29 ni qayta ishga tushiring** (PG16 da sinalgan: to'liq tiklanadi). Firma kassada xarajat yoki ta'minotchi to'lovi yozuvi paydo bo'lgandan keyin 25 ni qayta ishga tushirish (bitta tranzaksiyada) **rad etiladi** va hech narsa o'zgarmaydi — bu kutilgan himoya. Hisobdan chiqarish va B2B yozuvlari bor bazada 27 ni qayta ishga tushirish xatosiz o'tadi va 29 ning amal turlarini o'zgartirmaydi (PG16 da tekshirilgan).

> SQL Editor'ning o'zi butun so'rovni bitta tranzaksiyada bajarishi **NOT VERIFIED** — shuning uchun `begin;`/`commit;` ni aniq yozing.

To'rttalasi ham ma'lumot o'chirmaydi va qayta ishga tushirilsa zarar qilmaydi. Dalil (`tests/evidence/migration-chain-rehearsal.js`, haqiqiy PostgreSQL 16, UTF8): production sxemasi nusxasi (35/21/102/81 — productiondagi son bilan bir xil) → 24 → 25 → 26 → 27 → 28 → 29 → 30 xatosiz, verify 57/57, `app_data`/`staff`/`dealers` bayt-ma-bayt bir xil, qayta ishga tushirish sxema va ma'lumotni o'zgartirmaydi, yakuniy sxema = `supabase/schema.sql`.

29-migratsiya nima qiladi (`docs/B2B-HISOBDAN-CHIQARISH.md`):
- `stock_writeoffs` + `stock_writeoff_atomic` / `stock_writeoff_cancel` — hisobdan chiqarish: ombor (FIFO) va hujjat bitta tranzaksiyada, zarar serverda; bekor qilish o'sha partiyalarga.
- B2B: `b2b_links` (kalitlar faqat xesh), `b2b_orders`, `b2b_shipments`, `b2b_product_map`, `b2b_inbound_log`; `b2b_ship_atomic`, `b2b_receive_atomic`, `b2b_ack_apply`, `b2b_restock_atomic` — qarz faqat qabul qilingan son bo'yicha.
- Ruxsat kalitlari: `ombor.writeoff`, `b2b.view`, `b2b.order`, `b2b.ship` (egasi va administrator; ombor mudiri — hisobdan chiqarish).
- Ma'lumot o'chirmaydi; barcha yangi jadval/funksiyalar — faqat `service_role`. Dalil: `tests/evidence/writeoff-b2b-real-postgres.js` (PG16, parallel) — 10/10.

28-migratsiya nima qiladi (Bosh kassa — asosiy kassa, `docs/FIRMA-KASSA-ASOSIY.md`):
- Firma kassa jurnaliga yangi amal turlari: `expense` (xarajat), `supplier_payment` (ta'minotchi qarzi); manba turlari `expense`, `supplier_payment`, `partner_deposit`.
- `firma_supplier_pay` — Firma kassasidan ta'minotchi qarzini to'lash: kassa chiqimi va qarz jurnali **bitta tranzaksiyada**, qarzdan ortiq yoki kassada yetmasa — rad, takror so'rov — o'sha natija.
- `firma_kassa_reverse_expense` — Firma kassadagi xarajatni bekor qilish (faqat Xarajatlar bo'limidan o'chirilganda). Umumiy «bekor qilish» xarajat va ta'minotchi to'lovini rad etadi (xarajat yozuvi va qarz jurnali bilan nomuvofiqlik bo'lmasin).
- Ma'lumot o'chirmaydi; faqat `service_role` chaqira oladi. Dalil: `tests/evidence/firma-kassa-real-postgres.js` (PG16, parallel to'lov) — 11/11.

27-migratsiya nima qiladi (F4b — `docs/F4B-INVENTAR.md`):
- Yangi o'zgarmas jurnallar: `customer_debt_ledger` (so'm), `supplier_debt_ledger` ($), `stock_ledger` (partiya `qty/sold`), `ledger_ops` (murakkab amal natijasi — takror so'rov replay).
- `customer_balances` / `supplier_balances` / `batches` — haqiqiy qiymat; ularni jurnalsiz o'zgartirish **trigger bilan rad etiladi** (eski shadow-sync ham).
- `sales` jadvaliga savdo hujjati ustunlari (`local_id`, to'lov turi, kassa, aralash to'lov, holat) — qaytarish/tahrir/o'chirish serverdagi yozuvdan.
- Funksiyalar: `sale_checkout_atomic_v3`, `sale_return_atomic`, `sale_void_atomic`, `sale_edit_atomic`, `stock_debt_op`, `cash_payment_atomic_v2` (qarz qatori qulflanadi), `app_data_save_main` (brauzer saqlashi `branchDebt`ni yozmaydi). Eski `sale_checkout_atomic_v2` va `cash_payment_atomic` — yangilariga yo'naltiriladi.
- **Boshlang'ich ko'chirish:** hozirgi JSON'dagi mijoz/ta'minotchi qarzi, partiyalar va savdolar — 'opening' yozuvi bilan. JSON'da yo'q eskirgan SQL "soya" qatorlari: qarz 0 ga tenglashtiriladi (eski qiymat izohda), partiya `deleted` (FIFO'dan chiqadi), hech biri o'chirilmaydi.
- Ruxsatlar: barcha yangi jadval/funksiyalar — faqat `service_role`; `customer_balances`, `supplier_balances`, `batches`, `sales` — anon/authenticated'dan olinadi (ikkinchi qatlam; RLS allaqachon yopiq).

26-migratsiya nima qiladi: yangi `expense_categories` jadvali (filial + xarajat turi bo'yicha, faol nomlar noyob — katta-kichik harf va apostrof turi farqsiz, idempotent yaratish, nofaol qilish, `staff` tashqi kaliti, RLS — brauzerga yopiq, faqat server). Baza UTF8 bo'lmasa — xato bilan to'xtaydi (Supabase — UTF8).

25-migratsiya nima qiladi:
- `firma_kassa_ledger`ga manba (`source_type`, `source_ref`) va bekor qilish ustunlarini qo'shadi. Eski yozuvlarga ham manba yoziladi.
- Firma va filial kassa jurnallarini **o'zgarmas** qiladi: UPDATE/DELETE rad etiladi, tuzatish faqat teskari yozuv bilan.
- Yangi funksiyalar: `firma_kassa_reverse`, `branch_firma_loan`, `firma_kassa_branch_summary`, `cash_payment_atomic`.
- `customer_debt_payments.customer_local_id` va `supplier_payments.supplier_local_id` ustunlarini `integer` → `bigint` qiladi (kengaytirish, ma'lumot yo'qolmaydi).
- `dealer_payments.idem_key` ustunini qo'shadi (unique).
- Ruxsatlarni toraytiradi: brauzer ishlatmaydigan hamkor, diller va login jadval/funksiyalaridan anon/authenticated ruxsatlarini oladi. Diller portali uchun o'qish va buyurtma yuborish saqlanadi.

## 3-qadam — tekshirish (15 daqiqa)
1. `supabase-migration-25-verify.sql` → hammasi `true` (24, 25, 26 va 27 tekshiruvlari — 46 ta).
1b. **F4b:** Mijozlar → qarzi bor mijozni oching — Supabase `select debt from customer_balances where customer_local_id=<id>` bilan bir xil. Ikki qurilmada bir mijozga bir vaqtda qarzdan ko'p jami to'lov → ikkinchisi rad ("qarzidan oshib ketdi"). Brauzer konsolida `S.customers[0].debt = 9e9; save()` → sahifani yangilang → qarz o'zgarmagan. Ombor: oxirgi donani ikki qurilmadan bir vaqtda sotish → ikkinchisi "yetarli qoldiq yo'q". Qaytarish → `select * from stock_ledger order by id desc limit 3` — yangi partiya `sale_return`.
1a. Xarajatlar → Do'kon → ro'yxatda tayyor kategoriya yo'q → "+ Kategoriya qo'shish" → "Kamunal" → Saqlash → tanlangan. Supabase: `select * from expense_categories` — filial va muallif bilan. Sahifani yangilang — kategoriya joyida. "⚙️ Kategoriyalar" → nomini o'zgartiring → eski xarajat yangi nom bilan; ishlatilgan kategoriyani o'chiring → "nofaol".
2. `/.netlify/functions/health` → `{"ok":true}`.
3. Mijozlar → qarzi bor mijoz → 1 000 so'm to'lov. Supabase: `select * from customer_debt_payments order by id desc limit 1` — yozuv bor, `idem_key` = `ops:...`. Qarzdan ortiq summa → rad etiladi.
4. Ta'minotchi to'lovi va diller to'lovi — xuddi shunday. Diller qarzi `dealers.debt_usd`da kamaygan bo'lishi kerak.
5. Kassalar → Kunlik hisob → qoldiqdan ortiq summa → **rad** (avval jimgina qisqartirilardi).
6. Firma kassasi → yozuv yonida "Manba" ko'rinadi. Sinov yozuvi (Kirim 1$) → **Bekor qilish** → teskari yozuv paydo bo'ladi, qoldiq tiklanadi.
7. Filialga o'ting → Kassalar → "Baza bilan hisob-kitob" kartasi (tovar qarzi, pul qarzi). Admin: "Bazadan qarz olish" 1$ → "Qarzni qaytarish" 1$.
8. Filialda → Hamkorlar → faqat shu filial hamkorlari ko'rinadi (bo'sh bo'lishi mumkin). Bazada → eski 3 hamkor joyida.
9. Sozlamalar → Telegram → token maydoni bo'sh, "o'rnatilgan" yozuvi bor → **Tekshirish** → Telegramga xabar keladi.
10. Brauzer konsolida `S.cashboxes[0].bal = 999999; save()` → sahifani yangilang → qoldiq o'zgarmagan (F4).
11. Netlify → Logs → Functions: qizil xato yo'q; `cash_payment_atomic yo'q` ogohlantirishi yo'q.

## Orqaga qaytarish (rollback)
- **Kod:** Netlify → Deploys → oldingi deploy → **Publish deploy**. 25-migratsiya eski (v11) kod bilan mos:
  - eski kod `cashbox_apply_ops`dan foydalanadi, u o'zgarmagan;
  - olingan ruxsatlarni eski kod ham ishlatmaydi.
- **Ehtiyot:** 24-migratsiyadan keyin eski kodning `cashbox-transact` va `*-payment-add` endpoint'lari 410 qaytaradi (v23 qoidasi shu fayllarda). Eski deploy'ga qaytilsa, ular eski holatda ishlaydi.
- **27 dan keyin eski kodga qaytish — tavsiya etilmaydi:** eski kodda sotuvchi savdosi omborsiz (faqat kassa) o'tadi va qarz/ombor yana brauzer JSON'ida yuritiladi (F4b qaytadi); baza triggerlari SQL qoldiqni himoya qiladi, lekin ilova ko'rinishi bazadan ajraladi. Muammo bo'lsa — yangi kodni tuzating (powerful fix).
- **Baza:** jadval va jurnallarni **o'chirmang** — bu moliyaviy tarix. 25-migratsiyani "qaytarish" kerak bo'lsa, faqat:
  ```sql
  -- favqulodda: jurnal o'zgarmasligini vaqtincha o'chirish (keyin albatta qayta yoqing)
  alter table public.firma_kassa_ledger disable trigger firma_kassa_ledger_immutable;
  alter table public.cashbox_ledger disable trigger cashbox_ledger_immutable;
  -- firma_kassa_ledger_defaults triggerini O'CHIRMANG: manba ustuni majburiy (CHECK)
  ```
  - `bigint` ustunlarni `integer`ga qaytarmang (ilova ID'lari sig'maydi).
  - Ruxsatlarni qaytarish kerak emas (hech bir kod ishlatmaydi).
