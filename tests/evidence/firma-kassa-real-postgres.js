// DALIL SKRIPTI (npm test'ga kirmaydi): 28-migratsiya — FIRMA KASSASI asosiy kassa, HAQIQIY PostgreSQL 16 da.
// Ta'minotchi qarzini Firma kassasidan to'lash (oddiy, so'mda, qarzdan ortiq, kassada yetmaydi → rollback,
// takror, PARALLEL), xarajat yozuvi va uni faqat Xarajatlar orqali bekor qilish, huquqlar, takroriy qo'llash.
//   PGHOST=/tmp/fwpg PGPORT=5499 PGUSER=postgres node tests/evidence/firma-kassa-real-postgres.js
// Skript `fw_fk28_test` nomli LOKAL bazani yaratadi/qayta yaratadi (production EMAS).
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..', '..');
const DB = 'fw_fk28_test';
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
const MIG28 = path.join(ROOT, 'supabase-migration-28-firma-kassa-asosiy.sql');

async function main() {
  psqlSync(`drop database if exists ${DB}`, 'postgres');
  psqlSync(`create database ${DB} encoding 'UTF8' lc_collate 'C' lc_ctype 'C' template template0`, 'postgres');
  for (const r of ['anon', 'authenticated', 'service_role']) { try { psqlSync(`create role ${r} nologin`, 'postgres'); } catch (_) {} }
  const tmp = path.join(require('os').tmpdir(), 'fw-prelude-fk28.sql');
  fs.writeFileSync(tmp, PRELUDE); psqlFile(tmp);
  // 28-migratsiyadan OLDINGI holat: schema.sql ning 12-bo'limigacha (22–27)
  const full = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
  const cut = full.indexOf('\n-- ────────────────────────────────────────────────────────────────────\n-- 12. 28-migratsiya');
  assert.ok(cut > 0, "schema.sql: 12-bo'lim topilmadi");
  const pre = path.join(require('os').tmpdir(), 'fw-schema-pre28.sql');
  fs.writeFileSync(pre, full.slice(0, cut)); psqlFile(pre);
  psqlSync(`update app_data set data = jsonb_set(coalesce(data,'{}'::jsonb), '{settings}', '{"usdUzs":12000}'::jsonb) where id='main'`);
  // 28 dan oldin: yangi amal turi yo'q
  assert.equal(tryQ(`select (_fk_cash_move('USD','out',1,'expense')).id`).ok, false, "28 dan oldin 'expense' amali yo'q");
  psqlFile(MIG28); psqlFile(MIG28);   // takroriy qo'llash — zarar yo'q

  const out = [];
  const ok = (name, detail) => out.push(['✅', name, detail]);
  const n = (sql) => +psqlSync(sql);
  const debt = () => n(`select debt from supplier_balances where filial='f729' and supplier_local_id=7001`);
  const fk = (c) => n(`select coalesce((select balance from firma_kassa_balance where currency='${c}'),0)`);
  // Boshlang'ich: ta'minotchi qarzi 100$, Firma kassa 500$ va 2 000 000 so'm
  psqlSync(`select _supp_debt_move('f729', 7001, 100, 0, 'set', 'opening', 'seed-7001')`);
  psqlSync(`select (_fk_cash_move('USD','in',500,'deposit',null,null,null,null,null,null,'seed',null,null,'seed-usd')).id`);
  psqlSync(`select (_fk_cash_move('UZS','in',2000000,'deposit',null,null,null,null,null,null,'seed',null,null,'seed-uzs')).id`);
  assert.equal(debt(), 100); assert.equal(fk('USD'), 500);

  // 1) Oddiy to'lov ($)
  let r = JSON.parse(psqlSync(`select firma_supplier_pay('f729', 7001, 'USD', 30, 'fsp-1', 'X MChJ', 'test', 1, 'Admin')`));
  assert.equal(r.supplierDebt, 70); assert.equal(debt(), 70); assert.equal(fk('USD'), 470);
  assert.equal(psqlSync(`select op_type||'/'||source_type from firma_kassa_ledger where id=${r.fkEntryId}`), 'supplier_payment/supplier_payment');
  assert.equal(n(`select count(*) from supplier_payments where idem_key='fsp:fsp-1'`), 1);
  assert.equal(n(`select count(*) from supplier_debt_ledger where op_key='fsp:fsp-1' and delta=-30 and paid_delta=30`), 1);
  ok("Ta'minotchiga to'lov (Firma kassa, $)", 'qarz 100 → 70, Firma kassa 500 → 470, ikkala jurnalda ham yozuv');

  // 2) So'mda to'lov — kurs bo'yicha qarzdan ayiriladi
  r = JSON.parse(psqlSync(`select firma_supplier_pay('f729', 7001, 'UZS', 120000, 'fsp-2', 'X MChJ')`));
  assert.equal(debt(), 60); assert.equal(fk('UZS'), 1880000); assert.equal(+r.amountUsd, 10);
  ok("So'mda to'lov", "120 000 so'm = 10$ (12 000 kurs) — qarz 70 → 60");

  // 3) Qarzdan ortiq — rad, hech narsa o'zgarmaydi
  let t = tryQ(`select firma_supplier_pay('f729', 7001, 'USD', 61, 'fsp-3')`);
  assert.equal(t.ok, false); assert.match(t.err, /qarzidan/); assert.equal(debt(), 60); assert.equal(fk('USD'), 470);
  ok('Qarzdan ortiq to\'lov', `rad: ${t.err.replace(/^.*ERROR:\s*/, '')}`);

  // 4) Kassada yetmaydi — qarz ham o'zgarmaydi (rollback)
  psqlSync(`select (_fk_cash_move('USD','out',460,'withdraw',null,null,null,null,null,null,'test',null,null,'w-1')).id`);
  t = tryQ(`select firma_supplier_pay('f729', 7001, 'USD', 20, 'fsp-4')`);
  assert.equal(t.ok, false); assert.match(t.err, /yetarli emas/); assert.equal(debt(), 60, 'qarz kamaymadi'); assert.equal(fk('USD'), 10);
  assert.equal(n(`select count(*) from supplier_debt_ledger where op_key='fsp:fsp-4'`), 0);
  ok('Firma kassada pul yetmaydi', 'rad etildi, qarz jurnali ham yozilmadi (bitta tranzaksiya)');
  psqlSync(`select (_fk_cash_move('USD','in',490,'deposit',null,null,null,null,null,null,'top-up',null,null,'d-2')).id`);   // 500$

  // 5) Takroriy so'rov — ikkinchi marta yozilmaydi
  const r1 = JSON.parse(psqlSync(`select firma_supplier_pay('f729', 7001, 'USD', 5, 'fsp-5')`));
  const r2 = JSON.parse(psqlSync(`select firma_supplier_pay('f729', 7001, 'USD', 5, 'fsp-5')`));
  assert.equal(r2.replay, true); assert.equal(r2.fkEntryId, r1.fkEntryId); assert.equal(debt(), 55); assert.equal(fk('USD'), 495);
  ok('Takroriy so\'rov (bir xil kalit)', 'replay=true, bitta yozuv, qarz 55');

  // 6) PARALLEL: qarz 55$, ikkita 40$ to'lov bir vaqtda — bittasi rad
  const [a, b] = await Promise.all([
    psqlAsync(`select firma_supplier_pay('f729', 7001, 'USD', 40, 'fsp-p1')`),
    psqlAsync(`select firma_supplier_pay('f729', 7001, 'USD', 40, 'fsp-p2')`)]);
  assert.equal([a, b].filter(x => x.code === 0).length, 1, 'faqat bittasi o\'tadi');
  assert.equal(debt(), 15); assert.equal(fk('USD'), 455);
  ok("PARALLEL 2×40$ (qarz 55$)", "bittasi o'tdi, bittasi rad; qarz 15, kassa 455 — ikki marta yechilmadi");

  // 7) Xarajat: Firma kassasidan; umumiy «bekor qilish» rad, Xarajatlar orqali — kassa qaytadi
  const ex = n(`select (_fk_cash_move('USD','out',25,'expense','other',null,'Ijara','f729','expense','e-1','Ijara',1,'Admin','fkx-1')).id`);
  assert.equal(psqlSync(`select source_type from firma_kassa_ledger where id=${ex}`), 'expense'); assert.equal(fk('USD'), 430);
  t = tryQ(`select (firma_kassa_reverse(${ex}, 'r-ex-1')).id`);
  assert.equal(t.ok, false); assert.match(t.err, /Xarajatlar/);
  const rv = n(`select (firma_kassa_reverse_expense(${ex}, 'r-ex-1', 'oʻchirildi', 1, 'Admin')).id`);
  assert.equal(fk('USD'), 455); assert.equal(n(`select reversed_by from firma_kassa_ledger where id=${ex}`), rv);
  assert.equal(n(`select (firma_kassa_reverse_expense(${ex}, 'r-ex-1')).id`), rv, 'takror — o\'sha yozuv');
  assert.equal(tryQ(`select (firma_kassa_reverse_expense(${ex}, 'r-ex-2')).id`).ok, false, 'ikkinchi marta bekor qilib bo\'lmaydi');
  ok('Firma kassadan xarajat', "umumiy bekor qilish rad; Xarajatlar orqali bekor qilish — kassa 430 → 455, takror xavfsiz");

  // 8) Ta'minotchi to'lovini umumiy «bekor qilish» bilan qaytarib bo'lmaydi; xarajat bo'lmagan yozuv — reverse_expense rad
  t = tryQ(`select (firma_kassa_reverse(${r1.fkEntryId}, 'r-sp-1')).id`);
  assert.equal(t.ok, false); assert.match(t.err, /qarz jurnali/);
  assert.equal(tryQ(`select (firma_kassa_reverse_expense(${r1.fkEntryId}, 'r-sp-2')).id`).ok, false);
  // eski amallar ishlashda davom etadi (oddiy chiqim bekor qilinadi)
  const w = n(`select (_fk_cash_move('USD','out',5,'withdraw',null,null,null,null,null,null,'x',null,null,'w-3')).id`);
  assert.ok(n(`select (firma_kassa_reverse(${w}, 'r-w-3')).id`) > 0);
  ok('Bekor qilish qoidalari', "ta'minotchi to'lovi va xarajat — umumiy bekor qilishda rad; oddiy chiqim — avvalgidek");

  // 9) Huquqlar: brauzer rollari chaqira olmaydi
  for (const f of ['firma_supplier_pay(text, bigint, text, numeric, text, text, text, bigint, text)', 'firma_kassa_reverse_expense(bigint, text, text, bigint, text)']) {
    assert.equal(psqlSync(`select has_function_privilege('authenticated', 'public.${f}', 'execute')`), 'f');
    assert.equal(psqlSync(`select has_function_privilege('anon', 'public.${f}', 'execute')`), 'f');
    assert.equal(psqlSync(`select has_function_privilege('service_role', 'public.${f}', 'execute')`), 't');
  }
  ok('Huquqlar', 'anon/authenticated — yo\'q, faqat server (service_role)');

  // 10) 28 dan keyin 25-migratsiyani qayta ishga tushirish (bitta tranzaksiyada, psql -1) — xavfsiz RAD etiladi:
  //     yangi turdagi yozuvlar bor ekan, eski cheklovni qaytarib bo'lmaydi; hech narsa o'zgarmaydi. 28 qayta — zarar yo'q.
  let failed25 = false;
  try { execFileSync('psql', ['-X', '-q', '-1', '-v', 'ON_ERROR_STOP=1', '-d', DB, '-f', path.join(ROOT, 'supabase-migration-25-v23-hardening.sql')], { env, stdio: 'pipe' }); }
  catch (e) { failed25 = /firma_kassa_ledger_op_chk/.test(String(e.stderr)); }
  assert.equal(failed25, true, "25 qayta — op_chk tufayli to'liq bekor (rollback)");
  assert.ok(n(`select (_fk_cash_move('USD','out',1,'expense',null,null,null,null,'expense','e-y',null,null,null,'fkx-y')).id`) > 0, '28 holati saqlangan');
  psqlFile(MIG28);
  ok('28 dan keyin 25 qayta', "bitta tranzaksiyada qo'llansa — rad etiladi va hech narsa o'zgarmaydi; 28 qayta — xavfsiz");

  // 11) Jurnal = qoldiq
  assert.equal(psqlSync(`select bool_and(b.balance = (select coalesce(sum(case when direction='in' then amount else -amount end),0) from firma_kassa_ledger l where l.currency=b.currency)) from firma_kassa_balance b`), 't');
  assert.equal(psqlSync(`select bool_and(s.debt = (select coalesce(sum(delta),0) from supplier_debt_ledger l where l.filial=s.filial and l.supplier_local_id=s.supplier_local_id)) from supplier_balances s`), 't');
  ok('Jurnal = qoldiq', 'Firma kassa va ta\'minotchi qarzi jurnal yig\'indisiga teng');

  out.forEach(([m, a, d]) => console.log(`${m} ${a}: ${d}`));
  console.log(`JAMI: ${out.length}/${out.length}`);
}
main().catch((e) => { console.error('❌', e.stack || e.message); process.exit(1); });
