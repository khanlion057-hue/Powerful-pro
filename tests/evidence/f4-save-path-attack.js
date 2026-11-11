// DALIL SKRIPTI (npm test'ga kirmaydi): F4 — brauzer saqlash yo'li (app-data-branch-save /
// app-data-save) orqali kassa qoldig'ini o'zgartirishga urinish. Berilgan loyiha papkasidagi
// HAQIQIY server kodi + HAQIQIY PostgreSQL (PGlite) bilan ishga tushadi.
//   node tests/evidence/f4-save-path-attack.js [loyiha_papkasi]
// v9 da: brauzer yuborgan har qanday qoldiq saqlanadi. v11 da: bazadagi qoldiq qoladi.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..', '..'));
const { makePgSupabase } = require(path.join(__dirname, '..', 'helpers', 'pg-supabase.js'));
const { loadFunction, unloadFunctions, post } = require(path.join(__dirname, '..', 'helpers', 'mem-supabase.js'));
const PRELUDE = `
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema extensions; create schema auth; create schema storage;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text, name text);
alter table storage.objects enable row level security;`;
const BOXES = [{ id: 1, name: "Naqd So'm", cur: 'UZS', type: 'cash', bal: 1200000 }, { id: 3, name: 'Dollar', cur: 'USD', type: 'usd', bal: 300 }];

(async () => {
  const { PGlite } = await import(require.resolve('@electric-sql/pglite', { paths: [ROOT, __dirname] }));
  const { pgcrypto } = await import(require.resolve('@electric-sql/pglite/contrib/pgcrypto', { paths: [ROOT, __dirname] }));
  const { uuid_ossp } = await import(require.resolve('@electric-sql/pglite/contrib/uuid_ossp', { paths: [ROOT, __dirname] }));
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE);
  await pg.exec(fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8'));
  await pg.query(`update app_data set data = data || $1::jsonb where id='main'`, [JSON.stringify({ settings: { usdUzs: 12000 }, branchStore: { f729: { cashboxes: BOXES } } })]);
  await pg.query(`insert into app_data_branches (branch_key, data) values ('f729', $1::jsonb)`, [JSON.stringify({ cashboxes: BOXES })]);
  const mig = path.join(ROOT, 'supabase-migration-24-v11-cash-authority.sql');
  if (fs.existsSync(mig)) await pg.exec(fs.readFileSync(mig, 'utf8'));
  const memTables = {
    staff: [{ id: 7, auth_user_id: 'u-kas', role: 'sotuvchi', active: true, filial: 'f729', name: 'Kassir', login: 'kas' }],
    staff_roles: [{ staff_id: 7, role_id: 'r' }],
    role_permissions: ['kassalar.transact', 'savdo.create'].map(k => ({ role_id: 'r', permission_id: k, permissions: { key: k } })),
    staff_audit_log: [], idempotency_keys: [],
  };
  const client = makePgSupabase(pg, { pgTables: ['app_data', 'app_data_branches', 'cashbox_balances', 'cashbox_ledger'], memTables, users: { t: { id: 'u-kas' } } });
  // loadFunction loyiha ildizini helper joylashuvidan oladi — shu sababli helper'ni o'sha papkadan chaqiramiz
  const h = require(path.join(ROOT, 'tests', 'helpers', 'mem-supabase.js')).loadFunction('app-data-branch-save', client);
  const stored = async () => (await pg.query(`select data->'cashboxes' c from app_data_branches where branch_key='f729'`)).rows[0].c.map(b => `${b.id}:${b.bal}`).join(' ');
  const attacks = [
    ['brauzer boshqa qoldiq yuboradi', BOXES.map(b => ({ ...b, bal: b.bal + 5000 }))],
    ['juda katta qoldiq', BOXES.map(b => ({ ...b, bal: 1e15 }))],
    ['manfiy qoldiq', BOXES.map(b => ({ ...b, bal: -999 }))],
  ];
  console.log(`Loyiha: ${ROOT}\n24-migratsiya: ${fs.existsSync(mig) ? 'bor' : "YO'Q"}`);
  for (const [name, boxes] of attacks) {
    const r = await h({ httpMethod: 'POST', headers: { authorization: 'Bearer t' }, body: JSON.stringify({ branchKey: 'f729', data: { cashboxes: boxes } }) });
    console.log(`- ${name.padEnd(32)} → HTTP ${r.statusCode}; saqlangan qoldiq: ${await stored()}`);
  }
  await pg.close();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
