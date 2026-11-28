// P122 — v25.6.10: eski sana HAQIQIY PostgreSQL'da (PGlite) — prod ishlatadigan funksiyalar orqali:
//  savdo (sale_checkout_v37) va kirim (stock_debt_op batches_create) bazaga aynan tanlangan sana bilan yoziladi.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PRELUDE } = require('./p8-noldan-ornatish.test.js')._helpers;
const ROOT = path.join(__dirname, '..');
async function run() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE);
  await pg.exec(fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8'));
  await pg.exec(fs.readFileSync(path.join(ROOT, 'supabase-migration-51-hisob-tuzatish.sql'), 'utf8'));
  await pg.query(`update app_data set data = data || '{"settings":{"usdUzs":12500}}'::jsonb where id='main'`);
  const q = async (s, p) => (await pg.query(s, p)).rows;
  const old = '2026-10-05';
  await q(`select stock_debt_op('f729', 'k-bd1', 'batches_create', $1::jsonb) r`, [JSON.stringify({ reason: 'kirim',
    batches: [{ localId: 'b1', pid: 501, qty: 10, costUsd: 4, meta: { date: old, bno: 'P01' } }] })]);
  const b = (await q(`select batch_date::text d, arrived_at::text a from batches where local_id='b1'`))[0];
  assert.equal(b.d, old, 'kirim sanasi bazada — tanlangan eski sana'); assert.equal(b.a, old);
  const sale = { localId: 'sb1', inv: 'I-bd1', items: [{ pid: 501, qty: 2, sellUsd: 6, costUsd: 4 }], paidUsd: 0, custId: 3, saleDate: '2026-10-07' };
  await q(`select sale_checkout_v37('f729', 'k-sb1', $1::jsonb, '[]'::jsonb, null, 'Admin', 'admin') r`, [JSON.stringify(sale)]);
  const s = (await q(`select sale_date::text d from sales where local_id='sb1'`))[0];
  assert.equal(s.d, '2026-10-07', 'savdo sanasi bazada — tanlangan eski sana (prod funksiyasi v37)');
  const s2 = { ...sale, localId: 'sb2', inv: 'I-bd2', saleDate: undefined };
  await q(`select sale_checkout_v37('f729', 'k-sb2', $1::jsonb, '[]'::jsonb, null, 'Admin', 'admin') r`, [JSON.stringify(s2)]);
  assert.equal((await q(`select (sale_date = (now() at time zone 'Asia/Tashkent')::date) ok from sales where local_id='sb2'`))[0].ok, true, 'sanasiz — bugun');
}
module.exports = { name: 'P122 — Eski sana bazada (PGlite)', cases: [{ name: 'kirim va savdo tanlangan sana bilan yoziladi (v37, stock_debt_op)', run }] };
