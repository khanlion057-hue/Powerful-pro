// P126 — 55-migratsiya, HAQIQIY PostgreSQL (PGlite): kirim o'chirilganda ta'minotchi qarzi qaytadi (ulushda);
// aralash to'lovli savdo qaytarilsa — har kassaga o'z ulushi.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PRELUDE } = require('./p8-noldan-ornatish.test.js')._helpers;
const ROOT = path.join(__dirname, '..');
const MIG = ['supabase-migration-51-hisob-tuzatish.sql', 'supabase-migration-54-pul-audit.sql', 'supabase-migration-55-kirim-qarz-aralash.sql'];
async function world() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE);
  await pg.exec(fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8'));
  await pg.query(`update app_data set data = data || '{"settings":{"usdUzs":12500}}'::jsonb where id='main'`);
  for (const m of MIG) await pg.exec(fs.readFileSync(path.join(ROOT, m), 'utf8'));
  await pg.exec(fs.readFileSync(path.join(ROOT, MIG[2]), 'utf8'));   // takror — xavfsiz
  const q = async (s, p) => (await pg.query(s, p)).rows;
  const one = async (s, p) => (await q(s, p))[0];
  const op = async (key, kind, payload) => (await one(`select stock_debt_op('f729', $1, $2, $3::jsonb) as r`, [key, kind, JSON.stringify(payload)])).r;
  const num = async (sql, p) => Number(Object.values((await q(sql, p))[0] || { v: 0 })[0] || 0);
  const suppDebt = (id) => num(`select debt from supplier_balances where filial='f729' and supplier_local_id=$1`, [id]);
  const box = (id) => num(`select balance from cashbox_balances where filial='f729' and box_local_id=$1`, [id]);
  await q(`select cashbox_apply_ops('f729','seed-uzs','manual_in','[{"box":1,"currency":"UZS","dir":"in","amount":10000000}]'::jsonb)`);
  await q(`select cashbox_apply_ops('f729','seed-usd','manual_in','[{"box":3,"currency":"USD","dir":"in","amount":1000}]'::jsonb)`);
  return { pg, q, one, op, suppDebt, box };
}
async function kirimDelete() {
  const w = await world();
  // kirim: 2 partiya (10x$10 va 5x$20), ta'minotchiga $200 qarz
  await w.op('k-1', 'batches_create', { reason: 'kirim', supplier: { id: 7, goodsUsd: 200, givenUsd: 0 },
    batches: [{ localId: 'a1', pid: 301, qty: 10, costUsd: 10 }, { localId: 'a2', pid: 302, qty: 5, costUsd: 20 }] });
  await w.op('k-0', 'batches_create', { reason: 'kirim', supplier: { id: 7, goodsUsd: 50, givenUsd: 0 }, batches: [{ localId: 'b1', pid: 303, qty: 5, costUsd: 10 }] });
  assert.equal(Math.round(await w.suppDebt(7)), 250);
  await w.op('k-2', 'batch_delete', { localIds: ['a1'] });   // yarmi ($100 ulush)
  assert.equal(Math.round(await w.suppDebt(7)), 150, 'bitta partiya — o\'z ulushi qaytdi');
  await w.op('k-3', 'batch_delete', { localIds: ['a2'] });
  assert.equal(Math.round(await w.suppDebt(7)), 50, 'butun kirim o\'chdi — boshqa kirimning qarzi qoladi');
  // konsignatsiya — qarz yo'q, o'chirishda ham tegilmaydi
  await w.op('k-4', 'batches_create', { reason: 'kirim', supplier: { id: 8, consignment: true }, batches: [{ localId: 'c1', pid: 304, qty: 5, costUsd: 10, meta: { goodsUsd: 10 } }] });
  await w.op('k-5', 'batch_delete', { localIds: ['c1'] });
  assert.equal(await w.suppDebt(8), 0);
}
async function mixedReturn() {
  const w = await world();
  await w.op('k-s', 'batches_create', { reason: 'kirim', batches: [{ localId: 's1', pid: 101, qty: 10, costUsd: 40 }] });
  await w.one(`select sale_checkout_v37('f729','s-m1',$1::jsonb,$2::jsonb,null,'Admin','admin',false,null,0,'retail') r`,
    [JSON.stringify({ localId: 'm1', inv: 'M1', items: [{ pid: 101, qty: 1, sellUsd: 100, costUsd: 40 }], paidUsd: 100, payType: 'mixed' }),
     JSON.stringify([{ box_id: 3, amount_native: 20 }, { box_id: 1, amount_native: 1000000 }])]);
  await w.q(`update sales set mixed_rows = '[{"boxId":3,"amount":20},{"boxId":1,"amount":1000000}]'::jsonb where local_id='m1' and (mixed_rows is null or jsonb_array_length(mixed_rows) < 2)`);
  const u0 = await w.box(3), s0 = await w.box(1);
  await w.one(`select sale_return_atomic('f729','ret-m1','m1',101,1,'rb-m1','{}'::jsonb) r`);
  assert.equal(Math.round((u0 - await w.box(3)) * 100) / 100, 20, '$ kassadan $20');
  assert.equal(Math.round(s0 - await w.box(1)), 1000000, 'so\'m kassadan 1 000 000');
}
module.exports = { name: 'P126 — 55-migratsiya: kirim o\'chirish qarzi, aralash qaytarish', cases: [
  { name: 'kirim oʻchirilsa taʼminotchi qarzi ulushda qaytadi; konsignatsiya — tegilmaydi', run: kirimDelete },
  { name: 'aralash toʻlovli savdo qaytarilsa — har kassaga oʻz ulushi', run: mixedReturn },
] };
