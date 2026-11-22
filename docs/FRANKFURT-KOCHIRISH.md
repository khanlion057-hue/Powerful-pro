# Bazani Frankfurtga ko'chirish (v25.6.10)

| | Eski | Yangi |
|---|---|---|
| Loyiha | `Powerful-pro` (`aniqvrvjawduyrexfufd`) | `Powerful-pro-eu` (`marqgbbwqpqohtzjkyyy`) |
| Mintaqa | Sidney (ap-southeast-2) | Frankfurt (eu-central-1) |
| URL | https://aniqvrvjawduyrexfufd.supabase.co | https://marqgbbwqpqohtzjkyyy.supabase.co |

Netlify funksiyalari hozir: **us-east-2 (Ogayo)** — `/.netlify/functions/health` javobidagi `region`.

## 1-bosqich — tayyorlash (bajarildi, ilova ishlab turdi)
- Sxema: `supabase/schema.sql` + prodakshndan olingan tuzatish (barcha funksiyalar, ustunlar, triggerlar,
  RLS, huquqlar). Avtomatik solishtirish: **702/702 obyekt mos** (md5).
- Sinov yuklash (`migr-frankfurt-1-yuklash.sql`): 69 jadvaldan 67 tasi baytigacha bir xil (loginlar va
  parol xeshlari bilan); farq — faqat ko'chirishdan keyin tushgan 2 ta monitoring yozuvi.
- Rasmlar: 113/113 nusxalandi, md5 bir xil.
- Vaqtinchalik ko'prik: yangi loyihada yopiq `fw-migr-tmp` storage + `fw_migr_get` / `fw_migr_load`
  funksiyalari (faqat SQL Editor/servis uchun; anon/authenticated chaqira olmaydi).

## 2-bosqich — ko'chirish (≈30 daqiqa, savdo to'xtatiladi)
1. Xodimlarga: «30 daqiqa savdo qilmang».
2. Claude: eski bazadan oxirgi nusxa (`data2.json`) — faqat o'qish.
3. Egasi: **Powerful-pro-eu → SQL Editor** → `migr-frankfurt-2-kochirish.sql` → Run → natijani yuborish.
4. Claude: jadvalma-jadval md5 solishtirish (rasm havolalari yangi manzilga almashgan holda); yangi rasmlar bo'lsa — nusxalash.
5. Egasi: **Netlify → Project configuration → Environment variables**:
   - `SUPABASE_URL` = `https://marqgbbwqpqohtzjkyyy.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = yangi loyiha → Project Settings → API Keys → `service_role` (secret) —
     **faqat Netlify'ga**, chatga yozilmaydi.
   - (ixtiyoriy) Functions → Region → **eu-central-1 (Frankfurt)**, agar tarifda bo'lsa.
6. Claude: `js/config.js` (URL + ochiq anon kalit) → test → commit → deploy («deploy qil» bilan).
7. Tekshiruv: `health` (`db: true`), kirish (eski parollar bilan), savdo, kassa, rasm, Telegram bot; Netlify loglarida vaqt.

## 3-bosqich — tozalash
- Yangi loyihada vaqtinchalik ko'prik: `fw_migr_tmp_*` storage qoidalari, `fw_migr_get`, `fw_migr_load`
  o'chiriladi (`migr-frankfurt-3-tozalash.sql`).
- Eski loyiha 1–2 hafta zaxira sifatida qoladi (o'zgartirilmaydi), keyin to'xtatiladi.

## Orqaga qaytish
2-bosqichning 5–6-qadamlarigacha eski baza ishlayveradi. Muammo bo'lsa — Netlify muhitidagi ikki qiymat
va `js/config.js` eski qiymatlarga qaytariladi, deploy. Eski bazada hech narsa o'zgartirilmagan.
Diqqat: yangi bazaga ko'chirishdan keyin yozilgan savdolar eski bazaga o'tmaydi — qaytish faqat birinchi soatlarda mantiqli.
