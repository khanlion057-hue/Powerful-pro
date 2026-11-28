// P125 — v25.6.10 (pul auditi): qurilmadagi kurs serverdagidan farq qilsa — so'mdagi savdo server kursiga qayta hisoblanadi (haqiqiy handler + PGlite)
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
  const debt = async (id) => +((await pg.query(`select debt from customer_balances where filial='f729' and customer_local_id=$1`, [id])).rows[0] || { debt: 0 }).debt;
  // qurilma kursi 12 800, server 12 500: 1 000 000 so'mlik savdo, 500 000 naqd → qarz aniq 500 000 so'm
  const cr = 12800, sell = 1000000 / cr, paid = 500000 / cr;
  let r = await ck(post({ filial: 'f729', items: [{ pid: 101, qty: 1, sellUsd: sell, costUsd: 40 }], paidUsd: paid, custId: 11, boxPayments: [{ box_id: 1, amount_native: 500000 }],
    inv: 'R-1', idemKey: 'ck-r1', saleLocalId: 'r1', payType: 'mixed', cur: 'UZS', clientRate: cr }, 't-admin'));
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(Math.round(await debt(11)), 500000, 'qarz so\'mda aniq (avval 488 281)');
  // teskari: qurilma 12 500, server 12 800 — avval «to'langan summa oshdi» bilan rad etilardi
  await pg.query(`update app_data set data = jsonb_set(data, '{settings,usdUzs}', '12800') where id='main'`);
  r = await ck(post({ filial: 'f729', items: [{ pid: 101, qty: 1, sellUsd: 1000000 / 12500, costUsd: 40 }], paidUsd: 1000000 / 12500, boxPayments: [{ box_id: 1, amount_native: 1000000 }],
    inv: 'R-2', idemKey: 'ck-r2', saleLocalId: 'r2', payType: 'cash_uzs', boxId: 1, cur: 'UZS', clientRate: 12500 }, 't-admin'));
  assert.equal(r.statusCode, 200, 'savdo o\'tadi: ' + r.body);
  // dollardagi savdo — o'zgarmaydi
  r = await ck(post({ filial: 'f729', items: [{ pid: 101, qty: 1, sellUsd: 100, costUsd: 40 }], paidUsd: 100, boxPayments: [{ box_id: 3, amount_native: 100 }],
    inv: 'R-3', idemKey: 'ck-r3', saleLocalId: 'r3', payType: 'usd', boxId: 3, cur: 'USD', clientRate: 12500 }, 't-admin'));
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(+(await pg.query(`select total_usd from sales where local_id='r3'`)).rows[0].total_usd, 100);
}
module.exports = { name: 'P125 — Eskirgan kurs bilan savdo (pul auditi)', cases: [{ name: 'soʻmdagi savdo server kursiga qayta hisoblanadi; dollardagi — oʻzgarmaydi', run }] };
