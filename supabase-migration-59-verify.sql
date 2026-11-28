-- 59-MIGRATSIYA TEKSHIRUVI (faqat o'qiydi, hech narsa o'zgartirmaydi). Barcha ustunlar true bo'lishi kerak.
select '59: tekshiruv' as natija,
  to_regclass('public.tg_inbox') is not null as inbox_jadvali,
  coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.tg_inbox')), false) as rls_yoqilgan,
  coalesce(not has_table_privilege('anon', to_regclass('public.tg_inbox'), 'select')
       and not has_table_privilege('authenticated', to_regclass('public.tg_inbox'), 'select'), false) as brauzer_kora_olmaydi,
  (select count(*) from pg_constraint where conrelid = to_regclass('public.tg_inbox') and contype in ('p', 'c')) = 5 as cheklovlar_5,
  (select count(*) from pg_indexes where schemaname = 'public' and tablename = 'tg_inbox') = 3 as indekslar_3,
  position('tg_inbox' in pg_get_functiondef('public.ops_cleanup()'::regprocedure)) > 0 as tozalash_ulangan,
  position('ai_ad_posts' in pg_get_functiondef('public.ops_cleanup()'::regprocedure)) > 0 as tozalash_58_saqlangan;
