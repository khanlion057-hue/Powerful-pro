# Ko'chirma — tizimni boshqa firma nomi va logotipi bilan ishga tushirish (v23.6)

Har bir ko'chirma — **alohida tizim**: o'z Supabase bazasi, o'z Netlify sayti, o'z brendi. Eski tizimning
ma'lumotlari (mahsulot, mijoz, kassa, xodim) ko'chirmaga **o'tmaydi** — yangi baza bo'sh boshlanadi.
Firma nomi kodda qattiq yozilmagan: hammasi `js/brand.js`, `assets/brand-logo.jpg` va ilova sozlamasidan olinadi.

## Qadamlar
1. ZIPni yangi papkaga oching (`node_modules`, `.env` yo'q).
2. Brend: `npm run brand -- --name "Sharq Savdo" --slogan "Sifat va ishonch" --logo ./logo.png --old "Powerful"`
   — `js/brand.js`, `assets/brand-logo.jpg`, `manifest.json` yangilanadi; `--old` eski nom kodda qolmaganini tekshiradi.
3. Yangi Supabase loyihasi → SQL Editor → `supabase/schema.sql` (barcha migratsiyalar 22–29 ichida).
4. `SUPABASE_URL=… SUPABASE_ANON_KEY=… npm run setup` — `js/config.js` yangi loyihaga yoziladi (faqat anon kalit).
5. Egasi hisobi: `npm run create-admin` (`ornatish.md`).
6. Netlify: yangi sayt; muhit o'zgaruvchilari `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (majburiy — eski loyiha qiymati ishlatilmasin).
   B2B uchun sayt manzili avtomatik (`URL`); boshqa domen bo'lsa — `B2B_SELF_URL=https://domen.uz`.
7. Ilovada: Sozlamalar → «Brend va profil» → nom, shior, logotip (bulutga yuklanadi va butun tizimda — menyu, kirish oynasi,
   bosh sahifa doirasi, chek, sotuvchi va diller portallari, brauzer belgisi — almashadi).

## Ikki tizim o'zaro ishlashi (B2B)
Ta'minotchilar → «Hamkor tizimlar (B2B)»: biri taklif kodi yaratadi, ikkinchisi kodni kiritadi, so'ng **ikkala egasi**
o'z tizimida tasdiqlaydi va ruxsat beradi (katalog, buyurtma, kim kimga ta'minotchi). Batafsil: `docs/B2B-HISOBDAN-CHIQARISH.md`.
