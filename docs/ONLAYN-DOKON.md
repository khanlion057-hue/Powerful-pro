# Onlayn-do'kon moduli (v23.3)

Holat: **1-bosqich — boshqaruv paneli ishlaydi** (ilova ichida). Ommaviy vitrina va Telegram orqali buyurtma qabul qilish — **2-bosqich** (quyida, tasdiq kerak).

## Nima ishlaydi (1-bosqich)
| Qism | Qayerda | Izoh |
|---|---|---|
| Do'kon kartasi | `Onlayn-do'kon` sahifasi (`go('dokon')`, Bosh sahifadagi «Do'kon» tugmasi) | Nom, vitrina manzili, Ochish / Nusxalash / Ulashish, holatlar bo'yicha sonlar, jarayondagi summa |
| Sozlamalar | «Sozlamalar» oynasi | Yoqish/o'chirish, nom, manzil (slug), tavsif, telefon, WhatsApp/Telegram tugmalari, vitrina valyutasi (UZS/USD), yetkazib berish narxi, bepul radius, bepul yetkazish uchun minimal summa, joylashuv (xarita — Leaflet, SRI bilan; yuklanmasa koordinata maydonlari) |
| Bannerlar | «Bannerlar» | ≤5 ta, 2:1 ga avtomatik qirqiladi, ~70 KB gacha siqiladi, Storage'ga (`product-images/shop/…`) yuklanadi; tartib, yashirish, o'chirish |
| Chegirma | «Chegirma» | ≤20 mahsulot; **faqat vitrina va onlayn buyurtma narxi** (kassa narxi o'zgarmaydi); eski narx chizib ko'rsatiladi |
| Telegram bot | «Telegram» | 3 qadamli yo'riqnoma, token tekshiruvi (`getMe`), buyruqlar menyusi va tavsif o'rnatiladi. Token faqat serverda saqlanadi |
| Statistika | «Statistika» | 7/30 kun/hammasi: buyurtmalar, yakunlangan, tushum, o'rtacha chek, bekor qilish %, reyting, manbalar, 7 kunlik grafik, top mahsulotlar (sinov buyurtmalari hisobga olinmaydi) |
| Buyurtmalar (Cheklar) | asosiy ro'yxat | Qidiruv, holat filtrlari, buyurtma kartasi, holatlar: Yangi → Tayyorlanmoqda → Yo'lda/tayyor → Yakunlangan / Bekor (sabab bilan), tarix, qo'ng'iroq / WhatsApp |
| Qo'lda buyurtma | «+» | Telefon / WhatsApp / Telegram / do'konda kelgan buyurtmani kiritish |
| Sotuvga o'tkazish | buyurtma oynasi | Buyurtma narxlari bilan savatga yuklanadi, mijoz telefon bo'yicha topiladi; savdo **mavjud server checkout** orqali (FIFO ombor, kassa, qarz — v23.2 qoidalari) yakunlanadi va buyurtma savdo bilan bog'lanadi |
| Sharhlar | «Sharhlar» tab | O'rtacha baho, taqsimot, javob berish, yashirish |
| Vitrina (oldindan ko'rish) | «Ochish» | Xaridor ko'rinishi: bannerlar, qidiruv, kategoriyalar, chegirmalar, savat, yetkazib berish hisobi, buyurtma, baho qoldirish, «Do'kon haqida». Bu yerdagi buyurtma **«Sinov»** belgisi bilan tushadi |

## Ma'lumot va xavfsizlik
- Ma'lumot filial ichidagi `shop` kalitida (`app_data_branches` / `branchStore`) — **SQL sxemasi o'zgarmadi**.
- Server (`_lib/appDataGuard.js` → `filterShop`, `normalizeIncomingShop`):
  - `settings` / `banners` / `discounts` — faqat `sozlamalar.edit` (yoki admin);
  - `orders` / `reviews` — savdo huquqlari (`savdo.create`, `savdo.edit`, `savdo.delete`, `qaytarish.create`);
  - buyurtma va sharh **o'chirilmaydi**: ID bo'yicha birlashtiriladi, yangiroq (`updatedAt`) ustun — eskirgan brauzer nusxasi boshqa qurilmadagi buyurtmani yo'qotmaydi (admin uchun ham);
  - banner faqat `https://` havola (≤5), chegirma ≤20 va narx > 0, buyurtma ≤3000.
- Bot tokeni: `settings.shopBotToken` — maxfiy kalitlar ro'yxatida; `app-data-load` hech kimga (admin'ga ham) qaytarmaydi, faqat `shopBotTokenSet`; tokensiz saqlash uni o'chirmaydi; brauzer qurilma xotirasiga (`localStorage`) yozmaydi.
- `netlify/functions/shop-bot.js` — `check` / `setup` / `status`; ruxsat `sozlamalar.edit`; javobga token qo'shilmaydi.
- Ombor va pul bu modulda o'zgarmaydi — faqat «Sotuvga o'tkazish» orqali mavjud savdo oqimida.

## 2-bosqich — tasdiq kerak (baza va xavfsizlikka ta'sir qiladi)
1. **Ommaviy vitrina sahifasi** (`/s/<slug>`): tizimga kirmagan xaridor uchun faqat o'qish endpointi (nom, bannerlar, mahsulot nomi/rasmi/vitrina narxi/«mavjud» belgisi — tannarx va aniq qoldiq yo'q).
2. **Buyurtma qabul qilish endpointi** (autentifikatsiyasiz): alohida jadval (`shop_orders`, migratsiya 28), rate-limit, telefon tekshiruvi, idempotent kalit, narx va mavjudlik SERVERDA qayta hisoblanadi (brauzer narxiga ishonilmaydi).
3. **Telegram webhook**: `/start`, `/shop`, `/help` javoblari, «Do'kon» menyu tugmasi (WebApp), raqam ulashish → buyurtma.
4. Ixtiyoriy: chegirmani kassada ham qo'llash (hozir faqat vitrina) — narx qoidasi, alohida tasdiq.
