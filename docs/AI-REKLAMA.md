# AI-reklama moduli — reja (v25.8)

Holat: **reja tasdiqlangan (2026-11-23).** 1-bosqich bajarildi; keyingi bosqichlar — ketma-ket.
Maqsad: onlayn-do'kon mahsulotidan Telegram kanal uchun foto-post yoki Reels video, Instagram uchun esa
saqlab beriladigan fayl. Hammasi Netlify Free + Supabase Free ichida, oyiga 0 so'm (AI — ixtiyoriy).

---

## 1. O'qilgan joylar va ulardan chiqqan xulosalar

| Joy | Xulosa (rejaga ta'siri) |
|---|---|
| `_lib/shopPublic.js` (`catalogCtx`, `publicProduct`, `shopPriceUsd`) | Vitrina narxi, chegirma, eski narx, valyuta, ko'p olganda narx, qoldiq va «vitrinada ko'rinadimi» qoidasi **allaqachon serverda**. Nomzod va narx shu funksiyalar orqali hisoblanadi — yangi narx mantig'i yozilmaydi. |
| `telegram-announce.js` | Mahsulot e'loni hozir **hisobot boti** (`tgBotToken`) bilan `tgAnnounceChats` ga ketadi; havola — `tgAnnounceLink` shabloni yoki vitrina. AI-reklama ham shu uslubda yoziladi (idempotency, audit, bildirishnoma). |
| `shop-bot.js` | Do'kon boti tokeni (`shopBotToken`) faqat serverda; brauzerga qaytmaydi. |
| `_lib/monitor.js` | Har funksiya `wrap()` bilan o'raladi (cheklov, xato, sekinlik). Yangi funksiyalar ham o'raladi. |
| `_lib/scheduledGuard.js` | Jadval funksiyasi faqat Netlify cron shaklida ishlaydi (boshqa so'rov — 404), soatiga bitta urinish. |
| `_lib/opsGuard.js` (`tg_outbox`) | Navbat **faqat matn** (`sendMessage`) yuboradi — rasm/video uchun kengaytirish kerak (6-bo'lim, savol 4). |
| `_lib/appDataGuard.js` | `app_data.settings` ni faqat `sozlamalar.edit` o'zgartiradi. Shuning uchun AI-reklama sozlamalari **alohida jadvalda** (reklama.settings huquqi bilan). |
| `netlify.toml` | CSP: `connect-src 'self' https://*.supabase.co` — brauzer Supabase Storage'ga yuklay oladi, Telegram/AI'ga chiqmaydi (kerak ham emas). `img-src https:`, `media-src 'self' blob:` — canvas va video preview uchun yetadi. **CSP o'zgarmaydi.** Cron: `:05` (kunlik hisobot), `:35` (zaxira). |
| `scripts/build.js` | Sahifadagi `js/*.js` lar xeshli nusxaga o'tadi — yangi `js/ai-reklama*.js` ham avtomatik. `assets/` to'liq ko'chiriladi. |
| `js/dokon.js` (`pgDokon`, `S.dkTab`) | Tablar: Cheklar / Sharhlar. «AI-reklama» shu qatorga uchinchi tab bo'ladi. |
| `js/vitrina.js` | Mahsulot sahifasiga `dokon.html?s=<slug>#p=<id>` havolasi **allaqachon ishlaydi** — «Buyurtma berish» tugmasi shunga olib boradi. |
| Mahsulot yozuvi | `createdAt` maydoni **yo'q**. `id` — `uid()` (vaqt × 1000) bo'lsa qo'shilgan vaqt shundan; aks holda — birinchi kirim (partiya) sanasi. «Vitrinadan yashirish» belgisi **yo'q** — vitrina qoidasi: arxiv, Direct Sale, qoldiqsiz, narxsiz chiqmaydi. |
| Rasm proksi | Serverda rasm proksi **yo'q**. Mahsulot rasmlari asosan Supabase Storage'da (ochiq bucket, CORS ruxsat) — canvas'ga to'g'ridan tushadi; boshqa saytdagi rasm uchun `ai-ads` ga `img` amali qo'shiladi (8-bo'lim). |

---

## 2. Arxitektura (qisqa)

```
Brauzer (js/ai-reklama.js)                         Server (Netlify)                         Supabase
 ├─ nomzodlar ro'yxati  ── ai-ads:candidates ──▶  narx/qoldiq/mezon (shopPublic)  ◀── app_data, batches, sales, ai_ad_posts
 ├─ matn                ── ai-ads:text ────────▶  AI (7 s) yoki shablon; limit RPC ──▶ ai_usage
 ├─ canvas: 1:1, 9:16 (shablonlar JSON)
 ├─ video: canvas + MediaRecorder (faqat MP4) + WebAudio musiqa
 ├─ foto: JPEG ≤300 KB  ── ai-ads:publish ─────▶  narx/qoldiq QAYTA tekshiruv → sendPhoto (multipart)
 ├─ video: MP4 ≤20 MB   ── ai-ads:upload_url ──▶  imzolangan yuklash manzili ──────────▶ Storage ai-ads-tmp/{uuid}.mp4
 │                      ── ai-ads:publish ─────▶  sendVideo (URL) → faylni DARHOL o'chiradi
 └─ «Saqlash» (fayl / Web Share) — Instagram uchun, API yo'q
                                                 ai-ads-cron (soatlik, :20) ── avtopilot + 1 soatdan eski vaqtinchalik fayllarni o'chirish
```

Qoidalar: AI kaliti va bot tokeni faqat serverda; narx va qoldiqni faqat server hisoblaydi; brauzer tashqi
saytlarga chiqmaydi; video va post rasmlari doimiy saqlanmaydi (bazada faqat matn, metadata, tarix).

---

## 3. Fayllar

| Fayl | Yangi / o'zgaradi | Nima |
|---|---|---|
| `netlify/functions/ai-ads.js` | yangi | Bitta funksiya, amallar: `candidates`, `text`, `img`, `upload_url`, `publish`, `drafts`, `draft_action` (tasdiqlash/tahrir/o'tkazish), `history`, `settings_get`, `settings_save`, `status` |
| `netlify/functions/ai-ads-cron.js` | yangi | Jadval (soatlik, `20 * * * *`): avtopilot + vaqtinchalik fayllar tozalash + 24 soatlik qoralamalarni bekor qilish |
| `netlify/functions/_lib/aiAds.js` | yangi | Nomzod tanlash, caption yig'ish, narx/qoldiq qayta tekshiruvi (ai-ads va cron uchun umumiy) |
| `netlify/functions/_lib/aiText.js` | yangi | Bitta AI adapter (`AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_MONTHLY_LIMIT`=300), JSON sxema tekshiruvi, raqam/narx tozalash |
| `netlify/functions/_lib/aiPrompts.js` | yangi | Prompt matnlari (uz-lotin, ru) |
| `netlify/functions/_lib/adTemplates.js` | yangi | AI'siz matnlar: 4 tur (chegirma, yangi, top, turib qolgan) × 2 til × 10+ variant |
| `netlify/functions/_lib/opsGuard.js` | o'zgaradi | `flushOutbox` — `method` + `payload` bo'lsa sendPhoto/sendVideo ham (savol 4) |
| `js/ai-reklama.js` | yangi | Modul UI: Yangi post, Navbat, Tarix, Sozlamalar, «Bu qanday ishlaydi»; canvas, video, yuborish |
| `js/ai-reklama-shablonlar.js` | yangi | 8 ta shablon (JSON): chegirma, yangi, top, minimal, katta narx, 2 rasm kollaj, turib qolgan, story |
| `index.html` | o'zgaradi | 2 ta `<script>` |
| `js/dokon.js` | o'zgaradi | «AI-reklama» tab (faqat `reklama.view` bo'lsa) |
| `css/design-system.css` | o'zgaradi | Modul uslublari (telefon 360 px birinchi) |
| `assets/ai-reklama/musiqa/` | yangi | 3–5 trek + `README.md` (litsenziya) — savol 3 |
| `netlify.toml` | o'zgaradi | `[functions."ai-ads-cron"] schedule = "20 * * * *"` (`:05` va `:35` bilan to'qnashmaydi). **CSP o'zgarmaydi.** |
| `supabase-migration-58-ai-reklama.sql` | yangi | 4-bo'lim |
| `supabase/schema.sql` | o'zgaradi | 58 qo'shiladi (noldan o'rnatish) |
| `scripts/deploy-netlify.sh`, `tests/p48`, `p49`, `p89` | o'zgaradi | Funksiyalar soni **69 → 71** |
| `tests/p137…` (yangi testlar) | yangi | 9-bo'lim |
| `CHANGES.md`, `DEPLOY.md`, `docs/AI-REKLAMA.md` | o'zgaradi | Oxirida — egasi uchun yo'riqnoma |

**Nega 2 ta funksiya, bitta emas:** Netlify jadval funksiyasi oddiy HTTP so'rov bilan chaqirilmaydi (loyihada ham
`scheduledGuard` boshqa so'rovni 404 qiladi). Shuning uchun HTTP amallar — `ai-ads`, avtopilot — `ai-ads-cron`.

---

## 4. Baza — `supabase-migration-58-ai-reklama.sql`

Hammasi `if not exists` / `create or replace` — takror ishga tushirish xavfsiz. Faqat ASCII.

```
ai_ad_posts
  id uuid pk, branch_id text, product_id bigint, format text ('photo'|'video'|'autophoto'),
  template text, caption text (≤1024), price_snapshot jsonb ({price, old, cur, line}),
  status text ('draft'|'sent'|'failed'|'skipped'|'expired'), source text ('manual'|'autopilot'),
  tg_message_id bigint, tg_chat text, error text, created_by text, created_at, sent_at, expires_at
  index (branch_id, product_id, created_at), (status, created_at)
ai_usage
  month text pk ('YYYY-MM'), count int, limit_n int, updated_at
ai_ad_settings
  branch_id text pk, data jsonb (kanal, til, avtopilot soatlari, kunlik soni, rejim, mezonlar), updated_at, updated_by
```

RPC (hammasi `security definer`, faqat `service_role`):
* `ai_usage_take(p_month, p_limit)` → `{ok, count}` — bitta tranzaksiyada: limitdan kam bo'lsa +1.
* `ai_usage_release(p_month)` — AI xato bersa −1 (hisobdan chiqmaydi).
* `ai_ad_recent(p_branch, p_days)` — oxirgi N kunda reklama qilingan tovarlar.

RLS: uchala jadvalda yoqilgan, siyosat yo'q; `anon`/`authenticated` dan huquq olib tashlanadi. O'qish ham faqat
`ai-ads` orqali (RBAC tekshiriladi) — brauzer jadvalni to'g'ridan o'qimaydi.

Storage: `ai-ads-tmp` bucket — **yopiq** (public emas), brauzerga siyosat berilmaydi. Yuklash faqat server bergan
imzolangan manzil (`createSignedUploadUrl`, 1 fayl, ≤20 MB, `.mp4`) bilan; Telegram'ga imzolangan o'qish manzili (5 daqiqa).

`ops_cleanup()` ga: `delete from ai_ad_posts where created_at < now() - interval '90 days'`.

RBAC: `permissions` ga `reklama.view`, `reklama.create`, `reklama.publish`, `reklama.settings` (modul «reklama»).
Hech bir rolga avtomatik berilmaydi (deny-by-default) — admin hammasini ko'radi, xodimga egasi Rollar oynasida beradi.

---

## 5. Bosqichlar

### 1-bosqich — tovar tanlash (server) · commit «v25.8: AI-reklama — nomzodlar (server)»
* 58-migratsiya (jadvallar, RPC, ruxsatlar), `ai-ads` (`candidates`, `settings_get/save`, `status`), `_lib/aiAds.js`.
* Mezonlar (Sozlamalarda o'zgaradi): chegirma (`shop.discounts`), yangi (14 kun), turib qolgan (qoldiq > 0, 30 kun sotilmagan —
  `sales.items` jurnali + partiyalar), ko'p sotiladigan (30 kun, top 10).
* Chiqmaydi: rasmsiz, qoldiqsiz, vitrinada ko'rinmaydigan (`publicProduct` null qaytargan). 7 kunda reklama qilingani — pastga.
* Har nomzod: `{pid, name, img, reason, price, old, cur, line}` — narxni server hisoblaydi.
* Funksiyalar soni testlari 69 → 71 (cron 5-bosqichda qo'shiladi; 1-bosqichda 70).

### 2-bosqich — matn · «v25.8: AI-reklama — matn (AI ixtiyoriy)»
* `aiText.js`: provayderlar `gemini` (bepul tarifi bor), `anthropic`, `openai` — bitta interfeys. Kalit yo'q → shablon rejimi.
* AI'ga faqat: nom, brend, kategoriya, sabab (chegirma/yangi/top/turib qolgan), til. **Narx, telefon, manzil berilmaydi.**
* Javob: qat'iy JSON `{title ≤40, body 2–3 qator, tags 3–5}`; sxema xato → shablon. Javobdagi raqam/narxga o'xshash
  satrlar (`\d`, `so'm`, `$`, `%`, `сум`, telefon) o'chiriladi.
* Limit: `ai_usage_take` → AI → xato bo'lsa `ai_usage_release`. Limit tugasa — shablon, UI'da «AI limiti tugadi».
* Vaqt: AI so'rovi `AbortController` bilan 7 s; Netlify 10 s ichida qoladi.

### 3-bosqich — kontent brauzerda · «v25.8: AI-reklama — canvas va video»
* `ai-reklama.js` + `ai-reklama-shablonlar.js`: 1080×1080 va 1080×1920; brend rang/logo `FW_BRAND` dan.
* Rasm: `crossOrigin='anonymous'`; canvas «tainted» bo'lsa — `ai-ads:img` (faqat shu mahsulotning bazadagi rasmi,
  https, ≤1,5 MB, `image/*`); bo'lmasa — aniq xabar «Rasm yuklanmadi: <mahsulot>».
* Matn: `o‘ g‘ ʼ` va kirill — tizim shrifti; uzun nom 2 qator, sig'masa «…».
* Video 8–15 s: Ken Burns, matn kirishi, narx «pop»; `MediaRecorder.isTypeSupported('video/mp4…')` yo'q bo'lsa — video
  tugmasi o'chadi + izoh. WebM yuborilmaydi.
* Preview ≤100 ms; yozish faqat «Yuborish»/«Yuklab olish» da, progress va «Bekor qilish» bilan. Narx maydoni tahrirlanmaydi.

### 4-bosqich — Telegram'ga nashr · «v25.8: AI-reklama — Telegramga yuborish»
* Foto: JPEG ≤300 KB (base64 ≈ 400 KB < 1 MB) → `publish` → sendPhoto (multipart, 7 s).
* Video: `upload_url` → brauzer Storage'ga yuklaydi → `publish` → sendVideo (imzolangan URL) → fayl darhol o'chiriladi.
* Caption tizimda: matn + narx satri + do'kon nomi + heshteglar; tugma «🛒 Buyurtma berish» → `dokon.html?s=<slug>#p=<id>`.
* Yuborishdan oldin narx va qoldiq qayta: narx o'zgargan — yangi narx bilan; qoldiq 0 — rad.
* Idempotency: `postId` bir marta (`idempotency_keys`). Xato — `tg_outbox` (savol 4).
* «Saqlash»: fayl yoki Web Share API (Instagram uchun).

### 5-bosqich — avtopilot · «v25.8: AI-reklama — avtopilot»
* `ai-ads-cron` soatlik `:20`; Toshkent vaqti; sukut 10:00 va 18:00; kuniga ko'pi bilan 3 (1–5).
* Serverda canvas yo'q → mahsulotning o'z rasmi `sendPhoto` URL bilan.
* Sukut — «tasdiqlash bilan»: qoralama + egasi guruhiga «Yangi reklama tayyor — tasdiqlang» (panel havolasi
  `/#dokon` → AI-reklama → Navbat). 24 soatda tasdiqlanmasa — `expired`.
* «To'liq avtomat» — alohida yoqiladi, ogohlantirish bilan. Bir tovar 7 kunda bir marta. Kanal/token yo'q — yoqilmaydi.
* Vaqt: bitta cron chaqiruvida ko'pi bilan 1 post; AI 4 s + Telegram 4 s (10 s ichida).

---

## 6. Xavflar va qarorlar

| Xavf | Qaror |
|---|---|
| Netlify 10 s | Har tashqi so'rov 7 s (cron'da 4 s) `AbortController`; bitta chaqiruvda bitta og'ir ish; serverda render yo'q. |
| Tana ≤1 MB | Foto JPEG ≤300 KB; video Storage orqali (funksiyaga kelmaydi); server 1 MB dan katta tanani rad etadi. |
| Storage 1 GB | Video vaqtincha: yuborilgach darhol o'chadi, qolgani soatlik tozalanadi (1 soatdan eski). Post rasmlari saqlanmaydi. |
| Baza 500 MB | Faqat matn va metadata; 90 kundan eskisi o'chadi. Taxminan 1 post ≈ 1 KB → yiliga ~1 MB. |
| AI xarajati | Ixtiyoriy; oylik limit (300) atomik; provayder kabinetida ham sarf chegarasi qo'yiladi (`docs/YUKLAMAGA-TAYYORLIK.md` §6). |
| AI noto'g'ri narx yozishi | AI'ga narx berilmaydi; javobdan raqamlar o'chiriladi; narx faqat tizimdan. |
| Canvas «tainted» | Supabase rasmlari CORS bilan; tashqi rasm — `img` proksi (faqat bazadagi URL, SSRF yo'q: domen tekshiruvi, https, hajm, tur). |
| MP4 yozish | Android Chrome (APK ham Chrome) yangi versiyalarida bor; yo'q bo'lsa — video o'chadi, foto ishlaydi. |
| `tg_outbox` faqat matn | 58 da `method`, `payload jsonb` ustunlari; foto (multipart) qayta yuborilmaydi — post `failed`, «Qayta yuborish» tugmasi brauzerdagi rasm bilan. |
| Funksiyalar soni | 69 → 71; p48/p49/p89 va `deploy-netlify.sh` yangilanadi. |
| Musiqa huquqi | Faqat litsenziyasi aniq trek (savol 3); bo'lmasa — musiqasiz video. |

---

## 7. Bepul tarifga ta'sir (taxminiy, oyiga)

| Resurs | Hisob | Natija |
|---|---|---|
| Funksiya chaqiruvlari | cron 720 + qo'lda ~30 post × ~6 so'rov ≈ 900 | ~1 600 (hozirgi ~30–60 ming ustiga, chegara 125 ming) |
| Storage | video vaqtincha ≤20 MB, bir vaqtda 1–2 ta | doimiy o'sish yo'q |
| Baza | ~100 post × 1 KB | < 1 MB |
| AI | ≤300 so'rov (limit) | Gemini bepul tarifida 0 so'm; pullik provayderda ≈ $0.1–0.5 |
| Telegram | bepul | — |

---

## 8. Egasining qarorlari (2026-11-23)

1. **Kanal:** hisobot boti (`tgBotToken`) yozadi. Sozlamada alohida «Reklama kanali» (filial bo'yicha); bo'sh bo'lsa —
   `tgAnnounceChats` ning birinchisi. Yuborishdan oldin `getChatMember`: bot kanalda admin va post yoza oladimi — yo'q bo'lsa aniq xato.
   Kanal ID — 4-bosqichdan oldin egasidan olinadi.
2. **Tasdiqlash xabari:** hisobot boti orqali egasi guruhiga (`tgChatId`), panel havolasi bilan.
3. **Musiqa:** brauzerda yaratiladigan kuy — kamida 3 kayfiyat (energik, yumshoq, premium), tempo animatsiyaga mos,
   ovoz 0.3–0.5; «musiqasiz» ham tanlov. `assets/ai-reklama/musiqa/` ga trek + `LICENSE.txt` qo'shilsa — ro'yxatda avtomatik chiqadi.
4. **Navbat:** `tg_outbox` KENGAYTIRILMAYDI. Xato — post `failed` + sabab, panelda «Qayta yuborish». Avtopilot foto-posti keyingi
   cron soatida 1 marta qayta uriniladi, keyin `failed` + egasiga xabar. Video — faqat qo'lda qayta (fayl o'chirilgan, qayta yoziladi).
5. **«Yangi»:** birinchi kirim sanasi (omborga birinchi kelgan kun), bo'lmasa — ID dagi vaqt; qayta kirim — yangi emas;
   ikkalasi ham yo'q — «yangi»ga kirmaydi.
6. **«Reklama qilmaslik»** — mahsulot kartasida (`p.noAds`), faqat AI-reklamaga ta'sir qiladi; vitrina qoidalari ham amal qiladi.
7. **AI:** Gemini (AI Studio kaliti), model — `AI_MODEL` (eng arzon Flash). AI'ga FAQAT: mahsulot nomi, kategoriya, qisqa tavsif,
   post turi. Narx, mijoz, ta'minotchi, tannarx, telefon, filial nomi — hech qachon (test bilan). Provayder — 1 faylda almashadi.
8. **Filiallar:** har filial alohida (sozlama, kanal, avtopilot, tarix — `branch_id`); do'kon yoqilmagan filialda tab ko'rinmaydi.
   AI oylik limiti — butun tizim uchun bitta.

## 9. Bosqichlar holati
| Bosqich | Holat | Tekshiruv |
|---|---|---|
| 1. Nomzodlar (server) | ✅ | `tests/p138-ai-reklama-nomzodlar.test.js` (PGlite + haqiqiy `ai-ads`; 1000 qator chegarasi) |
| 2. Matn | ✅ | `tests/p139-ai-reklama-matn.test.js` (shablonlar, AI'ga ketgan haqiqiy so'rov tanasi, limit, tozalash) |
| 3. Canvas, video, UI | ✅ | `tests/p140-ai-reklama-canvas-video-ui.test.js` (canvas, MediaRecorder mock, 360 px), `p139` (rasm proksisi, alts); evidence: `tests/evidence/ai-reklama-*.png` (`node scripts/ai-reklama-evidence.js`) |
| 4. Telegram | ✅ | `tests/p141-ai-reklama-telegram.test.js` (server: getChatMember, narx qayta tekshiruvi, takrorsiz, xato/qayta yuborish, video), `tests/p142-ai-reklama-yuborish-ui.test.js` (brauzer) |
| 5. Avtopilot | — | |

## 10. 3-bosqich eslatmalari
- **Shablonlar** (`js/ai-reklama-shablonlar.js`), egasi tanlovi: Chegirma, Yangi (oq), Katta narx, Brend. Yangi kelgan mahsulotga sukut — «Yangi (oq)».
  Nishon mahsulot sababiga qarab (−N% doira / YANGI / XIT / MAXSUS TAKLIF). Shrift — Inter (OFL, `assets/ai-reklama/fonts`), chizishdan oldin to'liq yuklanadi.
- **Video**: 720×1280, 30 kadr/s, ~4 Mbit/s, faqat MP4. Tur `MediaRecorder.isTypeSupported` bilan tanlanadi va «Format va musiqa» qadamida ko'rsatiladi.
  Tartib: H.264+AAC → H.264+Opus → faqat video. Mahalliy Chromium 153 (test muhiti): AAC **yo'q**, Opus **bor** → `avc1.42E01E,opus`
  (haqiqiy yozuv: h264 720×1280, opus, ffprobe bilan tekshirildi). **Android Chrome'dagi natija — telefonda tekshiriladi** (holat qatorida chiqadi).
- Yozish paytida Wake Lock; boshqa ilovaga o'tilsa — yozish to'xtaydi, fayl berilmaydi, «Qayta urinish».
- **Rasm**: avval CORS bilan to'g'ridan (Supabase Storage — CORS bor), bo'lmasa `ai-ads:img` proksisi (faqat shu mahsulotning https rasmi, IP/localhost yo'q,
  yo'naltirish taqiqlangan, ≤1.5 MB, faqat image/*, 7 s).
- **Kuy**: brauzerda yaratiladi (Energik 120, Yumshoq 84, Premium 96 BPM; ovoz 0.4). O'z treklari — `assets/ai-reklama/musiqa/README.md`.

## 11. 4-bosqich: Telegram kanalga yuborish
- **Kim:** `reklama.publish` ruxsati (yoki administrator). Tugma — 5-qadamda «Telegram'ga», tasdiqlash oynasi bilan.
- **Kanal:** AI-reklama → Sozlamalar → «Reklama kanali» (masalan `-1002193336308`); bo'sh bo'lsa — do'kon e'lonlar kanallarining birinchisi.
  Yuborish **hisobot boti** orqali (Sozlamalar → Telegram, token faqat serverda). Bot kanalda administrator va «Xabar yuborish» huquqi bilan bo'lishi kerak —
  har yuborishdan oldin `getChatMember` bilan tekshiriladi; Sozlamalarda «Kanalni tekshirish» tugmasi bor.
- **Narx:** yuborishda serverda QAYTA hisoblanadi. Rasmdagi narx bilan farq qilsa — post yuborilmaydi, rasm yangi narx bilan qayta chiziladi.
  Izohdagi narx — faqat serverdan (foydalanuvchi matnidagi narxga o'xshash qator olib tashlanadi). Qoldiq 0 — yuborilmaydi.
- **Takror yo'q:** har tayyor post — bitta kalit (`ai_ad_posts.idem_key`). Ikki marta bosish yoki uzilish takroriy post bermaydi.
- **Xato:** status `failed`, sababi saqlanadi; «Qayta yuborish» (5-qadamda yoki Tarixda). Foto — o'sha post qayta yuboriladi; video — qayta yoziladi
  (video saqlanmaydi). Telegram javob bermasa (vaqt tugadi) — post chiqqan bo'lishi mumkin: avval kanalni tekshiring.
- **Video:** brauzer bir martalik havola bilan `ai-ads-tmp` (yopiq) ga yuklaydi → server imzolangan havolani Telegram'ga beradi (`sendVideo`) →
  fayl darhol o'chiriladi (xato bo'lsa ham); yuborilmay qolgan fayllar 1 soatdan keyin keyingi yuklashda tozalanadi.
- **Tarix:** oxirgi 50 ta post — holat, xato, «Kanalda ochish» (t.me/c/...).
- **Do'kon nomi reklamada:** faqat asosiy so'z — «Powerful Group» → rasmda «POWERFUL» (katta harf, ochiq harf oralig'i), izohda «Powerful».
  Har shablonda nom bir marta: logo bo'lsa — faqat logo («GROUP» qatori kesib chiziladi), logo yuklanmasa — nom yozuvi.
  Vitrina va do'kon sozlamalaridagi nom o'zgarmaydi.
