-- ════════════════════════════════════════════════════════════════════════════
-- 36-MIGRATSIYA (v24.6) — FILIALLAR O'TKAZMASI: so'rov → jo'natish → yo'lda → sanab qabul
-- ════════════════════════════════════════════════════════════════════════════
-- Egasi qarorlari (2026-10-15):
--   • Jo'natilgan tovar qabul qiluvchi filial omboriga — U SANAB QABUL QILGANDA tushadi (yo'lda: «transit»).
--   • Yo'nalishlar: Baza → filial (so'rov va yuborish), filial → filial, filial → Baza (qaytarish).
--   • So'rovni qisman bajarish mumkin — qolgani ochiq qoladi (yoki «Qolganini yopish»).
--   • Baza foydasi — FILIAL SOTGANDA (jo'natilganda «ichki savdo» YOZILMAYDI). Filialning Bazaga qarzi
--     avvalgidek sotilganda oshadi (_stock_fifo_out → _branch_debt_add, o'zgarmagan).
--   • Kam kelgan tovar: qabul qiluvchi izoh yozadi (majburiy), farq jo'natuvchiga boradi — u «omborga qaytdi»
--     yoki «yo'qotish» deb hal qiladi.
-- Faqat QO'SHADI (yangi jadvallar, ustun, funksiyalar; CHECK ro'yxatlari kengaytiriladi). Takror ishga
-- tushirish xavfsiz. 27 va 35 dan KEYIN. Faqat server (service_role) — brauzer rollariga huquq yo'q.
-- Eski yo'l (stock-debt-ops stock_out/transfer — «ichki savdo» bilan) saqlanadi: yangilanmagan sahifa ishlayveradi.

do $$ begin
  if to_regprocedure('public._stock_fifo_out(text,bigint,numeric,text,text,text,text,text,text,bigint,text)') is null
     or to_regprocedure('public._ledger_op_batch_ids(text,text)') is null then
    raise exception '36-migratsiya: avval 27 va 35-migratsiyalar qo''llanishi kerak';
  end if;
end $$;

-- ── 1. Partiya: Baza tannarxi (Bazadan kelgan tovarda — Baza foydasini filial sotganda hisoblash uchun) ──
alter table public.batches add column if not exists base_cost_usd numeric;

-- ── 2. O'tkazma hujjati (OT-0001) va jo'natmalari ───────────────────────────
create sequence if not exists public.branch_transfer_no_seq;
create table if not exists public.branch_transfers (
  id bigint generated always as identity primary key,
  no text not null unique,
  kind text not null,                       -- request | send | return
  from_filial text not null,                -- jo'natuvchi (tovar egasi)
  to_filial text not null,                  -- qabul qiluvchi
  status text not null default 'open',      -- open | done (hammasi jo'natildi) | closed (qolgani yopildi)
  items jsonb not null default '[]'::jsonb, -- [{pid, sku, name, qty (so'ralgan), shipped}]
  note text, priority text, need_by date,
  created_by text, created_by_id bigint, created_at timestamptz not null default now(),
  closed_at timestamptz, closed_by text, close_note text,
  constraint branch_transfers_kind_chk check (kind in ('request','send','return')),
  constraint branch_transfers_status_chk check (status in ('open','done','closed')),
  constraint branch_transfers_dir_chk check (from_filial <> to_filial and from_filial ~ '^[a-z0-9_]{1,40}$' and to_filial ~ '^[a-z0-9_]{1,40}$')
);
create index if not exists branch_transfers_from_idx on public.branch_transfers (from_filial, created_at desc);
create index if not exists branch_transfers_to_idx on public.branch_transfers (to_filial, created_at desc);

create table if not exists public.branch_transfer_shipments (
  id bigint generated always as identity primary key,
  transfer_id bigint not null references public.branch_transfers(id),
  seq integer not null,
  status text not null default 'transit',   -- transit | received | diff (kam keldi, jo'natuvchi hal qiladi) | resolved
  lines jsonb not null default '[]'::jsonb, -- [{pid, qty, localId, batchId, srcBatchId, srcLocalId, srcCost, cost, recv}]
  received jsonb,                           -- [{pid, qty}]
  recv_note text, resolution text, loss_usd numeric,
  shipped_by text, shipped_at timestamptz not null default now(),
  received_by text, received_at timestamptz,
  resolved_by text, resolved_at timestamptz,
  constraint branch_transfer_shipments_status_chk check (status in ('transit','received','diff','resolved')),
  constraint branch_transfer_shipments_res_chk check (resolution is null or resolution in ('returned','loss')),
  unique (transfer_id, seq)
);
alter table public.branch_transfers enable row level security;
alter table public.branch_transfer_shipments enable row level security;
revoke all on public.branch_transfers, public.branch_transfer_shipments from public, anon, authenticated;
revoke all on sequence public.branch_transfer_no_seq from public, anon, authenticated;

-- ── 3. Jurnal turlari (avvalgilari saqlanadi) ───────────────────────────────
alter table public.stock_ledger drop constraint if exists stock_ledger_kind_chk;
alter table public.stock_ledger add constraint stock_ledger_kind_chk check (op_kind in ('opening','archive','sale','sale_edit','sale_void','sale_return','kirim','import',
  'opening_stock','edit','delete','arrive','revision','transfer_out','transfer_in','dealer_out','dealer_return',
  'writeoff','writeoff_cancel','b2b_out','b2b_in','b2b_restock','transfer_back','transfer_short'));
alter table public.ledger_ops drop constraint if exists ledger_ops_kind_chk;
alter table public.ledger_ops add constraint ledger_ops_kind_chk check (kind in ('sale','sale_return','sale_void','sale_edit','cust_set','supp_set',
  'batches_create','batch_edit','batch_delete','batch_arrive','revision','stock_out','firma_supp_pay',
  'writeoff','writeoff_cancel','b2b_ship','b2b_receive','b2b_ack','b2b_restock','supp_advance','supp_advance_apply',
  'dealer_ship','dealer_return','dealer_sale','tr_request','tr_ship','tr_receive','tr_resolve','tr_close'));

-- ── 3b. Javobdagi partiyalar: pid/bno/kelib chiqishi ham (brauzer yangi «tr…» partiyani ro'yxatga qo'shishi uchun).
-- Faqat KALIT QO'SHILDI — avvalgi kalitlar o'zgarmagan (eski sahifalar ularni e'tiborsiz qoldiradi).
create or replace function public._fw_authority(p_filial text, p_cust bigint[], p_supp bigint[], p_batches bigint[])
 returns jsonb
 language sql
 stable
 set search_path = ''
as $$
  select jsonb_build_object(
    'filial', p_filial,
    'customers', coalesce((select jsonb_object_agg(customer_local_id::text, debt) from public.customer_balances
                            where filial = p_filial and customer_local_id = any(coalesce(p_cust, '{}'))), '{}'::jsonb),
    'suppliers', coalesce((select jsonb_object_agg(supplier_local_id::text, jsonb_build_object('debt', debt, 'paid', total_paid)) from public.supplier_balances
                            where filial = p_filial and supplier_local_id = any(coalesce(p_supp, '{}'))), '{}'::jsonb),
    'batches', coalesce((select jsonb_agg(jsonb_build_object('filial', filial, 'localId', local_id, 'qty', qty, 'sold', sold, 'status', status, 'costUsd', cost_usd,
                            'pid', pid, 'bno', bno, 'origin', origin, 'fromBranch', from_branch, 'date', batch_date) order by id)
                          from public.batches where id = any(coalesce(p_batches, '{}'))), '[]'::jsonb),
    'branchDebt', coalesce((select data->'branchDebt' from public.app_data where id = 'main'), '{}'::jsonb));
$$;
revoke all on function public._fw_authority(text, bigint[], bigint[], bigint[]) from public, anon, authenticated;

-- ── 4. Hujjat → brauzer formati ─────────────────────────────────────────────
create or replace function public._tr_json(t public.branch_transfers)
 returns jsonb
 language sql
 stable
 set search_path = ''
as $$
  select jsonb_build_object('id', t.id, 'no', t.no, 'kind', t.kind, 'from', t.from_filial, 'to', t.to_filial, 'status', t.status,
    'items', t.items, 'note', t.note, 'priority', t.priority, 'needBy', t.need_by, 'createdBy', t.created_by, 'createdAt', t.created_at,
    'closedAt', t.closed_at, 'closedBy', t.closed_by, 'closeNote', t.close_note,
    'shipments', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'seq', s.seq, 'status', s.status, 'lines', s.lines,
        'received', s.received, 'recvNote', s.recv_note, 'resolution', s.resolution, 'lossUsd', s.loss_usd,
        'shippedBy', s.shipped_by, 'shippedAt', s.shipped_at, 'receivedBy', s.received_by, 'receivedAt', s.received_at,
        'resolvedBy', s.resolved_by, 'resolvedAt', s.resolved_at) order by s.seq)
      from public.branch_transfer_shipments s where s.transfer_id = t.id), '[]'::jsonb));
$$;

-- Ro'yxat: shu filial ishtirok etgan barcha ochiq hujjatlar + oxirgi 100 ta (admin p_all — hammasi)
create or replace function public.branch_transfer_list(p_filial text, p_all boolean default false)
 returns jsonb
 language sql
 stable
 set search_path = ''
as $$
  with mine as (
    select t.* from public.branch_transfers t
     where (p_all or t.from_filial = p_filial or t.to_filial = p_filial)
  ), pick as (
    select * from mine where status = 'open'
       or exists (select 1 from public.branch_transfer_shipments s where s.transfer_id = mine.id and s.status in ('transit','diff'))
    union
    select * from (select * from mine order by created_at desc limit 100) r
  )
  select coalesce(jsonb_agg(public._tr_json(p) order by p.created_at desc), '[]'::jsonb) from pick p;
$$;

-- ── 5. Asosiy amal: so'rov / jo'natish / qabul / farq yechimi / yopish ───────
-- p_filial — amalni bajaruvchi filial (server: xodimning filiali; admin — tanlangan filial).
create or replace function public.branch_transfer_op(p_filial text, p_op_key text, p_kind text, p_payload jsonb,
  p_staff_id bigint default null, p_staff_name text default null, p_is_admin boolean default false)
 returns jsonb
 language plpgsql
 set search_path = ''
as $$
declare
  p jsonb := coalesce(p_payload, '{}'::jsonb);
  v_res jsonb;
  t public.branch_transfers;
  s public.branch_transfer_shipments;
  r record;
  e jsonb;
  ln jsonb;
  v_items jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_new_lines jsonb := '[]'::jsonb;
  v_to text;
  v_rem numeric;
  v_fifo jsonb;
  v_alloc jsonb;
  src public.batches;
  v_cost numeric;
  v_base numeric;
  v_fromb text;
  v_b public.batches;
  v_n integer := 0;
  v_seq integer;
  v_sid bigint;
  v_side jsonb := '[]'::jsonb;
  v_supps bigint[] := '{}';
  v_bids bigint[] := '{}';
  v_short numeric;
  v_acc numeric;
  v_left numeric;
  v_tot_short numeric := 0;
  v_loss numeric := 0;
  v_name text := left(coalesce(nullif(p_staff_name, ''), 'Admin'), 200);
  v_label text;
  v_note text;
begin
  if p_kind is null or p_kind not in ('tr_request','tr_ship','tr_receive','tr_resolve','tr_close') then
    raise exception 'LEDGER: noma''lum o''tkazma amali' using errcode = 'P0001';
  end if;
  if coalesce(p_filial, '') !~ '^[a-z0-9_]{1,40}$' then raise exception 'LEDGER: filial noto''g''ri' using errcode = 'P0001'; end if;
  v_res := public._ledger_op_replay(p_filial, p_op_key, p_kind);
  if v_res is not null then return v_res; end if;

  -- ── So'rov: qabul qiluvchi (p_filial) jo'natuvchidan (p.from) tovar so'raydi ──
  if p_kind = 'tr_request' then
    v_to := p->>'from';
    if coalesce(v_to, '') !~ '^[a-z0-9_]{1,40}$' or v_to = p_filial then
      raise exception 'LEDGER: qayerdan so''ralishi noto''g''ri' using errcode = 'P0001';
    end if;
    if jsonb_typeof(p->'items') is distinct from 'array' or jsonb_array_length(p->'items') < 1 or jsonb_array_length(p->'items') > 300 then
      raise exception 'LEDGER: mahsulotlar ro''yxati noto''g''ri' using errcode = 'P0001';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('pid', x.pid, 'sku', x.sku, 'name', x.name, 'qty', x.qty, 'shipped', 0) order by x.o), '[]'::jsonb)
      into v_items
      from (select public._fw_num(i->>'pid')::bigint as pid, max(left(i->>'sku', 80)) as sku, max(left(i->>'name', 300)) as name,
                   sum(public._fw_num(i->>'qty')) as qty, min(o) as o
              from jsonb_array_elements(p->'items') with ordinality as a(i, o) group by 1) x;
    if exists (select 1 from jsonb_array_elements(v_items) i
                where public._fw_num(i->>'pid') <= 0 or public._fw_num(i->>'qty') <= 0 or public._fw_num(i->>'qty') > 10000000) then
      raise exception 'LEDGER: mahsulot yoki miqdor noto''g''ri' using errcode = 'P0001';
    end if;
    insert into public.branch_transfers (no, kind, from_filial, to_filial, items, note, priority, need_by, created_by, created_by_id)
    values ('OT-' || lpad(nextval('public.branch_transfer_no_seq')::text, 4, '0'), 'request', v_to, p_filial, v_items,
            left(p->>'note', 500), case when p->>'priority' = 'urgent' then 'urgent' else 'normal' end,
            case when coalesce(p->>'needBy', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (p->>'needBy')::date end, v_name, p_staff_id)
    returning * into t;
    return public._ledger_op_finish(p_filial, p_op_key, p_kind, jsonb_build_object('transfer', public._tr_json(t)),
                                    null, null, null, p_staff_id, p_staff_name);
  end if;

  -- ── Jo'natish: jo'natuvchi (p_filial) — so'rov bo'yicha (qisman ham) yoki to'g'ridan-to'g'ri (p.to) ──
  -- Tovar jo'natuvchidan FIFO bo'yicha chiqadi; qabul qiluvchida «yo'lda» (transit) partiya — omborga sanab qabul qilinganda tushadi.
  if p_kind = 'tr_ship' then
    if jsonb_typeof(p->'items') is distinct from 'array' or jsonb_array_length(p->'items') < 1 or jsonb_array_length(p->'items') > 300 then
      raise exception 'LEDGER: mahsulotlar ro''yxati noto''g''ri' using errcode = 'P0001';
    end if;
    if coalesce(p->>'transferId', '') ~ '^[0-9]{1,18}$' then
      select * into t from public.branch_transfers where id = (p->>'transferId')::bigint for update;
      if not found then raise exception 'LEDGER: o''tkazma topilmadi' using errcode = 'P0001'; end if;
      if t.from_filial <> p_filial then raise exception 'LEDGER: bu so''rov sizga yuborilmagan' using errcode = 'P0001'; end if;
      if t.status <> 'open' then raise exception 'LEDGER: o''tkazma yopilgan' using errcode = 'P0001'; end if;
    else
      v_to := p->>'to';
      if coalesce(v_to, '') !~ '^[a-z0-9_]{1,40}$' or v_to = p_filial then
        raise exception 'LEDGER: qabul qiluvchi filial noto''g''ri' using errcode = 'P0001';
      end if;
      select coalesce(jsonb_agg(jsonb_build_object('pid', x.pid, 'sku', x.sku, 'name', x.name, 'qty', x.qty, 'shipped', 0) order by x.o), '[]'::jsonb)
        into v_items
        from (select public._fw_num(i->>'pid')::bigint as pid, max(left(i->>'sku', 80)) as sku, max(left(i->>'name', 300)) as name,
                     sum(public._fw_num(i->>'qty')) as qty, min(o) as o
                from jsonb_array_elements(p->'items') with ordinality as a(i, o) group by 1) x;
      insert into public.branch_transfers (no, kind, from_filial, to_filial, items, note, created_by, created_by_id)
      values ('OT-' || lpad(nextval('public.branch_transfer_no_seq')::text, 4, '0'), case when v_to = 'baza' then 'return' else 'send' end,
              p_filial, v_to, v_items, left(p->>'note', 500), v_name, p_staff_id)
      returning * into t;
    end if;
    v_to := t.to_filial;
    select coalesce(max(seq), 0) + 1 into v_seq from public.branch_transfer_shipments where transfer_id = t.id;
    insert into public.branch_transfer_shipments (transfer_id, seq, status, shipped_by) values (t.id, v_seq, 'transit', v_name)
      returning id into v_sid;
    v_label := t.no || ' (' || v_seq || '-jo''natma)';
    for r in
      select public._fw_num(i->>'pid')::bigint as pid, sum(public._fw_num(i->>'qty')) as qty, max(public._fw_num(i->>'priceUsd')) as price,
             bool_or(i ? 'priceUsd') as has_price
        from jsonb_array_elements(p->'items') i group by 1 order by 1
    loop
      if r.pid is null or r.pid <= 0 or r.qty is null or r.qty <= 0 or r.qty > 10000000 then
        raise exception 'LEDGER: mahsulot yoki miqdor noto''g''ri' using errcode = 'P0001';
      end if;
      select i into e from jsonb_array_elements(t.items) i where public._fw_num(i->>'pid') = r.pid limit 1;
      if e is null then raise exception 'LEDGER: bu mahsulot o''tkazmada yo''q (pid=%)', r.pid using errcode = 'P0001'; end if;
      v_rem := public._fw_num(e->>'qty') - public._fw_num(e->>'shipped');
      if r.qty > v_rem + 0.000001 then
        raise exception 'LEDGER: so''ralganidan ko''p jo''natib bo''lmaydi (pid=%, qolgan %)', r.pid, v_rem using errcode = 'P0001';
      end if;
      if p_filial = 'baza' and (not r.has_price or r.price < 0 or r.price > 10000000) then
        raise exception 'LEDGER: filial narxi noto''g''ri (pid=%)', r.pid using errcode = 'P0001';
      end if;
      v_fifo := public._stock_fifo_out(p_filial, r.pid, r.qty, 'transfer_out', p_op_key || ':o:' || r.pid, p_op_key, 'transfer', t.no,
                                       v_label, p_staff_id, p_staff_name);
      -- konsignatsiya tovari jo'natuvchidan chiqdi — ta'minotchi qarzi jo'natuvchida. Filial qarzi YO'Q (bu sotuv emas).
      v_side := v_side || coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(v_fifo->'side', '[]'::jsonb)) x
                                     where x->>'kind' = 'consignment'), '[]'::jsonb);
      for v_alloc in select * from jsonb_array_elements(v_fifo->'allocs') loop
        select * into src from public.batches where id = (v_alloc->>'batchId')::bigint;
        v_bids := v_bids || src.id;
        if p_filial = 'baza' then
          -- Baza → filial: filial narxi (diller narxi) — filial qarzi sotilganda shu narxda; Baza tannarxi saqlanadi
          v_cost := r.price; v_base := public._fw_num(v_alloc->>'cost'); v_fromb := 'baza';
        elsif v_to = 'baza' then
          -- filial → Baza (qaytarish): Bazadan kelgan tovar — Baza tannarxida qaytadi
          v_cost := case when src.from_branch = 'baza' and src.base_cost_usd is not null then src.base_cost_usd
                         else public._fw_num(v_alloc->>'cost') end;
          v_base := null; v_fromb := null;
        else
          -- filial → filial: o'sha narx; Bazadan kelgan bo'lsa — qarz baribir Bazaga (sotilganda)
          v_cost := public._fw_num(v_alloc->>'cost'); v_base := src.base_cost_usd; v_fromb := src.from_branch;
        end if;
        v_n := v_n + 1;
        v_b := public._batch_insert(v_to, 'tr' || v_sid || '-' || v_n, r.pid, public._fw_num(v_alloc->>'take'), round(v_cost, 4), 'transit',
                 jsonb_build_object('bno', t.no, 'origin', 'Oʻtkazma ' || t.no || ': ' || p_filial || ' → ' || v_to,
                   'fromBranch', v_fromb, 'date', to_char(current_date, 'YYYY-MM-DD'), 'performedBy', v_name),
                 'transfer_in', p_op_key || ':i:' || v_n, p_op_key, 'transfer', t.no, p_staff_id, p_staff_name);
        if v_base is not null then update public.batches set base_cost_usd = round(v_base, 4) where id = v_b.id; end if;
        v_bids := v_bids || v_b.id;
        v_lines := v_lines || jsonb_build_object('pid', r.pid, 'qty', v_b.qty, 'localId', v_b.local_id, 'batchId', v_b.id,
          'srcBatchId', src.id, 'srcLocalId', src.local_id, 'srcCost', public._fw_num(v_alloc->>'cost'), 'cost', v_b.cost_usd);
      end loop;
      -- hujjatda jo'natilgan miqdor
      select coalesce(jsonb_agg(case when public._fw_num(i->>'pid') = r.pid
                                     then jsonb_set(i, '{shipped}', to_jsonb(public._fw_num(i->>'shipped') + r.qty)) else i end order by o), '[]'::jsonb)
        into t.items from jsonb_array_elements(t.items) with ordinality as a(i, o);
    end loop;
    v_supps := public._fw_apply_side_debts(p_filial, v_side, 0, p_op_key || ':side', p_op_key, 'transfer', t.no, p_staff_id, p_staff_name);
    update public.branch_transfer_shipments set lines = v_lines where id = v_sid;
    update public.branch_transfers
       set items = t.items,
           status = case when not exists (select 1 from jsonb_array_elements(t.items) i
                                            where public._fw_num(i->>'shipped') < public._fw_num(i->>'qty') - 0.000001) then 'done' else 'open' end
     where id = t.id returning * into t;
    return public._ledger_op_finish(p_filial, p_op_key, p_kind, jsonb_build_object('transfer', public._tr_json(t), 'shipmentId', v_sid),
                                    null, v_supps, v_bids, p_staff_id, p_staff_name);
  end if;

  -- ── Sanab qabul: qabul qiluvchi (p_filial) haqiqatda kelgan sonni kiritadi — omborga aynan shu son tushadi ──
  if p_kind = 'tr_receive' then
    select * into s from public.branch_transfer_shipments where id = public._fw_num(p->>'shipmentId')::bigint for update;
    if not found then raise exception 'LEDGER: jo''natma topilmadi' using errcode = 'P0001'; end if;
    select * into t from public.branch_transfers where id = s.transfer_id for update;
    if t.to_filial <> p_filial then raise exception 'LEDGER: bu jo''natma sizga emas' using errcode = 'P0001'; end if;
    if s.status <> 'transit' then raise exception 'LEDGER: jo''natma allaqachon qabul qilingan' using errcode = 'P0001'; end if;
    if jsonb_typeof(p->'items') is distinct from 'array' then raise exception 'LEDGER: qabul ro''yxati noto''g''ri' using errcode = 'P0001'; end if;
    v_note := nullif(btrim(left(p->>'note', 500)), '');
    for r in select public._fw_num(l->>'pid')::bigint as pid, sum(public._fw_num(l->>'qty')) as shipped
               from jsonb_array_elements(s.lines) l group by 1 order by 1 loop
      select i into e from jsonb_array_elements(p->'items') i where public._fw_num(i->>'pid') = r.pid limit 1;
      if e is null or not (e ? 'qty') then
        raise exception 'LEDGER: har bir mahsulot uchun kelgan sonni kiriting (pid=%)', r.pid using errcode = 'P0001';
      end if;
      v_left := public._fw_num(e->>'qty');
      if v_left < 0 or v_left > r.shipped + 0.000001 then
        raise exception 'LEDGER: kelgan son jo''natilganidan ko''p yoki manfiy (pid=%)', r.pid using errcode = 'P0001';
      end if;
      for ln in select l from jsonb_array_elements(s.lines) with ordinality as a(l, o) where public._fw_num(l->>'pid') = r.pid order by o loop
        v_acc := least(public._fw_num(ln->>'qty'), v_left);
        v_left := v_left - v_acc;
        v_short := public._fw_num(ln->>'qty') - v_acc;
        v_tot_short := v_tot_short + v_short;
        v_n := v_n + 1;
        perform public._stock_move((ln->>'batchId')::bigint, -v_short, 0, case when v_acc > 0 then 'arrive' else 'transfer_short' end,
                  p_op_key || ':r:' || v_n, p_op_key, 'transfer', t.no, coalesce(v_note, t.no), p_staff_id, p_staff_name,
                  case when v_acc > 0 then 'active' else 'deleted' end);
        v_bids := v_bids || (ln->>'batchId')::bigint;
        v_new_lines := v_new_lines || (ln || jsonb_build_object('recv', v_acc));
      end loop;
    end loop;
    if v_tot_short > 0.000001 and coalesce(length(v_note), 0) < 2 then
      raise exception 'LEDGER: kam kelgan bo''lsa — sababini izohda yozing' using errcode = 'P0001';
    end if;
    update public.branch_transfer_shipments
       set lines = v_new_lines, received = p->'items', recv_note = v_note, received_by = v_name, received_at = now(),
           status = case when v_tot_short > 0.000001 then 'diff' else 'received' end
     where id = s.id;
    return public._ledger_op_finish(p_filial, p_op_key, p_kind, jsonb_build_object('transfer', public._tr_json(t), 'shortUnits', v_tot_short),
                                    null, null, v_bids, p_staff_id, p_staff_name);
  end if;

  -- ── Farq yechimi: jo'natuvchi (p_filial) — kam kelgan qism «omborga qaytdi» yoki «yo'qotish» ──
  if p_kind = 'tr_resolve' then
    select * into s from public.branch_transfer_shipments where id = public._fw_num(p->>'shipmentId')::bigint for update;
    if not found then raise exception 'LEDGER: jo''natma topilmadi' using errcode = 'P0001'; end if;
    select * into t from public.branch_transfers where id = s.transfer_id for update;
    if t.from_filial <> p_filial then raise exception 'LEDGER: farqni faqat jo''natuvchi hal qiladi' using errcode = 'P0001'; end if;
    if s.status <> 'diff' then raise exception 'LEDGER: bu jo''natmada hal qilinadigan farq yo''q' using errcode = 'P0001'; end if;
    if coalesce(p->>'resolution', '') not in ('returned','loss') then raise exception 'LEDGER: yechim noto''g''ri' using errcode = 'P0001'; end if;
    for ln in select l from jsonb_array_elements(s.lines) with ordinality as a(l, o) order by o loop
      v_short := public._fw_num(ln->>'qty') - public._fw_num(ln->>'recv');
      continue when v_short <= 0.000001;
      v_n := v_n + 1;
      if p->>'resolution' = 'loss' then
        v_loss := v_loss + v_short * public._fw_num(ln->>'srcCost');
      else
        select * into src from public.batches where id = (ln->>'srcBatchId')::bigint for update;
        if found and src.status <> 'deleted' and src.filial = p_filial and src.sold >= v_short - 0.000001 then
          perform public._stock_move(src.id, 0, -v_short, 'transfer_back', p_op_key || ':b:' || v_n, p_op_key, 'transfer', t.no,
                                     'Oʻtkazmadan qaytdi: ' || t.no, p_staff_id, p_staff_name);
          v_bids := v_bids || src.id;
        else
          v_b := public._batch_insert(p_filial, 'trb' || s.id || '-' || v_n, public._fw_num(ln->>'pid')::bigint, v_short,
                   public._fw_num(ln->>'srcCost'), 'active',
                   jsonb_build_object('bno', t.no, 'origin', 'Oʻtkazmadan qaytdi: ' || t.no, 'fromBranch', src.from_branch,
                     'date', to_char(current_date, 'YYYY-MM-DD'), 'performedBy', v_name),
                   'transfer_back', p_op_key || ':b:' || v_n, p_op_key, 'transfer', t.no, p_staff_id, p_staff_name);
          if src.base_cost_usd is not null then update public.batches set base_cost_usd = src.base_cost_usd where id = v_b.id; end if;
          v_bids := v_bids || v_b.id;
        end if;
      end if;
    end loop;
    update public.branch_transfer_shipments
       set status = 'resolved', resolution = p->>'resolution', loss_usd = round(v_loss, 4), resolved_by = v_name, resolved_at = now()
     where id = s.id;
    return public._ledger_op_finish(p_filial, p_op_key, p_kind, jsonb_build_object('transfer', public._tr_json(t), 'lossUsd', round(v_loss, 4)),
                                    null, null, v_bids, p_staff_id, p_staff_name);
  end if;

  -- ── Qolganini yopish: so'rovning jo'natilmagan qismi bekor (ikki tomon yoki admin) ──
  select * into t from public.branch_transfers where id = public._fw_num(p->>'transferId')::bigint for update;
  if not found then raise exception 'LEDGER: o''tkazma topilmadi' using errcode = 'P0001'; end if;
  if not p_is_admin and p_filial not in (t.from_filial, t.to_filial) then
    raise exception 'LEDGER: bu o''tkazma sizga tegishli emas' using errcode = 'P0001';
  end if;
  if t.status <> 'open' then raise exception 'LEDGER: o''tkazma allaqachon yopilgan' using errcode = 'P0001'; end if;
  update public.branch_transfers set status = 'closed', closed_at = now(), closed_by = v_name, close_note = left(p->>'note', 500)
   where id = t.id returning * into t;
  return public._ledger_op_finish(p_filial, p_op_key, p_kind, jsonb_build_object('transfer', public._tr_json(t)),
                                  null, null, null, p_staff_id, p_staff_name);
end;
$$;

-- ── 6. Baza foydasi — FILIAL SOTGANDA: Bazadan kelgan tovar (base_cost_usd bor) filialda sotilgan/chiqarilgan qismi ──
-- Tushum = filial narxi × son (filial qarzi aynan shu), foyda = (filial narxi − Baza tannarxi) × son. Qaytarish/bekor — ayiriladi.
create or replace function public.branch_income(p_from date, p_to date)
 returns jsonb
 language sql
 stable
 set search_path = ''
as $$
  select coalesce(jsonb_object_agg(x.filial, jsonb_build_object('units', x.units, 'revenueUsd', x.rev, 'profitUsd', x.prof)), '{}'::jsonb)
    from (select b.filial, round(sum(l.d_sold), 4) as units, round(sum(l.d_sold * b.cost_usd), 4) as rev,
                 round(sum(l.d_sold * (b.cost_usd - b.base_cost_usd)), 4) as prof
            from public.stock_ledger l join public.batches b on b.id = l.batch_id
           where b.from_branch = 'baza' and b.filial <> 'baza' and b.base_cost_usd is not null
             and l.op_kind in ('sale','sale_edit','sale_void','sale_return','revision','writeoff','writeoff_cancel','b2b_out')
             and l.created_at >= p_from::timestamptz and l.created_at < (p_to + 1)::timestamptz
           group by b.filial) x;
$$;

-- ── 7. Huquqlar: faqat server (service_role) ───────────────────────────────
revoke all on function public._tr_json(public.branch_transfers) from public, anon, authenticated;
revoke all on function public.branch_transfer_list(text, boolean) from public, anon, authenticated;
revoke all on function public.branch_transfer_op(text, text, text, jsonb, bigint, text, boolean) from public, anon, authenticated;
revoke all on function public.branch_income(date, date) from public, anon, authenticated;
grant execute on function public.branch_transfer_list(text, boolean) to service_role;
grant execute on function public.branch_transfer_op(text, text, text, jsonb, bigint, text, boolean) to service_role;
grant execute on function public.branch_income(date, date) to service_role;
grant select, insert, update on public.branch_transfers, public.branch_transfer_shipments to service_role;
grant usage on sequence public.branch_transfer_no_seq to service_role;
