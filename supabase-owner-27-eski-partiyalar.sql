-- FAQAT O'QIYDI. 27-migratsiyadan keyin: FIFO'dan chiqarilgan eski (ilovada yo'q) partiyalar — egasi qarori uchun.
-- Tovar haqiqatan omborda bo'lsa: ilovada Ombor → «Boshlang'ich qoldiq» orqali kiriting, so'ng shu qatorni
--   update public.m27_stale_batches_archive set decision='reentered', decided_at=now(), decided_by='<ism>' where batch_id=<id>;
-- Tovar yo'q bo'lsa:  ... set decision='confirmed_absent' ...
-- DIQQAT: batches.status ni SQL orqali 'active' qilmang — ilova bu partiyani ko'rmaydi, server esa sotadi (ajralish).
select a.batch_id, a.filial, a.local_id, a.pid,
       coalesce((select p->>'sku' from public.app_data d, jsonb_array_elements(coalesce(d.data->'products','[]'::jsonb)) p
                  where d.id = 'main' and p->>'id' = a.pid::text limit 1), '?') as sku,
       coalesce((select p->>'name' from public.app_data d, jsonb_array_elements(coalesce(d.data->'products','[]'::jsonb)) p
                  where d.id = 'main' and p->>'id' = a.pid::text limit 1), '?') as nomi,
       a.qty - a.sold as qoldiq_dona, round(a.cost_usd, 4) as tannarx_usd, round((a.qty - a.sold) * a.cost_usd, 2) as qiymat_usd,
       a.original->>'batch_date' as partiya_sanasi, a.decision, a.decided_at, a.decided_by
  from public.m27_stale_batches_archive a
 order by a.filial, a.batch_id;
