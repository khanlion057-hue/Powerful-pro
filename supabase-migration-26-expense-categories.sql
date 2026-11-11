-- ════════════════════════════════════════════════════════════════════
-- 26-migratsiya (2026-10-02): XARAJAT KATEGORIYALARI — foydalanuvchi o'zi yaratadi.
-- 23/24/25-migratsiyalardan keyin qo'llanadi. Takroriy ishga tushirish xavfsiz.
-- Ma'lumot o'chirilmaydi: faqat yangi jadval, funksiya va indekslar qo'shiladi.
--
-- Avval kategoriyalar kodda qotirilgan edi (Svet, Yo'lkira, Ijara, Soliq, Boshqa ...).
-- Endi kategoriya: filialning o'zi (filial avtonom), xarajat turi bo'yicha
-- (dokon / tasischi / hamkor). Yozish va o'qish FAQAT server orqali
-- (netlify/functions/expense-categories.js, service_role) — brauzerga jadval yopiq.
--
--  • Nom: bo'shliqlar bitta qilinadi va chetlari kesiladi; 1–60 belgi.
--  • Takror: filial + tur ichida, FAOL kategoriyalar orasida, katta-kichik harf va
--    apostrof turi (' ʻ ʼ ‘ ’ ` ´) farqsiz — "  Elektr " = "elektr".
--  • O'chirish: xarajatlarda ishlatilgan bo'lsa — faqat nofaol (is_active=false),
--    tarixiy xarajatlar o'z kategoriyasi bilan qoladi; ishlatilmagan bo'lsa — o'chiriladi.
--  • Nomni o'zgartirish: ID o'zgarmaydi (xarajatlar catId orqali bog'langan).
--  • Kategoriya hech qanday pul jadvaliga (kassa, Firma kassa, qarz, savdo) bog'lanmagan.
-- ════════════════════════════════════════════════════════════════════

-- Unicode apostroflarni (ʻ ʼ ‘ ’) to'g'ri solishtirish uchun baza UTF8 bo'lishi shart (Supabase — doim UTF8).
do $$ begin
  if pg_encoding_to_char((select encoding from pg_database where datname = current_database())) <> 'UTF8' then
    raise exception '26-migratsiya: baza kodlashi UTF8 bo''lishi kerak (hozir %)', pg_encoding_to_char((select encoding from pg_database where datname = current_database()));
  end if;
end $$;

-- Taqqoslash kaliti: bo'shliq normallashtiriladi, apostroflar bitta, kichik harf
create or replace function public._expense_cat_key(p_name text)
 returns text
 language sql
 immutable
 set search_path = ''
as $$
  select lower(btrim(regexp_replace(translate(coalesce(p_name, ''), 'ʻʼ‘’`´', repeat(chr(39), 6)), '\s+', ' ', 'g')));
$$;

create table if not exists public.expense_categories (
  id                  bigint generated always as identity primary key,
  filial              text not null,
  turi                text not null default 'dokon',
  name                text not null,
  name_key            text generated always as (public._expense_cat_key(name)) stored,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          bigint references public.staff(id) on delete set null,
  created_by_name     text,
  updated_by_name     text,
  deactivated_at      timestamptz,
  deactivated_by_name text,
  idem_key            text,
  constraint expense_categories_filial_chk check (filial ~ '^[A-Za-z0-9_-]{1,40}$'),
  constraint expense_categories_turi_chk   check (turi in ('dokon', 'tasischi', 'hamkor')),
  constraint expense_categories_name_chk   check (char_length(name) between 1 and 60 and name = btrim(name) and name !~ '\s{2,}'),
  constraint expense_categories_inactive_chk check (is_active or deactivated_at is not null),
  constraint expense_categories_meta_len   check (coalesce(length(created_by_name), 0) <= 200 and coalesce(length(updated_by_name), 0) <= 200
                                                  and coalesce(length(deactivated_by_name), 0) <= 200 and coalesce(length(idem_key), 0) <= 100)
);

-- Faol kategoriyalar orasida takror yo'q (nofaol bo'lgani bilan bir xil nomli yangisini yaratish mumkin)
create unique index if not exists expense_categories_active_uq on public.expense_categories (filial, turi, name_key) where is_active;
-- Ikki marta bosish / qayta urinish — bir xil kalit ikkinchi yozuv yaratmaydi
create unique index if not exists expense_categories_idem_uq on public.expense_categories (idem_key) where idem_key is not null;
create index if not exists idx_expense_categories_filial on public.expense_categories (filial, turi, is_active);

-- updated_at avtomatik
create or replace function public._expense_categories_touch()
 returns trigger
 language plpgsql
 set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'expense_categories_touch' and tgrelid = 'public.expense_categories'::regclass) then
    create trigger expense_categories_touch before update on public.expense_categories
      for each row execute function public._expense_categories_touch();
  end if;
end $$;

-- Xavfsizlik: RLS yoqilgan, siyosat YO'Q (anon/authenticated uchun hamma narsa yopiq);
-- faqat server (service_role) o'qiydi va yozadi
alter table public.expense_categories enable row level security;
revoke all on public.expense_categories from public, anon, authenticated;
grant select, insert, update, delete on public.expense_categories to service_role;
grant usage on sequence public.expense_categories_id_seq to service_role;
revoke all on function public._expense_cat_key(text) from public, anon, authenticated;
grant execute on function public._expense_cat_key(text) to service_role;
revoke all on function public._expense_categories_touch() from public, anon, authenticated;

comment on table public.expense_categories is
  'Xarajat kategoriyalari (filial + tur bo''yicha). Foydalanuvchi yaratadi; tayyor ro''yxat yo''q. Faqat server yozadi (expense-categories funksiyasi).';
