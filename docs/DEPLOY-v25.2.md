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
   - Ertasi kuni kunlik hisobotdan keyin «🖥 Tizim holati» xabari
4. **O'zingiz (5 daqiqa):** UptimeRobot'da `health` manzilini 5 daqiqalik monitorga qo'yish (yo'riqnoma 4-bo'lim).

## Orqaga qaytarish
Sayt — Netlify'da oldingi deployni qayta nashr qilish. 48-migratsiya faqat qo'shadi — qaytarish shart emas
(eski kod yangi jadvallarni ishlatmaydi). Kuzatuvni vaqtincha o'chirish — `FW_OPS_ON=0`.
