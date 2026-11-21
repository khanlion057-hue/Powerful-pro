// DALIL SKRIPTI (npm test'ga kirmaydi): 29-migratsiya — HISOBDAN CHIQARISH va B2B, HAQIQIY PostgreSQL 16 da.
// FIFO bo'yicha chiqim va zarar, PARALLEL ikki hisobdan chiqarish (qoldiqdan oshmaydi), bekor qilish, B2B jo'natma →
// tasdiq (qarz faqat qabul qilingan son bo'yicha) → kelmaganini qaytarish, PARALLEL ikki marta qabul, huquqlar.
//   PGHOST=/tmp/fwpg PGPORT=5499 PGUSER=postgres node tests/evidence/writeoff-b2b-real-postgres.js
// Skript `fw_wo29_test` nomli LOKAL bazani yaratadi/qayta yaratadi (production EMAS).
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..', '..');
const DB = 'fw_wo29_test';
const env = { ...process.env };
if (/supabase\.co|pooler/i.test(String(env.PGHOST || '') + String(env.DATABASE_URL || ''))) {
  console.error('⛔ Bu skript faqat lokal sinov bazasi uchun.'); process.exit(2);
}
const psqlSync = (sql, db = DB) => execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-tA', '-d', db, '-c', sql], { env, encoding: 'utf8' }).trim();
const psqlFile = (file, db = DB) => execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', db, '-f', file], { env, encoding: 'utf8', stdio: 'pipe' });
const tryQ = (sql) => { try { return { ok: true, out: psqlSync(sql) }; } catch (e) { return { ok: false, err: String(e.stderr || e.message).split('\n').find(l => /ERROR/.test(l)) || 'xato' }; } };
function psqlAsync(sql) {
  return new Promise((resolve) => {
    const p = spawn('psql', ['-X', '-q', '-tA', '-v', 'ON_ERROR_STOP=1', '-d', DB], { env });
    let out = '', err = '';
    p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { err += d; });
    p.on('close', (code) => resolve({ code, out: out.trim(), err: err.trim() }));
    p.stdin.end(sql);
  });
}
const PRELUDE = `
create schema extensions; create schema auth; create schema storage;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text, name text);
alter table storage.objects enable row level security;`;
const MIG = (n) => path.join(ROOT, n);

async function main() {
  psqlSync(`drop database if exists ${DB}`, 'postgres');
  psqlSync(`create database ${DB} encoding 'UTF8' lc_collate 'C' lc_ctype 'C' template template0`, 'postgres');
  for (const r of ['anon', 'authenticated', 'service_role']) { try { psqlSync(`create role ${r} nologin`, 'postgres'); } catch (_) {} }
  const tmp = path.join(require('os').tmpdir(), 'fw-prelude-wo29.sql');
  fs.writeFileSync(tmp, PRELUDE); psqlFile(tmp);
  // 27 dan OLDINGI holat → ilova ma'lumoti (JSON) → 24, 27, 28, 29 (production tartibi)
  const full = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
  const cut = full.indexOf('\n-- ────────────────────────────────────────────────────────────────────\n-- 11. 27-migratsiya');
  assert.ok(cut > 0);
  const pre = path.join(require('os').tmpdir(), 'fw-schema-pre27-wo.sql'); fs.writeFileSync(pre, full.slice(0, cut)); psqlFile(pre);
  const batches = [{ id: 9001, pid: 101, qty: 4, sold: 0, costUsd: 40, date: '2026-09-01', status: 'active', origin: 'Kirim' },
                   { id: 9002, pid: 101, qty: 6, sold: 0, costUsd: 50, date: '2026-09-10', status: 'active', origin: 'Kirim' }];
  psqlSync(`update app_data set data = data || '${JSON.stringify({ settings: { usdUzs: 12000 }, products: [{ id: 101, sku: 'PG-1', name: 'Drel' }], branchStore: { baza: {} } })}'::jsonb where id='main'`);
  psqlSync(`insert into app_data_branches (branch_key, data) values ('baza', '${JSON.stringify({ batches, customers: [{ id: 501, name: 'B2B mijoz', debt: 0 }], suppliers: [{ id: 701, name: 'B2B taminotchi', debt: 0 }], cashboxes: [] })}'::jsonb)`);
  for (const m of ['supabase-migration-24-v11-cash-authority.sql', 'supabase-migration-27-f4b-ledger-authority.sql', 'supabase-migration-28-firma-kassa-asosiy.sql']) psqlFile(MIG(m));
  const M29 = MIG('supabase-migration-29-hisobdan-chiqarish-b2b.sql');
  psqlFile(M29); psqlFile(M29);   // takroriy qo'llash — xavfsiz

  const out = [];
  const ok = (name, detail) => out.push(['✅', name, detail]);
  const n = (sql) => +psqlSync(sql);
  const stock = () => n(`select coalesce(sum(qty - sold),0) from batches where filial='baza' and pid=101`);
  const doc = (id, qty, key) => `select stock_writeoff_atomic('baza', '${key}', '{"localId":"${id}","docNo":"${id}","reason":"damaged","items":[{"pid":101,"qty":${qty}}]}'::jsonb, 1, 'Omborchi')`;
  assert.equal(stock(), 10);

  // 1) FIFO bo'yicha zarar: 5 dona = 4×40 + 1×50 = 210$
  let r = JSON.parse(psqlSync(doc('wo-1', 5, 'k-wo-1')));
  assert.equal(+r.totalCostUsd, 210); assert.equal(stock(), 5);
  assert.equal(n(`select count(*) from stock_ledger where op_kind='writeoff'`), 2, 'ikki partiyadan');
  ok('Hisobdan chiqarish (FIFO)', '5 dona: 4×40$ + 1×50$ = 210$ zarar — serverda; qoldiq 10 → 5');

  // 2) Takror (o'sha kalit) — ikkinchi marta chiqarmaydi
  r = JSON.parse(psqlSync(doc('wo-1', 5, 'k-wo-1')));
  assert.equal(r.replay, true); assert.equal(stock(), 5);
  ok('Takroriy so\'rov', 'replay=true, qoldiq o\'zgarmadi');

  // 3) PARALLEL: qoldiq 5, ikkita 4 donali hujjat bir vaqtda — bittasi rad, manfiy qoldiq yo'q
  const [a, b] = await Promise.all([psqlAsync(doc('wo-p1', 4, 'k-p1')), psqlAsync(doc('wo-p2', 4, 'k-p2'))]);
  assert.equal([a, b].filter(x => x.code === 0).length, 1); assert.equal(stock(), 1);
  assert.equal(n(`select count(*) from batches where qty - sold < 0`), 0);
  ok('PARALLEL 2×4 dona (qoldiq 5)', "bittasi o'tdi, bittasi rad; qoldiq 1 — manfiy emas");

  // 4) Bekor qilish — aynan o'sha partiyalarga; ikkinchi marta — rad
  psqlSync(`select stock_writeoff_cancel('baza', 'k-c1', 'wo-1', 'xato', 1, 'Admin')`);
  assert.equal(stock(), 6);
  assert.equal(psqlSync(`select string_agg((qty-sold)::text, ',' order by local_id) from batches where pid=101`), '4,2');
  assert.equal(tryQ(`select stock_writeoff_cancel('baza', 'k-c2', 'wo-1')`).ok, false);
  ok('Bekor qilish', "tovar o'sha partiyalarga qaytdi (4 / 2), ikkinchi marta bekor qilib bo'lmaydi");

  // 5) B2B ta'minotchi tomoni: jo'natma 5 dona × 60$ → tasdiq 3 dona → mijoz qarzi 3×60×12000; kelmagan 2 dona qaytadi
  psqlSync(`insert into b2b_links (link_uid, filial, peer_url, peer_name, peer_link_uid, status, local_approved, peer_approved, we_supply, they_supply, customer_local_id, supplier_local_id)
    values ('linkAAAAAAAAAAAAAAAAAAAAAAAA01', 'baza', 'https://peer.example.com', 'Hamkor', 'linkBBBBBBBBBBBBBBBBBBBBBBBB01', 'active', true, true, true, true, 501, 701)`);
  const L = n(`select id from b2b_links where link_uid='linkAAAAAAAAAAAAAAAAAAAAAAAA01'`);
  const ship = `select b2b_ship_atomic('baza', 'k-s1', ${L}, '{"shipUid":"shp-0000001","items":[{"pid":101,"qty":5,"priceUsd":60}]}'::jsonb, 1, 'Omborchi')`;
  const [s1, s2] = await Promise.all([psqlAsync(ship), psqlAsync(ship)]);
  assert.equal([s1, s2].filter(x => x.code === 0).length >= 1, true);
  assert.equal(stock(), 1, 'ikki parallel so\'rov — bir marta chiqim'); assert.equal(n(`select count(*) from b2b_shipments where ship_uid='shp-0000001'`), 1);
  ok("B2B jo'natma (PARALLEL takror)", "5 dona chiqdi bir marta; qoldiq 6 → 1");
  const cust = () => n(`select coalesce((select debt from customer_balances where filial='baza' and customer_local_id=501),0)`);
  psqlSync(`select b2b_ack_apply('baza', 'in:a-1', ${L}, 'shp-0000001', '[{"idx":0,"receivedQty":3}]'::jsonb, 12000)`);
  assert.equal(cust(), 2160000);
  psqlSync(`select b2b_ack_apply('baza', 'in:a-1', ${L}, 'shp-0000001', '[{"idx":0,"receivedQty":3}]'::jsonb, 12000)`);
  assert.equal(cust(), 2160000, 'takroriy tasdiq');
  assert.equal(tryQ(`select b2b_ack_apply('baza', 'in:a-2', ${L}, 'shp-0000001', '[{"idx":0,"receivedQty":5}]'::jsonb, 12000)`).ok, false, 'ikkinchi tasdiq rad');
  ok('B2B tasdiq', "mijoz qarzi faqat qabul qilingan 3 dona bo'yicha: 3×60$×12 000 = 2 160 000 so'm; takror — bir marta");
  psqlSync(`select b2b_restock_atomic('baza', 'k-r1', ${L}, 'shp-0000001', 1, 'Omborchi')`);
  assert.equal(stock(), 3); assert.equal(tryQ(`select b2b_restock_atomic('baza', 'k-r2', ${L}, 'shp-0000001')`).ok, false);
  ok('Kelmagan qismni qaytarish', 'qoldiq 1 → 3, ikkinchi marta rad');

  // 6) B2B xaridor tomoni: PARALLEL ikki marta qabul (turli kalit) — faqat bittasi
  psqlSync(`insert into b2b_shipments (link_id, filial, ship_uid, direction, status, items, total_usd)
    values (${L}, 'baza', 'shp-in-000001', 'in', 'awaiting', '[{"peerPid":77,"sku":"P-77","name":"Hamkor tovari","qty":10,"priceUsd":7}]'::jsonb, 70)`);
  const rcv = (k, bl) => `select b2b_receive_atomic('baza', '${k}', ${L}, 'shp-in-000001', '[{"idx":0,"receivedQty":8,"localPid":101,"batchLocalId":"${bl}"}]'::jsonb, '{}'::jsonb, 1, 'Omborchi')`;
  const [c1, c2] = await Promise.all([psqlAsync(rcv('k-rc1', 'b2b-bl-1')), psqlAsync(rcv('k-rc2', 'b2b-bl-2'))]);
  assert.equal([c1, c2].filter(x => x.code === 0).length, 1);
  assert.equal(stock(), 11, '8 dona kirim bir marta');
  assert.equal(n(`select debt from supplier_balances where filial='baza' and supplier_local_id=701`), 56);
  assert.equal(tryQ(`select b2b_receive_atomic('baza', 'k-rc3', ${L}, 'shp-in-000001', '[{"idx":0,"receivedQty":11,"localPid":101,"batchLocalId":"x9"}]'::jsonb)`).ok, false);
  ok('B2B qabul (PARALLEL)', "8 / 10 dona — kirim bir marta, ta'minotchi qarzi 56$; jo'natilgandan ko'p — rad");

  // 7) Faol bo'lmagan ulanish — jo'natish rad
  psqlSync(`update b2b_links set status='paused' where id=${L}`);
  assert.equal(tryQ(`select b2b_ship_atomic('baza', 'k-s9', ${L}, '{"shipUid":"shp-0000009","items":[{"pid":101,"qty":1,"priceUsd":60}]}'::jsonb)`).ok, false);
  ok("To'xtatilgan ulanish", "jo'natish rad, qoldiq o'zgarmadi");

  // 8) Huquqlar va jurnal = qoldiq
  for (const f of ['stock_writeoff_atomic(text, text, jsonb, bigint, text)', 'b2b_receive_atomic(text, text, bigint, text, jsonb, jsonb, bigint, text)', 'b2b_ack_apply(text, text, bigint, text, jsonb, numeric)']) {
    assert.equal(psqlSync(`select has_function_privilege('authenticated', 'public.${f}', 'execute')`), 'f');
    assert.equal(psqlSync(`select has_function_privilege('anon', 'public.${f}', 'execute')`), 'f');
  }
  assert.equal(psqlSync(`select has_table_privilege('authenticated', 'public.b2b_links', 'select') or has_table_privilege('anon', 'public.b2b_links', 'select')`), 'f');
  assert.equal(psqlSync(`select bool_and(s.debt = (select coalesce(sum(delta),0) from supplier_debt_ledger l where l.filial=s.filial and l.supplier_local_id=s.supplier_local_id)) from supplier_balances s`), 't');
  assert.equal(psqlSync(`select bool_and(c.debt = (select coalesce(sum(delta),0) from customer_debt_ledger l where l.filial=c.filial and l.customer_local_id=c.customer_local_id)) from customer_balances c`), 't');
  ok('Huquqlar va jurnal', "funksiyalar va B2B kalitlari brauzerga yopiq; qarzlar jurnal yig'indisiga teng");

  out.forEach(([m, a2, d]) => console.log(`${m} ${a2}: ${d}`));
  console.log(`JAMI: ${out.length}/${out.length}`);
}
main().catch((e) => { console.error('❌', e.stack || e.message); process.exit(1); });
