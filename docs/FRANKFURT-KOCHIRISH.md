# Bazani Frankfurtga ko'chirish (v25.6.9)

Yangi loyiha yaratildi: **powerful-pro-eu** (`anozulqnzoilncjvqsvo`, eu-central-1). Eski: `aniqvrvjawduyrexfufd` (Sidney).
URL: https://anozulqnzoilncjvqsvo.supabase.co — anon kalit `js/config.js` ga o'tkazishda yoziladi (service_role kalit FAQAT Netlify muhitida).

## Tartib (har qadamdan keyin tekshiring; eski baza oxirigacha tegilmaydi)
1. **Eski bazada sinovni tozalang** (Sozlamalar → Sinovni tozalash; avval 49-migratsiya). Shunda ko'chadigan ma'lumot kam bo'ladi.
2. **Sxema:** yangi loyiha → SQL Editor → `supabase/schema.sql` tarkibini to'liq qo'yib RUN; keyin `supabase-migration-49-sinov-tozalash.sql`.
3. **Ma'lumot:** mahsulotlar, kirim partiyalari (`batches`), `app_data`, `app_data_branches`, `dealers`, `staff`, `catalog_products`, rollar/ruxsatlar.
   Eski loyihada Table Editor → Export CSV → yangisida Import. (Auth foydalanuvchilari va parollar ko'chmaydi.)
4. **Foydalanuvchilar:** `npm run create-admin` bilan egasi hisobi; xodim va dillerlar — ilovadan qayta qo'shiladi (parollar yangidan beriladi).
5. **Rasmlar:** Storage `product-images` bucket yaratib, rasmlarni ko'chiring (yoki mahsulot rasmlari qayta yuklanadi).
6. **Ulash:** Netlify muhit: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (yangi), `js/config.js` da URL va anon kalit; Netlify → Functions region → **Frankfurt (eu-central-1)**.
7. Deploy → tekshiruv → eski loyihani 1 hafta zaxirada saqlang, keyin to'xtating.

Tezlik: funksiya va baza bir mintaqada bo'lsa so'rov ~200 ms o'rniga ~5–20 ms kutadi.
