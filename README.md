# Powerful Pro

React + Vite + TypeScript ilova, backend — **Supabase** (auth + Postgres), hosting — **Netlify**.

## Lokal ishga tushirish

```bash
npm install
cp .env.example .env   # Supabase URL va publishable kalit
npm run dev
```

## Supabase

- Loyiha: `aniqvrvjawduyrexfufd` (https://aniqvrvjawduyrexfufd.supabase.co)
- Migratsiyalar: `supabase/migrations/`
  - `notes` jadvali, RLS yoqilgan — har bir foydalanuvchi faqat o'z yozuvlarini ko'radi.
- Auth → URL Configuration da Netlify domeningizni **Site URL** va **Redirect URLs** ga qo'shing.

## Netlify ga deploy

1. Netlify → **Add new site → Import an existing project** → ushbu GitHub reposini tanlang.
2. Build sozlamalari `netlify.toml` dan avtomatik olinadi (`npm run build`, `dist`).
3. **Site configuration → Environment variables** ga qo'shing:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
4. Deploy.
