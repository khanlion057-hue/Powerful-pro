// DALIL SKRIPTI (npm test'ga kirmaydi): 30-migratsiya — DILLER PUL YUBORADI, HAQIQIY PostgreSQL 16 da.
// Production tartibi (pre-29 sxema → 29 → 30, takroriy qo'llash), PARALLEL yuborishlar (qarzdan oshmaydi),
// bir xil kalit bilan PARALLEL takror, PARALLEL «qabul» va «rad» (faqat bittasi o'tadi), jurnal = qoldiq, huquqlar.
//   PGHOST=/tmp/fwpg PGPORT=5499 PGUSER=postgres node tests/evidence/dealer-pay-real-postgres.js
// Skript `fw_dp30_test` nomli LOKAL bazani yaratadi/qayta yaratadi (production EMAS).
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..', '..');
const DB = 'fw_dp30_test';
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

async function main() {
  psqlSync(`drop database if exists ${DB}`, 'postgres');
  psqlSync(`create database ${DB} encoding 'UTF8' lc_collate 'C' lc_ctype 'C' template template0`, 'postgres');
  for (const r of ['anon', 'authenticated', 'service_role']) { try { psqlSync(`create role ${r} nologin`, 'postgres'); } catch (_) {} }
  const tmp = path.join(require('os').tmpdir(), 'fw-prelude-dp30.sql');
  fs.writeFileSync(tmp, PRELUDE); psqlFile(tmp);
  // 30 dan OLDINGI to'liq sxema (production + 23…29), keyin 30 — ikki marta (takroriy qo'llash xavfsiz)
  const full = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
  const cut = full.indexOf('\n-- ────────────────────────────────────────────────────────────────────\n-- 14. 30-migratsiya');
  assert.ok(cut > 0, "schema.sql'da 14-bo'lim (30-migratsiya) bor");
  const pre = path.join(require('os').tmpdir(), 'fw-schema-pre30.sql'); fs.writeFileSync(pre, full.slice(0, cut)); psqlFile(pre);
  const M30 = path.join(ROOT, 'supabase-migration-30-diller-tolov-xabarnomasi.sql');
  psqlFile(M30); psqlFile(M30);

  const out = [];
  const ok = (name, detail) => out.push(['✅', name, detail]);
  const n = (sql) => +psqlSync(sql);
  psqlSync(`insert into dealers (login, name, debt_usd, total_paid_usd, filial) values ('d1', 'Diller', 1000, 0, 'baza')`);
  // Filial kassalari (production'da 24-migratsiya JSON'dan yaratadi): 1 — so'm, 4 — Diller kassasi ($)
  psqlSync(`select set_config('fw.cb_move', '1', false); insert into cashbox_balances (filial, box_local_id, balance, currency) values ('baza', 1, 0, 'UZS'), ('baza', 4, 0, 'USD')`);
  const did = n(`select id from dealers where login='d1'`);
  const debt = () => n(`select debt_usd from dealers where id=${did}`);
  const send = (key, type, amt) => `select public.dealer_pay_notice_create(${did}, '${type}', ${amt}, 12500, null, '${key}')`;

  // 1. Oddiy yuborish: so'm kurs bo'yicha
  psqlSync(send('ev-uzs-0001', 'cash_uzs', 1250000));
  assert.equal(debt(), 900); ok("So'm → dollar (serverdagi kurs), qarz darhol kamaydi", '1 250 000 soʻm / 12 500 = $100; qarz 1000 → 900');

  // 2. PARALLEL 6 ta yuborish × $200 — qarz 900: faqat 4 tasi o'tadi, qarz manfiyga tushmaydi
  const par = await Promise.all([1, 2, 3, 4, 5, 6].map(i => psqlAsync(send('ev-par-000' + i, 'cash_usd', 200))));
  const passed = par.filter(r => r.code === 0).length;
  assert.equal(passed, 4); assert.equal(debt(), 100);
  assert.equal(n(`select count(*) from dealer_pay_notices where idem_key like 'ev-par-%'`), 4);
  ok('PARALLEL 6 × $200 (qarz $900)', `${passed} tasi o'tdi, qolgani «qarzdan oshib ketdi»; qarz $100, manfiy emas`);

  // 3. Bir xil kalit bilan PARALLEL 5 marta — bitta yozuv
  const same = await Promise.all([1, 2, 3, 4, 5].map(() => psqlAsync(send('ev-same-001', 'cash_usd', 30))));
  assert.ok(same.every(r => r.code === 0));
  assert.equal(n(`select count(*) from dealer_pay_notices where idem_key='ev-same-001'`), 1); assert.equal(debt(), 70);
  ok('Bir xil kalit — PARALLEL 5 marta', 'bitta xabarnoma, qarz bir marta kamaydi');

  // 4. PARALLEL «qabul» va «rad» bir xabarnomaga — faqat bittasi
  const nid = n(`select id from dealer_pay_notices where idem_key='ev-same-001'`);
  const race = await Promise.all([
    psqlAsync(`select public.dealer_pay_notice_accept(${nid}, 'baza', 4, 'Diller kassasi', 7, 'Kassir')`),
    psqlAsync(`select public.dealer_pay_notice_reject(${nid}, 'baza', 'pul kelmadi', 7, 'Kassir')`),
    psqlAsync(`select public.dealer_pay_notice_accept(${nid}, 'baza', 4, 'Diller kassasi', 7, 'Kassir')`),
  ]);
  const st = psqlSync(`select status from dealer_pay_notices where id=${nid}`);
  const bal4 = n(`select coalesce((select balance from cashbox_balances where filial='baza' and box_local_id=4),0)`);
  if (st === 'accepted') { assert.equal(bal4, 30); assert.equal(debt(), 70); }
  else { assert.equal(st, 'rejected'); assert.equal(bal4, 0); assert.equal(debt(), 100); }
  assert.equal(n(`select count(*) from cashbox_ledger where group_key='dpn:${nid}'`), st === 'accepted' ? 1 : 0);
  ok('PARALLEL qabul + rad + qabul', `yakuniy holat «${st}»; kassa ${bal4}, qarz ${debt()} — ikki marta yozilmadi (${race.filter(r => r.code === 0).length}/3 javob muvaffaqiyatli)`);

  // 5. Rad → qarz qaytadi; rad → qabul qilinmaydi; qabul → rad etilmaydi
  const id2 = n(`select id from dealer_pay_notices where idem_key='ev-uzs-0001'`);
  const d0 = debt();
  psqlSync(`select public.dealer_pay_notice_reject(${id2}, 'baza', 'pul kelmadi', 7, 'Kassir')`);
  assert.equal(debt(), d0 + 100);
  assert.equal(tryQ(`select public.dealer_pay_notice_accept(${id2}, 'baza', 1, 'Naqd', 7, 'Kassir')`).ok, false);
  ok("Rad — qarz qaytdi (teskari yozuv), rad etilgan qayta qabul qilinmaydi", `qarz ${d0} → ${debt()}`);
  const id3 = n(`select id from dealer_pay_notices where idem_key='ev-par-0001' or (idem_key like 'ev-par-%' and status='pending') order by id limit 1`);
  psqlSync(`select public.dealer_pay_notice_accept(${id3}, 'baza', 4, 'Diller kassasi', 7, 'Kassir')`);
  assert.equal(tryQ(`select public.dealer_pay_notice_reject(${id3}, 'baza', 'xato', 7, 'Kassir')`).ok, false);
  assert.equal(tryQ(`select public.dealer_pay_notice_accept(${id3 + 0}, 'f729', 4, 'X', 7, 'K')`).ok, false, 'boshqa filial');
  assert.equal(tryQ(`select public.dealer_pay_notice_accept((select id from dealer_pay_notices where status='pending' and currency='USD' limit 1), 'baza', 1, 'Naqd', 7, 'K')`).ok, false, "valyuta mos emas (USD → so'm kassa)");
  ok("Qabul qilingan — rad etilmaydi; boshqa filial va valyuta mos bo'lmagan kassa — rad", 'kassa jurnali o\'zgarmadi');

  // 6. Jurnal izchilligi: diller to'lovlari yig'indisi = qarz kamayishi; kassa qoldig'i = jurnal yig'indisi
  const paid = n(`select coalesce(sum(amount_usd),0) from dealer_payments where dealer_id=${did}`);
  assert.equal(Math.round((1000 - debt()) * 100), Math.round(paid * 100));
  assert.equal(n(`select coalesce(sum(case when direction='in' then amount else -amount end),0) from cashbox_ledger where filial='baza' and box_local_id=4`), n(`select balance from cashbox_balances where filial='baza' and box_local_id=4`));
  ok("Jurnal = qoldiq", `diller to'lovlari $${paid} = qarz kamayishi; Diller kassasi qoldig'i = jurnal yig'indisi`);

  // 7. Huquqlar: brauzer rollari jadvalga va funksiyalarga kira olmaydi
  const acl = psqlSync(`select has_table_privilege('authenticated','public.dealer_pay_notices','select')::text || ',' || has_table_privilege('anon','public.dealer_pay_notices','insert')::text || ',' ||
    has_function_privilege('authenticated','public.dealer_pay_notice_create(bigint, text, numeric, numeric, text, text)','execute')::text || ',' || has_function_privilege('service_role','public.dealer_pay_notice_accept(bigint, text, integer, text, bigint, text)','execute')::text`);
  assert.equal(acl, 'false,false,false,true');
  ok('Huquqlar', 'anon/authenticated — yo\'q; faqat server (service_role)');

  for (const [a, b, c] of out) console.log(`${a} ${b}${c ? ' — ' + c : ''}`);
  console.log(`JAMI: ${out.length}/${out.length}`);
  psqlSync(`drop database if exists ${DB}`, 'postgres');
}
main().catch(e => { console.error('❌', e.message); process.exit(1); });
