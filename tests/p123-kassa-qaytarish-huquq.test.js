// P123 — v25.6.10 (pul auditi): sotuvchi kassani va qaytarishni suiiste'mol qila olmaydi (haqiqiy handler + PGlite)
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const { PRELUDE } = require('./p8-noldan-ornatish.test.js')._helpers;
const { makePgSupabase } = require('./helpers/pg-supabase');
const { loadFunction, post } = require('./helpers/mem-supabase');
const PG_TABLES = ['app_data', 'app_data_branches', 'cashbox_balances', 'cashbox_ledger', 'firma_kassa_balance', 'firma_kassa_ledger',
  'sales', 'batches', 'customer_balances', 'supplier_balances', 'customer_debt_payments', 'supplier_payments', 'home_withdrawals',
  'idempotency_keys', 'ledger_ops', 'customer_debt_ledger', 'supplier_debt_ledger', 'stock_ledger',
  'fw_audit_events', 'fw_notifications', 'fw_dealer_revisions', 'dealers', 'dealer_stock', 'dealer_stock_moves', 'dealer_sales',
  'customer_credit_balances', 'customer_credit_ledger', 'sale_credit_uses'];
const BOXES = [{ id: 1, name: "Naqd So'm", cur: 'UZS', type: 'cash', bal: 0 }, { id: 3, name: 'Dollar', cur: 'USD', type: 'usd', bal: 0 }];
async function run() {
  const { PGlite } = await import(ROOT + '/node_modules/@electric-sql/pglite/dist/index.js');
  const { pgcrypto } = await import(ROOT + '/node_modules/@electric-sql/pglite/dist/contrib/pgcrypto.js');
  const { uuid_ossp } = await import(ROOT + '/node_modules/@electric-sql/pglite/dist/contrib/uuid_ossp.js');
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE);
  await pg.exec(fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8'));
  await pg.exec(fs.readFileSync(path.join(ROOT, 'supabase-migration-51-hisob-tuzatish.sql'), 'utf8'));
  await pg.query(`update app_data set data = data || $1::jsonb where id='main'`, [JSON.stringify({ settings: { usdUzs: 12500 }, products: [{ id: 101, sku: 'A', name: 'Drel', markupPct: 25 }], branchStore: { f729: { cashboxes: BOXES } } })]);
  await pg.query(`insert into app_data_branches (branch_key, data) values ('f729', $1::jsonb)`, [JSON.stringify({ cashboxes: BOXES, customers: [], suppliers: [], batches: [], sales: [] })]);
  await pg.query(`select cashbox_apply_ops('f729','seed-uzs','manual_in','[{"box":1,"currency":"UZS","dir":"in","amount":10000000}]'::jsonb)`);
  await pg.query(`select cashbox_apply_ops('f729','seed-usd','manual_in','[{"box":3,"currency":"USD","dir":"in","amount":1000}]'::jsonb)`);
  await pg.query(`select stock_debt_op('f729','k-seed','batches_create','{"reason":"kirim","batches":[{"localId":"b1","pid":101,"qty":100,"costUsd":40}]}'::jsonb)`);
  const memTables = {
    staff: [{ id: 1, auth_user_id: 'u-admin', role: 'admin', active: true, filial: 'baza', name: 'Admin', login: 'admin' },
            { id: 7, auth_user_id: 'u-s1', role: 'sotuvchi', active: true, filial: 'f729', name: 'Sotuvchi', login: 's1' },
            { id: 8, auth_user_id: 'u-s2', role: 'sotuvchi', active: true, filial: 'f729', name: 'Kassir', login: 's2' }],
    staff_roles: [{ staff_id: 7, role_id: 'sel' }, { staff_id: 8, role_id: 'ret' }],
    role_permissions: [{ role_id: 'sel', permission_id: 'savdo.create', permissions: { key: 'savdo.create' } },
      { role_id: 'ret', permission_id: 'savdo.create', permissions: { key: 'savdo.create' } }, { role_id: 'ret', permission_id: 'qaytarish.create', permissions: { key: 'qaytarish.create' } }],
    staff_audit_log: [], security_events: [],
  };
  const client = makePgSupabase(pg, { pgTables: PG_TABLES, memTables, users: { 't-admin': { id: 'u-admin' }, 't-s1': { id: 'u-s1' }, 't-s2': { id: 'u-s2' } } });
  const ck = loadFunction('sale-checkout-atomic', client);
  const ops = loadFunction('sale-ops', client);
  const cb = loadFunction('cashbox-ops', client);
  const box = async (id) => +(await pg.query(`select balance from cashbox_balances where filial='f729' and box_local_id=$1`, [id])).rows[0].balance;
  const sell = async (lid) => { const r = await ck(post({ filial: 'f729', items: [{ pid: 101, qty: 1, sellUsd: 100, costUsd: 40 }], paidUsd: 100, boxPayments: [{ box_id: 1, amount_native: 1250000 }], inv: 'I-' + lid, idemKey: 'ck-' + lid, saleLocalId: lid, payType: 'cash_uzs' }, 't-admin')); assert.equal(r.statusCode, 200, r.body); };
  await sell('old1'); await pg.query(`update sales set sale_date = current_date - 60, staff_id = null where local_id='old1'`);
  const b0 = await box(1);
  let r = await ops(post({ filial: 'f729', action: 'return', key: 'ret-old-1', saleLocalId: 'old1', pid: 101, qty: 1, batchLocalId: 'rb-x' }, 't-s1'));
  assert.equal(r.statusCode, 403, 'faqat savdo ruxsati — qaytarish yo\'q');
  r = await ops(post({ filial: 'f729', action: 'return', key: 'ret-old-2', saleLocalId: 'old1', pid: 101, qty: 1, batchLocalId: 'rb-y' }, 't-s2'));
  assert.equal(r.statusCode, 403, '30 kundan eski — xodim qaytara olmaydi'); assert.equal(await box(1), b0, 'kassa o\'zgarmadi');
  await sell('new1'); await pg.query(`update sales set staff_id = 8 where local_id='new1'`);
  r = await ops(post({ filial: 'f729', action: 'return', key: 'ret-new-1', saleLocalId: 'new1', pid: 101, qty: 1, batchLocalId: 'rb-z' }, 't-s2'));
  assert.equal(r.statusCode, 200, 'o\'z yangi savdosi — qaytaradi: ' + r.body);
  r = await ops(post({ filial: 'f729', action: 'return', key: 'ret-old-3', saleLocalId: 'old1', pid: 101, qty: 1, batchLocalId: 'rb-w' }, 't-admin'));
  assert.equal(r.statusCode, 200, 'administrator — eski savdoni ham');
  // narx tahriri: xodim tannarxdan (40$) past narx qo'ya olmaydi
  await sell('own1'); await pg.query(`update sales set staff_id = 7 where local_id='own1'`);
  r = await ops(post({ filial: 'f729', action: 'edit', mode: 'price', key: 'ed-own-1', saleLocalId: 'own1', payload: { prices: [1] } }, 't-s1'));
  assert.equal(r.statusCode, 403, 'zarar bilan narx — rad: ' + r.body);
  // kassa: savdo ruxsati bilan «xarajat» nomida pul kiritish yo'q; chiqim (o'z xarajati) — bor
  r = await cb(post({ filial: 'f729', key: 'exp-in-1', kind: 'expense', ops: [{ box: 3, dir: 'in', amount: 999 }] }, 't-s1'));
  assert.equal(r.statusCode, 403, 'xarajat nomida kirim — yo\'q');
  r = await cb(post({ filial: 'f729', key: 'exp-out-1', kind: 'expense', ops: [{ box: 1, dir: 'out', amount: 50000 }] }, 't-s1'));
  assert.equal(r.statusCode, 200, 'o\'z xarajati — bor');
  // almashtirish kursi — serverdagidan ±5%
  r = await cb(post({ filial: 'f729', key: 'exch-1', kind: 'exchange', rate: 9500, ops: [{ box: 1, dir: 'out', amount: 950000 }, { box: 3, dir: 'in', amount: 100 }] }, 't-admin'));
  assert.equal(r.statusCode, 400, '25% farqli kurs — rad');
  r = await cb(post({ filial: 'f729', key: 'exch-2', kind: 'exchange', rate: 12600, ops: [{ box: 1, dir: 'out', amount: 1260000 }, { box: 3, dir: 'in', amount: 100 }] }, 't-admin'));
  assert.equal(r.statusCode, 200, 'yaqin kurs — bor: ' + r.body);
}
module.exports = { name: 'P123 — Kassa va qaytarish huquqlari (pul auditi)', cases: [{ name: 'qaytarish: ruxsat, 30 kun, oʻz savdosi; xarajat nomida kirim yoʻq; almashtirish kursi ±5%', run }] };
