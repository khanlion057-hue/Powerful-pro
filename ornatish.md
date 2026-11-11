# Powerful PRO — noldan o'rnatish (yangi Supabase + Netlify)

Bu qo'llanma loyihani **bo'sh joydan** to'liq ishga tushiradi: yangi baza, yangi sayt,
birinchi administrator. Taxminan 20–30 daqiqa. Mavjud (ishlab turgan) saytni yangilash
uchun bu kerak emas — `DEPLOY.md` ga qarang.

> Avvalgi `ornatish.md` eskirgan edi: unda `app_data` jadvaliga "hamma yoza oladi" RLS
> siyosati berilardi — bu xavfli. Endi butun sxema `supabase/schema.sql` da, production
> bilan bir xil xavfsizlik sozlamalari bilan.

## 0. Kerak bo'ladi
- Node.js 18+ (`node -v`), Git (ixtiyoriy)
- Supabase va Netlify hisoblari
- `npm install -g netlify-cli`

## 1. Supabase — baza
1. supabase.com → **New project** (Region: Frankfurt yoki Singapur). Parolni saqlab qo'ying.
2. **SQL Editor → New query** → `supabase/schema.sql` faylini **to'liq** joylab → **Run**.
   Natija: 35 jadval (Firma Kassa bilan), 19 SQL funksiya, 19 xavfsizlik siyosati, rollar va ruxsatlar,
   `product-images` saqlagichi. Qayta ishga tushirsangiz ham zarar yo'q.
3. **Settings → API** dan uchta qiymatni oling:
   - Project URL → `SUPABASE_URL`
   - `anon public` kalit → `SUPABASE_ANON_KEY` (brauzer uchun, ochiq)
   - `service_role` kalit → `SUPABASE_SERVICE_ROLE_KEY` (**maxfiy** — faqat Netlify'da)

## 2. Loyiha sozlamalari
```bash
unzip Powerful-PRO-*.zip -d powerful-pro && cd powerful-pro
npm install
SUPABASE_URL=https://xxxx.supabase.co SUPABASE_ANON_KEY=<anon kalit> npm run setup
```
`js/config.js` yoziladi. Skript **service_role kalitini qabul qilmaydi** (xato bilan to'xtaydi) —
maxfiy kalit tasodifan saytga tushib qolmasligi uchun.

## 3. Birinchi administrator
```bash
SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service_role> \
  npm run create-admin -- --login admin --name "Ism Familiya"
```
Parol so'raladi (ekranda ko'rinmaydi, kamida 8 belgi). Bu foydalanuvchi to'liq huquqli
administrator ("Korxona egasi" roli) bo'ladi. Qolgan xodimlarni keyin ilovaning o'zidan
(**Sotuvchilar → + Xodim qo'shish**) qo'shasiz.

## 4. Netlify — sayt va server funksiyalari
```bash
netlify login
netlify init                      # yangi sayt yarating (yoki netlify link — mavjudiga ulash)
netlify env:set SUPABASE_URL https://xxxx.supabase.co
netlify env:set SUPABASE_SERVICE_ROLE_KEY <service_role>
npm run check                     # tezkor tekshiruv (5 soniya)
netlify deploy --build            # sinov havolasi — tekshiring
netlify deploy --build --prod     # production
```
`--build` buyrug'i `dist/` papkasini yig'adi — internetga **faqat sayt fayllari** chiqadi
(testlar, SQL, hujjatlar chiqmaydi). Keyingi yangilanishlar — FAQAT `scripts/deploy-netlify.sh` (Git/CLI) bilan,
`DEPLOY.md` dagi tartibda. ZIP'ni yoki papkani Netlify'ga **drag-and-drop qilmang**: funksiyalar chiqmaydi, "/" 404 bo'ladi.

## 5. Tekshirish
1. `https://<sayt>/.netlify/functions/health` → `{"ok":true, ...}`.
   `ok:false` bo'lsa, `hint` nima yetishmayotganini aytadi (kalit, sxema yoki rollar).
2. Saytni oching → 3-qadamdagi login/parol bilan kiring → Bosh sahifa ochiladi.
3. Mahsulot qo'shing (rasm bilan), kirim qiling, sinov savdosi qiling.

## 6. Avtomatik deploy (ixtiyoriy, GitHub orqali)
Repo'ga yuklang → GitHub → Settings → Secrets → `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID`.
Endi har `main`ga push'da: tekshiruv → 109 ta test → (hammasi o'tsa) Netlify'ga deploy →
`/health` tekshiruvi (`.github/workflows/ci.yml`). Test yiqilsa — deploy bo'lmaydi.

## Foydali buyruqlar
| Buyruq | Nima qiladi |
|---|---|
| `npm run check` | Sintaksis, server funksiyalari yuklanishi, havolalar, maxfiy kalit yo'qligi |
| `npm test` | Barcha avtomatik testlar (Chromium kerak: `npx playwright install chromium`) |
| `npm run build` | `dist/` — nashr uchun sayt |
| `npm run setup` | `js/config.js` ni yozish |
| `npm run create-admin` | Birinchi administrator |

## Maxfiylik qoidalari
- `service_role` kaliti faqat Netlify muhit o'zgaruvchisida va `create-admin` buyrug'ida.
- `.env` fayllari `.gitignore` da — GitHub'ga tushmaydi. Namuna: `.env.example`.
- `js/config.js` da faqat ochiq `anon` kalit bo'ladi (build va `npm run check` buni tekshiradi).

## Tarix: v10–v23
Mavjud production bazasi uchun ketma-ket:
- `supabase-migration-22-v10-fixes.sql` (qo'llangan);
- `supabase-migration-23-v10-firma-kassa.sql` (Firma Kassa, diller savdosi xavfsizligi);
- `supabase-migration-24-v11-cash-authority.sql` (filial kassalari — server jurnali, filial → Firma kassa atomik);
- `supabase-migration-25-v23-hardening.sql` (Firma kassa manbasi va bekor qilish, filial qarzi, to'lov+kassa atomik, ruxsatlar). Tekshiruv: `supabase-migration-25-verify.sql`.
- `supabase-migration-26-expense-categories.sql` (xarajat kategoriyalari — foydalanuvchi yaratadi; baza UTF8 bo'lishi shart).
- `supabase-migration-27-f4b-ledger-authority.sql` (F4b: mijoz/ta'minotchi qarzi va ombor qoldig'i — server jurnali; har doim OXIRIDA, 24/25 qayta ishga tushirilsa 27 ham qayta). Tekshiruv: `supabase-migration-25-verify.sql` (46 qator).
- `supabase-migration-28-firma-kassa-asosiy.sql` (Bosh kassa — asosiy kassa: xarajat va ta'minotchi to'lovi; 27 dan keyin).
- `supabase-migration-29-hisobdan-chiqarish-b2b.sql` (hisobdan chiqarish va B2B hamkor tizimlar; 28 dan keyin).
- `supabase-migration-30-diller-tolov-xabarnomasi.sql` (diller portaldan pul yuboradi; 24 va 25 dan keyin). Tekshiruv: verify — 57 qator.

Yangi o'rnatishda kerak emas — `schema.sql` hammasini (22–30) o'z ichiga oladi (haqiqiy PostgreSQL 16 da ham tekshirilgan).
