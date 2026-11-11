-- ════════════════════════════════════════════════════════════════════════════
-- 39-MIGRATSIYA (v25) — SANA TOSHKENT VAQTI BO'YICHA
-- ════════════════════════════════════════════════════════════════════════════
-- Muammo: baza vaqt mintaqasi UTC. Toshkentda soat 00:00–04:59 orasida qilingan savdo, kirim, hisobdan
-- chiqarish, diller amali va h.k. `current_date` bo'yicha KECHAGI kunga yozilardi (kunlik hisobot va
-- kassa yopilishi noto'g'ri kunga tushardi).
-- Yechim: `current_date` ishlatadigan public funksiyalarning HAR BIRIGA `set timezone = 'Asia/Tashkent'`.
--   • Faqat shu funksiyalar ichida sana Toshkent bo'yicha hisoblanadi; boshqa so'rovlar, jadvallar,
--     timestamptz qiymatlar (created_at va h.k.) o'zgarmaydi — ular baribir vaqt mintaqasiz saqlanadi.
--   • Funksiya tanasi o'zgarmaydi (ALTER FUNCTION ... SET) — keyingi migratsiya funksiyani qayta
--     yaratsa ham, shu migratsiyani qayta ishga tushirish kifoya (takror ishga tushirish xavfsiz).
-- Orqaga qaytarish: har funksiya uchun `alter function ... reset timezone`.

do $$
declare
  r record;
  n int := 0;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.prokind = 'f'
      and pg_get_functiondef(p.oid) ilike '%current_date%'
      and not coalesce(p.proconfig @> array['TimeZone=Asia/Tashkent'], false)
  loop
    execute format('alter function %s set timezone = %L', r.sig, 'Asia/Tashkent');
    n := n + 1;
  end loop;
  raise notice '39-migratsiya: % ta funksiyaga Toshkent vaqti berildi', n;
end $$;

-- Tekshiruv: current_date ishlatadigan, lekin Toshkent vaqti berilmagan funksiya qolmasligi kerak
do $$
declare left_n int;
begin
  select count(*) into left_n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.prokind = 'f'
    and pg_get_functiondef(p.oid) ilike '%current_date%'
    and not coalesce(p.proconfig @> array['TimeZone=Asia/Tashkent'], false);
  if left_n > 0 then raise exception '39-migratsiya: % ta funksiya qoldi', left_n; end if;
end $$;
