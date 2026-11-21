-- ════════════════════════════════════════════════════════════════════════════
-- 40-MIGRATSIYA (v25) — FILIALGA JO'NATMA: «SOTISH UCHUN» yoki «QARZGA»
-- ════════════════════════════════════════════════════════════════════════════
-- Egasi qarorlari (2026-11-08):
--   • Hisob har jo'natma bo'yicha tanlanadi (har mahsulot emas).
--   • «Sotish uchun» (konsignatsiya, avvalgidek): filial qarzi tovar SOTILGANDA, jo'natmadagi narxda.
--     Narx = berilgan (optom) narx − filial xizmat foizi — brauzer shu narxni yuboradi (36 o'zgarmagan).
--   • «Qarzga» (yangi): filial tovarni sotib oladi — qarz QABUL QILINGANDA (aynan kelgan son × narx) yoziladi;
--     sotilganda qayta yozilmaydi (partiya from_branch = 'baza_debt'). Filial uni Bazaga qaytarsa —
--     Baza qabul qilgan son × o'sha narx qarzdan ayiriladi.
-- 36-migratsiyadagi branch_transfer_op O'ZGARMAYDI: yangi branch_transfer_op_v40 uni chaqiradi va «qarzga»
-- jo'natmalar uchun qo'shimcha yozuvlarni o'sha tranzaksiyada qiladi. Faqat QO'SHADI, takror ishga tushirish xavfsiz.
-- Talab: 27 (_branch_debt_add), 36 (o'tkazmalar).

do $$ begin
  if to_regprocedure('public.branch_transfer_op(text,text,text,jsonb,bigint,text,boolean)') is null
     or to_regprocedure('public._branch_debt_add(text,numeric)') is null then
    raise exception '40-migratsiya: avval 27 va 36-migratsiyalar qo''llanishi kerak';
  end if;
end $$;

alter table public.branch_transfer_shipments add column if not exists mode text not null default 'consign';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'branch_transfer_shipments_mode_chk') then
    alter table public.branch_transfer_shipments add constraint branch_transfer_shipments_mode_chk check (mode in ('consign','debt'));
  end if;
end $$;
alter table public.branch_transfer_shipments add column if not exists debt_usd numeric not null default 0;

create or replace function public.branch_transfer_op_v40(p_filial text, p_op_key text, p_kind text, p_payload jsonb,
  p_staff_id bigint default null, p_staff_name text default null, p_is_admin boolean default false)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  p jsonb := coalesce(p_payload, '{}'::jsonb);
  v_res jsonb;
  v_sid bigint;
  s public.branch_transfer_shipments;
  ln jsonb;
  src public.batches;
  v_debt numeric := 0;
  v_back numeric := 0;
begin
  -- Takror so'rov: birinchi natija (qo'shimcha yozuvlar ham birinchi marta bajarilgan)
  if exists (select 1 from public.ledger_ops where filial = p_filial and op_key = p_op_key) then
    return public.branch_transfer_op(p_filial, p_op_key, p_kind, p_payload, p_staff_id, p_staff_name, p_is_admin);
  end if;
  if p_kind = 'tr_ship' and p->>'mode' = 'debt' and p_filial <> 'baza' then
    raise exception 'LEDGER: «Qarzga» jo''natma faqat Bazadan filialga' using errcode = 'P0001';
  end if;

  v_res := public.branch_transfer_op(p_filial, p_op_key, p_kind, p_payload, p_staff_id, p_staff_name, p_is_admin);

  -- «Qarzga» jo'natish: jo'natma belgilanadi, filialdagi (yo'ldagi) partiyalar sotilganda qarz yozmaydi
  if p_kind = 'tr_ship' and p->>'mode' = 'debt' then
    v_sid := (v_res->>'shipmentId')::bigint;
    update public.branch_transfer_shipments set mode = 'debt' where id = v_sid returning * into s;
    -- partiya himoyasi (27) — faqat ombor jurnali funksiyalari kabi, shu tranzaksiya ichida ruxsat
    perform set_config('fw.stock_move', '1', true);
    update public.batches set from_branch = 'baza_debt'
     where id in (select (l->>'batchId')::bigint from jsonb_array_elements(s.lines) l);
    perform set_config('fw.stock_move', '', true);
  end if;

  -- Qabul: «qarzga» jo'natma — kelgan son × narx filial qarziga; Bazaga qaytgan «qarzga» tovar — qarzdan ayiriladi
  if p_kind = 'tr_receive' then
    select * into s from public.branch_transfer_shipments where id = public._fw_num(p->>'shipmentId')::bigint;
    if s.mode = 'debt' then
      select coalesce(sum(public._fw_num(l->>'recv') * public._fw_num(l->>'cost')), 0) into v_debt from jsonb_array_elements(s.lines) l;
      if v_debt > 0 then
        perform public._branch_debt_add(p_filial, round(v_debt, 4));
        update public.branch_transfer_shipments set debt_usd = round(v_debt, 4) where id = s.id;
      end if;
    end if;
    if p_filial = 'baza' then
      for ln in select l from jsonb_array_elements(s.lines) l loop
        select * into src from public.batches where id = (ln->>'srcBatchId')::bigint;
        if found and src.from_branch = 'baza_debt' and src.filial <> 'baza' then
          v_back := round(public._fw_num(ln->>'recv') * src.cost_usd, 4);
          if v_back > 0 then perform public._branch_debt_add(src.filial, -v_back); end if;
        end if;
      end loop;
    end if;
    v_res := v_res || jsonb_build_object('debtUsd', round(v_debt, 4));
  end if;
  return v_res;
end;
$$;
revoke all on function public.branch_transfer_op_v40(text, text, text, jsonb, bigint, text, boolean) from public, anon, authenticated;
grant execute on function public.branch_transfer_op_v40(text, text, text, jsonb, bigint, text, boolean) to service_role;
