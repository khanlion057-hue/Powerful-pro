-- ════════════════════════════════════════════════════════════════════
-- 27-MIGRATSIYADAN KEYIN — B VARIANTI: eski SQL partiyalar (m27_stale_batches_archive) REAL OMBORDA BOR bo'lsa,
-- ularni BOSHLANG'ICH QOLDIQ sifatida qayta kiritish (v23.10.1). Migratsiya zanjiriga KIRMAYDI — faqat egasi qaroridan
-- keyin, qo'lda, bir marta ishga tushiriladi (qayta ishga tushirish xavfsiz — takror yozmaydi).
--
-- Oldin (majburiy):
--   1) supabase-owner-27-eski-partiyalar.sql — ro'yxatni ko'ring (sku, nomi, qoldiq, tannarx, sana).
--   2) Omborda YO'Q partiyalar uchun:  update public.m27_stale_batches_archive
--          set decision = 'confirmed_absent', decided_at = now(), decided_by = '<ism>' where batch_id in (...);
--      (A varianti — hammasi yo'q bo'lsa, faqat shu qadam; bu skript kerak emas.)
--   3) Qolgan `pending` qatorlar — omborda BOR deb hisoblanadi va quyida tiklanadi.
--
-- Nima qiladi (har bir `pending` qator uchun, BITTA tranzaksiyada):
--   • stock_debt_op(... 'batches_create', reason 'opening') — yangi partiya `m27r-<batch_id>`: qoldiq (qty − sold),
--     ASL tannarx (cost_usd), asl sana; ombor jurnaliga 'opening_stock' yozuvi; ta'minotchi qarziga TEGMAYDI;
--   • ilova ma'lumoti (app_data_branches va app_data.branchStore) ga shu partiya qo'shiladi — ilova uni ko'radi;
--   • arxiv qatori: decision = 'reentered'. Asl (deleted) partiya qatori o'zgarmaydi — tarix saqlanadi.
-- Ishga tushirish: psql "$DATABASE_URL" -X -1 -v ON_ERROR_STOP=1 -f supabase-owner-27-tiklash.sql
-- (SQL Editor'da — boshiga `begin;`, oxiriga `commit;`). Keyin barcha xodimlar sahifani yangilaydi (F5).
-- ════════════════════════════════════════════════════════════════════
do $$
declare
  a public.m27_stale_batches_archive;
  v_local text;
  v_qty numeric;
  v_date text;
  v_entry jsonb;
  v_res jsonb;
  v_n int := 0;
begin
  if to_regclass('public.m27_stale_batches_archive') is null or not exists (select 1 from pg_proc where proname = 'stock_debt_op') then
    raise exception '27-migratsiya qo''llanmagan — tiklash shart emas';
  end if;
  for a in select * from public.m27_stale_batches_archive where decision = 'pending' order by batch_id for update loop
    v_qty := greatest(coalesce(a.qty, 0) - coalesce(a.sold, 0), 0);
    if v_qty <= 0 then
      update public.m27_stale_batches_archive set decision = 'confirmed_absent', decided_at = now(), decided_by = 'tiklash skripti',
             note = 'qoldiq 0 — tiklanadigan narsa yo''q' where batch_id = a.batch_id;
      continue;
    end if;
    v_local := 'm27r-' || a.batch_id;
    v_date := coalesce(a.original->>'batch_date', current_date::text);
    v_res := public.stock_debt_op(a.filial, 'm27-restore-' || a.batch_id, 'batches_create',
      jsonb_build_object('reason', 'opening', 'batches', jsonb_build_array(jsonb_build_object(
        'localId', v_local, 'pid', a.pid, 'qty', v_qty, 'costUsd', a.cost_usd,
        'meta', jsonb_build_object('date', v_date, 'origin', '27-arxivdan tiklandi (asl partiya #' || a.batch_id || ')', 'bno', a.original->>'bno')))),
      null, 'Egasi (27 tiklash)');
    v_entry := jsonb_build_object('id', v_local, 'pid', a.pid, 'qty', v_qty, 'sold', 0, 'costUsd', a.cost_usd, 'bankFeeUsd', 0,
      'cur', 'USD', 'date', v_date, 'status', 'active', 'origin', '27-arxivdan tiklandi (asl partiya #' || a.batch_id || ')',
      'bno', coalesce(a.original->>'bno', ''), 'performedBy', 'Egasi (27 tiklash)', 'items', '[]'::jsonb);
    -- ilova ma'lumoti: filial qatori (app_data_branches) — bo'lmasa yaratiladi
    insert into public.app_data_branches (branch_key, data) values (a.filial, jsonb_build_object('batches', jsonb_build_array(v_entry)))
      on conflict (branch_key) do update set
        data = jsonb_set(public.app_data_branches.data, '{batches}',
                 coalesce(public.app_data_branches.data->'batches', '[]'::jsonb) || jsonb_build_array(v_entry)),
        updated_at = now()
      where not exists (select 1 from jsonb_array_elements(coalesce(public.app_data_branches.data->'batches', '[]'::jsonb)) x where x->>'id' = v_local);
    -- eski nusxa (app_data.branchStore) — mavjud bo'lsa, unga ham
    update public.app_data set
      data = jsonb_set(data, array['branchStore', a.filial, 'batches'],
               coalesce(data->'branchStore'->a.filial->'batches', '[]'::jsonb) || jsonb_build_array(v_entry), true),
      updated_at = now()
     where id = 'main' and data->'branchStore' ? a.filial
       and not exists (select 1 from jsonb_array_elements(coalesce(data->'branchStore'->a.filial->'batches', '[]'::jsonb)) x where x->>'id' = v_local);
    update public.m27_stale_batches_archive set decision = 'reentered', decided_at = now(), decided_by = 'Egasi (27 tiklash)',
           note = 'boshlang''ich qoldiq: ' || v_local || ', ' || v_qty || ' dona × ' || round(a.cost_usd, 4) || ' $'
     where batch_id = a.batch_id;
    v_n := v_n + 1;
  end loop;
  raise notice '27 tiklash: % ta partiya boshlang''ich qoldiq sifatida kiritildi', v_n;
end $$;

-- Natija (faqat o'qiydi)
select a.batch_id, a.decision, b.local_id as yangi_partiya, b.qty, b.sold, b.cost_usd, b.status, a.note
  from public.m27_stale_batches_archive a
  left join public.batches b on b.local_id = 'm27r-' || a.batch_id and b.filial = a.filial
 order by a.batch_id;
