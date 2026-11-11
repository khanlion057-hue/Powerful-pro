// DALIL SKRIPTI (npm test'ga kirmaydi): F4/B7 — HAQIQIY ko'p-ulanishli PostgreSQL'da
// parallel tranzaksiyalar (qator qulfi, advisory lock, deadlock yo'qligi, rollback).
// PGlite bitta ulanishli — shuning uchun haqiqiy parallellik shu yerda tekshiriladi.
//
// Talab: lokal PostgreSQL (psql) va BO'SH sinov bazasi (production EMAS!):
//   PGHOST=/tmp/fwpg PGPORT=5499 PGUSER=postgres node tests/evidence/f4-b7-real-postgres.js
// Skript `fw_cash_test` nomli bazani yaratadi/qayta yaratadi.
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..', '..');
const DB = 'fw_cash_test';
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
  // rollar klaster darajasida — bor bo'lsa xato bermasligi uchun alohida
  for (const r of ['anon', 'authenticated', 'service_role']) { try { psqlSync(`create role ${r} nologin`, 'postgres'); } catch (_) {} }
  const tmp = path.join(require('os').tmpdir(), 'fw-prelude.sql');
  fs.writeFileSync(tmp, PRELUDE.replace(/create role [a-z_]+ nologin;/g, ''));
  psqlFile(tmp);
  psqlFile(path.join(ROOT, 'supabase', 'schema.sql'));
  psqlSync(`update app_data set data = data || '{"settings":{"usdUzs":12000},"branchDebt":{"f729":380}}'::jsonb where id='main';
    insert into app_data_branches (branch_key, data) values ('f729', '{"cashboxes":[{"id":1,"name":"Naqd","cur":"UZS","bal":1200000},{"id":3,"name":"Dollar","cur":"USD","bal":300}]}');`);
  psqlFile(path.join(ROOT, 'supabase-migration-24-v11-cash-authority.sql'));
  psqlFile(path.join(ROOT, 'supabase-migration-27-f4b-ledger-authority.sql'));   // v23.2: JSON → baza (opening); 24/25 qayta ishga tushirilgandan keyin tiklaydi
  const bal = (b) => +psqlSync(`select balance from cashbox_balances where filial='f729' and box_local_id=${b}`);
  const results = [];

  // A) F4: ikki parallel chiqim (300$ dan 200$ + 200$) — 1-tranzaksiya qatorni qulflab 1.5 s ushlab turadi
  const A = await Promise.all([
    psqlAsync(`begin; select public.cashbox_apply_ops('f729','par-A','manual_out','[{"box":3,"currency":"USD","dir":"out","amount":200}]'); select pg_sleep(1.5); commit;`),
    psqlAsync(`begin; select public.cashbox_apply_ops('f729','par-B','manual_out','[{"box":3,"currency":"USD","dir":"out","amount":200}]'); commit;`, 300),
  ]);
  assert.equal(A[0].code, 0); assert.notEqual(A[1].code, 0); assert.match(A[1].err, /yetarli emas/);
  assert.equal(bal(3), 100);
  results.push(['F4-5 parallel chiqim (qator qulfi)', `1-si o'tdi, 2-si KUTDI va rad etildi ("${A[1].err.split('\n')[0].replace(/^.*CASHBOX: /, '')}"), qoldiq 100`]);

  // B) F4: bir xil kalit bilan parallel ikki so'rov — bitta yozuv
  const B = await Promise.all([
    psqlAsync(`begin; select public.cashbox_apply_ops('f729','dup-1','manual_in','[{"box":3,"currency":"USD","dir":"in","amount":50}]'); select pg_sleep(1); commit;`),
    psqlAsync(`select public.cashbox_apply_ops('f729','dup-1','manual_in','[{"box":3,"currency":"USD","dir":"in","amount":50}]')->>'replay';`, 300),
  ]);
  assert.equal(B[0].code, 0); assert.equal(B[1].code, 0); assert.equal(B[1].out, 'true');
  assert.equal(+psqlSync(`select count(*) from cashbox_ledger where group_key='dup-1'`), 1); assert.equal(bal(3), 150);
  results.push(['F4-6 bir xil kalit parallel', "2-si advisory lock'da kutdi → replay=true; jurnalda 1 yozuv; qoldiq 150"]);

  // C) Deadlock yo'q: qarama-qarshi yo'nalishdagi ikki ko'chirish (1→3 va 3→1) bir vaqtda
  const C = await Promise.all([
    psqlAsync(`begin; select public.cashbox_apply_ops('f729','dl-1','move','[{"box":1,"currency":"UZS","dir":"out","amount":120000},{"box":3,"currency":"USD","dir":"in","amount":10}]'); select pg_sleep(1); commit;`),
    psqlAsync(`begin; select public.cashbox_apply_ops('f729','dl-2','move','[{"box":3,"currency":"USD","dir":"out","amount":10},{"box":1,"currency":"UZS","dir":"in","amount":120000}]'); commit;`, 200),
  ]);
  assert.equal(C[0].code, 0, C[0].err); assert.equal(C[1].code, 0, C[1].err);
  assert.equal(bal(1), 1200000); assert.equal(bal(3), 150);
  results.push(["Deadlock yo'q (qarama-qarshi ko'chirishlar)", 'ikkalasi ham bajarildi (kassalar tartib bilan qulflanadi)']);

  // D) B7: qarz 380$, ikki parallel to'lov 300$ dan — bittasi o'tadi, qarz manfiy emas
  psqlSync(`select public._cb_move('f729', 3, 'USD', 'in', 500, 'manual_in', 'topup')`);
  const D = await Promise.all([
    psqlAsync(`begin; select public.branch_firma_transfer('f729',3,'USD','to_firma',300,'p1',true); select pg_sleep(1.5); commit;`),
    psqlAsync(`select public.branch_firma_transfer('f729',3,'USD','to_firma',300,'p2',true);`, 300),
  ]);
  assert.equal(D[0].code, 0, D[0].err); assert.notEqual(D[1].code, 0); assert.match(D[1].err, /qarzdan/);
  const debt = +psqlSync(`select data->'branchDebt'->>'f729' from app_data where id='main'`);
  const fk = +psqlSync(`select balance from firma_kassa_balance where currency='USD'`);
  assert.equal(debt, 80); assert.equal(fk, 300); assert.equal(bal(3), 350);
  results.push(['B7 parallel to\'lov (qarz 380$, 2×300$)', "1-si o'tdi; 2-si qarz qatori qulfida KUTDI → qarzdan oshgani uchun rad; qarz 80, Firma +300, filial 350"]);

  // E) B7 rollback: tranzaksiya oxirida xato bo'lsa — ikkala tomon va qarz o'zgarmaydi
  const E = await psqlAsync(`begin; select public.branch_firma_transfer('f729',3,'USD','to_firma',50,'rb-1',true); select 1/0; commit;`);
  assert.notEqual(E.code, 0);
  assert.equal(+psqlSync(`select data->'branchDebt'->>'f729' from app_data where id='main'`), 80); assert.equal(bal(3), 350);
  assert.equal(+psqlSync(`select count(*) from firma_kassa_ledger where idem_key='bft:rb-1'`), 0);
  results.push(['B7 rollback (tranzaksiya oxirida xato)', "filial kassasi, Firma kassa va qarz — o'zgarmadi; jurnallarda iz yo'q"]);

  // G) Deadlock yo'q: bir vaqtda filial → Firma va Firma → filial (bir kassa, bir valyuta)
  const G = await Promise.all([
    psqlAsync(`begin; select public.branch_firma_transfer('f729',3,'USD','to_firma',10,'g1',false); select pg_sleep(1); commit;`),
    psqlAsync(`begin; select public.branch_firma_transfer('f729',3,'USD','from_firma',20,'g2',false); commit;`, 200),
  ]);
  assert.equal(G[0].code, 0, G[0].err); assert.equal(G[1].code, 0, G[1].err);
  assert.equal(bal(3), 360);
  results.push(["B7 deadlock yo'q (filial→Firma va Firma→filial bir vaqtda)", 'ikkalasi ham bajarildi, qoldiq 360']);

  // F) Yakuniy: har bir kassa qoldig'i = jurnal yig'indisi; Firma kassa ham
  const chk = psqlSync(`select bool_and(b.balance = (select coalesce(sum(case when direction='in' then amount else -amount end),0) from cashbox_ledger l where l.filial=b.filial and l.box_local_id=b.box_local_id)) from cashbox_balances b`);
  const chk2 = psqlSync(`select bool_and(f.balance = (select coalesce(sum(case when direction='in' then amount else -amount end),0) from firma_kassa_ledger l where l.currency=f.currency)) from firma_kassa_balance f`);
  assert.equal(chk, 't'); assert.equal(chk2, 't');
  results.push(["F4-7 / B7 yakuniy izchillik", "har bir kassa qoldig'i = jurnal yig'indisi (filial va Firma kassa)"]);

  console.log(`PostgreSQL: ${psqlSync('show server_version')} (lokal sinov bazasi "${DB}")`);
  results.forEach(([a, b]) => console.log(`✅ ${a}: ${b}`));
  psqlSync(`drop database if exists ${DB}`, 'postgres');
}
main().catch((e) => { console.error('❌', e.message); process.exit(1); });
