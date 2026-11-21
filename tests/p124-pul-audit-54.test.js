// P124 — 54-migratsiya (pul auditi), HAQIQIY PostgreSQL (PGlite), prod yo'li sale_checkout_v37:
//  qarzi to'langan savdo qaytarilsa/o'chirilsa — pul haqqa; haqdan to'langan savdo qaytarilsa — haqqa; konsignatsiya tahriri;
//  sotilgan partiyani o'chirish rad; arzon mahsulot chegirma chegarasi; narx tahririda foyda va savdo kunidagi kurs.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PRELUDE } = require('./p8-noldan-ornatish.test.js')._helpers;
const ROOT = path.join(__dirname, '..');
const MIG = ['supabase-migration-51-hisob-tuzatish.sql', 'supabase-migration-54-pul-audit.sql'];

async function world() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE);
  await pg.exec(fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8'));
  await pg.query(`update app_data set data = data || '{"settings":{"usdUzs":12500}}'::jsonb where id='main'`);
  for (const m of MIG) await pg.exec(fs.readFileSync(path.join(ROOT, m), 'utf8'));
  await pg.exec(fs.readFileSync(path.join(ROOT, MIG[1]), 'utf8'));   // takror — xavfsiz
  const q = async (s, p) => (await pg.query(s, p)).rows;
  const one = async (s, p) => (await q(s, p))[0];
  const op = async (key, kind, payload) => (await one(`select stock_debt_op('f729', $1, $2, $3::jsonb) as r`, [key, kind, JSON.stringify(payload)])).r;
  const v37 = async (key, sale, box = [], role = 'admin', credit = 0) => (await one(`select sale_checkout_v37('f729', $1, $2::jsonb, $3::jsonb, null, 'Admin', $4, false, null, $5, 'retail') r`,
    [key, JSON.stringify(sale), JSON.stringify(box), role, credit])).r;
  const setRate = (r) => pg.query(`update app_data set data = jsonb_set(data, '{settings,usdUzs}', $1::jsonb) where id='main'`, [String(r)]);
  const num = async (sql, p) => Number(Object.values((await q(sql, p))[0] || { v: 0 })[0] || 0);
  const custDebt = (id) => num(`select debt from customer_balances where filial='f729' and customer_local_id=$1`, [id]);
  const credit = (id) => num(`select credit_uzs from customer_credit_balances where filial='f729' and customer_local_id=$1`, [id]);
  const suppDebt = (id) => num(`select debt from supplier_balances where filial='f729' and supplier_local_id=$1`, [id]);
  const box = (id) => num(`select balance from cashbox_balances where filial='f729' and box_local_id=$1`, [id]);
  await q(`select cashbox_apply_ops('f729','seed-uzs','manual_in','[{"box":1,"currency":"UZS","dir":"in","amount":10000000}]'::jsonb)`);
  await q(`select cashbox_apply_ops('f729','seed-usd','manual_in','[{"box":3,"currency":"USD","dir":"in","amount":1000}]'::jsonb)`);
  await op('k-seed', 'batches_create', { reason: 'kirim', batches: [{ localId: 'b1', pid: 101, qty: 100, costUsd: 40 }] });
  return { pg, q, one, op, v37, setRate, custDebt, credit, suppDebt, box };
}

async function paidDebtReturn() {
  const w = await world();
  const pay = (key) => w.q(`select cash_payment_atomic_v2('f729',$1,'cust_debt_pay','[{"box":1,"currency":"UZS","dir":"in","amount":1250000}]'::jsonb,'customer_debt_payment','{"customer_local_id":11,"customer_name":"X","amount_uzs":1250000,"box_local_id":1}'::jsonb,null,'Admin') r`, [key]);
  // qaytarish
  await w.v37('s-t3', { localId: 't3', inv: 'T3', custId: 11, items: [{ pid: 101, qty: 1, sellUsd: 100, costUsd: 40 }], paidUsd: 0, payType: 'debt' });
  assert.equal(await w.custDebt(11), 1250000);
  await pay('pay-1'); assert.equal(await w.custDebt(11), 0);
  await w.one(`select sale_return_atomic('f729','ret-t3','t3',101,1,'rb3','{}'::jsonb) r`);
  assert.equal(await w.custDebt(11), 0, 'qarz manfiy emas');
  assert.equal(await w.credit(11), 1250000, 'to\'langan pul mijoz haqiga qaytdi (avval yo\'qolardi)');
  // o'chirish (void)
  await w.v37('s-t3b', { localId: 't3b', inv: 'T3b', custId: 11, items: [{ pid: 101, qty: 1, sellUsd: 100, costUsd: 40 }], paidUsd: 0, payType: 'debt' });
  await pay('pay-2');
  await w.q(`select sale_void_v34('f729','v-t3b','t3b','["vb3"]'::jsonb,'{}'::jsonb,null,'Admin','admin',true)`);
  assert.equal(await w.credit(11), 2500000, 'o\'chirishda ham — haqqa');
  // qarzning yarmi to'langan: qolgan qarz kamayadi, to'langan qismi haqqa
  await w.v37('s-t3c', { localId: 't3c', inv: 'T3c', custId: 12, items: [{ pid: 101, qty: 2, sellUsd: 100, costUsd: 40 }], paidUsd: 0, payType: 'debt' });
  await w.q(`select cash_payment_atomic_v2('f729','pay-3','cust_debt_pay','[{"box":1,"currency":"UZS","dir":"in","amount":1250000}]'::jsonb,'customer_debt_payment','{"customer_local_id":12,"customer_name":"Y","amount_uzs":1250000,"box_local_id":1}'::jsonb,null,'Admin') r`);
  await w.q(`select sale_void_v34('f729','v-t3c','t3c','["vb4"]'::jsonb,'{}'::jsonb,null,'Admin','admin',true)`);
  assert.deepEqual([await w.custDebt(12), await w.credit(12)], [0, 1250000], 'qolgan qarz yopildi, to\'langani haqqa');
}

async function creditPaidReturn() {
  const w = await world();
  await w.q(`select public._cust_credit_move('f729', 12, 1250000, 'overpay', 'seed-cr', 'sale', 'X', 'seed', null, null)`);
  await w.v37('s-t4', { localId: 't4', inv: 'T4', custId: 12, items: [{ pid: 101, qty: 1, sellUsd: 100, costUsd: 40 }], paidUsd: 100, payType: 'credit' }, [], 'admin', 1250000);
  assert.equal(await w.credit(12), 0);
  const b0 = await w.box(1);
  await w.one(`select sale_return_atomic('f729','ret-t4','t4',101,1,'rb4','{}'::jsonb) r`);
  assert.equal(await w.credit(12), 1250000, 'haqdan to\'langan savdo qaytarilsa — haqqa qaytadi');
  assert.equal(await w.box(1), b0, 'kassa o\'zgarmaydi');
}

async function batches() {
  const w = await world();
  // sotilgan partiyani o'chirish — rad
  await w.op('k-a1', 'batches_create', { reason: 'kirim', supplier: { id: 7, goodsUsd: 100, givenUsd: 0 }, batches: [{ localId: 'a1', pid: 301, qty: 10, costUsd: 10 }] });
  await w.v37('s-a1', { localId: 'sa1', inv: 'A1', items: [{ pid: 301, qty: 4, sellUsd: 15, costUsd: 10 }], paidUsd: 60, payType: 'usd' }, [{ box_id: 3, amount_native: 60 }]);
  await assert.rejects(() => w.op('k-a2', 'batch_delete', { localIds: ['a1'] }), /sotilgan/);
  await w.op('k-a3', 'batches_create', { reason: 'kirim', batches: [{ localId: 'a3', pid: 302, qty: 5, costUsd: 10 }] });
  await w.op('k-a4', 'batch_delete', { localIds: ['a3'] });   // sotilmagan — o'chadi
  assert.equal((await w.one(`select status from batches where local_id='a3'`)).status, 'deleted');
  // konsignatsiya tahriri — qarz darhol yozilmaydi, sotilganda tovar narxidan
  await w.op('k-b1', 'batches_create', { reason: 'kirim', supplier: { id: 8, consignment: true }, batches: [{ localId: 'cb1', pid: 303, qty: 10, costUsd: 10, meta: { goodsUsd: 10 } }] });
  await w.op('k-b2', 'batch_edit', { edits: [{ localId: 'cb1', qty: 12, costUsd: 11 }] });
  assert.equal(await w.suppDebt(8), 0, 'konsignatsiya — sotilmaguncha qarz yo\'q');
  await w.v37('s-b1', { localId: 'sb1', inv: 'B1', items: [{ pid: 303, qty: 12, sellUsd: 15, costUsd: 11 }], paidUsd: 180, payType: 'usd' }, [{ box_id: 3, amount_native: 180 }]);
  assert.equal(Math.round(await w.suppDebt(8)), 120, 'sotilgandan keyin 12 x $10 (avval 152 — ikki marta)');
}

async function cheapAndEdit() {
  const w = await world();
  // arzon mahsulot: tannarx $0.40, ustama 25% → ro'yxat narxi $0.50 — sotuvchi sota oladi
  await w.q(`update app_data set data = jsonb_set(data, '{products}', '[{"id":401,"sku":"C","name":"Mix","markupPct":25}]'::jsonb) where id='main'`);
  await w.op('k-c1', 'batches_create', { reason: 'kirim', batches: [{ localId: 'c1', pid: 401, qty: 100, costUsd: 0.4 }] });
  await w.v37('s-c1', { localId: 'sc1', inv: 'C1', items: [{ pid: 401, qty: 5, sellUsd: 0.5, costUsd: 0.4 }], paidUsd: 2.5, payType: 'usd' }, [{ box_id: 3, amount_native: 2.5 }], 'seller');
  await assert.rejects(() => w.v37('s-c2', { localId: 'sc2', inv: 'C2', items: [{ pid: 401, qty: 5, sellUsd: 0.3, costUsd: 0.4 }], paidUsd: 1.5, payType: 'usd' }, [{ box_id: 3, amount_native: 1.5 }], 'seller'), /DISCOUNT_LIMIT/, 'haddan past — rad');
  // narx tahriri: foyda qayta hisoblanadi; kassa savdo kunidagi kurs bilan
  await w.v37('s-e1', { localId: 'e1', inv: 'E1', items: [{ pid: 101, qty: 1, sellUsd: 100, costUsd: 40 }], paidUsd: 100, payType: 'cash_uzs', boxId: 1 }, [{ box_id: 1, amount_native: 1250000 }]);
  await w.setRate(13000);
  const b0 = await w.box(1);
  await w.q(`select sale_edit_atomic('f729','ed-e1','e1','price','{"prices":[90]}'::jsonb) r`);
  const s = await w.one(`select profit_usd::numeric p, total_usd::numeric t from sales where local_id='e1'`);
  assert.equal(Number(s.p), 50, 'foyda 90 - 40 = 50 (avval 60 qolardi)');
  assert.equal(b0 - await w.box(1), 125000, 'kassadan $10 x 12 500 (savdo kunidagi kurs), 130 000 emas');
}

module.exports = { name: 'P124 — 54-migratsiya: pul auditi', cases: [
  { name: 'qarzi toʻlangan savdo qaytarilsa/oʻchirilsa — pul mijoz haqiga', run: paidDebtReturn },
  { name: 'haqdan toʻlangan savdo qaytarilsa — haqqa', run: creditPaidReturn },
  { name: 'sotilgan partiya oʻchmaydi; konsignatsiya tahriri qarzni ikki marta yozmaydi', run: batches },
  { name: 'arzon mahsulot chegarasi sentda; narx tahririda foyda va savdo kunidagi kurs', run: cheapAndEdit },
] };
