# Yuklama va xarajatga tayyorlik (v25.2)

Sharoit: **bepul tarif** (Netlify Free + Supabase Free), **20 xodim**. Maqsad — kutilmagan yuklamada sayt yiqilmasin,
xato bo'lsa egasi darhol bilsin, hech qachon kutilmagan to'lov chiqmasin.

## 1. Nima qilindi (kodda)

| Qism | Qayerda | Nima beradi |
|---|---|---|
| So'rovlar cheklovi | `netlify/functions/_lib/monitor.js` | IP bo'yicha: umumiy 5 daqiqada 1200, `health` 1 daqiqada 30, `staff-login` 5 daqiqada 40, `staff-whoami` 150, `pw-reset` 30, `client-error` 20. Oshsa — 429 + `Retry-After`. Cron chaqiruvlari cheklanmaydi. |
| Server xatolari | `_lib/monitor.js` (65 funksiyaning hammasi o'ralgan) | 500+ javob yoki kutilmagan xato → jurnal (`ops_events`) + egasiga Telegram. Bir xil xato — 10 daqiqada ko'pi bilan 1 xabar. |
| Sekin javob | `_lib/monitor.js` | 8 soniyadan uzoq (Netlify 10 soniyada uzadi) → soatiga 1 xabar. |
| Brauzer xatolari | `js/fw-err.js` → `client-error` | Xodim telefonida sahifa xato bersa — egasi biladi (30 daqiqada 1 xabar, sahifa ochilishida ko'pi bilan 5 ta). |
| Telegram navbati | `_lib/opsGuard.js`, `_lib/tgEvents.js`, `telegram-daily-report.js` | Xabar vaqtincha yuborilmasa (tarmoq, 429, 5xx) — `tg_outbox` ga tushadi, soatlik ish 10/20/40/80 daqiqa oralig'ida qayta yuboradi; 5 urinishdan keyin — «yuborilmadi». |
| Tizim holati | kunlik hisobotdan keyin | Baza va rasmlar hajmi bepul chegaraga nisbatan (%), 24 soatdagi xatolar, sekin javoblar, cheklangan so'rovlar, navbat. 400 MB / 800 MB dan oshsa — ogohlantirish. |
| Tozalash | `ops_cleanup()` (soatlik) | Jurnal 30 kun, yuborilgan xabarlar 7 kun saqlanadi — baza o'smaydi. |
| JS/CSS kesh | `scripts/build.js` → `dist/h/`, `netlify.toml` | Xeshli nomlar, 1 yil o'zgarmas kesh: qayta ochilganda JS/CSS serverdan so'ralmaydi. Yangi deployda nom o'zgaradi. |
| Rasmlar kesh | `js/main.js`, `js/dokon.js` | Galereya, banner, logo (noyob nom) — 1 yil kesh. |
| Baza ulanishlari | — | Funksiyalar bazaga `supabase-js` (HTTPS) orqali boradi, ulanishlar pulini Supabase o'zi boshqaradi — serverless ulanishlarni tugatmaydi. |

Hammasi **asosiy ishni buzmaydi**: kuzatuv murojaatlari qisqa vaqt chegarasi bilan, baza javob bermasa — o'tkazib yuboradi
(fail-open). 48-migratsiya qo'llanmagan bo'lsa ham sayt avvalgidek ishlaydi.

**Favqulodda o'chirish:** Netlify → Site configuration → Environment variables → `FW_OPS_ON = 0` (keyin qayta deploy).

**Ogohlantirishlar qaysi guruhga:** egasining asosiy guruhi (`tgChatId`). Alohida texnik guruh kerak bo'lsa — sozlamalarga
`tgOpsChatId` qo'shiladi (hozircha faqat server sozlamasi).

## 2. Deploy tartibi

1. Supabase → SQL Editor → `supabase-migration-48-ops.sql` (faqat yangi jadval/funksiya, takror ishga tushirish xavfsiz).
2. Netlify deploy (funksiyalar: 65).
3. Tekshirish: `/.netlify/functions/health` → `ok: true`; ertasi kuni kunlik hisobotdan keyin «🖥 Tizim holati» xabari keladi.

## 3. Xarajat — bepul tarifda kutilmagan to'lov bo'lmaydi, lekin chegara bor

| Xizmat | Bepul tarif xulqi | Qilish kerak |
|---|---|---|
| Supabase Free | Pul yechilmaydi. Chegaralar: baza 500 MB, fayllar 1 GB, oylik trafik 5 GB. 1 hafta faolsiz bo'lsa loyiha «uxlaydi» (bizda har soat cron bor — uxlamaydi). | Hech narsa; «Tizim holati» xabari hajmni kuzatadi. Pro'ga o'tilsa — **Billing → Spend Cap yoqiq** qolsin. |
| Netlify Free | Pul yechilmaydi, lekin oylik chegara (funksiya chaqiruvlari, trafik, build daqiqalari) tugasa — **sayt keyingi oygacha to'xtaydi**. | Netlify'da jamoaning Usage (foydalanish) sahifasini oyda bir ko'ring; foydalanish chegarasiga yaqinlashganda email ogohlantirish yoqilgan bo'lsin (Team settings ichida; nomi tarifga qarab farq qilishi mumkin). |
| Telegram | Bepul. Chegara: bitta chatga soniyasiga ~1, jami ~30 xabar. | Navbat bor — oshib ketsa xabar yo'qolmaydi. |

20 xodim uchun taxminiy oylik foydalanish: funksiya chaqiruvlari ~30–60 ming (cron 1 440 + xodimlar), trafik 1–3 GB
(JS/CSS endi keshdan) — bepul chegaralar ichida.

## 4. Tashqi kuzatuv (5 daqiqa, bepul) — o'zingiz qilasiz

**UptimeRobot** (uptimerobot.com, bepul): New monitor → HTTP(s) → URL
`https://powerful-pro.netlify.app/.netlify/functions/health` → interval 5 daqiqa → Alert contacts: Telegram yoki email.
Sayt yoki baza ishlamay qolsa — 5 daqiqa ichida xabar keladi (ilovaning o'zi yiqilganda ham ishlaydi).
`health` 1 daqiqada 30 so'rovgacha ruxsat beradi — 5 daqiqalik tekshiruv bemalol sig'adi.

Sentry kerak emas: server va brauzer xatolari allaqachon Telegram'ga keladi. Kerak bo'lsa keyin qo'shiladi.

## 5. Yuklama testi (k6)

**Hech qachon ishlayotgan saytda emas** — testlar savdo yozadi. Skriptlar `powerful-pro.netlify.app` ni ko'rsa, hech
narsa yubormay to'xtaydi.

Sinov muhiti (bepul):
1. Supabase'da ikkinchi bepul loyiha (`powerful-test`) → `supabase/schema.sql` → sinov xodimi va sinov mahsuloti (qoldiq 10 000).
2. Netlify'da shu repo'dan sinov sayti (yoki deploy preview), muhit o'zgaruvchilari — sinov Supabase'iniki.

Ishga tushirish (k6: https://k6.io/docs/get-started/installation/):

```bash
# 1) Ertalab hamma kiradi: 20 → 50 → 100 → 200 foydalanuvchi, ~15 daqiqa
k6 run -e BASE_URL=https://<sinov-sayt> -e LOGIN=<sinov_login> -e PASSWORD=<parol> tests/load/k6-oqish.mjs
# 2) Kassa eng band payt: soniyasiga 2 → 5 → 10 → 20 savdo
k6 run -e BASE_URL=... -e LOGIN=... -e PASSWORD=... -e PID=<mahsulot id> -e SELL_USD=10 tests/load/k6-savdo.mjs
# 3) Himoya: chegaradan keyin 429 qaytadimi
k6 run -e BASE_URL=... tests/load/k6-himoya.mjs
```

Mezonlar: 95% so'rov 800 ms dan tez (ma'lumot yuklash — 1,5 s), xato 1% dan kam. Natijani o'qish:
* qaysi bosqichda `http_req_duration` yoki `http_req_failed` chegaradan chiqdi — o'sha «sinish nuqtasi»;
* savdo testidan keyin sinov bazasida: savdolar soni = `savdo_ok`, ombor qoldig'i = boshlang'ich − `savdo_ok` (takror yozuv yo'q);
* 20 xodim uchun kutilgan: 20–50 foydalanuvchi bemalol; 100+ da birinchi bo'lib `app_data` (bitta JSON yozuv) sekinlashishi
  kutiladi — aniq javobni test beradi.

## 6. AI xizmatlari (hozir yo'q — qo'shilsa, majburiy qoidalar)

1. Kalit faqat serverda (Netlify muhit o'zgaruvchisi), brauzerga chiqmaydi — `_lib/supabaseAdmin.js` uslubida.
2. Har chaqiruvdan oldin `ops_rate_hit('ai:<xodim id>', 50, 86400)` — xodimga kuniga 50 so'rov; umumiy `ops_rate_hit('ai:all', 500, 86400)`.
3. Har so'rovda `max_tokens` qat'iy (masalan 1 000), vaqt chegarasi 20 soniya.
4. Provayder kabinetida oylik sarf chegarasi (masalan Anthropic Console → Limits) — kod xato qilsa ham shu summadan oshmaydi.
5. Qayta urinish ko'pi bilan 3 marta (oraliq o'sib boradi); ketma-ket 5 xato — 10 daqiqa to'xtatish.
6. Bot o'z xabariga javob bermaydi (sikl bo'lmasin); AI javobi boshqa AI chaqiruvini avtomatik boshlamaydi.

## 7. Keyingi bosqich (hozir shart emas)

`app_data` — butun sozlama va filial ma'lumoti bitta JSON yozuvda (hozir 3 KB). Savdo, kassa, qarzlar allaqachon alohida
jadvallarda. JSON 1 MB dan oshsa yoki k6 testida 409 (ziddiyat) ko'paysa — qolgan bo'limlarni ham jadvallarga ko'chirish kerak.
