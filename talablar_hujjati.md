# BIZNES PRO — TO'LIQ TALABLAR VA TEXNIK HUJJAT

> Bu hujjat loyihaning barcha talablari, hozirgi holati va texnik arxitekturasini
> to'liq qamrab oladi. Boshqa AI vosita yoki dasturchi shu hujjatni o'qib,
> loyihani to'liq tushunib olishi va davom ettirishi mumkin bo'lishi kerak.

---

## 1. LOYIHA HAQIDA UMUMIY MA'LUMOT

**Biznes Pro** — import va ulgurji savdo uchun bitta-fayl (single-file) HTML/JS/CSS
ERP tizimi. Egasi — Oka, bir nechta biznesni boshqaradi:
- **Nozim fabrikasi** — parranda/ulgurji distribyutsiya (alohida, localStorage-based app)
- **Freight logistika** — Xitoy → O'zbekiston yuk tashish (alohida app)
- **Biznes Pro (ERP)** — import/ulgurji savdo boshqaruvi (shu hujjat shu haqida)

### Texnik stek
- **Frontend**: xom HTML/CSS/JavaScript (freymvorksiz), bir nechta HTML sahifa
- **Backend/DB**: Supabase (Postgres + Auth + RLS)
- **Hosting**: Netlify (hozircha drag&drop, Node.js/CLI sozlanmoqda)
- **Supabase loyiha ID**: `amrauwymzjwdnaaspatk`
- **Joriy sayt**: `https://preeminent-palmier-804a9b.netlify.app`

### Uch alohida ilova (barchasi bitta repo/papkada)
1. **`index.html` + `js/main.js`** — asosiy ADMIN panel (Oka ishlatadi)
2. **`diller.html` + `js/diller.js`** — DILLER/OMBORCHI portali (telefon uchun, yengil)
3. **`sotuvchi.html` + `js/sotuvchi.js`** — SOTUVCHI portali (telefon uchun, do'kon savdosi)

---

## 2. MA'LUMOTLAR ARXITEKTURASI

### 2-a. Asosiy blob (index.html va sotuvchi.html ishlatadi)
Supabase jadvali: **`app_data`**, bitta qator (`id='main'`), `data` ustunida JSON:
```
products, batches, batchCounter, sales, customers, suppliers, expenses,
partners, partnerPeriods, cashboxes, revisions, cashTxns, auditLogs, settings
```
- RLS **yo'q** (ochiq) — bu qasddan, chunki sotuvchi ham shu umumiy ma'lumotga
  yozishi kerak (do'kon ombori/mijoz/kassa umumiy).
- `save()` (main.js) va `svSaveShopData()` (sotuvchi.js) shu blobni yangilaydi.

### 2-b. Diller uchun ALOHIDA jadvallar (RLS bilan himoyalangan)
Sabab: dillerlar bir-birining ma'lumotini ko'rmasligi KERAK — bitta blobda bu
kafolatlanmaydi, shuning uchun har bir diller uchun ajratilgan qatorlar kerak.

| Jadval | Vazifasi |
|---|---|
| `dealers` | Har bir diller: login, auth_user_id, ism, telefon, hudud, qarz, jami yuborilgan/sotilgan/to'langan, **commission_pct** (xizmat foizi), **telegram_chat_id**, **points** (ball) |
| `dealer_stock` | Diller omboridagi qoldiq (dealer_id, pid, qty, avg_cost_usd) |
| `dealer_sales` | Diller o'zi "Sotdim" qilgan yozuvlar |
| `dealer_payments` | Diller to'lagan pul tarixi |
| `dealer_stock_moves` | Yuborish/qaytarish tarixi (type: send/return) |
| `dealer_orders` | Diller so'ragan buyurtmalar (status: pending/approved/rejected, items: jsonb) |
| `catalog_products` | Diller ko'radigan xavfsiz mahsulot katalogi (narx/tannarxsiz — faqat id, sku, name, qty, point_pct) |

**RLS qoidalari (barcha yuqoridagi jadvallarda):**
- `anon` rol (admin ilovasi, Supabase login qilmaydi) → **to'liq CRUD** ruxsat
- `authenticated` rol (diller, haqiqiy Supabase Auth bilan kirgan) → **faqat
  o'ziga tegishli qatorlarni** o'qiydi (`dealer_id in (select id from dealers
  where auth_user_id = auth.uid())`)
- Diller **to'g'ridan-to'g'ri** `dealer_stock`/`dealer_sales`ga yoza olmaydi —
  faqat maxsus Postgres funksiyasi (`record_dealer_sale`, SECURITY DEFINER)
  orqali, bu funksiya zaxirani tekshirib, xavfsiz kamaytiradi.

### 2-c. Xodimlar (sotuvchi, kelajakda menejer) uchun jadval
| Jadval | Vazifasi |
|---|---|
| `staff` | Har bir xodim: login, auth_user_id, ism, **role** (admin/menejer/sotuvchi/kassir) |

RLS: `anon` to'liq ruxsat; `authenticated` faqat o'z qatorini o'qiydi.
Xodim login qilgach, `sotuvchi.js` orqali **umumiy `app_data` blobiga** to'g'ridan-
to'g'ri o'qish/yozish huquqiga ega (chunki bu ma'lumot umumiy, diller kabi
izolyatsiya kerak emas — faqat "kim, nima ko'rishi" darajasidagi cheklov).

### 2-d. Login mexanizmi (diller va xodim uchun bir xil)
- Supabase Auth ishlatiladi, lekin login **email emas** — oddiy ism/so'z
- Fon tarafida avtomatik email yasaladi: diller uchun
  `{login}@dillers.biznespro.local`, xodim uchun `{login}@staff.biznespro.local`
- Parolni **admin o'zi belgilaydi** (ro'yxatdan o'tish yo'q)
- Kirish sahifalarida login+parol, ko'z ikonkasi bilan parolni ko'rsatish,
  xato xabari, silliq animatsiya

### 2-e. Bajarilgan SQL migratsiyalar (tartib bilan, barchasi RUN qilingan)
1. `supabase-migration.sql` — asosiy: dealers, dealer_stock, dealer_sales,
   dealer_payments, dealer_stock_moves + RLS + `record_dealer_sale` funksiyasi
2. `supabase-migration-2-orders.sql` — catalog_products, dealer_orders + RLS
3. `supabase-migration-3-commission.sql` — dealers.commission_pct ustuni
4. `supabase-migration-4-telegram.sql` — dealers.telegram_chat_id ustuni
5. `supabase-migration-5-staff.sql` — staff jadvali + RLS
6. `supabase-migration-6-points.sql` — dealers.points, catalog_products.point_pct,
   `record_dealer_sale` funksiyasini ballni ham qo'shadigan qilib yangilash

---

## 3. TALABLAR — TO'LIQ RO'YXAT (holati bilan)

### 3-a. DO'KON SAVDOSI — yakunlash nazorati ✅ BAJARILGAN
- Savdo oynasida (index.html Savdo, sotuvchi.html Savdo) **"SAVDONI YAKUNLASH"**
  tugmasi **qarz/summa to'liq qoplanmaguncha ishlamaydi**
- Agar qolgan summa bo'lsa-yu, mijoz tanlanmagan bo'lsa → tugma o'chiq, qizil
  ogohlantirish: "Qolgan {summa} — mijoz tanlang yoki to'liq summani kiriting"
- Mijoz tanlansa va qarz qolsa → ruxsat beriladi, "{summa} — {mijoz} qarziga
  yoziladi" degan xabar
- Ikki qavatli himoya: tugma ham o'chadi, ham `savdoFinish()`/`svFinishSale()`
  funksiyasi ichida qattiq bloklanadi (JS orqali chetlab o'tib bo'lmaydi)

### 3-b. Vizual/UX yaxshilanishlar ✅ BAJARILGAN
- Barcha emoji ikonkalar → professional SVG (chiziqli, Lucide uslubida)
- PWA: `manifest.json`, `sw.js` (service worker), ilova ikonkalari
  (192/512/180px) — "Add to Home Screen" orqali ilova sifatida o'rnatiladi
- Hash-based routing (`#dashboard`, `#savdo` va h.k.) — brauzer orqaga/oldinga
  tugmalari ishlaydi

### 3-c. Hamkorlar/ta'sischilar orasida foyda taqsimoti ✅ BAJARILGAN
- 2+ ta'sischi bo'lsa, investorlardan ushlab qolingan foyda ta'sischilar
  o'rtasida **kapital ulushiga mutanosib** taqsimlanadi (birinchi ta'sischiga
  emas)

### 3-d. Diller/omborchi tizimi ✅ ASOSAN BAJARILGAN
- Diller **faqat o'z omborini va savdosini** ko'radi (boshqa dillerni
  ko'rolmaydi — RLS orqali texnik jihatdan himoyalangan)
- Diller **faqat $ da sotadi** — narx maydoni faqat dollar, so'm/karta tanlovi
  yo'q. Diller "Sotdim" qilganda uning qarzi $ da o'sadi.
- **Pul topshirilganda** (jismoniy naqd/o'tkazma) — ADMIN tomonidan
  "Dillerlar → Qarzlar" bo'limida qabul qilinadi, o'sha yerda **so'm/dollar/
  karta** tanlanadi, tizim konvertatsiya qilib qarzni kamaytiradi
- Diller **buyurtma bera oladi** ("🛒 Buyurtma" bo'limi): asosiy ombordan
  mahsulot+miqdor tanlab so'raydi → holat "⏳ Kutilmoqda"
- Admin **"📥 Buyurtmalar"** bo'limida buyurtmani ko'radi, **miqdorni
  tahrirlashi mumkin** (masalan kamaytirish), so'ng **✅ Tasdiqlash** yoki
  **❌ Rad etish**. Tasdiqlansa — tovar avtomatik dillerning omboriga o'tadi.
- **"🕒 Kunlik nazorat"** — barcha dillerlarning bugungi savdosi bir joyda
- Har bir dillerga **alohida xizmat foizi** (`commission_pct`) belgilanadi
  (masalan biriga 8%, biriga 5%, biriga 0%) — admin qo'lda diller savdosini
  kiritganda (**"🧾 Savdo"** bo'limi) shu foiz avtomatik qo'llanadi

### 3-e. Diller ball (loyalty) tizimi ✅ BAJARILGAN
- Har bir mahsulot uchun **alohida ball foizi** (`pointPct`) — Mahsulotlar
  bo'limida tahrirlanadi (masalan 2%, 5%, ba'zisiga 0%)
- Diller sotganda (o'zi "Sotdim" qilganda YOKI admin qo'lda kiritganda) —
  ball **avtomatik** hisoblanadi va qo'shiladi:
  `ball = round((savdo_summasi × mahsulot_ball_foizi / 100) / 1_ball_narxi, yaxlitlash_qadami)`
- Global sozlamalar ("🏆 Ball sozlamalari", Dillerlar sahifasida):
  - **1 ball qancha $ turadi** (standart: $2, o'zgartirilishi mumkin)
  - **Yaxlitlash qadami**: butun songa (1) yoki yarimga (0.5)
- Diller portalida "🏆 Jamg'arilgan ball" ko'rinadi
- ⏳ **HALI QILINMAGAN**: ballarni sovrin/tovarga almashtirish funksiyasi
  (foydalanuvchi aytishicha "hozircha faqat ko'rsatib tursin" — keyinroq kerak
  bo'ladi)

### 3-f. Telegram integratsiyasi ✅ BAJARILGAN
- Bot yaratilgan (BotFather orqali), token `main.js`da saqlangan
  (⚠️ xavfsizlik eslatmasi pastda)
- Har bir dillerning **o'z Telegram guruhi** bor, guruh ID'si
  `dealers.telegram_chat_id`da saqlanadi (admin "✏️ Tahrirlash" orqali kiritadi)
- **Avtomatik xabarlar**:
  - Buyurtma tasdiqlansa → dillerning guruhiga "✅ Buyurtmangiz tasdiqlandi"
  - Buyurtma rad etilsa → "❌ Rad etildi"
- **Qo'lda tugma**: "Kunlik nazorat"da har bir diller qatorida "📤
  Telegramga" tugmasi — bosilganda o'sha kungi savdo hisobotini yuboradi

### 3-g. Sotuvchi (xodim) portali ✅ ASOSAN BAJARILGAN
- Diller kabi alohida, telefon uchun yengil portal (`sotuvchi.html`)
- Login+parol bilan kiradi (admin beradi, Supabase Auth orqali, `staff`
  jadvalida rol="sotuvchi")
- **🛒 Savdo**: umumiy do'kon ombori/mijozlaridan mahsulot tanlab sotadi,
  xuddi shu "qarz qoplanmaguncha yakunlanmaydi" qoidasi shu yerda ham ishlaydi
- **💰 Qarzlar**: barcha qarzdor mijozlarni ko'radi, "To'lov" tugmasi bilan
  qarzni so'ndiradi (qaysi kassaga tushganini tanlab)
- **🕒 Tarix**: so'nggi 30 ta savdoni ko'radi
- Har bir amal audit jurnaliga `[Sotuvchi ismi]` bilan yoziladi (hisobdorlik)
- ⏳ **HALI QILINMAGAN**: to'liq rol tizimi (admin/menejer/kassir/sotuvchi —
  har biriga alohida sahifa ko'rinishi). Hozircha faqat "sotuvchi" roli uchun
  MAXSUS PORTAL qurilgan; asosiy `index.html` ichida rolga qarab menyu
  filtrlash HALI QILINMAGAN.

### 3-h. Savdoda yaxlitlash → avtomatik chegirma ✅ BAJARILGAN
- Naqd/dollar to'lovda, mijoz **yaxlit summa** to'laganda (masalan savdo
  156 780 so'm, mijoz 160 000 beradi), tizim qaytimni ko'rsatadi va **"🔄
  Chegirmaga aylantirish"** tugmasini taklif qiladi
- Bosilganda: farq (3 220 so'm) avtomatik chegirma sifatida yoziladi, mayda
  pul qaytarish shart bo'lmaydi, savdo to'liq to'langan holda yopiladi
- Ikkala ilovada ham (index.html va sotuvchi.html) ishlaydi

### 3-i. Mahsulot qidirish ✅ ALLAQACHON MAVJUD EDI
- Kod (SKU) va ism bo'yicha ikkalasi ham qidiriladi — bu talab tekshirilganda
  allaqachon to'g'ri ishlayotgani aniqlandi (kodda o'zgartirish shart bo'lmadi)

### 3-j. Logo/brend o'zgartirish ⏳ KUTILMOQDA
- Foydalanuvchi aytdi: **tayyor logo fayli bor**, hali yuklanmagan
- Kerak: logo faylini olib, favicon/PWA ikonkalar/sidebar logo/login
  ekranlaridagi barcha joylarga qo'yish (3 ta ilovada — index/diller/sotuvchi)
- Aniqlanmagan: brend **nomi** ("Biznes Pro") ham o'zgaradimi, yoki faqat
  logo grafikasi almashadimi — SO'RALISHI KERAK

### 3-k. Excel shablon/import muammolari ✅ QISMAN TUZATILDI
- Shablon maydonlari to'g'irlandi: `SKU | Miqdor | Tannarx($) | Chakana narxi($) | Optim narxi($)`
  ("Kelib chiqqan" va "Sana" ustunlari olib tashlandi — keraksiz edi)
- Excel import qilinganda, Chakana/Optim narx kiritilgan bo'lsa, mahsulotning
  ustama foizi (`markupPct`/`optMarkupPct`) avtomatik shundan hisoblanadi
- ⏳ **Hali ochiq**: Yuan konvertatsiyasi, bank 0.6%, bojxona taqsimoti Excel
  orqali hisoblanmaydi (faqat qo'lda, bitta-bitta kiritishda ishlaydi)

### 3-m. Sotilgan tovarni qaytarish — alohida menyu ✅ BAJARILGAN
- Yangi sidebar bandi: **"↩️ Qaytarishlar"** (Savdo ostida)
- Qidiruv (chek raqami/mijoz ismi), so'nggi 50 savdo ro'yxati, va
  qaytarishlar tarixi (oxirgi 30 ta)
- Qaytarish mantig'i o'zi avvaldan bor edi (`openSaleReturn`/`doSaleReturn`),
  endi alohida, qidiriladigan sahifa orqali ham kirish mumkin

### 3-l. Ichki login tizimi (admin/menejer/kassir) ⏳ QISMAN
- Boshlang'ich talab: 3 rol (admin — hammasi, menejer — Dashboard+Savdo+
  Sklad+Moliya, kassir — Dashboard+Kassa)
- Hozircha faqat **"sotuvchi"** roli uchun alohida portal qilingan
  (`sotuvchi.html`)
- **"Menejer"** roli va asosiy `index.html`da rolga qarab menyu
  ko'rsatish/berkitish HALI QURILMAGAN

### 3-m. Deployment — Netlify serverless functions ⏳ JARAYONDA
- Muammo: Supabase'ning client-side `signUp()` chaqiruvi rate-limit (429)ga
  tez uchraydi — shuning uchun to'g'ri yechim: server (Netlify Function)
  orqali `service_role` kalit bilan hisob yaratish
- Fayllar tayyor: `netlify/functions/create-dealer.js`,
  `netlify/functions/create-staff.js`, `netlify.toml`, root `package.json`
  (`@supabase/supabase-js` bog'liqligi bilan)
- **Muammo**: bular ishlashi uchun **Netlify CLI** kerak (drag&drop bunga
  yaramaydi) — foydalanuvchi hozir **Node.js o'rnatish jarayonida**
- Node.js/Netlify CLI tayyor bo'lgach kerakli qadamlar:
  1. `npm install -g netlify-cli`
  2. `netlify login`
  3. `netlify link` (loyihani `preeminent-palmier-804a9b`ga bog'lash)
  4. `npm install` (papka ichida, @supabase/supabase-js o'rnatish uchun)
  5. Netlify Dashboard'da **Environment Variables**ga
     `SUPABASE_SERVICE_ROLE_KEY` qo'shish (Supabase → Project Settings → API
     → service_role secret'dan olinadi — BU MAXFIY, hech qayerga oshkor
     qilinmasin)
  6. `netlify deploy --prod`
- Shu bajarilgach, "+ Diller qo'shish" va yangi sotuvchi yaratish **to'g'ridan-
  to'g'ri admin panelidan**, rate-limit'siz ishlaydi

### 3-n. Ko'p qurilmada sinxronlash ✅ TASDIQLANGAN (arxitektura bo'yicha)
- Barcha ma'lumot Supabase bulutida — istalgan qurilmadan kirilganda bir xil
  ma'lumot ko'rinadi, internet aloqasi shart

---

## 4. HOZIRGI HOLAT — NIMA QOLDI (ochiq vazifalar ro'yxati)

1. **Logo/brend** — fayl kutilmoqda, keyin barcha 3 ilovaga joylashtiriladi
2. **Excel import/shablon muammolari** — skrinshot/aniq misol kutilmoqda
3. **Ichki to'liq rol tizimi** (`index.html`da admin/menejer/kassir menyu
   filtri) — hali boshlanmagan
4. **Netlify serverless functions** — Node.js o'rnatilishini kutmoqda,
   keyin CLI orqali deploy qilinishi kerak
5. **Ball → sovrin almashtirish** — keyinroq kerak bo'ladi (hozircha shart
   emas, faqat ko'rsatib turadi)
6. Foydalanuvchi "0 dan boshlaylik, Netlify yangi loyiha ochamiz" degan —
   bu **texnik jihatdan shart emas** (mavjud loyiha davom etaveradi), lekin
   agar chinakam yangi Netlify loyihasi ochilsa, **barcha muhit
   o'zgaruvchilari** (`SUPABASE_SERVICE_ROLE_KEY` va h.k.) qayta
   sozlanishi kerakligini yodda tutish kerak

---

## 5. MUHIM XAVFSIZLIK ESLATMALARI

1. **Telegram bot token** — hozircha `js/main.js` ichida ochiq matn sifatida
   saqlangan (chunki server hali ishlamaydi). Bu — admin panelning "view
   source" qilinsa ko'rinishi mumkinligini anglatadi. Xavf past (admin panel
   PIN bilan himoyalangan, faqat ishonchli odamlar kiradi), lekin **Netlify
   function ishga tushgach, buni serverga ko'chirish tavsiya etiladi**.
2. **Supabase anon key** — barcha 3 ilovada ochiq (bu — Supabase'ning
   standart, kutilgan arxitekturasi, xavfli emas, chunki RLS himoya qiladi
   diller/xodim ma'lumotlarini; umumiy `app_data` esa qasddan ochiq).
3. **APP_PIN** (`main.js`dagi asosiy admin kirish paroli) — hozir `'1234'`
   turibdi, ishlab chiqarishda albatta boshqa qiymatga o'zgartirilishi kerak.
4. **`app_data` blobiga concurrent yozish** — agar bir vaqtda 2 kishi (masalan
   admin va sotuvchi) yozsa, "last write wins" (oxirgi yozgan g'olib) tamoyili
   ishlaydi — nodir holatlarda bir-birining o'zgarishini bosib ketishi mumkin.
   Bu — bilib turilgan cheklov, hozircha muammo hisoblanmagan (kichik jamoa).

## 6. DEPLOYMENT — HOZIRGI USUL

1. Loyiha butun papka (`biznes-pro-final.zip`) sifatida beriladi
2. Foydalanuvchi **zipni ochib (extract)**, papka qiladi
3. Netlify → loyiha → **Deploys** → **ochilgan papkani** (zip emas!)
   drag&drop qiladi
4. Yangi Supabase SQL migratsiya bo'lsa — alohida `.sql` fayl beriladi,
   Supabase SQL Editor'da qo'lda ishga tushiriladi (chunki avtomatik
   migratsiya tizimi yo'q)

---

*Hujjat oxiri — savol tug'ilsa, ushbu suhbat tarixiga murojaat qilinsin.*
