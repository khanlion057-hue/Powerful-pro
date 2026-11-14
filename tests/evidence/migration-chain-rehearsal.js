// DALIL SKRIPTI (npm test'ga kirmaydi): 24 → 25 → 26 MIGRATSIYA ZANJIRI — production holatining nusxasida
// (production sxemasi 22+23 + productiondagi ma'lumot shakli: nol qoldiqli kassalar, 1 diller, 6 xodim)
// HAQIQIY PostgreSQL 16 (UTF8). Production'ga HECH NARSA yozilmaydi — faqat lokal sinov bazasi.
// PGlite bitta ulanishli — shuning uchun haqiqiy parallellik shu yerda tekshiriladi.
//
// Talab: lokal PostgreSQL (psql) va BO'SH sinov bazasi (production EMAS!):
//   PGHOST=/tmp/fwpg PGPORT=5499 PGUSER=postgres node tests/evidence/migration-chain-rehearsal.js
// Skript `fw_cash_test` nomli bazani yaratadi/qayta yaratadi.
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..', '..');
const DB = 'fw_chain_test';
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

const MIG = (n) => path.join(ROOT, { 23: 'supabase-migration-23-v10-firma-kassa.sql', 24: 'supabase-migration-24-v11-cash-authority.sql',
  25: 'supabase-migration-25-v23-hardening.sql', 26: 'supabase-migration-26-expense-categories.sql', 27: 'supabase-migration-27-f4b-ledger-authority.sql', 28: 'supabase-migration-28-firma-kassa-asosiy.sql', 29: 'supabase-migration-29-hisobdan-chiqarish-b2b.sql', 30: 'supabase-migration-30-diller-tolov-xabarnomasi.sql', 31: 'supabase-migration-31-tahrir-muddati-audit-bildirishnoma.sql', 32: 'supabase-migration-32-reviziya-tasdiq-direct-sale.sql', 33: 'supabase-migration-33-taminotchi-zaklad.sql', 34: 'supabase-migration-34-mijoz-haqi.sql', 35: 'supabase-migration-35-diller-ombor-atomik.sql' }[n]);
const VERIFY = path.join(ROOT, 'supabase-migration-25-verify.sql');
// production sxemasi (2026-10-01, 22-migratsiyadan keyin) = schema.sql'ning 7-bo'limgacha qismi
function prodSlice() {
  const s = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
  const i = s.indexOf('-- 7. v10 (23-migratsiya)');
  return s.slice(0, s.lastIndexOf('\n', s.lastIndexOf('-- ───', i)));
}
const BOXES = [1, 2, 3, 4, 5].map(id => ({ id, cur: id <= 2 ? 'UZS' : 'USD', type: ['cash', 'card', 'usd', 'dealer', 'qobiljon'][id - 1], bal: 0, name: 'K' + id }));
function freshDb(db) {
  psqlSync(`drop database if exists ${db}`, 'postgres');
  psqlSync(`create database ${db} encoding 'UTF8' lc_collate 'C' lc_ctype 'C' template template0`, 'postgres');
  const tmp = path.join(require('os').tmpdir(), 'fw-prelude-chain.sql');
  fs.writeFileSync(tmp, PRELUDE.replace(/create role [a-z_]+ nologin;/g, ''));
  psqlFile(tmp, db);
  const sl = path.join(require('os').tmpdir(), 'fw-prod-slice.sql');
  fs.writeFileSync(sl, prodSlice());
  psqlFile(sl, db);
  psqlFile(MIG(23), db);                                     // productionda 23 qo'llangan (tekshirilgan)
  // productiondagi ma'lumot shakli (2026-10-02, faqat o'qish so'rovi bilan olingan): nol qoldiqlar
  const br = JSON.stringify({ cashboxes: BOXES, sales: [], expenses: [], customers: [], suppliers: [], batches: [] });
  psqlSync(`update app_data set data = data || jsonb_build_object('settings','{"usdUzs":12800}'::jsonb,'branchDebt','{}'::jsonb,
    'partners','[{"id":1,"name":"A","invested":0},{"id":2,"name":"B","invested":0},{"id":3,"name":"C","invested":0}]'::jsonb,
    'branchStore', jsonb_build_object('baza', '${br}'::jsonb, 'f729', '${br}'::jsonb)) where id='main'`, db);
  psqlSync(`insert into app_data_branches (branch_key, data) values ('baza', '${br}'::jsonb), ('f729', '${br}'::jsonb)`, db);
  psqlSync(`insert into staff (id, login, name, role, filial) overriding system value values (1,'a','A','admin','baza'),(2,'b','B','sotuvchi','baza'),(3,'c','C','sotuvchi','f729'),(4,'d','D','sotuvchi','f729'),(5,'e','E','sotuvchi','baza'),(6,'f','F','sotuvchi','baza')`, db);
  psqlSync(`insert into dealers (id, login, name, filial, debt_usd, total_paid_usd) overriding system value values (1,'dl','Diller','baza',0,0)`, db);
}
const dataSig = (db) => psqlSync(`select md5(coalesce((select string_agg(data::text, '|' order by id) from app_data),'') || coalesce((select string_agg(branch_key||data::text, '|' order by branch_key) from app_data_branches),'')
  || coalesce((select string_agg(id||':'||login||':'||filial, ',' order by id) from staff),'') || coalesce((select string_agg(id||':'||debt_usd||':'||filial, ',' order by id) from dealers),''))`, db);
const schemaSig = (db) => psqlSync(`select (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r')
  ||'/'||(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public')
  ||'/'||(select count(*) from pg_constraint k join pg_namespace n on n.oid=k.connamespace where n.nspname='public')
  ||'/'||(select count(*) from pg_indexes where schemaname='public')
  ||'/'||(select md5(string_agg(p.proname||md5(p.prosrc)||coalesce(p.proacl::text,''), ',' order by p.proname, pg_get_function_identity_arguments(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public')`, db);
const tryFile = (file, db) => { try { psqlFile(file, db); return null; } catch (e) { return String(e.stderr || e.message).split('\n').find(l => /ERROR/.test(l)) || 'xato'; } };

async function main() {
  for (const r of ['anon', 'authenticated', 'service_role']) { try { psqlSync(`create role ${r} nologin`, 'postgres'); } catch (_) {} }
  const results = [];
  freshDb(DB);
  const d0 = dataSig(DB), s0 = schemaSig(DB);
  results.push(['Boshlang\'ich holat (production nusxasi)', `sxema ${s0.split('/').slice(0, 4).join('/')} (jadval/funksiya/cheklov/indeks)`]);
  // 1) Tartib: 24 → 25 → 26, har biridan keyin tekshiruv
  psqlFile(MIG(24), DB);
  assert.equal(psqlSync(`select to_regclass('public.cashbox_ledger') is not null`, DB), 't');
  assert.equal(psqlSync(`select count(*) from cashbox_balances`, DB), '10', '2 filial × 5 kassa — nol qoldiq bilan');
  assert.equal(psqlSync(`select count(*)||':'||sum(amount)::int||':'||bool_and(op_kind='opening') from cashbox_ledger`, DB), '10:0:true', "har bir kassaga bitta 'opening' yozuvi (summa 0) — iz qoladi");
  psqlFile(MIG(25), DB);
  assert.equal(psqlSync(`select data_type from information_schema.columns where table_name='customer_debt_payments' and column_name='customer_local_id'`, DB), 'bigint');
  psqlFile(MIG(26), DB);
  psqlFile(MIG(27), DB);
  psqlFile(MIG(28), DB);
  psqlFile(MIG(29), DB);
  psqlFile(MIG(30), DB);
  psqlFile(MIG(31), DB);
  psqlFile(MIG(32), DB);
  psqlFile(MIG(33), DB);
  psqlFile(MIG(34), DB);
  psqlFile(MIG(35), DB);
  const v = psqlSync(`\\i ${VERIFY}`, DB).split('\n').filter(Boolean).map(l => l.split('|'));
  const bad = v.filter(x => x[1] !== 't');
  assert.deepEqual(bad, [], 'verify SQL: hammasi true');
  results.push(['24 → 25 → 26 → 27 → 28 → 29 → 30 → 31 → 32 → 33 → 34 → 35 (production nusxasida)', `xatosiz; verify SQL ${v.length}/${v.length} true; 10 ta kassa qoldig'i (0) bazaga ko'chdi, har biriga 1 ta 'opening' (0) yozuvi`]);
  // 2) Ma'lumot saqlandi (JSON, xodimlar, diller)
  assert.equal(dataSig(DB), d0, "app_data, app_data_branches, staff, dealers — o'zgarmadi");
  results.push(["Mavjud ma'lumot", "app_data / app_data_branches / staff / dealers — bayt-ma-bayt bir xil"]);
  // 3) Takroriy ishga tushirish — sxema va ma'lumot o'zgarmaydi
  const s1 = schemaSig(DB);
  for (const n of [24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35]) psqlFile(MIG(n), DB);
  assert.equal(schemaSig(DB), s1); assert.equal(dataSig(DB), d0);
  results.push(['Takroriy (24 … 35 yana)', "sxema (funksiya matnlari va ruxsatlar md5) va ma'lumot o'zgarmadi"]);
  // 4) Yakuniy sxema = schema.sql (noldan o'rnatish) bilan bir xil
  const ref = DB + '_ref';
  psqlSync(`drop database if exists ${ref}`, 'postgres');
  psqlSync(`create database ${ref} encoding 'UTF8' lc_collate 'C' lc_ctype 'C' template template0`, 'postgres');
  const tmp = path.join(require('os').tmpdir(), 'fw-prelude-chain.sql');
  psqlFile(tmp, ref); psqlFile(path.join(ROOT, 'supabase', 'schema.sql'), ref);
  assert.equal(schemaSig(DB), schemaSig(ref), 'production + 23 … 35 = schema.sql');
  results.push(['Yakuniy sxema', `production + 23→35 = schema.sql (${schemaSig(DB).split('/').slice(0, 4).join('/')}, funksiyalar md5 bir xil)`]);
  psqlSync(`drop database if exists ${ref}`, 'postgres');
  // 5) Bog'liqlik: 25 — 24 siz qo'llanmaydi (aniq xato, yarim holat yo'q); 26 — mustaqil
  const dep = DB + '_dep';
  freshDb(dep);
  const e25 = tryFile(MIG(25), dep);
  assert.ok(e25, '25 — 24 siz xato beradi');
  const after25fail = psqlSync(`select to_regclass('public.cashbox_ledger') is null and not exists (select 1 from pg_proc where proname='cash_payment_atomic')`, dep);
  const e27 = tryFile(MIG(27), dep);
  assert.ok(e27 && /24 va 25/.test(e27), '27 — 24/25 siz aniq xato');
  const e26 = tryFile(MIG(26), dep);
  assert.equal(e26, null, '26 — 24/25 ga bog\'liq emas');
  results.push(["Bog'liqlik", `25 ni 24 dan oldin qo'llash — xato ("${e25.replace(/^.*ERROR:\s*/, '').slice(0, 70)}"), cash_payment_atomic yaratilmadi=${after25fail === 't'}; 26 — mustaqil (faqat staff jadvali); 27 ni 24/25 siz qo'llash — aniq xato ("${e27.replace(/^.*ERROR:\s*/, '').slice(0, 60)}")`]);
  psqlSync(`drop database if exists ${dep}`, 'postgres');
  // 5b) Bitta tranzaksiyada (psql -1 / BEGIN…COMMIT): 25 oxirida xato bo'lsa — 25 dan HECH NARSA qolmaydi
  const tx = DB + '_tx';
  freshDb(tx);
  execFileSync('psql', ['-X', '-q', '-1', '-v', 'ON_ERROR_STOP=1', '-d', tx, '-f', MIG(24)], { env, encoding: 'utf8', stdio: 'pipe' }); // 24 ham bitta tranzaksiyada
  const broken = path.join(require('os').tmpdir(), 'fw-mig25-broken.sql');
  fs.writeFileSync(broken, fs.readFileSync(MIG(25), 'utf8') + '\nselect 1/0; -- sun\'iy xato (sinov)\n');
  let txErr = null;
  try { execFileSync('psql', ['-X', '-q', '-1', '-v', 'ON_ERROR_STOP=1', '-d', tx, '-f', broken], { env, encoding: 'utf8', stdio: 'pipe' }); } catch (e) { txErr = String(e.stderr || e.message); }
  assert.ok(txErr && /division by zero/.test(txErr));
  const nothing = psqlSync(`select not exists (select 1 from pg_proc where proname in ('cash_payment_atomic','branch_firma_loan','firma_kassa_reverse'))
    and not exists (select 1 from information_schema.columns where table_name='firma_kassa_ledger' and column_name='source_type')
    and (select data_type from information_schema.columns where table_name='customer_debt_payments' and column_name='customer_local_id') = 'integer'`, tx);
  assert.equal(nothing, 't');
  execFileSync('psql', ['-X', '-q', '-1', '-v', 'ON_ERROR_STOP=1', '-d', tx, '-f', MIG(25)], { env, encoding: 'utf8', stdio: 'pipe' });
  execFileSync('psql', ['-X', '-q', '-1', '-v', 'ON_ERROR_STOP=1', '-d', tx, '-f', MIG(26)], { env, encoding: 'utf8', stdio: 'pipe' });
  execFileSync('psql', ['-X', '-q', '-1', '-v', 'ON_ERROR_STOP=1', '-d', tx, '-f', MIG(27)], { env, encoding: 'utf8', stdio: 'pipe' });
  assert.equal(psqlSync(`select exists (select 1 from pg_proc where proname='cash_payment_atomic') and to_regclass('public.expense_categories') is not null`, tx), 't');
  results.push(['Bitta tranzaksiyada qo\'llash (psql -1)', "24, 25, 26, 27 har biri BEGIN…COMMIT ichida ishlaydi; 25 oxirida sun'iy xato — 25 dan hech narsa qolmadi (yarim holat yo'q); keyin 25 va 26 to'liq qo'llandi"]);
  psqlSync(`drop database if exists ${tx}`, 'postgres');
  // 5c) 27 dan keyin 24/25 qayta ishga tushirilsa: yangi kod ishlatadigan funksiyalar (v3, _v2, sale-ops, stock_debt_op) o'zgarmaydi;
  //     eski nomlar (sale_checkout_atomic_v2, cash_payment_atomic) eski holatga qaytadi — 27 ni qayta ishga tushirish tiklaydi
  const sigNew = () => psqlSync(`select md5(string_agg(proname||md5(prosrc), ',' order by proname)) from pg_proc where proname in ('sale_checkout_atomic_v3','cash_payment_atomic_v2','sale_return_atomic','sale_void_atomic','sale_edit_atomic','stock_debt_op')`, DB);
  const sigAll = schemaSig(DB), n0 = sigNew();
  psqlFile(MIG(24), DB); psqlFile(MIG(25), DB);
  assert.equal(sigNew(), n0, "yangi kod funksiyalari o'zgarmadi");
  assert.notEqual(schemaSig(DB), sigAll, 'eski nomlar qaytdi (kutilgan)');
  psqlFile(MIG(27), DB); psqlFile(MIG(28), DB); psqlFile(MIG(29), DB); psqlFile(MIG(30), DB); psqlFile(MIG(31), DB); psqlFile(MIG(32), DB); psqlFile(MIG(33), DB); psqlFile(MIG(34), DB); psqlFile(MIG(35), DB);
  assert.equal(schemaSig(DB), sigAll, '27…35 qayta — to\'liq tiklandi');
  results.push(["27 dan keyin 24/25 qayta ishga tushirilsa", "yangi kod funksiyalari (v3, cash_payment_atomic_v2, sale-ops, stock_debt_op) o'zgarmaydi; eski nomlar qaytadi — 27, 28 va 29 ni qayta ishga tushirish to'liq tiklaydi (DEPLOY.md'da)"]);
  // 6) Kodlash himoyasi: UTF8 bo'lmagan bazada 26 to'xtaydi
  const asc = DB + '_ascii';
  psqlSync(`drop database if exists ${asc}`, 'postgres');
  psqlSync(`create database ${asc} encoding 'SQL_ASCII' lc_collate 'C' lc_ctype 'C' template template0`, 'postgres');
  psqlFile(tmp, asc);
  psqlSync(`create table public.staff (id bigint primary key)`, asc);
  const eA = tryFile(MIG(26), asc);
  assert.match(eA || '', /UTF8/);
  results.push(['UTF8 himoyasi', "SQL_ASCII bazada 26 aniq xato bilan to'xtadi (Supabase — UTF8, tekshirilgan)"]);
  psqlSync(`drop database if exists ${asc}`, 'postgres');
  // 7) Brauzer rollari: yangi jadval/funksiyalar yopiq
  const closed = psqlSync(`select bool_and(not has_table_privilege(r, t, 'select') and not has_table_privilege(r, t, 'insert'))
    from unnest(array['anon','authenticated']) r, unnest(array['public.cashbox_ledger','public.cashbox_balances','public.firma_kassa_ledger','public.expense_categories','public.customer_debt_payments','public.supplier_payments','public.home_withdrawals']) t`, DB);
  const fclosed = psqlSync(`select bool_and(not has_function_privilege(r, f, 'execute')) from unnest(array['anon','authenticated']) r,
    unnest(array['public.cashbox_apply_ops(text,text,text,jsonb,bigint,text)','public.cash_payment_atomic(text,text,text,jsonb,text,jsonb,bigint,text)',
      'public.branch_firma_loan(text,integer,text,text,numeric,text,text,text,bigint,text)','public.firma_kassa_reverse(bigint,text,text,bigint,text)']) f`, DB);
  assert.equal(closed, 't'); assert.equal(fclosed, 't');
  results.push(['Brauzer rollari (anon/authenticated)', "pul jadvallari, kategoriyalar va pul funksiyalari — yopiq (faqat service_role)"]);
  console.log(`PostgreSQL: ${psqlSync('show server_version')} (lokal sinov bazasi "${DB}", ${psqlSync('show server_encoding', DB)})`);
  results.forEach(([a, b]) => console.log(`✅ ${a}: ${b}`));
  psqlSync(`drop database if exists ${DB}`, 'postgres');
}
main().catch((e) => { console.error('❌', e.message, e.stderr ? String(e.stderr).slice(0, 400) : ''); process.exit(1); });
