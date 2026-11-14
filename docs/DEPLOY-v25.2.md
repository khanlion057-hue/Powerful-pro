# v25.2 — deploy tartibi (tayyor, hali chiqarilmagan)

Oxirgi deploy: `dcfe93b` (yuklanish oynasi — namunadagi arralar). Batafsil: `docs/YUKLAMAGA-TAYYORLIK.md`, `CHANGES.md` → v25.2.

## Tartib
1. **48-migratsiya** — Supabase → SQL Editor → `supabase-migration-48-ops.sql` (yoki MCP `apply_migration`).
   Faqat yangi jadval va funksiya; mavjud ma'lumotga tegilmaydi; takror ishga tushirish xavfsiz.
2. **Sayt** — Netlify deploy (build: `node scripts/build.js`, funksiyalar: **65** — yangi `client-error`).
   Yangi muhit o'zgaruvchisi kerak emas (`FW_OPS_ON` — faqat favqulodda o'chirish uchun, `0`).
3. **Tekshirish:**
   - `/.netlify/functions/health` → `ok: true`; 1 daqiqada 31-chi so'rov → 429 (himoya ishlayapti)
   - Sahifa manbasida skriptlar `h/js.main.<xesh>.js` ko'rinishida; ikkinchi ochilishda JS/CSS keshdan
   - `health` javobida `region` — funksiyalar qaysi mintaqada (baza: ap-southeast-2 / Sidney); farq qilsa — pastga qarang
   - APK: yopib, 1 daqiqadan keyin ochish → PINsiz darhol; 6 daqiqadan keyin → PIN
   - Ertasi kuni kunlik hisobotdan keyin «🖥 Tizim holati» xabari
4. **O'zingiz (5 daqiqa):** UptimeRobot'da `health` manzilini 5 daqiqalik monitorga qo'yish (yo'riqnoma 4-bo'lim).

## Orqaga qaytarish
Sayt — Netlify'da oldingi deployni qayta nashr qilish. 48-migratsiya faqat qo'shadi — qaytarish shart emas
(eski kod yangi jadvallarni ishlatmaydi). Kuzatuvni vaqtincha o'chirish — `FW_OPS_ON=0`.

## Tezlik: mintaqalar (deploydan keyin `health` → `region` ga qarab)
Baza (Supabase) — **ap-southeast-2 (Sidney)**. Netlify funksiyalari odatda **us-east-2 (AQSh)** da ishlaydi: har bir server
amali O'zbekiston → AQSh → Avstraliya → AQSh → O'zbekiston bo'lib aylanadi va ma'lumot yuklash bir necha bazaviy so'rovdan iborat —
asosiy sekinlik shu. Yechimlar (egasi qaroriga):
1. Netlify → loyiha → Functions sozlamalarida funksiyalar mintaqasini bazaga yaqin (Sidney) qilish — server ichidagi aylanishlar yo'qoladi.
   Bu sozlama tarifga bog'liq bo'lishi mumkin.
2. Uzoq muddatli eng tez yechim: bazani Frankfurtga (eu-central-1, O'zbekistonga eng yaqin) ko'chirish va funksiyalarni ham shu yerga.
   Yangi Supabase loyihasi + ma'lumotlarni ko'chirish talab qilinadi — alohida rejalashtiriladi.
