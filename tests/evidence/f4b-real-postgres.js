// DALIL SKRIPTI (npm test'ga kirmaydi): F4b — 27-migratsiya HAQIQIY PostgreSQL 16 da (ko'p ulanish, parallel).
// Mijoz qarzi, ta'minotchi qarzi, ombor (sold/qty): oddiy, yetishmaydi, takror, PARALLEL, rollback, qaytarish,
// o'chirish, tahrir, brauzer yuborgan noto'g'ri qiymat, eski (shadow) yozish yo'li.
//   PGHOST=/tmp/fwpg PGPORT=5499 PGUSER=postgres node tests/evidence/f4b-real-postgres.js
// Skript `fw_f4b_test` nomli LOKAL bazani yaratadi/qayta yaratadi (production EMAS).
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..', '..');
const DB = 'fw_f4b_test';
const env = { ...process.env };
if (/supabase\.co|pooler/i.test(String(env.PGHOST || '') + String(env.DATABASE_URL || ''))) {
  console.error('⛔ Bu skript faqat lokal sinov bazasi uchun.'); process.exit(2);
}
const psqlSync = (sql, db = DB) => execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-tA', '-d', db, '-c', sql], { env, encoding: 'utf8' }).trim();
const psqlFile = (file, db = DB) => execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', db, '-f', file], { env, encoding: 'utf8', stdio: 'pipe' });
const tryQ = (sql) => { try { return { ok: true, out: psqlSync(sql) }; } catch (e) { return { ok: false, err: String(e.stderr || e.message).split('\n').find(l => /ERROR/.test(l)) || 'xato' }; } };
function psqlAsync(sql, delayMs = 0) {
  return new Promise((resolve) => setTimeout(() => {
    const p = spawn('psql', ['-X', '-q', '-tA', '-v', 'ON_ERROR_STOP=1', '-d', DB], { env });
    let out = '', err = '';
    p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { err += d; });
    p.on('close', (code) => resolve({ code, out: out.trim(), err: err.trim() }));
    p.stdin.end(sql);
  }, delayMs));
}
const PRELUDE = `
create schema extensions; create schema auth; create schema storage;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text, name text);
alter table storage.objects enable row level security;`;
const J = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;

async function main() {
  psqlSync(`drop database if exists ${DB}`, 'postgres');
  psqlSync(`create database ${DB} encoding 'UTF8' lc_collate 'C' lc_ctype 'C' template template0`, 'postgres');
  for (const r of ['anon', 'authenticated', 'service_role']) { try { psqlSync(`create role ${r} nologin`, 'postgres'); } catch (_) {} }
  const tmp = path.join(require('os').tmpdir(), 'fw-prelude-f4b.sql');
  fs.writeFileSync(tmp, PRELUDE); psqlFile(tmp);
  // 27-migratsiyadan OLDINGI holat: schema.sql ning 11-bo'limigacha (production + 24/25/26 kabi)
  const full = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
  const cut = full.indexOf('\n-- ────────────────────────────────────────────────────────────────────\n-- 11. 27-migratsiya');
  assert.ok(cut > 0, "schema.sql: 11-bo'lim topilmadi");
  const pre = path.join(require('os').tmpdir(), 'fw-schema-pre27.sql');
  fs.writeFileSync(pre, full.slice(0, cut)); psqlFile(pre);
  // Ilovadagi (JSON) holat — migratsiyadan OLDIN: 27 uni boshlang'ich qiymat sifatida ko'chiradi
  const branch = {
    cashboxes: [{ id: 1, name: 'Naqd', cur: 'UZS', bal: 0 }, { id: 3, name: 'Dollar', cur: 'USD', bal: 0 }],
    customers: [{ id: 5001, name: 'Ali', debt: 600000 }, { id: 5002, name: 'Vali', debt: 0 }],
    suppliers: [{ id: 7001, name: 'X MChJ', debt: 100, paid: 20 }, { id: 7002, name: 'Konsign', debt: 0, isConsignment: true }],
    batches: [
      { id: 9001, pid: 101, qty: 3, sold: 0, costUsd: 5, date: '2026-09-01', status: 'active' },
      { id: 9002, pid: 102, qty: 10, sold: 0, costUsd: 2, date: '2026-09-01', status: 'active', suppId: 7002, consignment: true },
      { id: 9003, pid: 103, qty: 5, sold: 2, costUsd: 4, date: '2026-09-02', status: 'active' },
    ],
    sales: [{ id: 8001, inv: 'INV-0001', custId: 5001, items: [{ pid: 103, qty: 2, sellUsd: 10, costUsd: 4 }], subtotalUsd: 20, totalUsd: 20, paidUsd: 0, debtUsd: 20, payType: 'debt', date: '2026-09-02' }],
  };
  psqlSync(`update app_data set data = data || ${J({ settings: { usdUzs: 12000 } })} where id='main';
    insert into app_data_branches (branch_key, data) values ('f729', ${J(branch)});
    insert into batches (local_id, filial, pid, qty, sold, cost_usd, status) values ('9001','f729',101,3,0,5,'active'), ('stale-1','f729',101,50,0,1,'active');`);
  // kassa: 24-migratsiyadan keyin jurnal orqali
  psqlSync(`select cashbox_apply_ops('f729','seed','manual_in','[{"box":1,"currency":"UZS","dir":"in","amount":5000000},{"box":3,"currency":"USD","dir":"in","amount":1000}]'::jsonb)`);
  psqlFile(path.join(ROOT, 'supabase-migration-27-f4b-ledger-authority.sql'));
  psqlFile(path.join(ROOT, 'supabase-migration-27-f4b-ledger-authority.sql'));   // takroriy — zarar yo'q

  const out = [];
  const n = (sql) => +psqlSync(sql);
  const cust = (id) => n(`select debt from customer_balances where filial='f729' and customer_local_id=${id}`);
  const supp = (id) => n(`select debt from supplier_balances where filial='f729' and supplier_local_id=${id}`);
  const left = (pid) => n(`select coalesce(sum(qty-sold),0) from batches where filial='f729' and pid=${pid} and status='active'`);
  const box = (b) => n(`select balance from cashbox_balances where filial='f729' and box_local_id=${b}`);
  const ok = (name, detail) => out.push(['✅', name, detail]);

  // 0) Boshlang'ich ko'chirish
  assert.equal(cust(5001), 600000); assert.equal(supp(7001), 100); assert.equal(left(101), 3); assert.equal(left(103), 3);
  assert.equal(psqlSync(`select status from batches where local_id='stale-1'`), 'deleted', 'eskirgan soya partiya FIFOdan chiqdi');
  assert.equal(psqlSync(`select local_id from sales where inv='INV-0001'`), '8001');
  ok("Boshlang'ich ko'chirish (JSON → SQL)", "mijoz 600 000, ta'minotchi 100$, ombor 3/10/3; eskirgan soya partiya (50 dona) — 'deleted'; savdo 8001 bog'landi; 2 marta ishga tushirildi");

  // 1) Brauzer/eski yo'l: qoldiqni to'g'ridan-to'g'ri o'zgartirish — rad
  for (const sql of [`update customer_balances set debt=2000000 where customer_local_id=5001`, `update supplier_balances set debt=0 where supplier_local_id=7001`,
    `update batches set sold=0 where local_id='9003'`, `insert into batches (local_id, filial, pid, qty, sold, cost_usd) values ('x','f729',101,99,0,1)`, `delete from stock_ledger`]) {
    const r = tryQ(sql); assert.equal(r.ok, false, sql);
  }
  assert.equal(cust(5001), 600000); assert.equal(left(103), 3);
  ok("Qoldiqni to'g'ridan-to'g'ri yozish (eski shadow-sync, brauzer qiymati)", "customer_balances/supplier_balances/batches UPDATE/INSERT va jurnal DELETE — trigger rad etdi; qiymatlar o'zgarmadi");

  // 2) MIJOZ TO'LOVI — parallel 2×400 000 (qarz 600 000): biri o'tadi, ikkinchisi HAQIQIY qoldiq bo'yicha rad
  const pay = (k, amt) => `select cash_payment_atomic('f729','${k}','cust_debt_pay','[{"box":1,"currency":"UZS","dir":"in","amount":${amt}}]'::jsonb,'customer_debt_payment','{"customer_local_id":5001,"customer_name":"Ali","amount_uzs":${amt},"box_local_id":1}'::jsonb)`;
  const b1 = box(1);
  const [p1, p2] = await Promise.all([psqlAsync(`begin; ${pay('ops:cpa', 400000)}; select pg_sleep(1); commit;`), psqlAsync(pay('ops:cpb', 400000), 200)]);
  assert.equal([p1, p2].filter(r => r.code === 0).length, 1, JSON.stringify([p1.err, p2.err]));
  assert.match((p1.code ? p1.err : p2.err), /oshib ketdi/);
  assert.equal(cust(5001), 200000); assert.equal(box(1), b1 + 400000);
  assert.equal(n(`select count(*) from customer_debt_payments`), 1);
  ok("Mijoz to'lovi — PARALLEL 2×400 000 (qarz 600 000)", "1-si o'tdi, 2-si qulfda kutib HAQIQIY qoldiq (200 000) bo'yicha rad; kassa +400 000 bir marta; to'lov yozuvi 1 ta");
  // takror (bir xil kalit) — replay, ikkinchi marta yechilmaydi
  const rep = psqlSync(pay('ops:cpa', 400000));
  assert.equal(JSON.parse(rep).replay, true); assert.equal(cust(5001), 200000); assert.equal(box(1), b1 + 400000);
  // qarzdan ortiq — rad, kassa o'zgarmaydi
  assert.equal(tryQ(pay('ops:cpc', 250000)).ok, false); assert.equal(box(1), b1 + 400000); assert.equal(cust(5001), 200000);
  ok("Mijoz to'lovi — takror va yetishmaydi", "bir xil kalit → replay (qarz/kassa o'zgarmadi); 250 000 > 200 000 → rad, kassa va qarz o'zgarmadi");

  // 3) TA'MINOTCHI TO'LOVI — parallel 2×80$ (qarz 100$)
  const spay = (k, amt) => `select cash_payment_atomic('f729','${k}','supp_pay','[{"box":3,"currency":"USD","dir":"out","amount":${amt}}]'::jsonb,'supplier_payment','{"supplier_local_id":7001,"supplier_name":"X","amount_usd":${amt},"box_local_id":3}'::jsonb)`;
  const b3 = box(3);
  const [s1, s2] = await Promise.all([psqlAsync(`begin; ${spay('ops:spa', 80)}; select pg_sleep(1); commit;`), psqlAsync(spay('ops:spb', 80), 200)]);
  assert.equal([s1, s2].filter(r => r.code === 0).length, 1);
  assert.equal(supp(7001), 20); assert.equal(box(3), b3 - 80);
  assert.equal(n(`select total_paid from supplier_balances where supplier_local_id=7001`), 100);
  ok("Ta'minotchi to'lovi — PARALLEL 2×80$ (qarz 100$)", "faqat bittasi o'tdi; qarz 20$, kassadan 80$ (160$ emas); jami to'langan 20→100");

  // 4) OMBOR — parallel 2 ta savdo 2 tadan (qoldiq 3)
  const sale = (key, qty, extra = {}) => `select sale_checkout_atomic_v3('f729','${key}', ${J({ localId: key, inv: 'I-' + key, items: [{ pid: 101, qty, sellUsd: 10, costUsd: 5 }], paidUsd: qty * 10, payType: 'usd', ...extra })}, ${J([{ box_id: 3, amount_native: qty * 10 }])})`;
  const [a, b] = await Promise.all([psqlAsync(`begin; ${sale('sa1', 2)}; select pg_sleep(1); commit;`), psqlAsync(sale('sa2', 2), 200)]);
  assert.equal([a, b].filter(r => r.code === 0).length, 1, a.err + ' | ' + b.err); assert.match(a.code ? a.err : b.err, /yetarli qoldiq/);
  assert.equal(left(101), 1); assert.equal(n(`select sold from batches where local_id='9001'`), 2);
  ok('Ombor — PARALLEL 2 ta savdo × 2 dona (qoldiq 3)', "1-si o'tdi, 2-si partiya qulfida kutib rad etildi; sotilgan 2, qoldiq 1 (ortiqcha sotuv yo'q); rad etilganning kassa tushumi ham yo'q");
  // takror savdo — replay
  const r2 = JSON.parse(psqlSync(sale(a.code ? 'sa2' : 'sa1', 2)));
  assert.equal(r2.replay, true); assert.equal(left(101), 1);
  // oversell (3 > 1) — rad, kassa o'zgarmaydi
  const b3b = box(3); assert.equal(tryQ(sale('sa3', 3)).ok, false); assert.equal(box(3), b3b); assert.equal(left(101), 1);
  ok('Ombor — takror va ortiqcha sotuv', "bir xil kalit → replay (sold o'zgarmadi); 3 dona (qoldiq 1) → rad, kassa va ombor o'zgarmadi");

  // 5) Nasiya savdo: mijoz qarzi SERVERDA (kurs bo'yicha); brauzer qarz qiymati yuborilmaydi
  const before = cust(5002);
  const ns = JSON.parse(psqlSync(`select sale_checkout_atomic_v3('f729','nas1', ${J({ localId: 'nas1', inv: 'I-nas1', custId: 5002, items: [{ pid: 103, qty: 1, sellUsd: 50, costUsd: 4 }], paidUsd: 20, payType: 'usd', debt: 99999999 })}, ${J([{ box_id: 3, amount_native: 20 }])})`));
  assert.equal(ns.debtUsd, 30); assert.equal(cust(5002), before + 30 * 12000);
  assert.equal(ns.authority.customers['5002'], 360000);
  ok('Nasiya savdo — qarz serverda', "jami 50$, to'langan 20$ → qarz 30$ × 12 000 = 360 000 so'm (brauzer yuborgan 'debt' e'tiborga olinmadi)");

  // 6) Konsignatsiya — sotilgan qism ta'minotchi qarziga serverda
  psqlSync(`select sale_checkout_atomic_v3('f729','kons1', ${J({ localId: 'kons1', inv: 'I-kons1', items: [{ pid: 102, qty: 4, sellUsd: 5, costUsd: 2 }], paidUsd: 20, payType: 'usd' })}, ${J([{ box_id: 3, amount_native: 20 }])})`);
  assert.equal(supp(7002), 8);
  ok('Konsignatsiya', "4 dona × 2$ = 8$ ta'minotchi qarziga serverda yozildi");

  // 7) QAYTARISH — serverdagi savdodan; qarz avval kamayadi; takror va ortiqcha rad
  const ret = (key, qty) => `select sale_return_atomic('f729','${key}','nas1',103,${qty},'rb-${key}','{}'::jsonb)`;
  const c0 = cust(5002), st0 = left(103);
  const rr = JSON.parse(psqlSync(ret('ret1', 1)));
  assert.equal(rr.debtPart, 30); assert.equal(rr.cashPart, 20); assert.equal(cust(5002), c0 - 360000); assert.equal(left(103), st0 + 1);
  assert.equal(JSON.parse(psqlSync(ret('ret1', 1))).replay, true); assert.equal(left(103), st0 + 1);
  assert.equal(tryQ(ret('ret2', 1)).ok, false, 'savdoda qolmagan miqdor');
  ok('Qaytarish', "qarz qismi 30$ (360 000 so'm) mijoz qarzidan, naqd qismi 20$ kassadan; ombor +1 (yangi partiya); takror → replay; qolmagan miqdor → rad");

  // 8) Qaytarish ROLLBACK — kassada mablag' yetmasa: qarz, ombor, savdo o'zgarmaydi
  psqlSync(`select sale_checkout_atomic_v3('f729','rb1', ${J({ localId: 'rb1', inv: 'I-rb1', items: [{ pid: 103, qty: 1, sellUsd: 5000, costUsd: 4 }], paidUsd: 5000, payType: 'usd' })}, ${J([{ box_id: 3, amount_native: 5000 }])})`);
  psqlSync(`select cashbox_apply_ops('f729','drain','manual_out','[{"box":3,"currency":"USD","dir":"out","amount":${box(3) - 1}}]'::jsonb)`);
  const st1 = left(103), sj = psqlSync(`select items::text from sales where local_id='rb1'`);
  assert.equal(tryQ(`select sale_return_atomic('f729','rbx','rb1',103,1,'rb-rbx','{}'::jsonb)`).ok, false);
  assert.equal(left(103), st1); assert.equal(psqlSync(`select items::text from sales where local_id='rb1'`), sj);
  assert.equal(n(`select count(*) from batches where local_id='rb-rbx'`), 0);
  ok("Qaytarish — ROLLBACK (kassada mablag' yetmaydi)", "rad etildi; ombor, savdo yozuvi va partiya — o'zgarmadi (bitta tranzaksiya)");

  // 9) Savdoni o'chirish va tahrir (delta) — ombor/qarz serverda
  psqlSync(`select cashbox_apply_ops('f729','refill','manual_in','[{"box":3,"currency":"USD","dir":"in","amount":1000}]'::jsonb)`);
  const c1 = cust(5001);
  const ed = JSON.parse(psqlSync(`select sale_edit_atomic('f729','ed1','8001','delta', ${J({ items: [{ idx: 0, qty: 3 }], discPct: 0 })})`));
  assert.equal(ed.sale.debtUsd, 30); assert.equal(cust(5001), c1 + 10 * 12000);
  const v = JSON.parse(psqlSync(`select sale_void_atomic('f729','vd1','8001', ${J(['vb-1'])}, '{}'::jsonb)`));
  assert.equal(v.sale.voided, true); assert.equal(cust(5001), Math.max(0, c1 + 120000 - 360000), "avvalgi qoida: 0 dan pastga tushmaydi");
  assert.equal(tryQ(`select sale_void_atomic('f729','vd2','8001','["vb-2"]'::jsonb,'{}'::jsonb)`).ok, false, 'ikki marta o\'chirib bo\'lmaydi');
  ok("Savdoni tahrirlash va o'chirish", "tahrir: 2→3 dona, qarz +10$ (120 000); o'chirish: qarz −30$ (360 000, 0 dan pastga tushmaydi), 3 dona omborga qaytdi; qayta o'chirish — rad");

  // 10) Qo'lda qarz (ruxsatli xodim) — jurnal bilan; manfiy rad
  psqlSync(`select stock_debt_op('f729','cset1','cust_set','{"customerId":5002,"debt":50000,"reason":"adjust"}'::jsonb)`);
  assert.equal(cust(5002), 50000);
  assert.equal(tryQ(`select stock_debt_op('f729','cset2','cust_set','{"customerId":5002,"debt":-5,"reason":"adjust"}'::jsonb)`).ok, false);
  ok("Qo'lda qarz (tahrir)", "50 000 — jurnalga 'adjust' bilan; manfiy qiymat rad");

  // 11) Kirim: to'lov kassa jurnalidagidan oshmaydi; ta'minotchi qarzi serverda
  psqlSync(`select cashbox_apply_ops('f729','kirim-pay','kirim_pay','[{"box":3,"currency":"USD","dir":"out","amount":30,"ref_type":"kirim","ref_id":"K-1"}]'::jsonb)`);
  const sd = supp(7001);
  const bad = tryQ(`select stock_debt_op('f729','kir1','batches_create', ${J({ reason: 'kirim', kirimRef: 'K-1', supplier: { id: 7001, goodsUsd: 100, givenUsd: 90 }, batches: [{ localId: 'kb1', pid: 104, qty: 10, costUsd: 10 }] })})`);
  assert.equal(bad.ok, false); assert.match(bad.err, /kassa yozuvlaridan/);
  psqlSync(`select stock_debt_op('f729','kir2','batches_create', ${J({ reason: 'kirim', kirimRef: 'K-1', supplier: { id: 7001, goodsUsd: 100, givenUsd: 30 }, batches: [{ localId: 'kb1', pid: 104, qty: 10, costUsd: 10 }] })})`);
  assert.equal(supp(7001), sd + 70); assert.equal(left(104), 10);
  ok('Kirim', "\"to'langan 90$\" (kassada 30$) → rad; to'g'ri so'rov: ombor +10, ta'minotchi qarzi +70$ (100−30)");

  // 12) Reviziya — tizim qoldig'i SERVERDA (brauzer sysQty yubormaydi)
  const rv = JSON.parse(psqlSync(`select stock_debt_op('f729','rev1','revision', ${J({ apply: true, facts: [{ pid: 104, fact: 7 }] })})`));
  assert.equal(rv.rows[0].sysQty, 10); assert.equal(rv.rows[0].diff, -3); assert.equal(left(104), 7);
  ok('Reviziya', "server tizim qoldig'i 10, fakt 7 → −3 FIFO bo'yicha yechildi");

  // 13) Izchillik: har bir qoldiq = jurnal yig'indisi
  assert.equal(psqlSync(`select bool_and(b.debt = (select coalesce(sum(delta),0) from customer_debt_ledger l where l.filial=b.filial and l.customer_local_id=b.customer_local_id)) from customer_balances b`), 't');
  assert.equal(psqlSync(`select bool_and(b.debt = (select coalesce(sum(delta),0) from supplier_debt_ledger l where l.filial=b.filial and l.supplier_local_id=b.supplier_local_id)) from supplier_balances b`), 't');
  assert.equal(psqlSync(`select bool_and(b.qty = (select coalesce(sum(d_qty),0) from stock_ledger l where l.batch_id=b.id) and b.sold = (select coalesce(sum(d_sold),0) from stock_ledger l where l.batch_id=b.id)) from batches b`), 't', 'barcha partiyalar (arxivlangan ham)');
  const ver = psqlSync(`\\i ${path.join(ROOT, 'supabase-migration-25-verify.sql')}`).split('\n').filter(Boolean).map(l => l.split('|'));
  assert.deepEqual(ver.filter(x => x[1] !== 't'), [], 'verify SQL: hammasi true');
  assert.equal(psqlSync(`select bool_and(not has_table_privilege(r, t, 'select') and not has_table_privilege(r, t, 'update')) from unnest(array['anon','authenticated']) r,
    unnest(array['public.customer_balances','public.supplier_balances','public.batches','public.sales','public.stock_ledger','public.customer_debt_ledger','public.ledger_ops']) t`), 't');
  assert.equal(psqlSync(`select bool_and(not has_function_privilege(r, f, 'execute')) from unnest(array['anon','authenticated']) r,
    unnest(array['public.stock_debt_op(text,text,text,jsonb,bigint,text)','public.sale_checkout_atomic_v3(text,text,jsonb,jsonb,bigint,text)','public.sale_return_atomic(text,text,text,bigint,numeric,text,jsonb,bigint,text)']) f`), 't');
  ok("Izchillik va ruxsatlar", `mijoz/ta'minotchi qarzi = jurnal yig'indisi, partiya qty/sold = stock_ledger yig'indisi; jadval va funksiyalar brauzer rollariga yopiq; verify SQL ${ver.length}/${ver.length} true`);

  console.log(`PostgreSQL: ${psqlSync('show server_version')} (lokal sinov bazasi "${DB}", ${psqlSync('show server_encoding')})`);
  out.forEach(([m, a, b]) => console.log(`${m} ${a}: ${b}`));
  psqlSync(`drop database if exists ${DB}`, 'postgres');
}
main().catch((e) => { console.error('❌', e.stack, e.stderr ? String(e.stderr).slice(0, 600) : ''); process.exit(1); });
