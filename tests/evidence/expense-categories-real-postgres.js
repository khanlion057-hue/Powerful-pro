// DALIL SKRIPTI (npm test'ga kirmaydi): 26-migratsiya (xarajat kategoriyalari) — HAQIQIY PostgreSQL 16:
// UTF8 baza, takroriy migratsiya, parallel yaratish (noyob indeks), apostrof/harf farqsiz takror, FK, brauzer rollari yopiq.
// PGlite bitta ulanishli — shuning uchun haqiqiy parallellik shu yerda tekshiriladi.
//
// Talab: lokal PostgreSQL (psql) va BO'SH sinov bazasi (production EMAS!):
//   PGHOST=/tmp/fwpg PGPORT=5499 PGUSER=postgres node tests/evidence/expense-categories-real-postgres.js
// Skript `fw_cash_test` nomli bazani yaratadi/qayta yaratadi.
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..', '..');
const DB = 'fw_expcat_test';
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
  const tmp = path.join(require('os').tmpdir(), 'fw-prelude-ec.sql');
  fs.writeFileSync(tmp, PRELUDE.replace(/create role [a-z_]+ nologin;/g, ''));
  psqlFile(tmp);
  psqlFile(path.join(ROOT, 'supabase', 'schema.sql'));
  const results = [];
  // A) 26-migratsiya qayta-qayta — xato yo'q, ma'lumot o'zgarmaydi
  psqlSync(`insert into staff (id, login, name) overriding system value values (7,'kas','Kassir')`);
  psqlSync(`insert into expense_categories (filial, turi, name, created_by) values ('f729','dokon','Elektr',7)`);
  psqlFile(path.join(ROOT, 'supabase-migration-26-expense-categories.sql'));
  psqlFile(path.join(ROOT, 'supabase-migration-26-expense-categories.sql'));
  assert.equal(psqlSync(`select count(*) from expense_categories`), '1');
  results.push(['26-migratsiya 2 marta (schema.sql ustidan)', "xato yo'q, mavjud kategoriya joyida"]);
  // B) Takror: harf, bo'shliq, apostrof turi farqsiz
  const dupTry = (n) => psqlAsync(`insert into expense_categories (filial, turi, name) values ('f729','dokon', $q$${n}$q$);`);
  const B = await Promise.all(['ELEKTR', 'elektr'].map(dupTry));
  assert.ok(B.every(x => x.code !== 0 && /expense_categories_active_uq/.test(x.err)));
  psqlSync(`insert into expense_categories (filial, turi, name) values ('f729','dokon','Yo''lkira')`);
  const B2 = await Promise.all(['Yo‘lkira', 'YOʻLKIRA', 'yo’lkira'].map(dupTry));
  assert.ok(B2.every(x => x.code !== 0), "apostrof turlari bir xil hisoblanadi");
  results.push(["Takror (ELEKTR, elektr, Yo‘lkira, YOʻLKIRA, yo’lkira)", 'hammasi noyob indeks bilan rad etildi']);
  // C) Parallel yaratish (ikki ulanish, bir nom): bittasi o'tadi
  const C = await Promise.all([
    psqlAsync(`begin; insert into expense_categories (filial, turi, name) values ('f729','dokon','Gaz'); select pg_sleep(1.2); commit;`),
    psqlAsync(`insert into expense_categories (filial, turi, name) values ('f729','dokon','GAZ');`, 300),
  ]);
  assert.equal(C[0].code, 0, C[0].err); assert.notEqual(C[1].code, 0); assert.match(C[1].err, /expense_categories_active_uq/);
  assert.equal(psqlSync(`select count(*) from expense_categories where name_key='gaz'`), '1');
  results.push(['Parallel yaratish (2 ulanish, Gaz/GAZ)', "1-si o'tdi, 2-si indeks qulfida KUTDI va rad etildi; bazada 1 ta"]);
  // D) Nofaol — xuddi shu nom bilan yangisi mumkin; turli tur va filial — mustaqil
  psqlSync(`update expense_categories set is_active=false, deactivated_at=now() where name='Gaz'`);
  psqlSync(`insert into expense_categories (filial, turi, name) values ('f729','dokon','Gaz'), ('f729','tasischi','Elektr'), ('baza','dokon','Elektr')`);
  assert.equal(psqlSync(`select count(*) from expense_categories where name_key in ('gaz','elektr')`), '5');
  results.push(["Nofaol nom qayta ishlatiladi; tur va filial bo'yicha mustaqil", 'Gaz (nofaol + faol), Elektr: f729/dokon, f729/tasischi, baza/dokon']);
  // E) CHECK: bo'sh, chetida bo'shliq, ikki probel, uzun, noma'lum tur, noto'g'ri filial, nofaol sanasiz
  const bad = [`'f729','dokon',''`, `'f729','dokon',' x'`, `'f729','dokon','a  b'`, `'f729','dokon',repeat('a',61)`, `'f729','boshqa','X'`, `'f/7','dokon','X'`];
  for (const v of bad) { const r = await psqlAsync(`insert into expense_categories (filial, turi, name) values (${v});`); assert.notEqual(r.code, 0, v); }
  const r2 = await psqlAsync(`update expense_categories set is_active=false where name='Elektr' and filial='baza';`);
  assert.notEqual(r2.code, 0);
  results.push(["CHECK cheklovlari", "bo'sh/bo'shliq/uzun nom, noma'lum tur, noto'g'ri filial, sanasiz nofaol — hammasi rad"]);
  // F) FK: xodim o'chirilsa — kategoriya qoladi, created_by = NULL
  psqlSync(`delete from staff where id=7`);
  assert.equal(psqlSync(`select coalesce(created_by::text,'NULL') from expense_categories where filial='f729' and turi='dokon' and name='Elektr'`), 'NULL');
  results.push(['FK staff (on delete set null)', "xodim o'chirildi — kategoriya va tarix saqlandi"]);
  // G) Brauzer rollari yopiq
  for (const role of ['anon', 'authenticated']) {
    const r = await psqlAsync(`set role ${role}; select count(*) from expense_categories;`);
    assert.notEqual(r.code, 0); assert.match(r.err, /permission denied/);
  }
  results.push(['anon / authenticated', "o'qish ham yopiq (permission denied) — faqat server"]);
  console.log(`PostgreSQL: ${psqlSync('show server_version')} (lokal sinov bazasi "${DB}", ${psqlSync('show server_encoding')})`);
  results.forEach(([a, b]) => console.log(`✅ ${a}: ${b}`));
  psqlSync(`drop database if exists ${DB}`, 'postgres');
}
main().catch((e) => { console.error('❌', e.message); process.exit(1); });
