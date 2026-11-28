// P117 — 51-migratsiya (hisobchi topgan xatolar), HAQIQIY PostgreSQL (PGlite):
//  1) konsignatsiya — ta'minotchi qarzi sotilganda TOVAR narxidan (goodsUsd), yo'lkira/bojxona emas; eski partiya — avvalgidek;
//  2) savdo o'chirilganda ta'minotchidan to'g'ridan-to'g'ri sotilgan qator omborga qaytmaydi, ta'minotchi qarzi kamayadi;
//  3) o'chirishda so'mdagi kassa va qarz — savdo kunidagi kurs bilan.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PRELUDE } = require('./p8-noldan-ornatish.test.js')._helpers;
const ROOT = path.join(__dirname, '..');

async function world() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE);
  await pg.exec(fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8'));
  await pg.query(`update app_data set data = data || '{"settings":{"usdUzs":12500}}'::jsonb where id='main'`);
  const mig = fs.readFileSync(path.join(ROOT, 'supabase-migration-51-hisob-tuzatish.sql'), 'utf8');
  await pg.exec(mig);
  await pg.exec(mig);   // takror ishga tushirish xavfsiz
  const q = async (s, p) => (await pg.query(s, p)).rows;
  const op = (key, kind, payload) => q(`select stock_debt_op('f729', $1, $2, $3::jsonb) as r`, [key, kind, JSON.stringify(payload)]);
  const sell = (key, sale) => q(`select sale_checkout_atomic_v3('f729', $1, $2::jsonb, '[]'::jsonb) as r`, [key, JSON.stringify(sale)]);
  const suppDebt = async (id) => Number(((await q(`select debt from supplier_balances where filial='f729' and supplier_local_id=$1`, [id]))[0] || {}).debt || 0);
  return { pg, q, op, sell, suppDebt };
}

async function consignment() {
  const w = await world();
  // tannarx 12.066 (yo'lkira+bank+bojxona bilan), tovar narxi 10
  await w.op('k-c1', 'batches_create', { reason: 'kirim', supplier: { id: 5, consignment: true, goodsUsd: 1000 },
    batches: [{ localId: 'c1', pid: 101, qty: 100, costUsd: 12.066, meta: { goodsUsd: 10 } }] });
  await w.op('k-c2', 'batches_create', { reason: 'kirim', supplier: { id: 6, consignment: true },
    batches: [{ localId: 'c2', pid: 102, qty: 5, costUsd: 7 }] });   // eski uslub — goodsUsd yo'q
  await w.sell('s-c1', { localId: 'sc1', inv: 'I-c1', items: [{ pid: 101, qty: 10, sellUsd: 20, costUsd: 12.066 }], paidUsd: 0 });
  await w.sell('s-c2', { localId: 'sc2', inv: 'I-c2', items: [{ pid: 102, qty: 2, sellUsd: 9, costUsd: 7 }], paidUsd: 0 });
  assert.equal(Math.round(await w.suppDebt(5) * 100) / 100, 100, 'konsignatsiya qarzi = 10 dona × $10 tovar narxi (120.66 emas)');
  assert.equal(Math.round(await w.suppDebt(6) * 100) / 100, 14, 'goodsUsd yo\'q eski partiya — avvalgidek tannarxdan');
}

async function voidDirectAndRate() {
  const w = await world();
  // to'g'ridan-to'g'ri (ta'minotchidan) savdo: omborda yo'q tovar
  await w.sell('s-d1', { localId: 'sd1', inv: 'I-d1', items: [{ pid: 201, qty: 1, sellUsd: 50, costUsd: 40, directSupply: true, suppId: 7 }], paidUsd: 0 });
  assert.equal(await w.suppDebt(7), 40, 'sotilganda ta\'minotchiga $40 qarz');
  const rate = (await w.q(`select rate_usd_uzs from sales where local_id='sd1'`))[0].rate_usd_uzs;
  assert.equal(Number(rate), 12500, 'savdoga o\'sha kungi kurs yozildi');
  // kurs o'zgaradi, keyin savdo o'chiriladi
  await w.pg.query(`update app_data set data = jsonb_set(data, '{settings,usdUzs}', '12800') where id='main'`);
  await w.q(`select sale_void_atomic('f729', 'v-d1', 'sd1', '["vb1"]'::jsonb, '{}'::jsonb) as r`);
  const stock = await w.q(`select count(*)::int n from batches where filial='f729' and pid=201`);
  assert.equal(stock[0].n, 0, 'to\'g\'ridan-to\'g\'ri savdo o\'chirilganda omborga soxta qoldiq qo\'shilmadi');
  assert.equal(await w.suppDebt(7), 0, 'ta\'minotchi qarzi qaytarildi');
  // oddiy savdo: qarzga — o'chirishda mijoz qarzi savdo kunidagi kurs bilan kamayadi
  await w.op('k-o1', 'batches_create', { reason: 'kirim', batches: [{ localId: 'o1', pid: 301, qty: 5, costUsd: 10 }] });
  await w.pg.query(`update app_data set data = jsonb_set(data, '{settings,usdUzs}', '12500') where id='main'`);
  await w.sell('s-o1', { localId: 'so1', inv: 'I-o1', custId: 9, items: [{ pid: 301, qty: 1, sellUsd: 100, costUsd: 10 }], paidUsd: 0 });
  const before = Number(((await w.q(`select debt from customer_balances where filial='f729' and customer_local_id=9`))[0] || {}).debt || 0);
  await w.pg.query(`update app_data set data = jsonb_set(data, '{settings,usdUzs}', '13000') where id='main'`);
  await w.q(`select sale_void_atomic('f729', 'v-o1', 'so1', '["vb2"]'::jsonb, '{}'::jsonb) as r`);
  const after = Number(((await w.q(`select debt from customer_balances where filial='f729' and customer_local_id=9`))[0] || {}).debt || 0);
  assert.equal(before, 1250000, 'qarz savdo kunidagi kursda yozilgan');
  assert.equal(after, 0, 'o\'chirishda aynan shu summa qaytdi (kurs o\'zgargan bo\'lsa ham)');
  const back = await w.q(`select qty::numeric from batches where filial='f729' and pid=301 and local_id='vb2'`);
  assert.equal(Number(back[0].qty), 1, 'oddiy savdo o\'chirilganda tovar omborga qaytadi (avvalgidek)');
}

async function resetWithKirim() {
  const w = await world();
  for (const m of ['supabase-migration-49-sinov-tozalash.sql', 'supabase-migration-53-tozalash-kirim.sql']) await w.pg.exec(fs.readFileSync(path.join(ROOT, m), 'utf8'));
  await w.op('k-r1', 'batches_create', { reason: 'kirim', batches: [{ localId: 'r1', pid: 401, qty: 5, costUsd: 3 }] });
  await w.sell('s-r1', { localId: 'sr1', inv: 'I-r1', items: [{ pid: 401, qty: 2, sellUsd: 5, costUsd: 3 }], paidUsd: 0 });
  const dry = (await w.q(`select fw_trial_reset_kirim(true) r`))[0].r;
  assert.equal(dry.batches, 1);
  await w.q(`select fw_trial_reset(false)`); await w.q(`select fw_trial_reset_kirim(false)`);
  const n = (await w.q(`select (select count(*)::int from batches) b, (select count(*)::int from stock_ledger) l, (select count(*)::int from sales) s`))[0];
  assert.deepEqual(n, { b: 0, l: 0, s: 0 }, 'kirimlar ham, jurnal ham, savdo ham — 0');
}
module.exports = { name: 'P117 — 51-migratsiya: konsignatsiya, oʻchirish, kurs', cases: [
  { name: 'konsignatsiya qarzi tovar narxidan; eski partiya avvalgidek', run: consignment },
  { name: 'savdo oʻchirish: toʻgʻridan-toʻgʻri qator omborga qaytmaydi, taʼminotchi qarzi kamayadi; savdo kunidagi kurs', run: voidDirectAndRate },
  { name: '53: kirimlar bilan tozalash — ombor 0', run: resetWithKirim },
] };
