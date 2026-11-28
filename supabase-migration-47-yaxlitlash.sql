-- ═══════════════════════════════════════════════════════════════════════════
-- 47-MIGRATSIYA (v25.1) — SO'M YAXLITLASH: har savdoda 3 ta alohida maydon (egasi qoidasi)
-- ═══════════════════════════════════════════════════════════════════════════
--   asl_jami_uzs              — chegirma va foizlardan keyingi jami (yaxlitlanmagan), butun so'm
--   yaxlitlash_chegirmasi_uzs — pastga yaxlitlash farqi (masalan 17 975 → 17 900: 75), butun so'm
--   tolangan_jami_uzs         — mijoz to'laydigan (yaxlitlangan) jami = tushum, butun so'm
-- Tannarx (cost_usd) va foyda (profit_usd) avvalgidek: foyda = to'langan jami − tannarx (yaxlitlash tannarxga tegmaydi).
-- Faqat ustun qo'shiladi — mavjud savdolar o'zgarmaydi (eski savdolarda bu maydonlar bo'sh). Takror ishga tushirish xavfsiz.
alter table public.sales add column if not exists asl_jami_uzs bigint;
alter table public.sales add column if not exists yaxlitlash_chegirmasi_uzs bigint;
alter table public.sales add column if not exists tolangan_jami_uzs bigint;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sales_yaxlitlash_chk' and conrelid = 'public.sales'::regclass) then
    alter table public.sales add constraint sales_yaxlitlash_chk check (
      asl_jami_uzs is null or (yaxlitlash_chegirmasi_uzs >= 0 and tolangan_jami_uzs >= 0
                               and asl_jami_uzs = tolangan_jami_uzs + yaxlitlash_chegirmasi_uzs));
  end if;
end $$;
