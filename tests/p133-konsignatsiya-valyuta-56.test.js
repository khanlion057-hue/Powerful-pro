// P133 — 56-migratsiya, HAQIQIY PostgreSQL (PGlite), prod yo'li sale_checkout_v37:
//  so'mda bergan ta'minotchi — konsignatsiya sotilganda qarz AYNAN bergan so'm narxi x son (kurs o'zgarsa ham);
//  $ da bergan ta'minotchi — avvalgidek $ da; kurs yangilanganda so'mdagi partiya tannarxi va tovar narxi $ da qayta hisoblanadi.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PRELUDE } = require('./p8-noldan-ornatish.test.js')._helpers;
const ROOT = path.join(__dirname, '..');
const MIG = ['supabase-migration-51-hisob-tuzatish.sql', 'supabase-migration-54-pul-audit.sql', 'supabase-migration-55-kirim-qarz-aralash.sql',
  'supabase-migration-56-konsignatsiya-valyuta.sql'];

async function world() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE);
  await pg.exec(fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8'));
  await pg.query(`update app_data set data = data || '{"settings":{"usdUzs":12650}}'::jsonb where id='main'`);
  for (const m of MIG) await pg.exec(fs.readFileSync(path.join(ROOT, m), 'utf8'));
  await pg.exec(fs.readFileSync(path.join(ROOT, MIG[3]), 'utf8'));   // takror — xavfsiz
  const q = async (s, p) => (await pg.query(s, p)).rows;
  const one = async (s, p) => (await q(s, p))[0];
  const op = async (key, kind, payload) => (await one(`select stock_debt_op('f729', $1, $2, $3::jsonb) as r`, [key, kind, JSON.stringify(payload)])).r;
  const v37 = async (key, sale, box = []) => (await one(`select sale_checkout_v37('f729', $1, $2::jsonb, $3::jsonb, null, 'Admin', 'admin', false, null, 0, 'retail') r`,
    [key, JSON.stringify(sale), JSON.stringify(box)])).r;
  const setRate = (r) => pg.query(`update app_data set data = jsonb_set(data, '{settings,usdUzs}', $1::jsonb) where id='main'`, [String(r)]);
  const supp = async (id) => one(`select debt::numeric d, debt_uzs::numeric u, currency c from supplier_balances where filial='f729' and supplier_local_id=$1`, [id]);
  await q(`select cashbox_apply_ops('f729','seed-uzs','manual_in','[{"box":1,"currency":"UZS","dir":"in","amount":100000000}]'::jsonb)`);
  return { pg, q, one, op, v37, setRate, supp };
}

async function somExact() {
  const w = await world();
  // ALTECO (9) — so'mdagi ta'minotchi
  await w.q(`select supp_set_currency('f729', 9, 'UZS', null, 'Admin')`);
  const som = 2595800, rate = 12650, usd = Math.round(som / rate * 10000) / 10000;
  await w.op('kirim-alteco-1', 'batches_create', { reason: 'import', supplier: { id: 9, consignment: true, goodsUsd: usd * 5 },
    batches: [{ localId: 'al1', pid: 501, qty: 5, costUsd: usd, meta: { goodsUsd: usd, consignment: true, cur: 'USD', rateUsdUzs: rate } }] });
  assert.equal(Number((await w.supp(9)).u || 0), 0, 'konsignatsiya — sotilmaguncha qarz yo\'q');
  // aniq so'm narxini belgilash (Excel'dagi qiymat)
  await w.q(`select batch_acc_uzs('f729', $1::jsonb, false)`, [JSON.stringify([{ id: 'al1', costUzs: som, goodsUzs: som }])]);
  const b = await w.one(`select cost_uzs::numeric cu, goods_uzs::numeric gu, consignment, supp_id from batches where local_id='al1'`);
  assert.deepEqual([Number(b.cu), Number(b.gu), b.consignment, Number(b.supp_id)], [som, som, true, 9]);
  // kurs o'zgardi, keyin 2 dona sotildi
  await w.setRate(13000);
  await w.q(`select batch_acc_uzs('f729', '[]'::jsonb, true)`);
  await w.v37('s-al-1', { localId: 'sal1', inv: 'AL1', items: [{ pid: 501, qty: 2, sellUsd: 240, costUsd: som / 13000 }], paidUsd: 480, payType: 'cash_uzs', boxId: 1 },
    [{ box_id: 1, amount_native: 480 * 13000 }]);
  const s = await w.supp(9);
  assert.equal(s.c, 'UZS');
  assert.equal(Number(s.u), 2 * som, `qarz aniq 2 x ${som} so'm (kurs 13000 bo'lsa ham), bo'ldi: ${s.u}`);
  // yana 1 dona — boshqa kursda
  await w.setRate(12000);
  await w.v37('s-al-2', { localId: 'sal2', inv: 'AL2', items: [{ pid: 501, qty: 1, sellUsd: 240, costUsd: som / 12000 }], paidUsd: 240, payType: 'cash_uzs', boxId: 1 },
    [{ box_id: 1, amount_native: 240 * 12000 }]);
  { const z = await w.supp(9); const l = await w.q(`select * from supplier_debt_ledger where supplier_local_id=9 order by id`); assert.equal(Number(z.u), 3 * som, 'jami 3 dona: ' + JSON.stringify([z, l])); }
}

async function usdUnchanged() {
  const w = await world();
  // $ da bergan konsignatsiya ta'minotchisi (10) — qarz $ da, kurs ta'sir qilmaydi
  await w.op('kirim-usd-1', 'batches_create', { reason: 'kirim', supplier: { id: 10, consignment: true, goodsUsd: 0 },
    batches: [{ localId: 'us1', pid: 601, qty: 4, costUsd: 50, meta: { goodsUsd: 50, consignment: true } }] });
  await w.setRate(13500);
  await w.v37('s-us-1', { localId: 'sus1', inv: 'US1', items: [{ pid: 601, qty: 3, sellUsd: 70, costUsd: 50 }], paidUsd: 210, payType: 'cash_uzs', boxId: 1 },
    [{ box_id: 1, amount_native: 210 * 13500 }]);
  const s = await w.supp(10);
  assert.equal(Number(s.d), 150, '$ ta\'minotchi: 3 x $50');
  assert.notEqual(s.c, 'UZS');
}

async function repriceAndLegacy() {
  const w = await world();
  // so'mdagi partiya: kurs o'zgarganda tannarx va tovar narxi $ da qayta hisoblanadi, so'mda o'zgarmaydi
  await w.op('kirim-r-1', 'batches_create', { reason: 'import', batches: [{ localId: 'r1', pid: 701, qty: 2, costUsd: 100, meta: { goodsUsd: 100 } }] });
  await w.q(`select batch_acc_uzs('f729', $1::jsonb, false)`, [JSON.stringify([{ id: 'r1', costUzs: 1300000, goodsUzs: 1300000 }])]);
  await w.setRate(13000);
  await w.q(`select batch_acc_uzs('f729', '[]'::jsonb, true)`);
  const b = await w.one(`select cost_usd::numeric c, goods_usd::numeric g, cost_uzs::numeric cu from batches where local_id='r1'`);
  assert.deepEqual([Number(b.c), Number(b.g), Number(b.cu)], [100, 100, 1300000]);
  // eski shakl (["localId"]) — avvalgidek ishlaydi
  await w.op('kirim-r-2', 'batches_create', { reason: 'import', batches: [{ localId: 'r2', pid: 702, qty: 1, costUsd: 10, meta: { rateUsdUzs: 13000 } }] });
  await w.q(`select batch_acc_uzs('f729', '["r2"]'::jsonb, false)`);
  assert.equal(Number((await w.one(`select cost_uzs::numeric cu from batches where local_id='r2'`)).cu), 130000);
}

module.exports = { name: '56-migratsiya — konsignatsiya ta\'minotchi valyutasida aniq', cases: [
  { name: "so'mda bergan ta'minotchi: sotilganda qarz aynan so'm narxi x son, kurs o'zgarsa ham", run: somExact },
  { name: "$ da bergan ta'minotchi: qarz $ da, kursga bog'liq emas", run: usdUnchanged },
  { name: "so'mdagi partiya: kurs yangilanganda $ tannarx/tovar narxi qayta hisoblanadi; eski belgilash shakli ishlaydi", run: repriceAndLegacy },
] };
