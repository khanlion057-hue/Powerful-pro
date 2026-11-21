// DALIL SKRIPTI (npm test'ga kirmaydi): v23 (25-migratsiya) — HAQIQIY ko'p-ulanishli PostgreSQL'da
// parallel tranzaksiyalar: filial qarzi, to'lov+kassa atomikligi, bekor qilish, deadlock, rollback.
// PGlite bitta ulanishli — shuning uchun haqiqiy parallellik shu yerda tekshiriladi.
//
// Talab: lokal PostgreSQL (psql) va BO'SH sinov bazasi (production EMAS!):
//   PGHOST=/tmp/fwpg PGPORT=5499 PGUSER=postgres node tests/evidence/v23-real-postgres.js
// Skript `fw_cash_test` nomli bazani yaratadi/qayta yaratadi.
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..', '..');
const DB = 'fw_v23_test';
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
  psqlSync(`create database ${DB} encoding 'UTF8' lc_collate 'C' lc_ctype 'C' template template0`, 'postgres');  // Supabase kabi UTF8
  for (const r of ['anon', 'authenticated', 'service_role']) { try { psqlSync(`create role ${r} nologin`, 'postgres'); } catch (_) {} }
  const tmp = path.join(require('os').tmpdir(), 'fw-prelude-v23.sql');
  fs.writeFileSync(tmp, PRELUDE.replace(/create role [a-z_]+ nologin;/g, ''));
  psqlFile(tmp);
  psqlFile(path.join(ROOT, 'supabase', 'schema.sql'));
  psqlSync(`update app_data set data = data || '{"settings":{"usdUzs":12000},"branchDebt":{"f729":100}}'::jsonb where id='main';
    insert into app_data_branches (branch_key, data) values ('f729', '{"cashboxes":[{"id":1,"name":"Naqd","cur":"UZS","bal":1200000},{"id":3,"name":"Dollar","cur":"USD","bal":300}]}');`);
  psqlFile(path.join(ROOT, 'supabase-migration-24-v11-cash-authority.sql'));
  psqlFile(path.join(ROOT, 'supabase-migration-25-v23-hardening.sql'));   // takroriy — xavfsiz
  psqlFile(path.join(ROOT, 'supabase-migration-27-f4b-ledger-authority.sql'));   // v23.2: JSON → baza (opening); 24/25 qayta ishga tushirilgandan keyin tiklaydi
  psqlSync(`select public._fk_cash_move('USD','in',1000,'opening', p_idem_key => 'open')`);
  psqlSync(`insert into dealers (id, login, name, filial, debt_usd, total_paid_usd) overriding system value values (9,'dd','D','f729',40,0)`);
  const bal = (b) => +psqlSync(`select balance from cashbox_balances where filial='f729' and box_local_id=${b}`);
  const fk = () => +psqlSync(`select balance from firma_kassa_balance where currency='USD'`);
  const results = [];

  // A) Filial qarzi: 200$ olindi; ikki parallel qaytarish 150$ dan — bittasi o'tadi
  psqlSync(`select public.branch_firma_loan('f729',3,'USD','give',200,'L-give')`);
  const A = await Promise.all([
    psqlAsync(`begin; select public.branch_firma_loan('f729',3,'USD','repay',150,'L-r1'); select pg_sleep(1.5); commit;`),
    psqlAsync(`select public.branch_firma_loan('f729',3,'USD','repay',150,'L-r2');`, 300),
  ]);
  assert.equal(A[0].code, 0, A[0].err); assert.notEqual(A[1].code, 0); assert.match(A[1].err, /qarz|oshib/i);
  assert.equal(+psqlSync(`select public.firma_kassa_advance_outstanding('USD','branch','f729')`), 50);
  assert.equal(bal(3), 350); assert.equal(fk(), 950);
  results.push(['Filial qarzi: 2 parallel qaytarish (qarz 200$, 2×150$)', `1-si o'tdi, 2-si KUTDI va rad etildi; qolgan qarz 50, filial 350, Firma 950`]);

  // B) Diller to'lovi: qarz 40$, 2 parallel 30$ — bittasi; kassa ham bir marta
  const B = await Promise.all([
    psqlAsync(`begin; select public.cash_payment_atomic('f729','d1','dealer_pay','[{"box":3,"currency":"USD","dir":"in","amount":30}]','dealer_payment','{"dealer_id":9,"amount_usd":30}'); select pg_sleep(1.5); commit;`),
    psqlAsync(`select public.cash_payment_atomic('f729','d2','dealer_pay','[{"box":3,"currency":"USD","dir":"in","amount":30}]','dealer_payment','{"dealer_id":9,"amount_usd":30}');`, 300),
  ]);
  assert.equal(B[0].code, 0, B[0].err); assert.notEqual(B[1].code, 0); assert.match(B[1].err, /oshib/);
  assert.equal(+psqlSync(`select debt_usd from dealers where id=9`), 10); assert.equal(+psqlSync(`select count(*) from dealer_payments`), 1);
  assert.equal(bal(3), 380);
  results.push(["Diller to'lovi: 2 parallel (qarz 40$, 2×30$)", "1-si o'tdi; 2-si diller qatori qulfida KUTDI → rad; qarz 10, kassaga faqat +30 (rad etilganning kassa harakati ham bekor)"]);

  // C) Bir xil yozuvni ikki xil kalit bilan parallel bekor qilish — faqat bittasi
  const wid = psqlSync(`select (public._fk_cash_move('USD','out',25,'withdraw', p_idem_key => 'w-par')).id`);
  const C = await Promise.all([
    psqlAsync(`begin; select public.firma_kassa_reverse(${wid},'rv-a'); select pg_sleep(1.5); commit;`),
    psqlAsync(`select public.firma_kassa_reverse(${wid},'rv-b');`, 300),
  ]);
  assert.equal(C[0].code, 0, C[0].err); assert.notEqual(C[1].code, 0);
  assert.equal(+psqlSync(`select count(*) from firma_kassa_ledger where reversal_of=${wid}`), 1); assert.equal(fk(), 950);
  results.push(['Bekor qilish: bir yozuv, 2 parallel', `1-si o'tdi, 2-si rad ("${C[1].err.split('\n')[0].replace(/^.*FIRMA_KASSA: /, '')}"); teskari yozuv 1 ta, qoldiq tiklandi`]);

  // D) Deadlock yo'q: bir vaqtda filial qarz oladi (Firma→filial) va tovar qarzini to'laydi (filial→Firma)
  const D = await Promise.all([
    psqlAsync(`begin; select public.branch_firma_loan('f729',3,'USD','give',20,'L-d'); select pg_sleep(1); commit;`),
    psqlAsync(`begin; select public.branch_firma_transfer('f729',3,'USD','to_firma',30,'P-d',true); commit;`, 200),
  ]);
  assert.equal(D[0].code, 0, D[0].err); assert.equal(D[1].code, 0, D[1].err);
  assert.equal(bal(3), 370); assert.equal(fk(), 960);
  results.push(["Deadlock yo'q (qarz olish va tovar qarzi to'lovi bir vaqtda)", 'ikkalasi ham bajarildi (tartib: filial kassasi → Firma kassa)']);

  // E) Rollback: to'lov + kassa, tranzaksiya oxirida xato — hech narsa qolmaydi
  psqlSync(`select public._cust_debt_move('f729',1759300000000123,1000000,'set','opening','seed-c')`);   // 27: qarz faqat jurnal orqali
  const E = await psqlAsync(`begin; select public.cash_payment_atomic('f729','c-rb','cust_debt_pay','[{"box":1,"currency":"UZS","dir":"in","amount":5000}]','customer_debt_payment','{"customer_local_id":1759300000000123,"amount_uzs":5000,"box_local_id":1}'); select 1/0; commit;`);
  assert.notEqual(E.code, 0);
  assert.equal(+psqlSync(`select count(*) from customer_debt_payments`), 0); assert.equal(bal(1), 1200000);
  psqlSync(`select public.cash_payment_atomic('f729','c-ok','cust_debt_pay','[{"box":1,"currency":"UZS","dir":"in","amount":5000}]','customer_debt_payment','{"customer_local_id":1759300000000123,"amount_uzs":5000,"box_local_id":1}')`);
  assert.equal(psqlSync(`select customer_local_id from customer_debt_payments`), '1759300000000123');
  results.push(["To'lov rollback + katta mijoz ID", "xatoda yozuv ham, kassa ham yo'q; muvaffaqiyatda bigint ID (1759300000000123) saqlandi"]);

  // F) O'zgarmas jurnal (haqiqiy PG) va yakuniy izchillik
  const U = await psqlAsync(`update firma_kassa_ledger set amount = 1 where id=${wid};`);
  const Dl = await psqlAsync(`delete from cashbox_ledger;`);
  assert.notEqual(U.code, 0); assert.notEqual(Dl.code, 0);
  const chk = psqlSync(`select bool_and(b.balance = (select coalesce(sum(case when direction='in' then amount else -amount end),0) from cashbox_ledger l where l.filial=b.filial and l.box_local_id=b.box_local_id)) from cashbox_balances b`);
  const chk2 = psqlSync(`select bool_and(f.balance = (select coalesce(sum(case when direction='in' then amount else -amount end),0) from firma_kassa_ledger l where l.currency=f.currency)) from firma_kassa_balance f`);
  assert.equal(chk, 't'); assert.equal(chk2, 't');
  results.push(["Jurnallar o'zgarmas + yakuniy izchillik", "UPDATE/DELETE rad etildi; har bir qoldiq = jurnal yig'indisi (filial va Firma kassa)"]);

  console.log(`PostgreSQL: ${psqlSync('show server_version')} (lokal sinov bazasi "${DB}")`);
  results.forEach(([a, b]) => console.log(`✅ ${a}: ${b}`));
  psqlSync(`drop database if exists ${DB}`, 'postgres');
}
main().catch((e) => { console.error('❌', e.message); process.exit(1); });
