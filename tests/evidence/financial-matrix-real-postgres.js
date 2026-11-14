// DALIL SKRIPTI (npm test'ga kirmaydi): MOLIYAVIY MATRITSA — PARALLEL (CONCURRENT) holatlar, HAQIQIY PostgreSQL 16.
// Boshqa dalil skriptlarida yo'q operatsiyalar: savdo (oxirgi dona), mijoz/ta'minotchi to'lovi, xarajat va
// ta'sischi chiqimi, kunlik uyga berish, Kirim (Firma kassa), hamkor ulushi, bir xil kalit.
// Natija HAQQONIY: F4b sababli kutilgan kamchilik (mijoz/ta'minotchi qarzi SQL'da tekshirilmaydi) ham ko'rsatiladi.
// PGlite bitta ulanishli — shuning uchun haqiqiy parallellik shu yerda tekshiriladi.
//
// Talab: lokal PostgreSQL (psql) va BO'SH sinov bazasi (production EMAS!):
//   PGHOST=/tmp/fwpg PGPORT=5499 PGUSER=postgres node tests/evidence/financial-matrix-real-postgres.js
// Skript `fw_cash_test` nomli bazani yaratadi/qayta yaratadi.
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..', '..');
const DB = 'fw_fin_test';
const env = { ...process.env };
if (/supabase\.co|pooler/i.test(String(env.PGHOST || '') + String(env.DATABASE_URL || ''))) {
  console.error('⛔ Bu skript faqat lokal sinov bazasi uchun.'); process.exit(2);
}
const psqlSync = (sql, db = DB) => execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-tA', '-d', db, '-c', sql], { env, encoding: 'utf8' }).trim();
const psqlFile = (file, db = DB) => execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', db, '-f', file], { env, encoding: 'utf8' });
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
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema extensions; create schema auth; create schema storage;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text, name text);
alter table storage.objects enable row level security;`;

async function main() {
  psqlSync(`drop database if exists ${DB}`, 'postgres');
  psqlSync(`create database ${DB} encoding 'UTF8' lc_collate 'C' lc_ctype 'C' template template0`, 'postgres');
  for (const r of ['anon', 'authenticated', 'service_role']) { try { psqlSync(`create role ${r} nologin`, 'postgres'); } catch (_) {} }
  const tmp = path.join(require('os').tmpdir(), 'fw-prelude-fin.sql');
  fs.writeFileSync(tmp, PRELUDE.replace(/create role [a-z_]+ nologin;/g, ''));
  psqlFile(tmp);
  psqlFile(path.join(ROOT, 'supabase', 'schema.sql'));
  psqlSync(`update app_data set data = data || '{"settings":{"usdUzs":12000}}'::jsonb where id='main';
    insert into app_data_branches (branch_key, data) values ('f729', '{"cashboxes":[{"id":1,"name":"Naqd","cur":"UZS","bal":1000000},{"id":3,"name":"Dollar","cur":"USD","bal":300}]}');`);
  psqlFile(path.join(ROOT, 'supabase-migration-24-v11-cash-authority.sql'));
  psqlFile(path.join(ROOT, 'supabase-migration-25-v23-hardening.sql'));
  psqlFile(path.join(ROOT, 'supabase-migration-27-f4b-ledger-authority.sql'));   // v23.2: JSON → baza (opening); 24/25 qayta ishga tushirilgandan keyin tiklaydi
  psqlSync(`select public._fk_cash_move('USD','in',500,'deposit', p_idem_key => 'seed')`);
  const bal = (b) => +psqlSync(`select balance from cashbox_balances where filial='f729' and box_local_id=${b}`);
  const fk = () => +psqlSync(`select balance from firma_kassa_balance where currency='USD'`);
  const n = (sql) => +psqlSync(sql);
  const out = [];
  const hold = (sql, ms = 1200) => `begin; ${sql}; select pg_sleep(${ms / 1000}); commit;`;

  // 1) SAVDO: partiyada 3 dona, ikki parallel savdo 2 tadan — biri o'tadi, ombor manfiy emas
  // 27-migratsiyadan keyin partiya va qarzlar faqat jurnal orqali (boshlang'ich qiymat — 'opening')
  psqlSync(`select public._batch_insert('f729','b1',101,3,5,'active','{"date":"2026-09-01"}'::jsonb,'opening_stock','seed-b1')`);
  psqlSync(`select public._cust_debt_move('f729',1759300000000123,1000000,'set','opening','seed-c')`);
  psqlSync(`select public._supp_debt_move('f729',1759300000000456,1000,0,'set','opening','seed-s')`);
  const sale = (inv) => `select public.sale_checkout_atomic_v2('f729','[{"pid":101,"qty":2,"sell_usd":10,"cost_usd":5}]'::jsonb,0,20,null,'[{"box_id":3,"amount_native":20}]'::jsonb,'${inv}')`;
  const S1 = await Promise.all([psqlAsync(hold(sale('INV-A'))), psqlAsync(sale('INV-B') + ';', 300)]);
  assert.equal(S1[0].code, 0, S1[0].err); assert.notEqual(S1[1].code, 0);
  assert.equal(n(`select sold from batches where local_id='b1'`), 2); assert.equal(bal(3), 320);
  out.push(['Savdo — oxirgi donalar (3 dona, 2×2)', `1-si o'tdi; 2-si qator qulfida KUTDI va rad etildi; sotilgan 2, kassa +20 bir marta`]);

  // 2) MIJOZ TO'LOVI: bir xil kalit parallel — bitta yozuv
  const cp = (key, amt) => `select public.cash_payment_atomic('f729','${key}','cust_debt_pay','[{"box":1,"currency":"UZS","dir":"in","amount":${amt}}]','customer_debt_payment','{"customer_local_id":1759300000000123,"amount_uzs":${amt},"box_local_id":1}')`;
  const C1 = await Promise.all([psqlAsync(hold(cp('cust-1', 400000))), psqlAsync(cp('cust-1', 400000) + ';', 300)]);
  assert.equal(C1[0].code, 0); assert.equal(C1[1].code, 0);
  assert.equal(n(`select count(*) from customer_debt_payments`), 1); assert.equal(bal(1), 1400000);
  out.push(["Mijoz to'lovi — bir xil kalit parallel", "ikkinchisi kutdi → replay; yozuv 1 ta, kassa +400 000 bir marta"]);
  // F4b (27-migratsiya): turli kalit, qolgan qarz 600 000, 2×400 000 — qarz qatori qulflanadi, ikkinchisi rad
  const C2 = await Promise.all([psqlAsync(hold(cp('cust-2', 400000))), psqlAsync(cp('cust-3', 400000) + ';', 300)]);
  assert.equal(C2.filter(x => x.code === 0).length, 1, 'F4b: faqat bittasi o\'tishi kerak');
  assert.equal(n(`select debt from customer_balances where customer_local_id=1759300000000123`), 200000);
  assert.equal(bal(1), 1800000, 'rad etilgan to\'lovning kassa harakati ham yo\'q');
  out.push(["Mijoz to'lovi — turli kalit, qarzdan ortiq jami (F4b)", "1-si o'tdi, 2-si qarz qatori qulfida kutib HAQIQIY qoldiq (200 000) bo'yicha rad; kassa +400 000 bir marta"]);

  // 3) TA'MINOTCHI TO'LOVI: kassa yetmasa parallel — ortiqcha chiqim yo'q (qarz tekshiruvi esa F4b)
  const sp = (key, amt) => `select public.cash_payment_atomic('f729','${key}','supp_pay','[{"box":3,"currency":"USD","dir":"out","amount":${amt}}]','supplier_payment','{"supplier_local_id":1759300000000456,"amount_usd":${amt},"box_local_id":3}')`;
  const P1 = await Promise.all([psqlAsync(hold(sp('sup-1', 200))), psqlAsync(sp('sup-2', 200) + ';', 300)]);
  assert.equal(P1[0].code, 0); assert.notEqual(P1[1].code, 0); assert.match(P1[1].err, /yetarli emas/);
  assert.equal(bal(3), 120); assert.equal(n(`select count(*) from supplier_payments`), 1);
  out.push(["Ta'minotchi to'lovi — kassa 320$, 2×200$", "1-si o'tdi, 2-si kutib rad etildi (mablag' yetarli emas); yozuv 1 ta, rad etilganining yozuvi ham yo'q"]);

  // 4) XARAJAT / TA'SISCHI CHIQIMI (expense) — kassa 120$, 2×100$
  const ex = (key) => `select public.cashbox_apply_ops('f729','${key}','expense','[{"box":3,"currency":"USD","dir":"out","amount":100}]')`;
  const E1 = await Promise.all([psqlAsync(hold(ex('exp-1'))), psqlAsync(ex('exp-2') + ';', 300)]);
  assert.equal(E1[0].code, 0); assert.notEqual(E1[1].code, 0); assert.equal(bal(3), 20);
  out.push(["Xarajat / ta'sischi chiqimi — kassa 120$, 2×100$", "1-si o'tdi, 2-si rad; qoldiq manfiy emas (20$)"]);

  // 5) KUNLIK UYGA BERISH — ko'p kassali, hammasi yoki hech biri; parallel
  const hw = (key) => `select public.cash_payment_atomic('f729','${key}','home_withdrawal','[{"box":1,"currency":"UZS","dir":"out","amount":1000000},{"box":3,"currency":"USD","dir":"out","amount":15}]','home_withdrawal','{"entries":[],"note":"uy"}')`;
  const b1 = bal(1);
  const H1 = await Promise.all([psqlAsync(hold(hw('hw-1'))), psqlAsync(hw('hw-2') + ';', 300)]);
  assert.equal(H1[0].code, 0); assert.notEqual(H1[1].code, 0);
  assert.equal(bal(1), b1 - 1000000, "2-si rad — so'm kassasidan ham yechilmadi"); assert.equal(bal(3), 5); assert.equal(n(`select count(*) from home_withdrawals`), 1);
  out.push(["Kunlik uyga berish — 2 kassa, parallel", "1-si o'tdi; 2-sida bitta kassa yetmadi → IKKALA kassa ham o'zgarmadi, yozuv 1 ta"]);

  // 6) KIRIM (Firma kassadan) — Firma 500$, 2×300$
  const kp = (key) => `select public._fk_cash_move('USD','out',300,'kirim_payment', p_ref_type => 'kirim', p_ref_id => '${key}', p_idem_key => 'fk:${key}')`;
  const K1 = await Promise.all([psqlAsync(hold(kp('K-1'))), psqlAsync(kp('K-2') + ';', 300)]);
  assert.equal(K1[0].code, 0); assert.notEqual(K1[1].code, 0); assert.equal(fk(), 200);
  const K2 = await Promise.all([psqlAsync(hold(kp('K-3').replace('300', '50'))), psqlAsync(kp('K-3').replace('300', '50') + ';', 300)]);
  assert.equal(n(`select count(*) from firma_kassa_ledger where idem_key='fk:K-3'`), 1); assert.equal(fk(), 150);
  out.push(["Kirim (Firma kassa) — 500$, 2×300$; bir xil kalit", "1-si o'tdi, 2-si rad (yetarli emas); bir xil kalit 2 marta — 1 yozuv"]);

  // 7) HAMKOR ULUSHI (partner_withdrawal) — Firma 150$, 2×100$
  const pw = (key) => `select public._fk_cash_move('USD','out',100,'partner_withdrawal', p_counterparty_type => 'other', p_counterparty_id => '1', p_idem_key => 'fk:${key}')`;
  const W1 = await Promise.all([psqlAsync(hold(pw('pw-1'))), psqlAsync(pw('pw-2') + ';', 300)]);
  assert.equal(W1[0].code, 0); assert.notEqual(W1[1].code, 0); assert.equal(fk(), 50);
  out.push(["Hamkor ulushi (Firma kassa) — 150$, 2×100$", "1-si o'tdi, 2-si rad; Firma kassa manfiy emas. (Hamkor hisobidagi 'invested' kamayishi — brauzerda, F4b)"]);

  // Yakuniy: qoldiq = jurnal
  assert.equal(psqlSync(`select bool_and(b.balance = (select coalesce(sum(case when direction='in' then amount else -amount end),0) from cashbox_ledger l where l.filial=b.filial and l.box_local_id=b.box_local_id)) from cashbox_balances b`), 't');
  assert.equal(psqlSync(`select bool_and(f.balance = (select coalesce(sum(case when direction='in' then amount else -amount end),0) from firma_kassa_ledger l where l.currency=f.currency)) from firma_kassa_balance f`), 't');
  out.push(['Yakuniy izchillik', "har bir kassa va Firma kassa qoldig'i = jurnal yig'indisi"]);
  console.log(`PostgreSQL: ${psqlSync('show server_version')} (lokal sinov bazasi "${DB}", ${psqlSync('show server_encoding')})`);
  out.forEach(([a, b]) => console.log(`${/⚠️/.test(b) ? '⚠️' : '✅'} ${a}: ${b}`));
  psqlSync(`drop database if exists ${DB}`, 'postgres');
}
main().catch((e) => { console.error('❌', e.message); process.exit(1); });
