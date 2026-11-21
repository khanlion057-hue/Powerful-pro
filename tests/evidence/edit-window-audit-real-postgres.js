// DALIL SKRIPTI (npm test'ga kirmaydi): 31-migratsiya — TAHRIRLASH MUDDATI, AUDIT, ZARAR TASDIG'I, DILLER −10%,
// HAQIQIY PostgreSQL 16 da, PARALLEL so'rovlar bilan (PGlite bitta ulanishli — parallellik shu yerda tekshiriladi).
//   PGHOST=/tmp/fwpg PGPORT=5499 PGUSER=postgres node tests/evidence/edit-window-audit-real-postgres.js
// Skript `fw_ew31_test` nomli LOKAL bazani yaratadi/qayta yaratadi (production EMAS).
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..', '..');
const DB = 'fw_ew31_test';
const env = { ...process.env };
if (/supabase\.co|pooler/i.test(String(env.PGHOST || '') + String(env.DATABASE_URL || ''))) {
  console.error('⛔ Bu skript faqat lokal sinov bazasi uchun.'); process.exit(2);
}
const psqlSync = (sql, db = DB) => execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-tA', '-d', db, '-c', sql], { env, encoding: 'utf8' }).trim();
const psqlFile = (file, db = DB) => execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', db, '-f', file], { env, encoding: 'utf8', stdio: 'pipe' });
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
const BRANCH = {
  cashboxes: [{ id: 3, name: 'Dollar', cur: 'USD', type: 'usd', bal: 0 }], customers: [], suppliers: [], sales: [], expenses: [],
  batches: [{ id: 9001, pid: 101, bno: '01', qty: 100, sold: 0, costUsd: 10, date: '2026-09-01', status: 'active' }],
};

async function main() {
  psqlSync(`drop database if exists ${DB}`, 'postgres');
  psqlSync(`create database ${DB} encoding 'UTF8' lc_collate 'C' lc_ctype 'C' template template0`, 'postgres');
  for (const r of ['anon', 'authenticated', 'service_role']) { try { psqlSync(`create role ${r} nologin`, 'postgres'); } catch (_) {} }
  const tmp = path.join(require('os').tmpdir(), 'fw-prelude-ew31.sql'); fs.writeFileSync(tmp, PRELUDE); psqlFile(tmp);
  const full = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
  const cut = full.indexOf('\n-- ────────────────────────────────────────────────────────────────────\n-- 15. 31-migratsiya');
  assert.ok(cut > 0, "schema.sql'da 15-bo'lim (31-migratsiya) bor");
  const pre = path.join(require('os').tmpdir(), 'fw-schema-pre31.sql'); fs.writeFileSync(pre, full.slice(0, cut)); psqlFile(pre);
  psqlSync(`update app_data set data = data || '${JSON.stringify({ settings: { usdUzs: 12000 }, branchStore: { f729: { cashboxes: BRANCH.cashboxes } } })}'::jsonb where id='main'`);
  psqlSync(`insert into app_data_branches (branch_key, data) values ('f729', '${JSON.stringify(BRANCH)}'::jsonb)`);
  psqlFile(path.join(ROOT, 'supabase-migration-27-f4b-ledger-authority.sql'));
  const M31 = path.join(ROOT, 'supabase-migration-31-tahrir-muddati-audit-bildirishnoma.sql');
  psqlFile(M31); psqlFile(M31);
  psqlSync(`select cashbox_apply_ops('f729','seed','manual_in','[{"box":3,"currency":"USD","dir":"in","amount":1000}]'::jsonb)`);

  const out = [];
  const ok = (name, detail) => out.push(['✅', name, detail]);
  const n = (sql) => +psqlSync(sql);
  const sale = (key, local, sell, staff, role, ack) => `select public.sale_checkout_guarded('f729', '${key}', '${JSON.stringify({ localId: local, inv: 'I-' + local, items: [{ pid: 101, qty: 1, sellUsd: sell, costUsd: 0 }], discPct: 0, paidUsd: sell, payType: 'usd', boxId: 3 })}'::jsonb, '[{"box_id":3,"amount_native":${sell},"currency":"USD","box_name":"Dollar"}]'::jsonb, ${staff}, 'S${staff}', '${role}', ${ack})`;

  // 1. Zararli savdo: tasdiqsiz — hech narsa yozilmaydi; bir xil kalit bilan PARALLEL 5 ta tasdiqlangan — bitta savdo, bitta audit
  const r0 = await psqlAsync(sale('ck:loss-0', 'L0', 8, 7, 'seller', false));
  assert.notEqual(r0.code, 0); assert.match(r0.err, /LOSS_ACK_REQUIRED/);
  assert.equal(n(`select count(*) from sales`), 0); assert.equal(n(`select coalesce(sum(qty-sold),0) from batches`), 100);
  const par = await Promise.all([1, 2, 3, 4, 5].map(() => psqlAsync(sale('ck:loss-1', 'L1', 8, 7, 'seller', true))));
  assert.ok(par.every(r => r.code === 0), par.map(r => r.err).join(' | '));
  assert.equal(n(`select count(*) from sales where local_id='L1'`), 1); assert.equal(n(`select coalesce(sum(qty-sold),0) from batches`), 99);
  assert.equal(n(`select count(*) from fw_audit_events where action='loss_sale'`), 1); assert.equal(n(`select count(*) from fw_notifications where kind='loss_sale'`), 1);
  ok("Zararli savdo: tasdiqsiz rad; bir xil kalit — PARALLEL 5 ta", "tasdiqsiz — savdo/ombor/kassa o'zgarmadi; tasdiq bilan — 1 savdo, 1 audit, 1 bildirishnoma, ombor 1 marta kamaydi");

  // 2. Bir savdoga PARALLEL 6 ta tahrir (turli kalit, turli narx) — qator qulfi: hammasi navbat bilan, har biri audit; kassa = jurnal
  psqlSync(sale('ck:ed-1', 'E1', 20, 7, 'seller', false));
  const eds = await Promise.all([21, 22, 23, 24, 25, 26].map((p, i) => psqlAsync(`select public.sale_edit_guarded('f729', 'ed-k${i}', 'E1', 'price', '{"prices":[${p}]}'::jsonb, 7, 'S7', 'seller', false)`)));
  assert.ok(eds.every(r => r.code === 0), eds.map(r => r.err).join(' | '));
  assert.equal(n(`select count(*) from fw_audit_events where action='edit' and entity_id='E1'`), 6);
  const chain = psqlSync(`select string_agg((before->>'totalUsd')||'>'||(after->>'totalUsd'), ',' order by id) from fw_audit_events where action='edit' and entity_id='E1'`).split(',');
  for (let i = 1; i < chain.length; i++) assert.equal(chain[i].split('>')[0], chain[i - 1].split('>')[1], 'har tahrirning «oldingi» qiymati — avvalgisining «yangi» qiymati');
  assert.equal(n(`select count(*) from cashbox_balances b where b.balance <> (select coalesce(sum(case when direction='in' then amount else -amount end),0) from cashbox_ledger l where l.filial=b.filial and l.box_local_id=b.box_local_id)`), 0);
  ok('Bir savdoga PARALLEL 6 ta tahrir', "hammasi ketma-ket (qator qulfi), 6 ta audit — oldingi→yangi zanjiri uzilmagan; kassa qoldig'i = jurnal");

  // 3. Bir xil kalit bilan PARALLEL tahrir — bitta tahrir, bitta audit
  const same = await Promise.all([1, 2, 3, 4].map(() => psqlAsync(`select public.sale_edit_guarded('f729', 'ed-same', 'E1', 'price', '{"prices":[30]}'::jsonb, 7, 'S7', 'seller', false)`)));
  assert.ok(same.every(r => r.code === 0));
  assert.equal(n(`select count(*) from fw_audit_events where op_key='ed-same'`), 1);
  ok('Bir xil kalit — PARALLEL 4 ta tahrir', 'bitta tahrir, bitta audit (takror — natija qaytadi)');

  // 4. Muddat — server vaqti: 8 kun oldingi savdo sotuvchiga yopiq, adminga ochiq; 31 kun — hammaga yopiq; o'chirishda iz qoladi
  psqlSync(`update sales set created_at = now() - interval '8 days', sale_date = (now() - interval '8 days')::date where local_id='E1'`);
  let r = await psqlAsync(`select public.sale_edit_guarded('f729', 'ed-late', 'E1', 'price', '{"prices":[31]}'::jsonb, 7, 'S7', 'seller', false)`);
  assert.notEqual(r.code, 0); assert.match(r.err, /muddati tugagan \(7 kun/);
  r = await psqlAsync(`select public.sale_void_guarded('f729', 'vd-adm', 'E1', '["vb-1"]'::jsonb, '{}'::jsonb, null, 'Admin', 'admin', true)`);
  assert.equal(r.code, 0, r.err);
  assert.equal(psqlSync(`select status from sales where local_id='E1'`), 'voided');
  assert.equal(n(`select count(*) from fw_notifications where audience='seller' and audience_id=7 and kind='sale_void'`), 1);
  ok("Muddat (server vaqti) va o'chirish", "8 kunlik savdo: sotuvchi — rad (7 kun), admin — o'chirdi; yozuv bazada «voided», sotuvchiga bildirishnoma");

  // 5. Audit o'zgarmas (hatto jadval egasi uchun ham trigger to'sadi)
  for (const q of [`update fw_audit_events set note='x'`, `delete from fw_audit_events`, `truncate fw_audit_events`]) {
    const t = await psqlAsync(q); assert.notEqual(t.code, 0); assert.match(t.err, /AUDIT/);
  }
  ok("Audit o'zgarmas", "UPDATE / DELETE / TRUNCATE — rad (trigger), egasi uchun ham");

  // 6. Diller: PARALLEL 8 ta savdo (qoldiq 5) — 5 tasi o'tadi; 10% dan ortiq chegirma — rad
  psqlSync(`insert into auth.users values ('00000000-0000-4000-8000-0000000000d1')`);
  psqlSync(`insert into dealers (id, auth_user_id, login, name, filial) overriding system value values (31, '00000000-0000-4000-8000-0000000000d1', 'd1', 'Diller', 'f729')`);
  psqlSync(`insert into catalog_products (id, filial, sku, name, optim_price) values (101, 'f729', 'A', 'Drel', 20)`);
  psqlSync(`insert into dealer_stock (dealer_id, pid, sku, name, qty, avg_cost_usd) values (31, 101, 'A', 'Drel', 5, 10)`);
  const ds = (p) => `select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000d1', false); select record_dealer_sale(101, 1, ${p}, 'A', 'Drel', 0, null)`;
  r = await psqlAsync(ds(17.5)); assert.notEqual(r.code, 0); assert.match(r.err, /10%/);
  const dpar = await Promise.all([1, 2, 3, 4, 5, 6, 7, 8].map(i => psqlAsync(ds(i % 2 ? 18 : 22))));
  assert.equal(dpar.filter(x => x.code === 0).length, 5);
  assert.equal(n(`select qty from dealer_stock where dealer_id=31`), 0); assert.equal(n(`select debt_usd from dealers where id=31`), 100);
  ok('Diller: 10% chegara va PARALLEL 8 ta savdo (qoldiq 5)', "17.5$ (optom 20$) — rad; parallel — 5 tasi o'tdi, qoldiq 0 (manfiy emas), qarz optom narxda 5 × 20$");

  console.log(`PostgreSQL: ${psqlSync('show server_version', 'postgres')} (lokal sinov bazasi "${DB}", UTF8)`);
  for (const [s, a, b] of out) console.log(`${s} ${a}: ${b}`);
  console.log(`JAMI: ${out.length}/${out.length}`);
}
main().catch((e) => { console.error('❌', e && (e.stack || e.message)); process.exit(1); });
